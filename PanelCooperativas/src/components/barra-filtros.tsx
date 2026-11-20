"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { FunnelSimple, MagnifyingGlass, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FechaField } from "@/components/campos";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCambiarParams, useParamUrl } from "@/hooks/use-param-url";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

// ─── Filtros de una lista, en la URL (§2.1 regla 5, §2.2) ───────────────────
// Etiqueta visible en cada control; la búsqueda escribe `?q=` 300 ms después de
// dejar de teclear (sin botón "Buscar"); "Limpiar filtros" aparece solo si hay
// alguno activo. `children` añade controles propios al final de la barra.
//
// En móvil (< md) la barra se reduce a la búsqueda a ancho completo y un botón
// "Filtros" (con el número de filtros activos) que abre una hoja inferior con el
// resto (selects, fechas y `children`) y los botones "Aplicar" y "Limpiar". La
// URL solo cambia al pulsar "Aplicar". Sin selects, fechas ni `children`, el
// botón no sale.

export type OpcionFiltro = { valor: string; etiqueta: string };

type Busqueda = { etiqueta: string; placeholder?: string; param?: string };
type SelectFiltro = { param: string; etiqueta: string; opciones: OpcionFiltro[]; todas?: string };
type FechaFiltro = { param: string; etiqueta: string };

/** Valor interno de "Todas" en un select (no llega a la URL). */
const TODAS = "__todas__";
const ESPERA_BUSQUEDA_MS = 300;

