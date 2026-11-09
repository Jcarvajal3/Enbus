"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, DotsThree, Info, PencilSimple, Plus, Prohibit, Trash } from "@phosphor-icons/react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvisoError } from "@/components/aviso-error";
import { ErrorState } from "@/components/error-state";
import { StatusBadge } from "@/components/status-badge";
import { PaginacionTabla, usePaginacion } from "@/components/paginacion-tabla";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { CeldaEnlace } from "@/components/celda-enlace";
import { TelefonoField } from "@/components/ve-fields";
import { requireOnline } from "@/components/connectivity-banner";
import { avisarError, avisarExito } from "@/lib/avisos";
import { humanizeError } from "@/lib/errores";
import { formatTelefono } from "@/lib/ve";
import { ICONO_SECCION } from "@/lib/navigation";
import type { Bus } from "@/lib/types/operacion";
import { cn } from "@/lib/utils";
import { cambiarActivoBus, eliminarBus, guardarBus, revisarViajesBus, type CampoBus } from "./actions";

const ASIENTOS_MAX = 80;

/** Nombre del bus en títulos y avisos: su número de unidad. */
function nombreBus(bus: Pick<Bus, "numero_unidad">) {
  return bus.numero_unidad;
}

function plural(n: number, uno: string, varios: string) {
  return n === 1 ? uno : varios.replace("{n}", String(n));
}

function CeldaUnidad({ bus }: { bus: Bus }) {
  return (
    <span className="flex flex-col">
      <span>{bus.numero_unidad}</span>
      {bus.placa && <span className="text-xs font-normal text-muted-foreground">Placa {bus.placa}</span>}
      {/* En teléfono, el chofer y el estado van aquí (sus columnas se ocultan). */}
      <span className="text-xs font-normal text-muted-foreground sm:hidden">
        {bus.chofer_nombre || "Sin chofer"}
        {!bus.activo && " · Inactivo"}
      </span>
    </span>
  );
}

