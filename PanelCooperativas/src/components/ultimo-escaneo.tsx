"use client";

// ─── Último escaneo (#43, PC-19) ─────────────────────────────────────────────
// Panel fijo junto al campo de escaneo con el resultado del último código:
// icono y color por tono, título, detalle y el código en monoespaciada.
// `registrar` guarda el resultado y suena (lib/sonido), así el taquillero sabe
// qué pasó sin mirar la pantalla.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Warning, XCircle, Barcode, type Icon } from "@phosphor-icons/react";
import { reproducirSonido } from "@/lib/sonido";
import { formatHoraVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

export type ResultadoEscaneo = {
  codigo: string;
  tono: "exito" | "error" | "aviso";
  titulo: string;
  detalle?: string;
  at: number;
};

/** Estado del último escaneo de la pantalla; `registrar` también suena según el tono. */
export function useUltimoEscaneo(): {
  ultimo: ResultadoEscaneo | null;
  registrar(r: Omit<ResultadoEscaneo, "at">): void;
} {
  const [ultimo, setUltimo] = useState<ResultadoEscaneo | null>(null);
  const registrar = useCallback((r: Omit<ResultadoEscaneo, "at">) => {
    setUltimo({ ...r, at: Date.now() });
    reproducirSonido(r.tono);
  }, []);
  return { ultimo, registrar };
}

const TONOS: Record<ResultadoEscaneo["tono"], { icono: Icon; caja: string; icon: string; lector: string }> = {
  exito: {
    icono: CheckCircle,
    caja: "border-success/40 bg-success-light text-success-deep",
    icon: "text-success-deep",
    lector: "Correcto",
  },
  error: {
    icono: XCircle,
    caja: "border-destructive/40 bg-destructive-light text-destructive-deep",
    icon: "text-destructive-deep",
    lector: "Error",
  },
  aviso: {
    icono: Warning,
    caja: "border-warning/40 bg-warning-light text-warning-deep",
    icon: "text-warning-deep",
    lector: "Atención",
  },
};

/** "ahora mismo", "hace 5 s", "hace 3 min", "a las 8:30 p. m.". */
function haceCuanto(at: number, ahora: number): string {
  const s = Math.max(0, Math.floor((ahora - at) / 1000));
  if (s < 1) return "ahora mismo";
  if (s < 60) return `hace ${s} s`;
  const min = Math.floor(s / 60);
  if (min < 60) return `hace ${min} min`;
  return `a las ${formatHoraVE(at)}`;
}

/** Reloj que avanza cada segundo mientras haya un resultado (0 antes del primer tic). */
function useAhora(activo: boolean, desde: number | undefined) {
  const [ahora, setAhora] = useState(0);
  useEffect(() => {
    if (!activo) return;
    const tic = () => setAhora(Date.now());
    const primero = window.setTimeout(tic, 0);
    const id = window.setInterval(tic, 1000);
    return () => {
      window.clearTimeout(primero);
      window.clearInterval(id);
    };
  }, [activo, desde]);
  return ahora;
}

export function UltimoEscaneo({
  resultado,
  className,
}: {
  resultado: ResultadoEscaneo | null;
  className?: string;
}) {
  const ahora = useAhora(Boolean(resultado), resultado?.at);
  const estilo = resultado ? TONOS[resultado.tono] : null;
  const Icono = estilo?.icono ?? Barcode;

  return (
    <section
      aria-label="Último escaneo"
      className={cn(
        "rounded-xl border p-3 text-sm",
        estilo ? estilo.caja : "border-dashed border-border bg-muted/40 text-muted-foreground",
        className
      )}
    >
      {/* La hora relativa queda fuera de la región viva: no se anuncia cada segundo. */}
      <p className="mb-1.5 text-xs font-medium opacity-90">
        Último escaneo
        {resultado && ahora > 0 && <span> · {haceCuanto(resultado.at, ahora)}</span>}
      </p>
      <div aria-live="polite" aria-atomic="true">
        {resultado && estilo ? (
          <div
            key={resultado.at}
            className="flex items-start gap-2.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200"
          >
            <Icono className={cn("mt-0.5 size-6 shrink-0", estilo.icon)} weight="fill" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold leading-snug">
                <span className="sr-only">{estilo.lector}: </span>
                {resultado.titulo}
              </p>
              {resultado.detalle && <p className="leading-snug">{resultado.detalle}</p>}
              {resultado.codigo && (
                <p className="mt-1 truncate font-mono text-xs tracking-wide" title={resultado.codigo}>
                  <span className="sr-only">Código: </span>
                  {resultado.codigo}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <Icono className="size-5 shrink-0" aria-hidden />
            <p>Aún no has escaneado nada.</p>
          </div>
        )}
      </div>
    </section>
  );
}
