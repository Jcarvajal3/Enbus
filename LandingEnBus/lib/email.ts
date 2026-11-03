import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Remitente. `onboarding@resend.dev` (el de pruebas de Resend) solo entrega al correo
 * del dueño de la cuenta de Resend: en producción hay que fijar RESEND_FROM con un
 * dominio verificado, p. ej. "EnBus <no-responder@enbus.com.ve>".
 */
const REMITENTE = (process.env.RESEND_FROM ?? "").trim() || "EnBus <onboarding@resend.dev>";

/** Escapa un texto para insertarlo en HTML (el nombre de la cooperativa lo escribe quien se registra). */
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface SendInvitationEmailParams {
  email: string;
  cooperativaNombre: string;
  inviteLink: string;
}

export async function sendInvitationEmail({
  email,
  cooperativaNombre,
  inviteLink,
}: SendInvitationEmailParams) {
  if (!resend) {
    console.warn("Resend is not configured. Missing RESEND_API_KEY.");
    return { success: false, error: "El envío de correos no está configurado (falta RESEND_API_KEY)." };
  }

  const nombre = escaparHtml(cooperativaNombre);
  const enlace = escaparHtml(inviteLink);

  try {
    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: [email],
      // Sin saltos de línea en el asunto (cabecera del correo).
      subject: `Completa el registro de tu cooperativa · ${cooperativaNombre.replace(/[\r\n]+/g, " ").slice(0, 120)}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-bottom: 16px;">¡Tu solicitud ha sido recibida en EnBus!</h2>
          <p style="color: #475569; font-size: 16px; line-height: 24px;">
            Hemos registrado a la cooperativa <strong>${nombre}</strong> en nuestra plataforma en estado pendiente de aprobación.
          </p>
          <p style="color: #475569; font-size: 16px; line-height: 24px;">
            Mientras nuestro equipo de administración revisa tu solicitud y define tu comisión, puedes completar el registro de tu cuenta de administrador y configurar tu panel (sucursales, rutas, métodos de pago, etc.).
          </p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${enlace}" style="background-color: #f59e0b; color: #000000; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
              Completar el registro
            </a>
          </div>
          <p style="color: #94a3b8; font-size: 14px; margin-top: 32px;">
            Si el botón no funciona, copia y pega este enlace en tu navegador: <br/>
            <a href="${enlace}" style="color: #2563eb;">${enlace}</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} EnBus. Todos los derechos reservados.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Error sending email via Resend:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Exception sending email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Error desconocido al enviar el correo" };
  }
}
