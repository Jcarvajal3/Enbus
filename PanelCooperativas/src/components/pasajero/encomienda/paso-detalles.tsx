"use client";

// ─── Paso 3: Detalles de la encomienda ───────────────────────────────────────
// Paralelo al paso "detalles" del panel: Quien envía (solo lectura: es la cuenta del pasajero),
// Quien recibe, Contenido (con el costo estimado en vivo) y ¿Quién paga?.

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { CameraIcon, ImageIcon, ProhibitIcon, TrashIcon, WarningIcon } from "@phosphor-icons/react";
import { Campo, CedulaField, MontoField, TelefonoField } from "@/components/campos";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { Monto } from "@/components/monto";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { leerMonto, type TasaRef } from "@/lib/dinero";
import { formatPesoKg } from "@/lib/peso";
import { cedulaValida, formatCedula, formatTelefono, telefonoValido, CEDULA_ERROR, LETRAS_ENCOMIENDA, TELEFONO_ERROR } from "@/lib/ve";
import type { ModalidadEnvio } from "./tipos";

export const ID_FORMULARIO_DETALLES = "encomienda-detalles";

export interface DatosDetalles {
  nombre: string;
  cedula: string;
  telefono: string;
  descripcion: string;
  /** Peso como se escribió ("2,5"). */
  peso: string;
  valor: string;
  modalidad: ModalidadEnvio | "";
}

export type ErroresDetalles = Partial<Record<keyof DatosDetalles, string>>;

export interface FotoElegida {
  file: File;
  /** URL local (`blob:`) para la vista previa. */
  url: string;
}

/** Costo estimado del envío para el peso escrito (lo que muestra el bloque en vivo). */
export type EstimadoVista =
  | { estado: "vacio" }
  | { estado: "calculando" }
  | { estado: "listo"; usd: number; bs: number | null; tasa: TasaRef | null }
  /** No se pudo calcular (sin tasa, error o límite de consultas): texto neutro, no un error. */
  | { estado: "neutro"; mensaje: string };

export interface Remitente {
  nombre: string;
  cedula: string | null;
  telefono: string | null;
}

export const MODALIDADES: { valor: ModalidadEnvio; titulo: string; detalle: string }[] = [
  { valor: "ORIGEN", titulo: "Pago al entregar", detalle: "Pagas el envío en la taquilla al dejar el paquete." },
  { valor: "DESTINO", titulo: "Paga quien recibe", detalle: "Paga en destino, al retirar." },
];

const ARTICULOS_PROHIBIDOS = [
  { nombre: "Dinero en efectivo y joyas", detalle: "Billetes, monedas, oro y objetos de valor que no se pueden asegurar." },
  { nombre: "Armas y municiones", detalle: "Incluye réplicas, partes de armas y armas blancas." },
  { nombre: "Drogas o medicinas controladas", detalle: "Sustancias ilícitas y medicamentos que requieren récipe especial." },
  {
    nombre: "Líquidos inflamables o explosivos",
    detalle: "Gasolina, gas, pinturas con solvente, fuegos artificiales y aerosoles.",
  },
  { nombre: "Animales vivos", detalle: "Ninguna mascota ni animal, aunque vaya en jaula." },
  { nombre: "Alimentos perecederos", detalle: "Carne, pescado, lácteos y comida que se daña sin refrigeración." },
];

/** Id del control de cada campo (también el que recibe el foco al fallar la validación). */
export const idDetalle = (campo: keyof DatosDetalles) => `envio-${campo}`;

/**
 * Errores del paso por campo y el orden en que aparecen en pantalla (el primero recibe el foco).
 * `pesoMax` es el tope de la tarifa de la cooperativa elegida (null si no se conoce).
 */
export function calcularErroresDetalles(
  d: DatosDetalles,
  pesoMax: number | null
): { e: ErroresDetalles; orden: (keyof DatosDetalles)[] } {
  const e: ErroresDetalles = {};
  const orden: (keyof DatosDetalles)[] = [];
  const marcar = (campo: keyof DatosDetalles, mensaje: string) => {
    e[campo] = mensaje;
    orden.push(campo);
  };
  if (d.nombre.trim().replace(/\s+/g, " ").length < 3) marcar("nombre", "Escribe el nombre y apellido de quien recibe.");
  if (!cedulaValida(d.cedula)) marcar("cedula", CEDULA_ERROR);
  if (!telefonoValido(d.telefono)) marcar("telefono", TELEFONO_ERROR);
  if (d.descripcion.trim().length < 3) marcar("descripcion", "Describe el contenido del paquete (mínimo 3 letras).");
  const peso = d.peso.trim() ? leerMonto(d.peso) : null;
  if (peso === null || peso <= 0) marcar("peso", "Escribe el peso en kilos, por ejemplo 2,5.");
  else if (pesoMax && peso > pesoMax) marcar("peso", `El peso máximo es ${formatPesoKg(pesoMax)} kg.`);
  if (d.valor.trim() && leerMonto(d.valor) === null) marcar("valor", "Escribe el valor en dólares, por ejemplo 40,00.");
  if (!d.modalidad) marcar("modalidad", "Elige quién paga el envío.");
  return { e, orden };
}

