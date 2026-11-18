"use client";

// ─── "Requiere tu atención" (#51, PC-14) ─────────────────────────────────────
// Lo pendiente de la cooperativa en una lista de enlaces. Solo aparecen las
// tarjetas con algo por hacer; los datos llegan del servidor en el primer render
// y "Reintentar" los vuelve a pedir con la server action.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle } from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import { ErrorState } from "@/components/error-state";
import { IconTile } from "@/components/icon-tile";
import { EntityCard } from "@/components/entity-card";
import { SectionLabel } from "@/components/section-label";
import { Card } from "@/components/ui/card";
import { MSG } from "@/lib/errores";
import { Monto } from "@/components/monto";
import { fechaVE, formatFechaVE, formatHoraVE, hoyVE, sumarDiasVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { ICONO_SECCION } from "@/lib/navigation";
import type { BandejaCooperativa, ProximaSalida } from "@/lib/types/operacion";
import { cn } from "@/lib/utils";
import { cargarBandeja, type ResultadoBandeja } from "./actions";

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

/** "en 25 min" · "hoy a las 3:30 p. m." · "mañana a las 7:00 a. m." · "el 05/10 a las 7:00 a. m." */
export function cuandoSale(p: Pick<ProximaSalida, "salida" | "minutos_para_salir">): string {
  const m = p.minutos_para_salir;
  if (m < 0) return `debía salir hace ${plural(-m, "1 min", "{n} min")}`;
  if (m === 0) return "ahora";
  if (m < 60) return `en ${m} min`;
  const dia = fechaVE(p.salida);
  const hoy = hoyVE();
  const hora = formatHoraVE(p.salida);
  if (dia === hoy) return `hoy a las ${hora}`;
  if (dia === sumarDiasVE(hoy, 1)) return `mañana a las ${hora}`;
  return `el ${formatFechaVE(p.salida, { day: "2-digit", month: "2-digit" })} a las ${hora}`;
}

type Tarjeta = {
  clave: string;
  href: string;
  icono: Icon;
  titulo: string;
  detalle: ReactNode;
  /** Tono de aviso (algo vence pronto). */
  urgente?: boolean;
};

function tarjetas(b: BandejaCooperativa): Tarjeta[] {
  const lista: Tarjeta[] = [];
  if (b.pagos_por_verificar > 0) {
    lista.push({
      clave: "pagos",
      href: "/cooperativas/pagos",
      icono: ICONO_SECCION.pagos,
      titulo: plural(b.pagos_por_verificar, "1 pago por verificar", "{n} pagos por verificar"),
      detalle: "Compáralos con tu banco y verifícalos.",
    });
  }
  if (b.reembolsos_por_devolver > 0) {
    lista.push({
      clave: "reembolsos",
      href: "/cooperativas/reembolsos",
      icono: ICONO_SECCION.reembolsos,
      titulo: plural(b.reembolsos_por_devolver, "1 reembolso por devolver", "{n} reembolsos por devolver"),
      detalle: <Monto usd={b.reembolsos_usd} size="sm" />,
    });
  }
  if (b.encomiendas_por_vencer > 0) {
    const d = b.dias_minimos_para_devolucion;
    lista.push({
      clave: "vencer",
      href: "/cooperativas/entrega",
      icono: ICONO_SECCION.entrega,
      titulo: plural(
        b.encomiendas_por_vencer,
        "1 encomienda con 3 o más días en tu oficina",
        "{n} encomiendas con 3 o más días en tu oficina"
      ),
      detalle:
        d <= 0
          ? "Hoy vuelven al remitente si nadie las retira."
          : `La primera vuelve al remitente en ${plural(d, "1 día hábil", "{n} días hábiles")}.`,
      urgente: true,
    });
  }
  if (b.encomiendas_por_despachar > 0) {
    lista.push({
      clave: "despachar",
      // PN-15: la lista de lo que está pagado y por despachar vive en Taquilla de encomiendas.
      href: "/cooperativas/taquilla/encomiendas?estado=PAGADA",
      icono: ICONO_SECCION.taquillaEncomiendas,
      titulo: plural(
        b.encomiendas_por_despachar,
        "1 encomienda lista para despachar",
        "{n} encomiendas listas para despachar"
      ),
      detalle: "Súbelas al próximo bus de su ruta.",
    });
  }
  if (b.encomiendas_en_camino > 0) {
    lista.push({
      clave: "camino",
      href: "/cooperativas/recepcion-destino",
      icono: ICONO_SECCION.recepcion,
      titulo: plural(
        b.encomiendas_en_camino,
        "1 encomienda en camino a tu oficina",
        "{n} encomiendas en camino a tu oficina"
      ),
      detalle: "Recíbelas cuando llegue el bus.",
    });
  }
  const p = b.proxima_salida;
  if (p) {
    lista.push({
      clave: "salida",
      href: `/cooperativas/despacho?viaje=${encodeURIComponent(p.viaje_id)}`,
      icono: ICONO_SECCION.despacho,
      titulo: `Próxima salida: ${formatCiudad(p.ciudad_origen)} → ${formatCiudad(p.ciudad_destino)} ${cuandoSale(p)}`,
      detalle: [
        plural(p.boletos_vendidos, "1 boleto vendido", "{n} boletos vendidos"),
        plural(p.asientos_disponibles, "1 asiento libre", "{n} asientos libres"),
        plural(p.encomiendas_por_despachar, "1 encomienda por despachar", "{n} encomiendas por despachar"),
      ].join(" · "),
    });
  }
  return lista;
}

export function BandejaAtencion({ inicial }: { inicial: ResultadoBandeja }) {
  const [resultado, setResultado] = useState<ResultadoBandeja>(inicial);

  const reintentar = async () => {
    try {
      setResultado(await cargarBandeja());
    } catch {
      setResultado({ ok: false, error: MSG.sinRed });
    }
  };

  return (
    <section aria-label="Requiere tu atención" className="flex flex-col gap-4">
      <SectionLabel>Requiere tu atención</SectionLabel>
      {!resultado.ok ? (
        <ErrorState
          compacto
          titulo="No pudimos cargar tus pendientes"
          descripcion={resultado.error}
          onReintentar={reintentar}
        />
      ) : (
        <ListaTarjetas bandeja={resultado.data} />
      )}
    </section>
  );
}

function ListaTarjetas({ bandeja }: { bandeja: BandejaCooperativa }) {
  const lista = tarjetas(bandeja);
  if (lista.length === 0) {
    return (
      <Card className="flex-row items-center gap-4 px-5 py-5">
        <IconTile icon={CheckCircle} tone="success" />
        <p className="text-[15px] font-medium text-foreground">Todo al día. Nada pendiente por ahora.</p>
      </Card>
    );
  }
  return (
    <>
      {/* Móvil: cada pendiente es una EntityCard tocable. */}
      <ul role="list" aria-label="Requiere tu atención" className="flex flex-col gap-3 md:hidden">
        {lista.map(({ clave, href, icono: Icono, titulo, detalle, urgente }) => (
          <li key={clave}>
            <EntityCard
              href={href}
              leading={<IconTile icon={Icono} tone={urgente ? "warning" : "sky"} />}
              title={titulo}
              subtitle={typeof detalle === "string" ? detalle : undefined}
              adorno={typeof detalle === "string" ? undefined : detalle}
              lineasSubtitulo={2}
              etiqueta={typeof detalle === "string" ? `${titulo}. ${detalle}` : titulo}
              className={cn(urgente && "ring-1 ring-warning/40")}
            />
          </li>
        ))}
      </ul>
      <ul className="hidden gap-4 md:grid md:grid-cols-2 xl:grid-cols-3">
        {lista.map(({ clave, href, icono: Icono, titulo, detalle, urgente }) => (
          <li key={clave}>
            <Link
              href={href}
              className="group block h-full rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-accent-strong/30"
            >
              <Card
                className={cn(
                  "h-full flex-row items-start gap-4 px-5 py-5 motion-safe:transition-shadow group-hover:shadow-raised",
                  urgente && "ring-1 ring-warning/40"
                )}
              >
                <IconTile icon={Icono} tone={urgente ? "warning" : "sky"} />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className={cn("text-[15px] leading-snug font-semibold", urgente ? "text-warning-text" : "text-foreground")}>
                    {titulo}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{detalle}</span>
                </span>
                <ArrowRight
                  className="mt-1 size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
