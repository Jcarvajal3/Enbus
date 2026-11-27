import { Resend } from "resend";
import { telefonoWhatsApp } from "@/lib/ve";
import { correoHtml, correoTexto, type Correo } from "@/lib/correo.generated";

// Correos que manda el panel (Next.js) por Resend. El diseño vive en shared/correo.ts
// (el mismo de los avisos al pasajero y de las plantillas de Supabase Auth).

const resendApiKey = process.env.RESEND_API_KEY;

export const resend = resendApiKey ? new Resend(resendApiKey) : null;

/**
 * Remitente de los correos. `onboarding@resend.dev` es el remitente de pruebas de
 * Resend: solo entrega al correo dueño de la cuenta de Resend. En producción hay que
 * definir RESEND_FROM con un dominio verificado (p. ej. "EnBus <noreply@enbusve.com>").
 */
export const REMITENTE_CORREO = process.env.RESEND_FROM?.trim() || "EnBus <onboarding@resend.dev>";

/** Texto para la persona cuando el correo no sale; el detalle técnico va al log. */
export const ERROR_CORREO = "No pudimos enviar el correo.";

export type ResultadoCorreo = { success: true; data?: unknown } | { success: false; error: string };

const MOTIVO_COOPERATIVA = "Recibes este correo porque registraste tu cooperativa en EnBus.";

