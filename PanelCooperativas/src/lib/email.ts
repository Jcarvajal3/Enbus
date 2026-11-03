import { Resend } from "resend";
import { telefonoWhatsApp } from "@/lib/ve";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Remitente de los correos. `onboarding@resend.dev` es el remitente de pruebas de
 * Resend: solo entrega al correo dueño de la cuenta de Resend. En producción hay que
 * definir RESEND_FROM con un dominio verificado (p. ej. "EnBus <no-responder@enbus.app>").
 */
export const REMITENTE_CORREO = process.env.RESEND_FROM?.trim() || "EnBus <onboarding@resend.dev>";

/** Texto para la persona cuando el correo no sale; el detalle técnico va al log. */
export const ERROR_CORREO = "No pudimos enviar el correo.";

export type ResultadoCorreo = { success: true; data?: unknown } | { success: false; error: string };

/** URL pública del panel de cooperativas (sin barra final). Sin variable, el correo no lleva enlace. */
function urlPanel(): string | null {
  const url = process.env.NEXT_PUBLIC_COOPERATIVAS_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** WhatsApp de soporte solo con dígitos (para wa.me), o null si no está configurado. */
function whatsappSoporte(): string | null {
  const crudo = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "";
  // "0414-1234567" → "584141234567"; un número ya internacional se deja en dígitos.
  return telefonoWhatsApp(crudo) ?? (crudo.replace(/\D/g, "") || null);
}

/** Escapa texto libre (nombre, motivo) antes de meterlo en el HTML del correo. */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** "10" → "10", "7.5" → "7,5" (formato venezolano). */
function porcentaje(n: number): string {
  return n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
}

function plantilla(contenido: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      ${contenido}
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
      <p style="color: #64748b; font-size: 12px; text-align: center;">
        &copy; ${new Date().getFullYear()} EnBus. Todos los derechos reservados.
      </p>
    </div>
  `;
}

function boton(href: string, texto: string): string {
  return `
    <div style="margin: 32px 0; text-align: center;">
      <a href="${href}" style="background-color: #f59e0b; color: #000000; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
        ${texto}
      </a>
    </div>
  `;
}

async function enviar(para: string, asunto: string, html: string, contexto: string): Promise<ResultadoCorreo> {
  if (!resend) {
    console.warn(`[email] ${contexto}: falta RESEND_API_KEY; no se envió el correo a ${para}.`);
    return { success: false, error: ERROR_CORREO };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: REMITENTE_CORREO,
      to: [para],
      subject: asunto,
      html,
    });
    if (error) {
      console.error(`[email] ${contexto}: Resend rechazó el envío:`, error);
      return { success: false, error: ERROR_CORREO };
    }
    return { success: true, data };
  } catch (err) {
    console.error(`[email] ${contexto}: excepción al enviar:`, err);
    return { success: false, error: ERROR_CORREO };
  }
}

interface SendApprovalEmailParams {
  email: string;
  cooperativaNombre: string;
  comisionPorcentaje: number;
}

export async function sendApprovalEmail({
  email,
  cooperativaNombre,
  comisionPorcentaje,
}: SendApprovalEmailParams): Promise<ResultadoCorreo> {
  const nombre = escaparHtml(cooperativaNombre);
  const panel = urlPanel();
  const html = plantilla(`
    <h2 style="color: #047857; margin-bottom: 16px;">Tu cooperativa ya está activa en EnBus</h2>
    <p style="color: #334155; font-size: 16px; line-height: 24px;">
      Revisamos la solicitud de <strong>${nombre}</strong> y la aprobamos. Desde ahora tus salidas y rutas se ven en la app de EnBus.
    </p>
    <p style="color: #334155; font-size: 16px; line-height: 24px;">
      La comisión de EnBus es de <strong>${porcentaje(comisionPorcentaje)} %</strong> por cada boleto o encomienda vendidos en la plataforma
      (por cada Bs 100 vendidos, EnBus recibe Bs ${porcentaje(comisionPorcentaje)}).
    </p>
    ${panel ? boton(`${panel}/cooperativas/login`, "Entrar a mi panel") : ""}
  `);
  return enviar(email, "Tu cooperativa ya está activa en EnBus", html, "aprobación");
}

interface SendRejectionEmailParams {
  email: string;
  cooperativaNombre: string;
  motivo: string;
}

export async function sendRejectionEmail({
  email,
  cooperativaNombre,
  motivo,
}: SendRejectionEmailParams): Promise<ResultadoCorreo> {
  const nombre = escaparHtml(cooperativaNombre);
  const panel = urlPanel();
  const login = panel ? `${panel}/cooperativas/login` : null;
  const soporte = whatsappSoporte();
  const html = plantilla(`
    <h2 style="color: #b91c1c; margin-bottom: 16px;">Necesitamos que corrijas tu solicitud</h2>
    <p style="color: #334155; font-size: 16px; line-height: 24px;">
      Revisamos la solicitud de <strong>${nombre}</strong> y por ahora no pudimos aprobarla.
    </p>
    <div style="background-color: #fef2f2; border-left: 4px solid #b91c1c; border-radius: 4px; padding: 16px; margin: 24px 0;">
      <strong style="color: #7f1d1d; display: block; margin-bottom: 4px; font-size: 14px;">Motivo</strong>
      <p style="color: #7f1d1d; margin: 0; font-size: 14px; line-height: 20px;">${escaparHtml(motivo)}</p>
    </div>
    <p style="color: #334155; font-size: 16px; line-height: 24px;">
      ${
        login
          ? `Corrige tus datos en tu panel (<a href="${login}" style="color: #0f172a;">${login}</a>) y pide una nueva revisión.`
          : "Corrige tus datos en tu panel de EnBus y pide una nueva revisión."
      }
    </p>
    ${login ? boton(login, "Corregir mis datos") : ""}
    ${
      // El remitente (onboarding@resend.dev) no recibe respuestas: la ayuda va por WhatsApp si está configurado.
      soporte
        ? `<p style="color: #475569; font-size: 14px; line-height: 20px;">
      Si tienes dudas, escríbenos por <a href="https://wa.me/${soporte}" style="color: #0f172a;">WhatsApp</a>.
    </p>`
        : ""
    }
  `);
  return enviar(email, "Tu solicitud en EnBus necesita cambios", html, "rechazo");
}
