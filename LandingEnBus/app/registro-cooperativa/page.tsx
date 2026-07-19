"use client";

import { useActionState } from "react";
import { registrarCooperativa } from "./actions";
import { 
  Bus, 
  CheckCircle, 
  ArrowLeft, 
  Spinner, 
  WarningCircle, 
  Building, 
  IdentificationCard, 
  Envelope, 
  Phone, 
  User, 
  ChatText 
} from "@phosphor-icons/react";
import Link from "next/link";

export default function RegistroCooperativaPage() {
  const [state, formAction, isPending] = useActionState(registrarCooperativa, { error: null, success: false });

  if (state?.success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface text-foreground p-6 font-sans">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-8 text-center shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-primary" />
          <div className="mb-6 inline-flex size-16 items-center justify-center rounded-full bg-primary-light text-primary">
            <CheckCircle className="size-10" weight="fill" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-4">¡Solicitud Registrada!</h1>
          <p className="text-muted-foreground mb-6 text-sm leading-relaxed">
            Hemos registrado tu cooperativa exitosamente en nuestro sistema en estado pendiente de aprobación.
          </p>
          <div className="bg-surface border border-border rounded-lg p-4 mb-8 text-left text-xs text-muted-foreground leading-normal">
            <strong className="text-foreground block mb-1">Próximos pasos:</strong>
            1. Revisa la bandeja de entrada del correo electrónico registrado.<br />
            2. Haz clic en el enlace de invitación para completar el registro de tu cuenta de administrador.<br />
            3. Ingresa al panel para configurar las sucursales, rutas y métodos de pago.<br />
            4. Un Super Admin revisará tus datos, establecerá la comisión y activará tu cooperativa públicamente.
          </div>
          <Link 
            href="/"
            className="inline-flex w-full justify-center items-center gap-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 px-4 rounded-lg transition-all cursor-pointer shadow-sm"
          >
            <ArrowLeft className="size-4" />
            Volver al Inicio
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground font-sans">
      {/* Panel Izquierdo - Información de Marca */}
      <div className="hidden lg:flex w-5/12 flex-col justify-between bg-surface p-12 border-r border-border relative overflow-hidden">
        {/* Subtle decorative brand gradient glow */}
        <div className="absolute -top-40 -left-40 size-[500px] rounded-full bg-gradient-to-br from-primary/20 via-secondary/10 to-transparent blur-3xl pointer-events-none" />
        
        <div className="flex items-center gap-3 relative z-10">
          <Link href="/" className="flex items-center gap-2 text-primary hover:text-primary/95 transition-colors">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Bus weight="fill" className="size-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-foreground">EnBus</span>
          </Link>
        </div>

        <div className="flex flex-col gap-6 relative z-10">
          <h1 className="text-5xl font-bold leading-tight">
            Únete a la red de <br />
            <span className="text-secondary">transporte de Venezuela</span>
          </h1>
          <p className="text-lg text-muted-foreground leading-relaxed">
            Regístrate hoy mismo y gestiona tus envíos, rutas, boletos y personal de forma digital, moderna y eficiente.
          </p>

          <div className="mt-8 space-y-5">
            <div className="flex gap-4">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary mt-1 shadow-sm">
                <CheckCircle className="size-4" weight="fill" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Acceso Inmediato al Panel</h4>
                <p className="text-sm text-muted-foreground">Completa tu cuenta y configura toda tu estructura operativa de inmediato.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary mt-1 shadow-sm">
                <CheckCircle className="size-4" weight="fill" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Control de Taquilleros y Conductores</h4>
                <p className="text-sm text-muted-foreground">Invita a tus empleados y define sus roles en cada una de tus sucursales.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-light text-primary mt-1 shadow-sm">
                <CheckCircle className="size-4" weight="fill" />
              </div>
              <div>
                <h4 className="font-semibold text-foreground">Visibilidad en la App Móvil</h4>
                <p className="text-sm text-muted-foreground">Una vez aprobada tu solicitud, tus rutas y boletos estarán disponibles para miles de usuarios.</p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground/75 relative z-10">
          &copy; {new Date().getFullYear()} EnBus. Todos los derechos reservados.
        </p>
      </div>

      {/* Panel Derecho - Formulario de Registro */}
      <div className="flex w-full lg:w-7/12 items-center justify-center p-6 sm:p-12 overflow-y-auto">
        <div className="w-full max-w-lg space-y-8 bg-card border border-border rounded-xl p-6 sm:p-8 shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center gap-2 lg:hidden mb-4">
              <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Bus weight="fill" className="size-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-foreground">EnBus</span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-foreground">Registro de Cooperativa</h2>
            <p className="text-muted-foreground text-sm">
              Ingresa los datos para registrar tu solicitud de afiliación al sistema.
            </p>
          </div>

          <form action={formAction} className="space-y-6">
            {state?.error && (
              <div className="flex items-start gap-3 rounded-lg bg-destructive-light border border-destructive/20 p-4 text-destructive text-sm">
                <WarningCircle className="size-5 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold block">Error de registro</span>
                  {state.error}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Nombre de la Cooperativa */}
              <div className="space-y-2">
                <label htmlFor="nombre" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <Building className="size-4 text-muted-foreground/75" />
                  Nombre Comercial
                </label>
                <input
                  id="nombre"
                  name="nombre"
                  type="text"
                  placeholder="Ej. Cooperativa de Transporte Panas"
                  required
                  disabled={isPending}
                  className="w-full bg-surface border border-surface-dark rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                />
              </div>

              {/* RIF */}
              <div className="space-y-2">
                <label htmlFor="rif" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <IdentificationCard className="size-4 text-muted-foreground/75" />
                  RIF (Registro de Información Fiscal)
                </label>
                <input
                  id="rif"
                  name="rif"
                  type="text"
                  placeholder="J-12345678-9"
                  required
                  pattern="^J-\d{8,9}$"
                  title="Formato requerido: J-12345678-9 (Letra J en mayúscula seguida de guión y 8 o 9 dígitos)"
                  disabled={isPending}
                  className="w-full bg-surface border border-surface-dark rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                />
                <p className="text-[10px] text-muted-foreground/75">Ejemplo de formato: J-12345678-9</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Email de contacto */}
                <div className="space-y-2">
                  <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Envelope className="size-4 text-muted-foreground/75" />
                    Correo Electrónico
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="contacto@tuparada.com"
                    required
                    disabled={isPending}
                    className="w-full bg-surface border border-surface-dark rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                  />
                </div>

                {/* Teléfono de contacto */}
                <div className="space-y-2">
                  <label htmlFor="telefono" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <Phone className="size-4 text-muted-foreground/75" />
                    Teléfono de Contacto
                  </label>
                  <input
                    id="telefono"
                    name="telefono"
                    type="tel"
                    placeholder="0412-1234567"
                    required
                    disabled={isPending}
                    className="w-full bg-surface border border-surface-dark rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Nombre del Representante */}
              <div className="space-y-2">
                <label htmlFor="representante" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <User className="size-4 text-muted-foreground/75" />
                  Representante Legal / Contacto Principal
                </label>
                <input
                  id="representante"
                  name="representante"
                  type="text"
                  placeholder="Ej. Carlos Mendoza"
                  required
                  disabled={isPending}
                  className="w-full bg-surface border border-surface-dark rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50"
                />
              </div>

              {/* Mensaje */}
              <div className="space-y-2">
                <label htmlFor="mensaje" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                  <ChatText className="size-4 text-muted-foreground/75" />
                  Mensaje / Rutas de interés (Opcional)
                </label>
                <textarea
                  id="mensaje"
                  name="mensaje"
                  rows={3}
                  placeholder="Cuéntanos un poco sobre tus rutas y vehículos..."
                  disabled={isPending}
                  className="w-full bg-surface border border-surface-dark rounded-sm px-4 py-3 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all disabled:opacity-50 resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-primary hover:bg-primary/95 text-primary-foreground font-semibold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            >
              {isPending ? (
                <>
                  <Spinner className="size-5 animate-spin" />
                  Procesando Registro...
                </>
              ) : (
                "Enviar Solicitud de Registro"
              )}
            </button>
            
            <div className="text-center text-xs text-muted-foreground mt-4">
              ¿Ya tienes cuenta?{" "}
              <a href={`${process.env.NEXT_PUBLIC_COOPERATIVAS_URL || "http://localhost:3001"}/cooperativas/login`} className="text-primary font-semibold hover:underline">
                Inicia sesión aquí
              </a>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
