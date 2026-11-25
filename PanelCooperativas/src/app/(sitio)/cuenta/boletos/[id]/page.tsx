import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, IdentificationCard, MapPin } from "@phosphor-icons/react/dist/ssr";
import { AccionesBoleto, type DatosCalendario } from "@/components/pasajero/cuenta/acciones-boleto";
import { CodigoQr } from "@/components/pasajero/cuenta/codigo-qr";
import { CopiarTexto } from "@/components/pasajero/cuenta/copiar-texto";
import { EstilosImpresion } from "@/components/pasajero/cuenta/estilos-impresion";
import { Aviso, ErrorCarga, EstadoChip } from "@/components/pasajero/cuenta/piezas";
import { ReservaContador } from "@/components/pasajero/cuenta/reserva-contador";
import {
  ahoraMs,
  aMs,
  describirPunto,
  esUuid,
  ordenarAsientos,
  salidaYaOcurrio,
  sumarUsd,
  textoRuta,
  unirAsientos,
} from "@/components/pasajero/cuenta/formato";
import {
  SELECT_BOLETO,
  SELECT_BOLETO_COMPRA,
  uno,
  type BoletoCompra,
  type BoletoDetalle,
  type SucursalFila,
} from "@/components/pasajero/cuenta/tipos";
import estilos from "@/components/pasajero/cuenta/cuenta-ui.module.css";
import detalle from "@/components/pasajero/cuenta/detalle.module.css";
import { formatCodigoBoleto, qrBoleto } from "@/lib/artefactos.generated";
import { formatMoney } from "@/lib/dinero";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaHoraVE, formatDuracion } from "@/lib/fechas";
import { estadoBoleto, estadoUiBoleto, reservaPuedeVencer } from "@/lib/pasajero/estados";
import { leerMetodosPago, leerTasaVigente } from "@/lib/pasajero/pagos";
import { RUTAS_PASAJERO, urlBoleto } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import { createClient } from "@/lib/supabase/server";
import { cedulaValida, formatCedula } from "@/lib/ve";

export const metadata: Metadata = { title: "Boleto" };

const PREFIJO_CANCELADO_COOPERATIVA = "Viaje cancelado por la cooperativa";

