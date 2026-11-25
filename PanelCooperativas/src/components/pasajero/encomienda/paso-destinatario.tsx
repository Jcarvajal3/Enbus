"use client";

import { useRef, useState } from "react";
import { CameraIcon, ImageIcon, ProhibitIcon, TrashIcon } from "@phosphor-icons/react";
import { Campo, CedulaField, MontoField, TelefonoField } from "@/components/campos";
import { CampoContenedor, idsCampo } from "@/components/campos/campo-base";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CEDULA_ERROR, LETRAS_ENCOMIENDA, TELEFONO_ERROR } from "@/lib/ve";
import s from "./enviar.module.css";
import { validarFotoPaquete } from "./subir-foto";
import type { ModalidadEnvio } from "./tipos";

export interface DatosDestinatario {
  nombre: string;
  cedula: string;
  telefono: string;
  descripcion: string;
  valor: string;
  modalidad: ModalidadEnvio | "";
}

export type ErroresDestinatario = Partial<Record<keyof DatosDestinatario, string>>;

export interface FotoElegida {
  file: File;
  /** URL local (`blob:`) para la vista previa. */
  url: string;
}

interface Props {
  datos: DatosDestinatario;
  onCambiar(cambio: Partial<DatosDestinatario>): void;
  errores: ErroresDestinatario;
  foto: FotoElegida | null;
  onFoto(file: File | null): void;
  errorFoto: string | null;
  cooperativa: string;
}

