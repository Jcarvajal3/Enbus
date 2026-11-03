"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, PencilSimple, Trash } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { avisarError, avisarExito } from "@/lib/avisos";
import {
  crearSucursal,
  actualizarSucursal,
  cambiarActivaSucursal,
  eliminarSucursal,
  type SucursalGuardada,
  type SucursalInput,
} from "@/app/cooperativas/(panel)/configuracion/actions";
import { requireOnline } from "@/components/connectivity-banner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { humanizeError } from "@/lib/errores";
import { CIUDADES_POR_ESTADO, ESTADOS_VENEZUELA } from "@/lib/data/venezuela";
import { formatTelefono, telefonoValido, TELEFONO_ERROR } from "@/lib/ve";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Estados y ciudades (mismas claves que las rutas: "carabobo", "valencia")
// ─────────────────────────────────────────────────────────────────────────────

/** "Puerto La Cruz" / "puerto_la_cruz" / "PUERTO LA CRUZ" → "puerto_la_cruz". */
function aClave(texto: string | null | undefined) {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function claveEstado(texto: string | null | undefined): string {
  const k = aClave(texto);
  return ESTADOS_VENEZUELA.find((e) => e.value === k || aClave(e.label) === k)?.value ?? "";
}

function claveCiudad(estado: string, texto: string | null | undefined): string {
  const k = aClave(texto);
  return CIUDADES_POR_ESTADO[estado]?.find((c) => c.value === k || aClave(c.label) === k)?.value ?? "";
}

/** Nombre legible de una ciudad o estado guardado como clave o como texto libre (datos antiguos). */
function legible(texto: string | null | undefined, opciones: { value: string; label: string }[]) {
  const k = aClave(texto);
  const encontrada = opciones.find((o) => o.value === k || aClave(o.label) === k);
  if (encontrada) return encontrada.label;
  return (texto ?? "").replace(/_/g, " ").replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}

function estadoDe(s: SucursalGuardada): string {
  return s.estado_geografico ?? s.estado ?? "";
}

function ubicacion(s: SucursalGuardada) {
  const estado = estadoDe(s);
  const clave = claveEstado(estado);
  const ciudad = legible(s.ciudad, CIUDADES_POR_ESTADO[clave] ?? Object.values(CIUDADES_POR_ESTADO).flat());
  return `${ciudad}, ${legible(estado, ESTADOS_VENEZUELA)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Formulario
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  nombre: string;
  estado: string;
  ciudad: string;
  direccion: string;
  telefono: string;
  horario: string;
}

const EMPTY_FORM: FormState = {
  nombre: "",
  estado: "",
  ciudad: "",
  direccion: "",
  telefono: "",
  horario: "",
};

type Errores = Partial<Record<keyof FormState, string>>;

function validar(form: FormState): Errores {
  const e: Errores = {};
  if (form.nombre.trim().length < 3) e.nombre = "Escribe el nombre de la sucursal (mínimo 3 caracteres).";
  if (!form.estado) e.estado = "Elige el estado.";
  if (!form.ciudad) e.ciudad = "Elige la ciudad.";
  if (form.direccion.trim().length < 5) e.direccion = "Escribe la dirección para que los clientes la encuentren.";
  if (form.telefono.trim() && !telefonoValido(form.telefono)) {
    e.telefono = TELEFONO_ERROR;
  }
  return e;
}

function formToInput(form: FormState): SucursalInput {
  return {
    nombre: form.nombre,
    estado: form.estado,
    ciudad: form.ciudad,
    direccion: form.direccion || null,
    telefono: form.telefono || null,
    horario: form.horario || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface SucursalesTabProps {
  sucursales: SucursalGuardada[];
  errorCarga?: string | null;
}

export function SucursalesTab({ sucursales: initialSucursales, errorCarga = null }: SucursalesTabProps) {
  const router = useRouter();
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const [sucursales, setSucursales] = useState(initialSucursales);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  const [aEliminar, setAEliminar] = useState<SucursalGuardada | null>(null);
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [conRelaciones, setConRelaciones] = useState(false);

  const setField = (key: keyof FormState, value: string) => {
    // Cambiar de estado vacía la ciudad (volver a elegir el mismo estado la conserva).
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "estado" && value !== prev.estado ? { ciudad: "" } : {}),
    }));
    setErrores((prev) => {
      if (!(key in prev)) return prev;
      const siguiente = { ...prev };
      delete siguiente[key];
      return siguiente;
    });
  };

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrores({});
    setErrorGeneral(null);
    setShowForm(true);
  }

  function openEdit(s: SucursalGuardada) {
    const estado = claveEstado(estadoDe(s));
    setEditingId(s.id);
    setForm({
      nombre: s.nombre,
      estado,
      ciudad: estado ? claveCiudad(estado, s.ciudad) : "",
      direccion: s.direccion ?? "",
      telefono: s.telefono && telefonoValido(s.telefono) ? formatTelefono(s.telefono).replace(/\./g, "") : s.telefono ?? "",
      horario: s.horario ?? "",
    });
    setErrores({});
    setErrorGeneral(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (guardando) return;
    setErrorGeneral(null);
    const encontrados = validar(form);
    setErrores(encontrados);
    if (Object.keys(encontrados).length > 0) {
      document.getElementById(id(Object.keys(encontrados)[0]))?.focus();
      return;
    }
    setGuardando(true);
    try {
      const input = formToInput(form);
      const res = editingId
        ? await requireOnline(() => actualizarSucursal(editingId, input))()
        : await requireOnline(() => crearSucursal(input))();
      if (!res.ok) {
        if (res.campo) setErrores({ [res.campo]: res.error } as Errores);
        else setErrorGeneral(res.error);
        return;
      }
      if (editingId) {
        setSucursales((prev) => prev.map((s) => (s.id === editingId ? res.data : s)));
        avisarExito("Sucursal actualizada.");
      } else {
        setSucursales((prev) => [...prev, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        avisarExito("Sucursal creada.");
      }
      closeForm();
      router.refresh();
    } catch (err: unknown) {
      setErrorGeneral(humanizeError(err, "guardar la sucursal"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActiva(s: SucursalGuardada, activa: boolean) {
    setCambiandoId(s.id);
    try {
      const res = await requireOnline(() => cambiarActivaSucursal(s.id, activa))();
      if (!res.ok) {
        avisarError(res.error);
        return false;
      }
      setSucursales((prev) => prev.map((x) => (x.id === s.id ? { ...x, activa } : x)));
      avisarExito(activa ? `${s.nombre} activada.` : `${s.nombre} desactivada.`);
      return true;
    } catch (err: unknown) {
      avisarError(humanizeError(err, activa ? "activar la sucursal" : "desactivar la sucursal"));
      return false;
    } finally {
      setCambiandoId(null);
    }
  }

  function pedirEliminar(s: SucursalGuardada) {
    setConRelaciones(false);
    setAEliminar(s);
    setEliminarOpen(true);
  }

  async function confirmarEliminar() {
    if (!aEliminar) return { ok: false, error: "No encontramos esa sucursal. Actualiza la página." };
    try {
      const res = await requireOnline(() => eliminarSucursal(aEliminar.id))();
      if (!res.ok) {
        if (res.codigo === "TIENE_RELACIONES") setConRelaciones(true);
        return { ok: false, error: res.error };
      }
    } catch (err) {
      return { ok: false, error: humanizeError(err, "eliminar la sucursal") };
    }
    setSucursales((prev) => prev.filter((s) => s.id !== aEliminar.id));
    avisarExito(`Sucursal ${aEliminar.nombre} eliminada.`);
    if (editingId === aEliminar.id) closeForm();
    router.refresh();
    return { ok: true };
  }

  const ciudades = form.estado ? CIUDADES_POR_ESTADO[form.estado] ?? [] : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sucursales</CardTitle>
        <CardDescription>Los pasajeros ven su dirección y horario.</CardDescription>
        {!showForm && sucursales.length > 0 && (
          <CardAction>
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              Nueva sucursal
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {errorCarga && (
          <ErrorState
            compacto
            titulo="No pudimos cargar tus sucursales"
            descripcion={errorCarga}
            onReintentar={() => router.refresh()}
          />
        )}

        {showForm && (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-md border-border sm:border sm:p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? "Editar sucursal" : "Nueva sucursal"}
            </h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo
                id={id("nombre")}
                label="Nombre"
                value={form.nombre}
                onChange={(v) => setField("nombre", v)}
                placeholder="Ej.: Terminal de Valencia"
                error={errores.nombre}
                disabled={guardando}
                className="sm:col-span-2"
              />

              <div className="flex flex-col gap-2">
                <Label htmlFor={id("estado")}>Estado</Label>
                <Select value={form.estado} onValueChange={(v) => setField("estado", v ?? "")} disabled={guardando}>
                  <SelectTrigger id={id("estado")} className="w-full" aria-invalid={errores.estado ? true : undefined}>
                    <SelectValue placeholder="Elige el estado">
                      {(v: string) => ESTADOS_VENEZUELA.find((e) => e.value === v)?.label ?? "Elige el estado"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ESTADOS_VENEZUELA.map((e) => (
                      <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errores.estado && <p className="text-sm text-destructive-text">{errores.estado}</p>}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={id("ciudad")}>Ciudad</Label>
                <Select
                  value={form.ciudad}
                  onValueChange={(v) => setField("ciudad", v ?? "")}
                  disabled={guardando || !form.estado}
                >
                  <SelectTrigger id={id("ciudad")} className="w-full" aria-invalid={errores.ciudad ? true : undefined}>
                    <SelectValue placeholder={form.estado ? "Elige la ciudad" : "Primero elige el estado"}>
                      {(v: string) =>
                        ciudades.find((c) => c.value === v)?.label ??
                        (form.estado ? "Elige la ciudad" : "Primero elige el estado")
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {ciudades.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errores.ciudad && <p className="text-sm text-destructive-text">{errores.ciudad}</p>}
              </div>

              <Campo
                id={id("direccion")}
                label="Dirección"
                value={form.direccion}
                onChange={(v) => setField("direccion", v)}
                placeholder="Ej.: Terminal Big Low Center, local 12"
                error={errores.direccion}
                disabled={guardando}
                className="sm:col-span-2"
              />
              <Campo
                id={id("telefono")}
                label="Teléfono (opcional)"
                value={form.telefono}
                onChange={(v) => setField("telefono", v)}
                type="tel"
                placeholder="Ej.: 0241-1234567"
                error={errores.telefono}
                disabled={guardando}
              />
              <Campo
                id={id("horario")}
                label="Horario de atención (opcional)"
                value={form.horario}
                onChange={(v) => setField("horario", v)}
                placeholder="Ej.: Lun a sáb 7:00 a. m. – 6:00 p. m."
                error={errores.horario}
                disabled={guardando}
              />
            </div>

            {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeForm} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <Spinner size="sm" aria-hidden />}
                {guardando ? "Guardando…" : editingId ? "Guardar cambios" : "Crear sucursal"}
              </Button>
            </div>
          </form>
        )}

        {sucursales.length === 0 && !showForm && !errorCarga && (
          <EmptyState
            compacto
            icon={MapPin}
            title="Todavía no tienes sucursales"
            description="Cada empleado y cada encomienda pertenecen a una."
            action={
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                Nueva sucursal
              </Button>
            }
          />
        )}

        <ul className="flex flex-col gap-2">
          {sucursales.map((s) => {
            const switchId = `${uid}-activa-${s.id}`;
            const detalle = [
              ubicacion(s),
              s.direccion,
              s.telefono ? (telefonoValido(s.telefono) ? formatTelefono(s.telefono) : s.telefono) : null,
              s.horario,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li
                key={s.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className={cn("truncate text-sm font-medium", s.activa ? "text-foreground" : "text-muted-foreground")}>{s.nombre}</p>
                  <p className="text-xs text-muted-foreground">{detalle}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={switchId}
                      checked={s.activa}
                      disabled={cambiandoId === s.id}
                      onCheckedChange={(v) => void cambiarActiva(s, v)}
                    />
                    <Label htmlFor={switchId} className="w-14 text-sm font-normal">
                      {s.activa ? "Activa" : "Inactiva"}
                    </Label>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar sucursal ${s.nombre}`} onClick={() => openEdit(s)}>
                    <PencilSimple aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive-text hover:text-destructive-text"
                    aria-label={`Eliminar sucursal ${s.nombre}`}
                    onClick={() => pedirEliminar(s)}
                  >
                    <Trash aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>

      <ConfirmDialog
        open={eliminarOpen && aEliminar !== null}
        onOpenChange={setEliminarOpen}
        tono="destructive"
        titulo={aEliminar ? `¿Eliminar la sucursal ${aEliminar.nombre}?` : "¿Eliminar la sucursal?"}
        descripcion={
          conRelaciones && aEliminar ? (
            <div className="flex flex-col items-start gap-3">
              <p>Si la desactivas, deja de aparecer para los pasajeros y conservas su historial.</p>
              {aEliminar.activa ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cambiandoId === aEliminar.id}
                  onClick={async () => {
                    const ok = await cambiarActiva(aEliminar, false);
                    if (ok) setEliminarOpen(false);
                  }}
                >
                  {cambiandoId === aEliminar.id ? "Desactivando…" : "Desactivar"}
                </Button>
              ) : (
                <p className="font-medium text-foreground">Ya está desactivada.</p>
              )}
            </div>
          ) : (
            "No se puede deshacer. Si tiene empleados o encomiendas, desactívala."
          )
        }
        verbo="Eliminar sucursal"
        verboCargando="Eliminando…"
        onConfirm={confirmarEliminar}
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function Campo({
  id, label, value, onChange, type = "text", placeholder, error, disabled, className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}
