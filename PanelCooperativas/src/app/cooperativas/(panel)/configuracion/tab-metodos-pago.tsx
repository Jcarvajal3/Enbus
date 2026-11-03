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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreditCard, Plus, PencilSimple, Trash, Eye } from "@phosphor-icons/react";
import { AvisoError } from "@/components/aviso-error";
import { EmptyState } from "@/components/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { avisarError, avisarExito } from "@/lib/avisos";
import {
  crearMetodoPago,
  actualizarMetodoPago,
  cambiarActivoMetodoPago,
  eliminarMetodoPago,
  type MetodoPagoInput,
} from "@/app/cooperativas/(panel)/configuracion/actions";
import type { MetodoPagoCooperativa, TipoMetodoPago } from "@/lib/types/configuracion";
import { requireOnline } from "@/components/connectivity-banner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ErrorState } from "@/components/error-state";
import { humanizeError } from "@/lib/errores";
import { METODO_PAGO } from "@/lib/estados";
import { buscarBanco, mostrarBanco, OPCIONES_BANCO, OTRO_BANCO } from "@/lib/bancos";
import { cedulaValida, formatCedula, formatTelefono, telefonoValido, TELEFONO_ERROR } from "@/lib/ve";
import { CedulaField, TelefonoField } from "@/components/ve-fields";
import { normalizeRif } from "@/lib/rif";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Tipos y formulario
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS: TipoMetodoPago[] = ["PAGO_MOVIL", "TRANSFERENCIA_BANCARIA", "ZELLE", "EFECTIVO"];

const AYUDA_TIPO: Record<TipoMetodoPago, string> = {
  PAGO_MOVIL: "El pasajero paga desde su banco con tu teléfono, banco y cédula.",
  TRANSFERENCIA_BANCARIA: "El pasajero transfiere a tu cuenta de 20 dígitos.",
  ZELLE: "El pasajero paga en dólares a tu correo de Zelle.",
  EFECTIVO: "El pasajero paga en la taquilla. No necesita datos de cuenta.",
};

interface FormState {
  tipo: TipoMetodoPago;
  /** Etiqueta "0134 · Banesco" o OTRO_BANCO. */
  bancoOpcion: string;
  /** Nombre escrito cuando se elige "Otro banco". */
  bancoOtro: string;
  titular: string;
  numero_cuenta: string;
  cedula_rif: string;
  email_zelle: string;
  instrucciones: string;
}

const EMPTY_FORM: FormState = {
  tipo: "PAGO_MOVIL",
  bancoOpcion: "",
  bancoOtro: "",
  titular: "",
  numero_cuenta: "",
  cedula_rif: "",
  email_zelle: "",
  instrucciones: "",
};

type Errores = Partial<Record<"tipo" | "banco" | "titular" | "numero_cuenta" | "cedula_rif" | "email_zelle", string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function bancoDelForm(form: FormState): string | null {
  if (form.bancoOpcion === OTRO_BANCO) return form.bancoOtro.trim() || null;
  return form.bancoOpcion || null;
}

function documentoValido(v: string) {
  return Boolean(normalizeRif(v)) || cedulaValida(v);
}

/** Mismas reglas que el servidor (configuracion/actions.ts): errores por campo. */
function validar(form: FormState): Errores {
  const e: Errores = {};
  const titular = form.titular.trim();
  if (form.tipo === "PAGO_MOVIL" || form.tipo === "TRANSFERENCIA_BANCARIA") {
    if (!bancoDelForm(form)) e.banco = form.bancoOpcion === OTRO_BANCO ? "Escribe el nombre del banco." : "Elige el banco.";
    if (!documentoValido(form.cedula_rif)) e.cedula_rif = "Escribe la cédula o el RIF del titular, por ejemplo V-12345678.";
    if (titular.length < 3) e.titular = "Escribe el nombre del titular.";
  }
  if (form.tipo === "PAGO_MOVIL" && !telefonoValido(form.numero_cuenta)) {
    e.numero_cuenta = TELEFONO_ERROR;
  }
  if (form.tipo === "TRANSFERENCIA_BANCARIA" && form.numero_cuenta.replace(/\D/g, "").length !== 20) {
    e.numero_cuenta = "El número de cuenta debe tener 20 dígitos.";
  }
  if (form.tipo === "ZELLE") {
    if (!EMAIL_RE.test(form.email_zelle.trim())) e.email_zelle = "Escribe el correo de Zelle, por ejemplo pagos@tucooperativa.com.";
    if (titular.length < 3) e.titular = "Escribe el nombre del titular de la cuenta Zelle.";
  }
  return e;
}

