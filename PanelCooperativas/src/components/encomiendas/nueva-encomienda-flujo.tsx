"use client";

// ─── Nueva encomienda en taquilla (cliente sin la app) · #33, P-27 ──────────
// Página `/cooperativas/taquilla/encomiendas/nueva`: el mismo asistente de la
// app (`EnBusApp/app/encomiendas/nueva.tsx`) en voz del operador.
//
//   1. ¿A dónde la envías?        sucursal (si no tiene una asignada) + destino
//   2. Detalles de la encomienda  quien envía, quien recibe, contenido, quién paga
//   3. Revisa y registra          resumen por bloques con "Editar" (AN-20)
//   Fases tras registrar (sin número): Encomienda registrada → Foto del paquete →
//   Cobro (solo ORIGEN + POR_PAGAR) → la lista con la encomienda abierta.
//
// - El paso/fase vive en `?paso=` (`usePasoEnUrl`): atrás del navegador = paso anterior.
// - Mientras se escriben datos y hasta registrar, salir pide confirmación (`useSalidaProtegida`).
// - "Registrar y recibir" llama a fn_registrar_encomienda_taquilla con una clave de idempotencia
//   creada una sola vez por sesión de la página: reintentar no duplica la encomienda.
// - Lo escrito (y, tras registrar, el resultado) se guarda en `sessionStorage` de la pestaña
//   mientras la URL lleve `?paso=`: recargar no pierde nada. Entrar de nuevo por el botón
//   "Nueva encomienda" (sin `?paso=`) empieza vacío y con una clave nueva.

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Warning } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AvisoError } from "@/components/aviso-error";
import { ErrorState } from "@/components/error-state";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { Monto } from "@/components/monto";
import { CampoContenedor, idsCampo } from "@/components/campos/campo-base";
import { Campo, CedulaField, MontoField, TelefonoField } from "@/components/campos";
import { BarraFlujo, FlujoPagina, usePasoEnUrl, useSalidaProtegida } from "@/components/flujo";
import { avisarInfo } from "@/lib/avisos";
import { requireOnline } from "@/components/connectivity-banner";
import { useUser } from "@/hooks/use-user";
import { createClient } from "@/lib/supabase/client";
import { codigoEB, humanizeError } from "@/lib/errores";
import { MODALIDAD_PAGO } from "@/lib/estados";
import { formatMoney, leerMonto, type TasaRef } from "@/lib/dinero";
import {
  CEDULA_ERROR,
  TELEFONO_ERROR,
  cedulaParaGuardar,
  cedulaValida,
  formatCedula,
  formatTelefono,
  LETRAS_ENCOMIENDA,
  telefonoParaGuardar,
  telefonoValido,
} from "@/lib/ve";
import { CIUDADES_POR_ESTADO, ESTADOS_VENEZUELA } from "@/lib/data/venezuela";
import { formatCiudad, normalizarCiudad } from "@/lib/ciudades";
import type { Encomienda, ModalidadPago, PersonaEncomienda, RegistroEncomiendaTaquilla } from "@/lib/types/encomiendas";
import type { CotizacionEnvioPublica } from "@/lib/types/pagos";
import {
  datosNuevaEncomienda,
  registrarEncomiendaTaquilla,
  type DatosAltaEncomienda,
  type RutaAlta,
} from "@/app/cooperativas/(panel)/taquilla/encomiendas/actions";
import { EncomiendaRegistrada } from "./encomienda-registrada";
import { FotoPaquete, descripcionFoto, tituloFoto, type ModoFoto } from "./foto-paquete";
import { CobroEncomiendaContenido } from "./cobro-encomienda";

// ─── Pasos y fases ──────────────────────────────────────────────────────────

const PASOS = ["destino", "detalles", "revisar", "registrada", "foto", "cobro"] as const;
type Paso = (typeof PASOS)[number];
/** Los tres primeros llevan "Paso n de 3"; las fases tras registrar no. */
const PASOS_NUMERADOS = 3;

const TITULOS: Record<Paso, string> = {
  destino: "¿A dónde la envías?",
  detalles: "Detalles de la encomienda",
  revisar: "Revisa y registra",
  registrada: "Encomienda registrada",
  foto: "Foto del paquete",
  cobro: "Cobro del envío",
};

const URL_LISTA = "/cooperativas/taquilla/encomiendas";
const ID_FORMULARIO = "encomienda-detalles";
/** Cuántos destinos consultan su "Desde Bs X (1 kg)" (una consulta por destino). */
const MAX_DESTINOS_CON_PRECIO = 24;

// ─── Datos del formulario ───────────────────────────────────────────────────

const PERSONA_VACIA: PersonaEncomienda = { nombre: "", cedula: "", telefono: "" };
type Errores = Partial<Record<string, string>>;
type Resultado = { registro: RegistroEncomiendaTaquilla; encomienda: Encomienda };

function nuevaClave(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
  }
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

function validarPersona(p: PersonaEncomienda, quien: "envía" | "recibe"): Errores {
  const e: Errores = {};
  if (p.nombre.trim().replace(/\s+/g, " ").length < 3) e.nombre = `Escribe el nombre y apellido de quien ${quien}.`;
  if (!cedulaValida(p.cedula)) e.cedula = CEDULA_ERROR;
  if (!telefonoValido(p.telefono)) e.telefono = TELEFONO_ERROR;
  return e;
}

