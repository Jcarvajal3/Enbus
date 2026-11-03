"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  PaperPlaneTilt,
  Spinner,
  WarningCircle,
  WhatsappLogo,
} from "@phosphor-icons/react";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";
import { reenviarInvitacion, type CampoReenvio, type ReenvioState } from "./actions";
import { normalizeRif, RIF_AYUDA, RIF_PLACEHOLDER } from "@/lib/rif";
import { cooperativasUrl, RUTAS_LEGALES, soporteWhatsApp } from "@/lib/urls";

const FOCO =
  "outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background";

const BENEFICIOS = [
  {
    titulo: "Vende boletos en línea y en taquilla",
    texto: "Tus salidas aparecen en la app y en la web; la taquilla vende con el mismo panel y el mismo mapa de asientos.",
  },
  {
    titulo: "Recibe y entrega encomiendas",
    texto: "Registra paquetes, cobra al enviar o al retirar y entrega con PIN, con el historial de cada envío.",
  },
  {
    titulo: "Verifica pagos y organiza a tu equipo",
    texto: "Aprueba Pago Móvil y transferencias, invita a tus taquilleros y asígnalos a cada sucursal.",
  },
];

const PASOS = [
  "Crea la cuenta de tu cooperativa en el panel con el RIF, los datos de contacto y el representante legal.",
  "Configura tu panel mientras revisamos tu solicitud (24 a 48 horas hábiles): sucursales, rutas, métodos de pago y empleados.",
  "Cuando la aprobemos, tus rutas y salidas quedan disponibles para los pasajeros.",
];

interface EstadoFormulario extends ReenvioState {
  enviadoA?: string;
}

const ESTADO_INICIAL: EstadoFormulario = { success: false };

function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;
  return (
    <p id={id} className="campo-error flex items-start gap-1.5">
      <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {mensaje}
    </p>
  );
}

/** "¿Te registraste antes y no te llegó la invitación?": reenvío para solicitudes antiguas. */
function ReenviarInvitacion({ panel }: { panel: string | null }) {
  const [rif, setRif] = useState("");
  const [email, setEmail] = useState("");
  const resumenRef = useRef<HTMLDivElement>(null);

  const [state, formAction, pendiente] = useActionState<EstadoFormulario, FormData>(async (_prev, fd) => {
    const rifEnviado = String(fd.get("rif") ?? "");
    const emailEnviado = String(fd.get("email") ?? "").trim();
    const res = await reenviarInvitacion(rifEnviado, emailEnviado);
    return { ...res, enviadoA: res.success ? emailEnviado : undefined };
  }, ESTADO_INICIAL);

  // Tras responder: foco en el primer campo con error o en el mensaje.
  useEffect(() => {
    if (state === ESTADO_INICIAL) return;
    const primero = (["rif", "email"] as CampoReenvio[]).find((c) => state.fieldErrors?.[c]);
    if (primero) document.getElementById(`reenvio-${primero}`)?.focus();
    else resumenRef.current?.focus();
  }, [state]);

  const fe = state.fieldErrors ?? {};
  const errorGeneral = state.error && Object.keys(fe).length === 0 ? state.error : null;

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="reenvio-rif" className="campo-etiqueta">
          RIF de la cooperativa
        </label>
        <input
          id="reenvio-rif"
          name="rif"
          type="text"
          autoCapitalize="characters"
          placeholder={RIF_PLACEHOLDER}
          value={rif}
          onChange={(e) => setRif(e.target.value)}
          onBlur={(e) => {
            const normalizado = normalizeRif(e.target.value);
            if (normalizado) setRif(normalizado);
          }}
          aria-invalid={fe.rif ? true : undefined}
          aria-describedby={fe.rif ? "reenvio-rif-error reenvio-rif-ayuda" : "reenvio-rif-ayuda"}
          disabled={pendiente}
          className="campo-control"
        />
        <ErrorCampo id="reenvio-rif-error" mensaje={fe.rif} />
        <p id="reenvio-rif-ayuda" className="campo-ayuda">
          {RIF_AYUDA}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="reenvio-email" className="campo-etiqueta">
          Correo con el que hiciste la solicitud
        </label>
        <input
          id="reenvio-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="contacto@tucooperativa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={fe.email ? true : undefined}
          aria-describedby={fe.email ? "reenvio-email-error" : undefined}
          disabled={pendiente}
          className="campo-control"
        />
        <ErrorCampo id="reenvio-email-error" mensaje={fe.email} />
      </div>

      <div ref={resumenRef} tabIndex={-1} className="outline-none" aria-live="polite">
        {state.success && state.enviadoA && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-success-light p-3 text-sm text-success-deep">
            <CheckCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
            Listo. Te reenviamos la invitación a {state.enviadoA}. Si no llega en 10 minutos, revisa la carpeta de spam.
          </p>
        )}
        {errorGeneral && (
          <div
            role="alert"
            className={`flex flex-col gap-2 rounded-md p-3 text-sm ${
              state.codigo === "EB_DEMASIADOS_INTENTOS"
                ? "bg-warning-light text-warning-deep"
                : "bg-destructive-light text-destructive-deep"
            }`}
          >
            <p className="flex items-start gap-2">
              <WarningCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {errorGeneral}
            </p>
            {state.cuentaCreada && panel && (
              <a href={`${panel}/cooperativas/login`} className={`w-fit rounded-sm font-medium text-info-text underline underline-offset-4 ${FOCO}`}>
                Iniciar sesión en el panel
              </a>
            )}
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pendiente}
        className={`${buttonVariants({ variant: "outline", size: "lg" })} w-full sm:w-fit ${FOCO}`}
      >
        {pendiente ? <Spinner className="size-4 animate-spin" aria-hidden /> : <PaperPlaneTilt className="size-4" aria-hidden />}
        {pendiente ? "Reenviando…" : "Reenviar invitación"}
      </button>
    </form>
  );
}

