"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DotsThree, PencilSimple, Plus, Prohibit, ArrowCounterClockwise } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvisoError } from "@/components/aviso-error";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { ESTADOS_VENEZUELA, CIUDADES_POR_ESTADO } from "@/lib/data/venezuela";
import { guardarRuta, toggleActivaRuta, checkDesactivarRuta } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireOnline } from "@/components/connectivity-banner";
import { Monto } from "@/components/monto";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { formatBs, formatUsd, usdABs } from "@/lib/dinero";
import { avisarError, avisarExito } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { formatDuracion } from "@/lib/fechas";
import { formatCiudad, mismaCiudad, terminalVE, terminalesParaSalir } from "@/lib/ciudades";
import { ICONO_SECCION } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { CeldaEnlace } from "@/components/celda-enlace";

/** Fila de `rutas` que usa esta pantalla. */
export type Ruta = {
  id: string;
  estado_origen: string;
  ciudad_origen: string;
  estado_destino: string;
  ciudad_destino: string;
  /** Terminal o parada de salida (nombre del catálogo); null si no se indicó (20261110000002). */
  terminal_origen?: string | null;
  /** Terminal o parada de llegada (nombre del catálogo); null si no se indicó (20261110000003). */
  terminal_destino?: string | null;
  precio_pasaje: number | string | null;
  duracion_estimada_min: number | null;
  activa: boolean;
};

const MSG_MISMA_CIUDAD = "El origen y el destino deben ser ciudades distintas.";

/** Valor del selector de terminal para "Sin indicar" (las claves del catálogo nunca llevan guiones). */
const SIN_TERMINAL = "-";

/** El terminal que viene elegido para una ciudad: el único que tenga, o ninguno si tiene varios. */
function terminalPorDefecto(ciudad: string, estado: string): string {
  const propios = ciudad ? terminalesParaSalir(ciudad, estado).ciudad : [];
  return propios.length === 1 ? propios[0].clave : SIN_TERMINAL;
}

/** "8" → 8; vacío → 0; NaN si no es un entero. */
function entero(texto: string): number {
  const t = texto.trim();
  if (t === "") return 0;
  return /^\d+$/.test(t) ? Number(t) : NaN;
}

/** Error de la duración (o null): horas 0–48, minutos 0–59, total mayor que 0. */
function errorDuracion(horas: string, minutos: string): string | null {
  const h = entero(horas);
  const m = entero(minutos);
  if (!Number.isFinite(h) || h > 48) return "Las horas van de 0 a 48.";
  if (!Number.isFinite(m) || m > 59) return "Los minutos van de 0 a 59.";
  if (h * 60 + m <= 0) return "Escribe cuánto dura el viaje, por ejemplo 8 h 30 min.";
  return null;
}

/** Por encima de este precio (USD) se pide confirmar que no se escribió en bolívares. */
const PRECIO_ALTO_USD = 500;

/** "15,50" | "15.50" | "1.250,00" -> número (NaN si no es válido). */
function leerPrecio(texto: string): number {
  const limpio = texto.trim().replace(/\s/g, "");
  if (!limpio) return NaN;
  // El último separador es el decimal: "1.234,56" y "1,234.56" -> 1234.56.
  const normalizado =
    limpio.lastIndexOf(",") > limpio.lastIndexOf(".") ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(normalizado) ? Number(normalizado) : NaN;
}

/**
 * Selector de terminal de una ciudad: "Sin indicar", los de la ciudad y luego los demás de su
 * estado (para ciudades sin terminal propio, como Lechería o Cabudare).
 */
