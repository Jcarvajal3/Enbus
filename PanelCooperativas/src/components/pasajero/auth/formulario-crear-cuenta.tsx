"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { EnvelopeSimple, WarningCircle } from "@phosphor-icons/react";
import { Campo, CedulaField, TelefonoField } from "@/components/campos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { humanizeError } from "@/lib/errores";
import { RUTAS_PASAJERO, urlIngresar } from "@/lib/pasajero/rutas";
import { RUTAS_LEGALES } from "@/lib/sitio/urls";
import { createClient } from "@/lib/supabase/client";
import {
  CEDULA_ERROR,
  cedulaParaGuardar,
  cedulaValida,
  CLAVE_AYUDA,
  CLAVE_ERROR,
  CLAVE_MINIMO,
  LETRAS_PASAJERO,
  telefonoParaGuardar,
  telefonoValido,
  TELEFONO_ERROR,
} from "@/lib/ve";
import { BotonGoogle } from "./boton-google";
import { TarjetaAuth } from "./tarjeta-auth";
import { correoValido, CORREO_ERROR, urlCallback } from "./utils";
import estilos from "./auth.module.css";

type Campos = "nombre" | "correo" | "cedula" | "telefono" | "clave" | "confirmacion" | "terminos";
type Errores = Partial<Record<Campos, string>>;

const NOMBRE_ERROR = "Escribe tu nombre y apellido.";

/** Espacios repetidos o sobrantes fuera. */
const limpiar = (v: string) => v.trim().replace(/\s+/g, " ");

