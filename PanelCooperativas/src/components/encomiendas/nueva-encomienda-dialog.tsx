"use client";

// ─── Nueva encomienda (cliente sin la app) · #33, P-27 ──────────────────────
// Tres pasos en <form> (Enter = siguiente): 1 Quién envía · 2 Quién recibe ·
// 3 Paquete. "Registrar y recibir" llama a fn_registrar_encomienda_taquilla con
// una clave de idempotencia creada al abrir (reintentar no duplica). El
// resultado muestra el PIN de retiro, "Enviar PIN por WhatsApp", "Imprimir guía"
// y "Continuar" → foto → cobro (si paga quien envía).

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle, Printer, WhatsappLogo, WarningCircle } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/error-state";
import { Monto } from "@/components/monto";
import { requireOnline } from "@/components/connectivity-banner";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { codigoEB, humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import {
  CEDULA_ERROR,
  CEDULA_PLACEHOLDER,
  TELEFONO_ERROR,
  TELEFONO_PLACEHOLDER,
  cedulaParaGuardar,
  cedulaValida,
  formatCedula,
  telefonoParaGuardar,
  telefonoValido,
  telefonoWhatsApp,
} from "@/lib/ve";
import { CIUDADES_POR_ESTADO, ESTADOS_VENEZUELA } from "@/lib/data/venezuela";
import { printer } from "@/lib/printing/bluetooth";
import { MSG_VENTANA_BLOQUEADA, imprimirGuiaNavegador, printGuiaEncomienda } from "@/lib/printing/print-helpers";
import type { Encomienda, ModalidadPago, PersonaEncomienda, RegistroEncomiendaTaquilla } from "@/lib/types/encomiendas";
import type { CotizacionEnvioPublica } from "@/lib/types/pagos";
import { cn } from "@/lib/utils";
import { normalizarCiudad } from "@/app/cooperativas/(panel)/recepcion-destino/sucursal";
import {
  datosNuevaEncomienda,
  registrarEncomiendaTaquilla,
  type DatosAltaEncomienda,
  type RutaAlta,
} from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";

type Paso = 1 | 2 | 3;
type CampoPersona = "nombre" | "cedula" | "telefono";
type CampoPaquete = "sucursal" | "destino" | "contenido" | "peso" | "valor" | "modalidad";
type Errores<K extends string> = Partial<Record<K, string>>;

const PASOS: { n: Paso; titulo: string }[] = [
  { n: 1, titulo: "Quién envía" },
  { n: 2, titulo: "Quién recibe" },
  { n: 3, titulo: "Paquete" },
];

const PERSONA_VACIA: PersonaEncomienda = { nombre: "", cedula: "", telefono: "" };

function nuevaClave(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/** "2,5" o "2.5" → 2.5; null si no es un número. */
function parseNumero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** "carabobo" → "Carabobo"; "valencia" (de Carabobo) → "Valencia". */
function etiquetaEstadoGeo(estado: string): string {
  return ESTADOS_VENEZUELA.find((e) => e.value === estado)?.label ?? capitalizar(estado);
}
function etiquetaCiudad(estado: string, ciudad: string): string {
  return CIUDADES_POR_ESTADO[estado]?.find((c) => c.value === ciudad)?.label ?? capitalizar(ciudad);
}
function capitalizar(valor: string): string {
  return valor
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
/** "Valencia (Carabobo)" */
function etiquetaDestino(r: RutaAlta): string {
  return `${etiquetaCiudad(r.estado_destino, r.ciudad_destino)} (${etiquetaEstadoGeo(r.estado_destino)})`;
}

function validarPersona(p: PersonaEncomienda, quien: "envía" | "recibe"): Errores<CampoPersona> {
  const e: Errores<CampoPersona> = {};
  if (p.nombre.trim().replace(/\s+/g, " ").length < 3) e.nombre = `Escribe el nombre y apellido de quien ${quien}.`;
  if (!cedulaValida(p.cedula)) e.cedula = CEDULA_ERROR;
  if (!telefonoValido(p.telefono)) e.telefono = TELEFONO_ERROR;
  return e;
}

type Props = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** "Continuar" tras registrar: la página sigue con la foto y el cobro. */
  onContinuar(encomienda: Encomienda): void;
  /** Se registró una encomienda (para recargar la lista). */
  onRegistrada?(): void;
};

export function NuevaEncomiendaDialog({ open, onOpenChange, onContinuar, onRegistrada }: Props) {
  // Mientras se registra no se puede cerrar (ni con Esc ni con clic fuera).
  const enviandoRef = useRef(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        if (!abierto && enviandoRef.current) return;
        onOpenChange(abierto);
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[620px]">
        {/* Montado al abrir: cada apertura empieza vacía y con una clave nueva. */}
        {open && (
          <Contenido
            enviandoRef={enviandoRef}
            onCerrar={() => onOpenChange(false)}
            onContinuar={onContinuar}
            onRegistrada={onRegistrada}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Contenido({
  enviandoRef,
  onCerrar,
  onContinuar,
  onRegistrada,
}: {
  enviandoRef: React.RefObject<boolean>;
  onCerrar(): void;
  onContinuar(encomienda: Encomienda): void;
  onRegistrada?(): void;
}) {
  const { user } = useUser();
  const supabase = useMemo(() => createClient(), []);
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const esAdmin = user.role === "admin_cooperativa";
  const [idemKey] = useState(nuevaClave);

  // ── Datos: sucursales y rutas ──
  const [datos, setDatos] = useState<DatosAltaEncomienda | null>(null);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const cargarDatos = async () => {
    setErrorDatos(null);
    try {
      const res = await datosNuevaEncomienda();
      if (res.success) {
        setDatos(res.data);
        setSucursalId((actual) => {
          if (actual) return actual;
          if (res.data.sucursalUsuarioId) return res.data.sucursalUsuarioId;
          return res.data.sucursales.length === 1 ? res.data.sucursales[0].id : "";
        });
      } else {
        setErrorDatos(res.error);
      }
    } catch (err) {
      setErrorDatos(humanizeError(err, "cargar las sucursales y las rutas"));
    }
  };
  const cargarRef = useRef(cargarDatos);
  useEffect(() => {
    void cargarRef.current();
  }, []);

  // ── Formulario ──
  const [paso, setPaso] = useState<Paso>(1);
  const [remitente, setRemitente] = useState<PersonaEncomienda>(PERSONA_VACIA);
  const [destinatario, setDestinatario] = useState<PersonaEncomienda>(PERSONA_VACIA);
  const [errRemitente, setErrRemitente] = useState<Errores<CampoPersona>>({});
  const [errDestinatario, setErrDestinatario] = useState<Errores<CampoPersona>>({});
  const [sucursalId, setSucursalId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [contenido, setContenido] = useState("");
  const [peso, setPeso] = useState("");
  const [valor, setValor] = useState("");
  const [modalidad, setModalidad] = useState<ModalidadPago | null>(null);
  const [errPaquete, setErrPaquete] = useState<Errores<CampoPaquete>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ registro: RegistroEncomiendaTaquilla; encomienda: Encomienda } | null>(null);

  const sucursal = datos?.sucursales.find((s) => s.id === sucursalId) ?? null;
  const elegirSucursal = !datos?.sucursalUsuarioId;

  // Destinos: rutas activas que salen de la ciudad de la sucursal (una por destino).
  const destinos = useMemo(() => {
    if (!datos || !sucursal) return [] as RutaAlta[];
    const ciudad = normalizarCiudad(sucursal.ciudad);
    const vistos = new Set<string>();
    return datos.rutas.filter((r) => {
      if (normalizarCiudad(r.ciudad_origen) !== ciudad) return false;
      const clave = normalizarCiudad(r.ciudad_destino);
      if (vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  }, [datos, sucursal]);
  const ruta = destinos.find((r) => r.id === rutaId) ?? null;
  const itemsDestino = useMemo(
    () => Object.fromEntries(destinos.map((r) => [r.id, etiquetaDestino(r)])),
    [destinos]
  );
  const itemsSucursal = useMemo(
    () => Object.fromEntries((datos?.sucursales ?? []).map((s) => [s.id, `${s.nombre} · ${capitalizar(s.ciudad)}`])),
    [datos]
  );

  const pesoNum = parseNumero(peso);

  // ── Estimado con la tarifa vigente (fn_cotizar_envio_publico, solo esta cooperativa) ──
  const [estimado, setEstimado] = useState<
    | { estado: "listo"; clave: string; usd: number; bs: number | null; tasa: { tasa: number; fecha: string } | null; max: number }
    | { estado: "sin-opcion" | "error"; clave: string; mensaje: string; max?: number }
    | null
  >(null);
  const claveEstimado = ruta && pesoNum != null && pesoNum > 0 ? `${ruta.id}|${pesoNum}` : null;
  useEffect(() => {
    if (!claveEstimado || !ruta || pesoNum == null) return;
    let vigente = true;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase.rpc("fn_cotizar_envio_publico", {
          p_peso_kg: pesoNum,
          p_ciudad_origen: ruta.ciudad_origen,
          p_ciudad_destino: ruta.ciudad_destino,
        });
        if (!vigente) return;
        if (error) {
          const max = Number((error as { details?: string }).details?.match(/"peso_max_kg"\s*:\s*([\d.]+)/)?.[1]);
          setEstimado({
            estado: "error",
            clave: claveEstimado,
            mensaje:
              codigoEB(error) === "EB_PESO_INVALIDO"
                ? humanizeError(error)
                : "No pudimos calcular el estimado. El costo exacto se calcula al registrar.",
            max: Number.isFinite(max) ? max : undefined,
          });
          return;
        }
        const c = data as CotizacionEnvioPublica;
        const propia = c?.opciones?.find((o) => o.cooperativa_id === user.cooperativa_id);
        if (!propia) {
          setEstimado({
            estado: "sin-opcion",
            clave: claveEstimado,
            mensaje: "El costo exacto se calcula al registrar, con la tarifa vigente.",
            max: Number(c?.peso_max_kg) || undefined,
          });
          return;
        }
        setEstimado({
          estado: "listo",
          clave: claveEstimado,
          usd: Number(propia.costo_usd),
          bs: propia.costo_bs != null ? Number(propia.costo_bs) : null,
          tasa: c.tasa_bcv && c.tasa_bcv_fecha ? { tasa: Number(c.tasa_bcv), fecha: c.tasa_bcv_fecha } : null,
          max: Number(c.peso_max_kg),
        });
      } catch {
        if (vigente) {
          setEstimado({
            estado: "error",
            clave: claveEstimado,
            mensaje: "No pudimos calcular el estimado. El costo exacto se calcula al registrar.",
          });
        }
      }
    }, 450);
    return () => {
      vigente = false;
      clearTimeout(timer);
    };
  }, [claveEstimado, ruta, pesoNum, supabase, user.cooperativa_id]);
  const estimadoVigente = estimado && estimado.clave === claveEstimado ? estimado : null;

  // ── Pasos ──
  const primerCampo = useRef<HTMLInputElement>(null);
  const pesoRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (resultado) return;
    const t = setTimeout(() => (paso === 3 ? pesoRef.current : primerCampo.current)?.focus(), 50);
    return () => clearTimeout(t);
  }, [paso, resultado]);

  const siguientePersona = (e: FormEvent) => {
    e.preventDefault();
    // El aviso del servidor que hizo volver a este paso deja de aplicar al avanzar.
    if (paso === 1) {
      const errores = validarPersona(remitente, "envía");
      setErrRemitente(errores);
      if (Object.keys(errores).length === 0) {
        setErrorGeneral(null);
        setPaso(2);
      }
    } else if (paso === 2) {
      const errores = validarPersona(destinatario, "recibe");
      setErrDestinatario(errores);
      if (Object.keys(errores).length === 0) {
        setErrorGeneral(null);
        setPaso(3);
      }
    }
  };

  const validarPaquete = (): Errores<CampoPaquete> => {
    const e: Errores<CampoPaquete> = {};
    if (!sucursal) e.sucursal = "Elige la sucursal en la que recibes la encomienda.";
    if (!ruta) e.destino = "Elige el destino del envío.";
    if (contenido.trim().length < 3) e.contenido = "Describe el contenido del paquete (mínimo 3 letras).";
    const max = estimadoVigente?.max;
    if (pesoNum == null || pesoNum <= 0) e.peso = "Escribe el peso en kilos, por ejemplo 2,5.";
    else if (max && pesoNum > max) e.peso = `El peso máximo es ${max} kg.`;
    const v = valor.trim() ? parseNumero(valor) : null;
    if (valor.trim() && (v == null || v < 0)) e.valor = "Escribe el valor en dólares, por ejemplo 40.";
    if (!modalidad) e.modalidad = "Elige quién paga el envío.";
    return e;
  };

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    if (enviandoRef.current) return;
    const errores = validarPaquete();
    setErrPaquete(errores);
    setErrorGeneral(null);
    if (Object.keys(errores).length > 0 || !ruta || !modalidad || pesoNum == null) return;

    enviandoRef.current = true;
    setEnviando(true);
    try {
      const res = await requireOnline(() =>
        registrarEncomiendaTaquilla({
          rutaId: ruta.id,
          remitente,
          destinatario,
          descripcion: contenido,
          valorDeclarado: valor.trim() ? parseNumero(valor) : null,
          modalidad,
          pesoKg: pesoNum,
          idemKey,
          sucursalId: elegirSucursal ? sucursalId : null,
        })
      )();
      if (!res.success) {
        const campo = res.detalle?.campo;
        if (campo === "remitente") {
          setPaso(1);
          setErrorGeneral(res.error);
        } else if (campo === "destinatario") {
          setPaso(2);
          setErrorGeneral(res.error);
        } else if (campo === "peso" || res.codigo === "EB_PESO_INVALIDO") {
          setErrPaquete({ peso: res.error });
        } else if (campo === "destino") {
          setErrPaquete({ destino: res.error });
        } else if (campo === "descripcion") {
          setErrPaquete({ contenido: res.error });
        } else if (campo === "valor_declarado") {
          setErrPaquete({ valor: res.error });
        } else if (campo === "modalidad") {
          setErrPaquete({ modalidad: res.error });
        } else if (campo === "sucursal") {
          setErrPaquete({ sucursal: res.error });
        } else {
          setErrorGeneral(res.error);
        }
        return;
      }

      const r = res.data;
      const ahora = new Date().toISOString();
      const encomienda: Encomienda = {
        id: r.encomienda_id,
        tracking_id: r.tracking_id,
        sender_id: user.id,
        receiver_nombre: destinatario.nombre.trim(),
        receiver_telefono: telefonoParaGuardar(destinatario.telefono) ?? destinatario.telefono,
        receiver_cedula_rif: cedulaParaGuardar(destinatario.cedula) ?? destinatario.cedula,
        cooperativa_id: user.cooperativa_id,
        estado_origen: ruta.estado_origen,
        ciudad_origen: ruta.ciudad_origen,
        estado_destino: ruta.estado_destino,
        ciudad_destino: ruta.ciudad_destino,
        sucursal_origen_id: sucursal?.id ?? null,
        descripcion_contenido: contenido.trim(),
        peso_kg: pesoNum,
        costo_calculado: r.costo_usd != null ? Number(r.costo_usd) : null,
        modalidad_pago: r.modalidad_pago ?? modalidad,
        estado: r.estado ?? "POR_PAGAR",
        foto_evidencia_url: null,
        qr_data: null,
        created_at: ahora,
        updated_at: ahora,
        valor_declarado: valor.trim() ? parseNumero(valor) : null,
        pin_retiro: r.pin_retiro,
        origen_registro: "TAQUILLA",
        remitente_nombre: remitente.nombre.trim(),
        remitente_cedula: cedulaParaGuardar(remitente.cedula) ?? remitente.cedula,
        remitente_telefono: telefonoParaGuardar(remitente.telefono) ?? remitente.telefono,
      };
      setResultado({ registro: r, encomienda });
      onRegistrada?.();
      if (r.repetido) toast.info("Esta encomienda ya estaba registrada: no se creó otra.");
    } catch (err) {
      setErrorGeneral(humanizeError(err, "registrar la encomienda"));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  // ── Resultado ──
  if (resultado) {
    return (
      <Resultado
        registro={resultado.registro}
        encomienda={resultado.encomienda}
        cooperativa={user.cooperativa_nombre ?? ""}
        onContinuar={() => onContinuar(resultado.encomienda)}
      />
    );
  }

  const indicador = (
    <ol className="flex items-center gap-2 text-xs" aria-label="Pasos">
      {PASOS.map((p) => (
        <li
          key={p.n}
          aria-current={p.n === paso ? "step" : undefined}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
            p.n === paso ? "border-foreground bg-foreground text-background" : p.n < paso ? "text-foreground" : "text-muted-foreground"
          )}
        >
          <span className="font-semibold">{p.n}</span> {p.titulo}
        </li>
      ))}
    </ol>
  );

  const errorBanner = errorGeneral && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text">
      <WarningCircle className="mt-0.5 h-4 w-4 shrink-0" weight="fill" aria-hidden />
      {errorGeneral}
    </p>
  );

  const campoPersona = (
    persona: PersonaEncomienda,
    setPersona: (p: PersonaEncomienda) => void,
    errores: Errores<CampoPersona>,
    setErrores: (e: Errores<CampoPersona>) => void,
    prefijo: string
  ) => {
    const cambiar = (campo: CampoPersona, valorCampo: string) => {
      setPersona({ ...persona, [campo]: valorCampo });
      if (errores[campo]) setErrores({ ...errores, [campo]: undefined });
    };
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id={id(`${prefijo}-nombre`)} etiqueta="Nombre y apellido" error={errores.nombre} className="sm:col-span-2">
          <Input
            ref={primerCampo}
            id={id(`${prefijo}-nombre`)}
            autoComplete="off"
            value={persona.nombre}
            maxLength={120}
            aria-invalid={errores.nombre ? true : undefined}
            aria-describedby={errores.nombre ? id(`${prefijo}-nombre-error`) : undefined}
            onChange={(e) => cambiar("nombre", e.target.value)}
          />
        </Campo>
        <Campo id={id(`${prefijo}-cedula`)} etiqueta="Cédula" error={errores.cedula}>
          <Input
            id={id(`${prefijo}-cedula`)}
            autoComplete="off"
            placeholder={CEDULA_PLACEHOLDER}
            value={persona.cedula}
            maxLength={16}
            aria-invalid={errores.cedula ? true : undefined}
            aria-describedby={errores.cedula ? id(`${prefijo}-cedula-error`) : undefined}
            onChange={(e) => cambiar("cedula", e.target.value)}
            onBlur={() => {
              const n = cedulaParaGuardar(persona.cedula);
              if (n) cambiar("cedula", n);
            }}
          />
        </Campo>
        <Campo id={id(`${prefijo}-telefono`)} etiqueta="Teléfono" error={errores.telefono}>
          <Input
            id={id(`${prefijo}-telefono`)}
            type="tel"
            inputMode="tel"
            autoComplete="off"
            placeholder={TELEFONO_PLACEHOLDER}
            value={persona.telefono}
            maxLength={20}
            aria-invalid={errores.telefono ? true : undefined}
            aria-describedby={errores.telefono ? id(`${prefijo}-telefono-error`) : undefined}
            onChange={(e) => cambiar("telefono", e.target.value)}
            onBlur={() => {
              const n = telefonoParaGuardar(persona.telefono);
              if (n) cambiar("telefono", n);
            }}
          />
        </Campo>
      </div>
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nueva encomienda (sin app)</DialogTitle>
        <DialogDescription>
          Para clientes que traen el paquete sin haberlo registrado en la app. Se registra, se pesa y queda recibida.
        </DialogDescription>
      </DialogHeader>
      {indicador}

      {paso === 1 && (
        <form onSubmit={siguientePersona} noValidate className="grid gap-4">
          <p className="text-sm font-medium">Datos de quien envía</p>
          {campoPersona(remitente, setRemitente, errRemitente, setErrRemitente, "rem")}
          {errorBanner}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit">Siguiente</Button>
          </DialogFooter>
        </form>
      )}

      {paso === 2 && (
        <form onSubmit={siguientePersona} noValidate className="grid gap-4">
          <p className="text-sm font-medium">Datos de quien recibe</p>
          <p className="-mt-2 text-xs text-muted-foreground">
            Retirará el paquete en el destino con esta cédula y el PIN de retiro.
          </p>
          {campoPersona(destinatario, setDestinatario, errDestinatario, setErrDestinatario, "des")}
          {errorBanner}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPaso(1)}>
              Atrás
            </Button>
            <Button type="submit">Siguiente</Button>
          </DialogFooter>
        </form>
      )}

      {paso === 3 && (
        <form onSubmit={registrar} noValidate className="grid gap-4">
          {errorDatos && !datos ? (
            <ErrorState compacto titulo="No pudimos cargar las rutas" descripcion={errorDatos} onReintentar={cargarDatos} />
          ) : !datos ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner size="sm" /> Cargando sucursales y rutas…
            </p>
          ) : datos.sucursales.length === 0 ? (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              Tu cooperativa no tiene sucursales activas.{" "}
              {esAdmin ? (
                <Link href="/cooperativas/configuracion?tab=sucursales" className="font-medium text-foreground underline underline-offset-4">
                  Crea una sucursal
                </Link>
              ) : (
                "Pídele al administrador que cree una sucursal."
              )}
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {elegirSucursal && (
                <Campo id={id("sucursal")} etiqueta="Sucursal donde recibes" error={errPaquete.sucursal} className="sm:col-span-2">
                  <Select
                    value={sucursalId}
                    items={itemsSucursal}
                    onValueChange={(v) => {
                      setSucursalId(v ?? "");
                      setRutaId("");
                      setErrPaquete((p) => ({ ...p, sucursal: undefined, destino: undefined }));
                    }}
                  >
                    <SelectTrigger id={id("sucursal")} className="w-full" aria-invalid={errPaquete.sucursal ? true : undefined}>
                      <SelectValue placeholder="Elige la sucursal" />
                    </SelectTrigger>
                    <SelectContent>
                      {datos.sucursales.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {itemsSucursal[s.id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              )}

              <Campo id={id("destino")} etiqueta="Destino" error={errPaquete.destino} className="sm:col-span-2">
                {sucursal && destinos.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    No hay rutas activas que salgan de {capitalizar(sucursal.ciudad)}.{" "}
                    {esAdmin ? (
                      <Link href="/cooperativas/rutas" className="font-medium text-foreground underline underline-offset-4">
                        Crear ruta
                      </Link>
                    ) : (
                      "Pídele al administrador que cree la ruta."
                    )}
                  </p>
                ) : (
                  <Select
                    value={rutaId}
                    items={itemsDestino}
                    disabled={!sucursal}
                    onValueChange={(v) => {
                      setRutaId(v ?? "");
                      setErrPaquete((p) => ({ ...p, destino: undefined }));
                    }}
                  >
                    <SelectTrigger id={id("destino")} className="w-full" aria-invalid={errPaquete.destino ? true : undefined}>
                      <SelectValue placeholder={sucursal ? "Elige la ciudad de destino" : "Primero elige la sucursal"} />
                    </SelectTrigger>
                    <SelectContent>
                      {destinos.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {itemsDestino[r.id]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Campo>

              <Campo id={id("contenido")} etiqueta="Contenido" error={errPaquete.contenido} className="sm:col-span-2">
                <Input
                  id={id("contenido")}
                  autoComplete="off"
                  placeholder="Por ejemplo: ropa y zapatos"
                  maxLength={500}
                  value={contenido}
                  aria-invalid={errPaquete.contenido ? true : undefined}
                  onChange={(e) => {
                    setContenido(e.target.value);
                    setErrPaquete((p) => ({ ...p, contenido: undefined }));
                  }}
                />
              </Campo>

              <Campo
                id={id("peso")}
                etiqueta="Peso (kg)"
                error={errPaquete.peso}
                ayuda={estimadoVigente?.max ? `Máximo ${estimadoVigente.max} kg.` : "Pesa el paquete y escribe el peso."}
              >
                <Input
                  ref={pesoRef}
                  id={id("peso")}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0,00"
                  value={peso}
                  aria-invalid={errPaquete.peso ? true : undefined}
                  onChange={(e) => {
                    setPeso(e.target.value);
                    setErrPaquete((p) => ({ ...p, peso: undefined }));
                  }}
                />
              </Campo>

              <Campo id={id("valor")} etiqueta="Valor declarado (USD, opcional)" error={errPaquete.valor}>
                <Input
                  id={id("valor")}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={valor}
                  aria-invalid={errPaquete.valor ? true : undefined}
                  onChange={(e) => {
                    setValor(e.target.value);
                    setErrPaquete((p) => ({ ...p, valor: undefined }));
                  }}
                />
              </Campo>

              <fieldset className="grid gap-2 sm:col-span-2">
                <legend className="mb-2 text-sm font-medium">¿Quién paga?</legend>
                <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-invalid={errPaquete.modalidad ? true : undefined}>
                  {(
                    [
                      ["ORIGEN", "Paga al enviar (ahora)", "Cobras el envío al terminar de recibirlo."],
                      ["DESTINO", "Paga al retirar", "Quien recibe paga en la oficina de destino."],
                    ] as const
                  ).map(([valorRadio, titulo, ayuda]) => (
                    <label
                      key={valorRadio}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        modalidad === valorRadio ? "border-foreground bg-muted/60" : "hover:bg-muted/40"
                      )}
                    >
                      <input
                        type="radio"
                        name={id("modalidad")}
                        value={valorRadio}
                        checked={modalidad === valorRadio}
                        onChange={() => {
                          setModalidad(valorRadio);
                          setErrPaquete((p) => ({ ...p, modalidad: undefined }));
                        }}
                        className="mt-0.5 accent-foreground"
                      />
                      <span>
                        <span className="block font-medium">{titulo}</span>
                        <span className="block text-xs text-muted-foreground">{ayuda}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {errPaquete.modalidad && <p className="text-sm text-destructive-text">{errPaquete.modalidad}</p>}
              </fieldset>

              <div aria-live="polite" className="flex min-h-[72px] flex-col justify-center rounded-xl border bg-muted/40 p-3 text-sm sm:col-span-2">
                <p className="mb-1 text-muted-foreground">Costo estimado del envío</p>
                {!claveEstimado ? (
                  <p className="text-muted-foreground">Elige el destino y escribe el peso para estimarlo.</p>
                ) : !estimadoVigente ? (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Spinner size="sm" /> Calculando…
                  </p>
                ) : estimadoVigente.estado === "listo" ? (
                  <Monto usd={estimadoVigente.usd} bs={estimadoVigente.bs} tasa={estimadoVigente.tasa} size="lg" />
                ) : (
                  <p className="text-muted-foreground">{estimadoVigente.mensaje}</p>
                )}
              </div>
            </div>
          )}

          {errorBanner}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPaso(2)} disabled={enviando}>
              Atrás
            </Button>
            <Button type="submit" disabled={enviando || !datos || datos.sucursales.length === 0} aria-busy={enviando || undefined}>
              {enviando && <Spinner size="sm" className="mr-1" />}
              {enviando ? "Registrando…" : "Registrar y recibir"}
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

function Campo({
  id,
  etiqueta,
  error,
  ayuda,
  className,
  children,
}: {
  id: string;
  etiqueta: string;
  error?: string;
  ayuda?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive-text">
          {error}
        </p>
      ) : ayuda ? (
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      ) : null}
    </div>
  );
}

function Resultado({
  registro,
  encomienda,
  cooperativa,
  onContinuar,
}: {
  registro: RegistroEncomiendaTaquilla;
  encomienda: Encomienda;
  cooperativa: string;
  onContinuar(): void;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const pin = registro.pin_retiro;
  const destinatario = encomienda.receiver_nombre;
  const wa = telefonoWhatsApp(encomienda.receiver_telefono);
  const ciudad = capitalizar(encomienda.ciudad_destino);
  const mensaje =
    `Hola ${destinatario}, ${encomienda.remitente_nombre ? `${encomienda.remitente_nombre} te envió` : "te enviaron"} una encomienda` +
    `${cooperativa ? ` por ${cooperativa}` : ""} (${encomienda.tracking_id}) hacia ${ciudad}. ` +
    `Para retirarla presenta tu cédula ${formatCedula(encomienda.receiver_cedula_rif)} y este PIN: ${pin ?? "—"}.`;
  const enlaceWa = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}` : null;
  const pagaAhora = encomienda.modalidad_pago === "ORIGEN";
  const tasa =
    registro.tasa_bcv && registro.tasa_bcv_fecha ? { tasa: Number(registro.tasa_bcv), fecha: registro.tasa_bcv_fecha } : null;

  const imprimir = async () => {
    setImprimiendo(true);
    try {
      if (printer.isConnected) {
        await printGuiaEncomienda(encomienda, { pin, cooperativa });
        toast.success("Guía enviada a la impresora.");
      } else if (!imprimirGuiaNavegador(encomienda, { pin, cooperativa })) {
        toast.error(MSG_VENTANA_BLOQUEADA);
      }
    } catch (err) {
      console.error("Error al imprimir la guía:", err);
      if (!imprimirGuiaNavegador(encomienda, { pin, cooperativa })) {
        toast.error(MSG_VENTANA_BLOQUEADA);
      } else {
        toast.warning("No pudimos imprimir por Bluetooth. Abrimos la impresión del navegador.");
      }
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle className="h-6 w-6 text-success-text" weight="fill" aria-hidden />
          Encomienda {encomienda.tracking_id} registrada.
        </DialogTitle>
        <DialogDescription>
          Quedó recibida con {Number(encomienda.peso_kg).toLocaleString("es-VE")} kg. {MODALIDAD_PAGO[encomienda.modalidad_pago].largo}.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="rounded-xl border-2 border-primary bg-primary/10 p-4">
          <p className="text-sm text-foreground">PIN de retiro</p>
          <p className="font-mono text-4xl font-bold tracking-[0.3em] text-foreground">{pin ?? "—"}</p>
          <p className="mt-1 text-sm text-foreground">
            Dáselo a quien envía para que se lo pase a quien recibe. Sin el PIN y la cédula no se entrega.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">Costo del envío</span>
          <Monto
            usd={registro.costo_usd != null ? Number(registro.costo_usd) : null}
            bs={registro.costo_bs != null ? Number(registro.costo_bs) : null}
            tasa={tasa}
            align="right"
          />
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {enlaceWa ? (
            <a href={enlaceWa} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "h-auto whitespace-normal py-2")}>
              <WhatsappLogo className="mr-1.5 h-4 w-4 shrink-0" aria-hidden />
              Enviar PIN por WhatsApp a {destinatario}
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">
              El teléfono de quien recibe no es válido para WhatsApp: dicta el PIN a quien envía.
            </p>
          )}
          <Button variant="outline" onClick={() => void imprimir()} disabled={imprimiendo}>
            {imprimiendo ? <Spinner size="sm" className="mr-1.5" /> : <Printer className="mr-1.5 h-4 w-4" aria-hidden />}
            Imprimir guía
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button onClick={onContinuar} autoFocus>
          Continuar
        </Button>
      </DialogFooter>
      <p className="-mt-2 text-right text-xs text-muted-foreground">
        Sigue: foto del paquete{pagaAhora ? " y cobro del envío" : ""}.
      </p>
    </>
  );
}