/** Lleva el foco al campo (o al primer control de un grupo) cuando ya se pintó el paso. */
export function enfocar(id: string) {
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const objetivo = el.matches("input,button,select,textarea")
      ? el
      : el.querySelector<HTMLElement>("input,button,[role=radio]");
    objetivo?.focus();
  }, 60);
}

/** Sección del formulario: título (h2) y sus campos en dos columnas en escritorio (como en el panel). */
function Seccion({ titulo, id, unaColumna, children }: { titulo: string; id: string; unaColumna?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-[17px] font-semibold">
        {titulo}
      </h2>
      <div className={unaColumna ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>{children}</div>
    </section>
  );
}

interface Props {
  datos: DatosDetalles;
  onCambiar(cambio: Partial<DatosDetalles>): void;
  errores: ErroresDetalles;
  remitente: Remitente;
  foto: FotoElegida | null;
  onFoto(file: File | null): void;
  errorFoto: string | null;
  cooperativa: string;
  pesoMax: number | null;
  dimensionesMax: number | null;
  estimado: EstimadoVista;
  onEnviar(): void;
}

export function PasoDetalles({
  datos,
  onCambiar,
  errores,
  remitente,
  foto,
  onFoto,
  errorFoto,
  cooperativa,
  pesoMax,
  dimensionesMax,
  estimado,
  onEnviar,
}: Props) {
  const [verProhibidos, setVerProhibidos] = useState(false);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);

  const alEnviar = (e: FormEvent) => {
    e.preventDefault();
    onEnviar();
  };
  const alElegirArchivo = (archivo: File | undefined) => {
    if (archivo) onFoto(archivo);
  };

  return (
    <form id={ID_FORMULARIO_DETALLES} noValidate onSubmit={alEnviar} className="flex flex-col gap-8">
      <Seccion titulo="Quien envía" id="envio-seccion-remitente" unaColumna>
        <div className="flex flex-col gap-0.5 rounded-xl bg-surface p-5">
          <p className="text-[17px] font-semibold">{remitente.nombre || "Tu cuenta"}</p>
          <p className="text-[13px] text-muted-foreground">
            {[
              remitente.cedula ? `C.I. ${formatCedula(remitente.cedula)}` : null,
              remitente.telefono ? `Tel. ${formatTelefono(remitente.telefono)}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "Completa tus datos en el paso anterior."}
          </p>
          <p className="text-[13px] text-muted-foreground">Son los datos de tu cuenta.</p>
        </div>
      </Seccion>

      <Seccion titulo="Quien recibe" id="envio-seccion-receptor">
        <Campo
          id={idDetalle("nombre")}
          label="Nombre y apellido"
          value={datos.nombre}
          onChange={(v) => onCambiar({ nombre: v.slice(0, 80) })}
          error={errores.nombre}
          placeholder="Ej. José Rodríguez"
          autoCapitalize="words"
          enterKeyHint="next"
          className="md:col-span-2"
        />
        <CedulaField
          id={idDetalle("cedula")}
          value={datos.cedula}
          letras={LETRAS_ENCOMIENDA}
          onChange={(v) => onCambiar({ cedula: v })}
          error={errores.cedula}
          enterKeyHint="next"
        />
        <TelefonoField
          id={idDetalle("telefono")}
          value={datos.telefono}
          onChange={(v) => onCambiar({ telefono: v })}
          error={errores.telefono}
          enterKeyHint="next"
        />
      </Seccion>

      <Seccion titulo="Contenido" id="envio-seccion-contenido">
        <Campo
          id={idDetalle("descripcion")}
          label="Descripción"
          value={datos.descripcion}
          onChange={(v) => onCambiar({ descripcion: v.slice(0, 300) })}
          error={errores.descripcion}
          placeholder="Ej. ropa y documentos"
          maxLength={300}
          enterKeyHint="next"
          className="md:col-span-2"
        />
        <button
          type="button"
          onClick={() => setVerProhibidos(true)}
          className="inline-flex items-center gap-1.5 justify-self-start text-[13px] font-medium text-info-text underline underline-offset-4 md:col-span-2"
        >
          <ProhibitIcon aria-hidden className="size-4" />
          Qué no se puede enviar
        </button>
        <Campo
          id={idDetalle("peso")}
          label="Peso"
          value={datos.peso}
          onChange={(v) => onCambiar({ peso: v.replace(/[^\d.,]/g, "") })}
          error={errores.peso}
          ayuda={pesoMax ? `Máximo ${formatPesoKg(pesoMax)} kg.` : "Pesa el paquete y escribe el peso."}
          inputMode="decimal"
          sufijo="kg"
          placeholder="Ej. 2,5"
          maxLength={8}
          enterKeyHint="next"
        />
        <MontoField
          id={idDetalle("valor")}
          label="Valor del contenido"
          moneda="USD"
          value={datos.valor}
          onChange={(v) => onCambiar({ valor: v })}
          error={errores.valor}
          opcional
          placeholder="Ej. 50,00"
          enterKeyHint="done"
        />
        <div aria-live="polite" className="flex min-h-20 flex-col justify-center gap-1 rounded-xl bg-surface p-5 text-[15px] md:col-span-2">
          <p className="text-[13px] font-medium text-muted-foreground">Costo estimado del envío</p>
          {estimado.estado === "vacio" ? (
            <p className="text-muted-foreground">Escribe el peso para calcularlo.</p>
          ) : estimado.estado === "calculando" ? (
            <Skeleton className="h-7 w-40" aria-label="Calculando" />
          ) : estimado.estado === "listo" ? (
            <>
              <Monto usd={estimado.usd} bs={estimado.bs} tasa={estimado.tasa} size="lg" />
              <p className="text-[13px] text-muted-foreground">La taquilla confirma el costo final al pesar el paquete.</p>
            </>
          ) : (
            <p className="text-muted-foreground">{estimado.mensaje}</p>
          )}
        </div>
        {pesoMax != null && dimensionesMax != null && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground md:col-span-2">
            <WarningIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            Máximo {formatPesoKg(pesoMax)} kg y {dimensionesMax} × {dimensionesMax} × {dimensionesMax} cm.
          </p>
        )}

        <div className="flex flex-col gap-3 md:col-span-2">
          <div className="flex flex-col gap-0.5">
            <p className="text-[15px] font-medium">
              Foto del paquete <span className="font-normal text-muted-foreground">(opcional)</span>
            </p>
            <p className="text-[13px] text-muted-foreground">
              Ayuda a la taquilla a reconocer tu paquete y a dejar constancia de cómo lo entregaste.
            </p>
          </div>
          {foto ? (
            <div className="flex flex-col items-start gap-3">
              {/* Vista previa local (blob:): next/image no aplica. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.url}
                alt="Foto del paquete que elegiste"
                className="max-h-64 w-full max-w-xs rounded-md border border-border bg-surface object-contain"
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => galeriaRef.current?.click()}>
                  <ImageIcon aria-hidden />
                  Cambiar foto
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onFoto(null)}>
                  <TrashIcon aria-hidden />
                  Quitar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => camaraRef.current?.click()}>
                <CameraIcon aria-hidden />
                Tomar foto
              </Button>
              <Button type="button" variant="outline" onClick={() => galeriaRef.current?.click()}>
                <ImageIcon aria-hidden />
                Elegir de la galería
              </Button>
            </div>
          )}
          {errorFoto && (
            <p role="alert" className="text-[13px] text-destructive-text">
              {errorFoto}
            </p>
          )}
          <input
            ref={camaraRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            aria-label="Tomar foto del paquete"
            onChange={(e) => {
              alElegirArchivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={galeriaRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            tabIndex={-1}
            aria-label="Elegir foto del paquete de la galería"
            onChange={(e) => {
              alElegirArchivo(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      </Seccion>

      <Seccion titulo="¿Quién paga?" id="envio-seccion-paga" unaColumna>
        <div id={idDetalle("modalidad")} className="flex flex-col gap-2">
          <GrupoOpciones etiqueta="¿Quién paga?" className="grid gap-2 md:grid-cols-2">
            {MODALIDADES.map((m) => (
              <OpcionTile
                key={m.valor}
                seleccionado={datos.modalidad === m.valor}
                onSelect={() => onCambiar({ modalidad: m.valor })}
                titulo={m.titulo}
                detalle={m.detalle}
              />
            ))}
          </GrupoOpciones>
          {errores.modalidad && (
            <p role="alert" className="text-[13px] text-destructive-text">
              {errores.modalidad}
            </p>
          )}
        </div>
      </Seccion>

      <Dialog open={verProhibidos} onOpenChange={setVerProhibidos}>
        <DialogContent tamano="confirmar">
          <DialogHeader>
            <DialogTitle>Qué no se puede enviar</DialogTitle>
            <DialogDescription>
              Lista referencial: {cooperativa} puede tener reglas adicionales y la taquilla tiene la última palabra al recibir
              el paquete.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3.5">
            {ARTICULOS_PROHIBIDOS.map((a) => (
              <li key={a.nombre} className="flex items-start gap-3">
                <ProhibitIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive-text" />
                <span className="flex min-w-0 flex-col">
                  <strong className="text-[15px] font-semibold">{a.nombre}</strong>
                  <span className="text-[13px] text-muted-foreground">{a.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </form>
  );
}

