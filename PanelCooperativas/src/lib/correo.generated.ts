// GENERADO por shared/generar.mjs — no editar a mano. Fuente: shared/correo.ts

// Plantilla única de los correos de EnBus (sistema "Amanecer").
//
// La usan el panel (Next.js: correos de cooperativas), las edge functions (avisos al pasajero)
// y `shared/correos-auth.ts`, que escribe las plantillas de Supabase Auth. Sin dependencias.
//
// Un correo no es una página: nada de CSS externo ni clases. Todo va en línea, con tablas
// (Outlook) y los colores de `tokens.json` (modo claro: los clientes de correo oscurecen solos).
//
// Texto: todo se escapa. Dentro de un párrafo, `**así**` sale en negrita.

/** Colores de tokens.json (claro). Si cambian allá, se cambian aquí. */
const C = {
  canvas: "#F3F5F9",
  card: "#FFFFFF",
  tinta: "#202020",
  apagado: "#666666",
  pozo: "#F0EFEB",
  linea: "#E8E6E1",
  sol: "#FFC757",
  noche: "#0F1B33",
  enlace: "#2F5FD0",
  exito: { fondo: "#dcfce7", texto: "#147638" },
  aviso: { fondo: "#fef3c7", texto: "#A34B08" },
  error: { fondo: "#fee2e2", texto: "#B91C1C" },
  info: { fondo: "#dbeafe", texto: "#1D4ED8" },
  coral: { fondo: "#FFE9E1", texto: "#B8431F" },
} as const;

const FUENTE = "Onest, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export type TonoCorreo = "exito" | "aviso" | "error" | "info" | "coral";

export interface DetalleCorreo {
  etiqueta: string;
  valor: string;
}

export interface Correo {
  /** Asunto del correo (también el <title>). */
  asunto: string;
  /** Línea que el buzón muestra junto al asunto (no se ve dentro del correo). */
  preencabezado?: string;
  /** Pastilla de estado sobre el título: "Pago confirmado", "Acción requerida"… */
  estado?: { texto: string; tono: TonoCorreo };
  titulo: string;
  /** Párrafos del cuerpo. `**texto**` en negrita. */
  parrafos: string[];
  /** Cifra o código protagonista (código de verificación, PIN de retiro, tracking). */
  destacado?: { etiqueta: string; valor: string };
  /** Bloque "pozo" con filas etiqueta/valor (ruta, salida, asiento…). */
  detalles?: DetalleCorreo[];
  /** Recuadro de color con un aviso o motivo (p. ej. el motivo de un rechazo). */
  nota?: { titulo?: string; texto: string; tono: TonoCorreo };
  /** La acción del correo: un solo botón amarillo. */
  boton?: { texto: string; url: string };
  /** Si hay botón, se repite el enlace en texto por si el botón no abre. */
  enlaceAlternativo?: boolean;
  /** Párrafos pequeños después del botón (seguridad, ayuda). */
  despedida?: string[];
  /** Por qué le llega este correo a la persona (pie). */
  motivo?: string;
}

export function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapa y convierte `**x**` en negrita. */
function enLinea(texto: string): string {
  return escaparHtml(texto).replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:600;color:${C.tinta};">$1</strong>`);
}

const sinMarcas = (texto: string) => texto.replace(/\*\*(.+?)\*\*/g, "$1");

function marca(): string {
  // El bloque "EB" de shared/marca/eb.svg hecho con una celda (Gmail no muestra SVG).
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td width="40" height="40" align="center" valign="middle" bgcolor="${C.sol}"
          style="width:40px;height:40px;background:${C.sol};border-radius:12px;font-family:${FUENTE};font-size:17px;font-weight:800;line-height:40px;color:${C.tinta};letter-spacing:-0.5px;">EB</td>
      <td style="padding-left:12px;font-family:${FUENTE};font-size:20px;font-weight:700;color:${C.tinta};letter-spacing:-0.3px;">EnBus</td>
    </tr>
  </table>`;
}

function pastilla(texto: string, tono: TonoCorreo): string {
  const t = C[tono];
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;">
    <tr>
      <td bgcolor="${t.fondo}" style="background:${t.fondo};border-radius:999px;padding:5px 12px;font-family:${FUENTE};font-size:13px;font-weight:600;line-height:16px;color:${t.texto};">
        <span style="font-size:10px;line-height:16px;vertical-align:1px;">&#9679;</span>&nbsp; ${escaparHtml(texto)}
      </td>
    </tr>
  </table>`;
}

function parrafo(texto: string): string {
  return `<p style="margin:0 0 16px 0;font-family:${FUENTE};font-size:16px;line-height:24px;color:${C.tinta};">${enLinea(texto)}</p>`;
}