function formToInput(form: FormState): MetodoPagoInput {
  return {
    tipo: form.tipo,
    banco: bancoDelForm(form),
    titular: form.titular,
    numero_cuenta: form.numero_cuenta || null,
    cedula_rif: form.cedula_rif || null,
    email_zelle: form.email_zelle || null,
    instrucciones: form.instrucciones || null,
  };
}

/** "Pago Móvil Banesco", "Zelle pagos@…", "Efectivo". */
function nombreMetodo(m: Pick<MetodoPagoCooperativa, "tipo" | "banco" | "email_zelle">) {
  const tipo = METODO_PAGO[m.tipo] ?? m.tipo;
  if (m.tipo === "ZELLE") return m.email_zelle ? `${tipo} ${m.email_zelle}` : tipo;
  if (m.tipo === "EFECTIVO") return tipo;
  const banco = buscarBanco(m.banco)?.nombre ?? m.banco;
  return banco ? `${tipo} ${banco}` : tipo;
}

/** "0102-1234-…-7890" para que se lea bien la cuenta de 20 dígitos. */
function formatCuenta(v: string | null | undefined) {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length === 20 ? `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8, 10)}-${d.slice(10)}` : v ?? "";
}

function formatDocumento(v: string | null | undefined) {
  if (!v) return "";
  return normalizeRif(v) ?? (formatCedula(v) !== "—" ? formatCedula(v) : v);
}