/** Lleva el foco al campo (o al primer control de un grupo) cuando ya se pintó el paso. */
function enfocar(id: string) {
  window.setTimeout(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const objetivo = el.matches("input,button,select,textarea")
      ? el
      : el.querySelector<HTMLElement>("input,button,[role=radio]");
    objetivo?.focus();
  }, 60);
}

// ─── Borrador en la pestaña (sobrevive a recargar) ──────────────────────────

const CLAVE_BORRADOR = "enbus:encomienda-nueva:v1";

type Borrador = {
  usuario: string;
  idemKey: string;
  sucursalId: string;
  rutaId: string;
  remitente: PersonaEncomienda;
  destinatario: PersonaEncomienda;
  contenido: string;
  peso: string;
  valor: string;
  modalidad: ModalidadPago | null;
  resultado: Resultado | null;
};

function leerBorrador(usuario: string): Borrador | null {
  try {
    const crudo = window.sessionStorage.getItem(CLAVE_BORRADOR);
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Borrador;
    return b && b.usuario === usuario && typeof b.idemKey === "string" ? b : null;
  } catch {
    return null;
  }
}
/** El PIN de retiro es un secreto: nunca se escribe en el almacenamiento (tras recargar no se puede mostrar). */
function sinPin(r: Resultado | null): Resultado | null {
  return r ? { registro: { ...r.registro, pin_retiro: null }, encomienda: { ...r.encomienda, pin_retiro: null } } : null;
}
function guardarBorrador(b: Borrador | null) {
  try {
    if (b) window.sessionStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ ...b, resultado: sinPin(b.resultado) }));
    else window.sessionStorage.removeItem(CLAVE_BORRADOR);
  } catch {
    // Sin almacenamiento (modo privado, cuota): el asistente sigue funcionando.
  }
}

// ─── Componente ─────────────────────────────────────────────────────────────

