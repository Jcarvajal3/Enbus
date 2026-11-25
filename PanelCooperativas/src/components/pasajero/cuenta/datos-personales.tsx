"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { WarningCircle } from "@phosphor-icons/react";
import { Campo, CedulaField, TelefonoField } from "@/components/campos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { avisarExito } from "@/lib/avisos";
import { cedulaValida, CEDULA_ERROR, LETRAS_PASAJERO, telefonoValido, TELEFONO_ERROR } from "@/lib/ve";
import { guardarDatosPersonales } from "@/app/(sitio)/cuenta/configuracion/acciones";
import estilos from "./configuracion.module.css";

type Errores = { nombre?: string; cedula?: string; telefono?: string };

interface Props {
  nombre: string;
  cedula: string;
  telefono: string;
  correo: string | null;
}

/** Nombre, cédula y teléfono; el correo se muestra pero no se edita aquí. */
export function DatosPersonales({ nombre: nombreInicial, cedula: cedulaInicial, telefono: telefonoInicial, correo }: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState(nombreInicial);
  const [cedula, setCedula] = useState(cedulaInicial);
  const [telefono, setTelefono] = useState(telefonoInicial);
  const [errores, setErrores] = useState<Errores>({});
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (pendiente) return;
    const faltas: Errores = {
      ...(nombre.trim().length >= 3 ? {} : { nombre: "Escribe tu nombre completo (mínimo 3 letras)." }),
      ...(cedulaValida(cedula) ? {} : { cedula: CEDULA_ERROR }),
      ...(telefonoValido(telefono) ? {} : { telefono: TELEFONO_ERROR }),
    };
    setErrores(faltas);
    setError(null);
    if (Object.keys(faltas).length > 0) return;

    empezar(async () => {
      try {
        const r = await guardarDatosPersonales({ nombre, cedula, telefono });
        if (!r.success) {
          setError(r.error);
          if ("campos" in r && r.campos) setErrores(r.campos);
          return;
        }
        setNombre(r.data.nombre);
        setCedula(r.data.cedula);
        setTelefono(r.data.telefono);
        avisarExito("Guardamos tus datos.");
        router.refresh();
      } catch {
        setError("No pudimos guardar tus datos. Revisa tu conexión e intenta de nuevo.");
      }
    });
  };

  return (
    <section className={estilos.seccion} aria-labelledby="datos-titulo">
      <div className={estilos.seccionCab}>
        <h2 id="datos-titulo">Datos personales</h2>
        <p>Van en tus boletos, que el conductor revisa al abordar, y nos sirven para identificarte al entregar tus encomiendas.</p>
      </div>
      <form onSubmit={enviar} noValidate className={estilos.formulario}>
        {error && (
          <Alert variant="destructive" aria-live="polite">
            <WarningCircle weight="fill" aria-hidden />
            <AlertTitle>No pudimos guardar tus datos</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Campo
          id="cfg-nombre"
          label="Nombre completo"
          value={nombre}
          onChange={(v) => {
            setNombre(v);
            setErrores((p) => ({ ...p, nombre: undefined }));
          }}
          error={errores.nombre}
          autoComplete="name"
          autoCapitalize="words"
          maxLength={100}
          enterKeyHint="next"
          disabled={pendiente}
          required
        />
        <CedulaField
          id="cfg-cedula"
          value={cedula}
          onChange={(v) => {
            setCedula(v);
            setErrores((p) => ({ ...p, cedula: undefined }));
          }}
          letras={LETRAS_PASAJERO}
          error={errores.cedula}
          autoComplete="off"
          enterKeyHint="next"
          disabled={pendiente}
          required
        />
        <TelefonoField
          id="cfg-telefono"
          value={telefono}
          onChange={(v) => {
            setTelefono(v);
            setErrores((p) => ({ ...p, telefono: undefined }));
          }}
          error={errores.telefono}
          autoComplete="tel"
          enterKeyHint="done"
          disabled={pendiente}
          required
        />
        <Campo
          id="cfg-correo"
          label="Correo"
          type="email"
          value={correo ?? ""}
          onChange={() => undefined}
          ayuda="Es el correo con el que ingresas. No se puede cambiar desde aquí."
          disabled
        />
        <div>
          <Button type="submit" size="lg" disabled={pendiente} aria-busy={pendiente || undefined}>
            {pendiente && <Spinner size="sm" aria-hidden />}
            {pendiente ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </section>
  );
}
