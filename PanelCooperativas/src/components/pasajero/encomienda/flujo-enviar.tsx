"use client";

// ─── Enviar encomienda (web del pasajero) ────────────────────────────────────
// Versión web de `EnBusApp/app/encomiendas/nueva.tsx`. Pasos en `?paso=`:
//   ruta (público) → sucursal → destinatario → revisar → listo.
// La selección (origen, destino, peso, cooperativa) vive en la URL, así que ir a iniciar sesión
// y volver, o recargar, retoma el mismo punto. Lo que se escribe del destinatario va a un
// borrador en sessionStorage.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarraFlujo, FlujoPagina, usePasoEnUrl, useSalidaProtegida } from "@/components/flujo";
import { avisarInfo } from "@/lib/avisos";
import { leerMonto } from "@/lib/dinero";
import { urlIngresar, RUTAS_PASAJERO } from "@/lib/pasajero/rutas";
import { cedulaValida, telefonoValido } from "@/lib/ve";
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
import s from "./enviar.module.css";
import { PasoDestinatario, validarDestinatario, type DatosDestinatario, type ErroresDestinatario, type FotoElegida } from "./paso-destinatario";
import { PasoListo } from "./paso-listo";
import { montoOpcion, PasoRuta, type ErroresRuta } from "./paso-ruta";
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
    esPasajero: boolean;
    perfilCompleto: boolean;
    cedula: string | null;
    telefono: string | null;
  } | null;
}

const TITULOS: Record<PasoEnvio, string> = {
  ruta: "Ruta y paquete",
  sucursal: "Entrega en sucursal",
  destinatario: "Destinatario y contenido",
  revisar: "Revisa y confirma",
  listo: "¡Listo, registramos tu envío!",
};

const DESCRIPCIONES: Partial<Record<PasoEnvio, string>> = {
  ruta: "Elige de dónde a dónde va tu paquete y compara cooperativas. No necesitas cuenta para ver los costos.",
  sucursal: "Dónde llevarás el paquete para que lo reciban.",
  destinatario: "A quién se lo entregan y qué lleva.",
  revisar: "Confirma que todo esté bien antes de registrar el envío.",
};

const DATOS_VACIOS: DatosDestinatario = { nombre: "", cedula: "", telefono: "", descripcion: "", valor: "", modalidad: "" };

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

function textoPeso(pesoKg: number | null): string | null {
  return pesoKg === null ? null : String(pesoKg);
}