/** URL pública del panel de cooperativas (sin barra final). Sin variable, el correo no lleva enlace. */
function urlPanel(): string | null {
  const url = (process.env.NEXT_PUBLIC_COOPERATIVAS_URL || process.env.NEXT_PUBLIC_SITIO_URL)?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** WhatsApp de soporte solo con dígitos (para wa.me), o null si no está configurado. */
function whatsappSoporte(): string | null {
  const crudo = process.env.NEXT_PUBLIC_SOPORTE_WHATSAPP ?? "";
  // "0414-1234567" → "584141234567"; un número ya internacional se deja en dígitos.
  return telefonoWhatsApp(crudo) ?? (crudo.replace(/\D/g, "") || null);
}

/** Línea de ayuda: WhatsApp o correo de soporte, si hay alguno configurado. */
function ayuda(): string[] {
  const wa = whatsappSoporte();
  const correo = process.env.NEXT_PUBLIC_SOPORTE_CORREO?.trim();
  if (wa) return [`¿Dudas? Escríbenos por WhatsApp: https://wa.me/${wa}`];
  if (correo) return [`¿Dudas? Escríbenos a ${correo}.`];
  return [];
}

/** Envía un correo con la plantilla de EnBus. Nunca lanza: el detalle va al log. */
export async function enviarCorreo(para: string, correo: Correo, contexto: string): Promise<ResultadoCorreo> {
  if (!resend) {
    console.warn(`[email] ${contexto}: falta RESEND_API_KEY; no se envió el correo.`);
    return { success: false, error: ERROR_CORREO };
  }
  try {
    const { data, error } = await resend.emails.send({
      from: REMITENTE_CORREO,
      to: [para],
      subject: correo.asunto,
      html: correoHtml(correo),
      text: correoTexto(correo),
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

// ─── Cooperativas ────────────────────────────────────────────────────────────

/** Al completar el registro: la solicitud quedó en revisión. */
export async function sendSolicitudRecibidaEmail({
  email,
  cooperativaNombre,
}: {
  email: string;
  cooperativaNombre: string;
}): Promise<ResultadoCorreo> {
  const panel = urlPanel();
  return enviarCorreo(
    email,
    {
      asunto: "Recibimos la solicitud de tu cooperativa",
      preencabezado: "La revisamos en 24 a 48 horas hábiles. Mientras tanto, deja tu panel listo.",
      estado: { texto: "En revisión", tono: "info" },
      titulo: "Recibimos tu solicitud",
      parrafos: [
        `Gracias por registrar **${cooperativaNombre}** en EnBus. Revisamos cada solicitud a mano y te escribimos en 24 a 48 horas hábiles.`,
        "Mientras tanto, entra a tu panel y deja todo listo para vender: sucursales, rutas, buses, métodos de pago y taquilleros.",
      ],
      boton: panel ? { texto: "Ir a mi panel", url: `${panel}/cooperativas/login` } : undefined,
      despedida: ayuda(),
      motivo: MOTIVO_COOPERATIVA,
    },
    "solicitud recibida",
  );
}

/** La cooperativa corrigió sus datos y pidió otra revisión. */
export async function sendRevisionSolicitadaEmail({
  email,
  cooperativaNombre,
}: {
  email: string;
  cooperativaNombre: string;
}): Promise<ResultadoCorreo> {
  return enviarCorreo(
    email,
    {
      asunto: "Recibimos tus cambios",
      preencabezado: "Volvemos a revisar tu solicitud en 24 a 48 horas hábiles.",
      estado: { texto: "En revisión", tono: "info" },
      titulo: "Volvemos a revisar tu solicitud",
      parrafos: [
        `Recibimos los cambios de **${cooperativaNombre}**. Te escribimos apenas terminemos la revisión, normalmente en 24 a 48 horas hábiles.`,
      ],
      despedida: ayuda(),
      motivo: MOTIVO_COOPERATIVA,
    },
    "revisión solicitada",
  );
}

export async function sendApprovalEmail({
  email,
  cooperativaNombre,
}: {
  email: string;
  cooperativaNombre: string;
}): Promise<ResultadoCorreo> {
  const panel = urlPanel();
  return enviarCorreo(
    email,
    {
      asunto: "Tu cooperativa ya está activa en EnBus",
      preencabezado: "Tus salidas y rutas ya se ven en la app y en el sitio.",
      estado: { texto: "Aprobada", tono: "exito" },
      titulo: "Tu cooperativa ya está activa",
      parrafos: [
        `Revisamos la solicitud de **${cooperativaNombre}** y la aprobamos. Desde ahora tus salidas se ven en la app y en el sitio de EnBus, y los pasajeros pueden comprar sus boletos.`,
        "Revisa que tus rutas, horarios y métodos de pago estén completos antes de tu primera venta.",
      ],
      boton: panel ? { texto: "Entrar a mi panel", url: `${panel}/cooperativas/login` } : undefined,
      despedida: ayuda(),
      motivo: MOTIVO_COOPERATIVA,
    },
    "aprobación",
  );
}

export async function sendRejectionEmail({
  email,
  cooperativaNombre,
  motivo,
}: {
  email: string;
  cooperativaNombre: string;
  motivo: string;
}): Promise<ResultadoCorreo> {
  const panel = urlPanel();
  return enviarCorreo(
    email,
    {
      asunto: "Tu solicitud en EnBus necesita cambios",
      preencabezado: "Corrige los datos en tu panel y pide una nueva revisión.",
      estado: { texto: "Acción requerida", tono: "aviso" },
      titulo: "Necesitamos que corrijas tu solicitud",
      parrafos: [`Revisamos la solicitud de **${cooperativaNombre}** y por ahora no pudimos aprobarla.`],
      nota: { titulo: "Motivo", texto: motivo, tono: "error" },
      boton: panel ? { texto: "Corregir mis datos", url: `${panel}/cooperativas/configuracion` } : undefined,
      despedida: [
        "Cuando termines, toca **Pedir nueva revisión** en tu panel y la revisamos de nuevo.",
        ...ayuda(),
      ],
      motivo: MOTIVO_COOPERATIVA,
    },
    "rechazo",
  );
}

// ─── Equipo de EnBus ─────────────────────────────────────────────────────────

/** Correos del equipo que revisa solicitudes (CORREO_AVISOS_ADMIN, separados por coma). */
function correosAdmin(): string[] {
  return (process.env.CORREO_AVISOS_ADMIN ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.includes("@"));
}

/** Aviso interno: llegó una solicitud nueva (o una corrección) para revisar. */
export async function avisarAdminSolicitud({
  cooperativaNombre,
  rif,
  representante,
  esRevision = false,
}: {
  cooperativaNombre: string;
  rif?: string | null;
  representante?: string | null;
  esRevision?: boolean;
}): Promise<void> {
  const destinos = correosAdmin();
  if (destinos.length === 0) return;
  const panel = urlPanel();
  const detalles = [
    { etiqueta: "Cooperativa", valor: cooperativaNombre },
    ...(rif ? [{ etiqueta: "RIF", valor: rif }] : []),
    ...(representante ? [{ etiqueta: "Representante", valor: representante }] : []),
  ];
  await Promise.all(
    destinos.map((para) =>
      enviarCorreo(
        para,
        {
          asunto: esRevision ? `${cooperativaNombre} corrigió su solicitud` : `Nueva solicitud: ${cooperativaNombre}`,
          estado: { texto: "Por revisar", tono: "aviso" },
          titulo: esRevision ? "Una cooperativa pidió otra revisión" : "Llegó una solicitud nueva",
          parrafos: ["Revísala desde el panel de administración."],
          detalles,
          boton: panel ? { texto: "Ver solicitudes", url: `${panel}/admin/solicitudes` } : undefined,
          motivo: "Aviso interno para el equipo de EnBus.",
        },
        "aviso admin",
      ),
    ),
  );
}
