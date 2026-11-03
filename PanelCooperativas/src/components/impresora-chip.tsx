"use client";

import Link from "next/link";
import { useImpresora } from "@/hooks/use-impresora";
import { ICONO_SECCION } from "@/lib/navigation";
import { cn } from "@/lib/utils";

// ─── Estado de la impresora en la barra superior (D23, PN-06) ────────────────
// Verde = conectada · ámbar = reconectando o guardada sin conexión · gris = sin
// impresora en este equipo o navegador sin Bluetooth. Enlaza a "Impresora y lector".
// useImpresora() solo reconecta en silencio la impresora guardada (nunca abre el
// selector del navegador), y el shell lo monta una vez para todo el panel.

const Impresora = ICONO_SECCION.impresora;

export function ImpresoraChip({ className }: { className?: string }) {
  const { estado, nombre } = useImpresora();

  const tono =
    estado === "conectada" ? "exito" : estado === "reconectando" || (estado === "desconectada" && nombre) ? "aviso" : "neutro";

  const detalle =
    estado === "conectada"
      ? `Conectada${nombre ? `: ${nombre}` : ""}`
      : estado === "reconectando"
        ? "Reconectando…"
        : estado === "no-soportado"
          ? "Este navegador no usa impresoras Bluetooth"
          : nombre
            ? `Sin conectar: ${nombre}`
            : "Sin impresora en este equipo";

  return (
    <Link
      href="/cooperativas/hardware"
      title={`Impresora · ${detalle}`}
      aria-label={`Impresora: ${detalle}. Abrir Impresora y lector`}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        tono === "aviso"
          ? "border-warning/40 bg-warning-light text-warning-deep hover:border-warning/70"
          : "border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          tono === "exito" ? "bg-success" : tono === "aviso" ? "bg-warning" : "bg-muted-foreground/60"
        )}
      />
      {/* En teléfono, solo el icono (el texto completo queda en el title y el aria-label). */}
      <Impresora className="size-4 sm:hidden" aria-hidden />
      <span className="hidden sm:inline">Impresora</span>
    </Link>
  );
}
