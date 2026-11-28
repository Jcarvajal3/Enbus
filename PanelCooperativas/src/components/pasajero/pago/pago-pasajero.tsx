"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type DragEvent } from "react";
import {
  BankIcon,
  CameraIcon,
  CheckIcon,
  CopyIcon,
  CurrencyDollarIcon,
  DeviceMobileIcon,
  ImageIcon,
  InfoIcon,
  MoneyIcon,
  TrashIcon,
  WarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import { BancoField, Campo, FechaField, MontoField } from "@/components/campos";
import { AvisoError } from "@/components/aviso-error";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { mostrarBanco } from "@/lib/bancos";
import { fechaTasaCorta, formatBs, formatNumeroVE, formatUsd, leerMonto, usdABs } from "@/lib/dinero";
import { hoyVE, sumarDiasVE } from "@/lib/fechas";
import {
  DIAS_ATRAS_PAGO,
  validarDatosPago,
  type CampoPago,
  type DatosPagoPasajero,
  type MetodoPagoPasajero,
  type TipoMetodoPagoPasajero,
} from "@/lib/pasajero/pagos-comun";
import { formatCedula, formatTelefono } from "@/lib/ve";
import { cn } from "@/lib/utils";
import { subirComprobante, validarArchivoComprobante } from "@/components/pagos/subir-comprobante";

export interface PagoPasajeroProps {
  metodos: MetodoPagoPasajero[];
  totalUsd: number;
  tasa: { tasa: number; fecha: string } | null;
  /** Total en Bs calculado por el servidor; si falta se calcula con `tasa` solo para mostrar. */
  totalBs?: number;
  /** Ofrece "Apartar y pagar en taquilla" (solo boletos). */
  permitirTaquilla?: boolean;
  /** El padre está llamando a la RPC. */
  enviando: boolean;
  /** Error del servidor ya traducido (se muestra arriba del botón). */
  error?: string | null;
  onEnviar(datos: DatosPagoPasajero): void;
  onTaquilla?(): void;
  /**
   * Con él, el botón de acción NO se dibuja aquí: la página lo pone en su `BarraFlujo`
   * (`type: "submit"`, `form: idForm`, o `onClick` en el modo taquilla) con lo que informa este callback,
   * igual que `CobroTaquillaForm` del panel. Sin él (cuenta, encomiendas) el formulario trae su propio botón.
   */
  onBarra?(estado: EstadoBarraPago): void;
  /** `id` del <form> de pago (por defecto `ID_FORM_PAGO_PASAJERO`). */
  idForm?: string;
}

/** Qué debe hacer el botón principal de la barra de la página. */
export interface EstadoBarraPago {
  /** `reportar`: envía el formulario · `taquilla`: apartar para pagar en taquilla · `ninguno`: aún no hay método. */
  modo: "reportar" | "taquilla" | "ninguno";
  /** Etiqueta del botón: "Reportar pago de Bs 2.500,00". */
  etiqueta: string;
  /** Se está subiendo el capture (la página lo muestra como cargando). */
  subiendo: boolean;
  deshabilitado: boolean;
}

export const ID_FORM_PAGO_PASAJERO = "pago-pasajero";

const TAQUILLA = "taquilla";

const INFO_METODO: Record<TipoMetodoPagoPasajero, { titulo: string; detalle: string; icono: Icon }> = {
  PAGO_MOVIL: { titulo: "Pago Móvil", detalle: "En bolívares, al instante", icono: DeviceMobileIcon },
  TRANSFERENCIA_BANCARIA: { titulo: "Transferencia", detalle: "Desde tu cuenta en Venezuela", icono: BankIcon },
  ZELLE: { titulo: "Zelle", detalle: "En dólares", icono: CurrencyDollarIcon },
};

const sinSeparadores = (v: string) => v.replace(/[\s.\-_/]/g, "");
/** "1250,00": lo que acepta pegado una app bancaria venezolana. */
const montoParaPegar = (n: number) => n.toFixed(2).replace(".", ",");

// ─── Copiar ──────────────────────────────────────────────────────────────────

function useCopiar() {
  const [copiado, setCopiado] = useState<string | null>(null);
  const [falloCopiar, setFalloCopiar] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (temporizador.current && clearTimeout(temporizador.current)), []);
  const copiar = useCallback(async (clave: string, texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setFalloCopiar(false);
      setCopiado(clave);
    } catch {
      setFalloCopiar(true);
      setCopiado(null);
    }
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => {
      setCopiado(null);
      setFalloCopiar(false);
    }, 2000);
  }, []);
  return { copiado, falloCopiar, copiar };
}