export function FormularioCrearCuenta({ next }: { next: string | null }) {
  const [nombre, setNombre] = useState("");
  const [correo, setCorreo] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [clave, setClave] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [terminos, setTerminos] = useState(false);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<{ titulo: string; detalle: string } | null>(null);
  const [cargando, setCargando] = useState(false);
  const [enviadoA, setEnviadoA] = useState<string | null>(null);

  const quitar = (campo: Campos) => setErrores((p) => ({ ...p, [campo]: undefined }));

  const validar = (): Errores => {
    const faltas: Errores = {};
    const n = limpiar(nombre);
    if (n.length < 3 || !n.includes(" ")) faltas.nombre = NOMBRE_ERROR;
    if (!correoValido(correo)) faltas.correo = CORREO_ERROR;
    if (!cedulaValida(cedula)) faltas.cedula = CEDULA_ERROR;
    if (!telefonoValido(telefono)) faltas.telefono = TELEFONO_ERROR;
    if (clave.length < CLAVE_MINIMO) faltas.clave = CLAVE_ERROR;
    else if (clave !== confirmacion) faltas.confirmacion = "Las contraseñas no coinciden.";
    if (!terminos) faltas.terminos = "Acepta los términos y la política de privacidad para continuar.";
    return faltas;
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (cargando) return;
    setError(null);
    const faltas = validar();
    setErrores(faltas);
    if (Object.keys(faltas).length > 0) return;

    const email = correo.trim();
    setCargando(true);
    try {
      const { data, error: authError } = await createClient().auth.signUp({
        email,
        password: clave,
        options: {
          emailRedirectTo: urlCallback(next),
          data: {
            nombre_completo: limpiar(nombre),
            telefono: telefonoParaGuardar(telefono),
            cedula_rif: cedulaParaGuardar(cedula),
          },
        },
      });
      if (authError) throw authError;

      // Supabase no delata los correos ya registrados: devuelve un usuario sin identidades.
      if (data.user && data.user.identities?.length === 0) {
        setError({
          titulo: "Ya hay una cuenta con este correo",
          detalle: "Ingresa con tu contraseña o recupérala si no la recuerdas.",
        });
        setCargando(false);
        return;
      }

      if (data.session) {
        // Sin confirmación de correo configurada: ya hay sesión.
        // Navegación completa: descarta la caché del router y relee las cookies de sesión.
        window.location.assign(next ?? RUTAS_PASAJERO.cuenta);
        return;
      }
      setEnviadoA(email);
      setCargando(false);
    } catch (err) {
      setError({ titulo: "No pudimos crear tu cuenta", detalle: humanizeError(err, { accion: "crear tu cuenta", email }) });
      setCargando(false);
    }
  };

  if (enviadoA) {
    return (
      <TarjetaAuth titulo="Revisa tu correo">
        <div className={estilos.estado} role="status">
          <span className="s-icono s-icono--sol">
            <EnvelopeSimple aria-hidden />
          </span>
          <p>
            Te enviamos un enlace a <strong>{enviadoA}</strong>. Ábrelo para confirmar tu cuenta y seguir donde ibas.
          </p>
          <p>Si no lo ves, revisa la carpeta de correo no deseado.</p>
        </div>
        <div className={estilos.acciones}>
          <Link href={urlIngresar(next)} className={buttonVariants({ variant: "outline", size: "lg", className: "w-full" })}>
            Ya confirmé, ingresar
          </Link>
        </div>
      </TarjetaAuth>
    );
  }

  return (
    <TarjetaAuth
      titulo="Crea tu cuenta"
      descripcion="Gratis y en un minuto. Con ella compras boletos, envías encomiendas y sigues todo desde aquí."
      pie={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href={urlIngresar(next)} className="s-enlace">
            Ingresa
          </Link>
        </>
      }
    >
      <div aria-live="polite">
        {error && (
          <Alert variant="destructive">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>{error.titulo}</AlertTitle>
            <AlertDescription>{error.detalle}</AlertDescription>
          </Alert>
        )}
      </div>

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <FieldGroup className="gap-5">
          <Campo
            id="crear-nombre"
            label="Nombre y apellido"
            value={nombre}
            onChange={(v) => {
              setNombre(v);
              quitar("nombre");
            }}
            error={errores.nombre}
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            disabled={cargando}
            required
          />
          <Campo
            id="crear-correo"
            label="Correo"
            type="email"
            inputMode="email"
            placeholder="Ej. tu@correo.com"
            value={correo}
            onChange={(v) => {
              setCorreo(v);
              quitar("correo");
            }}
            error={errores.correo}
            autoComplete="email"
            spellCheck={false}
            enterKeyHint="next"
            disabled={cargando}
            required
          />
          <CedulaField
            id="crear-cedula"
            value={cedula}
            onChange={(v) => {
              setCedula(v);
              quitar("cedula");
            }}
            letras={LETRAS_PASAJERO}
            error={errores.cedula}
            enterKeyHint="next"
            disabled={cargando}
            required
          />
          <TelefonoField
            id="crear-telefono"
            value={telefono}
            onChange={(v) => {
              setTelefono(v);
              quitar("telefono");
            }}
            error={errores.telefono}
            autoComplete="tel"
            enterKeyHint="next"
            disabled={cargando}
            required
          />
          <Field data-invalid={errores.clave ? true : undefined}>
            <FieldLabel htmlFor="crear-clave">Contraseña</FieldLabel>
            <PasswordInput
              id="crear-clave"
              autoComplete="new-password"
              enterKeyHint="next"
              required
              aria-invalid={errores.clave ? true : undefined}
              aria-describedby="crear-clave-ayuda"
              value={clave}
              onChange={(e) => {
                setClave(e.target.value);
                quitar("clave");
              }}
              disabled={cargando}
            />
            {errores.clave ? (
              <FieldError id="crear-clave-ayuda">{errores.clave}</FieldError>
            ) : (
              <FieldDescription id="crear-clave-ayuda">{CLAVE_AYUDA}</FieldDescription>
            )}
          </Field>
          <Field data-invalid={errores.confirmacion ? true : undefined}>
            <FieldLabel htmlFor="crear-confirmacion">Repite la contraseña</FieldLabel>
            <PasswordInput
              id="crear-confirmacion"
              autoComplete="new-password"
              enterKeyHint="done"
              required
              aria-invalid={errores.confirmacion ? true : undefined}
              aria-describedby={errores.confirmacion ? "crear-confirmacion-error" : undefined}
              value={confirmacion}
              onChange={(e) => {
                setConfirmacion(e.target.value);
                quitar("confirmacion");
              }}
              disabled={cargando}
            />
            {errores.confirmacion && <FieldError id="crear-confirmacion-error">{errores.confirmacion}</FieldError>}
          </Field>

          <div className="flex flex-col gap-2">
            <div className={estilos.terminos}>
              <Checkbox
                id="crear-terminos"
                checked={terminos}
                onCheckedChange={(c) => {
                  setTerminos(c === true);
                  quitar("terminos");
                }}
                aria-invalid={errores.terminos ? true : undefined}
                aria-describedby={errores.terminos ? "crear-terminos-error" : undefined}
                disabled={cargando}
              />
              <label htmlFor="crear-terminos">
                Acepto los{" "}
                <Link href={RUTAS_LEGALES.terminos} target="_blank" className="s-enlace">
                  términos y condiciones
                </Link>{" "}
                y la{" "}
                <Link href={RUTAS_LEGALES.privacidad} target="_blank" className="s-enlace">
                  política de privacidad
                </Link>
                .
              </label>
            </div>
            {errores.terminos && <FieldError id="crear-terminos-error">{errores.terminos}</FieldError>}
          </div>
        </FieldGroup>

        <Button type="submit" size="lg" className="w-full" disabled={cargando} aria-busy={cargando || undefined}>
          {cargando && <Spinner size="sm" aria-hidden />}
          {cargando ? "Creando tu cuenta…" : "Crear cuenta"}
        </Button>
      </form>

      <BotonGoogle
        next={next}
        disabled={cargando}
        texto="Registrarme con Google"
        onError={() =>
          setError({ titulo: "No pudiste entrar con Google", detalle: "Intenta de nuevo o crea tu cuenta con tu correo." })
        }
      />
    </TarjetaAuth>
  );
}
