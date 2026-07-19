import { Resend } from "resend";

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

interface SendApprovalEmailParams {
  email: string;
  cooperativaNombre: string;
  comisionPorcentaje: number;
}

export async function sendApprovalEmail({
  email,
  cooperativaNombre,
  comisionPorcentaje,
}: SendApprovalEmailParams) {
  if (!resend) {
    console.warn("Resend is not configured. Missing RESEND_API_KEY.");
    console.log(`[Email Mock] Sending approval email to ${email} for cooperativa ${cooperativaNombre}. Commission: ${comisionPorcentaje}%`);
    return { success: false, error: "Resend not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "EnBus <onboarding@resend.dev>",
      to: [email],
      subject: `¡Tu Cooperativa ha sido Aprobada! - EnBus`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #059669; margin-bottom: 16px;">¡Tu solicitud ha sido aprobada!</h2>
          <p style="color: #475569; font-size: 16px; line-height: 24px;">
            La cooperativa <strong>${cooperativaNombre}</strong> ha sido verificada y activada en el ecosistema <strong>EnBus</strong>.
          </p>
          <p style="color: #475569; font-size: 16px; line-height: 24px;">
            La comisión de servicio acordada y asignada para tu cooperativa es de <strong>${comisionPorcentaje}%</strong> por cada transacción realizada en la plataforma.
          </p>
          <p style="color: #475569; font-size: 16px; line-height: 24px;">
            Desde este momento, tus viajes publicados y datos configurados serán visibles públicamente en nuestra aplicación móvil.
          </p>
          <div style="margin: 32px 0; text-align: center;">
            <a href="${process.env.NEXT_PUBLIC_COOPERATIVAS_URL || "http://localhost:3000"}/cooperativas/login" style="background-color: #f59e0b; color: #000000; padding: 12px 24px; font-weight: bold; text-decoration: none; border-radius: 6px; display: inline-block;">
              Ir al Panel de Gestión
            </a>
          </div>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} EnBus. Todos los derechos reservados.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Error sending approval email via Resend:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Exception sending approval email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
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
}: SendRejectionEmailParams) {
  if (!resend) {
    console.warn("Resend is not configured. Missing RESEND_API_KEY.");
    console.log(`[Email Mock] Sending rejection email to ${email} for cooperativa ${cooperativaNombre}. Reason: ${motivo}`);
    return { success: false, error: "Resend not configured" };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: "EnBus <onboarding@resend.dev>",
      to: [email],
      subject: `Solicitud de Registro - EnBus`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #dc2626; margin-bottom: 16px;">Actualización sobre tu solicitud</h2>
          <p style="color: #475569; font-size: 16px; line-height: 24px;">
            Lamentamos informarte que la solicitud de afiliación para la cooperativa <strong>${cooperativaNombre}</strong> ha sido rechazada en este momento.
          </p>
          <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; padding: 16px; margin: 24px 0;">
            <strong style="color: #991b1b; display: block; margin-bottom: 4px; font-size: 14px;">Motivo del rechazo:</strong>
            <p style="color: #7f1d1d; margin: 0; font-size: 14px; line-height: 20px;">
              ${motivo}
            </p>
          </div>
          <p style="color: #475569; font-size: 14px; line-height: 20px;">
            Si deseas más información o consideras que hubo un error, puedes responder directamente a este correo para comunicarte con nuestro equipo de soporte.
          </p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
          <p style="color: #94a3b8; font-size: 12px; text-align: center;">
            &copy; ${new Date().getFullYear()} EnBus. Todos los derechos reservados.
          </p>
        </div>
      `,
    });

    if (error) {
      console.error("Error sending rejection email via Resend:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    console.error("Exception sending rejection email:", error);
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
