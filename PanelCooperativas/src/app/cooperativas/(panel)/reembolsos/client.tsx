"use client";

// ─── Reembolsos ──────────────────────────────────────────────────────────────
// Bandeja de boletos cancelados con dinero por devolver (cancelados por el
// pasajero, 95 %, o por la cooperativa, 100 %). La cooperativa devuelve el
// dinero por el mismo medio con que pagó el pasajero y lo registra aquí; el
// servidor marca el reembolso como hecho y le avisa al pasajero.

import { useCallback, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowClockwise,
  Bank,
  CheckCircle,
  CurrencyDollar,
  DeviceMobile,
  Money,
  WarningCircle,
  WhatsappLogo,
  type Icon,
} from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { TabsUrl } from "@/components/barra-filtros";
import { TonoBadge } from "@/components/status-badge";
import { AvisoError } from "@/components/aviso-error";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useParamUrl } from "@/hooks/use-param-url";
import { avisarExito, avisarInfo } from "@/lib/avisos";
import { ICONO_SECCION } from "@/lib/navigation";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Monto } from "@/components/monto";
import { requireOnline } from "@/components/connectivity-banner";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useUser } from "@/hooks/use-user";
import { buscarBanco } from "@/lib/bancos";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { humanizeError } from "@/lib/errores";
import { etiquetaMetodoPago, METODO_PAGO } from "@/lib/estados";
import { formatFechaHoraCortaVE, formatFechaVE } from "@/lib/fechas";
import { formatCedula, formatTelefono, telefonoWhatsApp } from "@/lib/ve";
import type { CanceladoPor, MetodoReembolso, Reembolso } from "@/lib/types/reembolsos";
import { cn } from "@/lib/utils";
import { listarReembolsos, registrarReembolso, type ResultadoAccion } from "./actions";
import { formatCodigoBoleto } from "@/lib/artefactos.generated";
import { formatRuta } from "@/lib/ciudades";

type Pestana = "pendientes" | "devueltos";

const METODOS_DEVOLUCION: MetodoReembolso[] = ["PAGO_MOVIL", "TRANSFERENCIA_BANCARIA", "ZELLE", "EFECTIVO"];

/** Icono de cada método (§2.3), igual que en la app. */
const ICONO_METODO: Record<MetodoReembolso, Icon> = {
  PAGO_MOVIL: DeviceMobile,
  TRANSFERENCIA_BANCARIA: Bank,
  ZELLE: CurrencyDollar,
  EFECTIVO: Money,
};

/** Boletos de una misma compra: se devuelven y se registran juntos. */
type Grupo = {
  clave: string;
  filas: Reembolso[];
  canceladoAt: string;
  canceladoPor: CanceladoPor;
  motivo: string | null;
  contactoNombre: string;
  contactoTelefono: string | null;
  ruta: string;
  salida: string;
  totalUsd: number;
  procesado: boolean;
  pagoMetodo: Reembolso["pago_metodo"];
  pagoBanco: string | null;
  pagoReferencia: string | null;
  pagoMoneda: Reembolso["pago_moneda"];
  pagoEstado: Reembolso["pago_estado"];
  procesadoAt: string | null;
  reembolsoMetodo: MetodoReembolso | null;
  reembolsoReferencia: string | null;
  reembolsoNota: string | null;
};

function fechaCorta(iso: string | null | undefined) {
  return iso ? formatFechaVE(iso) : "";
}

function agrupar(filas: Reembolso[]): Grupo[] {
  const mapa = new Map<string, Reembolso[]>();
  for (const f of filas) {
    // Una compra puede tener boletos pendientes y otros ya devueltos: se separan.
    const clave = `${f.compra_id ?? f.boleto_id}:${f.procesado ? "p" : "n"}`;
    const lista = mapa.get(clave);
    if (lista) lista.push(f);
    else mapa.set(clave, [f]);
  }
  return Array.from(mapa.entries()).map(([clave, lista]) => {
    const ordenadas = [...lista].sort((a, b) =>
      a.asiento.length - b.asiento.length || a.asiento.localeCompare(b.asiento)
    );
    const primera = ordenadas[0];
    const conPago = ordenadas.find((f) => f.pago_id) ?? primera;
    const canceladoAt = ordenadas.reduce(
      (max, f) => (f.cancelado_at > max ? f.cancelado_at : max),
      primera.cancelado_at
    );
    return {
      clave,
      filas: ordenadas,
      canceladoAt,
      canceladoPor: ordenadas.some((f) => f.cancelado_por === "COOPERATIVA") ? "COOPERATIVA" : "PASAJERO",
      motivo: primera.motivo_cancelacion,
      contactoNombre: primera.contacto_nombre || primera.pasajero_nombre || "Pasajero",
      contactoTelefono: primera.contacto_telefono,
      ruta: formatRuta(primera.ruta),
      salida: primera.viaje_salida,
      totalUsd: Math.round(ordenadas.reduce((s, f) => s + Number(f.monto_usd ?? 0), 0) * 100) / 100,
      procesado: ordenadas.every((f) => f.procesado),
      pagoMetodo: conPago.pago_metodo,
      pagoBanco: conPago.pago_banco_emisor,
      pagoReferencia: conPago.pago_referencia,
      pagoMoneda: conPago.pago_moneda,
      pagoEstado: conPago.pago_estado,
      procesadoAt: primera.procesado_at,
      reembolsoMetodo: primera.reembolso_metodo,
      reembolsoReferencia: primera.reembolso_referencia,
      reembolsoNota: primera.reembolso_nota,
    } satisfies Grupo;
  });
}

