/**
 * Service Worker — EnBus Panel de Cooperativas
 *
 * Estrategias:
 *  - Assets estáticos (.js, .css, fonts, images) → Cache-First
 *  - Navegación (páginas HTML / next-data) → Network-First con fallback offline
 *  - API / Supabase → Network-First (no se guardan datos sensibles en caché)
 */

const CACHE_VERSION = "v1";
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
  if (/\.(?:js|css|woff2?|ttf|otf|png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Cache-First: devuelve desde caché si existe; si no, busca en red y cachea.
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
