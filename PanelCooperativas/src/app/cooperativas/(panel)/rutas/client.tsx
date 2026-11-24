"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DotsThree, PencilSimple, Plus, Prohibit, ArrowCounterClockwise } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { StatusBadge, TonoBadge } from "@/components/status-badge";
import { EntityCard } from "@/components/entity-card";
import { IconTile } from "@/components/icon-tile";
import { ListaResponsive } from "@/components/lista-responsive";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { Campo, CiudadField, MontoField, type ValorCiudad } from "@/components/campos";
import { guardarRuta, toggleActivaRuta, checkDesactivarRuta } from "./actions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { requireOnline } from "@/components/connectivity-banner";
import { Monto } from "@/components/monto";
import { useTasaBCV } from "@/components/tasa-bcv-provider";
import { formatBs, formatNumeroVE, formatUsd, leerMonto, usdABs } from "@/lib/dinero";
import { avisarError, avisarExito } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { datosFaltantesRuta } from "@/lib/rutas";
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

/** Precio en USD: el lector único de montos (coma decimal); NaN si no es válido. */
function leerPrecio(texto: string): number {
  return leerMonto(texto) ?? NaN;
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
      <p id={`${id}-ayuda`} className="text-[13px] text-muted-foreground">
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

/** Duración legible, o el aviso de que falta (una ruta en borrador no la tiene todavía). */
function DuracionRuta({ ruta }: { ruta: Ruta }) {
  const min = Number(ruta.duracion_estimada_min);
  return min > 0 ? <>{formatDuracion(min)}</> : <TonoBadge tono="pendiente">Falta la duración</TonoBadge>;
}

/** Precio en USD, o "—" si todavía no se indicó. */
function PrecioRuta({ ruta }: { ruta: Ruta }) {
  return Number(ruta.precio_pasaje) > 0 ? (
    <Monto usd={Number(ruta.precio_pasaje)} size="sm" align="right" />
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

function NombreRuta({ ruta }: { ruta: Ruta }) {
  return (
    <span className="flex flex-col">
      <span>
        {formatCiudad(ruta.ciudad_origen)} → {formatCiudad(ruta.ciudad_destino)}
      </span>
      <span className="text-[13px] font-normal text-muted-foreground">
        {formatCiudad(ruta.estado_origen)} → {formatCiudad(ruta.estado_destino)}
      </span>
      {textoTerminales(ruta) && (
        <span className="text-[13px] font-normal text-muted-foreground">{textoTerminales(ruta)}</span>
      )}
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
  function elegirOrigen({ estado, ciudad }: ValorCiudad) {
    setEstadoOrigen(estado);
    setCiudadOrigen(ciudad);
    setTerminal(terminalPorDefecto(ciudad, estado));
    limpiarError("destino", "terminal");
  }

  function elegirDestino({ estado, ciudad }: ValorCiudad) {
    setEstadoDestino(estado);
    setCiudadDestino(ciudad);
    setTerminalDestino(terminalPorDefecto(ciudad, estado));
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

  /** `activar`: se abrió para completar los datos que faltan y activarla (el interruptor viene encendido). */
  function openEditModal(ruta: Ruta, activar = false) {
    setEditingRuta(ruta);
    setEstadoOrigen(ruta.estado_origen);
    setCiudadOrigen(ruta.ciudad_origen);
    setTerminal(terminalVE(ruta.terminal_origen)?.clave ?? SIN_TERMINAL);
    setEstadoDestino(ruta.estado_destino);
    setCiudadDestino(ruta.ciudad_destino);
    setTerminalDestino(terminalVE(ruta.terminal_destino)?.clave ?? SIN_TERMINAL);
    setPrecioTexto(ruta.precio_pasaje != null && Number.isFinite(Number(ruta.precio_pasaje)) ? formatNumeroVE(Number(ruta.precio_pasaje)) : "");
    const total = Number(ruta.duracion_estimada_min) || 0;
    setHoras(total > 0 ? String(Math.floor(total / 60)) : "");
    setMinutos(total > 0 ? String(total % 60) : "");
    setFormError(null);
    setErrorCampo(null);
    setActivaSwitch(activar || ruta.activa);
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
    } else if (datosFaltantesRuta(ruta).length > 0) {
      // Borrador: no se activa a ciegas, se abre el formulario para completar lo que falta.
      openEditModal(ruta, true);
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
    if (!ciudadOrigen || !ciudadDestino) {
      setFormError("Elige la ciudad de origen y la de destino.");
      setErrorCampo("destino");
      document.getElementById(`${uid}-${ciudadOrigen ? "ciudad-destino" : "ciudad-origen"}`)?.focus();
      return;
    }
    if (mismaCiudad(ciudadOrigen, ciudadDestino)) {
      setFormError(MSG_MISMA_CIUDAD);
      setErrorCampo("destino");
      return;
    }
    // La duración es obligatoria para activar; en una ruta inactiva se puede dejar en blanco.
    const hayDuracion = horas.trim() !== "" || minutos.trim() !== "";
    const errDur = hayDuracion || activaSwitch ? errorDuracion(horas, minutos) : null;
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
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Rutas"
        description="Duración y precio del pasaje en USD."
        principal={
          rutas.length > 0 ? (
            <Button size="lg" onClick={openCreateModal}>
              <Plus aria-hidden />
              Crear ruta
            </Button>
          ) : undefined
        }
      />

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
              <Button size="lg" onClick={openCreateModal}>
                <Plus aria-hidden />
                Crear ruta
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
          <ListaResponsive
            items={visibles}
            clave={(ruta) => ruta.id}
            etiqueta="Rutas"
            tarjeta={(ruta) => (
              <EntityCard
                onClick={() => openEditModal(ruta)}
                etiqueta={`Editar ruta ${nombreRuta(ruta)}`}
                leading={<IconTile icon={ICONO_SECCION.rutas} tone={ruta.activa ? "sky" : "neutral"} />}
                title={nombreRuta(ruta)}
                subtitle={[
                  Number(ruta.duracion_estimada_min) > 0 ? formatDuracion(Number(ruta.duracion_estimada_min)) : "Falta la duración",
                  textoTerminales(ruta),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                lineasSubtitulo={2}
                adorno={Number(ruta.precio_pasaje) > 0 ? formatUsd(Number(ruta.precio_pasaje)) : undefined}
                badge={<StatusBadge status={ruta.activa ? "ACTIVO" : "INACTIVO"} dominio="recurso" />}
              />
            )}
            tabla={() => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ruta</TableHead>
                <TableHead>Duración</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead>Estado</TableHead>
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
                  <TableCell className="tabular-nums">
                    <DuracionRuta ruta={ruta} />
                  </TableCell>
                  <TableCell className="text-right">
                    <PrecioRuta ruta={ruta} />
                  </TableCell>
                  <TableCell>
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
                          {ruta.activa ? "Desactivar ruta" : datosFaltantesRuta(ruta).length > 0 ? "Completar y activar" : "Reactivar ruta"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
            )}
          />
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
              {formError && errorCampo !== "duracion" && <AvisoError>{formError}</AvisoError>}
              {editingRuta && !editingRuta.activa && datosFaltantesRuta(editingRuta).length > 0 && (
                <p className="rounded-md bg-warning-light p-3 text-[13px] text-warning-deep">
                  Esta ruta está en borrador: para activarla falta {datosFaltantesRuta(editingRuta).join(" y ")}.
                </p>
              )}
              <CiudadField
                id={`${uid}-ciudad-origen`}
                label="Ciudad de origen"
                required
                value={{ estado: estadoOrigen, ciudad: ciudadOrigen }}
                onChange={elegirOrigen}
                disabled={isPending}
              />
              <input type="hidden" name="estado_origen" value={estadoOrigen} />
              <input type="hidden" name="ciudad_origen" value={ciudadOrigen} />

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

              <CiudadField
                id={`${uid}-ciudad-destino`}
                label="Ciudad de destino"
                required
                value={{ estado: estadoDestino, ciudad: ciudadDestino }}
                onChange={elegirDestino}
                excluir={ciudadOrigen ? [ciudadOrigen] : undefined}
                error={mismaSeleccion ? MSG_MISMA_CIUDAD : null}
                disabled={isPending}
              />
              <input type="hidden" name="estado_destino" value={estadoDestino} />
              <input type="hidden" name="ciudad_destino" value={ciudadDestino} />

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
                <legend className="mb-2 text-[13px] font-medium text-foreground">
                  Duración del viaje{activaSwitch ? "" : " (opcional mientras esté inactiva)"}
                </legend>
                <div className="grid grid-cols-2 gap-4">
                  <Campo
                    id={`${uid}-horas`}
                    name="duracion_horas"
                    label="Horas"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="Ej. 8"
                    enterKeyHint="next"
                    value={horas}
                    onChange={(v) => {
                      setHoras(v.replace(/\D/g, ""));
                      limpiarError("duracion");
                    }}
                    error={errorCampo === "duracion" ? formError : null}
                    disabled={isPending}
                  />
                  <Campo
                    id={`${uid}-minutos`}
                    name="duracion_minutos"
                    label="Minutos"
                    inputMode="numeric"
                    maxLength={2}
                    placeholder="Ej. 30"
                    enterKeyHint="next"
                    value={minutos}
                    onChange={(v) => {
                      setMinutos(v.replace(/\D/g, ""));
                      limpiarError("duracion");
                    }}
                    disabled={isPending}
                  />
                </div>
              </fieldset>

              <MontoField
                id={`${uid}-precio`}
                name="precio_pasaje"
                label="Precio del pasaje (USD)"
                moneda="USD"
                required={activaSwitch}
                enterKeyHint="done"
                value={precioTexto}
                onChange={setPrecioTexto}
                disabled={isPending}
                ayuda={
                  `El pasajero paga en Bs a la tasa BCV del día${
                    tasa && precioValido
                      ? ` (hoy ≈ ${formatBs(usdABs(precioUsd, tasa.tasa))}).`
                      : tasa
                        ? "."
                        : " (hoy no hay tasa registrada)."
                  }`
                }
              />

              <div className="flex items-center justify-between gap-4 rounded-md bg-surface p-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`${uid}-activa`}>Ruta activa</Label>
                  <p className="text-[13px] text-muted-foreground">
                    Solo las activas se pueden programar. Para activarla hacen falta la duración y el precio.
                  </p>
                </div>
                <Switch
                  id={`${uid}-activa`}
                  name="activa"
                  checked={activaSwitch}
                  onCheckedChange={setActivaSwitch}
                />
              </div>
            </div>

            {/* Móvil: la tarjeta no lleva menú, desactivar vive en la hoja. */}
            {editingRuta && (
              <Button
                type="button"
                variant="outline"
                className="md:hidden"
                disabled={isPending}
                onClick={() => {
                  setIsModalOpen(false);
                  handleToggleRuta(editingRuta);
                }}
              >
                {editingRuta.activa ? <Prohibit aria-hidden /> : <ArrowCounterClockwise aria-hidden />}
                {editingRuta.activa ? "Desactivar ruta" : datosFaltantesRuta(editingRuta).length > 0 ? "Completar y activar" : "Reactivar ruta"}
              </Button>
            )}

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
