"use client";

// ─── Pagos por verificar ────────────────────────────────────────────────────
// Bandeja de los pagos digitales que los clientes registraron desde la app
// (boletos y encomiendas). Cada uno se compara con el banco en el diálogo
// único de verificación (aprobar o rechazar con motivo).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ArrowClockwise, CheckCircle, Info, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { CeldaEnlace } from "@/components/celda-enlace";
import { Monto } from "@/components/monto";
import { TonoBadge } from "@/components/status-badge";
import { TabsUrl } from "@/components/barra-filtros";
import { TablaSkeleton } from "@/components/tabla-skeleton";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useParamUrl } from "@/hooks/use-param-url";
import { formatBs, formatUsd, type TasaRef } from "@/lib/dinero";
import { formatFechaHoraCortaVE, formatHaceTiempo } from "@/lib/fechas";
import { humanizeError } from "@/lib/errores";
import { formatCedula } from "@/lib/ve";
import { ICONO_SECCION } from "@/lib/navigation";
import { conceptoDePago, type PagadorRol, type PagoPorVerificar } from "@/lib/types/pagos";
import { cn } from "@/lib/utils";
import { listarPagosPorVerificar } from "./actions";

type Pestana = "todos" | "boleto" | "encomienda";

const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "boleto", titulo: "Boletos" },
  { id: "encomienda", titulo: "Encomiendas" },
];

const COLUMNAS = 8;

const METODO: Record<string, string> = {
  PAGO_MOVIL: "Pago Móvil",
  TRANSFERENCIA_BANCARIA: "Transferencia",
  ZELLE: "Zelle",
  EFECTIVO: "Efectivo",
};

const ROL: Record<PagadorRol, string> = {
  PASAJERO: "Pasajero",
  REMITENTE: "Remitente",
  DESTINATARIO: "Destinatario",
  OTRO: "Cliente",
};

const REFRESCO_MS = 60 * 1000;

function leerPestana(valor: string | null): Pestana {
  return valor === "boleto" || valor === "encomienda" ? valor : "todos";
}

function formatEnMoneda(monto: number, moneda: "VES" | "USD") {
  return moneda === "USD" ? formatUsd(monto) : formatBs(monto);
}

function Diferencia({ pago }: { pago: PagoPorVerificar }) {
  if (pago.esperado == null || pago.declarado == null) {
    return (
      <span className="text-sm text-muted-foreground">
        {pago.declarado == null ? "Sin monto declarado" : "Sin monto en Bs"}
      </span>
    );
  }
  const dif = pago.diferencia ?? pago.declarado - pago.esperado;
  if (Math.abs(dif) < 0.01) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-success-text">
        <CheckCircle weight="fill" className="size-4 shrink-0" aria-hidden />
        Coincide
      </span>
    );
  }
  const falta = dif < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap tabular-nums",
        falta ? "text-warning-text" : "text-info-text"
      )}
    >
      {falta ? (
        <Warning weight="fill" className="size-4 shrink-0" aria-hidden />
      ) : (
        <Info weight="fill" className="size-4 shrink-0" aria-hidden />
      )}
      {falta ? "Faltan" : "Sobran"} {formatEnMoneda(Math.abs(dif), pago.moneda)}
    </span>
  );
}

