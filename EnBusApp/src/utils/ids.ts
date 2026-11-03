/**
 * Identificadores generados en el cliente.
 *
 * - `compra_id` de una compra de boletos (se crea una vez por intento de compra).
 * - `idempotency_key` de las RPC de pago: se conserva entre reintentos de la
 *   misma operación para que un doble toque o una respuesta perdida no creen
 *   dos pagos, y se renueva después de un éxito.
 *
 * `expo-crypto` no está instalado; se usa la Web Crypto API cuando el motor la
 * expone (`crypto.randomUUID` / `crypto.getRandomValues`) y, si no, un
 * generador de respaldo. El respaldo no es criptográfico, pero estos valores no
 * son secretos: solo deben ser únicos, y el servidor los acota por usuario.
 */

type CryptoLike = {
  randomUUID?: () => string;
  getRandomValues?: <T extends ArrayBufferView>(array: T) => T;
};

function cryptoGlobal(): CryptoLike | null {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  return c && typeof c === 'object' ? c : null;
}

function bytesAleatorios(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  const c = cryptoGlobal();
  if (c?.getRandomValues) {
    try {
      c.getRandomValues(bytes);
      return bytes;
    } catch {
      // Sigue con el respaldo.
    }
  }
  for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
  // Mezcla la hora para separar dos instalaciones con la misma semilla.
  const t = Date.now();
  for (let i = 0; i < 6 && i < n; i++) bytes[i] ^= (t / 2 ** (8 * i)) & 0xff;
  return bytes;
}

/** UUID v4 en minúsculas ("3b241101-e2bb-4255-8caf-4136c566a962"). */
export function uuidv4(): string {
  const c = cryptoGlobal();
  if (c?.randomUUID) {
    try {
      return c.randomUUID().toLowerCase();
    } catch {
      // Sigue con getRandomValues / respaldo.
    }
  }
  const b = bytesAleatorios(16);
  b[6] = (b[6] & 0x0f) | 0x40; // versión 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Clave de idempotencia para las RPC de pago (≥ 8 caracteres; aquí, un UUID). */
export const nuevaClaveIdempotencia = uuidv4;