export function RegistroCooperativa() {
  const panel = cooperativasUrl();
  const whatsapp = soporteWhatsApp("Hola, quiero afiliar mi cooperativa a EnBus.");

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="EnBus, inicio" className={`rounded-sm ${FOCO}`}>
            <BrandMark conNombre />
          </Link>
          <Link href="/" className={`inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-foreground/80 hover:text-foreground ${FOCO}`}>
            <ArrowLeft className="size-4" aria-hidden />
            Volver al inicio
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-14 px-4 py-12 sm:px-6 lg:py-16">
        {/* Presentación y CTA */}
        <section className="flex flex-col gap-6">
          <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-tight lg:text-5xl">
            Afilia tu cooperativa a EnBus
          </h1>
          <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Vende boletos y recibe encomiendas desde un solo panel. Creas la cuenta en minutos y configuras todo
            mientras revisamos tu solicitud.
          </p>

          {panel ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href={`${panel}/cooperativas/registro`}
                className={`${buttonVariants({ size: "lg" })} w-fit ${FOCO}`}
              >
                Crear la cuenta de mi cooperativa
                <ArrowRight className="size-4" aria-hidden />
              </a>
              <p className="text-sm text-muted-foreground">
                ¿Ya tienes cuenta?{" "}
                <a href={`${panel}/cooperativas/login`} className={`rounded-sm font-medium text-info-text underline underline-offset-4 ${FOCO}`}>
                  Inicia sesión
                </a>
              </p>
            </div>
          ) : (
            <div role="status" className="flex max-w-2xl flex-col gap-2 rounded-md border border-warning/40 bg-warning-light p-4 text-sm text-foreground">
              <p className="flex items-start gap-2 font-medium">
                <WarningCircle className="mt-0.5 size-5 shrink-0 text-warning-deep" aria-hidden />
                El registro no está disponible en este momento. Escríbenos por WhatsApp.
              </p>
              {whatsapp && (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex w-fit items-center gap-2 rounded-sm font-medium text-info-text underline underline-offset-4 ${FOCO}`}
                >
                  <WhatsappLogo className="size-4" aria-hidden />
                  Escribir por WhatsApp
                </a>
              )}
            </div>
          )}
        </section>

        {/* Beneficios */}
        <section aria-labelledby="beneficios-titulo" className="flex flex-col gap-6">
          <h2 id="beneficios-titulo" className="text-2xl font-semibold tracking-tight">
            Qué obtiene tu cooperativa
          </h2>
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {BENEFICIOS.map((b) => (
              <li key={b.titulo} className="rounded-md border border-border bg-surface p-5">
                <CheckCircle className="size-6 text-foreground" weight="fill" aria-hidden />
                <h3 className="mt-3 font-semibold">{b.titulo}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{b.texto}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Pasos */}
        <section aria-labelledby="pasos-titulo" className="flex flex-col gap-6">
          <h2 id="pasos-titulo" className="text-2xl font-semibold tracking-tight">
            Cómo afiliarte
          </h2>
          <ol className="flex flex-col gap-4">
            {PASOS.map((paso, i) => (
              <li key={paso} className="flex gap-4">
                <span
                  aria-hidden
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {i + 1}
                </span>
                <p className="pt-1 text-base leading-relaxed">{paso}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Solicitudes antiguas */}
        <section aria-labelledby="reenvio-titulo" className="max-w-xl rounded-md border border-border bg-card p-5 sm:p-6">
          <h2 id="reenvio-titulo" className="text-lg font-semibold">
            ¿Te registraste antes y no te llegó la invitación?
          </h2>
          <p className="mt-1.5 mb-5 text-sm text-muted-foreground">
            Si enviaste la solicitud desde esta página, escribe el RIF y el correo que usaste y te reenviamos el enlace
            para crear tu cuenta de administrador.
          </p>
          <ReenviarInvitacion panel={panel} />
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>&copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.</p>
          <nav aria-label="Legal" className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href={RUTAS_LEGALES.terminos} className={`rounded-sm hover:text-foreground ${FOCO}`}>
              Términos
            </Link>
            <Link href={RUTAS_LEGALES.privacidad} className={`rounded-sm hover:text-foreground ${FOCO}`}>
              Privacidad
            </Link>
            <Link href={RUTAS_LEGALES.eliminarCuenta} className={`rounded-sm hover:text-foreground ${FOCO}`}>
              Eliminar cuenta
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
