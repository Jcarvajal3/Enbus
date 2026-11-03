const ESC = 0x1b;
const GS = 0x1d;

// Las impresoras térmicas baratas usan CP437/850 y no entienden UTF-8: "Código"
// sale como "CÃ³digo". Antes de codificar se translitera a ASCII (á→a, ñ→n,
// ü→u…), se quitan los signos de apertura y las comillas angulares, y lo que
// quede fuera de ASCII imprimible se cambia por "?".

const REEMPLAZOS: [RegExp, string][] = [
  [/[¿¡«»]/g, ""],
  [/[–—]/g, "-"],
  [/[·•]/g, "-"],
  [/[→⟶➔]/g, "-"],
  [/≈/g, "~"],
  [/[“”„]/g, '"'],
  [/[‘’‚]/g, "'"],
  [/…/g, "..."],
  [/º/g, "o"],
  [/ª/g, "a"],
  [/°/g, "o"],
  [/×/g, "x"],
  [/€/g, "EUR"],
  [/\u00a0/g, " "],
];

/** "Guía de envío · Mérida → Cumaná ¿Listo?" → "Guia de envio - Merida - Cumana Listo?" */
export function transliterar(texto: string): string {
  let t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [patron, reemplazo] of REEMPLAZOS) t = t.replace(patron, reemplazo);
  // Solo ASCII imprimible y saltos de línea.
  return t.replace(/[^\x20-\x7e\n]/g, "?");
}

const encoder = new TextEncoder();

/** Texto → bytes ASCII seguros para CP437/850. */
function texto(s: string): Uint8Array {
  return encoder.encode(transliterar(s));
}

export function buildTicket(data: {
  title: string;
  lines: { label: string; value: string }[];
  qrData?: string;
  footer?: string;
}): Uint8Array {
  const parts: Uint8Array[] = [];

  // Inicializar impresora
  parts.push(new Uint8Array([ESC, 0x40])); // ESC @ — Reset

  // Centrar texto
  parts.push(new Uint8Array([ESC, 0x61, 0x01])); // Center align

  // Título en negrita + doble tamaño
  parts.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold on
  parts.push(new Uint8Array([GS, 0x21, 0x11])); // Double height+width
  parts.push(texto(data.title + "\n"));
  parts.push(new Uint8Array([GS, 0x21, 0x00])); // Normal size
  parts.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold off

  // Separador
  parts.push(texto("--------------------------------\n"));

  // Alinear izquierda
  parts.push(new Uint8Array([ESC, 0x61, 0x00]));

  // Líneas clave-valor
  for (const line of data.lines) {
    parts.push(texto(`${line.label}: ${line.value}\n`));
  }

  // QR (si la impresora lo soporta)
  if (data.qrData) {
    // El comando QR ESC/POS varía por impresora: se imprime el código en texto.
    parts.push(texto(`\nCodigo: ${data.qrData}\n`));
  }

  // Footer
  if (data.footer) {
    parts.push(new Uint8Array([ESC, 0x61, 0x01])); // Center
    parts.push(texto(`\n${data.footer}\n`));
  }

  // Avanzar papel + cortar
  parts.push(texto("\n\n\n"));
  parts.push(new Uint8Array([GS, 0x56, 0x00])); // Cut paper

  // Concatenar
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