export function BarraFiltros({
  busqueda,
  selects,
  fechas,
  children,
  className,
  plano = false,
}: {
  busqueda?: Busqueda;
  selects?: SelectFiltro[];
  fechas?: FechaFiltro[];
  children?: ReactNode;
  className?: string;
  /** Sin tarjeta propia: úsalo solo si la barra ya va dentro de una `Card`. */
  plano?: boolean;
}) {
  const searchParams = useSearchParams();
  const cambiar = useCambiarParams();
  const movil = useIsMobile();

  const paramsFiltro = [...(selects ?? []).map((s) => s.param), ...(fechas ?? []).map((f) => f.param)];
  const params = [...(busqueda ? [busqueda.param ?? "q"] : []), ...paramsFiltro];
  const hayActivos = params.some((p) => Boolean(searchParams.get(p)));

  if (movil) {
    return (
      <BarraFiltrosMovil
        busqueda={busqueda}
        selects={selects}
        fechas={fechas}
        paramsFiltro={paramsFiltro}
        className={cn("flex items-end gap-3", !plano && "rounded-xl bg-card p-4 shadow-card", className)}
      >
        {children}
      </BarraFiltrosMovil>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-end gap-4", !plano && "rounded-xl bg-card p-4 shadow-card", className)}>
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

/** Móvil: búsqueda + botón "Filtros" que abre la hoja con el resto. */
function BarraFiltrosMovil({
  busqueda,
  selects,
  fechas,
  paramsFiltro,
  children,
  className,
}: {
  busqueda?: Busqueda;
  selects?: SelectFiltro[];
  fechas?: FechaFiltro[];
  paramsFiltro: string[];
  children?: ReactNode;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const cambiar = useCambiarParams();
  const [abierta, setAbierta] = useState(false);
  // Borrador: la URL solo cambia al pulsar "Aplicar".
  const [borrador, setBorrador] = useState<Record<string, string>>({});

  const hayHoja = paramsFiltro.length > 0 || Boolean(children);
  const activos = paramsFiltro.filter((p) => Boolean(searchParams.get(p))).length;

  const abrir = () => {
    setBorrador(Object.fromEntries(paramsFiltro.map((p) => [p, searchParams.get(p) ?? ""])));
    setAbierta(true);
  };
  const aplicar = () => {
    cambiar(Object.fromEntries(paramsFiltro.map((p) => [p, borrador[p] || null])));
    setAbierta(false);
  };
  const limpiar = () => {
    cambiar(Object.fromEntries(paramsFiltro.map((p) => [p, null])));
    setAbierta(false);
  };
  const poner = (param: string) => (v: string | null) => setBorrador((b) => ({ ...b, [param]: v ?? "" }));

  return (
    <div className={className}>
      {busqueda && <CampoBusqueda {...busqueda} movil />}
      {hayHoja && (
        <>
          <Button type="button" variant="outline" size="lg" className="shrink-0" aria-haspopup="dialog" onClick={abrir}>
            <FunnelSimple aria-hidden />
            Filtros
            {activos > 0 && (
              <span
                className="min-w-5 rounded-full bg-accent-strong px-1.5 text-xs leading-5 font-semibold text-accent-strong-foreground tabular-nums"
                aria-label={`${activos} ${activos === 1 ? "activo" : "activos"}`}
              >
                {activos}
              </span>
            )}
          </Button>
          <Sheet open={abierta} onOpenChange={setAbierta}>
            <SheetContent side="bottom" className="gap-0">
              <SheetHeader>
                <SheetTitle>Filtros</SheetTitle>
                <SheetDescription className="sr-only">Elige los filtros y pulsa Aplicar.</SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-5 px-6 pb-6">
                {selects?.map((s) => (
                  <CampoSelect key={s.param} {...s} valor={borrador[s.param] ?? ""} onCambio={poner(s.param)} />
                ))}
                {fechas?.map((f) => (
                  <CampoFecha key={f.param} {...f} valor={borrador[f.param] ?? ""} onCambio={poner(f.param)} />
                ))}
                {children}
              </div>
              <SheetFooter>
                <Button type="button" variant="outline" size="lg" onClick={limpiar}>
                  Limpiar
                </Button>
                <Button type="button" size="lg" onClick={aplicar}>
                  Aplicar
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  );
}

function CampoBusqueda({
  etiqueta,
  placeholder,
  param = "q",
  movil = false,
}: Busqueda & {
  /** Móvil: ocupa el ancho disponible y la etiqueta queda solo para lectores de pantalla. */
  movil?: boolean;
}) {
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
    <div className={cn("flex w-full flex-col gap-2", movil ? "min-w-0 flex-1" : "md:w-72")}>
      <Label htmlFor={id} className={movil ? "sr-only" : undefined}>
        {etiqueta}
      </Label>
      <div className="relative">
        <MagnifyingGlass
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          value={texto}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          onChange={(e) => setTexto(e.target.value)}
          className="pl-11"
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
  valor: valorControlado,
  onCambio,
}: SelectFiltro & {
  /** Controlado (hoja de filtros móvil): si se pasa, no escribe en la URL. */
  valor?: string;
  onCambio?(v: string | null): void;
}) {
  const id = useId();
  const [valorUrl, setValorUrl] = useParamUrl(param);
  const valor = valorControlado ?? valorUrl;
  const setValor = onCambio ?? setValorUrl;
  const items = { [TODAS]: todas, ...Object.fromEntries(opciones.map((o) => [o.valor, o.etiqueta])) };

  return (
    <div className="flex w-full flex-col gap-2 md:w-44">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select
        value={valor || TODAS}
        onValueChange={(v) => setValor(!v || v === TODAS ? null : String(v))}
        items={items}
      >
        <SelectTrigger id={id} className="w-full">
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

function CampoFecha({
  param,
  etiqueta,
  valor: valorControlado,
  onCambio,
}: FechaFiltro & {
  valor?: string;
  onCambio?(v: string | null): void;
}) {
  const id = useId();
  const [valorUrl, setValorUrl] = useParamUrl(param);
  const valor = valorControlado ?? valorUrl;
  const setValor = onCambio ?? setValorUrl;
  return (
    <FechaField
      id={id}
      label={etiqueta}
      opcional
      atajos={false}
      value={valor}
      onChange={(v) => setValor(v || null)}
      className="w-full md:w-52"
    />
  );
}

// ─── Pestañas que filtran, en la URL (D19) ──────────────────────────────────
// Control segmentado (`TabsList`) cuyo valor vive en `?{param}=`. El contenido
// lo dibuja quien lo usa, leyendo el mismo parámetro con `useParamUrl`. En móvil
// el segmentado se desplaza dentro de su propio ancho si no cabe (nunca la página).

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
    <Tabs
      value={activo}
      onValueChange={(v) => setValor(String(v))}
      className={className}
    >
      <TabsList>
        {opciones.map((o) => (
          <TabsTrigger key={o.valor} value={o.valor} className="group/tab flex-none">
            {o.etiqueta}
            {o.conteo !== undefined && o.conteo > 0 && (
              <span className="min-w-5 rounded-full bg-surface-dark px-1.5 text-xs leading-5 font-semibold text-foreground tabular-nums group-data-active/tab:bg-surface">
                {o.conteo}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
