// TEMPORAL (W2-PANEL-GESTION): vista previa con datos de prueba para las capturas
// mientras las cuentas QA no tienen rol. Se borra al terminar.
import { PanelShell } from "@/components/panel-shell";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { ResumenVista } from "@/app/cooperativas/(panel)/dashboard/resumen-vista";
import { PestanasConfiguracion } from "@/app/cooperativas/(panel)/configuracion/pestanas";
import { SucursalesTab } from "@/app/cooperativas/(panel)/configuracion/tab-sucursales";
import { MetodosPagoTab } from "@/app/cooperativas/(panel)/configuracion/tab-metodos-pago";
import { DatosCooperativaTab } from "@/app/cooperativas/(panel)/configuracion/tab-datos";
import { PageHeader } from "@/components/page-header";
import { RutasClient } from "@/app/cooperativas/(panel)/rutas/client";
import { EmpleadosClient } from "@/app/cooperativas/(panel)/empleados/client";
import { ReembolsosClient } from "@/app/cooperativas/(panel)/reembolsos/client";
import PagosPorVerificarPage from "@/app/cooperativas/(panel)/pagos/page";
import { formatMoney } from "@/lib/dinero";
import type { UserProfile } from "@/hooks/use-user";

export const dynamic = "force-dynamic";

const ahora = Date.now();
const iso = (horas: number) => new Date(ahora + horas * 3600_000).toISOString();
const tasa = { tasa: 245.67, fecha: new Date(ahora).toISOString().slice(0, 10) };