/** "Pago Móvil · 0102 · ref. 123456" */
function comoPago(g: Grupo) {
  if (!g.pagoMetodo) return "Sin pago registrado";
  const partes = [etiquetaMetodoPago(g.pagoMetodo)];
  if (g.pagoBanco && g.pagoMetodo !== "ZELLE" && g.pagoMetodo !== "EFECTIVO") {
    partes.push(buscarBanco(g.pagoBanco)?.codigo ?? g.pagoBanco);
  }
  if (g.pagoReferencia) partes.push(`ref. ${g.pagoReferencia}`);
  return partes.join(" · ");
}

function asientosTexto(g: Grupo) {
  const asientos = g.filas.map((f) => f.asiento);
  if (asientos.length === 1) return `Asiento ${asientos[0]}`;
  return `Asientos ${asientos.slice(0, -1).join(", ")} y ${asientos[asientos.length - 1]}`;
}

function enlaceWhatsApp(g: Grupo, cooperativa: string | null | undefined) {
  const numero = telefonoWhatsApp(g.contactoTelefono);
  if (!numero) return null;
  const codigos = g.filas.map((f) => formatCodigoBoleto(f.codigo_boleto)).join(", ");
  const texto =
    `Hola ${g.contactoNombre}, te escribimos de ${cooperativa || "la cooperativa"} por el reembolso ` +
    `${g.filas.length === 1 ? "de tu boleto" : "de tus boletos"} ${codigos} (${g.ruta}, ${fechaCorta(g.salida)}).`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

export function ReembolsosClient({ inicial }: { inicial: ResultadoAccion<Reembolso[]> }) {
  const { user } = useUser();
  const [estado] = useParamUrl("estado", "pendientes");
  const pestana: Pestana = estado === "devueltos" ? "devueltos" : "pendientes";
  // Primer render con los datos del servidor; "Actualizar" y "Reintentar" los vuelven a pedir.
  const [filas, setFilas] = useState<Reembolso[]>(inicial.success ? inicial.data : []);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(inicial.success ? null : inicial.error);
  const [grupoAbierto, setGrupoAbierto] = useState<Grupo | null>(null);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const peticionRef = useRef(0);

  const cargar = useCallback(async () => {
    const n = ++peticionRef.current;
    setCargando(true);
    try {
      const res = await listarReembolsos("TODOS");
      if (n !== peticionRef.current) return;
      if (res.success) {
        setFilas(res.data);
        setErrorCarga(null);
      } else {
        setErrorCarga(res.error);
      }
    } catch (err) {
      if (n !== peticionRef.current) return;
      setErrorCarga(humanizeError(err, "cargar los reembolsos"));
    } finally {
      if (n === peticionRef.current) setCargando(false);
    }
  }, []);

  const grupos = useMemo(() => agrupar(filas), [filas]);
  const pendientes = useMemo(
    () => grupos.filter((g) => !g.procesado).sort((a, b) => a.canceladoAt.localeCompare(b.canceladoAt)),
    [grupos]
  );
  const devueltos = useMemo(
    () =>
      grupos
        .filter((g) => g.procesado)
        .sort((a, b) => (b.procesadoAt ?? "").localeCompare(a.procesadoAt ?? "")),
    [grupos]
  );
  const visibles = pestana === "pendientes" ? pendientes : devueltos;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Reembolsos" description="Devuelve por el mismo medio y regístralo.">
        <Button variant="outline" onClick={() => void cargar()} disabled={cargando} aria-busy={cargando || undefined}>
          <ArrowClockwise className={cn(cargando && "motion-safe:animate-spin")} aria-hidden />
          Actualizar
        </Button>
      </PageHeader>

      <TabsUrl
        param="estado"
        defecto="pendientes"
        opciones={[
          // Sin datos (cargando o con error) no se muestra un conteo engañoso.
          { valor: "pendientes", etiqueta: "Por devolver", conteo: filas.length > 0 || !errorCarga ? pendientes.length : undefined },
          { valor: "devueltos", etiqueta: "Devueltos" },
        ]}
      />

      {cargando && filas.length === 0 ? (
        <div role="status" aria-label="Cargando" className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
              {Array.from({ length: 4 }).map((__, j) => (
                <div key={j} className="flex flex-col gap-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </Card>
          ))}
        </div>
      ) : errorCarga && filas.length === 0 ? (
        <Card className="p-0">
          <ErrorState titulo="No pudimos cargar los reembolsos" descripcion={errorCarga} onReintentar={cargar} />
        </Card>
      ) : visibles.length === 0 ? (
        <Card className="p-0">
          {pestana === "pendientes" ? (
            <EmptyState
              icon={ICONO_SECCION.reembolsos}
              title="Todo al día"
              description="Aquí llegan los boletos pagados que se cancelan."
            />
          ) : (
            <EmptyState
              icon={CheckCircle}
              title="Sin devoluciones registradas"
              description="Aquí verás cada devolución con su método y referencia."
            />
          )}
        </Card>
      ) : (
        <>
          {errorCarga && (
            <ErrorState
              compacto
              titulo="No pudimos actualizar la lista"
              descripcion={`${errorCarga} Lo que ves puede no estar al día.`}
              onReintentar={cargar}
            />
          )}
          <ul className="flex flex-col gap-3" aria-label={pestana === "pendientes" ? "Reembolsos por devolver" : "Reembolsos devueltos"}>
            {visibles.map((g) => (
              <li key={g.clave}>
                <TarjetaReembolso
                  grupo={g}
                  cooperativa={user.cooperativa_nombre}
                  onRegistrar={() => {
                    setGrupoAbierto(g);
                    setDialogoAbierto(true);
                  }}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {grupoAbierto && (
        <RegistrarDevolucionDialog
          grupo={grupoAbierto}
          open={dialogoAbierto}
          onOpenChange={setDialogoAbierto}
          onRegistrado={() => {
            const ids = new Set(grupoAbierto.filas.map((f) => f.boleto_id));
            // Se marca al instante; la recarga confirma el estado real.
            setFilas((prev) =>
              prev.map((f) => (ids.has(f.boleto_id) ? { ...f, procesado: true, procesado_at: new Date().toISOString() } : f))
            );
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function TarjetaReembolso({
  grupo: g,
  cooperativa,
  onRegistrar,
}: {
  grupo: Grupo;
  cooperativa: string | null | undefined;
  onRegistrar(): void;
}) {
  const whatsapp = enlaceWhatsApp(g, cooperativa);
  const pagoSinVerificar = Boolean(g.pagoMetodo) && g.pagoEstado !== "APROBADO";
  const moneda = g.pagoMoneda === "USD" ? "USD" : undefined;

  return (
    <article className="rounded-md border border-border bg-card p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <dl className="grid flex-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Dato etiqueta="Cancelado">
            <span className="block">{fechaCorta(g.canceladoAt)}</span>
            <span className="block text-xs text-muted-foreground">
              {g.canceladoPor === "COOPERATIVA" ? "por la cooperativa (100 %)" : "por el pasajero (95 %)"}
            </span>
          </Dato>
          <Dato etiqueta={g.filas.length === 1 ? "Boleto" : `${g.filas.length} boletos`}>
            <span className="block">{asientosTexto(g)}</span>
            <span className="block font-mono text-xs text-foreground">
              {g.filas.map((f) => formatCodigoBoleto(f.codigo_boleto)).join(", ")}
            </span>
          </Dato>
          <Dato etiqueta="Pasajero y contacto">
            <span className="block font-medium">{g.contactoNombre}</span>
            {g.filas.some((f) => f.pasajero_nombre && f.pasajero_nombre !== g.contactoNombre) && (
              <span className="block text-xs text-muted-foreground">
                Viaja: {g.filas.map((f) => f.pasajero_nombre || "Sin nombre").join(", ")}
              </span>
            )}
            {g.filas[0].pasajero_cedula && (
              <span className="block text-xs text-muted-foreground">C.I. {formatCedula(g.filas[0].pasajero_cedula)}</span>
            )}
            {g.contactoTelefono ? (
              whatsapp ? (
                <a
                  href={whatsapp}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-info-text underline-offset-4 hover:underline focus-visible:underline"
                  aria-label={`Escribir por WhatsApp a ${g.contactoNombre} (${formatTelefono(g.contactoTelefono)})`}
                >
                  <WhatsappLogo className="size-3.5" aria-hidden />
                  {formatTelefono(g.contactoTelefono)}
                </a>
              ) : (
                <span className="block text-xs text-muted-foreground">{g.contactoTelefono}</span>
              )
            ) : (
              <span className="block text-xs text-muted-foreground">Sin teléfono</span>
            )}
          </Dato>
          <Dato etiqueta="Viaje">
            <span className="block">{g.ruta}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">{formatFechaHoraCortaVE(g.salida)}</span>
          </Dato>
          <Dato etiqueta={g.procesado ? "Devuelto" : "Monto a devolver"}>
            <Monto usd={g.totalUsd} moneda={moneda} size="sm" />
          </Dato>
          <Dato etiqueta="Cómo pagó">
            <span className="block">{comoPago(g)}</span>
            {pagoSinVerificar && (
              <TonoBadge tono="pendiente" className="mt-1">
                Pago sin verificar
              </TonoBadge>
            )}
          </Dato>
          {g.motivo && (
            <div className="sm:col-span-2">
              <Dato etiqueta="Motivo">
                <span className="block text-muted-foreground">{g.motivo}</span>
              </Dato>
            </div>
          )}
          {g.procesado && (
            <div className="sm:col-span-2">
              <Dato etiqueta="Devolución">
                <span className="block">
                  {g.procesadoAt ? `El ${fechaCorta(g.procesadoAt)} por ` : "Por "}
                  {g.reembolsoMetodo ? etiquetaMetodoPago(g.reembolsoMetodo) : "método sin registrar"}
                  {g.reembolsoReferencia ? ` (ref. ${g.reembolsoReferencia})` : ""}
                </span>
                {g.reembolsoNota && <span className="block text-xs text-muted-foreground">{g.reembolsoNota}</span>}
              </Dato>
            </div>
          )}
        </dl>
        {!g.procesado && (
          <Button variant="outline" className="shrink-0 self-start" onClick={onRegistrar}>
            Registrar devolución
          </Button>
        )}
      </div>
    </article>
  );
}

function RegistrarDevolucionDialog({
  grupo: g,
  open,
  onOpenChange,
  onRegistrado,
}: {
  grupo: Grupo;
  open: boolean;
  onOpenChange(open: boolean): void;
  onRegistrado(): void;
}) {
  const [enviando, setEnviando] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(abierto) => !enviando && onOpenChange(abierto)}>
      {open && (
        <FormularioDevolucion
          // Se monta al abrir: el formulario empieza limpio cada vez.
          key={g.clave}
          grupo={g}
          enviando={enviando}
          setEnviando={setEnviando}
          onCancelar={() => onOpenChange(false)}
          onHecho={() => {
            onOpenChange(false);
            onRegistrado();
          }}
        />
      )}
    </Dialog>
  );
}

function FormularioDevolucion({
  grupo: g,
  enviando,
  setEnviando,
  onCancelar,
  onHecho,
}: {
  grupo: Grupo;
  enviando: boolean;
  setEnviando(v: boolean): void;
  onCancelar(): void;
  onHecho(): void;
}) {
  const uid = useId();
  const tasa = useTasaBCV();
  const referenciaRef = useRef<HTMLInputElement>(null);
  const enviandoRef = useRef(false);
  const metodoInicial: MetodoReembolso =
    g.pagoMetodo && (METODOS_DEVOLUCION as string[]).includes(g.pagoMetodo)
      ? (g.pagoMetodo as MetodoReembolso)
      : "PAGO_MOVIL";
  const [metodo, setMetodo] = useState<MetodoReembolso>(metodoInicial);
  const [referencia, setReferencia] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorReferencia, setErrorReferencia] = useState<string | null>(null);

  const enDolares = g.pagoMoneda === "USD" || metodo === "ZELLE";
  const montoTexto = enDolares
    ? formatUsd(g.totalUsd)
    : tasa
      ? `${formatBs(usdABs(g.totalUsd, tasa.tasa))} (${formatUsd(g.totalUsd)} a la tasa BCV de hoy)`
      : `${formatUsd(g.totalUsd)} en bolívares a la tasa BCV de hoy`;
  const pagoSinVerificar = Boolean(g.pagoMetodo) && g.pagoEstado !== "APROBADO";

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    // El ref evita un segundo envío antes de que el botón se deshabilite (doble Enter o doble clic).
    if (enviando || enviandoRef.current) return;
    setError(null);
    setErrorReferencia(null);
    if (metodo !== "EFECTIVO" && referencia.replace(/[^A-Za-z0-9]/g, "").length < 4) {
      setErrorReferencia("Escribe la referencia de la devolución (mínimo 4 caracteres).");
      referenciaRef.current?.focus();
      return;
    }
    enviandoRef.current = true;
    setEnviando(true);
    try {
      const res = await requireOnline(() =>
        registrarReembolso({
          boletoIds: g.filas.map((f) => f.boleto_id),
          metodo,
          referencia,
          nota,
        })
      )();
      if (!res.success) {
        if (res.campo === "referencia") {
          setErrorReferencia(res.error);
          referenciaRef.current?.focus();
        } else {
          setError(res.error);
        }
        return;
      }
      if (res.data.procesados === 0 && res.data.ya_procesados > 0) {
        avisarInfo("Esta devolución ya estaba registrada.");
      } else {
        avisarExito("Devolución registrada. Le avisamos al pasajero.");
      }
      setEnviando(false);
      onHecho();
    } catch (err) {
      setError(humanizeError(err, "registrar la devolución"));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  return (
    <DialogContent showCloseButton={!enviando}>
      <form onSubmit={enviar} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>Registrar devolución</DialogTitle>
          <DialogDescription>
            Devuelve <strong className="font-semibold text-foreground">{montoTexto}</strong> a {g.contactoNombre}.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid gap-1 rounded-md bg-muted/50 p-3 text-sm">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Pagó con</dt>
            <dd className="text-foreground">{comoPago(g)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{g.filas.length === 1 ? "Boleto" : "Boletos"}</dt>
            <dd className="text-foreground">
              {asientosTexto(g)} · {g.ruta}
            </dd>
          </div>
          {g.contactoTelefono && (
            <div className="flex gap-2">
              <dt className="text-muted-foreground">Teléfono</dt>
              <dd className="text-foreground tabular-nums">{formatTelefono(g.contactoTelefono)}</dd>
            </div>
          )}
        </dl>

        {pagoSinVerificar && (
          <Alert variant="warning">
            <WarningCircle weight="fill" aria-hidden />
            <AlertDescription>Este pago no está verificado. Confirma en tu banco que el dinero llegó.</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-2">
          <p className="text-sm font-medium text-foreground" id={`${uid}-metodo`}>
            ¿Cómo lo devolviste?
          </p>
          <GrupoOpciones etiqueta="¿Cómo lo devolviste?" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {METODOS_DEVOLUCION.map((m) => (
              <OpcionTile
                key={m}
                seleccionado={metodo === m}
                disabled={enviando}
                icono={ICONO_METODO[m]}
                titulo={METODO_PAGO[m]}
                className="p-3"
                onSelect={() => {
                  setMetodo(m);
                  setErrorReferencia(null);
                }}
              />
            ))}
          </GrupoOpciones>
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor={`${uid}-referencia`}>
            Referencia de la devolución{metodo === "EFECTIVO" ? " (opcional)" : ""}
          </Label>
          <Input
            id={`${uid}-referencia`}
            ref={referenciaRef}
            value={referencia}
            autoComplete="off"
            inputMode={metodo === "ZELLE" ? "text" : "numeric"}
            placeholder={metodo === "EFECTIVO" ? "Ej.: recibo 0012" : "Ej.: 98765432"}
            disabled={enviando}
            maxLength={60}
            aria-invalid={errorReferencia ? true : undefined}
            aria-describedby={errorReferencia ? `${uid}-referencia-error` : undefined}
            onChange={(e) => {
              setReferencia(e.target.value);
              if (errorReferencia) setErrorReferencia(null);
            }}
          />
          {errorReferencia && (
            <p id={`${uid}-referencia-error`} className="text-sm text-destructive-text">
              {errorReferencia}
            </p>
          )}
        </div>

        <div className="grid content-start gap-2">
          <Label htmlFor={`${uid}-nota`}>Nota (opcional)</Label>
          <Textarea
            id={`${uid}-nota`}
            value={nota}
            rows={2}
            maxLength={500}
            disabled={enviando}
            placeholder="Ej.: Se devolvió a la cuenta del titular del pago."
            onChange={(e) => setNota(e.target.value)}
          />
        </div>

        {error && <AvisoError>{error}</AvisoError>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando && <Spinner size="sm" aria-hidden />}
            {enviando ? "Registrando…" : "Registrar devolución"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
