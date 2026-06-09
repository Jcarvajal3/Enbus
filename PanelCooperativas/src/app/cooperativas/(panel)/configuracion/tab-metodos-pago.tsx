"use client";

import { useState, useTransition } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  CreditCard, Plus, Pencil, Trash, Check, X,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  crearMetodoPago,
  actualizarMetodoPago,
  eliminarMetodoPago,
} from "@/app/cooperativas/(panel)/configuracion/actions";
import type { MetodoPagoCooperativa, TipoMetodoPago } from "@/lib/types/configuracion";
import { requireOnline } from "@/components/connectivity-banner";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_METODO_PAGO: { value: TipoMetodoPago; label: string }[] = [
  { value: "TRANSFERENCIA_BANCARIA", label: "Transferencia Bancaria" },
  { value: "PAGO_MOVIL", label: "Pago Móvil" },
  { value: "ZELLE", label: "Zelle" },
  { value: "EFECTIVO", label: "Efectivo" },
];

const TIPO_LABELS: Record<TipoMetodoPago, string> = Object.fromEntries(
  TIPOS_METODO_PAGO.map((t) => [t.value, t.label])
) as Record<TipoMetodoPago, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

interface FormState {
  tipo: TipoMetodoPago;
  banco: string;
  titular: string;
  numero_cuenta: string;
  cedula_rif: string;
  email_zelle: string;
  instrucciones: string;
}

const EMPTY_FORM: FormState = {
  tipo: "TRANSFERENCIA_BANCARIA",
  banco: "",
  titular: "",
  numero_cuenta: "",
  cedula_rif: "",
  email_zelle: "",
  instrucciones: "",
};

function formToInput(form: FormState) {
  return {
    tipo: form.tipo,
    banco: form.banco || null,
    titular: form.titular,
    numero_cuenta: form.numero_cuenta || null,
    cedula_rif: form.cedula_rif || null,
    email_zelle: form.email_zelle || null,
    instrucciones: form.instrucciones || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab Component
// ─────────────────────────────────────────────────────────────────────────────

interface MetodosPagoTabProps {
  metodos: MetodoPagoCooperativa[];
}

export function MetodosPagoTab({ metodos: initialMetodos }: MetodosPagoTabProps) {
  const [metodos, setMetodos] = useState(initialMetodos);
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

  function openEdit(m: MetodoPagoCooperativa) {
    setEditingId(m.id);
    setForm({
      tipo: m.tipo,
      banco: m.banco ?? "",
      titular: m.titular,
      numero_cuenta: m.numero_cuenta ?? "",
      cedula_rif: m.cedula_rif ?? "",
      email_zelle: m.email_zelle ?? "",
      instrucciones: m.instrucciones ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  function handleSubmit() {
    if (!form.titular.trim()) {
      toast.error("El titular es obligatorio");
      return;
    }
    startTransition(async () => {
      try {
        if (editingId) {
          await requireOnline(() => actualizarMetodoPago(editingId, formToInput(form)))();
          setMetodos((prev) =>
            prev.map((m) =>
              m.id === editingId ? { ...m, ...formToInput(form) } : m
            )
          );
          toast.success("Método de pago actualizado");
        } else {
          const nuevo = await requireOnline(() => crearMetodoPago(formToInput(form)))();
          setMetodos((prev) => [...prev, nuevo]);
          toast.success("Método de pago agregado");
        }
        closeForm();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  function handleToggle(m: MetodoPagoCooperativa) {
    startTransition(async () => {
      try {
        await requireOnline(() => actualizarMetodoPago(m.id, { activo: !m.activo }))();
        setMetodos((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, activo: !x.activo } : x))
        );
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Error");
      }
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      try {
        await requireOnline(() => eliminarMetodoPago(id))();
        setMetodos((prev) => prev.filter((m) => m.id !== id));
        toast.success("Método de pago eliminado");
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
              <CreditCard size={20} weight="duotone" />
              Métodos de Pago
            </CardTitle>
            <CardDescription>
              Configure los métodos de pago disponibles para sus clientes.
            </CardDescription>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus size={16} className="mr-2" />
            Agregar Método
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline form */}
        {showForm && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <p className="font-medium text-sm">
              {editingId ? "Editar método de pago" : "Nuevo método de pago"}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">Tipo *</label>
                <select
                  value={form.tipo}
                  onChange={(e) => setField("tipo", e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {TIPOS_METODO_PAGO.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <FormField label="Titular *" value={form.titular} onChange={(v) => setField("titular", v)} />
              <FormField label="Banco" value={form.banco} onChange={(v) => setField("banco", v)} />
              <FormField label="Número de Cuenta" value={form.numero_cuenta} onChange={(v) => setField("numero_cuenta", v)} />
              <FormField label="Cédula / RIF" value={form.cedula_rif} onChange={(v) => setField("cedula_rif", v)} />
              <FormField label="Email Zelle" value={form.email_zelle} onChange={(v) => setField("email_zelle", v)} type="email" />
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-medium">Instrucciones</label>
                <textarea
                  value={form.instrucciones}
                  onChange={(e) => setField("instrucciones", e.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  placeholder="Instrucciones adicionales para el cliente..."
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

        {/* List */}
        {metodos.length === 0 && !showForm && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No hay métodos de pago configurados. Agregue el primero.
          </p>
        )}
        <div className="space-y-2">
          {metodos.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${m.activo ? "bg-emerald-500" : "bg-muted-foreground"}`} />
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{TIPO_LABELS[m.tipo]}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.titular}{m.banco ? ` · ${m.banco}` : ""}{m.numero_cuenta ? ` · ${m.numero_cuenta}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge
                  variant={m.activo ? "default" : "secondary"}
                  className="text-xs cursor-pointer"
                  onClick={() => handleToggle(m)}
                >
                  {m.activo ? "Activo" : "Inactivo"}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                  <Pencil size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => handleDelete(m.id)}
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
  label, value, onChange, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
