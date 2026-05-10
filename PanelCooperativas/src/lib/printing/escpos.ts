const ESC = 0x1b;
const GS = 0x1d;

export function buildTicket(data: {
  title: string;
  lines: { label: string; value: string }[];
  qrData?: string;
  footer?: string;
}): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  // Inicializar impresora
  parts.push(new Uint8Array([ESC, 0x40])); // ESC @ — Reset

  // Centrar texto
  parts.push(new Uint8Array([ESC, 0x61, 0x01])); // Center align

  // Título en negrita + doble tamaño
  parts.push(new Uint8Array([ESC, 0x45, 0x01])); // Bold on
  parts.push(new Uint8Array([GS, 0x21, 0x11]));  // Double height+width
  parts.push(encoder.encode(data.title + "\n"));
  parts.push(new Uint8Array([GS, 0x21, 0x00]));  // Normal size
  parts.push(new Uint8Array([ESC, 0x45, 0x00])); // Bold off

  // Separador
  parts.push(encoder.encode("--------------------------------\n"));

  // Alinear izquierda
  parts.push(new Uint8Array([ESC, 0x61, 0x00]));

  // Líneas clave-valor
  for (const line of data.lines) {
    parts.push(encoder.encode(`${line.label}: ${line.value}\n`));
  }

  // QR (si la impresora lo soporta)
  if (data.qrData) {
    // Comando QR genérico ESC/POS varía por impresora
    // Omitir si no es compatible — imprimir código textual como fallback
    parts.push(encoder.encode(`\nCódigo: ${data.qrData}\n`));
  }

  // Footer
  if (data.footer) {
    parts.push(new Uint8Array([ESC, 0x61, 0x01])); // Center
    parts.push(encoder.encode(`\n${data.footer}\n`));
  }

  // Avanzar papel + cortar
  parts.push(encoder.encode("\n\n\n"));
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