export function FlujoEnviar({ rutas, inicial, cotizacionInicial, pasajero }: Props) {
  const router = useRouter();

  // ── Selección (paso 1) ────────────────────────────────────────────────────
  const [origen, setOrigen] = useState(inicial.origen);
  const [destino, setDestino] = useState(inicial.destino);
  const [peso, setPeso] = useState(inicial.peso);
  const [cotizacion, setCotizacion] = useState<Cotizacion | null>(cotizacionInicial);
  const [cooperativaId, setCooperativaId] = useState(inicial.cooperativaId);
  const [erroresRuta, setErroresRuta] = useState<ErroresRuta>(() =>
    cotizacionInicial?.tipo === "invalido" ? { [cotizacionInicial.campo]: cotizacionInicial.mensaje } : {}
  );
  const [cotizando, empezarCotizacion] = useTransition();

  // ── Datos del destinatario (borrador) ─────────────────────────────────────
  // sessionStorage solo existe en el navegador: el borrador y el envío listo se restauran en un
  // efecto tras montar (así el HTML del servidor y la primera pintura del cliente coinciden).
  const [restaurado, setRestaurado] = useState(false);
  const [datos, setDatos] = useState<DatosDestinatario>(DATOS_VACIOS);
  const [errores, setErrores] = useState<ErroresDestinatario>({});
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
  const pesoKg = peso.trim() ? leerMonto(peso) : null;
  const valorUsd = datos.valor.trim() ? leerMonto(datos.valor) : null;

  const erroresDatos = useMemo(
    () =>
      validarDestinatario(datos, {
        cedula: cedulaValida(datos.cedula),
        telefono: telefonoValido(datos.telefono),
        valor: !datos.valor.trim() || leerMonto(datos.valor) !== null,
      }),
    [datos]
  );
  const datosValidos = Object.keys(erroresDatos).length === 0;
  const hayRuta = opcion !== null && esPasajero && resultado === null;

  const url = usePasoEnUrl(PASOS_ENVIO, {
    esAccesible: (p) => {
      // Antes de restaurar no se sabe qué hay guardado: no se redirige todavía.
      if (!restaurado || p === "ruta") return true;
      if (p === "listo") return resultado !== null;
      if (p === "revisar") return hayRuta && datosValidos;
      return hayRuta;
    },
  });
  const paso = url.paso;

  const hayDatos =
    foto !== null || Object.entries(datos).some(([, v]) => typeof v === "string" && v.trim() !== "");
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
        setDatos({
          nombre: b.nombre,
          cedula: b.cedula,
          telefono: b.telefono,
          descripcion: b.descripcion,
          valor: b.valor,
          modalidad: b.modalidad,
        });
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
    opcion && esPasajero && (paso === "sucursal" || paso === "destinatario" || paso === "revisar")
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

  // ── Paso 1 ────────────────────────────────────────────────────────────────
  const cambiarRuta = (cambio: { origen?: string; destino?: string; peso?: string }) => {
    const nuevoOrigen = cambio.origen ?? origen;
    let nuevoDestino = cambio.destino ?? destino;
    if (cambio.origen !== undefined && !rutas.destinosPorOrigen[nuevoOrigen]?.some((c) => c.ciudad === nuevoDestino)) {
      nuevoDestino = "";
    }
    setOrigen(nuevoOrigen);
    setDestino(nuevoDestino);
    setPeso(cambio.peso ?? peso);
    // Lo cotizado ya no corresponde a lo que hay en los campos.
    setCotizacion(null);
    setCooperativaId("");
    setErroresRuta({});
  };

  const cotizar = () => {
    if (cotizando) return;
    const faltas: ErroresRuta = {};
    if (!origen) faltas.origen = "Elige la ciudad de origen.";
    if (!destino) faltas.destino = "Elige la ciudad de destino.";
    const pesoLeido = peso.trim() ? leerMonto(peso) : null;
    if (peso.trim() && pesoLeido === null) faltas.peso = "Escribe el peso en kilos, por ejemplo 2,5.";
    setErroresRuta(faltas);
    if (faltas.origen || faltas.destino || faltas.peso) return;

    setCooperativaId("");
    sincronizarUrl({ origen, destino, peso: textoPeso(pesoLeido), coop: null });
    empezarCotizacion(async () => {
      try {
        const r = await cotizarRuta(origen, destino, peso);
        setCotizacion(r);
        setErroresRuta(r.tipo === "invalido" ? { [r.campo]: r.mensaje } : {});
      } catch {
        setCotizacion({ tipo: "error" });
      }
    });
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

  const continuarRuta = () => {
    if (!opcion) return;
    sincronizarUrl({ origen, destino, peso: textoPeso(pesoKg), coop: opcion.cooperativaId });
    if (!pasajero) {
      router.push(urlIngresar(urlDelPaso("sucursal", opcion.cooperativaId)));
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

  const cambiarDatos = (cambio: Partial<DatosDestinatario>) => {
    setDatos((d) => ({ ...d, ...cambio }));
    setErrores((e) => {
      const siguiente = { ...e };
      for (const clave of Object.keys(cambio) as (keyof DatosDestinatario)[]) delete siguiente[clave];
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

  const continuarDestinatario = () => {
    setErrores(erroresDatos);
    if (!datosValidos) {
      // Lleva el foco al primer campo con error.
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    volverAlResumenOSeguir();
  };

  const estimado = useMemo(() => {
    if (!opcion || cotizacion?.tipo !== "ok" || cotizacion.referencia) return null;
    const m = montoOpcion(opcion, cotizacion.tasa, cotizacion.tasaFecha);
    return { principal: m.principal, secundario: m.secundario };
  }, [opcion, cotizacion]);

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
          router.push(urlIngresar(urlDelPaso("revisar", opcion.cooperativaId)));
          return;
        }
        setErrorEnvio(r.error);
        if (r.campo === "perfil") url.ir("sucursal");
        else if (r.campo === "destinatario" || r.campo === "descripcion") url.ir("destinatario");
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
        estimado: estimado ? [estimado.principal, estimado.secundario].filter(Boolean).join(" ") : null,
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
    setPeso("");
    setCotizacion(null);
    setCooperativaId("");
    setErroresRuta({});
    sincronizarUrl({ origen: null, destino: null, peso: null, coop: null });
    url.ir("ruta", { reemplazar: true });
  };

  const editar = (destinoPaso: PasoEnvio) => {
    setEditando(destinoPaso === "sucursal" || destinoPaso === "destinatario");
    url.ir(destinoPaso);
  };

  // ── Barra de acción de cada paso ──────────────────────────────────────────
  const etiquetaSeguir = editando ? "Volver al resumen" : "Continuar";
  const barra =
    paso === "listo" ? undefined : paso === "ruta" ? (
      cotizacion?.tipo === "ok" ? (
        <BarraFlujo
          resumen={
            opcion && cotizacion.tipo === "ok"
              ? `${opcion.cooperativa} · ${montoOpcion(opcion, cotizacion.tasa, cotizacion.tasaFecha).principal}`
              : "Elige una cooperativa"
          }
          principal={{
            etiqueta: pasajero ? "Continuar" : "Continuar e iniciar sesión",
            onClick: continuarRuta,
            deshabilitado: !opcion || (pasajero !== null && !pasajero.esPasajero),
          }}
        />
      ) : (
        <BarraFlujo
          principal={{
            etiqueta: "Ver cooperativas y costos",
            etiquetaCargando: "Buscando…",
            type: "submit",
            form: "form-ruta",
            cargando: cotizando,
            deshabilitado: rutas.origenes.length === 0,
          }}
        />
      )
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
          onClick: volverAlResumenOSeguir,
          deshabilitado: !pasajero?.perfilCompleto || resultadoSucursales === null || (listaSucursales.length > 1 && !sucursal),
        }}
      />
    ) : paso === "destinatario" ? (
      <BarraFlujo
        resumen={Object.keys(errores).length > 0 ? "Revisa los campos marcados" : undefined}
        principal={{ etiqueta: etiquetaSeguir, onClick: continuarDestinatario }}
      />
    ) : (
      <BarraFlujo
        resumen={
          datos.modalidad
            ? [datos.modalidad === "ORIGEN" ? "Pagas al entregar" : "Paga quien recibe", estimado ? `Estimado ${estimado.principal}` : null]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        principal={{
          etiqueta: "Registrar envío",
          etiquetaCargando: "Registrando…",
          onClick: registrar,
          cargando: enviando,
          deshabilitado: !datosValidos || !opcion,
        }}
      />
    );

  const atras = () => (url.indice > 0 ? url.anterior() : confirmarSalida(() => router.push(RUTAS_PASAJERO.inicio)));

  return (
    <div className={s.armazon}>
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
        {!restaurado && paso !== "ruta" && (
          <p className={s.cargando} role="status">
            Recuperando tu envío…
          </p>
        )}
        {paso === "ruta" && (
          <PasoRuta
            rutas={rutas}
            origen={origen}
            destino={destino}
            peso={peso}
            onCambiar={cambiarRuta}
            errores={erroresRuta}
            cotizacion={cotizacion}
            cotizando={cotizando}
            onCotizar={cotizar}
            cooperativaId={cooperativaId}
            onElegir={setCooperativaId}
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
        {paso === "destinatario" && opcion && (
          <PasoDestinatario
            datos={datos}
            onCambiar={cambiarDatos}
            errores={errores}
            foto={foto}
            onFoto={cambiarFoto}
            errorFoto={errorFoto}
            cooperativa={opcion.cooperativa}
          />
        )}
        {paso === "revisar" && opcion && datos.modalidad && (
          <PasoRevisar
            origen={origen}
            destino={destino}
            cooperativa={opcion.cooperativa}
            sucursal={sucursal}
            nombre={datos.nombre.trim()}
            cedula={datos.cedula}
            telefono={datos.telefono}
            descripcion={datos.descripcion.trim()}
            pesoKg={pesoKg}
            valorUsd={valorUsd}
            foto={foto}
            modalidad={datos.modalidad}
            estimado={estimado}
            onEditar={editar}
            error={errorEnvio}
            deshabilitado={enviando}
          />
        )}
        {paso === "listo" && resultado && <PasoListo envio={resultado} onOtra={otra} />}
      </FlujoPagina>
    </div>
  );
}