function FilaDato({
  etiqueta,
  valor,
  copiar,
  copiado,
  onCopiar,
}: {
  etiqueta: string;
  valor: string;
  /** Texto que se copia (por defecto, el mismo valor). */
  copiar?: string;
  copiado: boolean;
  onCopiar(texto: string): void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <dt className="text-[13px] text-muted-foreground">{etiqueta}</dt>
        <dd className="text-[15px] font-semibold break-words text-foreground tabular-nums">{valor}</dd>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => onCopiar(copiar ?? valor)}
        aria-label={copiado ? `${etiqueta} copiado` : `Copiar ${etiqueta.toLowerCase()}`}
      >
        {copiado ? <CheckIcon aria-hidden weight="bold" /> : <CopyIcon aria-hidden />}
        {copiado ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

function DatosParaPagar({
  metodo,
  montoEtiqueta,
  montoTexto,
  montoCopia,
}: {
  metodo: MetodoPagoPasajero;
  montoEtiqueta: string;
  montoTexto: string | null;
  montoCopia: string | null;
}) {
  const { copiado, falloCopiar, copiar } = useCopiar();
  const zelle = metodo.tipo === "ZELLE";
  const movil = metodo.tipo === "PAGO_MOVIL";
  const banco = metodo.banco ? mostrarBanco(metodo.banco) : null;
  const telefono = movil && metodo.numeroCuenta ? formatTelefono(metodo.numeroCuenta) : null;
  const cedula = metodo.cedulaRif ? formatCedula(metodo.cedulaRif) : null;
  const cedulaVisible = cedula && cedula !== "—" ? cedula : metodo.cedulaRif;

  const todo = movil
    ? [
        "Pago Móvil",
        banco ? `Banco: ${banco}` : null,
        metodo.numeroCuenta ? `Teléfono: ${sinSeparadores(metodo.numeroCuenta)}` : null,
        metodo.cedulaRif ? `C.I./RIF: ${sinSeparadores(metodo.cedulaRif)}` : null,
        montoCopia ? `Monto: ${montoCopia}` : null,
      ]
        .filter(Boolean)
        .join("\n")
    : null;

  return (
    <section aria-label="Datos para pagar" className="rounded-xl bg-surface p-4">
      <h3 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Datos para pagar</h3>
      <dl className="divide-y divide-border">
        {banco && <FilaDato etiqueta="Banco" valor={banco} copiado={copiado === "banco"} onCopiar={(t) => copiar("banco", t)} />}
        {metodo.titular && (
          <FilaDato etiqueta="Titular" valor={metodo.titular} copiado={copiado === "titular"} onCopiar={(t) => copiar("titular", t)} />
        )}
        {movil && metodo.numeroCuenta && (
          <FilaDato
            etiqueta="Teléfono"
            valor={telefono && telefono !== "—" ? telefono : metodo.numeroCuenta}
            copiar={sinSeparadores(metodo.numeroCuenta)}
            copiado={copiado === "telefono"}
            onCopiar={(t) => copiar("telefono", t)}
          />
        )}
        {metodo.tipo === "TRANSFERENCIA_BANCARIA" && metodo.numeroCuenta && (
          <FilaDato
            etiqueta="Número de cuenta"
            valor={metodo.numeroCuenta}
            copiar={sinSeparadores(metodo.numeroCuenta)}
            copiado={copiado === "cuenta"}
            onCopiar={(t) => copiar("cuenta", t)}
          />
        )}
        {zelle && metodo.emailZelle && (
          <FilaDato etiqueta="Correo Zelle" valor={metodo.emailZelle} copiado={copiado === "zelle"} onCopiar={(t) => copiar("zelle", t)} />
        )}
        {cedulaVisible && (
          <FilaDato
            etiqueta="C.I. / RIF"
            valor={cedulaVisible}
            copiar={sinSeparadores(metodo.cedulaRif ?? "")}
            copiado={copiado === "cedula"}
            onCopiar={(t) => copiar("cedula", t)}
          />
        )}
        {montoTexto && (
          <FilaDato
            etiqueta={montoEtiqueta}
            valor={montoTexto}
            copiar={montoCopia ?? undefined}
            copiado={copiado === "monto"}
            onCopiar={(t) => copiar("monto", t)}
          />
        )}
      </dl>
      {todo && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => copiar("todo", todo)}
          aria-label={copiado === "todo" ? "Datos del Pago Móvil copiados" : "Copiar todos los datos del Pago Móvil"}
        >
          {copiado === "todo" ? <CheckIcon aria-hidden weight="bold" /> : <CopyIcon aria-hidden />}
          {copiado === "todo" ? "Copiado" : "Copiar todo"}
        </Button>
      )}
      {metodo.instrucciones && <p className="mt-3 text-[13px] text-muted-foreground">{metodo.instrucciones}</p>}
      <p role="status" className="sr-only">
        {copiado ? "Copiado al portapapeles" : falloCopiar ? "No se pudo copiar" : ""}
      </p>
      {falloCopiar && (
        <p className="mt-2 text-[13px] text-destructive-text">No pudimos copiar. Selecciona el dato y cópialo a mano.</p>
      )}
    </section>
  );
}

