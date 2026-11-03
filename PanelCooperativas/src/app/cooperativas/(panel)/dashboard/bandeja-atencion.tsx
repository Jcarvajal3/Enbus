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
    <section aria-labelledby="bandeja-titulo" className="flex flex-col gap-3">
      <h2 id="bandeja-titulo" className="text-lg font-semibold">
        Requiere tu atención
      </h2>
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
      <p className="flex items-center gap-2 rounded-md border border-border bg-card p-4 text-sm font-medium text-success-text">
        <CheckCircle className="size-5 shrink-0" weight="fill" aria-hidden />
        Todo al día. Nada pendiente por ahora.
      </p>
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {lista.map(({ clave, href, icono: Icono, titulo, detalle, urgente }) => (
        <li key={clave}>
          <Link
            href={href}
            className={cn(
              "group flex h-full items-start gap-3 rounded-md border bg-card p-4 outline-none motion-safe:transition-colors",
              "focus-visible:ring-[3px] focus-visible:ring-ring/50",
              urgente ? "border-warning/50 hover:border-warning" : "border-border hover:border-input-border"
            )}
          >
            <Icono
              className={cn("mt-0.5 size-5 shrink-0", urgente ? "text-warning-text" : "text-muted-foreground")}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className={cn("text-sm font-medium leading-snug", urgente ? "text-warning-text" : "text-foreground")}>
                {titulo}
              </span>
              <span className="text-sm text-muted-foreground">{detalle}</span>
            </span>
            <ArrowRight
              className="mt-0.5 size-4 shrink-0 text-muted-foreground motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </li>
      ))}
    </ul>
  );
}