export function NuevaEncomiendaFlujo() {
  const router = useRouter();
  const { user } = useUser();
  const supabase = useMemo(() => createClient(), []);
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const esAdmin = user.role === "admin_cooperativa";

  // ── Estado ──
  const [hidratado, setHidratado] = useState(false);
  const [idemKey, setIdemKey] = useState(nuevaClave);
  const [datos, setDatos] = useState<DatosAltaEncomienda | null>(null);
  const [errorDatos, setErrorDatos] = useState<string | null>(null);
  const [sucursalId, setSucursalId] = useState("");
  const [rutaId, setRutaId] = useState("");
  const [remitente, setRemitente] = useState<PersonaEncomienda>(PERSONA_VACIA);
  const [destinatario, setDestinatario] = useState<PersonaEncomienda>(PERSONA_VACIA);
  const [contenido, setContenido] = useState("");
  const [peso, setPeso] = useState("");
  const [valor, setValor] = useState("");
  const [modalidad, setModalidad] = useState<ModalidadPago | null>(null);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  /** Se entró a un paso desde "Editar" del resumen (AN-20): el botón vuelve a él. */
  const [editando, setEditando] = useState(false);
  const [modoFoto, setModoFoto] = useState<ModoFoto>("camara");
  const [fotoOcupada, setFotoOcupada] = useState(false);
  const terminadoRef = useRef(false);

  // ── Derivados ──
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
  const itemsSucursal = useMemo(
    () => Object.fromEntries((datos?.sucursales ?? []).map((s) => [s.id, `${s.nombre} · ${formatCiudad(s.ciudad)}`])),
    [datos]
  );

  const destinoValido = !!sucursal && !!ruta;
  const pesoNum = leerMonto(peso);
  const trayecto = sucursal && ruta ? `${formatCiudad(sucursal.ciudad)} → ${formatCiudad(ruta.ciudad_destino)}` : null;

  // ── Estimado del peso escrito (debounce) ──
  const [estimado, setEstimado] = useState<
    | { estado: "listo"; clave: string; usd: number; bs: number | null; tasa: TasaRef | null; max: number }
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
  const estimadoTexto =
    estimadoVigente?.estado === "listo"
      ? formatMoney({ usd: estimadoVigente.usd, bs: estimadoVigente.bs, tasa: estimadoVigente.tasa }).principal
      : null;

  // ── Validación ──
  /** Errores del paso 2 por campo y el orden en que aparecen en pantalla (el primero recibe el foco). */
  const calcularErroresDetalles = (): { e: Errores; orden: string[] } => {
    const e: Errores = {};
    const orden: string[] = [];
    const marcar = (clave: string, mensaje: string) => {
      e[clave] = mensaje;
      orden.push(clave);
    };
    const r = validarPersona(remitente, "envía");
    if (r.nombre) marcar("rem-nombre", r.nombre);
    if (r.cedula) marcar("rem-cedula", r.cedula);
    if (r.telefono) marcar("rem-telefono", r.telefono);
    const d = validarPersona(destinatario, "recibe");
    if (d.nombre) marcar("des-nombre", d.nombre);
    if (d.cedula) marcar("des-cedula", d.cedula);
    if (d.telefono) marcar("des-telefono", d.telefono);
    if (contenido.trim().length < 3) marcar("contenido", "Describe el contenido del paquete (mínimo 3 letras).");
    const max = estimadoVigente?.max;
    if (pesoNum == null || pesoNum <= 0) marcar("peso", "Escribe el peso en kilos, por ejemplo 2,5.");
    else if (max && pesoNum > max) marcar("peso", `El peso máximo es ${max} kg.`);
    if (valor.trim() && leerMonto(valor, { permitirCero: true }) == null) {
      marcar("valor", "Escribe el valor en dólares, por ejemplo 40,00.");
    }
    if (!modalidad) marcar("modalidad", "Elige quién paga el envío.");
    return { e, orden };
  };

  /** Revisa el paso 2: marca los errores y lleva el foco al primero. */
  const validarDetalles = (): boolean => {
    const { e, orden } = calcularErroresDetalles();
    setErrores(e);
    if (orden.length > 0) {
      enfocar(id(orden[0]));
      return false;
    }
    return true;
  };

  // ── Pasos en la URL ──
  const url = usePasoEnUrl(PASOS, {
    esAccesible: (p) => {
      // Antes de hidratar el borrador o de cargar las rutas no se sabe: no se expulsa a nadie.
      if (!hidratado) return true;
      if (resultado) return true;
      const i = PASOS.indexOf(p);
      if (i >= PASOS_NUMERADOS) return false;
      if (i === 0) return true;
      if (!datos) return rutaId !== "";
      if (!destinoValido) return false;
      return p === "revisar" ? Object.keys(calcularErroresDetalles().e).length === 0 : true;
    },
  });
  const { paso, indice, ir } = url;
  const enNumerados = indice < PASOS_NUMERADOS;

  const sucio =
    rutaId !== "" ||
    modalidad !== null ||
    [remitente.nombre, remitente.cedula, remitente.telefono, destinatario.nombre, destinatario.cedula, destinatario.telefono, contenido, peso, valor].some(
      (v) => v.trim() !== ""
    );
  const { dialogo, confirmarSalida, permitirSalida } = useSalidaProtegida({
    activo: sucio && !resultado,
    bloqueado: enviando,
  });

  // ── Borrador: restaurar al montar y guardar al cambiar ──
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const pasoUrl = new URLSearchParams(window.location.search).get("paso") ?? "";
    const iUrl = (PASOS as readonly string[]).indexOf(pasoUrl);
    const b = leerBorrador(user.id);
    // Con `?paso=` es una recarga o un "atrás": se recupera lo escrito. Sin él es una entrada nueva.
    const recuperar = !!b && iUrl > 0 && (b.resultado ? iUrl >= PASOS_NUMERADOS : iUrl < PASOS_NUMERADOS);
    if (b && recuperar) {
      setIdemKey(b.idemKey);
      setSucursalId(b.sucursalId);
      setRutaId(b.rutaId);
      setRemitente(b.remitente);
      setDestinatario(b.destinatario);
      setContenido(b.contenido);
      setPeso(b.peso);
      setValor(b.valor);
      setModalidad(b.modalidad);
      setResultado(b.resultado);
    } else {
      guardarBorrador(null);
    }
    setHidratado(true);
  }, [user.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hidratado) return;
    const t = window.setTimeout(() => {
      if (terminadoRef.current) return;
      if (!sucio && !resultado) {
        guardarBorrador(null);
        return;
      }
      guardarBorrador({
        usuario: user.id,
        idemKey,
        sucursalId,
        rutaId,
        remitente,
        destinatario,
        contenido,
        peso,
        valor,
        modalidad,
        resultado,
      });
    }, 250);
    return () => window.clearTimeout(t);
  }, [hidratado, sucio, user.id, idemKey, sucursalId, rutaId, remitente, destinatario, contenido, peso, valor, modalidad, resultado]);

  // Al salir de la página (confirmado o no) el borrador se borra: guarda datos de personas.
  // Una recarga no ejecuta esto, así que sigue siendo recuperable. El `setTimeout` evita
  // borrarlo en el desmontaje simulado del modo estricto de React (se vuelve a montar enseguida).
  const montadoRef = useRef(false);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      window.setTimeout(() => {
        if (!montadoRef.current) guardarBorrador(null);
      }, 0);
    };
  }, []);

  // Registrada: no se vuelve a los pasos de datos (atrás del navegador, recarga con otra URL).
  useEffect(() => {
    if (!hidratado || !resultado) return;
    const cobrarAun = resultado.encomienda.modalidad_pago === "ORIGEN" && resultado.encomienda.estado === "POR_PAGAR";
    if (indice < PASOS_NUMERADOS || (paso === "cobro" && !cobrarAun)) ir("registrada", { reemplazar: true });
  }, [hidratado, resultado, indice, paso, ir]);

  // ── Datos: sucursales y rutas ──
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

  // ── "Desde Bs X (1 kg)" por destino (fn_cotizar_envio_publico, solo esta cooperativa) ──
  const [desde, setDesde] = useState<Record<string, { usd: number; bs: number | null } | null>>({});
  const [tasaDesde, setTasaDesde] = useState<TasaRef | null>(null);
  useEffect(() => {
    if (destinos.length === 0) return;
    let vigente = true;
    for (const r of destinos.slice(0, MAX_DESTINOS_CON_PRECIO)) {
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("fn_cotizar_envio_publico", {
            p_peso_kg: 1,
            p_ciudad_origen: r.ciudad_origen,
            p_ciudad_destino: r.ciudad_destino,
          });
          if (error) throw error;
          if (!vigente) return;
          const c = data as CotizacionEnvioPublica;
          const propia = c?.opciones?.find((o) => o.cooperativa_id === user.cooperativa_id);
          setDesde((prev) => ({
            ...prev,
            [r.id]: propia ? { usd: Number(propia.costo_usd), bs: propia.costo_bs != null ? Number(propia.costo_bs) : null } : null,
          }));
          if (c?.tasa_bcv && c.tasa_bcv_fecha) setTasaDesde({ tasa: Number(c.tasa_bcv), fecha: c.tasa_bcv_fecha });
        } catch {
          // Es solo una referencia: sin ella la tarjeta dice que el costo depende del peso.
          if (vigente) setDesde((prev) => ({ ...prev, [r.id]: null }));
        }
      })();
    }
    return () => {
      vigente = false;
    };
  }, [destinos, supabase, user.cooperativa_id]);

  // "Volver al resumen" solo mientras se está en un paso de datos: al llegar al resumen se apaga.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (paso === "revisar" || indice >= PASOS_NUMERADOS) setEditando(false);
  }, [paso, indice]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Cambios de campos (cada uno limpia su error) ──
  const limpiar = (...claves: string[]) =>
    setErrores((prev) => {
      if (!claves.some((k) => prev[k])) return prev;
      const siguiente = { ...prev };
      for (const k of claves) delete siguiente[k];
      return siguiente;
    });
  const cambiarPersona = (
    quien: "rem" | "des",
    campo: keyof PersonaEncomienda,
    valorCampo: string
  ) => {
    (quien === "rem" ? setRemitente : setDestinatario)((p) => ({ ...p, [campo]: valorCampo }));
    limpiar(`${quien}-${campo}`, quien === "rem" ? "remitente" : "destinatario");
  };

  // ── Navegación entre pasos ──
  const alEnviarDetalles = (ev: FormEvent) => {
    ev.preventDefault();
    if (!validarDetalles()) return;
    setErrorGeneral(null);
    if (editando) {
      setEditando(false);
      url.ir("revisar");
    } else {
      url.siguiente();
    }
  };

  const continuarDestino = () => {
    if (!destinoValido) return;
    setErrorGeneral(null);
    if (editando) {
      // Desde "Editar": se revisa también el paso 2 por si lo cambiado lo invalida.
      setEditando(false);
      url.ir("revisar");
    } else {
      url.siguiente();
    }
  };

  const editar = (destinoPaso: "destino" | "detalles") => {
    setEditando(true);
    setErrorGeneral(null);
    url.ir(destinoPaso);
  };

  const salir = () => confirmarSalida(() => router.push(URL_LISTA));

  const terminar = (encomiendaId: string) => {
    terminadoRef.current = true;
    guardarBorrador(null);
    permitirSalida();
    router.replace(`${URL_LISTA}?encomienda=${encomiendaId}`);
  };

  // ── Registrar ──
  const registrar = async () => {
    if (enviandoRef.current) return;
    if (!ruta || !modalidad || pesoNum == null) {
      // El estado se perdió (rutas que cambiaron): se vuelve al paso que falta.
      if (!ruta) {
        setErrores({ destino: "Elige el destino del envío." });
        setEditando(true);
        url.ir("destino");
      }
      return;
    }
    const previo = calcularErroresDetalles();
    if (Object.keys(previo.e).length > 0) {
      setErrores(previo.e);
      setEditando(true);
      ir("detalles");
      enfocar(id(previo.orden[0]));
      return;
    }
    setErrorGeneral(null);
    enviandoRef.current = true;
    setEnviando(true);
    try {
      const valorNum = valor.trim() ? leerMonto(valor, { permitirCero: true }) : null;
      const res = await requireOnline(() =>
        registrarEncomiendaTaquilla({
          rutaId: ruta.id,
          remitente,
          destinatario,
          descripcion: contenido,
          valorDeclarado: valorNum,
          modalidad,
          pesoKg: pesoNum,
          idemKey,
          sucursalId: elegirSucursal ? sucursalId : null,
        })
      )();
      if (!res.success) {
        const campo = res.detalle?.campo;
        const aPaso = (p: "destino" | "detalles", e: Errores, foco: string) => {
          setErrores(e);
          setEditando(true);
          url.ir(p);
          enfocar(id(foco));
        };
        if (campo === "remitente") {
          setErrorGeneral(res.error);
          aPaso("detalles", { remitente: res.error }, "rem-nombre");
        } else if (campo === "destinatario") {
          setErrorGeneral(res.error);
          aPaso("detalles", { destinatario: res.error }, "des-nombre");
        } else if (campo === "peso" || res.codigo === "EB_PESO_INVALIDO") {
          aPaso("detalles", { peso: res.error }, "peso");
        } else if (campo === "descripcion") {
          aPaso("detalles", { contenido: res.error }, "contenido");
        } else if (campo === "valor_declarado") {
          aPaso("detalles", { valor: res.error }, "valor");
        } else if (campo === "modalidad") {
          aPaso("detalles", { modalidad: res.error }, "modalidad");
        } else if (campo === "destino") {
          aPaso("destino", { destino: res.error }, "destino");
        } else if (campo === "sucursal") {
          aPaso("destino", { sucursal: res.error }, "sucursal");
        } else {
          setErrorGeneral(res.error);
        }
        return;
      }

      const r = res.data;
      const ahora = new Date().toISOString();
      const nombreDes = destinatario.nombre.trim().replace(/\s+/g, " ");
      const encomienda: Encomienda = {
        id: r.encomienda_id,
        tracking_id: r.tracking_id,
        sender_id: user.id,
        // Igual que lo guarda el servidor (personaParaGuardar): sin espacios repetidos.
        receiver_nombre: nombreDes,
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
        valor_declarado: valorNum,
        pin_retiro: r.pin_retiro,
        origen_registro: "TAQUILLA",
        remitente_nombre: remitente.nombre.trim().replace(/\s+/g, " "),
        remitente_cedula: cedulaParaGuardar(remitente.cedula) ?? remitente.cedula,
        remitente_telefono: telefonoParaGuardar(remitente.telefono) ?? remitente.telefono,
      };
      setResultado({ registro: r, encomienda });
      setEditando(false);
      url.ir("registrada", { reemplazar: true });
      if (r.repetido) avisarInfo("Esta encomienda ya estaba registrada: no se creó otra.");
    } catch (err) {
      setErrorGeneral(humanizeError(err, "registrar la encomienda"));
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  // ─── Fases tras registrar ─────────────────────────────────────────────────
  if (resultado && indice >= PASOS_NUMERADOS) {
    const { registro, encomienda } = resultado;
    // Solo se cobra si sigue por pagar (un alta repetida puede venir ya pagada).
    const cobrar = encomienda.modalidad_pago === "ORIGEN" && encomienda.estado === "POR_PAGAR";
    const despuesDeFoto = () => (cobrar ? url.ir("cobro") : terminar(encomienda.id));

    return (
      <>
        {dialogo}
        {paso === "registrada" && (
          <FlujoPagina
            titulo={TITULOS.registrada}
            descripcion={
              <>
                Código <span className="font-mono text-foreground">{encomienda.tracking_id}</span> · Recibida con{" "}
                {Number(encomienda.peso_kg).toLocaleString("es-VE")} kg · {MODALIDAD_PAGO[encomienda.modalidad_pago].largo}
              </>
            }
            barra={
              <BarraFlujo
                resumen={`Sigue: foto del paquete${cobrar ? " y cobro del envío" : ""}.`}
                principal={{ etiqueta: "Continuar", onClick: () => url.ir("foto") }}
              />
            }
          >
            <EncomiendaRegistrada registro={registro} encomienda={encomienda} cooperativa={user.cooperativa_nombre ?? ""} />
          </FlujoPagina>
        )}

        {paso === "foto" && (
          <FlujoPagina titulo={tituloFoto(modoFoto)} descripcion={descripcionFoto(modoFoto, encomienda.tracking_id)}>
            <FotoPaquete
              encomiendaId={encomienda.id}
              trackingId={encomienda.tracking_id}
              siguiente={cobrar ? "Después: cobrar el envío." : undefined}
              onListo={despuesDeFoto}
              onModo={setModoFoto}
              onOcupado={setFotoOcupada}
            />
            <Button variant="ghost" size="lg" className="self-start" disabled={fotoOcupada} onClick={despuesDeFoto}>
              Hacerlo después
            </Button>
          </FlujoPagina>
        )}

        {paso === "cobro" && cobrar && (
          <FlujoPagina titulo={TITULOS.cobro} descripcion={<span className="font-mono text-foreground">{encomienda.tracking_id}</span>}>
            <CobroEncomiendaContenido
              encomienda={encomienda}
              onSuccess={() => terminar(encomienda.id)}
              onCerrar={() => terminar(encomienda.id)}
            />
            <Button variant="ghost" size="lg" className="self-start" onClick={() => terminar(encomienda.id)}>
              Cobrar después
            </Button>
          </FlujoPagina>
        )}
      </>
    );
  }

  // ─── Pasos de datos ───────────────────────────────────────────────────────
  const motivoBloqueo =
    paso === "destino" && !destinoValido
      ? !sucursal
        ? "Elige la sucursal"
        : "Elige el destino"
      : paso === "detalles" && !modalidad
        ? "Elige quién paga"
        : paso === "detalles" && Object.values(errores).some(Boolean)
          ? "Revisa los campos marcados en rojo"
          : null;

  const resumenPaso =
    motivoBloqueo ??
    (paso === "destino"
      ? trayecto
      : paso === "detalles"
        ? [modalidad ? MODALIDAD_PAGO[modalidad].corto : null, estimadoTexto ? `Estimado ${estimadoTexto}` : null]
            .filter(Boolean)
            .join(" · ") || null
        : [trayecto, modalidad ? MODALIDAD_PAGO[modalidad].corto : null, estimadoTexto ? `Estimado ${estimadoTexto}` : null]
            .filter(Boolean)
            .join(" · ") || null);

  const barra =
    paso === "destino" ? (
      <BarraFlujo
        resumen={resumenPaso}
        principal={{
          etiqueta: editando ? "Volver al resumen" : "Continuar",
          onClick: continuarDestino,
          deshabilitado: !destinoValido,
        }}
      />
    ) : paso === "detalles" ? (
      <BarraFlujo
        resumen={resumenPaso}
        principal={{
          etiqueta: editando ? "Volver al resumen" : "Continuar",
          type: "submit",
          form: ID_FORMULARIO,
          deshabilitado: !modalidad,
        }}
      />
    ) : (
      <BarraFlujo
        resumen={resumenPaso}
        principal={{
          etiqueta: "Registrar y recibir",
          etiquetaCargando: "Registrando…",
          onClick: () => void registrar(),
          cargando: enviando,
          deshabilitado: !destinoValido || datos?.sucursales.length === 0,
        }}
      />
    );

  return (
    <>
      {dialogo}
      <FlujoPagina
        titulo={TITULOS[paso]}
        paso={enNumerados ? url.numero : undefined}
        total={enNumerados ? PASOS_NUMERADOS : undefined}
        onAtras={indice > 0 ? url.anterior : salir}
        atrasEtiqueta={indice > 0 ? "Volver al paso anterior" : "Salir de la encomienda"}
        descripcion={paso === "detalles" ? "Quien recibe retira con su cédula y el PIN." : undefined}
        barra={barra}
      >
        {errorGeneral && paso !== "detalles" && <AvisoError>{errorGeneral}</AvisoError>}

        {paso === "destino" && (
          <PasoDestino
            id={id}
            datos={datos}
            errorDatos={errorDatos}
            onReintentar={cargarDatos}
            esAdmin={esAdmin}
            elegirSucursal={elegirSucursal}
            sucursalId={sucursalId}
            itemsSucursal={itemsSucursal}
            sucursal={sucursal}
            destinos={destinos}
            rutaId={rutaId}
            desde={desde}
            tasaDesde={tasaDesde}
            errores={errores}
            onSucursal={(v) => {
              setSucursalId(v);
              setRutaId("");
              limpiar("sucursal", "destino");
            }}
            onRuta={(v) => {
              setRutaId(v);
              limpiar("destino");
            }}
          />
        )}

        {paso === "detalles" && (
          <form id={ID_FORMULARIO} noValidate onSubmit={alEnviarDetalles} className="flex flex-col gap-8">
            {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}

            <Seccion titulo="Quien envía" id={id("seccion-rem")}>
              <Campo
                id={id("rem-nombre")}
                label="Nombre y apellido"
                value={remitente.nombre}
                onChange={(v) => cambiarPersona("rem", "nombre", v.slice(0, 80))}
                error={errores["rem-nombre"]}
                placeholder="Ej. María Pérez"
                enterKeyHint="next"
                className="md:col-span-2"
              />
              <CedulaField
                id={id("rem-cedula")}
                value={remitente.cedula}
                letras={LETRAS_ENCOMIENDA}
                onChange={(v) => cambiarPersona("rem", "cedula", v)}
                error={errores["rem-cedula"]}
                enterKeyHint="next"
              />
              <TelefonoField
                id={id("rem-telefono")}
                value={remitente.telefono}
                onChange={(v) => cambiarPersona("rem", "telefono", v)}
                error={errores["rem-telefono"]}
                enterKeyHint="next"
              />
            </Seccion>

            <Seccion titulo="Quien recibe" id={id("seccion-des")}>
              <Campo
                id={id("des-nombre")}
                label="Nombre y apellido"
                value={destinatario.nombre}
                onChange={(v) => cambiarPersona("des", "nombre", v.slice(0, 80))}
                error={errores["des-nombre"]}
                placeholder="Ej. José Rodríguez"
                enterKeyHint="next"
                className="md:col-span-2"
              />
              <CedulaField
                id={id("des-cedula")}
                value={destinatario.cedula}
                letras={LETRAS_ENCOMIENDA}
                onChange={(v) => cambiarPersona("des", "cedula", v)}
                error={errores["des-cedula"]}
                enterKeyHint="next"
              />
              <TelefonoField
                id={id("des-telefono")}
                value={destinatario.telefono}
                onChange={(v) => cambiarPersona("des", "telefono", v)}
                error={errores["des-telefono"]}
                enterKeyHint="next"
              />
            </Seccion>

            <Seccion titulo="Contenido" id={id("seccion-contenido")}>
              <Campo
                id={id("contenido")}
                label="Descripción"
                value={contenido}
                onChange={(v) => {
                  setContenido(v.slice(0, 300));
                  limpiar("contenido");
                }}
                error={errores.contenido}
                placeholder="Ej. ropa y documentos"
                enterKeyHint="next"
                className="md:col-span-2"
              />
              <Campo
                id={id("peso")}
                label="Peso"
                value={peso}
                onChange={(v) => {
                  setPeso(v.replace(/[^\d.,]/g, ""));
                  limpiar("peso");
                }}
                error={errores.peso}
                ayuda={estimadoVigente?.max ? `Máximo ${estimadoVigente.max} kg.` : "Pesa el paquete y escribe el peso."}
                inputMode="decimal"
                sufijo="kg"
                placeholder="Ej. 2,5"
                enterKeyHint="next"
              />
              <MontoField
                id={id("valor")}
                label="Valor del contenido"
                moneda="USD"
                value={valor}
                onChange={(v) => {
                  setValor(v);
                  limpiar("valor");
                }}
                error={errores.valor}
                opcional
                permitirCero
                placeholder="Ej. 50,00"
                enterKeyHint="done"
              />
              <div aria-live="polite" className="flex min-h-20 flex-col justify-center gap-1 rounded-xl bg-surface p-5 text-[15px] md:col-span-2">
                <p className="text-[13px] font-medium text-muted-foreground">Costo estimado del envío</p>
                {!claveEstimado ? (
                  <p className="text-muted-foreground">Escribe el peso para calcularlo.</p>
                ) : !estimadoVigente ? (
                  <Skeleton className="h-7 w-40" aria-label="Calculando" />
                ) : estimadoVigente.estado === "listo" ? (
                  <Monto usd={estimadoVigente.usd} bs={estimadoVigente.bs} tasa={estimadoVigente.tasa} size="lg" />
                ) : (
                  <p className="text-muted-foreground">{estimadoVigente.mensaje}</p>
                )}
              </div>
              <p className="flex items-start gap-2 text-[13px] text-muted-foreground md:col-span-2">
                <Warning aria-hidden className="mt-0.5 size-4 shrink-0" />
                Máximo {estimadoVigente?.max ?? 50} kg y 50 × 50 × 50 cm.
              </p>
            </Seccion>

            <Seccion titulo="¿Quién paga?" id={id("seccion-paga")} unaColumna>
              <div id={id("modalidad")} className="flex flex-col gap-2">
                <GrupoOpciones etiqueta="¿Quién paga?" className="grid gap-2 md:grid-cols-2">
                  {(
                    [
                      ["ORIGEN", "Paga al enviar", "Cobras el envío al recibirlo."],
                      ["DESTINO", "Paga al retirar", "Paga quien recibe, en destino."],
                    ] as const
                  ).map(([valorRadio, titulo, ayuda]) => (
                    <OpcionTile
                      key={valorRadio}
                      seleccionado={modalidad === valorRadio}
                      onSelect={() => {
                        setModalidad(valorRadio);
                        limpiar("modalidad");
                      }}
                      titulo={titulo}
                      detalle={ayuda}
                    />
                  ))}
                </GrupoOpciones>
                {errores.modalidad && (
                  <p role="alert" className="text-[13px] text-destructive-text">
                    {errores.modalidad}
                  </p>
                )}
              </div>
            </Seccion>
          </form>
        )}

        {paso === "revisar" && (
          <div className="flex flex-col gap-4">
            {errorGeneral && <AvisoError>{errorGeneral}</AvisoError>}
            <div className="flex flex-col divide-y divide-border rounded-xl bg-card px-5 shadow-card">
              <BloqueResumen titulo="Trayecto" onEditar={() => editar("destino")}>
                <p className="text-[17px] font-semibold">{trayecto ?? "—"}</p>
                {sucursal && <p className="text-[13px] text-muted-foreground">Recibes en {sucursal.nombre}</p>}
              </BloqueResumen>
              <BloqueResumen titulo="Quien envía" onEditar={() => editar("detalles")}>
                <p className="text-[17px] font-semibold">{remitente.nombre.trim().replace(/\s+/g, " ")}</p>
                <p className="text-[13px] text-muted-foreground">
                  {`C.I. ${formatCedula(remitente.cedula)} · Tel. ${formatTelefono(remitente.telefono)}`}
                </p>
              </BloqueResumen>
              <BloqueResumen titulo="Quien recibe" onEditar={() => editar("detalles")}>
                <p className="text-[17px] font-semibold">{destinatario.nombre.trim().replace(/\s+/g, " ")}</p>
                <p className="text-[13px] text-muted-foreground">
                  {`C.I. ${formatCedula(destinatario.cedula)} · Tel. ${formatTelefono(destinatario.telefono)}`}
                </p>
                <p className="text-[13px] text-muted-foreground">Si tiene EnBus, la verá en su app.</p>
              </BloqueResumen>
              <BloqueResumen titulo="Contenido" onEditar={() => editar("detalles")}>
                <p className="text-[17px] font-semibold">{contenido.trim()}</p>
                <p className="text-[13px] text-muted-foreground">
                  {[
                    pesoNum != null ? `${peso.trim().replace(".", ",")} kg` : "Peso sin indicar",
                    valor.trim() && leerMonto(valor, { permitirCero: true }) != null
                      ? `Valor ${formatMoney({ usd: leerMonto(valor, { permitirCero: true }) }).principal}`
                      : null,
                    estimadoTexto ? `Costo estimado ${estimadoTexto}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </BloqueResumen>
              <BloqueResumen titulo="¿Quién paga?" onEditar={() => editar("detalles")}>
                <p className="text-[17px] font-semibold">{modalidad ? MODALIDAD_PAGO[modalidad].corto : "—"}</p>
                <p className="text-[13px] text-muted-foreground">{modalidad ? MODALIDAD_PAGO[modalidad].largo : ""}</p>
              </BloqueResumen>
            </div>
            <p className="text-[13px] text-muted-foreground">
              Al registrar, la encomienda queda recibida y pesada. El costo definitivo lo calcula el sistema con la tarifa vigente.
            </p>
          </div>
        )}
      </FlujoPagina>
    </>
  );
}

// ─── Piezas ─────────────────────────────────────────────────────────────────

/** Sección del formulario: título (h2) y sus campos en una tarjeta de dos columnas en escritorio. */
function Seccion({
  titulo,
  id,
  unaColumna,
  children,
}: {
  titulo: string;
  id: string;
  unaColumna?: boolean;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-[17px] font-semibold">
        {titulo}
      </h2>
      <div className={unaColumna ? "grid gap-4" : "grid gap-4 md:grid-cols-2"}>{children}</div>
    </section>
  );
}

/** Bloque del resumen con su botón "Editar". */
function BloqueResumen({ titulo, onEditar, children }: { titulo: string; onEditar: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">{titulo}</p>
        <Button type="button" variant="link" size="sm" onClick={onEditar} aria-label={`Editar ${titulo.toLowerCase()}`}>
          Editar
        </Button>
      </div>
      {children}
    </div>
  );
}

/** Paso 1: sucursal (si no tiene una asignada) y destino entre las rutas activas que salen de ella. */
function PasoDestino({
  id,
  datos,
  errorDatos,
  onReintentar,
  esAdmin,
  elegirSucursal,
  sucursalId,
  itemsSucursal,
  sucursal,
  destinos,
  rutaId,
  desde,
  tasaDesde,
  errores,
  onSucursal,
  onRuta,
}: {
  id: (s: string) => string;
  datos: DatosAltaEncomienda | null;
  errorDatos: string | null;
  onReintentar: () => void | Promise<void>;
  esAdmin: boolean;
  elegirSucursal: boolean;
  sucursalId: string;
  itemsSucursal: Record<string, string>;
  sucursal: { nombre: string; ciudad: string } | null;
  destinos: RutaAlta[];
  rutaId: string;
  desde: Record<string, { usd: number; bs: number | null } | null>;
  tasaDesde: TasaRef | null;
  errores: Errores;
  onSucursal: (valor: string) => void;
  onRuta: (valor: string) => void;
}) {
  if (errorDatos && !datos) {
    return <ErrorState compacto titulo="No pudimos cargar las rutas" descripcion={errorDatos} onReintentar={onReintentar} />;
  }
  if (!datos) {
    return (
      <div className="flex flex-col gap-4" role="status" aria-label="Cargando sucursales y rutas">
        <Skeleton className="h-14 w-full rounded-md" />
        <div className="grid gap-2 md:grid-cols-2">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (datos.sucursales.length === 0) {
    return (
      <p className="rounded-md bg-surface p-4 text-[15px] text-muted-foreground">
        Tu cooperativa no tiene sucursales activas.{" "}
        {esAdmin ? (
          <Link href="/cooperativas/configuracion?tab=sucursales" className="font-medium text-info-text underline underline-offset-4">
            Crea una sucursal
          </Link>
        ) : (
          "Pídele al administrador que cree una sucursal."
        )}
      </p>
    );
  }

  const idSucursal = id("sucursal");
  return (
    <div className="flex flex-col gap-6">
      {elegirSucursal ? (
        <CampoContenedor id={idSucursal} label="Sucursal donde recibes" error={errores.sucursal}>
          <Select value={sucursalId} items={itemsSucursal} onValueChange={(v) => onSucursal(v ?? "")}>
            <SelectTrigger
              id={idSucursal}
              className="w-full"
              aria-invalid={errores.sucursal ? true : undefined}
              aria-describedby={idsCampo(idSucursal, errores.sucursal).describedBy}
            >
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
        </CampoContenedor>
      ) : (
        sucursal && (
          <p className="text-[15px] text-muted-foreground">
            Recibes en <span className="font-medium text-foreground">{sucursal.nombre}</span> · {formatCiudad(sucursal.ciudad)}
          </p>
        )
      )}

      <CampoContenedor id={id("destino")} label="Destino" paraControl={false} error={errores.destino}>
        {!sucursal ? (
          <p className="rounded-md bg-surface p-4 text-[15px] text-muted-foreground">Primero elige la sucursal.</p>
        ) : destinos.length === 0 ? (
          <p className="rounded-md bg-surface p-4 text-[15px] text-muted-foreground">
            No hay rutas activas que salgan de {formatCiudad(sucursal.ciudad)}.{" "}
            {esAdmin ? (
              <Link href="/cooperativas/rutas" className="font-medium text-info-text underline underline-offset-4">
                Crear ruta
              </Link>
            ) : (
              "Pídele al administrador que cree la ruta."
            )}
          </p>
        ) : (
          <>
            <GrupoOpciones etiqueta="Destino" className="grid gap-2 md:grid-cols-2">
              {destinos.map((r, i) => {
                const precio = desde[r.id];
                const referencia =
                  precio === undefined && i < MAX_DESTINOS_CON_PRECIO
                    ? "Calculando…"
                    : precio
                      ? `Desde ${formatMoney({ usd: precio.usd, bs: precio.bs, tasa: tasaDesde }).principal} (1 kg)`
                      : "El costo depende del peso";
                return (
                  <OpcionTile
                    key={r.id}
                    seleccionado={rutaId === r.id}
                    onSelect={() => onRuta(r.id)}
                    titulo={etiquetaCiudad(r.estado_destino, r.ciudad_destino)}
                    detalle={
                      <>
                        {etiquetaEstadoGeo(r.estado_destino)}
                        <br />
                        {referencia}
                      </>
                    }
                  />
                );
              })}
            </GrupoOpciones>
            {esAdmin && (
              <p className="text-[13px] text-muted-foreground">
                ¿Falta un destino?{" "}
                <Link href="/cooperativas/rutas" className="font-medium text-info-text underline underline-offset-4">
                  Crear ruta
                </Link>
              </p>
            )}
          </>
        )}
      </CampoContenedor>
    </div>
  );
}
