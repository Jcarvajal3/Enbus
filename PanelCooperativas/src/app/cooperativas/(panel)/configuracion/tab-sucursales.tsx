"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Plus, PencilSimple, Trash, Check, X, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
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
import { formatTelefono, telefonoValido } from "@/lib/ve";
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
    e.telefono = "Escribe un teléfono venezolano, por ejemplo 0241-1234567.";
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
        toast.success("Sucursal actualizada.");
      } else {
        setSucursales((prev) => [...prev, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
        toast.success("Sucursal creada.");
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
        toast.error(res.error);
        return false;
      }
      setSucursales((prev) => prev.map((x) => (x.id === s.id ? { ...x, activa } : x)));
      toast.success(activa ? `${s.nombre} activada.` : `${s.nombre} desactivada.`);
      return true;
    } catch (err: unknown) {
      toast.error(humanizeError(err, activa ? "activar la sucursal" : "desactivar la sucursal"));
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
    toast.success(`Sucursal ${aEliminar.nombre} eliminada.`);
    if (editingId === aEliminar.id) closeForm();
    router.refresh();
    return { ok: true };
  }

  const ciudades = form.estado ? CIUDADES_POR_ESTADO[form.estado] ?? [] : [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin size={20} weight="duotone" aria-hidden />
              Sucursales
            </CardTitle>
            <CardDescription>
              Tus taquillas. Los pasajeros ven la dirección y el horario para llevar encomiendas y tomar el bus.
            </CardDescription>
          </div>
          {!showForm && (
            <Button onClick={openCreate} size="sm">
              <Plus size={16} className="mr-2" aria-hidden />
              Nueva sucursal
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorCarga && (
          <ErrorState
            compacto
            titulo="No pudimos cargar tus sucursales"
            descripcion={errorCarga}
            onReintentar={() => router.refresh()}
          />
        )}

        {showForm && (
          <form onSubmit={handleSubmit} noValidate className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <p className="font-medium text-sm">
              {editingId ? "Editar sucursal" : "Nueva sucursal"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
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

              <div className="space-y-1.5">
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
                {errores.estado && <p className="text-xs text-destructive-text">{errores.estado}</p>}
              </div>

              <div className="space-y-1.5">
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
                {errores.ciudad && <p className="text-xs text-destructive-text">{errores.ciudad}</p>}
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
                placeholder="0241-1234567"
                error={errores.telefono}
                disabled={guardando}
              />
              <Campo
                id={id("horario")}
                label="Horario de atención (opcional)"
                value={form.horario}
                onChange={(v) => setField("horario", v)}
                placeholder="Lun a sáb 7:00 a. m. – 6:00 p. m."
                error={errores.horario}
                disabled={guardando}
              />
            </div>

            {errorGeneral && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive-light p-3 text-sm text-destructive-deep"
              >
                <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
                <p>{errorGeneral}</p>
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={closeForm} disabled={guardando}>
                <X size={14} className="mr-1" aria-hidden /> Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={guardando}>
                <Check size={14} className="mr-1" aria-hidden />
                {guardando ? "Guardando…" : editingId ? "Guardar cambios" : "Crear sucursal"}
              </Button>
            </div>
          </form>
        )}

        {sucursales.length === 0 && !showForm && !errorCarga && (
          <div className="text-center py-8 space-y-3">
            <p className="text-sm text-muted-foreground">
              Aún no tienes sucursales. Crea la primera: cada empleado y cada encomienda pertenecen a una.
            </p>
            <Button size="sm" onClick={openCreate}>
              <Plus size={16} className="mr-2" aria-hidden />
              Nueva sucursal
            </Button>
          </div>
        )}

        <ul className="space-y-2">
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
                className="flex flex-col gap-3 p-3 rounded-lg border bg-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className={cn("font-medium text-sm truncate", !s.activa && "text-muted-foreground")}>{s.nombre}</p>
                  <p className="text-xs text-muted-foreground">{detalle}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={switchId}
                      checked={s.activa}
                      disabled={cambiandoId === s.id}
                      onCheckedChange={(v) => void cambiarActiva(s, v)}
                    />
                    <Label htmlFor={switchId} className="text-sm font-normal">
                      {s.activa ? "Activa" : "Inactiva"}
                    </Label>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Editar sucursal ${s.nombre}`} onClick={() => openEdit(s)}>
                    <PencilSimple size={16} aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive-text hover:text-destructive-text"
                    aria-label={`Eliminar sucursal ${s.nombre}`}
                    onClick={() => pedirEliminar(s)}
                  >
                    <Trash size={16} aria-hidden />
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
            <div className="space-y-3">
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
            "Dejará de aparecer para los pasajeros y no se podrá recuperar. Si tiene empleados o encomiendas, desactívala en su lugar."
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
    <div className={cn("space-y-1.5", className)}>
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
        <p id={`${id}-error`} className="text-xs text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}
