import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, MapPin, Storefront } from "@phosphor-icons/react/dist/ssr";
import { CancelarEnvio, PagarEnvio } from "@/components/pasajero/cuenta/acciones-envio";
import { CodigoQr } from "@/components/pasajero/cuenta/codigo-qr";
import { CopiarTexto } from "@/components/pasajero/cuenta/copiar-texto";
import { Aviso, ErrorCarga, EstadoChip } from "@/components/pasajero/cuenta/piezas";
import { describirPunto, esUuid, lineaDeTiempo } from "@/components/pasajero/cuenta/formato";
import {
  PAGO_ENCOMIENDA_COLUMNAS,
  uno,
  type EncomiendaDetalle,
  type HistorialEncomiendaFila,
  type PagoEncomiendaFila,
  type SucursalFila,
} from "@/components/pasajero/cuenta/tipos";
import estilos from "@/components/pasajero/cuenta/cuenta-ui.module.css";
import detalle from "@/components/pasajero/cuenta/detalle.module.css";
import { qrEncomienda } from "@/lib/artefactos.generated";
import { formatCiudad } from "@/lib/ciudades";
import { formatMoney, formatNumeroVE } from "@/lib/dinero";
import { formatDiaHoraVE } from "@/lib/fechas";
import { urlFirmadaFoto } from "@/lib/fotos";
import { encomiendaEsActiva, estadoEncomienda, puedePagarEncomienda } from "@/lib/pasajero/estados";
import { leerMetodosPago, leerTasaVigente } from "@/lib/pasajero/pagos";
import { RUTAS_PASAJERO, urlEncomienda } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import { createClient } from "@/lib/supabase/server";
import { formatTelefono } from "@/lib/ve";

export const metadata: Metadata = { title: "Encomienda" };

const EN_TAQUILLA = ["EN_RECEPCION", "POR_PAGAR", "PAGADA"];

