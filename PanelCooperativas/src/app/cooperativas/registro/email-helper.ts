import { resend } from "@/lib/email";

// Correo con el enlace para completar el registro de una cooperativa (flujo de
// invitación de solicitudes antiguas). Nunca devuelve el texto técnico del
// proveedor: el detalle va al registro del servidor y al usuario un mensaje claro.

interface SendInvitationEmailParams {
  email: string;
  cooperativaNombre: string;
  inviteLink: string;
}

const MSG_NO_ENVIADO = "No pudimos enviar el correo.";

function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendInvitationEmail({
  email,
  cooperativaNombre,
  inviteLink,
}: SendInvitationEmailParams): Promise<{ success: true; data: unknown } | { success: false; error: string }> {
  if (!resend) {
    console.warn("[sendInvitationEmail] Resend no está configurado (falta RESEND_API_KEY).");
    return { success: false, error: MSG_NO_ENVIADO };
  }

  const nombre = escaparHtml(cooperativaNombre);
  const enlace = escaparHtml(inviteLink);

  try {
    const { data, error } = await resend.emails.send({
      from: "EnBus <onboarding@resend.dev>",
      to: [email],
      subject: `Completa el registro de ${cooperativaNombre} en EnBus`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-bottom: 16px;">Recibimos la solicitud de ${nombre}</h2>
          <p style="color: #334155; font-size: 16px; line-height: 24px;">
            Tu cooperativa quedó registrada en EnBus y la estamos revisando (24 a 48 horas hábiles).
          </p>
          <p style="color: #334155; font-size: 16px; line-height: 24px;">
            Mientras tanto, crea tu cuenta de administrador y deja tu panel listo para vender: sucursales, rutas, métodos de pago y taquilleros.
          </p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${enlace}" style="background-color: #FFC757; color: #202020; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
              Crear mi cuenta
            </a>
          </div>
          <p style="color: #475569; font-size: 14px; margin-top: 32px;">
            Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
            <a href="${enlace}" style="color: #1D4ED8;">${enlace}</a>
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
          <p style="color: #475569; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} EnBus. Todos los derechos reservados.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("[sendInvitationEmail] Resend rechazó el envío:", error);
      return { success: false, error: MSG_NO_ENVIADO };
    }

    return { success: true, data };
  } catch (err) {
    console.error("[sendInvitationEmail] Excepción al enviar:", err);
    return { success: false, error: MSG_NO_ENVIADO };
  }
}