function destacado(etiqueta: string, valor: string): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
    <tr>
      <td align="center" bgcolor="${C.pozo}" style="background:${C.pozo};border-radius:16px;padding:20px 16px;">
        <div style="font-family:${FUENTE};font-size:13px;line-height:18px;color:${C.apagado};">${escaparHtml(etiqueta)}</div>
        <div style="margin-top:6px;font-family:${FUENTE};font-size:32px;font-weight:700;line-height:40px;letter-spacing:4px;color:${C.tinta};">${escaparHtml(valor)}</div>
      </td>
    </tr>
  </table>`;
}

function detalles(filas: DetalleCorreo[]): string {
  const celdas = filas
    .map(
      (f, i) => `
    <tr>
      <td style="padding:${i === 0 ? "0" : "12px"} 0 0 0;font-family:${FUENTE};font-size:13px;line-height:18px;color:${C.apagado};">${escaparHtml(f.etiqueta)}</td>
    </tr>
    <tr>
      <td style="padding:2px 0 ${i === filas.length - 1 ? "0" : "12px"} 0;font-family:${FUENTE};font-size:15px;font-weight:600;line-height:22px;color:${C.tinta};${i === filas.length - 1 ? "" : `border-bottom:1px solid ${C.linea};`}">${escaparHtml(f.valor)}</td>
    </tr>`,
    )
    .join("");
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
    <tr>
      <td bgcolor="${C.pozo}" style="background:${C.pozo};border-radius:16px;padding:20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${celdas}
        </table>
      </td>
    </tr>
  </table>`;
}

function nota(n: NonNullable<Correo["nota"]>): string {
  const t = C[n.tono];
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
    <tr>
      <td bgcolor="${t.fondo}" style="background:${t.fondo};border-radius:16px;padding:16px 20px;">
        ${n.titulo ? `<div style="font-family:${FUENTE};font-size:13px;font-weight:600;line-height:18px;color:${t.texto};margin-bottom:4px;">${escaparHtml(n.titulo)}</div>` : ""}
        <div style="font-family:${FUENTE};font-size:15px;line-height:22px;color:${t.texto};">${enLinea(n.texto)}</div>
      </td>
    </tr>
  </table>`;
}

function boton(texto: string, url: string): string {
  const href = escaparHtml(url);
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;">
    <tr>
      <td align="center" bgcolor="${C.sol}" style="background:${C.sol};border-radius:999px;">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:14px 28px;font-family:${FUENTE};font-size:16px;font-weight:600;line-height:20px;color:${C.tinta};text-decoration:none;border-radius:999px;">${escaparHtml(texto)}</a>
      </td>
    </tr>
  </table>`;
}

function pequeno(texto: string): string {
  return `<p style="margin:0 0 12px 0;font-family:${FUENTE};font-size:14px;line-height:20px;color:${C.apagado};">${enLinea(texto)}</p>`;
}

/** HTML completo del correo, listo para Resend o para una plantilla de Supabase Auth. */
export function correoHtml(c: Correo): string {
  const cuerpo = [
    c.estado ? pastilla(c.estado.texto, c.estado.tono) : "",
    `<h1 style="margin:0 0 16px 0;font-family:${FUENTE};font-size:26px;font-weight:600;line-height:32px;letter-spacing:-0.4px;color:${C.tinta};">${escaparHtml(c.titulo)}</h1>`,
    ...c.parrafos.map(parrafo),
    c.destacado ? destacado(c.destacado.etiqueta, c.destacado.valor) : "",
    c.detalles?.length ? detalles(c.detalles) : "",
    c.nota ? nota(c.nota) : "",
    c.boton ? boton(c.boton.texto, c.boton.url) : "",
    c.boton && c.enlaceAlternativo
      ? `<p style="margin:0 0 12px 0;font-family:${FUENTE};font-size:13px;line-height:18px;color:${C.apagado};">Si el botón no abre, copia este enlace en tu navegador:<br /><a href="${escaparHtml(c.boton.url)}" style="color:${C.enlace};word-break:break-all;">${escaparHtml(c.boton.url)}</a></p>`
      : "",
    ...(c.despedida ?? []).map(pequeno),
  ].join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escaparHtml(c.asunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Onest:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>
  @media (max-width: 520px) {
    .eb-tarjeta { padding: 24px 20px !important; border-radius: 20px !important; }
    .eb-marco { padding: 20px 12px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escaparHtml(c.preencabezado ?? "")}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.canvas}" style="background:${C.canvas};">
  <tr>
    <td align="center" class="eb-marco" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 20px 4px;">${marca()}</td></tr>
        <tr>
          <td class="eb-tarjeta" bgcolor="${C.card}" style="background:${C.card};border-radius:24px;padding:36px 32px;box-shadow:0 1px 2px rgba(15,27,51,0.04),0 8px 24px rgba(15,27,51,0.06);">
            ${cuerpo}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 8px 0 8px;font-family:${FUENTE};font-size:12px;line-height:18px;color:${C.apagado};text-align:center;">
            ${c.motivo ? `${escaparHtml(c.motivo)}<br />` : ""}EnBus · Pasajes y encomiendas en Venezuela<br />
            Este buzón no recibe respuestas.
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Versión en texto plano (mejora la entrega y la leen los relojes y lectores de pantalla). */
export function correoTexto(c: Correo): string {
  const partes: string[] = [c.titulo, "", ...c.parrafos.map(sinMarcas)];
  if (c.destacado) partes.push("", `${c.destacado.etiqueta}: ${c.destacado.valor}`);
  if (c.detalles?.length) partes.push("", ...c.detalles.map((d) => `${d.etiqueta}: ${d.valor}`));
  if (c.nota) partes.push("", `${c.nota.titulo ? `${c.nota.titulo}: ` : ""}${sinMarcas(c.nota.texto)}`);
  if (c.boton) partes.push("", `${c.boton.texto}: ${c.boton.url}`);
  if (c.despedida?.length) partes.push("", ...c.despedida.map(sinMarcas));
  partes.push("", "—", c.motivo ?? "", "EnBus · Este buzón no recibe respuestas.");
  return partes.filter((p, i, a) => !(p === "" && a[i - 1] === "")).join("\n").trim();
}