export function BusesClient({ buses, errorCarga }: { buses: Bus[]; errorCarga: string | null }) {
  const router = useRouter();
  const uid = useId();
  const { visibles, pagina, paginas, ir } = usePaginacion(buses);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editando, setEditando] = useState<Bus | null>(null);
  const [isPending, startTransition] = useTransition();
  /** Fila con una revisión en curso (desactivar o eliminar). */
  const [revisandoId, setRevisandoId] = useState<string | null>(null);

  // Formulario
  const [unidad, setUnidad] = useState("");
  const [placa, setPlaca] = useState("");
  const [asientos, setAsientos] = useState("");
  const [chofer, setChofer] = useState("");
  const [telefono, setTelefono] = useState("");
  const [activo, setActivo] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [errorCampo, setErrorCampo] = useState<CampoBus | null>(null);

  // Desactivar un bus con viajes programados (con confirmación)
  const [desactivar, setDesactivar] = useState<{ bus: Bus; programados: number } | null>(null);
  // Eliminar (solo sin viajes)
  const [eliminar, setEliminar] = useState<Bus | null>(null);

  function abrirCrear() {
    setEditando(null);
    setUnidad("");
    setPlaca("");
    setAsientos("");
    setChofer("");
    setTelefono("");
    setActivo(true);
    setFormError(null);
    setErrorCampo(null);
    setIsModalOpen(true);
  }

  function abrirEditar(bus: Bus) {
    setEditando(bus);
    setUnidad(bus.numero_unidad);
    setPlaca(bus.placa ?? "");
    setAsientos(String(bus.asientos));
    setChofer(bus.chofer_nombre ?? "");
    setTelefono(bus.chofer_telefono ?? "");
    setActivo(bus.activo);
    setFormError(null);
    setErrorCampo(null);
    setIsModalOpen(true);
  }

  const limpiarError = (campo: CampoBus) => {
    if (errorCampo === campo) {
      setFormError(null);
      setErrorCampo(null);
    }
  };

  function guardar(formData: FormData) {
    setFormError(null);
    setErrorCampo(null);
    const n = Number(asientos);
    if (!Number.isInteger(n) || n < 1 || n > ASIENTOS_MAX) {
      setFormError(`El bus debe tener entre 1 y ${ASIENTOS_MAX} asientos.`);
      setErrorCampo("asientos");
      document.getElementById(`${uid}-asientos`)?.focus();
      return;
    }
    // El Switch controlado no entra solo en el FormData.
    formData.set("activo", activo ? "on" : "off");
    startTransition(async () => {
      try {
        const res = await requireOnline(() => guardarBus(formData, editando?.id))();
        if (res.error) {
          setFormError(res.error);
          setErrorCampo(res.campo ?? null);
          if (res.campo) document.getElementById(`${uid}-${res.campo}`)?.focus();
        } else {
          avisarExito(editando ? "Bus actualizado." : "Bus registrado.");
          setIsModalOpen(false);
        }
      } catch (err) {
        setFormError(humanizeError(err, "guardar el bus"));
      }
    });
  }

  function alternarActivo(bus: Bus) {
    if (!bus.activo) {
      startTransition(async () => {
        try {
          const res = await requireOnline(() => cambiarActivoBus(bus.id, true))();
          if (res.error) avisarError(res.error);
          else avisarExito(`Bus ${nombreBus(bus)} reactivado.`);
        } catch (err) {
          avisarError(humanizeError(err, "reactivar el bus"));
        }
      });
      return;
    }
    setRevisandoId(bus.id);
    startTransition(async () => {
      try {
        const check = await revisarViajesBus(bus.id);
        if (check.error !== undefined) {
          avisarError(check.error);
          return;
        }
        if (check.programados > 0) {
          setDesactivar({ bus, programados: check.programados });
          return;
        }
        const res = await requireOnline(() => cambiarActivoBus(bus.id, false))();
        if (res.error) avisarError(res.error);
        else avisarExito(`Bus ${nombreBus(bus)} desactivado.`);
      } catch (err) {
        avisarError(humanizeError(err, "desactivar el bus"));
      } finally {
        setRevisandoId(null);
      }
    });
  }

  async function confirmarDesactivar() {
    if (!desactivar) return { ok: false, error: "No encontramos el bus. Actualiza la página." };
    try {
      const res = await requireOnline(() => cambiarActivoBus(desactivar.bus.id, false))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "desactivar el bus") };
    }
    avisarExito(`Bus ${nombreBus(desactivar.bus)} desactivado.`);
    return { ok: true };
  }

  function pedirEliminar(bus: Bus) {
    setRevisandoId(bus.id);
    startTransition(async () => {
      try {
        const check = await revisarViajesBus(bus.id);
        if (check.error !== undefined) {
          avisarError(check.error);
          return;
        }
        if (check.total > 0) {
          avisarError(
            plural(
              check.total,
              "Este bus tiene 1 viaje registrado: no se puede eliminar. Desactívalo en su lugar.",
              "Este bus tiene {n} viajes registrados: no se puede eliminar. Desactívalo en su lugar."
            )
          );
          return;
        }
        setEliminar(bus);
      } catch (err) {
        avisarError(humanizeError(err, "revisar los viajes del bus"));
      } finally {
        setRevisandoId(null);
      }
    });
  }

  async function confirmarEliminar() {
    if (!eliminar) return { ok: false, error: "No encontramos el bus. Actualiza la página." };
    try {
      const res = await requireOnline(() => eliminarBus(eliminar.id))();
      if (res.error) return { ok: false, error: res.error };
    } catch (err) {
      return { ok: false, error: humanizeError(err, "eliminar el bus") };
    }
    avisarExito(`Bus ${nombreBus(eliminar)} eliminado.`);
    return { ok: true };
  }

  const invalido = (campo: CampoBus) => (errorCampo === campo ? true : undefined);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Buses" description="Unidades, asientos y chofer para programar viajes.">
        {buses.length > 0 && (
          <Button onClick={abrirCrear}>
            <Plus aria-hidden />
            Registrar bus
          </Button>
        )}
      </PageHeader>

      {errorCarga ? (
        <Card className="p-0">
          <ErrorState titulo="No pudimos cargar los buses" descripcion={errorCarga} onReintentar={() => router.refresh()} />
        </Card>
      ) : buses.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ICONO_SECCION.buses}
            title="Todavía no tienes buses"
            description="Registra cada unidad una vez con sus asientos y su chofer; luego la eliges al programar un viaje."
            action={
              <Button onClick={abrirCrear}>
                <Plus aria-hidden />
                Registrar bus
              </Button>
            }
          />
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unidad</TableHead>
                <TableHead className="text-right">Asientos</TableHead>
                <TableHead className="hidden sm:table-cell">Chofer</TableHead>
                <TableHead className="hidden sm:table-cell">Estado</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map((bus) => (
                <TableRow key={bus.id} className={cn("relative", !bus.activo && "text-muted-foreground")}>
                  <CeldaEnlace
                    onAbrir={() => abrirEditar(bus)}
                    etiqueta={`Editar bus ${nombreBus(bus)}`}
                    className="whitespace-normal"
                  >
                    <CeldaUnidad bus={bus} />
                  </CeldaEnlace>
                  <TableCell className="text-right tabular-nums">{bus.asientos}</TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">
                    {bus.chofer_nombre ? (
                      <span className="flex flex-col">
                        <span>{bus.chofer_nombre}</span>
                        {bus.chofer_telefono && (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            {formatTelefono(bus.chofer_telefono)}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Sin asignar</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge status={bus.activo ? "ACTIVO" : "INACTIVO"} dominio="recurso" />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        disabled={revisandoId === bus.id}
                        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "relative z-10")}
                        aria-label={`Más acciones del bus ${nombreBus(bus)}`}
                      >
                        {revisandoId === bus.id ? <Spinner size="sm" /> : <DotsThree aria-hidden />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => abrirEditar(bus)}>
                          <PencilSimple aria-hidden />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => alternarActivo(bus)}
                          className={bus.activo ? "text-destructive-text focus:text-destructive-text" : undefined}
                        >
                          {bus.activo ? <Prohibit aria-hidden /> : <ArrowCounterClockwise aria-hidden />}
                          {bus.activo ? "Desactivar bus" : "Reactivar bus"}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={() => pedirEliminar(bus)}>
                          <Trash aria-hidden />
                          Eliminar bus
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
            <DialogTitle>{editando ? "Editar bus" : "Registrar bus"}</DialogTitle>
            {editando && (
              <DialogDescription>
                Los viajes ya programados conservan la unidad, el chofer y los asientos con que se crearon.
              </DialogDescription>
            )}
          </DialogHeader>

          {/* onSubmit (no `action`): React no reinicia el formulario si hay error. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              guardar(new FormData(e.currentTarget));
            }}
            noValidate
            className="flex flex-col gap-6"
          >
            <div className="grid gap-4">
              {/* El error del teléfono se ve bajo su campo. */}
              {formError && errorCampo !== "telefono" && <AvisoError>{formError}</AvisoError>}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-unidad`}>Unidad</Label>
                  <Input
                    id={`${uid}-unidad`}
                    name="numero_unidad"
                    autoComplete="off"
                    maxLength={40}
                    placeholder="Ej.: Unidad 12"
                    value={unidad}
                    onChange={(e) => {
                      setUnidad(e.target.value);
                      limpiarError("unidad");
                    }}
                    aria-invalid={invalido("unidad")}
                    required
                  />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor={`${uid}-placa`}>Placa (opcional)</Label>
                  <Input
                    id={`${uid}-placa`}
                    name="placa"
                    autoComplete="off"
                    maxLength={12}
                    placeholder="Ej.: AB123CD"
                    className="uppercase placeholder:normal-case"
                    value={placa}
                    onChange={(e) => {
                      setPlaca(e.target.value);
                      limpiarError("placa");
                    }}
                    aria-invalid={invalido("placa")}
                  />
                </div>
              </div>

              <div className="grid content-start gap-2">
                <Label htmlFor={`${uid}-asientos`}>Asientos</Label>
                <Input
                  id={`${uid}-asientos`}
                  name="asientos"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={ASIENTOS_MAX}
                  placeholder="Ej.: 42"
                  value={asientos}
                  onChange={(e) => {
                    setAsientos(e.target.value);
                    limpiarError("asientos");
                  }}
                  aria-invalid={invalido("asientos")}
                  aria-describedby={`${uid}-asientos-ayuda`}
                  required
                />
                <p id={`${uid}-asientos-ayuda`} className="text-sm text-muted-foreground">
                  Los que se venden en cada viaje de este bus (1 a {ASIENTOS_MAX}).
                </p>
              </div>

              <fieldset className="grid gap-4">
                <legend className="mb-2 text-sm font-medium text-foreground">Chofer asignado (opcional)</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="grid content-start gap-2">
                    <Label htmlFor={`${uid}-chofer`}>Nombre</Label>
                    <Input
                      id={`${uid}-chofer`}
                      name="chofer_nombre"
                      autoComplete="off"
                      maxLength={80}
                      value={chofer}
                      onChange={(e) => {
                        setChofer(e.target.value);
                        limpiarError("chofer");
                      }}
                      aria-invalid={invalido("chofer")}
                    />
                  </div>
                  <TelefonoField
                    id={`${uid}-telefono`}
                    name="chofer_telefono"
                    label="Teléfono"
                    value={telefono}
                    onChange={(v) => {
                      setTelefono(v);
                      limpiarError("telefono");
                    }}
                    error={errorCampo === "telefono" ? formError : null}
                  />
                </div>
                <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  Al programar un viaje puedes poner otro chofer solo para esa salida.
                </p>
              </fieldset>

              <div className="flex items-center justify-between gap-4 rounded-md border border-border p-4">
                <div className="flex flex-col gap-0.5">
                  <Label htmlFor={`${uid}-activo`}>Bus activo</Label>
                  <p className="text-sm text-muted-foreground">Solo los activos se pueden elegir al programar viajes.</p>
                </div>
                <Switch id={`${uid}-activo`} checked={activo} onCheckedChange={setActivo} />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending} aria-busy={isPending || undefined}>
                {isPending && <Spinner size="sm" aria-hidden />}
                {isPending ? "Guardando…" : editando ? "Guardar bus" : "Registrar bus"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={desactivar !== null}
        onOpenChange={(abierto) => !abierto && setDesactivar(null)}
        tono="destructive"
        titulo={desactivar ? `¿Desactivar el bus ${nombreBus(desactivar.bus)}?` : "¿Desactivar el bus?"}
        impacto={
          desactivar
            ? [
                plural(
                  desactivar.programados,
                  "Tiene 1 viaje programado: seguirá en pie con este bus. Edítalo en Viajes si cambia la unidad.",
                  "Tiene {n} viajes programados: seguirán en pie con este bus. Edítalos en Viajes si cambia la unidad."
                ),
                "No podrás elegirlo al programar viajes nuevos hasta reactivarlo.",
              ]
            : []
        }
        verbo="Desactivar bus"
        verboCargando="Desactivando…"
        onConfirm={confirmarDesactivar}
      />

      <ConfirmDialog
        open={eliminar !== null}
        onOpenChange={(abierto) => !abierto && setEliminar(null)}
        tono="destructive"
        titulo={eliminar ? `¿Eliminar el bus ${nombreBus(eliminar)}?` : "¿Eliminar el bus?"}
        impacto={["No tiene viajes registrados: se borra de la lista y no se puede deshacer."]}
        verbo="Eliminar bus"
        verboCargando="Eliminando…"
        onConfirm={confirmarEliminar}
      />
    </div>
  );
}
