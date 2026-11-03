"use client";

// ─── Pagos por verificar ────────────────────────────────────────────────────
// Bandeja de los pagos digitales que los clientes registraron desde la app
// (boletos y encomiendas). Cada uno se compara con el banco en el diálogo
// único de verificación (aprobar o rechazar con motivo).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowClockwise, CheckCircle, Info, Receipt, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CeldaEnlace } from "@/components/celda-enlace";
import { Monto } from "@/components/monto";
import { VerificarPagoDialog } from "@/components/pagos/verificar-pago-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBs, formatUsd, type TasaRef } from "@/lib/dinero";
import { formatFechaVE } from "@/lib/fechas";
import { humanizeError } from "@/lib/errores";
import { formatCedula } from "@/lib/ve";
import { conceptoDePago, type PagadorRol, type PagoPorVerificar } from "@/lib/types/pagos";
import { cn } from "@/lib/utils";
import { listarPagosPorVerificar } from "./actions";

type Pestana = "todos" | "boleto" | "encomienda";

const PESTANAS: { id: Pestana; titulo: string }[] = [
  { id: "todos", titulo: "Todos" },
  { id: "boleto", titulo: "Boletos" },
  { id: "encomienda", titulo: "Encomiendas" },
];

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

/** "hace 5 min", "hace 2 h", "ayer", "hace 3 días". */
function haceTiempo(iso: string, ahora: number) {
  const minutos = Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60000));
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}

function formatEnMoneda(monto: number, moneda: "VES" | "USD") {
  return moneda === "USD" ? formatUsd(monto) : formatBs(monto);
}

function Diferencia({ pago }: { pago: PagoPorVerificar }) {
  if (pago.esperado == null || pago.declarado == null) {
    return (
      <span className="text-sm text-muted-foreground">
        {pago.declarado == null ? "Sin monto declarado" : "Sin monto en Bs para comparar"}
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
        "inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap",
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pestana = leerPestana(searchParams.get("tipo"));

  const [pagos, setPagos] = useState<PagoPorVerificar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  // Momento de la última carga: "hace X min" y "el viaje ya salió" sin leer el reloj al renderizar.
  const [ahora, setAhora] = useState(0);
  const [pagoAbierto, setPagoAbierto] = useState<string | null>(null);
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
      console.error(err);
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

  const cambiarPestana = (valor: unknown) => {
    const nueva = leerPestana(typeof valor === "string" ? valor : null);
    const params = new URLSearchParams(searchParams.toString());
    if (nueva === "todos") params.delete("tipo");
    else params.set("tipo", nueva);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const cuenta = (p: Pestana) => (p === "todos" ? pagos.length : pagos.filter((x) => x.tipo_recurso === p).length);
  const visibles = pestana === "todos" ? pagos : pagos.filter((p) => p.tipo_recurso === pestana);

  return (
    <div className="space-y-6 flex flex-col h-full animate-in fade-in duration-300">
      <PageHeader
        title="Pagos por verificar"
        description="Pagos que los clientes registraron desde la app. Compáralos con tu banco antes de aprobar."
      >
        <Button variant="outline" onClick={() => void cargar()} disabled={cargando}>
          <ArrowClockwise className={cn("mr-2", cargando && "animate-spin")} aria-hidden />
          Actualizar
        </Button>
      </PageHeader>

      <Tabs value={pestana} onValueChange={cambiarPestana}>
        <TabsList aria-label="Tipo de pago">
          {PESTANAS.map((p) => (
            <TabsTrigger key={p.id} value={p.id}>
              {p.titulo}
              {!cargando && cuenta(p.id) > 0 && (
                <Badge variant="secondary" className="ml-1 tabular-nums">
                  {cuenta(p.id)}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-md border bg-card">
        {cargando && pagos.length === 0 ? (
          <div className="flex h-40 items-center justify-center gap-3 text-muted-foreground">
            <Spinner size="md" />
            <span className="font-medium">Cargando pagos…</span>
          </div>
        ) : errorCarga && pagos.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 p-4 text-center">
            <p className="text-sm text-destructive-text">{errorCarga}</p>
            <Button variant="outline" size="sm" onClick={() => void cargar()}>
              <ArrowClockwise className="mr-2" aria-hidden />
              Reintentar
            </Button>
          </div>
        ) : visibles.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Todo al día"
            description="No hay pagos por verificar. Cuando un cliente registre un pago desde la app, aparecerá aquí."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Registrado</TableHead>
                <TableHead>Concepto</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Referencia</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead>Diferencia</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acción</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((p) => {
                const tasa: TasaRef | null =
                  p.tasa_bcv && p.tasa_bcv_fecha ? { tasa: Number(p.tasa_bcv), fecha: p.tasa_bcv_fecha } : null;
                const viajeSalio =
                  p.tipo_recurso === "boleto" && !!p.viaje_salida && ahora > 0 && new Date(p.viaje_salida).getTime() < ahora;
                return (
                  <TableRow key={p.pago_id} className="relative hover:bg-muted/50 transition-colors">
                    <CeldaEnlace
                      onAbrir={() => setPagoAbierto(p.pago_id)}
                      etiqueta={`Verificar el pago de ${p.cliente_nombre || "Sin nombre"}`}
                    >
                      <span className="block">{p.cliente_nombre || "Sin nombre"}</span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {[p.cliente_cedula ? formatCedula(p.cliente_cedula) : null, ROL[p.pagador_rol] ?? null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </CeldaEnlace>
                    <TableCell className="whitespace-nowrap">
                      <span className="block text-sm">{ahora > 0 ? haceTiempo(p.creado_at, ahora) : ""}</span>
                      <span className="block text-xs text-muted-foreground">
                        {formatFechaVE(p.creado_at, { day: "2-digit", month: "2-digit", hour: "numeric", minute: "2-digit", hour12: true })}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[18rem]">
                      <span className="block text-sm">{conceptoDePago(p)}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {viajeSalio && (
                          <Badge variant="outline" className="border-warning/40 text-warning-text">
                            El viaje ya salió
                          </Badge>
                        )}
                        {p.recurso_vencido && (
                          <Badge variant="destructive">
                            {p.tipo_recurso === "encomienda" ? "Envío cerrado" : "Boletos vencidos"}
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm">{(p.metodo_tipo && METODO[p.metodo_tipo]) || "Pago digital"}</span>
                      {p.metodo_tipo !== "ZELLE" && p.banco_emisor && (
                        <span className="block text-xs text-muted-foreground">Desde {p.banco_emisor}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{p.numero_referencia || "—"}</span>
                      {p.referencia_repetida && (
                        <span className="mt-1 flex items-center gap-1 text-xs text-warning-text">
                          <Warning weight="fill" className="size-3" aria-hidden />
                          Repetida
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Monto
                        usd={p.monto_usd}
                        bs={p.monto_bs}
                        tasa={tasa}
                        moneda={p.moneda}
                        size="sm"
                        align="right"
                      />
                    </TableCell>
                    <TableCell>
                      <Diferencia pago={p} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        className="relative z-10"
                        onClick={() => setPagoAbierto(p.pago_id)}
                        aria-label={`Verificar el pago de ${p.cliente_nombre || "Sin nombre"}`}
                      >
                        Verificar
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

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
        <div className="flex h-40 items-center justify-center gap-3 text-muted-foreground">
          <Spinner size="md" />
          <span className="font-medium">Cargando pagos…</span>
        </div>
      }
    >
      <BandejaPagos />
    </Suspense>
  );
}