export default async function DetalleEncomiendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const pasajero = await exigirPasajero(urlEncomienda(id));

  const supabase = await createClient();
  const { data: enc, error } = await supabase
    .from("encomiendas")
    .select("*, cooperativas ( nombre )")
    .eq("id", id)
    .maybeSingle<EncomiendaDetalle>();

  if (error) {
    console.error("[encomienda] No se pudo leer la encomienda:", error.code, error.message);
    return (
      <div className={estilos.pagina}>
        <ErrorCarga href={urlEncomienda(id)} que="la encomienda" />
      </div>
    );
  }
  // Solo las partes del envío: la política de la base también deja ver las de la cooperativa.
  if (!enc || (enc.sender_id !== pasajero.id && enc.receiver_user_id !== pasajero.id)) notFound();

  const esRemitente = enc.sender_id === pasajero.id;
  const rol = esRemitente ? "remitente" : "destinatario";
  const coop = uno(enc.cooperativas)?.nombre ?? null;
  const esTaquilla = enc.origen_registro === "TAQUILLA";

  const [historialR, pagosR, remitenteR, sucOrigenR, sucDestinoR, fotoCliente, fotoTaquilla, tasa] = await Promise.all([
    supabase
      .from("encomienda_estado_historial")
      .select("id, estado_nuevo, created_at")
      .eq("encomienda_id", id)
      .order("created_at", { ascending: true })
      .limit(100)
      .returns<HistorialEncomiendaFila[]>(),
    supabase
      .from("pagos")
      .select(PAGO_ENCOMIENDA_COLUMNAS)
      .eq("encomienda_id", id)
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<PagoEncomiendaFila[]>(),
    !esRemitente && !esTaquilla
      ? supabase.rpc("fn_remitente_de_encomienda", { p_encomienda_id: id })
      : Promise.resolve({ data: null }),
    enc.cooperativa_id && enc.ciudad_origen
      ? supabase.rpc("fn_sucursales_en_ciudad", { p_cooperativa_id: enc.cooperativa_id, p_ciudad: enc.ciudad_origen })
      : Promise.resolve({ data: null }),
    enc.cooperativa_id && enc.ciudad_destino
      ? supabase.rpc("fn_sucursales_en_ciudad", { p_cooperativa_id: enc.cooperativa_id, p_ciudad: enc.ciudad_destino })
      : Promise.resolve({ data: null }),
    urlFirmadaFoto(supabase, enc.foto_cliente_path),
    urlFirmadaFoto(supabase, enc.foto_evidencia_url),
    leerTasaVigente(),
  ]);

  const historial = historialR.data ?? [];
  const pagos = pagosR.data ?? [];
  const { estado, cobro } = estadoEncomienda(enc, pagos);
  const puedePagar = puedePagarEncomienda(enc, cobro, rol);
  const metodos = puedePagar && enc.cooperativa_id ? await leerMetodosPago(enc.cooperativa_id) : [];

  const costo = Number(enc.costo_calculado) || 0;
  const pagaDestino = enc.modalidad_pago === "DESTINO";
  const activa = encomiendaEsActiva(enc.estado);
  const remitenteNombre = esTaquilla
    ? enc.remitente_nombre
    : ((remitenteR.data as { nombre?: string | null } | null)?.nombre ?? enc.remitente_nombre);
  const destinatario = enc.receiver_nombre?.trim() || "Quien recibe";
  const pagoVisible = cobro.pago as PagoEncomiendaFila | null;
  const pagoEsMio = !pagoVisible?.pagador_id || pagoVisible.pagador_id === pasajero.id;

  const puntoEntrega = describirPunto((sucOrigenR.data ?? null) as SucursalFila[] | null, {
    preferidaId: enc.sucursal_origen_id,
    cooperativa: coop,
    ciudad: formatCiudad(enc.ciudad_origen),
  });
  const puntoRetiro = describirPunto((sucDestinoR.data ?? null) as SucursalFila[] | null, {
    preferidaId: enc.sucursal_destino_id,
    cooperativa: coop,
    ciudad: formatCiudad(enc.ciudad_destino),
  });

  const pin = !esRemitente && activa ? enc.pin_retiro : null;
  const enOficina = enc.estado === "EN_OFICINA_DESTINO";
  const pasos = lineaDeTiempo(enc.estado, historial, enc.created_at);
  const peso = Number(enc.peso_kg) > 0 ? `${formatNumeroVE(Number(enc.peso_kg), 1)} kg` : "Por pesar";
  const costoTxt = costo > 0 ? formatMoney({ usd: costo, tasa }) : null;
  const tracking = enc.tracking_id;

  return (
    <div className={estilos.pagina}>
      <Link href={RUTAS_PASAJERO.misEncomiendas} className={detalle.volver}>
        <ArrowLeft aria-hidden />
        Mis encomiendas
      </Link>

      <header className={detalle.titulo}>
        <h1>
          Encomienda <span className={estilos.codigo}>{tracking ?? ""}</span>
        </h1>
        <div className={detalle.meta}>
          <EstadoChip estado={estado} />
          {cobro.estado !== "NO_APLICA" && (esRemitente || pagaDestino) && <EstadoChip estado={cobro} />}
          <span>{estado.descripcion}</span>
        </div>
        {tracking && (
          <div className={detalle.meta}>
            <CopiarTexto texto={tracking} etiqueta="el código de seguimiento" />
            <Link href="/#rastrear" className="s-enlace">
              Rastreo público
            </Link>
          </div>
        )}
      </header>

      <div className={detalle.columnas}>
        <div className={detalle.apilado}>
          <section className={estilos.pase} aria-label="Ruta y código del envío">
            <div className={estilos.paseCab}>
              <p className={estilos.paseCoop}>
                <span>{coop ?? "Cooperativa"}</span>
              </p>
              <h2 className={estilos.paseRuta}>
                {formatCiudad(enc.ciudad_origen) || "—"} → {formatCiudad(enc.ciudad_destino) || "—"}
              </h2>
            </div>
            {esRemitente && activa && (
              <>
                <div className={estilos.perfora} aria-hidden />
                <div className={detalle.qrCaja}>
                  <div className={detalle.qrMarco}>
                    <CodigoQr valor={qrEncomienda(enc)} titulo={`Código QR de la encomienda ${tracking ?? ""}`} />
                  </div>
                  {tracking && <p className={detalle.qrCodigo}>{tracking}</p>}
                  <p className={detalle.qrAyuda}>
                    {enc.estado === "PENDIENTE_DE_ESCANEO"
                      ? "Muestra este código en la taquilla al entregar el paquete."
                      : "Este es el código de tu envío."}
                  </p>
                </div>
              </>
            )}
            {enc.estado === "PENDIENTE_DE_ESCANEO" && esRemitente && (
              <>
                <div className={estilos.perfora} aria-hidden />
                <div className={estilos.aviso} data-tono="info" style={{ margin: 16 }}>
                  <Storefront aria-hidden weight="fill" />
                  <div>
                    <strong>Dónde entregarla</strong>
                    {puntoEntrega.completo}
                    {puntoEntrega.detalle && <div>{puntoEntrega.detalle}</div>}
                  </div>
                </div>
              </>
            )}
          </section>

          {!esRemitente && activa && !enc.pin_retiro && (
            <Aviso>Tu PIN de retiro aparecerá cuando la cooperativa reciba el paquete.</Aviso>
          )}
          {pin && (
            <section className={detalle.tarjeta} aria-labelledby="pin-titulo">
              <h2 id="pin-titulo">PIN de retiro</h2>
              {enOficina ? (
                <p>Retírala en {puntoRetiro.completo} con este PIN y tu cédula.</p>
              ) : (
                <p>Lo necesitarás cuando llegue a {formatCiudad(enc.ciudad_destino) || "tu ciudad"}, junto con tu cédula.</p>
              )}
              <ul className={detalle.pin} aria-label={`PIN de retiro ${pin.split("").join(" ")}`}>
                {pin.split("").map((d, i) => (
                  <li key={i} aria-hidden>
                    {d}
                  </li>
                ))}
              </ul>
              <div>
                <CopiarTexto texto={pin} etiqueta="el PIN" />
              </div>
              {enc.pin_bloqueado && (
                <Aviso tono="aviso" vivo>
                  Tu PIN se bloqueó por intentos fallidos. Pide en la taquilla que lo desbloqueen.
                </Aviso>
              )}
            </section>
          )}
        </div>

        <div className={detalle.apilado}>
          {/* ── Cobro ── */}
          {cobro.estado === "PAGADO" && (
            <Aviso tono="ok" titulo="Pago confirmado">
              {pagaDestino
                ? pagoVisible && !pagoEsMio
                  ? esRemitente
                    ? `${destinatario} ya pagó. Para retirarla solo necesita su PIN y su cédula.`
                    : "Pagado por quien envía. Para retirarla solo necesitas tu PIN y tu cédula."
                  : esRemitente
                    ? "Quien recibe solo necesita su PIN y su cédula para retirarla."
                    : "Para retirarla solo necesitas tu PIN y tu cédula."
                : "El envío está pagado."}
            </Aviso>
          )}
          {cobro.estado === "EN_VERIFICACION" && (
            <Aviso tono="aviso" titulo="Pago en verificación">
              {!pagoEsMio
                ? `${esRemitente ? destinatario : "Quien envía"} registró el pago y la cooperativa lo está revisando.`
                : pagoVisible?.numero_referencia
                  ? `Referencia ${pagoVisible.numero_referencia}. Te avisaremos cuando la cooperativa lo confirme.`
                  : "Te avisaremos cuando la cooperativa lo confirme."}
            </Aviso>
          )}
          {cobro.estado === "RECHAZADO" && (
            <Aviso tono="error" titulo="Pago rechazado" vivo>
              Motivo: {cobro.motivoRechazo || "la cooperativa no indicó el motivo."}{" "}
              {pagaDestino ? "Puedes pagarlo tú o dejar que lo pague quien retira." : "Registra el pago de nuevo."}
            </Aviso>
          )}
          {cobro.estado === "COSTO_PENDIENTE" && activa && (
            <Aviso titulo={pagaDestino ? "Se paga al retirar" : "Se paga en origen"}>
              La taquilla calcula el costo al pesar el paquete.{esRemitente && !pagaDestino ? " Pagas ahí o desde aquí." : ""}
            </Aviso>
          )}
          {pagaDestino && esRemitente && cobro.estado === "SIN_PAGO" && (
            <Aviso titulo="Paga quien recibe">
              {costoTxt ? `${destinatario} pagará ${costoTxt.principal} al retirarla.` : `${destinatario} lo paga al retirarla.`}
            </Aviso>
          )}

          {puedePagar && metodos.length > 0 && costo > 0 && (
            <section className={detalle.tarjeta} aria-labelledby="pagar-titulo">
              <h2 id="pagar-titulo">Pagar el envío</h2>
              <PagarEnvio
                encomiendaId={enc.id}
                metodos={metodos}
                totalUsd={costo}
                tasa={tasa}
                opcional={pagaDestino && esRemitente}
              />
            </section>
          )}
          {puedePagar && metodos.length === 0 && (
            <Aviso tono="aviso" titulo="Aún no puedes pagar en línea">
              {coop ?? "La cooperativa"} no tiene formas de pago activas. Paga en su taquilla.
            </Aviso>
          )}

          {/* ── Seguimiento ── */}
          <section className={detalle.tarjeta} aria-labelledby="seguimiento-titulo">
            <h2 id="seguimiento-titulo">Seguimiento</h2>
            <ol className={detalle.tiempo}>
              {pasos.map((p) => (
                <li key={p.clave} className={detalle.paso} data-situacion={p.situacion} aria-current={p.situacion === "actual" ? "step" : undefined}>
                  <span className={detalle.punto} aria-hidden>
                    {p.situacion === "completada" ? <Check weight="bold" /> : null}
                  </span>
                  <span className={detalle.pasoTexto}>
                    <strong>{p.etiqueta}</strong>
                    <span>
                      {p.situacion === "completada" ? "Completada" : p.situacion === "actual" ? "Etapa actual" : p.situacion === "cortada" ? "Cerrada" : "Pendiente"}
                      {p.fecha ? ` · ${formatDiaHoraVE(p.fecha)}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* ── Detalles ── */}
          <section className={detalle.tarjeta} aria-labelledby="detalles-titulo">
            <h2 id="detalles-titulo">Detalles</h2>
            <dl className={detalle.datos}>
              {!esRemitente && (
                <div className={detalle.ancho}>
                  <dt>Te la envía</dt>
                  <dd>{remitenteNombre || "Sin datos de quien envía"}</dd>
                </div>
              )}
              {esRemitente && (
                <div className={detalle.ancho}>
                  <dt>Quien recibe</dt>
                  <dd>
                    {destinatario}
                    {enc.receiver_telefono && <small>{formatTelefono(enc.receiver_telefono)}</small>}
                  </dd>
                </div>
              )}
              <div className={detalle.ancho}>
                <dt>Contenido</dt>
                <dd>{enc.descripcion_contenido || "Sin descripción"}</dd>
              </div>
              <div>
                <dt>Peso</dt>
                <dd>{peso}</dd>
              </div>
              <div>
                <dt>Costo del envío</dt>
                <dd>
                  {costoTxt ? costoTxt.principal : "Por calcular"}
                  <small>
                    {pagaDestino ? "Paga quien recibe" : "Paga quien envía"}
                    {costoTxt?.secundario ? ` · ${costoTxt.secundario}` : ""}
                  </small>
                </dd>
              </div>
              {esRemitente && (
                <div className={detalle.ancho}>
                  <dt>Dónde la entregas</dt>
                  <dd>
                    {puntoEntrega.completo}
                    {puntoEntrega.detalle && <small>{puntoEntrega.detalle}</small>}
                  </dd>
                </div>
              )}
              <div className={detalle.ancho}>
                <dt>Dónde se retira</dt>
                <dd>
                  <MapPin aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  {puntoRetiro.completo}
                  {puntoRetiro.detalle && <small>{puntoRetiro.detalle}</small>}
                </dd>
              </div>
              <div>
                <dt>Creada</dt>
                <dd>{formatDiaHoraVE(enc.created_at)}</dd>
              </div>
            </dl>
          </section>

          {/* ── Fotos ── */}
          {(fotoCliente || fotoTaquilla) && (
            <section className={detalle.tarjeta} aria-labelledby="fotos-titulo">
              <h2 id="fotos-titulo">Fotos</h2>
              {fotoCliente && (
                <figure>
                  {/* URL firmada de un bucket privado: no pasa por el optimizador de imágenes. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoCliente} alt="Foto del paquete que subiste al registrarlo" className={detalle.foto} loading="lazy" />
                  <figcaption style={{ fontSize: "var(--t-xs)", marginTop: 6 }}>La que subiste al registrarla</figcaption>
                </figure>
              )}
              {fotoTaquilla && (
                <figure>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotoTaquilla} alt="Foto del paquete que tomó la taquilla" className={detalle.foto} loading="lazy" />
                  <figcaption style={{ fontSize: "var(--t-xs)", marginTop: 6 }}>La que tomó la taquilla al recibirla</figcaption>
                </figure>
              )}
            </section>
          )}

          {esRemitente && enc.estado === "PENDIENTE_DE_ESCANEO" && <CancelarEnvio encomiendaId={enc.id} />}
          {esRemitente && EN_TAQUILLA.includes(enc.estado) && (
            <p style={{ fontSize: "var(--t-small)" }}>Ya está en la taquilla. Para cancelarla, habla con la cooperativa.</p>
          )}
        </div>
      </div>
    </div>
  );
}