export default async function Vista({ searchParams }: { searchParams: Promise<{ v?: string; rol?: string }> }) {
  const { v = "resumen", rol = "admin" } = await searchParams;
  const esAdmin = rol === "admin";
  const user: UserProfile = {
    id: "u1",
    role: esAdmin ? "admin_cooperativa" : "taquillero",
    nombre_completo: "Ana Rodríguez",
    cooperativa_id: "c1",
    cooperativa_nombre: "Expresos Los Andes",
    cooperativa_estado: v === "pendiente" ? "PENDIENTE" : "ACTIVA",
    sucursal_nombre: "Terminal de Valencia",
  };

  let contenido: React.ReactNode = null;
  if (v === "resumen" || v === "pendiente" || v === "resumen-vacio") {
    const vacio = v === "resumen-vacio";
    contenido = (
      <ResumenVista
        esAdmin={esAdmin}
        checklist={
          v === "pendiente"
            ? { estado: "PENDIENTE", motivo_estado: null, estado_cambiado_at: null, sucursales: 1, metodos_pago: 1, metodos_digitales: 1, rutas: 0, viajes_proximos: 0, taquilleros: 0, invitaciones_pendientes: 1 }
            : null
        }
        bandeja={{
          ok: true,
          data: vacio
            ? { pagos_por_verificar: 0, reembolsos_por_devolver: 0, reembolsos_usd: 0, encomiendas_por_vencer: 0, dias_minimos_para_devolucion: 0, encomiendas_por_despachar: 0, encomiendas_en_camino: 0, proxima_salida: null, generado_at: iso(0) }
            : {
                pagos_por_verificar: 3,
                reembolsos_por_devolver: 1,
                reembolsos_usd: 18.5,
                encomiendas_por_vencer: 2,
                dias_minimos_para_devolucion: 1,
                encomiendas_por_despachar: 7,
                encomiendas_en_camino: 4,
                proxima_salida: { viaje_id: "v1", ciudad_origen: "valencia", ciudad_destino: "caracas", salida: iso(1.5), minutos_para_salir: 90, boletos_vendidos: 22, asientos_disponibles: 18, encomiendas_por_despachar: 5 },
                generado_at: iso(0),
              },
        }}
        kpis={vacio ? { recibidas: "—", despachadas: "—", boletos: "—" } : { recibidas: "12", despachadas: "8", boletos: "37" }}
        ingresos={vacio ? null : formatMoney({ usd: 412.3, bs: 101289.4, tasa: null })}
        kpisConError={vacio}
        chartData={["28/10", "29/10", "30/10", "31/10", "01/11", "02/11", "03/11"].map((date, i) => ({ date, boletos: 20 + ((i * 7) % 15), encomiendas: 8 + ((i * 5) % 9) }))}
        comisionPendiente={vacio ? null : { total: 86.4, ciclos: 2, desde: "2026-10-01", hasta: "2026-10-31" }}
        comisionesError={vacio}
        soporte="584141234567"
        encomiendasRecientes={
          vacio
            ? []
            : Array.from({ length: 6 }, (_, i) => ({
                id: `e${i}`,
                tracking_id: `EB-261103-4${i}719`,
                receiver_nombre: ["María Pérez", "José Gómez", "Luisa Díaz"][i % 3],
                estado: ["PAGADA", "EN_TRANSITO", "COSTO_PENDIENTE", "ENTREGADA", "EN_OFICINA_DESTINO", "PAGADA"][i],
                created_at: iso(-i * 3),
                ciudad_origen: "valencia",
                ciudad_destino: ["caracas", "maracay", "barquisimeto"][i % 3],
                remitente_nombre: ["Carlos Mendoza", "Rosa Blanco", "Pedro Silva"][i % 3],
                origen_registro: "TAQUILLA",
                sender: null,
              }))
        }
        recientesError={false}
      />
    );
  } else if (v === "config") {
    contenido = (
      <div className="flex w-full max-w-4xl flex-col gap-6">
        <PageHeader title="Configuración" />
        <PestanasConfiguracion
          defecto="sucursales"
          paneles={{
            sucursales: (
              <SucursalesTab
                sucursales={[
                  { id: "s1", cooperativa_id: "c1", nombre: "Terminal de Valencia", estado_geografico: "carabobo", ciudad: "valencia", direccion: "Terminal Big Low Center, local 12", telefono: "02418234567", horario: "Lun a sáb 7:00 a. m. – 6:00 p. m.", activa: true, created_at: iso(-900) },
                  { id: "s2", cooperativa_id: "c1", nombre: "Terminal La Bandera", estado_geografico: "distrito_capital", ciudad: "caracas", direccion: "Av. Nueva Granada, local 4", telefono: null, horario: null, activa: false, created_at: iso(-800) },
                ]}
              />
            ),
            "metodos-pago": (
              <MetodosPagoTab
                metodos={[
                  { id: "m1", cooperativa_id: "c1", tipo: "PAGO_MOVIL", banco: "0134", titular: "Expresos Los Andes C.A.", numero_cuenta: "04141234567", cedula_rif: "J-123456789", email_zelle: null, instrucciones: null, activo: true, created_at: iso(-700) },
                  { id: "m2", cooperativa_id: "c1", tipo: "ZELLE", banco: null, titular: "Expresos Los Andes", numero_cuenta: null, cedula_rif: null, email_zelle: "pagos@losandes.com", instrucciones: null, activo: false, created_at: iso(-600) },
                ]}
              />
            ),
            datos: (
              <DatosCooperativaTab
                cooperativa={{ id: "c1", nombre: "Expresos Los Andes", rif: "J-12345678-9", logo_url: null, comision_porcentaje: 5 }}
                estado="ACTIVA"
              />
            ),
          }}
        />
      </div>
    );
  } else if (v === "rutas" || v === "rutas-vacio") {
    contenido = (
      <RutasClient
        errorCarga={null}
        rutas={
          v === "rutas-vacio"
            ? []
            : [
                { id: "r1", estado_origen: "carabobo", ciudad_origen: "valencia", estado_destino: "distrito_capital", ciudad_destino: "caracas", precio_pasaje: 15, duracion_estimada_min: 150, activa: true },
                { id: "r2", estado_origen: "carabobo", ciudad_origen: "valencia", estado_destino: "lara", ciudad_destino: "barquisimeto", precio_pasaje: 22.5, duracion_estimada_min: 210, activa: true },
                { id: "r3", estado_origen: "carabobo", ciudad_origen: "valencia", estado_destino: "merida", ciudad_destino: "merida", precio_pasaje: 48, duracion_estimada_min: 600, activa: false },
              ]
        }
      />
    );
  } else if (v === "empleados") {
    contenido = (
      <EmpleadosClient
        currentUserId="u1"
        cooperativaNombre="Expresos Los Andes"
        sucursales={[{ id: "s1", nombre: "Terminal de Valencia", activa: true }]}
        invitaciones={[
          { id: "i1", email: "luis.taquilla@gmail.com", role: "taquillero", sucursal_id: "s1", token: "t1", expira_at: iso(30), created_at: iso(-18) },
          { id: "i2", email: "carla@gmail.com", role: "taquillero", sucursal_id: "s1", token: "t2", expira_at: iso(-5), created_at: iso(-53) },
        ]}
        empleados={[
          { id: "u1", nombre_completo: "Ana Rodríguez", role: "admin_cooperativa", created_at: iso(-2000), sucursal_id: null, email: "ana@losandes.com", isBanned: false },
          { id: "u2", nombre_completo: "Pedro Silva", role: "taquillero", created_at: iso(-900), sucursal_id: "s1", email: "pedro@gmail.com", isBanned: false },
          { id: "u3", nombre_completo: "Rosa Blanco", role: "taquillero", created_at: iso(-400), sucursal_id: "s1", email: "rosa@gmail.com", isBanned: true },
        ]}
      />
    );
  } else if (v === "reembolsos") {
    const base = {
      compra_id: "k1", pasajero_cedula: "V12345678", contacto_telefono: "04141234567", viaje_salida: iso(20), ruta: "valencia → caracas",
      cancelado_at: iso(-10), motivo_cancelacion: "El pasajero no puede viajar", cancelado_por: "PASAJERO" as const, pago_id: "p1",
      pago_metodo: "PAGO_MOVIL" as const, pago_banco_emisor: "0102", pago_referencia: "123456", pago_moneda: "VES" as const, pago_estado: "PENDIENTE" as const,
      procesado: false, procesado_at: null, reembolso_metodo: null, reembolso_referencia: null, reembolso_nota: null,
    };
    contenido = (
      <ReembolsosClient
        inicial={{
          success: true,
          data: [
            { ...base, boleto_id: "b1", codigo_boleto: "BOL-AB12CD", asiento: "6", pasajero_nombre: "María Pérez", contacto_nombre: "María Pérez", monto_usd: 14.25 },
            { ...base, boleto_id: "b2", codigo_boleto: "BOL-AB12CE", asiento: "7", pasajero_nombre: "Juan Pérez", contacto_nombre: "María Pérez", monto_usd: 14.25 },
          ],
        }}
      />
    );
  } else if (v === "pagos") {
    contenido = <PagosPorVerificarPage />;
  }

  return (
    <TasaBCVProvider tasaInicial={tasa as never}>
      <PanelShell user={user} menuAbierto={null} headerExtra={<TasaBCVChip />}>
        {contenido}
      </PanelShell>
    </TasaBCVProvider>
  );
}