// ─── Comprobante ─────────────────────────────────────────────────────────────

function SelectorComprobante({
  archivo,
  onArchivo,
  error,
  disabled,
  idCampo,
}: {
  archivo: File | null;
  onArchivo(file: File | null, errorArchivo: string | null): void;
  error?: string | null;
  disabled: boolean;
  idCampo: string;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastrando, setArrastrando] = useState(false);
  const vista = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo]);
  useEffect(() => {
    if (!vista) return;
    return () => URL.revokeObjectURL(vista);
  }, [vista]);

  const elegir = (f: File | undefined | null) => {
    if (!f) return;
    onArchivo(validarArchivoComprobante(f) ? null : f, validarArchivoComprobante(f));
  };
  const soltar = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setArrastrando(false);
    if (!disabled) elegir(e.dataTransfer.files?.[0]);
  };
  const errorId = `${idCampo}-error`;

  return (
    <div className="flex flex-col gap-2">
      <span id={`${idCampo}-etiqueta`} className="text-[15px] font-semibold text-foreground">
        Capture del Pago Móvil
      </span>
      <input
        ref={entrada}
        id={idCampo}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        aria-labelledby={`${idCampo}-etiqueta`}
        aria-describedby={error ? errorId : undefined}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          elegir(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {archivo && vista ? (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          {/* Vista previa local (blob:): next/image no aplica. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={vista} alt="Vista previa del capture" className="size-20 shrink-0 rounded-md object-cover" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">{archivo.name}</p>
            <p className="text-[13px] text-muted-foreground tabular-nums">{formatNumeroVE(archivo.size / 1024 / 1024)} MB</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            onClick={() => onArchivo(null, null)}
            aria-label="Quitar el capture"
          >
            <TrashIcon aria-hidden />
          </Button>
        </div>
      ) : (
        // Arrastrar y soltar es un extra: el teclado y el táctil usan los botones de abajo.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setArrastrando(true);
          }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={soltar}
          className={cn(
            "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-input-border bg-surface p-5 text-center",
            arrastrando && "border-accent-strong bg-card",
            error && "border-destructive"
          )}
        >
          <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-[14px] text-muted-foreground">Arrastra aquí tu capture o elígelo desde tu teléfono.</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={() => entrada.current?.click()}>
              <ImageIcon aria-hidden />
              Elegir imagen
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={disabled}
              onClick={() => {
                const el = entrada.current;
                if (!el) return;
                el.setAttribute("capture", "environment");
                el.click();
                el.removeAttribute("capture");
              }}
            >
              <CameraIcon aria-hidden />
              Tomar foto
            </Button>
          </div>
          <p className="text-[12px] text-muted-foreground">JPG, PNG o WEBP · hasta 5 MB</p>
        </div>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-[13px] font-medium text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export function PagoPasajero({
  metodos,
  totalUsd,
  tasa,
  totalBs: totalBsProp,
  permitirTaquilla = false,
  enviando,
  error,
  onEnviar,
  onTaquilla,
  onBarra,
  idForm = ID_FORM_PAGO_PASAJERO,
}: PagoPasajeroProps) {
  const id = useId();
  const hayTaquilla = permitirTaquilla && !!onTaquilla;
  const [elegido, setElegido] = useState<string | null>(() =>
    metodos.length === 1 && !hayTaquilla ? metodos[0].id : metodos.length === 0 && hayTaquilla ? TAQUILLA : null
  );
  const [referencia, setReferencia] = useState("");
  const [fecha, setFecha] = useState(() => hoyVE());
  const [banco, setBanco] = useState("");
  /** null = el monto sigue al total (prellenado); texto = lo que escribió el pasajero. */
  const [montoEscrito, setMontoEscrito] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [errorArchivo, setErrorArchivo] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [intentado, setIntentado] = useState(false);
  const [tocados, setTocados] = useState<Partial<Record<CampoPago, boolean>>>({});
  const subidoRef = useRef<{ archivo: File; path: string } | null>(null);
  const ocupadoRef = useRef(false);

  const metodo = metodos.find((m) => m.id === elegido) ?? null;
  const zelle = metodo?.tipo === "ZELLE";
  const pagoMovil = metodo?.tipo === "PAGO_MOVIL";
  const taquilla = elegido === TAQUILLA && hayTaquilla;

  const totalBs = totalBsProp ?? (tasa ? usdABs(totalUsd, tasa.tasa) : null);
  const sinTasa = totalBs === null;
  const esperado = zelle ? totalUsd : totalBs;
  const montoTexto = montoEscrito ?? (esperado != null && esperado > 0 ? formatNumeroVE(esperado) : "");
  const hoy = hoyVE();

  const resultado = metodo
    ? validarDatosPago(
        {
          metodoPagoId: metodo.id,
          numeroReferencia: referencia,
          fechaTransaccion: fecha,
          bancoEmisor: banco,
          montoDeclarado: leerMonto(montoTexto),
          comprobantePath: archivo ? "pendiente" : null,
        },
        metodo,
        esperado
      )
    : null;
  const errores = resultado && !resultado.ok ? resultado.errores : {};
  const ver = (campo: CampoPago) =>
    campo === "comprobante" && errorArchivo
      ? errorArchivo
      : intentado || tocados[campo]
        ? (errores[campo] ?? null)
        : null;
  const tocar = (campo: CampoPago) => setTocados((t) => (t[campo] ? t : { ...t, [campo]: true }));

  const elegirMetodo = (clave: string) => {
    setElegido(clave);
    setMontoEscrito(null);
    setIntentado(false);
    setTocados({});
  };

  const ocupado = enviando || subiendo;

  const reportar = async () => {
    if (!metodo || !resultado || ocupadoRef.current || enviando || sinTasa) return;
    setIntentado(true);
    if (!resultado.ok || errorArchivo) return;
    ocupadoRef.current = true;
    try {
      let path: string | null = null;
      if (pagoMovil && archivo) {
        if (subidoRef.current?.archivo === archivo) path = subidoRef.current.path;
        else {
          setSubiendo(true);
          const sube = await subirComprobante(archivo);
          setSubiendo(false);
          if (!sube.ok) {
            setErrorArchivo(sube.error);
            return;
          }
          subidoRef.current = { archivo, path: sube.path };
          path = sube.path;
        }
      }
      onEnviar({ ...resultado.datos, comprobantePath: path });
    } finally {
      setSubiendo(false);
      ocupadoRef.current = false;
    }
  };

  // ── Encabezado: total ──
  const principal = zelle ? formatUsd(totalUsd) : totalBs !== null ? formatBs(totalBs) : formatUsd(totalUsd);
  const secundario = zelle
    ? totalBs !== null
      ? `≈ ${formatBs(totalBs)}`
      : null
    : totalBs !== null
      ? `≈ ${formatUsd(totalUsd)}`
      : null;

  // Con barra externa, informa a la página qué botón dibujar (solo cuando cambia algo).
  const modoBarra: EstadoBarraPago["modo"] = taquilla ? "taquilla" : metodo ? "reportar" : "ninguno";
  const etiquetaBarra = modoBarra === "taquilla" ? "Apartar y pagar en taquilla" : `Reportar pago de ${principal}`;
  const deshabilitadoBarra = modoBarra === "ninguno" || (modoBarra === "reportar" && sinTasa);
  const onBarraRef = useRef(onBarra);
  useEffect(() => {
    onBarraRef.current = onBarra;
  });
  const hayBarra = Boolean(onBarra);
  useEffect(() => {
    if (!hayBarra) return;
    onBarraRef.current?.({ modo: modoBarra, etiqueta: etiquetaBarra, subiendo, deshabilitado: deshabilitadoBarra });
  }, [hayBarra, modoBarra, etiquetaBarra, subiendo, deshabilitadoBarra]);

  const encabezado = (
    <div className="rounded-xl bg-card p-4 shadow-card">
      <p className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">
        {zelle ? "Monto a enviar por Zelle" : "Total a pagar"}
      </p>
      <p className="text-3xl font-bold tabular-nums text-foreground">{principal}</p>
      <p className="text-[14px] text-muted-foreground tabular-nums">
        {secundario}
        {tasa && secundario ? ` · BCV ${fechaTasaCorta(tasa.fecha)}` : ""}
      </p>
    </div>
  );

  const sinMetodos = metodos.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {encabezado}

      {sinTasa && (
        <div role="alert" className="flex items-start gap-2 rounded-xl bg-warning-light p-4 text-[15px] text-warning-deep">
          <WarningIcon className="mt-0.5 size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
          <p>
            Aún no tenemos la tasa BCV de hoy para calcular el monto en bolívares. Intenta en unos minutos
            {hayTaquilla ? " o aparta tu asiento y paga en la taquilla" : ""}.
          </p>
        </div>
      )}

      {sinMetodos && (
        <div className="flex items-start gap-2 rounded-xl bg-surface p-4 text-[15px] text-foreground">
          <InfoIcon className="mt-0.5 size-5 shrink-0 text-info-text" weight="fill" aria-hidden />
          <p>
            Esta cooperativa todavía no tiene formas de pago en línea.
            {hayTaquilla ? " Aparta tu asiento y paga en su taquilla." : " Consulta con la cooperativa cómo pagar."}
          </p>
        </div>
      )}

      {(metodos.length + (hayTaquilla ? 1 : 0) > 1 || (metodos.length === 1 && hayTaquilla)) && (
        <GrupoOpciones etiqueta="Forma de pago" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {metodos.map((m) => (
            <OpcionTile
              key={m.id}
              seleccionado={elegido === m.id}
              onSelect={() => elegirMetodo(m.id)}
              icono={INFO_METODO[m.tipo].icono}
              titulo={INFO_METODO[m.tipo].titulo}
              detalle={INFO_METODO[m.tipo].detalle}
              disabled={ocupado}
            />
          ))}
          {hayTaquilla && (
            <OpcionTile
              seleccionado={elegido === TAQUILLA}
              onSelect={() => elegirMetodo(TAQUILLA)}
              icono={MoneyIcon}
              titulo="Apartar y pagar en taquilla"
              detalle="En efectivo, en la taquilla de la cooperativa"
              disabled={ocupado}
            />
          )}
        </GrupoOpciones>
      )}

      {taquilla && (
        <>
          <div className="flex items-start gap-2 rounded-xl bg-info-light p-4 text-[15px] text-info-deep">
            <InfoIcon className="mt-0.5 size-5 shrink-0 text-info-text" weight="fill" aria-hidden />
            <p>Tu asiento queda apartado 30 minutos. Paga en efectivo en la taquilla antes de que venza la reserva.</p>
          </div>
          {!hayBarra && (
            <Button type="button" size="lg" onClick={onTaquilla} disabled={ocupado} className="w-full">
              Apartar y pagar en taquilla
            </Button>
          )}
        </>
      )}

      {metodo && (
        <form
          id={idForm}
          noValidate
          className="flex flex-col gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            void reportar();
          }}
        >
          <DatosParaPagar
            metodo={metodo}
            montoEtiqueta={zelle ? "Monto a enviar" : "Monto a transferir"}
            montoTexto={zelle ? formatUsd(totalUsd) : totalBs !== null ? formatBs(totalBs) : null}
            montoCopia={zelle ? totalUsd.toFixed(2) : totalBs !== null ? montoParaPegar(totalBs) : null}
          />

          <fieldset className="flex flex-col gap-4" disabled={ocupado}>
            <legend className="mb-1 text-[17px] font-semibold text-foreground">Cuando pagues, repórtalo aquí</legend>

            <Campo
              id={`${id}-referencia`}
              label={zelle ? "Código de confirmación de Zelle" : "Número de referencia"}
              value={referencia}
              onChange={setReferencia}
              onBlur={() => tocar("referencia")}
              mayusculas={zelle}
              inputMode={zelle ? "text" : "numeric"}
              placeholder={zelle ? "Ej. ABC123XYZ" : "Ej. 012345678901"}
              maxLength={40}
              error={ver("referencia")}
              ayuda={zelle ? "Lo encuentras en el correo o la app de tu banco." : "Lo ves en el comprobante de tu banco."}
              enterKeyHint="next"
              required
            />

            <FechaField
              id={`${id}-fecha`}
              label="Fecha del pago"
              value={fecha}
              onChange={(f) => {
                setFecha(f);
                tocar("fecha");
              }}
              min={sumarDiasVE(hoy, -DIAS_ATRAS_PAGO)}
              max={hoy}
              error={ver("fecha")}
              required
            />

            {zelle ? (
              <p className="text-[14px] text-muted-foreground">Banco emisor: Zelle.</p>
            ) : (
              <BancoField
                id={`${id}-banco`}
                label="Banco desde el que pagaste"
                value={banco}
                onChange={(b) => {
                  setBanco(b);
                  tocar("banco");
                }}
                error={ver("banco")}
                required
              />
            )}

            <MontoField
              id={`${id}-monto`}
              label={zelle ? "Monto que enviaste" : "Monto que pagaste"}
              moneda={zelle ? "USD" : "Bs"}
              value={montoTexto}
              onChange={setMontoEscrito}
              onBlur={() => tocar("monto")}
              error={ver("monto")}
              ayuda="Ya lo llenamos con el total; cámbialo solo si pagaste otro monto."
              enterKeyHint="done"
              required
            />

            {pagoMovil && (
              <SelectorComprobante
                idCampo={`${id}-comprobante`}
                archivo={archivo}
                disabled={ocupado}
                error={ver("comprobante")}
                onArchivo={(f, e) => {
                  setArchivo(f);
                  setErrorArchivo(e);
                  subidoRef.current = null;
                  tocar("comprobante");
                }}
              />
            )}
          </fieldset>

          <div className="flex items-start gap-2 rounded-xl bg-surface p-4 text-[14px] text-muted-foreground">
            <InfoIcon className="mt-0.5 size-5 shrink-0 text-info-text" weight="fill" aria-hidden />
            <p>
              La cooperativa verificará tu pago con su banco. Mientras tanto, tu asiento o envío queda en
              verificación y te avisamos cuando lo confirmen.
            </p>
          </div>

          <div aria-live="polite">{error && <AvisoError>{error}</AvisoError>}</div>

          {!hayBarra && (
            <Button type="submit" size="xl" disabled={ocupado || sinTasa} className="w-full">
              {ocupado && <Spinner size="sm" />}
              {subiendo ? "Subiendo capture…" : enviando ? "Reportando pago…" : "Reportar pago"}
            </Button>
          )}
        </form>
      )}

      {!metodo && !taquilla && !sinMetodos && (
        <p className="text-[14px] text-muted-foreground">Elige cómo vas a pagar para ver los datos de la cuenta.</p>
      )}

      {taquilla && error && <AvisoError>{error}</AvisoError>}
    </div>
  );
}
