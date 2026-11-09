/**
 * Service Worker — EnBus Panel de Cooperativas
 *
 * Estrategias:
 *  - Assets estáticos (.js, .css, fonts, images) → Cache-First
 *  - Navegación (páginas HTML / next-data) → Network-First con fallback offline
 *  - API / Supabase → Network-First (no se guardan datos sensibles en caché)
 *
 * Notificaciones push (Web Push, edge function push-panel):
 *  - push → muestra "Pago por verificar"; varios seguidos se agrupan en una sola (tag).
 *  - notificationclick → enfoca una ventana abierta del panel y la lleva al pago, o abre una nueva.
 *  - pushsubscriptionchange → vuelve a suscribirse; el panel guarda la nueva al abrirse.
 */

// Subir la versión cuando cambien iconos u otros estáticos sin hash (Cache-First):
// al activarse, el SW borra las cachés anteriores. v3 = marca EB (fase 5). v4 = notificaciones push.
const CACHE_VERSION = "v4";
const CACHE_NAME = `enbus-panel-${CACHE_VERSION}`;

/** Shell mínimo que garantiza que la app carga aunque no haya red */
const PRECACHE_URLS = [
  "/cooperativas/login",
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Solo interceptar same-origin y Supabase (excluir cualquier otro tercero)
  const isOwnOrigin = url.origin === self.location.origin;
  const isSupabase = url.hostname.endsWith(".supabase.co");

  if (!isOwnOrigin && !isSupabase) return;

  // Ignorar métodos que no son GET (POST, PUT, DELETE, etc.)
  if (request.method !== "GET") return;

  // Ignorar extensiones de Chrome
  if (url.protocol === "chrome-extension:") return;

  // ── Estrategia 1: Cache-First para assets estáticos ────────────────────────
  // Next.js hashed assets (_next/static) are immutable — cache aggressively
  if (
    url.pathname.startsWith("/_next/static/") ||
    /\.(?:woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // ── Estrategia 1b: Stale-While-Revalidate for other JS/CSS ────────────────
  if (/\.(?:js|css)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // ── Estrategia 2: Network-First para API y datos de Supabase ──────────────
  if (
    isSupabase ||
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/data/")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  // ── Estrategia 3: Network-First para navegación (páginas) ──────────────────
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }
});

// ─── Push ─────────────────────────────────────────────────────────────────────
const URL_PAGOS = "/cooperativas/pagos";
const ICONO = "/icon-192.png";
// Android pinta el badge como silueta monocroma (canal alfa); el ícono de la app sirve mientras
// no haya uno propio para la barra de estado.
const BADGE = "/icon-192.png";
/** Un aviso agrupado más viejo que esto ya no suma sus pagos al siguiente. */
const VIGENCIA_GRUPO_MS = 2 * 60 * 60 * 1000;

/** Solo rutas del propio panel: nunca se abre una URL de otro origen desde un aviso. */
function urlDelPanel(valor) {
  try {
    const url = new URL(typeof valor === "string" && valor ? valor : URL_PAGOS, self.location.origin);
    if (url.origin !== self.location.origin || !url.pathname.startsWith("/cooperativas/")) {
      return new URL(URL_PAGOS, self.location.origin).href;
    }
    return url.href;
  } catch {
    return new URL(URL_PAGOS, self.location.origin).href;
  }
}

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { cuerpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(mostrarAviso(datos));
});

async function mostrarAviso(datos) {
  const tag = typeof datos.tag === "string" && datos.tag ? datos.tag : "enbus-panel";
  let titulo = typeof datos.titulo === "string" && datos.titulo ? datos.titulo : "EnBus";
  const cuerpo = typeof datos.cuerpo === "string" ? datos.cuerpo : "";
  let url = urlDelPanel(datos.url);

  // Pagos del aviso anterior con el mismo tag que sigue a la vista: se suman (sin repetir el mismo
  // pago si el servidor lo reenvió) y el clic lleva a la lista en vez de a uno solo. Al abrir
  // "Pagos por verificar" el panel cierra estos avisos (CerrarAvisosPagos), así que no se cuentan
  // pagos ya resueltos; por si el panel no se abrió, un aviso de más de 2 h no se suma.
  const pagos = [];
  try {
    const previas = await self.registration.getNotifications({ tag });
    const limite = Date.now() - VIGENCIA_GRUPO_MS;
    for (const n of previas) {
      if (!n.data || !(n.data.at > limite)) continue;
      for (const id of n.data.pagos || []) if (!pagos.includes(id)) pagos.push(id);
    }
  } catch {
    // getNotifications no existe en algunos navegadores: se muestra solo el aviso nuevo.
  }
  if (datos.pago_id && !pagos.includes(datos.pago_id)) pagos.push(datos.pago_id);
  if (pagos.length > 1) {
    titulo = `${pagos.length} pagos por verificar`;
    url = new URL(URL_PAGOS, self.location.origin).href;
  }

  await self.registration.showNotification(titulo, {
    body: pagos.length > 1 ? `Último: ${cuerpo}` : cuerpo,
    icon: ICONO,
    badge: BADGE,
    tag,
    renotify: true,
    lang: "es-VE",
    timestamp: Date.now(),
    data: { url, pagos, at: Date.now() },
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = urlDelPanel(event.notification.data && event.notification.data.url);
  event.waitUntil(abrirPanel(destino));
});

async function abrirPanel(destino) {
  const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const delPanel = ventanas.filter((c) => new URL(c.url).pathname.startsWith("/cooperativas/"));
  // Preferir la ventana que ya está en "Pagos por verificar", luego la que tenga el foco.
  const ventana =
    delPanel.find((c) => new URL(c.url).pathname === URL_PAGOS) ||
    delPanel.find((c) => c.focused) ||
    delPanel[0];
  if (ventana) {
    try {
      const enfocada = await ventana.focus();
      if (enfocada.url !== destino && "navigate" in enfocada) await enfocada.navigate(destino);
      return;
    } catch {
      // Safari no deja navegar algunas ventanas: se abre una nueva.
    }
  }
  await self.clients.openWindow(destino);
}

// El navegador renovó o invalidó la suscripción: se pide otra con la misma clave pública. El panel
// la guarda en el servidor la próxima vez que se abre (service-worker-registrar).
self.addEventListener("pushsubscriptionchange", (event) => {
  const opciones = event.oldSubscription && event.oldSubscription.options;
  if (!opciones || !opciones.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: opciones.applicationServerKey })
      .catch(() => undefined)
  );
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cache-First: devuelve desde caché si existe; si no, busca en red y cachea.
 * Best for immutable assets (hashed filenames).
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

/**
 * Stale-While-Revalidate: return cached immediately, update in background.
 * Good for JS/CSS that might change between deploys.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Always fetch fresh in background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately if available, otherwise wait for network
  return cached || (await fetchPromise) || new Response("Offline", { status: 503 });
}

/**
 * Network-First: intenta la red; si falla, devuelve desde caché.
 * Los datos de Supabase no se cachean para evitar datos sensibles en disco.
 */
async function networkFirst(request) {
  const url = new URL(request.url);
  const isSupabase = url.hostname.endsWith(".supabase.co");

  try {
    const response = await fetch(request);
    // Solo cachear respuestas exitosas de origen propio (no Supabase)
    if (response.ok && !isSupabase) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response("Sin conexión", { status: 503 });
  }
}