function SelectorTerminal({
  id,
  etiqueta,
  ciudad,
  estado,
  valor,
  onCambio,
  invalido,
}: {
  id: string;
  etiqueta: string;
  ciudad: string;
  estado: string;
  valor: string;
  onCambio(clave: string): void;
  invalido: boolean;
}) {
  const terminales = useMemo(() => terminalesParaSalir(ciudad, estado), [ciudad, estado]);
  const opciones = [
    { value: SIN_TERMINAL, label: "Sin indicar" },
    ...[...terminales.ciudad, ...terminales.estado].map((t) => ({ value: t.clave, label: t.nombre })),
  ];
  const nombreCiudad = formatCiudad(ciudad);

  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Select value={valor} onValueChange={(val) => onCambio(val ?? SIN_TERMINAL)} items={opciones}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={invalido ? true : undefined}
          aria-describedby={`${id}-ayuda`}
        >
          <SelectValue placeholder="Elige el terminal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SIN_TERMINAL}>Sin indicar</SelectItem>
          {terminales.ciudad.length > 0 && (
            <SelectGroup>
              <SelectLabel>En {nombreCiudad}</SelectLabel>
              {terminales.ciudad.map((t) => (
                <SelectItem key={t.clave} value={t.clave}>
                  {t.nombre}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          {terminales.estado.length > 0 && (
            <SelectGroup>
              <SelectLabel>{terminales.ciudad.length > 0 ? "Otros cerca" : `Cerca de ${nombreCiudad}`}</SelectLabel>
              {terminales.estado.map((t) => (
                <SelectItem key={t.clave} value={t.clave}>
                  {t.nombre} · {formatCiudad(t.ciudad)}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>
      <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">
        {terminales.ciudad.length + terminales.estado.length === 0
          ? `Aún no tenemos terminales de ${nombreCiudad}: queda sin indicar.`
          : "Los pasajeros lo verán al buscar los viajes de esta ruta."}
      </p>
    </div>
  );
}

/** "Sale de Terminal La Bandera · Llega a Terminal de Maracaibo" (o la mitad que haya). */
function textoTerminales(ruta: Pick<Ruta, "terminal_origen" | "terminal_destino">): string {
  return [
    ruta.terminal_origen ? `Sale de ${ruta.terminal_origen}` : null,
    ruta.terminal_destino ? `Llega a ${ruta.terminal_destino}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function NombreRuta({ ruta }: { ruta: Ruta }) {
  return (
    <span className="flex flex-col">
      <span>
        {formatCiudad(ruta.ciudad_origen)} → {formatCiudad(ruta.ciudad_destino)}
      </span>
      <span className="text-xs font-normal text-muted-foreground">
        {formatCiudad(ruta.estado_origen)} → {formatCiudad(ruta.estado_destino)}
      </span>
      {textoTerminales(ruta) && (
        <span className="text-xs font-normal text-muted-foreground">{textoTerminales(ruta)}</span>
      )}
      {/* En teléfono, la duración y el estado van aquí (sus columnas se ocultan). */}
      <span className="text-xs font-normal text-muted-foreground sm:hidden">
        {formatDuracion(Number(ruta.duracion_estimada_min) || 0)}
        {!ruta.activa && " · Inactiva"}
      </span>
    </span>
  );
}

export function RutasClient({ rutas, errorCarga }: { rutas: Ruta[]; errorCarga: string | null }) {
  const router = useRouter();
  const uid = useId();
  const { visibles, pagina, paginas, ir } = usePaginacion(rutas);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRuta, setEditingRuta] = useState<Ruta | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activaSwitch, setActivaSwitch] = useState(true);

  // Desactivar una ruta con viajes programados (con confirmación)
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertData, setAlertData] = useState<{ id: string; count: number; nombre: string } | null>(null);

  // Form states
  const [estadoOrigen, setEstadoOrigen] = useState<string>("");
  const [ciudadOrigen, setCiudadOrigen] = useState<string>("");
  const [estadoDestino, setEstadoDestino] = useState<string>("");
  const [ciudadDestino, setCiudadDestino] = useState<string>("");
  // Terminales de salida y de llegada (opcionales): del catálogo, en la ciudad o en su estado.
  const [terminal, setTerminal] = useState<string>(SIN_TERMINAL);
  const [terminalDestino, setTerminalDestino] = useState<string>(SIN_TERMINAL);
  // Duración en dos campos (se guarda en minutos)
  const [horas, setHoras] = useState<string>("");
  const [minutos, setMinutos] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<"duracion" | "destino" | "terminal" | "terminal_destino" | null>(null);
  // Precio en USD (texto controlado para mostrar el equivalente en Bs mientras se escribe)
  const [precioTexto, setPrecioTexto] = useState<string>("");
  // Formulario en espera de confirmar un precio muy alto (¿escrito en Bs?)
  const [precioAltoPendiente, setPrecioAltoPendiente] = useState<FormData | null>(null);

  const tasa = useTasaBCV();
  const precioUsd = leerPrecio(precioTexto);
  const precioValido = Number.isFinite(precioUsd) && precioUsd > 0;
  const precioAltoUsd = precioAltoPendiente ? leerPrecio(String(precioAltoPendiente.get("precio_pasaje") ?? "")) : NaN;

  /** Quita el aviso de error si era de alguno de estos campos. */
  function limpiarError(...campos: NonNullable<typeof errorCampo>[]) {
    if (errorCampo && campos.includes(errorCampo)) {
      setFormError(null);
      setErrorCampo(null);
    }
  }

  // Si la ciudad tiene un solo terminal, ya viene elegido; si no, se elige a mano.
  function elegirCiudadOrigen(ciudad: string) {
    setCiudadOrigen(ciudad);
    setTerminal(terminalPorDefecto(ciudad, estadoOrigen));
    limpiarError("destino", "terminal");
  }

  function elegirCiudadDestino(ciudad: string) {
    setCiudadDestino(ciudad);
    setTerminalDestino(terminalPorDefecto(ciudad, estadoDestino));
    limpiarError("destino", "terminal_destino");
  }

  function openCreateModal() {
    setEditingRuta(null);
    setEstadoOrigen("");
    setCiudadOrigen("");
    setTerminal(SIN_TERMINAL);
    setEstadoDestino("");
    setCiudadDestino("");
    setTerminalDestino(SIN_TERMINAL);
    setPrecioTexto("");
    setHoras("");
    setMinutos("");
    setFormError(null);
    setErrorCampo(null);
    setActivaSwitch(true);
    setIsModalOpen(true);
  }

  function openEditModal(ruta: Ruta) {
    setEditingRuta(ruta);
    setEstadoOrigen(ruta.estado_origen);
    setCiudadOrigen(ruta.ciudad_origen);
    setTerminal(terminalVE(ruta.terminal_origen)?.clave ?? SIN_TERMINAL);
    setEstadoDestino(ruta.estado_destino);
    setCiudadDestino(ruta.ciudad_destino);
    setTerminalDestino(terminalVE(ruta.terminal_destino)?.clave ?? SIN_TERMINAL);
    setPrecioTexto(ruta.precio_pasaje != null ? String(ruta.precio_pasaje) : "");
    const total = Number(ruta.duracion_estimada_min) || 0;
    setHoras(total > 0 ? String(Math.floor(total / 60)) : "");
    setMinutos(total > 0 ? String(total % 60) : "");
    setFormError(null);
    setErrorCampo(null);
    setActivaSwitch(ruta.activa);
    setIsModalOpen(true);
  }

  async function handleToggleRuta(ruta: Ruta) {
    if (ruta.activa) {
      // Intento de desactivar
      startTransition(async () => {
        try {
          const check = await checkDesactivarRuta(ruta.id);
          if (check.error) {
            avisarError(check.error);
            return;
          }
          if (check.hasViajes) {
            setAlertData({
              id: ruta.id,
              count: check.count,
              nombre: `${formatCity(ruta.ciudad_origen)} → ${formatCity(ruta.ciudad_destino)}`,
            });
            setAlertOpen(true);
          } else {
            // desactivar seguro
            const res = await requireOnline(() => toggleActivaRuta(ruta.id, false))();
            if (res.error) avisarError(res.error);
            else avisarExito(`Ruta ${formatCity(ruta.ciudad_origen)} → ${formatCity(ruta.ciudad_destino)} desactivada.`);
          }
        } catch (err) {
          avisarError(humanizeError(err, "desactivar la ruta"));
        }
      });
    } else {
      // reactivar
      startTransition(async () => {
        try {
          const res = await requireOnline(() => toggleActivaRuta(ruta.id, true))();
          if (res.error) avisarError(res.error);
          else avisarExito(`Ruta ${formatCity(ruta.ciudad_origen)} → ${formatCity(ruta.ciudad_destino)} reactivada.`);
        } catch (err) {
          avisarError(humanizeError(err, "reactivar la ruta"));
        }
      });
    }
  }

  async function forceDesactivar() {
    if (!alertData) return { ok: false, error: "No encontramos la ruta. Actualiza la página." };
    try {
      const res = await requireOnline(() => toggleActivaRuta(alertData.id, false))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "desactivar la ruta") };
    }
    avisarExito(`Ruta ${alertData.nombre} desactivada.`);
    return { ok: true };
  }

  function guardar(formData: FormData) {
    startTransition(async () => {
      try {
        // Inject activa from controlled state since shadcn Switch with checked= won't add to FormData
        formData.set("activa", activaSwitch ? "on" : "off");
        // Vacío = sin terminal indicado.
        formData.set("terminal", terminal === SIN_TERMINAL ? "" : terminal);
        formData.set("terminal_destino", terminalDestino === SIN_TERMINAL ? "" : terminalDestino);
        const res = await requireOnline(() => guardarRuta(formData, editingRuta?.id))();
        if (res.error) {
          setFormError(res.error);
          setErrorCampo("campo" in res && res.campo ? res.campo : null);
        } else {
          avisarExito(editingRuta ? "Ruta actualizada." : "Ruta creada.");
          setIsModalOpen(false);
        }
      } catch (err) {
        setFormError(humanizeError(err, "guardar la ruta"));
      }
    });
  }

  function handleSubmit(formData: FormData) {
    setFormError(null);
    setErrorCampo(null);
    if (ciudadOrigen && ciudadDestino && mismaCiudad(ciudadOrigen, ciudadDestino)) {
      setFormError(MSG_MISMA_CIUDAD);
      setErrorCampo("destino");
      return;
    }
    const errDur = errorDuracion(horas, minutos);
    if (errDur) {
      setFormError(errDur);
      setErrorCampo("duracion");
      document.getElementById(`${uid}-horas`)?.focus();
      return;
    }
    const precio = leerPrecio(String(formData.get("precio_pasaje") ?? ""));
    // Un precio muy alto suele ser un monto en bolívares escrito por error: pedir confirmación.
    if (Number.isFinite(precio) && precio > PRECIO_ALTO_USD) {
      setPrecioAltoPendiente(formData);
      return;
    }
    guardar(formData);
  }

  async function confirmarPrecioAlto() {
    const formData = precioAltoPendiente;
    setPrecioAltoPendiente(null);
    if (formData) guardar(formData);
    return { ok: true };
  }

  const formatCity = (val: string | undefined) => formatCiudad(val);
  const nombreRuta = (ruta: Ruta) => `${formatCity(ruta.ciudad_origen)} → ${formatCity(ruta.ciudad_destino)}`;
  const mismaSeleccion = Boolean(ciudadOrigen && ciudadDestino && mismaCiudad(ciudadOrigen, ciudadDestino));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Rutas" description="Duración y precio del pasaje en USD.">
        {rutas.length > 0 && (
          <Button onClick={openCreateModal}>
            <Plus aria-hidden />
            Crear ruta
          </Button>
        )}
      </PageHeader>

      {errorCarga ? (
        <Card className="p-0">
          <ErrorState titulo="No pudimos cargar las rutas" descripcion={errorCarga} onReintentar={() => router.refresh()} />
        </Card>
      ) : rutas.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ICONO_SECCION.rutas}
            title="Todavía no tienes rutas"
            description="Crea una con su duración y su precio para programar viajes."
            action={
              <Button onClick={openCreateModal}>
                <Plus aria-hidden />
                Crear ruta
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ruta</TableHead>
                <TableHead className="hidden sm:table-cell">Duración</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((ruta) => (
                <TableRow key={ruta.id} className={cn("relative", !ruta.activa && "text-muted-foreground")}>
                  <CeldaEnlace
                    onAbrir={() => openEditModal(ruta)}
                    etiqueta={`Editar ruta ${nombreRuta(ruta)}`}
                    className="whitespace-normal"
                  >
                    <NombreRuta ruta={ruta} />
                  </CeldaEnlace>
                  <TableCell className="hidden tabular-nums sm:table-cell">{formatDuracion(Number(ruta.duracion_estimada_min) || 0)}</TableCell>
                  <TableCell className="text-right">
                    <Monto usd={Number(ruta.precio_pasaje)} size="sm" align="right" className="hidden sm:inline-flex" />
                    {/* En teléfono, solo el precio de referencia: la fila cabe sin desplazarse. */}
                    <span className="text-sm font-medium tabular-nums sm:hidden">{formatUsd(Number(ruta.precio_pasaje))}</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge status={ruta.activa ? "ACTIVO" : "INACTIVO"} dominio="recurso" />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative z-10")}
                        aria-label={`Más acciones de la ruta ${nombreRuta(ruta)}`}
                      >
                        <DotsThree aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditModal(ruta)}>
                          <PencilSimple aria-hidden />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleToggleRuta(ruta)}
                          className={ruta.activa ? "text-destructive-text focus:text-destructive-text" : undefined}
                        >
                          {ruta.activa ? <Prohibit aria-hidden /> : <ArrowCounterClockwise aria-hidden />}
                          {ruta.activa ? "Desactivar ruta" : "Reactivar ruta"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginacionTabla pagina={pagina} paginas={paginas} onCambio={ir} />
        </Card>
      )}

      <Dialog open={isModalOpen} onOpenChange={(abierto) => !isPending && setIsModalOpen(abierto)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRuta ? "Editar ruta" : "Crear ruta"}</DialogTitle>
          </DialogHeader>

          {/* onSubmit (no `action`): React no reinicia el formulario si hay error o se pide confirmar el precio. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit(new FormData(e.currentTarget));
            }}
            className="flex flex-col gap-6"
          >
            <div className="grid gap-4">
              {formError && <AvisoError>{formError}</AvisoError>}
              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-estado-origen`}>Estado de origen</Label>
                  <Select name="estado_origen" value={estadoOrigen} onValueChange={(val) => { setEstadoOrigen(val ?? ""); setCiudadOrigen(""); setTerminal(SIN_TERMINAL); }} required>
                    <SelectTrigger id={`${uid}-estado-origen`} className="w-full"><SelectValue placeholder="Elige el estado" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_VENEZUELA.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-ciudad-origen`}>Ciudad de origen</Label>
                  <Select name="ciudad_origen" value={ciudadOrigen} onValueChange={(val) => elegirCiudadOrigen(val ?? "")} disabled={!estadoOrigen} required>
                    <SelectTrigger id={`${uid}-ciudad-origen`} className="w-full"><SelectValue placeholder="Elige la ciudad" /></SelectTrigger>
                    <SelectContent>
                      {estadoOrigen && CIUDADES_POR_ESTADO[estadoOrigen]?.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {ciudadOrigen && (
                <SelectorTerminal
                  id={`${uid}-terminal`}
                  etiqueta="Terminal de salida"
                  ciudad={ciudadOrigen}
                  estado={estadoOrigen}
                  valor={terminal}
                  onCambio={(clave) => {
                    setTerminal(clave);
                    limpiarError("terminal");
                  }}
                  invalido={errorCampo === "terminal"}
                />
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-estado-destino`}>Estado de destino</Label>
                  <Select name="estado_destino" value={estadoDestino} onValueChange={(val) => { setEstadoDestino(val ?? ""); setCiudadDestino(""); setTerminalDestino(SIN_TERMINAL); }} required>
                    <SelectTrigger id={`${uid}-estado-destino`} className="w-full"><SelectValue placeholder="Elige el estado" /></SelectTrigger>
                    <SelectContent>
                      {ESTADOS_VENEZUELA.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-ciudad-destino`}>Ciudad de destino</Label>
                  <Select name="ciudad_destino" value={ciudadDestino} onValueChange={(val) => elegirCiudadDestino(val ?? "")} disabled={!estadoDestino} required>
                    <SelectTrigger
                      id={`${uid}-ciudad-destino`}
                      className="w-full"
                      aria-invalid={mismaSeleccion || errorCampo === "destino" ? true : undefined}
                      aria-describedby={mismaSeleccion ? `${uid}-misma-ciudad` : undefined}
                    >
                      <SelectValue placeholder="Elige la ciudad" />
                    </SelectTrigger>
                    <SelectContent>
                      {estadoDestino && CIUDADES_POR_ESTADO[estadoDestino]?.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {mismaSeleccion && (
                  <p id={`${uid}-misma-ciudad`} className="col-span-2 text-sm text-destructive-text">
                    {MSG_MISMA_CIUDAD}
                  </p>
                )}
              </div>

              {ciudadDestino && !mismaSeleccion && (
                <SelectorTerminal
                  id={`${uid}-terminal-destino`}
                  etiqueta="Terminal de llegada"
                  ciudad={ciudadDestino}
                  estado={estadoDestino}
                  valor={terminalDestino}
                  onCambio={(clave) => {
                    setTerminalDestino(clave);
                    limpiarError("terminal_destino");
                  }}
                  invalido={errorCampo === "terminal_destino"}
                />
              )}

              <fieldset className="grid gap-2">
                <legend className="mb-2 text-sm font-medium text-foreground">Duración del viaje</legend>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid content-start gap-2">
                    <Label htmlFor={`${uid}-horas`}>Horas</Label>
                    <Input
                      id={`${uid}-horas`}
                      type="number"
                      inputMode="numeric"
                      name="duracion_horas"
                      min={0}
                      max={48}
                      placeholder="Ej.: 8"
                      value={horas}
                      onChange={(e) => { setHoras(e.target.value); if (errorCampo === "duracion") { setFormError(null); setErrorCampo(null); } }}
                      aria-invalid={errorCampo === "duracion" ? true : undefined}
                    />
                  </div>
                  <div className="grid content-start gap-2">
                    <Label htmlFor={`${uid}-minutos`}>Minutos</Label>
                    <Input
                      id={`${uid}-minutos`}
                      type="number"
                      inputMode="numeric"
                      name="duracion_minutos"
                      min={0}
                      max={59}
                      placeholder="Ej.: 30"
                      value={minutos}
                      onChange={(e) => { setMinutos(e.target.value); if (errorCampo === "duracion") { setFormError(null); setErrorCampo(null); } }}
                      aria-invalid={errorCampo === "duracion" ? true : undefined}
                    />
                  </div>
                </div>
              </fieldset>

              <div className="grid content-start gap-2">
                <Label htmlFor={`${uid}-precio`}>Precio del pasaje (USD)</Label>
                <Input
                  id={`${uid}-precio`}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  name="precio_pasaje"
                  placeholder="Ej.: 15,00"
                  value={precioTexto}
                  onChange={(e) => setPrecioTexto(e.target.value)}
                  aria-describedby={`${uid}-precio-ayuda`}
                  required
                />
                <p id={`${uid}-precio-ayuda`} className="text-sm text-muted-foreground">
                  El pasajero paga en Bs a la tasa BCV del día
                  {tasa && precioValido
                    ? ` (hoy ≈ ${formatBs(usdABs(precioUsd, tasa.tasa))}).`
                    : tasa
                      ? "."
                      : " (hoy no hay tasa registrada)."}
                </p>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`${uid}-activa`}>Ruta activa</Label>
                  <p className="text-sm text-muted-foreground">Solo las activas se pueden programar.</p>
                </div>
                <Switch
                  id={`${uid}-activa`}
                  name="activa"
                  checked={activaSwitch}
                  onCheckedChange={setActivaSwitch}
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || mismaSeleccion} aria-busy={isPending || undefined}>
                {isPending && <Spinner size="sm" aria-hidden />}
                {isPending ? "Guardando…" : "Guardar ruta"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={alertOpen && alertData !== null}
        onOpenChange={setAlertOpen}
        tono="destructive"
        titulo={alertData ? `¿Desactivar la ruta ${alertData.nombre}?` : "¿Desactivar la ruta?"}
        impacto={
          alertData
            ? [
                alertData.count === 1
                  ? "Tiene 1 viaje programado: seguirá en pie. Cancélalo en Viajes si no va a salir."
                  : `Tiene ${alertData.count} viajes programados: seguirán en pie. Cancélalos en Viajes si no van a salir.`,
                "No podrás programar viajes nuevos en esta ruta hasta reactivarla.",
              ]
            : []
        }
        verbo="Desactivar ruta"
        verboCargando="Desactivando…"
        onConfirm={forceDesactivar}
      />

      <ConfirmDialog
        open={precioAltoPendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPrecioAltoPendiente(null);
        }}
        titulo="¿El precio está en dólares?"
        descripcion={
          <>
            Escribiste <strong className="font-semibold text-foreground">{Number.isFinite(precioAltoUsd) ? formatUsd(precioAltoUsd) : ""}</strong>
            {tasa && Number.isFinite(precioAltoUsd)
              ? `: a la tasa de hoy, el pasajero pagaría ${formatBs(usdABs(precioAltoUsd, tasa.tasa))}.`
              : "."}{" "}
            Si está en bolívares, conviértelo antes de guardar.
          </>
        }
        verbo="Guardar en dólares"
        textoCancelar="Corregir precio"
        onConfirm={confirmarPrecioAlto}
      />
    </div>
  );
}
