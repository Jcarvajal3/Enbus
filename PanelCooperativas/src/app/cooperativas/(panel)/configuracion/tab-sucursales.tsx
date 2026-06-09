"use client";

import { useState, useTransition } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus, Pencil, Trash, Check, X } from "@phosphor-icons/react";
import { toast } from "sonner";
import { crearSucursal, actualizarSucursal, eliminarSucursal } from "@/app/cooperativas/(panel)/configuracion/actions";
import type { Sucursal } from "@/lib/types/configuracion";
import { requireOnline } from "@/components/connectivity-banner";

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  nombre: string;
  estado: string;
  ciudad: string;
  direccion: string;
  telefono: string;
}

const EMPTY_FORM: FormState = {
  nombre: "",
  estado: "",
  ciudad: "",
  direccion: "",
  telefono: "",
};

function formToInput(form: FormState) {
  return {
    nombre: form.nombre,
    estado: form.estado,
    ciudad: form.ciudad,
    direccion: form.direccion || null,
    telefono: form.telefono || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

interface SucursalesTabProps {
  sucursales: Sucursal[];
}

export function SucursalesTab({ sucursales: initialSucursales }: SucursalesTabProps) {
  const [sucursales, setSucursales] = useState(initialSucursales);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  const setField = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(s: Sucursal) {
    setEditingId(s.id);
    setForm({
      nombre: s.nombre,
      estado: s.estado,
      ciudad: s.ciudad,
      direccion: s.direccion ?? "",
      telefono: s.telefono ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function handleSubmit() {
    if (!form.nombre.trim() || !form.estado.trim() || !form.ciudad.trim()) {
      toast.error("Nombre, estado y ciudad son obligatorios");
      return;
    }
    startTransition(async () => {
      try {
        if (editingId) {
          await requireOnline(() => actualizarSucursal(editingId, formToInput(form)))();
          setSucursales((prev) =>
            prev.map((s) =>
              s.id === editingId ? { ...s, ...formToInput(form) } : s
            )
          );
          toast.success("Sucursal actualizada");
        } else {
          const nueva = await requireOnline(() => crearSucursal(formToInput(form)))();
          setSucursales((prev) => [...prev, nueva]);
          toast.success("Sucursal creada");
        }
        closeForm();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  function handleToggle(s: Sucursal) {
    startTransition(async () => {
      try {
        await requireOnline(() => actualizarSucursal(s.id, { activa: !s.activa }))();
        setSucursales((prev) =>
          prev.map((x) => (x.id === s.id ? { ...x, activa: !x.activa } : x))
        );
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await requireOnline(() => eliminarSucursal(id))();
        setSucursales((prev) => prev.filter((s) => s.id !== id));
        toast.success("Sucursal eliminada");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapPin size={20} weight="duotone" />
              Sucursales
            </CardTitle>
            <CardDescription>
              Gestione las ubicaciones físicas de su cooperativa.
            </CardDescription>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus size={16} className="mr-2" />
            Nueva Sucursal
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline form */}
        {showForm && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <p className="font-medium text-sm">
              {editingId ? "Editar sucursal" : "Nueva sucursal"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Nombre *" value={form.nombre} onChange={(v) => setField("nombre", v)} />
              <FormField label="Estado *" value={form.estado} onChange={(v) => setField("estado", v)} placeholder="Ej: Carabobo" />
              <FormField label="Ciudad *" value={form.ciudad} onChange={(v) => setField("ciudad", v)} placeholder="Ej: Valencia" />
              <FormField label="Teléfono" value={form.telefono} onChange={(v) => setField("telefono", v)} type="tel" />
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-medium">Dirección</label>
                <Input
                  value={form.direccion}
                  onChange={(e) => setField("direccion", e.target.value)}
                  placeholder="Av. Bolívar, Centro Comercial..."
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={closeForm} disabled={isPending}>
                <X size={14} className="mr-1" /> Cancelar
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={isPending}>
                <Check size={14} className="mr-1" />
                {isPending ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {sucursales.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay sucursales registradas. Agregue la primera.
          </p>
        )}

        {/* List */}
        <div className="space-y-2">
          {sucursales.map((s) => (
            <div
              key={s.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.activa ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{s.nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.ciudad}, {s.estado}
                    {s.direccion ? ` · ${s.direccion}` : ""}
                    {s.telefono ? ` · ${s.telefono}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={s.activa ? "default" : "secondary"}
                  className="text-xs cursor-pointer"
                  onClick={() => handleToggle(s)}
                >
                  {s.activa ? "Activa" : "Inactiva"}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}>
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(s.id)}
                  disabled={isPending}
                >
                  <Trash size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FormField({
  label, value, onChange, type = "text", placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