export default async function DetalleBoletoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!esUuid(id)) notFound();
  const pasajero = await exigirPasajero(urlBoleto(id));

  const supabase = await createClient();
  const { data: fila, error } = await supabase
    .from("boletos")
    .select(SELECT_BOLETO)
    .eq("id", id)
    .eq("comprador_id", pasajero.id)
    .maybeSingle<BoletoDetalle>();

  if (error) {
    console.error("[boleto] No se pudo leer el boleto:", error.code, error.message);
    return (
      <div className={estilos.pagina}>
        <ErrorCarga href={urlBoleto(id)} que="tu boleto" />
      </div>
    );
  }
  if (!fila) notFound();
  const boleto = fila;

  const compra: BoletoCompra[] = boleto.compra_id
    ? ((
        await supabase
          .from("boletos")
          .select(SELECT_BOLETO_COMPRA)
          .eq("compra_id", boleto.compra_id)
          .eq("comprador_id", pasajero.id)
          .returns<BoletoCompra[]>()
      ).data ?? [])
    : [];

  const viaje = uno(boleto.viajes);
  const ruta = uno(viaje?.rutas);
  const cooperativa = uno(boleto.cooperativas)?.nombre ?? "la cooperativa";
  const perfil = uno(boleto.profiles);
  const pago = uno(boleto.pago);
  const salida = viaje?.fecha_hora_salida ?? null;
  const ahora = ahoraMs();

  // ─── Estado ────────────────────────────────────────────────────────────────
  const estado = estadoBoleto(boleto);
  const estadoUi = estadoUiBoleto(boleto);
  const pagado = estadoUi === "PAGADO";
  const rechazado = estadoUi === "PAGO_RECHAZADO";
  const enVerificacion = estadoUi === "PAGO_EN_VERIFICACION";
  const reservaActiva = estadoUi === "RESERVA_SIN_PAGAR" || rechazado;
  const expira = boleto.reserva_expira_at;
  const vencida = reservaPuedeVencer(estadoUi) && !!expira && (aMs(expira) ?? 0) <= ahora;
  const salioYa = salidaYaOcurrio(salida);
  const vigente = (pagado || reservaActiva || enVerificacion) && !salioYa;
  const puedeCancelar = ((reservaActiva && !vencida) || pagado) && !salioYa;

  // ─── Pago de la reserva ────────────────────────────────────────────────────
  const reservados = compra.filter((b) => b.estado === "RESERVADO");
  const sinDatos = reservados.filter((b) => (b.pasajero_nombre ?? "").trim().length < 3 || !cedulaValida(b.pasajero_cedula ?? ""));
  const totalReserva = sumarUsd(reservados.map((b) => b.precio));
  const asientosReservados = ordenarAsientos(reservados.map((b) => b.asiento));
  const puedePagar =
    reservaActiva && !vencida && !salioYa && !!boleto.compra_id && !!boleto.cooperativa_id && reservados.length > 0 && sinDatos.length === 0;

  const [tasa, metodos] = await Promise.all([
    leerTasaVigente(),
    puedePagar && boleto.cooperativa_id ? leerMetodosPago(boleto.cooperativa_id) : Promise.resolve([]),
  ]);

  // ─── Punto de salida ───────────────────────────────────────────────────────
  let sucursales: SucursalFila[] | null = null;
  if (vigente && boleto.cooperativa_id && ruta?.ciudad_origen) {
    const { data } = await supabase.rpc("fn_sucursales_en_ciudad", {
      p_cooperativa_id: boleto.cooperativa_id,
      p_ciudad: ruta.ciudad_origen,
    });
    sucursales = (data ?? []) as SucursalFila[];
  }
  const punto = describirPunto(sucursales, {
    cooperativa: cooperativa,
    ciudad: formatCiudad(ruta?.ciudad_origen),
  });

  // ─── Textos ────────────────────────────────────────────────────────────────
  const codigo = formatCodigoBoleto(boleto.codigo_boleto);
  const nombrePasajero = boleto.pasajero_nombre || perfil?.nombre_completo || "—";
  const cedula = formatCedula(boleto.pasajero_cedula || perfil?.cedula_rif);
  const precio = formatMoney({ usd: Number(boleto.precio) || 0, tasa });
  const motivo = boleto.motivo_cancelacion?.trim() ?? "";
  const porCooperativa = motivo.startsWith(PREFIJO_CANCELADO_COOPERATIVA);
  const motivoCooperativa = motivo.slice(PREFIJO_CANCELADO_COOPERATIVA.length).replace(/^[:\s]+/, "");
  const montoReembolso = Number(boleto.monto_reembolso) || 0;
  const etiquetaAsientos =
    asientosReservados.length > 1 ? `Asientos ${unirAsientos(asientosReservados)}` : `Asiento ${asientosReservados[0] ?? boleto.asiento ?? ""}`;

  const otros = compra.filter((b) => b.id !== boleto.id);

  const calendario: DatosCalendario | null =
    vigente && salida
      ? {
          uid: boleto.id,
          titulo: `Viaje ${textoRuta(ruta)} · ${cooperativa}`,
          inicioIso: salida,
          duracionMin: ruta?.duracion_estimada_min ?? 60,
          lugar: punto.conocido ? punto.completo : `Taquilla de ${cooperativa} en ${formatCiudad(ruta?.ciudad_origen)}`,
          descripcion: `Boleto ${codigo}${boleto.asiento ? ` · Asiento ${boleto.asiento}` : ""}. Llega 30 minutos antes con tu cédula.`,
        }
      : null;

  const pagoDigital = pago && pago.tipo_pago === "DIGITAL" && (enVerificacion || rechazado);
  const montoPagado = pagoDigital && pago.monto_declarado != null
    ? formatMoney(
        pago.moneda === "USD"
          ? { usd: Number(pago.monto_declarado), moneda: "USD" }
          : { bs: Number(pago.monto_declarado) }
      ).principal
    : null;

  return (
    <div className={estilos.pagina}>
      <EstilosImpresion />
      <Link href={RUTAS_PASAJERO.misBoletos} className={detalle.volver}>
        <ArrowLeft aria-hidden />
        Mis boletos
      </Link>

      <header className={detalle.titulo}>
        <h1>{pagado ? "Pase de abordaje" : "Boleto"} · <span className={estilos.codigo}>{codigo}</span></h1>
        <div className={detalle.meta}>
          <EstadoChip estado={estado} />
          <span>{estado.descripcion}</span>
        </div>
      </header>

      <div className={detalle.columnas}>
        <div className={detalle.apilado}>
          <article className={estilos.pase} data-imprimible aria-label={`Boleto ${codigo}, ${textoRuta(ruta)}`}>
            <div className={estilos.paseCab}>
              <p className={estilos.paseCoop}>
                <span>{cooperativa}</span>
                <span>EnBus</span>
              </p>
              <h2 className={estilos.paseRuta}>{textoRuta(ruta)}</h2>
              <p className={estilos.paseFecha}>{salida ? formatDiaHoraVE(salida) : "Salida por confirmar"}</p>
            </div>

            {pagado && (
              <>
                <div className={estilos.perfora} aria-hidden />
                <div className={detalle.qrCaja}>
                  <div className={detalle.qrMarco}>
                    <CodigoQr valor={qrBoleto(boleto)} titulo={`Código QR del boleto ${codigo}`} />
                  </div>
                  <p className={detalle.qrCodigo}>{codigo}</p>
                  <p className={detalle.qrAyuda}>Muéstralo en la taquilla antes de subir. Si el lector falla, dicta el código.</p>
                  <span data-no-imprimir>
                    <CopiarTexto texto={codigo} etiqueta="el código del boleto" />
                  </span>
                </div>
              </>
            )}

            <div className={estilos.perfora} aria-hidden />
            <dl className={detalle.datos} style={{ padding: "18px 20px 22px" }}>
              <div>
                <dt>Asiento</dt>
                <dd>{boleto.asiento ?? "—"}</dd>
              </div>
              <div>
                <dt>Precio</dt>
                <dd>
                  {precio.principal}
                  {precio.secundario && <small>{precio.secundario}</small>}
                </dd>
              </div>
              <div className={detalle.ancho}>
                <dt>Pasajero</dt>
                <dd>{nombrePasajero}</dd>
              </div>
              <div>
                <dt>Cédula</dt>
                <dd>{cedula}</dd>
              </div>
              <div>
                <dt>Duración</dt>
                <dd>{ruta?.duracion_estimada_min ? formatDuracion(ruta.duracion_estimada_min) : "—"}</dd>
              </div>
              <div>
                <dt>Unidad</dt>
                <dd>{viaje?.numero_unidad ?? "Por asignar"}</dd>
              </div>
              <div>
                <dt>Chofer</dt>
                <dd>{viaje?.nombre_chofer ?? "Por asignar"}</dd>
              </div>
            </dl>
            {(reservaActiva || enVerificacion) && (
              <p style={{ padding: "0 20px 20px", fontSize: "var(--t-xs)", textAlign: "center" }}>
                El QR de abordaje aparece cuando la cooperativa confirme tu pago.
              </p>
            )}
          </article>

          {otros.length > 0 && (
            <section className={detalle.tarjeta} aria-labelledby="otros-asientos" data-no-imprimir>
              <h2 id="otros-asientos">Otros asientos de esta compra</h2>
              <ul className={detalle.hermanos}>
                {otros.map((b) => (
                  <li key={b.id}>
                    <Link href={urlBoleto(b.id)} className={estilos.fila}>
                      <span className={estilos.filaTexto}>
                        <span className={estilos.filaTitulo}>
                          Asiento {b.asiento}
                          {b.pasajero_nombre ? ` · ${b.pasajero_nombre}` : ""}
                        </span>
                        <span className={`${estilos.filaSub} ${estilos.codigo}`}>{formatCodigoBoleto(b.codigo_boleto)}</span>
                      </span>
                      <span className={estilos.filaFin}>
                        <EstadoChip estado={estadoBoleto({ estado: b.estado })} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className={detalle.apilado} data-no-imprimir>
          {reservaActiva && expira && (
            <ReservaContador
              expiraAt={expira}
              ahoraMs={ahora}
              titulo={rechazado ? "Registra tu pago de nuevo" : `${etiquetaAsientos} ${asientosReservados.length > 1 ? "apartados" : "apartado"}`}
              detalle={
                rechazado
                  ? "Antes de que venza la reserva."
                  : `Registra tu pago o paga en la taquilla de ${cooperativa}.`
              }
            />
          )}
          {enVerificacion && <Aviso>Te avisaremos cuando la cooperativa confirme tu pago.</Aviso>}
          {estadoUi === "EXPIRADO" && <Aviso tono="aviso">{estado.descripcion}</Aviso>}
          {reservaActiva && !vencida && !salioYa && sinDatos.length > 0 && (
            <Aviso tono="aviso" titulo="Faltan datos de los pasajeros">
              Falta el nombre o la cédula del pasajero del asiento {unirAsientos(ordenarAsientos(sinDatos.map((b) => b.asiento)))}. Cancela
              la reserva y vuelve a reservar con los datos completos.
            </Aviso>
          )}
          {puedePagar && metodos.length === 0 && (
            <Aviso tono="aviso" titulo="Aún no puedes pagar en línea">
              {cooperativa} no tiene formas de pago activas. Paga en su taquilla antes de que venza la reserva.
            </Aviso>
          )}

          <AccionesBoleto
            boletoId={boleto.id}
            asientosTexto={etiquetaAsientos}
            pagado={pagado}
            puedePagar={puedePagar && metodos.length > 0}
            puedeCancelar={puedeCancelar}
            notaCancelar={
              salioYa && (pagado || reservaActiva || enVerificacion)
                ? "Este viaje ya salió; no se puede cancelar desde la web."
                : enVerificacion
                  ? "Para cancelar, espera la respuesta de la cooperativa."
                  : null
            }
            precioUsd={Number(boleto.precio) || 0}
            tasa={tasa}
            pago={puedePagar && metodos.length > 0 ? { metodos, totalUsd: totalReserva } : null}
            calendario={calendario}
          />

          {vigente && (
            <section className={detalle.tarjeta} aria-labelledby="salida-titulo">
              <h2 id="salida-titulo">Cómo llegar</h2>
              <div className={estilos.aviso} data-tono="info">
                <MapPin aria-hidden weight="fill" />
                <div>
                  <strong>{punto.conocido ? `Sale de ${punto.nombre}` : `Sale de ${punto.completo}`}</strong>
                  {punto.conocido && punto.completo !== punto.nombre ? punto.completo : null}
                  {punto.detalle && <div>{punto.detalle}</div>}
                </div>
              </div>
              <div className={estilos.aviso} data-tono="info">
                <IdentificationCard aria-hidden weight="fill" />
                <div>Llega 30 minutos antes con tu cédula.</div>
              </div>
            </section>
          )}

          {pagoDigital && pago && (
            <section className={detalle.tarjeta} aria-labelledby="pago-titulo">
              <h2 id="pago-titulo">{rechazado ? "Pago rechazado" : "Tu pago registrado"}</h2>
              {rechazado && pago.motivo_rechazo && (
                <Aviso tono="error" vivo>
                  Motivo: {pago.motivo_rechazo}
                </Aviso>
              )}
              <dl className={detalle.datos}>
                {pago.numero_referencia && (
                  <div>
                    <dt>Referencia</dt>
                    <dd>{pago.numero_referencia}</dd>
                  </div>
                )}
                {pago.banco_emisor && (
                  <div>
                    <dt>Banco</dt>
                    <dd>{pago.banco_emisor}</dd>
                  </div>
                )}
                {montoPagado && (
                  <div>
                    <dt>Pagaste</dt>
                    <dd>{montoPagado}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {estadoUi === "CANCELADO" && (
            <section className={detalle.tarjeta} aria-labelledby="cancelacion-titulo">
              <h2 id="cancelacion-titulo">Cancelación</h2>
              {porCooperativa ? (
                <p>
                  La cooperativa canceló este viaje{motivoCooperativa ? `: ${motivoCooperativa}` : ""}.
                  {montoReembolso > 0 ? " Te devolverá el 100 % de tu pasaje." : ""}
                </p>
              ) : motivo ? (
                <p>Motivo: {motivo}</p>
              ) : null}
              {boleto.reembolso_procesado ? (
                <p>
                  Reembolso enviado
                  {boleto.reembolso_procesado_at ? ` el ${formatDiaHoraVE(boleto.reembolso_procesado_at)}` : ""}
                  {boleto.reembolso_metodo ? ` por ${boleto.reembolso_metodo.replace(/_/g, " ").toLowerCase()}` : ""}
                  {boleto.reembolso_referencia ? ` (ref. ${boleto.reembolso_referencia})` : ""}. Si no lo ves en tu cuenta, repórtalo
                  a la cooperativa.
                </p>
              ) : montoReembolso > 0 ? (
                <p>
                  La cooperativa te devolverá {formatMoney({ usd: montoReembolso, tasa }).principal}
                  {formatMoney({ usd: montoReembolso, tasa }).secundario
                    ? ` (${formatMoney({ usd: montoReembolso, tasa }).secundario})`
                    : ""}{" "}
                  en 1 a 2 días hábiles, por el mismo medio con que pagaste.
                </p>
              ) : (
                <p>Cancelado sin costo: no habías pagado.</p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
