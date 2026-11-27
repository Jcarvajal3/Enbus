"use client";

// ─── Enviar encomienda (web del pasajero) ────────────────────────────────────
// Paralelo al registro de encomienda de la taquilla (`NuevaEncomiendaFlujo` del panel), en voz
// del pasajero. Pasos en `?paso=`:
//   1. destino (público)   ¿A dónde la envías?            ruta y cooperativa (con "Desde Bs X (1 kg)")
//   2. sucursal            ¿Dónde entregas el paquete?    taquilla de origen (y datos de la cuenta)
//   3. detalles            Detalles de la encomienda      quien recibe, contenido y peso, quién paga
//   4. revisar             Revisa y registra              resumen por bloques con "Editar"
//   Pantalla final (sin número): Encomienda registrada.
// La selección (origen, destino, cooperativa) vive en la URL, así que ir a iniciar sesión y volver,
// o recargar, retoma el mismo punto. Lo que se escribe va a un borrador en sessionStorage.
// El peso llega de la portada en `?peso=` y es el valor inicial del campo de "detalles".

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AvisoError } from "@/components/aviso-error";
import { BarraFlujo, FlujoPagina, usePasoEnUrl, useSalidaProtegida } from "@/components/flujo";
import { ArmazonFlujoSitio } from "@/components/pasajero/flujo-sitio";
import { avisarInfo } from "@/lib/avisos";
import { formatMoney, leerMonto } from "@/lib/dinero";
import { urlEncomienda, urlIngresar, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { formatCiudad } from "@/lib/ve.generated";
import { cargarSucursales, cotizarRuta, registrarEncomienda } from "@/app/(sitio)/enviar/acciones";
import {
  borrarBorrador,
  borrarListo,
  guardarBorrador,
  guardarListo,
  leerBorrador,
  leerListo,
  nuevaClaveEnvio,
} from "./borrador";
import { montoOpcion, PasoDestino, type ErroresDestino } from "./paso-destino";
import {
  calcularErroresDetalles,
  enfocar,
  ID_FORMULARIO_DETALLES,
  idDetalle,
  MODALIDADES,
  PasoDetalles,
  type DatosDetalles,
  type ErroresDetalles,
  type EstimadoVista,
  type FotoElegida,
} from "./paso-detalles";
import { PasoListo } from "./paso-listo";
import { PasoRevisar } from "./paso-revisar";
import { PasoSucursal } from "./paso-sucursal";
import { subirFotoPaquete, validarFotoPaquete } from "./subir-foto";
import {
  PASOS_ENVIO,
  type Cotizacion,
  type EnvioRegistrado,
  type PasoEnvio,
  type ResultadoSucursales,
  type RutasEnvio,
} from "./tipos";

interface Props {
  rutas: RutasEnvio;
  inicial: { origen: string; destino: string; peso: string; cooperativaId: string };
  cotizacionInicial: Cotizacion | null;
  pasajero: {
    id: string;
    nombre: string;
    esPasajero: boolean;
    perfilCompleto: boolean;
    cedula: string | null;
    telefono: string | null;
  } | null;
}

const TITULOS: Record<PasoEnvio, string> = {
  destino: "¿A dónde la envías?",
  sucursal: "¿Dónde entregas el paquete?",
  detalles: "Detalles de la encomienda",
  revisar: "Revisa y registra",
  listo: "Encomienda registrada",
};

const DESCRIPCIONES: Partial<Record<PasoEnvio, string>> = {
  destino: "Elige de dónde a dónde va y qué cooperativa la lleva. No necesitas cuenta para ver los costos.",
  detalles: "Quien recibe retira con su cédula y el PIN.",
};

const DATOS_VACIOS: DatosDetalles = { nombre: "", cedula: "", telefono: "", descripcion: "", peso: "", valor: "", modalidad: "" };

const MENSAJE_ESTIMADO_NEUTRO = "No pudimos calcular el estimado ahora. El costo final lo confirma la taquilla al pesar el paquete.";

/** Actualiza parámetros de la URL actual sin recargar ni añadir entradas al historial. */
function sincronizarUrl(valores: Record<string, string | null>) {
  try {
    const url = new URL(window.location.href);
    for (const [clave, valor] of Object.entries(valores)) {
      if (valor) url.searchParams.set(clave, valor);
      else url.searchParams.delete(clave);
    }
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Sin History API no hay nada que sincronizar.
  }
}

type EstimadoCalculado = { clave: string; vista: EstimadoVista };

export function FlujoEnviar({ rutas, inicial, cotizacionInicial, pasajero }: Props) {
  const router = useRouter();

  // ── Destino (paso 1) ──────────────────────────────────────────────────────
  const [origen, setOrigen] = useState(inicial.origen);
  const [destino, setDestino] = useState(inicial.destino);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(cotizacionInicial);
  const [cooperativaId, setCooperativaId] = useState(inicial.cooperativaId);
  const [erroresDestino, setErroresDestino] = useState<ErroresDestino>(() =>
    cotizacionInicial?.tipo === "invalido" && cotizacionInicial.campo !== "peso"
      ? { [cotizacionInicial.campo]: cotizacionInicial.mensaje }
      : {}
  );
  const [cotizando, empezarCotizacion] = useTransition();
  /** Número de la última cotización pedida: una respuesta tardía de otra ruta se descarta. */
  const secuenciaCotizacion = useRef(0);

  // ── Detalles (borrador) ───────────────────────────────────────────────────
  // sessionStorage solo existe en el navegador: el borrador y el envío listo se restauran en un
  // efecto tras montar (así el HTML del servidor y la primera pintura del cliente coinciden).
  const [restaurado, setRestaurado] = useState(false);
  const [datos, setDatos] = useState<DatosDetalles>({ ...DATOS_VACIOS, peso: inicial.peso });
  const [errores, setErrores] = useState<ErroresDetalles>({});
  const [sucursalId, setSucursalId] = useState("");
  /** Clave de idempotencia del intento; vacía hasta restaurar (no se genera otra si había guardada). */
  const [idem, setIdem] = useState("");
  const [foto, setFoto] = useState<FotoElegida | null>(null);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const fotoRef = useRef<FotoElegida | null>(null);
  /** Foto ya subida en un intento anterior (no se sube dos veces). */
  const fotoSubida = useRef<{ file: File; path: string } | null>(null);

  // ── Envío y resultado ─────────────────────────────────────────────────────
  const [enviando, setEnviando] = useState(false);
  const enviandoRef = useRef(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<EnvioRegistrado | null>(null);
  const [editando, setEditando] = useState(false);

  // ── Sucursales de la cooperativa elegida ──────────────────────────────────
  const [reintentoSucursales, setReintentoSucursales] = useState(0);
  const [sucursalesCargadas, setSucursalesCargadas] = useState<{ clave: string; resultado: ResultadoSucursales } | null>(
    null
  );

  const opcion = useMemo(
    () => (cotizacion?.tipo === "ok" ? (cotizacion.opciones.find((o) => o.cooperativaId === cooperativaId) ?? null) : null),
    [cotizacion, cooperativaId]
  );
  const esPasajero = pasajero?.esPasajero === true;
  const pesoKg = datos.peso.trim() ? leerMonto(datos.peso) : null;
  const valorUsd = datos.valor.trim() ? leerMonto(datos.valor) : null;
  /** Tope de peso de la tarifa de la cooperativa elegida. */
  const pesoMax = opcion?.pesoMaxKg && opcion.pesoMaxKg > 0 ? opcion.pesoMaxKg : null;

  const erroresDatos = useMemo(() => calcularErroresDetalles(datos, pesoMax).e, [datos, pesoMax]);
  const datosValidos = Object.keys(erroresDatos).length === 0;
  const hayRuta = opcion !== null && esPasajero && resultado === null;

  const url = usePasoEnUrl(PASOS_ENVIO, {
    esAccesible: (p) => {
      // Antes de restaurar no se sabe qué hay guardado: no se redirige todavía.
      if (!restaurado || p === "destino") return true;
      if (p === "listo") return resultado !== null;
      if (p === "revisar") return hayRuta && datosValidos;
      return hayRuta;
    },
  });
  const paso = url.paso;

  // El peso que llega de la portada no cuenta como "lo escribiste tú" para pedir confirmar la salida.
  const hayDatos =
    foto !== null ||
    Object.entries(datos).some(([clave, v]) => typeof v === "string" && v.trim() !== "" && (clave !== "peso" || v !== inicial.peso));
  const { dialogo, confirmarSalida, permitirSalida } = useSalidaProtegida({
    activo: hayDatos && resultado === null,
    bloqueado: enviando,
  });

  // Restaura el envío listo o el borrador al montar (recarga, o volver de iniciar sesión).
  useEffect(() => {
    let cancelado = false;
    void Promise.resolve().then(() => {
      if (cancelado) return;
      const listo = leerListo();
      if (listo) setResultado(listo);
      const b = leerBorrador();
      if (b) {
        // Un peso en la URL (de la portada) manda sobre el del borrador.
        setDatos((d) => ({
          nombre: b.nombre,
          cedula: b.cedula,
          telefono: b.telefono,
          descripcion: b.descripcion,
          peso: d.peso || b.peso,
          valor: b.valor,
          modalidad: b.modalidad,
        }));
        setSucursalId(b.sucursalId);
      }
      // `leerBorrador` ya conserva la clave guardada; solo se crea una si no había borrador.
      setIdem(b?.idem ?? nuevaClaveEnvio());
      setRestaurado(true);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // El borrador sobrevive a recargas y a ir a iniciar sesión.
  useEffect(() => {
    if (!restaurado || resultado || !idem) return;
    guardarBorrador({ ...datos, sucursalId, idem });
  }, [restaurado, datos, sucursalId, idem, resultado]);

  // Libera la vista previa de la foto al salir.
  useEffect(
    () => () => {
      if (fotoRef.current) URL.revokeObjectURL(fotoRef.current.url);
    },
    []
  );

  // Las taquillas se cargan al entrar a los pasos con sesión (con el cliente de sesión).
  const claveSucursales =
    opcion && esPasajero && (paso === "sucursal" || paso === "detalles" || paso === "revisar")
      ? `${opcion.cooperativaId}|${origen}|${reintentoSucursales}`
      : null;
  useEffect(() => {
    if (!claveSucursales || !opcion) return;
    let vigente = true;
    cargarSucursales(opcion.cooperativaId, origen)
      .then((r) => {
        if (vigente) setSucursalesCargadas({ clave: claveSucursales, resultado: r });
      })
      .catch(() => {
        if (vigente) {
          setSucursalesCargadas({
            clave: claveSucursales,
            resultado: { ok: false, error: "No pudimos ver las taquillas. Revisa tu conexión e intenta de nuevo." },
          });
        }
      });
    return () => {
      vigente = false;
    };
  }, [claveSucursales, opcion, origen]);

  const resultadoSucursales =
    claveSucursales && sucursalesCargadas?.clave === claveSucursales ? sucursalesCargadas.resultado : null;
  const listaSucursales = resultadoSucursales?.ok ? resultadoSucursales.sucursales : [];
  const sucursal =
    listaSucursales.find((x) => x.id === sucursalId) ?? (listaSucursales.length === 1 ? listaSucursales[0] : null);

  // ── Costo estimado en vivo ────────────────────────────────────────────────
  // Con el peso escrito (válido y dentro del tope) se consulta la tarifa de la cooperativa elegida,
  // 450 ms después de la última tecla. Si coincide con lo ya cotizado (1 kg) no se consulta de nuevo.
  const opcionId = opcion?.cooperativaId ?? null;
  const pesoEstimable = pesoKg !== null && pesoKg > 0 && (!pesoMax || pesoKg <= pesoMax);
  const claveEstimado = opcionId && pesoEstimable ? `${opcionId}|${origen}|${destino}|${pesoKg}` : null;
  const costoCotizado = opcion && cotizacion?.tipo === "ok" && cotizacion.pesoKg === pesoKg ? opcion : null;
  const tasaCotizada =
    cotizacion?.tipo === "ok" && cotizacion.tasa && cotizacion.tasaFecha
      ? { tasa: cotizacion.tasa, fecha: cotizacion.tasaFecha }
      : null;
  const [estimadoCalculado, setEstimadoCalculado] = useState<EstimadoCalculado | null>(null);
  const consultaActiva = paso === "detalles" || paso === "revisar";

  useEffect(() => {
    if (!consultaActiva || !claveEstimado || !opcionId || pesoKg === null || costoCotizado) return;
    let vigente = true;
    const guardar = (vista: EstimadoVista) => {
      if (vigente) setEstimadoCalculado({ clave: claveEstimado, vista });
    };
    const timer = window.setTimeout(async () => {
      try {
        const r = await cotizarRuta(origen, destino, String(pesoKg));
        const propia = r.tipo === "ok" ? r.opciones.find((o) => o.cooperativaId === opcionId) : undefined;
        if (r.tipo === "ok" && propia) {
          guardar({
            estado: "listo",
            usd: propia.costoUsd,
            bs: propia.costoBs,
            tasa: r.tasa && r.tasaFecha ? { tasa: r.tasa, fecha: r.tasaFecha } : null,
          });
        } else {
          // Límite de consultas, error o sin opción: texto neutro, nunca un error en rojo.
          guardar({ estado: "neutro", mensaje: MENSAJE_ESTIMADO_NEUTRO });
        }
      } catch {
        guardar({ estado: "neutro", mensaje: MENSAJE_ESTIMADO_NEUTRO });
      }
    }, 450);
    return () => {
      vigente = false;
      window.clearTimeout(timer);
    };
  }, [consultaActiva, claveEstimado, opcionId, pesoKg, origen, destino, costoCotizado]);

  const estimado: EstimadoVista = !claveEstimado
    ? { estado: "vacio" }
    : costoCotizado
      ? { estado: "listo", usd: costoCotizado.costoUsd, bs: costoCotizado.costoBs, tasa: tasaCotizada }
      : estimadoCalculado?.clave === claveEstimado
        ? estimadoCalculado.vista
        : { estado: "calculando" };
  const estimadoTexto =
    estimado.estado === "listo" ? formatMoney({ usd: estimado.usd, bs: estimado.bs, tasa: estimado.tasa }).principal : null;

  // ── Paso 1 ────────────────────────────────────────────────────────────────
  const cotizar = (deOrigen: string, aDestino: string) => {
    if (!deOrigen || !aDestino) return;
    const numero = ++secuenciaCotizacion.current;
    empezarCotizacion(async () => {
      try {
        const r = await cotizarRuta(deOrigen, aDestino, "");
        if (numero !== secuenciaCotizacion.current) return;
        setCotizacion(r);
        setErroresDestino(r.tipo === "invalido" && r.campo !== "peso" ? { [r.campo]: r.mensaje } : {});
      } catch {
        if (numero === secuenciaCotizacion.current) setCotizacion({ tipo: "error" });
      }
    });
  };

  const cambiarRuta = (cambio: { origen?: string; destino?: string }) => {
    const nuevoOrigen = cambio.origen ?? origen;
    let nuevoDestino = cambio.destino ?? destino;
    if (cambio.origen !== undefined && !rutas.destinosPorOrigen[nuevoOrigen]?.some((c) => c.ciudad === nuevoDestino)) {
      nuevoDestino = "";
    }
    setOrigen(nuevoOrigen);
    setDestino(nuevoDestino);
    // Lo cotizado ya no corresponde a lo elegido: se descarta y se vuelve a consultar con 1 kg.
    secuenciaCotizacion.current++;
    setCotizacion(null);
    setCooperativaId("");
    setSucursalId("");
    setErroresDestino({});
    sincronizarUrl({ origen: nuevoOrigen, destino: nuevoDestino, coop: null });
    cotizar(nuevoOrigen, nuevoDestino);
  };

  const elegirCooperativa = (id: string) => {
    setCooperativaId(id);
    setSucursalId("");
    sincronizarUrl({ origen, destino, coop: id });
  };

  const urlDelPaso = (p: PasoEnvio, coop: string) => {
    const q = new URLSearchParams();
    if (origen) q.set("origen", origen);
    if (destino) q.set("destino", destino);
    if (pesoKg !== null) q.set("peso", String(pesoKg));
    if (coop) q.set("coop", coop);
    q.set("paso", p);
    return `${RUTAS_PASAJERO.enviar}?${q.toString()}`;
  };

  const reiniciarEnvio = () => {
    if (fotoRef.current) URL.revokeObjectURL(fotoRef.current.url);
    fotoRef.current = null;
    fotoSubida.current = null;
    setFoto(null);
    setErrorFoto(null);
    setDatos(DATOS_VACIOS);
    setErrores({});
    setSucursalId("");
    setErrorEnvio(null);
    setEditando(false);
    setIdem(nuevaClaveEnvio());
    borrarBorrador();
  };

  const continuarDestino = () => {
    if (!opcion) return;
    sincronizarUrl({ origen, destino, coop: opcion.cooperativaId });
    if (!pasajero) {
      // Navegación completa: al volver con sesión no debe quedar caché del router.
      window.location.assign(urlIngresar(urlDelPaso("sucursal", opcion.cooperativaId)));
      return;
    }
    if (!pasajero.esPasajero) return;
    if (resultado) {
      // Un envío nuevo: lo anterior ya quedó registrado.
      setResultado(null);
      borrarListo();
      reiniciarEnvio();
    }
    url.siguiente();
  };

  // ── Pasos siguientes ──────────────────────────────────────────────────────
  const volverAlResumenOSeguir = () => {
    if (editando) {
      setEditando(false);
      url.ir("revisar");
    } else {
      url.siguiente();
    }
  };

  const cambiarDatos = (cambio: Partial<DatosDetalles>) => {
    setDatos((d) => ({ ...d, ...cambio }));
    setErrores((e) => {
      const siguiente = { ...e };
      for (const clave of Object.keys(cambio) as (keyof DatosDetalles)[]) delete siguiente[clave];
      return siguiente;
    });
  };

  const cambiarFoto = (file: File | null) => {
    if (!file) {
      if (fotoRef.current) URL.revokeObjectURL(fotoRef.current.url);
      fotoRef.current = null;
      fotoSubida.current = null;
      setFoto(null);
      setErrorFoto(null);
      return;
    }
    const invalida = validarFotoPaquete(file);
    if (invalida) {
      setErrorFoto(invalida);
      return;
    }
    if (fotoRef.current) URL.revokeObjectURL(fotoRef.current.url);
    const nueva = { file, url: URL.createObjectURL(file) };
    fotoRef.current = nueva;
    fotoSubida.current = null;
    setFoto(nueva);
    setErrorFoto(null);
  };

  /** Marca todos los errores del paso y lleva el foco al primero. */
  const continuarDetalles = () => {
    const { e, orden } = calcularErroresDetalles(datos, pesoMax);
    setErrores(e);
    if (orden.length > 0) {
      enfocar(idDetalle(orden[0]));
      return;
    }
    volverAlResumenOSeguir();
  };

  const registrar = async () => {
    if (enviandoRef.current || !opcion || !pasajero || !datos.modalidad) return;
    enviandoRef.current = true;
    setEnviando(true);
    setErrorEnvio(null);
    try {
      // La foto va a la carpeta de quien envía en el bucket privado; se guarda la ruta.
      let fotoPath: string | null = null;
      if (foto) {
        if (fotoSubida.current?.file === foto.file) {
          fotoPath = fotoSubida.current.path;
        } else {
          const subida = await subirFotoPaquete(foto.file, pasajero.id);
          if (subida.ok) {
            fotoSubida.current = { file: foto.file, path: subida.path };
            fotoPath = subida.path;
          } else {
            avisarInfo(`No pudimos subir la foto; registramos el envío sin ella. ${subida.error}`);
          }
        }
      }

      const r = await registrarEncomienda({
        origen,
        destino,
        cooperativaId: opcion.cooperativaId,
        receptorNombre: datos.nombre,
        receptorCedula: datos.cedula,
        receptorTelefono: datos.telefono,
        descripcion: datos.descripcion,
        pesoKg,
        valorUsd,
        modalidad: datos.modalidad,
        fotoPath,
        idempotencyKey: idem,
      });

      if (!r.ok) {
        if (r.campo === "sesion") {
          window.location.assign(urlIngresar(urlDelPaso("revisar", opcion.cooperativaId)));
          return;
        }
        setErrorEnvio(r.error);
        if (r.campo === "perfil") url.ir("sucursal");
        else if (r.campo === "destinatario" || r.campo === "descripcion") url.ir("detalles");
        return;
      }

      const registrado: EnvioRegistrado = {
        id: r.id,
        trackingId: r.trackingId,
        cooperativa: opcion.cooperativa,
        origen,
        destino,
        sucursal,
        modalidad: datos.modalidad,
        estimado: estimadoTexto,
      };
      guardarListo(registrado);
      reiniciarEnvio();
      setResultado(registrado);
      permitirSalida();
      url.ir("listo", { reemplazar: true });
    } catch {
      setErrorEnvio("No pudimos registrar tu envío. Revisa tu conexión e intenta de nuevo.");
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const otra = () => {
    setResultado(null);
    borrarListo();
    reiniciarEnvio();
    setOrigen("");
    setDestino("");
    secuenciaCotizacion.current++;
    setCotizacion(null);
    setCooperativaId("");
    setErroresDestino({});
    sincronizarUrl({ origen: null, destino: null, peso: null, coop: null });
    url.ir("destino", { reemplazar: true });
  };

  const editar = (destinoPaso: PasoEnvio) => {
    setEditando(destinoPaso === "sucursal" || destinoPaso === "detalles");
    url.ir(destinoPaso);
  };

  // ── Barra de acción de cada paso ──────────────────────────────────────────
  const etiquetaSeguir = editando ? "Volver al resumen" : "Continuar";
  const trayecto = origen && destino ? `${formatCiudad(origen)} → ${formatCiudad(destino)}` : null;
  const modalidadCorta = MODALIDADES.find((m) => m.valor === datos.modalidad)?.titulo ?? null;

  const resumenDestino = !origen
    ? "Elige el origen"
    : !destino
      ? "Elige el destino"
      : cotizacion?.tipo === "sin_opciones"
        ? "Ninguna cooperativa lleva esta ruta"
        : !opcion || cotizacion?.tipo !== "ok"
          ? "Elige la cooperativa"
          : `${trayecto} · ${opcion.cooperativa}`;
  const totalDestino =
    opcion && cotizacion?.tipo === "ok"
      ? (() => {
          const m = montoOpcion(opcion, cotizacion.tasa, cotizacion.tasaFecha);
          return { valor: m.principal, secundario: "desde, 1 kg", accesible: `Desde ${m.accesible}` };
        })()
      : undefined;
  const totalEstimado = estimadoTexto ? { valor: estimadoTexto, secundario: "estimado" } : undefined;

  const barra =
    paso === "listo" ? (
      <BarraFlujo
        resumen={resultado?.trackingId ? `Código ${resultado.trackingId}` : undefined}
        principal={{
          etiqueta: "Ver encomienda",
          onClick: () => router.push(resultado ? urlEncomienda(resultado.id) : RUTAS_PASAJERO.misEncomiendas),
        }}
        secundaria={{ etiqueta: "Otro envío", onClick: otra }}
      />
    ) : paso === "destino" ? (
      <BarraFlujo
        resumen={resumenDestino}
        total={totalDestino}
        principal={{
          etiqueta: pasajero ? "Continuar" : "Continuar e iniciar sesión",
          flecha: true,
          onClick: continuarDestino,
          deshabilitado: !opcion || (pasajero !== null && !pasajero.esPasajero),
        }}
      />
    ) : paso === "sucursal" ? (
      <BarraFlujo
        resumen={
          !pasajero?.perfilCompleto
            ? "Completa tus datos para continuar"
            : listaSucursales.length > 1 && !sucursal
              ? "Elige una taquilla"
              : (sucursal?.nombre ?? undefined)
        }
        principal={{
          etiqueta: etiquetaSeguir,
          flecha: true,
          onClick: volverAlResumenOSeguir,
          deshabilitado: !pasajero?.perfilCompleto || resultadoSucursales === null || (listaSucursales.length > 1 && !sucursal),
        }}
      />
    ) : paso === "detalles" ? (
      <BarraFlujo
        resumen={
          Object.keys(errores).length > 0
            ? "Revisa los campos marcados en rojo"
            : [trayecto, modalidadCorta].filter(Boolean).join(" · ") || undefined
        }
        total={Object.keys(errores).length > 0 ? undefined : totalEstimado}
        principal={{ etiqueta: etiquetaSeguir, flecha: true, type: "submit", form: ID_FORMULARIO_DETALLES }}
      />
    ) : (
      <BarraFlujo
        resumen={[trayecto, modalidadCorta].filter(Boolean).join(" · ") || undefined}
        total={totalEstimado}
        principal={{
          etiqueta: "Registrar envío",
          etiquetaCargando: "Registrando…",
          onClick: () => void registrar(),
          cargando: enviando,
          deshabilitado: !datosValidos || !opcion,
        }}
      />
    );

  const atras = () => (url.indice > 0 ? url.anterior() : confirmarSalida(() => router.push(RUTAS_PASAJERO.inicio)));

  return (
    <ArmazonFlujoSitio>
      {dialogo}
      <FlujoPagina
        titulo={TITULOS[paso]}
        paso={paso === "listo" ? undefined : url.numero}
        total={paso === "listo" ? undefined : PASOS_ENVIO.length - 1}
        descripcion={DESCRIPCIONES[paso]}
        onAtras={paso === "listo" ? undefined : atras}
        atrasEtiqueta={url.indice > 0 ? "Volver al paso anterior" : "Salir del envío"}
        barra={barra}
      >
        {!restaurado && paso !== "destino" && (
          <p className="py-8 text-center text-[15px] text-muted-foreground" role="status">
            Recuperando tu envío…
          </p>
        )}
        {paso === "destino" && (
          <PasoDestino
            rutas={rutas}
            origen={origen}
            destino={destino}
            onCambiar={cambiarRuta}
            errores={erroresDestino}
            cotizacion={cotizacion}
            cotizando={cotizando}
            onReintentar={() => cotizar(origen, destino)}
            cooperativaId={cooperativaId}
            onElegir={elegirCooperativa}
            avisoStaff={pasajero !== null && !pasajero.esPasajero}
          />
        )}
        {paso === "sucursal" && opcion && (
          <PasoSucursal
            cooperativa={opcion.cooperativa}
            ciudad={origen}
            resultado={resultadoSucursales}
            sucursalId={sucursal?.id ?? ""}
            onElegir={setSucursalId}
            onReintentar={() => setReintentoSucursales((n) => n + 1)}
            perfilCompleto={pasajero?.perfilCompleto === true}
            cedula={pasajero?.cedula ?? null}
            telefono={pasajero?.telefono ?? null}
          />
        )}
        {paso === "detalles" && opcion && pasajero && (
          <>
            {errorEnvio && <AvisoError>{errorEnvio}</AvisoError>}
            <PasoDetalles
              datos={datos}
              onCambiar={cambiarDatos}
              errores={errores}
              remitente={{ nombre: pasajero.nombre, cedula: pasajero.cedula, telefono: pasajero.telefono }}
              foto={foto}
              onFoto={cambiarFoto}
              errorFoto={errorFoto}
              cooperativa={opcion.cooperativa}
              pesoMax={pesoMax}
              dimensionesMax={opcion.dimensionesMaxCm && opcion.dimensionesMaxCm > 0 ? opcion.dimensionesMaxCm : null}
              estimado={estimado}
              onEnviar={continuarDetalles}
            />
          </>
        )}
        {paso === "revisar" && opcion && pasajero && datos.modalidad && (
          <PasoRevisar
            origen={origen}
            destino={destino}
            cooperativa={opcion.cooperativa}
            sucursal={sucursal}
            remitente={{ nombre: pasajero.nombre, cedula: pasajero.cedula, telefono: pasajero.telefono }}
            nombre={datos.nombre.trim().replace(/\s+/g, " ")}
            cedula={datos.cedula}
            telefono={datos.telefono}
            descripcion={datos.descripcion.trim()}
            pesoKg={pesoKg}
            valorUsd={valorUsd}
            foto={foto}
            modalidad={datos.modalidad}
            estimadoTexto={estimadoTexto}
            onEditar={editar}
            error={errorEnvio}
          />
        )}
        {paso === "listo" && resultado && <PasoListo envio={resultado} />}
      </FlujoPagina>
    </ArmazonFlujoSitio>
  );
}
