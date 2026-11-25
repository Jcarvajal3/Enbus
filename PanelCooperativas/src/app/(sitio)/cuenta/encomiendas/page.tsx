import type { Metadata } from "next";
import Link from "next/link";
import { Package } from "@phosphor-icons/react/dist/ssr";
import { EstadoChip, EstadoVacio, ErrorCarga, Pestanas } from "@/components/pasajero/cuenta/piezas";
import {
  PAGO_ENCOMIENDA_COLUMNAS,
  SELECT_ENCOMIENDAS_LISTA,
  uno,
  type EncomiendaLista,
  type PagoEncomiendaFila,
} from "@/components/pasajero/cuenta/tipos";
import estilos from "@/components/pasajero/cuenta/cuenta-ui.module.css";
import { formatCiudad } from "@/lib/ciudades";
import { formatDiaVE } from "@/lib/fechas";
import { encomiendaEsActiva, estadoEncomienda } from "@/lib/pasajero/estados";
import { RUTAS_PASAJERO, urlEnviar, urlEncomienda } from "@/lib/pasajero/rutas";
import { exigirPasajero } from "@/lib/pasajero/sesion";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis encomiendas" };

type Vista = "enviadas" | "recibidas";

export default async function MisEncomiendasPage({ searchParams }: { searchParams: Promise<{ vista?: string | string[] }> }) {
  const pasajero = await exigirPasajero(RUTAS_PASAJERO.misEncomiendas);
  const { vista: crudo } = await searchParams;
  const pedida = Array.isArray(crudo) ? crudo[0] : crudo;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("encomiendas")
    .select(SELECT_ENCOMIENDAS_LISTA)
    .or(`sender_id.eq.${pasajero.id},receiver_user_id.eq.${pasajero.id}`)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<EncomiendaLista[]>();

  const hrefVista = (v: Vista) => (v === "enviadas" ? RUTAS_PASAJERO.misEncomiendas : `${RUTAS_PASAJERO.misEncomiendas}?vista=${v}`);

  if (error) {
    console.error("[mis-encomiendas] No se pudieron leer las encomiendas:", error.code, error.message);
    return (
      <div className={estilos.pagina}>
        <header className={estilos.cabecera}>
          <h1>Mis encomiendas</h1>
        </header>
        <ErrorCarga href={hrefVista(pedida === "recibidas" ? "recibidas" : "enviadas")} que="tus encomiendas" />
      </div>
    );
  }

  const todas = data ?? [];
  const enviadas = todas.filter((e) => e.sender_id === pasajero.id);
  const recibidas = todas.filter((e) => e.receiver_user_id === pasajero.id && e.sender_id !== pasajero.id);
  const activasEnv = enviadas.filter((e) => encomiendaEsActiva(e.estado)).length;
  const activasRec = recibidas.filter((e) => encomiendaEsActiva(e.estado)).length;

  // Sin `?vista=`: abre la que tiene envíos en curso (si solo hay en curso recibidos, esa).
  const vista: Vista =
    pedida === "recibidas" || pedida === "enviadas"
      ? pedida
      : activasEnv === 0 && activasRec > 0
        ? "recibidas"
        : "enviadas";
  const lista = vista === "enviadas" ? enviadas : recibidas;

  // Pagos de lo que se ve, para mostrar el cobro (RLS: solo los de las partes).
  const ids = lista.map((e) => e.id);
  const pagosPor = new Map<string, PagoEncomiendaFila[]>();
  if (ids.length > 0) {
    const { data: pagos } = await supabase
      .from("pagos")
      .select(PAGO_ENCOMIENDA_COLUMNAS)
      .in("encomienda_id", ids)
      .returns<PagoEncomiendaFila[]>();
    for (const p of pagos ?? []) {
      if (p.encomienda_id) pagosPor.set(p.encomienda_id, [...(pagosPor.get(p.encomienda_id) ?? []), p]);
    }
  }

  return (
    <div className={estilos.pagina}>
      <header className={estilos.cabecera}>
        <div>
          <h1>Mis encomiendas</h1>
          <p>Lo que enviaste y lo que te envían.</p>
        </div>
        <Link href={urlEnviar()} className="s-boton s-boton--sol s-boton--sm">
          Enviar encomienda
        </Link>
      </header>

      <Pestanas
        etiqueta="Mis encomiendas"
        activa={vista}
        items={[
          { clave: "enviadas", texto: "Enviadas", href: hrefVista("enviadas"), cantidad: activasEnv },
          { clave: "recibidas", texto: "Recibidas", href: hrefVista("recibidas"), cantidad: activasRec },
        ]}
      />

      {lista.length === 0 ? (
        vista === "enviadas" ? (
          <EstadoVacio
            icono={<Package size={28} />}
            titulo="Aún no has enviado encomiendas"
            acciones={
              <Link href={urlEnviar()} className="s-boton s-boton--sol">
                Enviar encomienda
              </Link>
            }
          >
            Cotiza tu envío, regístralo aquí y llévalo a la taquilla con tu código QR.
          </EstadoVacio>
        ) : (
          <EstadoVacio icono={<Package size={28} />} titulo="No tienes encomiendas por recibir">
            Cuando alguien te envíe un paquete con tu cédula o tu teléfono, lo verás aquí con tu PIN de retiro.
          </EstadoVacio>
        )
      ) : (
        <ul className={estilos.lista}>
          {lista.map((e) => {
            const { estado, cobro } = estadoEncomienda(e, pagosPor.get(e.id) ?? []);
            const coop = uno(e.cooperativas)?.nombre;
            const esEnvio = vista === "enviadas";
            const otro = esEnvio ? e.receiver_nombre : e.remitente_nombre;
            return (
              <li key={e.id}>
                <Link href={urlEncomienda(e.id)} className={estilos.pase} style={{ textDecoration: "none", color: "inherit" }}>
                  <span className={estilos.paseCab}>
                    <span className={estilos.paseCoop}>
                      <span className={estilos.codigo}>{e.tracking_id ?? "Código por asignar"}</span>
                      <span>{coop ?? ""}</span>
                    </span>
                    <span className={estilos.paseRuta}>
                      {formatCiudad(e.ciudad_origen) || "—"} → {formatCiudad(e.ciudad_destino) || "—"}
                    </span>
                    <span className={estilos.paseFecha}>
                      {esEnvio ? "Para" : "De"} {otro || "—"} · {formatDiaVE(e.created_at)}
                    </span>
                  </span>
                  <span className={estilos.perfora} aria-hidden />
                  <span className={estilos.fila} style={{ minHeight: 0 }}>
                    <span className={estilos.filaFin} style={{ justifyContent: "flex-start" }}>
                      <EstadoChip estado={estado} />
                      {cobro.estado !== "NO_APLICA" && (esEnvio || e.modalidad_pago === "DESTINO") &&<EstadoChip estado={cobro} />}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