export const MODALIDADES: { valor: ModalidadEnvio; titulo: string; detalle: string }[] = [
  {
    valor: "ORIGEN",
    titulo: "Pago yo, al entregar el paquete",
    detalle: "En la taquilla, o en línea desde Mis encomiendas cuando la taquilla confirme el costo.",
  },
  {
    valor: "DESTINO",
    titulo: "Paga quien recibe",
    detalle: "Quien recibe paga al retirar el paquete en la oficina de destino.",
  },
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

export function PasoDestinatario({ datos, onCambiar, errores, foto, onFoto, errorFoto, cooperativa }: Props) {
  const [verProhibidos, setVerProhibidos] = useState(false);
  const camaraRef = useRef<HTMLInputElement>(null);
  const galeriaRef = useRef<HTMLInputElement>(null);
  const descripcionId = "envio-descripcion";
  const { describedBy: descripcionDescribe, invalido: descripcionInvalida } = idsCampo(
    descripcionId,
    errores.descripcion,
    "Qué lleva el paquete, por ejemplo: ropa y documentos."
  );

  const alElegirArchivo = (archivo: File | undefined) => {
    if (archivo) onFoto(archivo);
  };

  return (
    <div className={s.pagina}>
      <section className={s.tarjeta} aria-labelledby="envio-recibe-titulo">
        <h2 id="envio-recibe-titulo" className={s.subtitulo}>
          Quién recibe
        </h2>
        <Campo
          id="envio-nombre"
          label="Nombre y apellido"
          value={datos.nombre}
          onChange={(v) => onCambiar({ nombre: v.slice(0, 80) })}
          autoCapitalize="words"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={80}
          error={errores.nombre}
          required
        />
        <CedulaField
          id="envio-cedula"
          label="Cédula o RIF"
          value={datos.cedula}
          onChange={(v) => onCambiar({ cedula: v })}
          letras={LETRAS_ENCOMIENDA}
          enterKeyHint="next"
          error={errores.cedula}
          required
        />
        <TelefonoField
          id="envio-telefono"
          value={datos.telefono}
          onChange={(v) => onCambiar({ telefono: v })}
          enterKeyHint="next"
          error={errores.telefono}
          required
        />
      </section>

      <section className={s.tarjeta} aria-labelledby="envio-contenido-titulo">
        <h2 id="envio-contenido-titulo" className={s.subtitulo}>
          Contenido
        </h2>
        <CampoContenedor
          id={descripcionId}
          label="Descripción"
          error={errores.descripcion}
          ayuda="Qué lleva el paquete, por ejemplo: ropa y documentos."
        >
          <Textarea
            id={descripcionId}
            value={datos.descripcion}
            onChange={(e) => onCambiar({ descripcion: e.target.value.slice(0, 300) })}
            rows={3}
            maxLength={300}
            aria-describedby={descripcionDescribe}
            aria-invalid={descripcionInvalida}
            aria-required
            autoComplete="off"
          />
        </CampoContenedor>
        <button type="button" className={s.enlaceBoton} onClick={() => setVerProhibidos(true)}>
          <ProhibitIcon aria-hidden className="size-4" />
          Qué no se puede enviar
        </button>
        <MontoField
          id="envio-valor"
          label="Valor del contenido"
          opcional
          moneda="USD"
          value={datos.valor}
          onChange={(v) => onCambiar({ valor: v })}
          enterKeyHint="done"
          error={errores.valor}
          ayuda="En dólares. Ayuda a la cooperativa a cuidar mejor tu paquete."
        />
      </section>

      <section className={s.tarjeta} aria-labelledby="envio-foto-titulo">
        <h2 id="envio-foto-titulo" className={s.subtitulo}>
          Foto del paquete <span className={s.opcional}>(opcional)</span>
        </h2>
        <p className={s.apoyo}>Una foto ayuda a la taquilla a reconocer tu paquete y a dejar constancia de cómo lo entregaste.</p>
        {foto ? (
          <div className={s.foto}>
            {/* Vista previa local (blob:): next/image no aplica. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto.url} alt="Foto del paquete que elegiste" className={s.fotoImg} />
            <div className={s.fotoAcciones}>
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
          <div className={s.fotoAcciones}>
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
          <p className={s.errorTexto} role="alert">
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
      </section>

      <fieldset className={s.tarjeta} aria-describedby={errores.modalidad ? "envio-modalidad-error" : undefined}>
        <legend className={s.subtitulo}>Quién paga el envío</legend>
        <div className={s.opciones}>
          {MODALIDADES.map((m) => (
            // eslint-disable-next-line jsx-a11y/label-has-associated-control -- el texto está en spans anidados
            <label key={m.valor} className={s.opcion} data-elegida={datos.modalidad === m.valor || undefined}>
              <input
                type="radio"
                name="modalidad"
                value={m.valor}
                checked={datos.modalidad === m.valor}
                onChange={() => onCambiar({ modalidad: m.valor })}
                className={s.radio}
              />
              <span className={s.opcionCuerpo}>
                <span className={s.opcionNombre}>{m.titulo}</span>
                <span className={s.opcionMeta}>{m.detalle}</span>
              </span>
            </label>
          ))}
        </div>
        {errores.modalidad && (
          <p id="envio-modalidad-error" className={s.errorTexto} role="alert">
            {errores.modalidad}
          </p>
        )}
      </fieldset>

      <Dialog open={verProhibidos} onOpenChange={setVerProhibidos}>
        <DialogContent tamano="confirmar">
          <DialogHeader>
            <DialogTitle>Qué no se puede enviar</DialogTitle>
            <DialogDescription>
              Lista referencial: {cooperativa} puede tener reglas adicionales y la taquilla tiene la última palabra al recibir
              el paquete.
            </DialogDescription>
          </DialogHeader>
          <ul className={s.prohibidos}>
            {ARTICULOS_PROHIBIDOS.map((a) => (
              <li key={a.nombre}>
                <ProhibitIcon aria-hidden className={s.iconoProhibido} />
                <span>
                  <strong>{a.nombre}</strong>
                  <span className={s.opcionMeta}>{a.detalle}</span>
                </span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Revisa los datos de este paso; devuelve los errores (vacío si todo está bien). */
export function validarDestinatario(
  d: DatosDestinatario,
  validos: { cedula: boolean; telefono: boolean; valor: boolean }
): ErroresDestinatario {
  const e: ErroresDestinatario = {};
  if (d.nombre.trim().length < 3) e.nombre = "Escribe el nombre y apellido de quien recibe.";
  if (!validos.cedula) e.cedula = CEDULA_ERROR;
  if (!validos.telefono) e.telefono = TELEFONO_ERROR;
  if (d.descripcion.trim().length < 3) e.descripcion = "Describe qué lleva el paquete (mínimo 3 letras).";
  if (!validos.valor) e.valor = "Escribe un valor válido en dólares, por ejemplo 50,00.";
  if (!d.modalidad) e.modalidad = "Elige quién paga el envío.";
  return e;
}

/** Mensaje si la foto no se puede usar, o null. */
export function errorDeFoto(file: File): string | null {
  return validarFotoPaquete(file);
}