/** Filas tal como las ve el pasajero al pagar (mismo orden que PaymentFlow de la app). */
function filasPasajero(m: {
  tipo: TipoMetodoPago;
  banco: string | null;
  titular: string;
  numero_cuenta: string | null;
  cedula_rif: string | null;
  email_zelle: string | null;
}) {
  const filas: { etiqueta: string; valor: string }[] = [];
  if (m.tipo === "EFECTIVO") return filas;
  if (m.banco) filas.push({ etiqueta: "Banco", valor: mostrarBanco(m.banco) });
  if (m.titular) filas.push({ etiqueta: "Titular", valor: m.titular });
  if (m.tipo === "PAGO_MOVIL" && m.numero_cuenta) {
    filas.push({ etiqueta: "Teléfono", valor: telefonoValido(m.numero_cuenta) ? formatTelefono(m.numero_cuenta) : m.numero_cuenta });
  }
  if (m.tipo === "TRANSFERENCIA_BANCARIA" && m.numero_cuenta) {
    filas.push({ etiqueta: "Nro. de cuenta", valor: formatCuenta(m.numero_cuenta) });
  }
  if (m.tipo === "ZELLE" && m.email_zelle) filas.push({ etiqueta: "Correo Zelle", valor: m.email_zelle });
  if (m.cedula_rif) filas.push({ etiqueta: "C.I. / RIF", valor: formatDocumento(m.cedula_rif) });
  return filas;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab
// ─────────────────────────────────────────────────────────────────────────────

interface MetodosPagoTabProps {
  metodos: MetodoPagoCooperativa[];
  errorCarga?: string | null;
}

export function MetodosPagoTab({ metodos: initialMetodos, errorCarga = null }: MetodosPagoTabProps) {
  const router = useRouter();
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const [metodos, setMetodos] = useState(initialMetodos);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [cambiandoId, setCambiandoId] = useState<string | null>(null);

  // Eliminar (con confirmación). Se conserva el método al cerrar para la animación.
  const [aEliminar, setAEliminar] = useState<MetodoPagoCooperativa | null>(null);
  const [eliminarOpen, setEliminarOpen] = useState(false);
  const [conPagos, setConPagos] = useState(false);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrores((prev) => {
      const campo = key === "bancoOpcion" || key === "bancoOtro" ? "banco" : key;
      if (!(campo in prev)) return prev;
      const siguiente = { ...prev };
      delete siguiente[campo as keyof Errores];
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

  function openEdit(m: MetodoPagoCooperativa) {
    const etiqueta = m.banco ? mostrarBanco(m.banco) : "";
    const enLista = OPCIONES_BANCO.includes(etiqueta);
    setEditingId(m.id);
    setForm({
      tipo: m.tipo,
      bancoOpcion: m.banco ? (enLista ? etiqueta : OTRO_BANCO) : "",
      bancoOtro: m.banco && !enLista ? m.banco : "",
      titular: m.titular,
      numero_cuenta:
        m.tipo === "PAGO_MOVIL" && telefonoValido(m.numero_cuenta ?? "")
          ? formatTelefono(m.numero_cuenta).replace(/\./g, "")
          : m.numero_cuenta ?? "",
      cedula_rif: m.cedula_rif ?? "",
      email_zelle: m.email_zelle ?? "",
      instrucciones: m.instrucciones ?? "",
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
      const primero = Object.keys(encontrados)[0];
      document.getElementById(id(primero))?.focus();
      return;
    }
    setGuardando(true);
    try {
      const input = formToInput(form);
      if (editingId) {
        const res = await requireOnline(() => actualizarMetodoPago(editingId, input))();
        if (!res.ok) {
          if (res.campo) setErrores({ [res.campo]: res.error } as Errores);
          else setErrorGeneral(res.error);
          return;
        }
        setMetodos((prev) => prev.map((m) => (m.id === editingId ? { ...m, ...res.data } : m)));
        avisarExito("Método de pago actualizado.");
      } else {
        const res = await requireOnline(() => crearMetodoPago(input))();
        if (!res.ok) {
          if (res.campo) setErrores({ [res.campo]: res.error } as Errores);
          else setErrorGeneral(res.error);
          return;
        }
        setMetodos((prev) => [...prev, res.data]);
        avisarExito("Método de pago agregado. Los pasajeros ya lo ven.");
      }
      closeForm();
      router.refresh();
    } catch (err: unknown) {
      setErrorGeneral(humanizeError(err, "guardar el método de pago"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(m: MetodoPagoCooperativa, activo: boolean) {
    setCambiandoId(m.id);
    try {
      const res = await requireOnline(() => cambiarActivoMetodoPago(m.id, activo))();
      if (!res.ok) {
        avisarError(res.error);
        return false;
      }
      setMetodos((prev) => prev.map((x) => (x.id === m.id ? { ...x, activo } : x)));
      avisarExito(activo ? `${nombreMetodo(m)} activado.` : `${nombreMetodo(m)} desactivado. Los pasajeros ya no lo ven.`);
      return true;
    } catch (err: unknown) {
      avisarError(humanizeError(err, activo ? "activar el método de pago" : "desactivar el método de pago"));
      return false;
    } finally {
      setCambiandoId(null);
    }
  }

  function pedirEliminar(m: MetodoPagoCooperativa) {
    setConPagos(false);
    setAEliminar(m);
    setEliminarOpen(true);
  }

  async function confirmarEliminar() {
    if (!aEliminar) return { ok: false, error: "No encontramos ese método. Actualiza la página." };
    try {
      const res = await requireOnline(() => eliminarMetodoPago(aEliminar.id))();
      if (!res.ok) {
        if (res.codigo === "TIENE_PAGOS") setConPagos(true);
        return { ok: false, error: res.error };
      }
    } catch (err) {
      return { ok: false, error: humanizeError(err, "eliminar el método de pago") };
    }
    setMetodos((prev) => prev.filter((m) => m.id !== aEliminar.id));
    avisarExito(`${nombreMetodo(aEliminar)} eliminado.`);
    if (editingId === aEliminar.id) closeForm();
    return { ok: true };
  }

  const pideBanco = form.tipo === "PAGO_MOVIL" || form.tipo === "TRANSFERENCIA_BANCARIA";
  const vistaPrevia = formToInput(form);
  const filasPrevia = filasPasajero({ ...vistaPrevia, titular: vistaPrevia.titular.trim() });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Métodos de pago</CardTitle>
        <CardDescription>Los pasajeros solo ven los activos.</CardDescription>
        {!showForm && metodos.length > 0 && (
          <CardAction>
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              Agregar método
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {errorCarga && (
          <ErrorState
            compacto
            titulo="No pudimos cargar tus métodos de pago"
            descripcion={errorCarga}
            onReintentar={() => router.refresh()}
          />
        )}

        {/* Formulario */}
        {showForm && (
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 rounded-md border-border sm:border sm:p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {editingId ? "Editar método de pago" : "Nuevo método de pago"}
            </h3>

            <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
              <div className="grid content-start gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor={id("tipo")}>Tipo</Label>
                  <Select
                    value={form.tipo}
                    onValueChange={(v) => v && setField("tipo", v as TipoMetodoPago)}
                    items={TIPOS.map((t) => ({ value: t, label: METODO_PAGO[t] }))}
                    disabled={guardando}
                  >
                    <SelectTrigger id={id("tipo")} className="w-full sm:w-72">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t} value={t}>{METODO_PAGO[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">{AYUDA_TIPO[form.tipo]}</p>
                </div>

                {pideBanco && (
                  <div className="flex flex-col gap-2 sm:col-span-2">
                    <Label htmlFor={id("banco")}>Banco</Label>
                    <Select
                      value={form.bancoOpcion}
                      onValueChange={(v) => setField("bancoOpcion", v ?? "")}
                      disabled={guardando}
                    >
                      <SelectTrigger
                        id={id("banco")}
                        className="w-full"
                        aria-invalid={errores.banco && form.bancoOpcion !== OTRO_BANCO ? true : undefined}
                      >
                        <SelectValue placeholder="Elige el banco" />
                      </SelectTrigger>
                      <SelectContent>
                        {OPCIONES_BANCO.map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.bancoOpcion === OTRO_BANCO && (
                      <Input
                        id={id("banco-otro")}
                        aria-label="Nombre del banco"
                        placeholder="Nombre del banco"
                        value={form.bancoOtro}
                        disabled={guardando}
                        aria-invalid={errores.banco ? true : undefined}
                        onChange={(e) => setField("bancoOtro", e.target.value)}
                      />
                    )}
                    <ErrorCampo id={id("banco-error")} texto={errores.banco} />
                  </div>
                )}

                {form.tipo === "PAGO_MOVIL" && (
                  <TelefonoField
                    id={id("numero_cuenta")}
                    label="Teléfono de Pago Móvil"
                    value={form.numero_cuenta}
                    onChange={(v) => setField("numero_cuenta", v)}
                    error={errores.numero_cuenta}
                    disabled={guardando}
                  />
                )}

                {form.tipo === "TRANSFERENCIA_BANCARIA" && (
                  <Campo
                    id={id("numero_cuenta")}
                    label="Número de cuenta (20 dígitos)"
                    value={form.numero_cuenta}
                    onChange={(v) => setField("numero_cuenta", v)}
                    inputMode="numeric"
                    placeholder="Ej.: 01340000000000000000"
                    ayuda={
                      form.numero_cuenta.replace(/\D/g, "").length > 0
                        ? `${form.numero_cuenta.replace(/\D/g, "").length} de 20 dígitos`
                        : undefined
                    }
                    error={errores.numero_cuenta}
                    disabled={guardando}
                    className="sm:col-span-2"
                  />
                )}

                {form.tipo === "ZELLE" && (
                  <Campo
                    id={id("email_zelle")}
                    label="Correo de Zelle"
                    value={form.email_zelle}
                    onChange={(v) => setField("email_zelle", v)}
                    type="email"
                    inputMode="email"
                    placeholder="Ej.: pagos@tucooperativa.com"
                    error={errores.email_zelle}
                    disabled={guardando}
                  />
                )}

                {pideBanco && (
                  <CedulaField
                    id={id("cedula_rif")}
                    label="Cédula o RIF del titular"
                    value={form.cedula_rif}
                    onChange={(v) => setField("cedula_rif", v)}
                    letras={["V", "E", "J", "G", "P"]}
                    error={errores.cedula_rif}
                    disabled={guardando}
                  />
                )}

                {form.tipo !== "EFECTIVO" && (
                  <Campo
                    id={id("titular")}
                    label="Titular"
                    value={form.titular}
                    onChange={(v) => setField("titular", v)}
                    placeholder="Ej.: Transporte Los Andes C.A."
                    error={errores.titular}
                    disabled={guardando}
                    className={form.tipo === "ZELLE" ? "" : "sm:col-span-2"}
                  />
                )}

                <div className="flex flex-col gap-2 sm:col-span-2">
                  <Label htmlFor={id("instrucciones")}>
                    {form.tipo === "EFECTIVO" ? "Instrucciones (opcional)" : "Instrucciones para el pasajero (opcional)"}
                  </Label>
                  <Textarea
                    id={id("instrucciones")}
                    value={form.instrucciones}
                    onChange={(e) => setField("instrucciones", e.target.value)}
                    rows={2}
                    maxLength={300}
                    disabled={guardando}
                    placeholder={
                      form.tipo === "EFECTIVO"
                        ? "Ej.: Paga en la taquilla antes de abordar."
                        : "Ej.: En el concepto escribe tu número de boleto."
                    }
                  />
                </div>
              </div>

              {/* Vista previa */}
              <section
                aria-label="Así lo verá el pasajero"
                className="flex flex-col gap-2 self-start rounded-md border border-border bg-muted/50 p-4 text-sm"
              >
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <Eye className="size-4" aria-hidden />
                  Así lo verá el pasajero
                </p>
                <p className="text-xs text-muted-foreground">{METODO_PAGO[form.tipo]}</p>
                {form.tipo === "EFECTIVO" ? (
                  <p className="text-muted-foreground">Paga en efectivo en la taquilla.</p>
                ) : filasPrevia.length === 0 ? (
                  <p className="text-muted-foreground">Completa los datos para ver la vista previa.</p>
                ) : (
                  <dl className="flex flex-col gap-2">
                    {filasPrevia.map((f) => (
                      <div key={f.etiqueta} className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">{f.etiqueta}</dt>
                        <dd className="text-right font-medium break-all text-foreground">{f.valor}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {form.instrucciones.trim() && (
                  <p className="text-xs text-muted-foreground">{form.instrucciones.trim()}</p>
                )}
              </section>
            </div>

            {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={closeForm} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando} aria-busy={guardando || undefined}>
                {guardando && <Spinner size="sm" aria-hidden />}
                {guardando ? "Guardando…" : editingId ? "Guardar cambios" : "Agregar método"}
              </Button>
            </div>
          </form>
        )}

        {/* Lista */}
        {metodos.length === 0 && !showForm && !errorCarga && (
          <EmptyState
            compacto
            icon={CreditCard}
            title="Todavía no tienes métodos de pago"
            description="Agrega uno digital para vender en la app."
            action={
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                Agregar método
              </Button>
            }
          />
        )}
        <ul className="flex flex-col gap-2">
          {metodos.map((m) => {
            const nombre = nombreMetodo(m);
            const detalle = filasPasajero(m)
              .filter((f) => f.etiqueta !== "Banco")
              .map((f) => f.valor)
              .join(" · ");
            const switchId = `${uid}-activo-${m.id}`;
            return (
              <li
                key={m.id}
                className="flex flex-col gap-3 rounded-md border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <p className={cn("truncate text-sm font-medium", m.activo ? "text-foreground" : "text-muted-foreground")}>{nombre}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {m.tipo === "EFECTIVO" ? m.instrucciones || "Pago en la taquilla" : detalle}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      id={switchId}
                      checked={m.activo}
                      disabled={cambiandoId === m.id}
                      onCheckedChange={(v) => void cambiarActivo(m, v)}
                    />
                    <Label htmlFor={switchId} className="w-14 text-sm font-normal">
                      {m.activo ? "Activo" : "Inactivo"}
                    </Label>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Editar ${nombre}`}
                    onClick={() => openEdit(m)}
                  >
                    <PencilSimple aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive-text hover:text-destructive-text"
                    aria-label={`Eliminar ${nombre}`}
                    onClick={() => pedirEliminar(m)}
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
        titulo={aEliminar ? `¿Eliminar ${nombreMetodo(aEliminar)}?` : "¿Eliminar el método de pago?"}
        descripcion={
          conPagos && aEliminar ? (
            <div className="flex flex-col items-start gap-3">
              <p>Si lo desactivas, los pasajeros dejarán de verlo y conservarás sus pagos.</p>
              {aEliminar.activo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={cambiandoId === aEliminar.id}
                  onClick={async () => {
                    const ok = await cambiarActivo(aEliminar, false);
                    if (ok) setEliminarOpen(false);
                  }}
                >
                  {cambiandoId === aEliminar.id ? "Desactivando…" : "Desactivar"}
                </Button>
              ) : (
                <p className="font-medium text-foreground">Ya está desactivado: los pasajeros no lo ven.</p>
              )}
            </div>
          ) : (
            "Los pasajeros dejarán de verlo. No se puede deshacer."
          )
        }
        verbo="Eliminar método"
        verboCargando="Eliminando…"
        onConfirm={confirmarEliminar}
      />
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ErrorCampo({ id, texto }: { id: string; texto?: string }) {
  if (!texto) return null;
  return (
    <p id={id} className="text-sm text-destructive-text">
      {texto}
    </p>
  );
}

function Campo({
  id, label, value, onChange, type = "text", inputMode, placeholder, error, ayuda, disabled, className,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  error?: string;
  ayuda?: string;
  disabled?: boolean;
  className?: string;
}) {
  const descrito = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={descrito}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? (
        <ErrorCampo id={`${id}-error`} texto={error} />
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  );
}
