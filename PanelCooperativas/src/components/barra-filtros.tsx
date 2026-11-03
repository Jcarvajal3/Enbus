"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// ─── Filtros de una lista, en la URL (§2.1 regla 5, §2.2) ───────────────────
// Etiqueta visible en cada control; la búsqueda escribe `?q=` 300 ms después de
// dejar de teclear (sin botón "Buscar"); "Limpiar filtros" aparece solo si hay
// alguno activo. `children` añade controles propios al final de la barra.

export type OpcionFiltro = { valor: string; etiqueta: string };

/** Valor interno de "Todas" en un select (no llega a la URL). */
const TODAS = "__todas__";
const ESPERA_BUSQUEDA_MS = 300;

export function BarraFiltros({
  busqueda,
  selects,
  fechas,
  children,
  className,
}: {
  busqueda?: { etiqueta: string; placeholder?: string; param?: string };
  selects?: Array<{ param: string; etiqueta: string; opciones: OpcionFiltro[]; todas?: string }>;
  fechas?: Array<{ param: string; etiqueta: string }>;
  children?: ReactNode;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const cambiar = useCambiarParams();

  const params = [
    ...(busqueda ? [busqueda.param ?? "q"] : []),
    ...(selects ?? []).map((s) => s.param),
    ...(fechas ?? []).map((f) => f.param),
  ];
  const hayActivos = params.some((p) => Boolean(searchParams.get(p)));

  return (
    <div className={cn("flex flex-wrap items-end gap-3", className)}>
      {busqueda && <CampoBusqueda {...busqueda} />}
      {selects?.map((s) => <CampoSelect key={s.param} {...s} />)}
      {fechas?.map((f) => <CampoFecha key={f.param} {...f} />)}
      {children}
      {hayActivos && (
        <Button
          type="button"
          variant="ghost"
          onClick={() => cambiar(Object.fromEntries(params.map((p) => [p, null])))}
        >
          <X aria-hidden />
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}

function CampoBusqueda({ etiqueta, placeholder, param = "q" }: { etiqueta: string; placeholder?: string; param?: string }) {
  const id = useId();
  const [valorUrl, setValorUrl] = useParamUrl(param);
  const [texto, setTexto] = useState(valorUrl);
  const ultimoEnviado = useRef(valorUrl);

  // Si la URL cambia desde fuera ("Limpiar filtros", Atrás), el campo la sigue.
  useEffect(() => {
    if (valorUrl !== ultimoEnviado.current) {
      ultimoEnviado.current = valorUrl;
      setTexto(valorUrl);
    }
  }, [valorUrl]);

  useEffect(() => {
    const limpio = texto.trim();
    if (limpio === ultimoEnviado.current) return;
    const t = setTimeout(() => {
      ultimoEnviado.current = limpio;
      setValorUrl(limpio || null);
    }, ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(t);
  }, [texto, setValorUrl]);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-72">
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="relative">
        <MagnifyingGlass
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          type="search"
          value={texto}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setTexto(e.target.value)}
          className="pl-9 text-sm md:text-sm"
        />
      </div>
    </div>
  );
}

function CampoSelect({
  param,
  etiqueta,
  opciones,
  todas = "Todas",
}: {
  param: string;
  etiqueta: string;
  opciones: OpcionFiltro[];
  todas?: string;
}) {
  const id = useId();
  const [valor, setValor] = useParamUrl(param);
  const items = { [TODAS]: todas, ...Object.fromEntries(opciones.map((o) => [o.valor, o.etiqueta])) };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-44">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select
        value={valor || TODAS}
        onValueChange={(v) => setValor(!v || v === TODAS ? null : String(v))}
        items={items}
      >
        <SelectTrigger id={id} className="h-9 w-full text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>{todas}</SelectItem>
          {opciones.map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CampoFecha({ param, etiqueta }: { param: string; etiqueta: string }) {
  const id = useId();
  const [valor, setValor] = useParamUrl(param);
  return (
    <div className="flex w-full flex-col gap-2 sm:w-44">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input
        id={id}
        type="date"
        value={valor}
        onChange={(e) => setValor(e.target.value || null)}
        className="text-sm tabular-nums md:text-sm"
      />
    </div>
  );
}

// ─── Pestañas que filtran, en la URL (D19) ──────────────────────────────────
// Control segmentado (`TabsList`) cuyo valor vive en `?{param}=`. El contenido
// lo dibuja quien lo usa, leyendo el mismo parámetro con `useParamUrl`.

export function TabsUrl({
  param,
  defecto,
  opciones,
  className,
}: {
  param: string;
  defecto: string;
  opciones: Array<{ valor: string; etiqueta: string; conteo?: number }>;
  className?: string;
}) {
  const [valor, setValor] = useParamUrl(param, defecto);
  const activo = opciones.some((o) => o.valor === valor) ? valor : defecto;

  return (
    <Tabs value={activo} onValueChange={(v) => setValor(String(v))} className={className}>
      <TabsList>
        {opciones.map((o) => (
          <TabsTrigger key={o.valor} value={o.valor} className="group/tab flex-none">
            {o.etiqueta}
            {o.conteo !== undefined && o.conteo > 0 && (
              <span className="min-w-5 rounded-full bg-background px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums group-data-active/tab:bg-muted">
                {o.conteo}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