function BandejaPagos() {
  const [tipo] = useParamUrl("tipo", "todos");
  const pestana = leerPestana(tipo);
  // El pago abierto vive en la URL (?id=): se comparte y "Atrás" lo cierra.
  const [pagoAbierto, setPagoAbierto] = useParamUrl("id");

  const [pagos, setPagos] = useState<PagoPorVerificar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Momento de la última carga: "hace X min" y "el viaje ya salió" sin leer el reloj al renderizar.
  const [ahora, setAhora] = useState(0);
  const peticionRef = useRef(0);

  const cargar = useCallback(async (silencioso = false) => {
    const n = ++peticionRef.current;
    if (!silencioso) setCargando(true);
    try {
      const res = await listarPagosPorVerificar();
      if (n !== peticionRef.current) return;
      if (res.success) {
        setPagos(res.data);
        setErrorCarga(null);
      } else if (!silencioso) {
        setErrorCarga(res.error);
      }
      setAhora(Date.now());
    } catch (err) {
      if (n !== peticionRef.current) return;
      // En la recarga silenciosa se conserva la lista que ya se ve.
      if (!silencioso) setErrorCarga(humanizeError(err, "cargar los pagos por verificar"));
    } finally {
      if (n === peticionRef.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
    // Los clientes registran pagos a cualquier hora: se actualiza sola cada minuto.
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void cargar(true);
    }, REFRESCO_MS);
    return () => window.clearInterval(id);
  }, [cargar]);

  const cuenta = (p: Pestana) => (p === "todos" ? pagos.length : pagos.filter((x) => x.tipo_recurso === p).length);
  const filtrados = pestana === "todos" ? pagos : pagos.filter((p) => p.tipo_recurso === pestana);
  const { visibles, pagina, paginas, ir } = usePaginacion(filtrados);
  const primeraCarga = cargando && pagos.length === 0 && !errorCarga;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Pagos por verificar">
        <Button variant="outline" onClick={() => void cargar()} disabled={cargando} aria-busy={cargando || undefined}>
          <ArrowClockwise className={cn(cargando && "motion-safe:animate-spin")} aria-hidden />
          Actualizar
        </Button>
      </PageHeader>

      <TabsUrl
        param="tipo"
        defecto="todos"
        opciones={PESTANAS.map((p) => ({ valor: p.id, etiqueta: p.titulo, conteo: cargando ? undefined : cuenta(p.id) }))}
      />

      {primeraCarga ? (
        <TablaSkeleton columnas={COLUMNAS} />
      ) : errorCarga && pagos.length === 0 ? (
        <Card className="p-0">
          <ErrorState titulo="No pudimos cargar los pagos" descripcion={errorCarga} onReintentar={() => cargar()} />
        </Card>
      ) : filtrados.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ICONO_SECCION.pagos}
            title="Todo al día"
            description={
              pestana === "todos"
                ? "Aquí llegan los pagos que registran tus clientes en la app."
                : `No hay pagos de ${pestana === "boleto" ? "boletos" : "encomiendas"} por verificar.`
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead className="hidden md:table-cell">Registrado</TableHead>
                <TableHead className="hidden sm:table-cell">Concepto</TableHead>
                <TableHead className="hidden lg:table-cell">Método</TableHead>
                <TableHead className="hidden md:table-cell">Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="hidden text-right lg:table-cell">Diferencia</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((p) => {
                const tasa: TasaRef | null =
                  p.tasa_bcv && p.tasa_bcv_fecha ? { tasa: Number(p.tasa_bcv), fecha: p.tasa_bcv_fecha } : null;
                const viajeSalio =
                  p.tipo_recurso === "boleto" && !!p.viaje_salida && ahora > 0 && new Date(p.viaje_salida).getTime() < ahora;
                const cliente = p.cliente_nombre || "Sin nombre";
                return (
                  <TableRow key={p.pago_id} className="relative">
                    <CeldaEnlace onAbrir={() => setPagoAbierto(p.pago_id)} etiqueta={`Verificar el pago de ${cliente}`}>
                      <span className="block">{cliente}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {[p.cliente_cedula ? formatCedula(p.cliente_cedula) : null, ROL[p.pagador_rol] ?? null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </CeldaEnlace>
                    <TableCell className="hidden whitespace-nowrap md:table-cell">
                      <span className="block text-sm">{ahora > 0 ? formatHaceTiempo(p.creado_at, new Date(ahora)) : ""}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {formatFechaHoraCortaVE(p.creado_at)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-[18rem] sm:table-cell">
                      <span className="block text-sm whitespace-normal">{conceptoDePago(p)}</span>
                      {(viajeSalio || p.recurso_vencido) && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {viajeSalio && <TonoBadge tono="pendiente">El viaje ya salió</TonoBadge>}
                          {p.recurso_vencido && (
                            <TonoBadge tono="peligro">
                              {p.tipo_recurso === "encomienda" ? "Envío cerrado" : "Boletos vencidos"}
                            </TonoBadge>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <span className="block text-sm">{(p.metodo_tipo && METODO[p.metodo_tipo]) || "Pago digital"}</span>
                      {p.metodo_tipo !== "ZELLE" && p.banco_emisor && (
                        <span className="block text-xs text-muted-foreground">Desde {p.banco_emisor}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono text-sm text-foreground">{p.numero_referencia || "—"}</span>
                      {p.referencia_repetida && (
                        <span className="mt-1 flex items-center gap-1 text-xs font-medium text-warning-text">
                          <Warning weight="fill" className="size-3.5 shrink-0" aria-hidden />
                          Repetida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Monto usd={p.monto_usd} bs={p.monto_bs} tasa={tasa} moneda={p.moneda} size="sm" align="right" />
                    </TableCell>
                    <TableCell className="hidden text-right lg:table-cell">
                      <Diferencia pago={p} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="relative z-10"
                        onClick={() => setPagoAbierto(p.pago_id)}
                        aria-label={`Verificar el pago de ${cliente}`}
                      >
                        Verificar pago
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
        </Card>
      )}

      {pagoAbierto && (
        <VerificarPagoDialog
          pagoId={pagoAbierto}
          open
          onOpenChange={(abierto) => !abierto && setPagoAbierto(null)}
          onResuelto={() => {
            // Se quita de la lista al instante; la recarga confirma el estado real.
            setPagos((prev) => prev.filter((x) => x.pago_id !== pagoAbierto));
            void cargar(true);
          }}
        />
      )}
    </div>
  );
}

export default function PagosPorVerificarPage() {
  // useSearchParams necesita un límite de Suspense (Next.js 16).
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-6">
          <PageHeader title="Pagos por verificar" />
          <TablaSkeleton columnas={COLUMNAS} />
        </div>
      }
    >
      <BandejaPagos />
    </Suspense>
  );
}
