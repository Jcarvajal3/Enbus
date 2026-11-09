// Web Push con WebCrypto, sin dependencias: cifrado del mensaje (RFC 8291, aes128gcm) y
// autenticación VAPID (RFC 8292, JWT ES256). Solo usa APIs estándar (crypto.subtle, fetch), así que
// corre igual en Deno y en Node 20+.
//
// Claves VAPID en el formato de `npx web-push generate-vapid-keys`: pública = punto P-256 sin
// comprimir (65 bytes) y privada = escalar d (32 bytes), ambas en base64url.

export interface SuscripcionPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface ClavesVapid {
  publica: string;
  privada: string;
  /** "mailto:…" o "https://…": contacto para el servicio de push. */
  sujeto: string;
}

export interface OpcionesEnvio {
  /** Segundos que el servicio de push guarda el mensaje si el equipo está apagado. */
  ttl?: number;
  urgencia?: 'very-low' | 'low' | 'normal' | 'high';
  /** Mensajes con el mismo topic se reemplazan en el servicio de push (máx. 32 caracteres base64url). */
  topic?: string;
  timeoutMs?: number;
}

const enc = new TextEncoder();

export function aBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deBase64Url(texto: string): Uint8Array {
  const b64 = texto.trim().replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function unir(...partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    out.set(p, i);
    i += p.length;
  }
  return out;
}

/** HKDF-SHA256 (extract + expand) de `largo` bytes. */
async function hkdf(sal: Uint8Array, ikm: Uint8Array, info: Uint8Array, largo: number): Promise<Uint8Array> {
  const clave = await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: sal as BufferSource, info: info as BufferSource }, clave, largo * 8);
  return new Uint8Array(bits);
}

// ─── VAPID ───────────────────────────────────────────────────────────────────

let firmaCache: { privada: string; clave: CryptoKey } | null = null;

async function claveFirma(v: ClavesVapid): Promise<CryptoKey> {
  if (firmaCache?.privada === v.privada) return firmaCache.clave;
  const pub = deBase64Url(v.publica);
  const d = deBase64Url(v.privada);
  if (pub.length !== 65 || pub[0] !== 4 || d.length !== 32) {
    throw new Error('Claves VAPID con formato inválido (se esperan las de web-push generate-vapid-keys)');
  }
  const clave = await crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    x: aBase64Url(pub.slice(1, 33)), y: aBase64Url(pub.slice(33, 65)), d: aBase64Url(d),
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  firmaCache = { privada: v.privada, clave };
  return clave;
}

/** Cabecera Authorization "vapid t=<jwt>, k=<clave pública>" para el origen del endpoint. */
export async function cabeceraVapid(endpoint: string, v: ClavesVapid, ahoraSeg = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const cabecera = aBase64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  // Máximo permitido: 24 h. 12 h deja margen a relojes desfasados.
  const cuerpo = aBase64Url(enc.encode(JSON.stringify({ aud, exp: ahoraSeg + 12 * 3600, sub: v.sujeto })));
  const firmado = `${cabecera}.${cuerpo}`;
  // WebCrypto devuelve la firma ECDSA como r || s (64 bytes): el formato de JWS.
  const firma = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, await claveFirma(v), enc.encode(firmado) as BufferSource));
  return `vapid t=${firmado}.${aBase64Url(firma)}, k=${v.publica}`;
}

// ─── Cifrado aes128gcm (RFC 8291) ────────────────────────────────────────────

const TAM_REGISTRO = 4096;

/** Cuerpo cifrado listo para enviar con Content-Encoding: aes128gcm. */
export async function cifrar(s: Pick<SuscripcionPush, 'p256dh' | 'auth'>, mensaje: Uint8Array): Promise<Uint8Array> {
  const uaPublica = deBase64Url(s.p256dh);
  const secretoAuth = deBase64Url(s.auth);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4 || secretoAuth.length !== 16) {
    throw new Error('Suscripción con claves inválidas');
  }
  // El registro único lleva el mensaje + 1 byte delimitador + 16 de la etiqueta GCM.
  if (mensaje.length + 1 + 16 > TAM_REGISTRO) throw new Error('Mensaje demasiado grande para Web Push');

  const efimera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey));
  const claveUa = await crypto.subtle.importKey('raw', uaPublica as BufferSource, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: claveUa }, efimera.privateKey, 256));

  // IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info" || 0x00 || ua_public || as_public, 32)
  const ikm = await hkdf(secretoAuth, ecdh, unir(enc.encode('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const claveAes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt']);
  const texto = unir(mensaje, new Uint8Array([2]));   // 0x02 = último (y único) registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce as BufferSource }, claveAes, texto as BufferSource));

  // Cabecera: salt (16) || rs (uint32 BE) || idlen (1) || keyid (clave pública efímera, 65)
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, TAM_REGISTRO);
  return unir(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}

// ─── Envío ───────────────────────────────────────────────────────────────────

/**
 * OK: el servicio aceptó (201/202/200). CADUCADA: 404/410, la suscripción ya no existe (borrarla).
 * REINTENTAR: red, timeout, 429 o 5xx. FALLIDA: otro 4xx (claves, tamaño, VAPID…).
 */
export type ResultadoEnvio = { estado: 'OK' | 'CADUCADA' | 'REINTENTAR' | 'FALLIDA'; status?: number };

export async function enviarPush(
  s: SuscripcionPush,
  datos: string,
  vapid: ClavesVapid,
  { ttl = 86_400, urgencia = 'high', topic, timeoutMs = 10_000 }: OpcionesEnvio = {},
): Promise<ResultadoEnvio> {
  let cuerpo: Uint8Array;
  let autorizacion: string;
  try {
    cuerpo = await cifrar(s, enc.encode(datos));
    autorizacion = await cabeceraVapid(s.endpoint, vapid);
  } catch {
    return { estado: 'FALLIDA' };
  }
  const cabeceras: Record<string, string> = {
    Authorization: autorizacion,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(Math.max(0, Math.floor(ttl))),
    Urgency: urgencia,
  };
  if (topic) cabeceras.Topic = topic;
  try {
    const res = await fetch(s.endpoint, {
      method: 'POST', headers: cabeceras, body: cuerpo as BodyInit, signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel();
    if (res.ok) return { estado: 'OK', status: res.status };
    if (res.status === 404 || res.status === 410) return { estado: 'CADUCADA', status: res.status };
    if (res.status === 429 || res.status >= 500) return { estado: 'REINTENTAR', status: res.status };
    return { estado: 'FALLIDA', status: res.status };
  } catch {
    return { estado: 'REINTENTAR' };
  }
}
