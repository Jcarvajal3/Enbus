/* eslint-disable */
// PÁGINA TEMPORAL DE QA (W2-ADMIN): se borra al terminar. Renderiza el admin con datos de prueba.
export const dynamic = "force-dynamic";

import { AdminShell } from "@/components/admin-shell";
import { TasaBCVChip, TasaBCVProvider } from "@/components/tasa-bcv-provider";
import { obtenerTasaBCV } from "@/lib/tasa-bcv";
import { hoyVE } from "@/lib/fechas";
import { PageHeader } from "@/components/page-header";
import { MigaObjeto } from "@/components/miga-objeto";
import { StatusBadge } from "@/components/status-badge";
import { KpiCard } from "@/components/kpi-card";
import { Monto } from "@/components/monto";
import { Ticket, Package, Buildings, ClipboardText, Warning, CurrencyDollar, Receipt } from "@phosphor-icons/react/dist/ssr";
import { ErrorRefrescar } from "@/components/admin/error-refrescar";
import { DashboardCharts } from "@/components/admin/dashboard/dashboard-charts";
import { IncidenciasRecientesTable } from "@/components/admin/dashboard/incidencias-recientes-table";
import { CooperativasBalanceTable } from "@/components/admin/dashboard/cooperativas-balance-table";
import { SolicitudesTable } from "@/components/admin/solicitudes/solicitudes-table";
import { CooperativasTable } from "@/components/admin/cooperativas/cooperativas-table";
import { CreateCooperativaDialog } from "@/components/admin/cooperativas/create-cooperativa-dialog";
import { CooperativaActions } from "@/components/admin/cooperativas/cooperativa-actions";
import { CooperativaDetailTabs } from "@/components/admin/cooperativas/cooperativa-detail-tabs";
import { SolicitudAcciones } from "@/components/admin/solicitudes/solicitud-acciones";
import { UsuariosTable } from "@/components/admin/usuarios/usuarios-table";
import { UsuarioActions } from "@/components/admin/usuarios/usuario-actions";
import { UsuarioDetailTabs } from "@/components/admin/usuarios/usuario-detail-tabs";
import { IncidenciasTable } from "@/components/admin/incidencias/incidencias-table";
import { IncidenciaDetail } from "@/components/admin/incidencias/incidencia-detail";
import { CiclosTable } from "@/components/admin/comisiones/ciclos-table";
import { GenerarCicloDialog } from "@/components/admin/comisiones/generar-ciclo-dialog";
import { TarifaVigenteCard } from "@/components/admin/tarifas/tarifa-vigente-card";
import { TasaBCVCard } from "@/components/admin/tarifas/tasa-bcv-card";
import { Simulador } from "@/components/admin/tarifas/simulador";
import { HistorialTarifasTable } from "@/components/admin/tarifas/historial-tarifas-table";
import { CreateTarifaDialog } from "@/components/admin/tarifas/create-tarifa-dialog";

const ahora = new Date().toISOString();
const hace = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();

const coops: any[] = [
  { id: "c1", nombre: "Expresos del Táchira", rif: "J-12345678-9", logo_url: null, comision_porcentaje: 10, estado: "ACTIVA", calificacion_promedio: 4.5, total_calificaciones: 12, created_at: hace(900), updated_at: ahora },
  { id: "c2", nombre: "Transportes Lara", rif: "J-1234567", logo_url: null, comision_porcentaje: 7.5, estado: "SUSPENDIDA", calificacion_promedio: 3.2, total_calificaciones: 4, created_at: hace(2000), updated_at: ahora, motivo_estado: "Comisiones de dos ciclos sin pagar" },
  { id: "c3", nombre: "Unión Conductores Oriente", rif: "J-98765432-1", logo_url: null, comision_porcentaje: 8, estado: "PENDIENTE", calificacion_promedio: 0, total_calificaciones: 0, created_at: hace(30), updated_at: ahora, representante: "María Pérez", email: "maria@uco.com", telefono: "04145550001", direccion: "Av. Principal, Barcelona", mensaje_registro: "Queremos vender boletos en la app.", cuenta: "CREADA" },
  { id: "c4", nombre: "Aerobuses de Venezuela", rif: "G-20000001-5", logo_url: null, comision_porcentaje: 9, estado: "RECHAZADA", calificacion_promedio: 0, total_calificaciones: 0, created_at: hace(300), updated_at: ahora, representante: "José Gil", email: "jose@aerobuses.com", telefono: "02125550002", motivo_estado: "RIF inválido o incompleto", estado_cambiado_at: hace(100), cuenta: "SIN_CUENTA" },
];

const detalle: any = {
  ...coops[0],
  email: "contacto@expresostachira.com",
  telefono: "02765550101",
  representante: "Luis Rondón",
  mensaje_registro: null,
  sucursales: [
    { id: "s1", nombre: "Terminal San Cristóbal", ciudad: "san cristobal", estado_geografico: "táchira", direccion: "Terminal de pasajeros, local 12", telefono: "02765550102", activa: true },
    { id: "s2", nombre: "Terminal La Bandera", ciudad: "caracas", estado_geografico: "distrito capital", direccion: "Av. Nueva Granada", telefono: null, activa: false },
  ],
  metodos_pago: [
    { id: "m1", tipo: "PAGO_MOVIL", banco: "Banesco", titular: "Expresos del Táchira", numero_cuenta: null, cedula_rif: "J123456789", email_zelle: null, instrucciones: null, activo: true },
    { id: "m2", tipo: "ZELLE", banco: null, titular: "Luis Rondón", numero_cuenta: null, cedula_rif: null, email_zelle: "pagos@expresos.com", instrucciones: "Envía el comprobante por WhatsApp.", activo: false },
  ],
  rutas: [
    { id: "r1", ciudad_origen: "san cristobal", estado_origen: "táchira", ciudad_destino: "caracas", estado_destino: "distrito capital", duracion_estimada_min: 780, precio_pasaje: 35, activa: true },
    { id: "r2", ciudad_origen: "san cristobal", estado_origen: "táchira", ciudad_destino: "merida", estado_destino: "mérida", duracion_estimada_min: 300, precio_pasaje: null, activa: false },
  ],
  empleados: [
    { id: "e1", nombre_completo: "Ana Contreras", role: "admin_cooperativa", telefono: "04145550003", cedula_rif: "V12345678", email: "ana@expresos.com", isBanned: false },
    { id: "e2", nombre_completo: "Pedro Silva", role: "taquillero", telefono: "04245550004", cedula_rif: "V20111222", email: null, isBanned: true },
  ],
  calificaciones: [
    { id: "q1", estrellas: 5, comentario: "Muy puntuales y cómodos.", created_at: hace(48), usuario_nombre: "Carla Méndez" },
    { id: "q2", estrellas: 3, comentario: null, created_at: hace(200), usuario_nombre: "Jorge Ruiz" },
  ],
  comisiones_pendientes: 124.5,
  ciclos_sin_pagar: 2,
  encomiendas_en_curso: 3,
};

const usuarios: any[] = [
  { id: "u1", role: "user", nombre_completo: "Carla Méndez", email: "carla@correo.com", is_banned: false, cooperativa_nombre: null, created_at: hace(500), eliminada_at: null, baja: null },
  { id: "u2", role: "taquillero", nombre_completo: "Pedro Silva", email: "pedro@expresos.com", is_banned: true, cooperativa_nombre: "Expresos del Táchira", created_at: hace(800), eliminada_at: null, baja: null },
  { id: "u3", role: "user", nombre_completo: "Usuario eliminado", email: null, is_banned: false, cooperativa_nombre: null, created_at: hace(1500), eliminada_at: hace(20), baja: { auth_eliminada_at: null } },
  { id: "u4", role: "super_admin", nombre_completo: "Admin EnBus", email: "admin@enbus.com", is_banned: false, cooperativa_nombre: null, created_at: hace(3000), eliminada_at: null, baja: null },
];

const usuarioDetalle: any = {
  ...usuarios[0],
  telefono: "04145550009",
  cedula_rif: "V30000001",
  cooperativa_id: null,
  notif_encomiendas: true,
  notif_boletos: true,
  notif_recordatorios: false,
  has_push_token: true,
  encomiendas_enviadas: [
    { id: "x1", tracking_id: "EB-261003-12345", receiver_nombre: "Luis Pérez", receiver_telefono: "04145550010", receiver_cedula_rif: "V18000111", estado: "EN_OFICINA_DESTINO", costo_calculado: 12.4, pin_retiro: "1234", pin_bloqueado: true, intentos_pin: 5, cooperativa_nombre: "Expresos del Táchira", created_at: hace(70) },
    { id: "x2", tracking_id: "EB-261001-00042", receiver_nombre: "Ana Ríos", receiver_telefono: "04245550011", receiver_cedula_rif: "V19000222", estado: "ENTREGADA", costo_calculado: 8, pin_retiro: null, pin_bloqueado: false, intentos_pin: 0, cooperativa_nombre: "Transportes Lara", created_at: hace(300) },
  ],
  encomiendas_recibidas: [],
  boletos: [{ id: "b1", codigo_boleto: "7CABE4AD", asiento: "12", precio: 35, estado: "PAGADO", cooperativa_nombre: "Expresos del Táchira", viaje_info: "San Cristóbal → Caracas · 03/11 · 8:00 p. m.", created_at: hace(30) }],
  pagos: [{ id: "p1", encomienda_tracking_id: null, boleto_codigo: "7CABE4AD", monto: 35, monto_bs: 8575.5, moneda: "VES", tasa_bcv: 245.01, tasa_bcv_fecha: hoyVE(), tipo_pago: "DIGITAL", metodo_tipo: "PAGO_MOVIL", verificado: true, estado_verificacion: "RECHAZADO", motivo_rechazo: "La referencia no aparece en el banco.", numero_referencia: "00123456", created_at: hace(29) }],
  notificaciones: [{ id: "n1", titulo: "Tu boleto está confirmado", contenido: "Tu boleto BOL-7CAB-E4AD para el viaje San Cristóbal → Caracas está confirmado.", canal: "WHATSAPP", estado_envio: "FALLIDO", created_at: hace(29) }],
};

const incidencias: any[] = [
  { id: "1a2b3c4d-0000-0000-0000-000000000001", tipo: "PERDIDA", categoria: null, descripcion: "La encomienda no llegó a destino.", estado: "EN_PROCESO", resolucion: null, resuelta_por: "u4", created_at: hace(90), updated_at: ahora, reportado_por: "u1", encomienda: { tracking_id: "EB-261003-12345", valor_declarado: 40, descripcion_contenido: "Ropa y zapatos", estado: "EN_TRANSITO" }, boleto: null, reportado_por_profile: { nombre_completo: "Carla Méndez", telefono: "04145550009", email: "carla@correo.com" }, resuelta_por_profile: { nombre_completo: "Admin EnBus" } },
  { id: "9f8e7d6c-0000-0000-0000-000000000002", tipo: "REPORTE_USUARIO", categoria: "PAGO", descripcion: "Pagué y no se confirmó.", estado: "ABIERTA", resolucion: null, resuelta_por: null, created_at: hace(5), updated_at: ahora, reportado_por: "u1", encomienda: null, boleto: { codigo_boleto: "7CABE4AD", estado: "PAGO_EN_VERIFICACION", asiento: "12" }, reportado_por_profile: { nombre_completo: "Carla Méndez" } },
  { id: "5a5a5a5a-0000-0000-0000-000000000003", tipo: "ALERTA_AMARILLA", categoria: null, descripcion: "Más de 72 h en tránsito.", estado: "ABIERTA", resolucion: null, resuelta_por: null, created_at: hace(80), updated_at: ahora, reportado_por: null, encomienda: { tracking_id: "EB-260930-55555", valor_declarado: 0, descripcion_contenido: "Documentos", estado: "EN_TRANSITO" }, boleto: null, reportado_por_profile: null },
];

const ciclos: any[] = [
  { id: "k1", cooperativa_id: "c1", cooperativa_nombre: "Expresos del Táchira", periodo_inicio: "2026-10-20", periodo_fin: "2026-10-26", total_boletos: 1250.5, total_encomiendas: 320, comision_porcentaje: 10, monto_comision: 157.05, pagado: false, pagado_at: null, created_at: hace(100) },
  { id: "k2", cooperativa_id: "c2", cooperativa_nombre: "Transportes Lara", periodo_inicio: "2026-10-13", periodo_fin: "2026-10-19", total_boletos: 800, total_encomiendas: 90.25, comision_porcentaje: 7.5, monto_comision: 66.77, pagado: true, pagado_at: "2026-10-22", pago_metodo: "PAGO_MOVIL", pago_referencia: "00981234", created_at: hace(300) },
];

const tarifa: any = { id: "t1", tarifa_por_kg: 2.5, factor_distancia_por_min: 0.001, peso_max_kg: 25, dimensiones_max_cm: 50, vigente_desde: hace(500), creador_nombre: "Admin EnBus", nota: "Ajuste por combustible", estado: "VIGENTE" };
const programada: any = { ...tarifa, id: "t2", tarifa_por_kg: 2.8, vigente_desde: new Date(Date.now() + 86400e3 * 3).toISOString(), estado: "PROGRAMADA", nota: null };
const rutasSim: any[] = [
  { id: "r1", ciudad_origen: "san cristobal", ciudad_destino: "caracas", duracion_estimada_min: 780, cooperativa_nombre: "Expresos del Táchira" },
  { id: "r3", ciudad_origen: "barquisimeto", ciudad_destino: "valencia", duracion_estimada_min: 180, cooperativa_nombre: "Transportes Lara" },
];

export default async function QaPage({ searchParams }: { searchParams: Promise<{ v?: string; error?: string }> }) {
  const { v = "dashboard", error } = await searchParams;
  const tasa = await obtenerTasaBCV();
  const user: any = { id: "u4", role: "super_admin", nombre_completo: "Admin EnBus", cooperativa_id: null };

  let contenido: React.ReactNode = null;
  if (v === "dashboard") {
    const actividad = Array.from({ length: 30 }, (_, i) => ({ fecha: `2026-10-${String(i + 1).padStart(2, "0")}`, boletos: 20 + ((i * 7) % 15), encomiendas: 10 + ((i * 5) % 12) }));
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Resumen" description="Actividad y finanzas de EnBus hoy (hora de Venezuela)." />
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Finanzas de hoy</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <KpiCard grande title="Ingresos brutos" value={<Monto usd={420.5} bs={103022.5} tasa={null} size="lg" />} detail="A la tasa de cada pago" delta={{ tendencia: "sube", texto: "+12 % vs. ayer", accesible: "sube 12 por ciento" } as any} icon={CurrencyDollar} description="Pagos aprobados hoy" />
            <KpiCard grande title="Comisiones estimadas" value={<Monto usd={42.05} bs={10302.25} tasa={null} size="lg" />} icon={Receipt} description="Parte de EnBus en los pagos de hoy" />
          </div>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Operación de hoy</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <KpiCard title="Boletos" value="48" icon={Ticket} description="Pagados hoy" />
            {error ? <ErrorRefrescar titulo="No pudimos contar las encomiendas" className="h-full sm:flex-col sm:items-start sm:justify-between" /> : <KpiCard title="Encomiendas" value="17" icon={Package} description="Registradas hoy" />}
            <KpiCard title="Cooperativas activas" value="12" icon={Buildings} description="Pueden vender y recibir encomiendas" href="#" accion="Ver" />
            <KpiCard title="Solicitudes por revisar" value="2" icon={ClipboardText} variant="warning" description="Esperan tu respuesta" href="#" accion="Revisar" />
            <KpiCard title="Más de 72 h en tránsito" value="0" icon={Warning} description="Encomiendas sin resolver" href="#" accion="Ver" />
          </div>
        </section>
        <DashboardCharts activityData={actividad} topCooperativas={[{ cooperativa_id: "c1", nombre: "Expresos del Táchira", total_transacciones: 120 }, { cooperativa_id: "c2", nombre: "Transportes Lara", total_transacciones: 80 }]} rutasPopulares={[]} />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IncidenciasRecientesTable data={incidencias.map((i) => ({ id: i.id, tipo: i.tipo, estado: i.estado, created_at: i.created_at, encomienda_tracking_id: i.encomienda?.tracking_id ?? null })) as any} />
          <CooperativasBalanceTable data={[{ cooperativa_id: "c1", nombre: "Expresos del Táchira", comision_porcentaje: 10, monto_pendiente: 157.05, ciclos_impagos: 2 }, { cooperativa_id: "c2", nombre: "Transportes Lara", comision_porcentaje: 7.5, monto_pendiente: 0, ciclos_impagos: 0 }] as any} tasa={tasa} />
        </div>
      </div>
    );
  } else if (v === "solicitudes") {
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Solicitudes" description="Cooperativas que piden entrar a EnBus." />
        <SolicitudesTable solicitudes={{ pendientes: [coops[2]], rechazadas: [coops[3]] } as any} />
      </div>
    );
  } else if (v === "cooperativas") {
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Cooperativas"><CreateCooperativaDialog /></PageHeader>
        <CooperativasTable initialCooperativas={coops} />
      </div>
    );
  } else if (v === "cooperativa" || v === "cooperativa-pendiente") {
    const c = v === "cooperativa" ? detalle : { ...detalle, ...coops[2] };
    contenido = (
      <div className="flex flex-col gap-6">
        <MigaObjeto label={c.nombre} />
        <PageHeader title={c.nombre} estado={<StatusBadge status={c.estado} dominio="cooperativa" />}>
          {v === "cooperativa" ? <CooperativaActions cooperativa={c} /> : <SolicitudAcciones solicitud={c} />}
        </PageHeader>
        <CooperativaDetailTabs cooperativa={c} />
      </div>
    );
  } else if (v === "usuarios") {
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Usuarios" />
        <UsuariosTable resultado={{ usuarios, total: 120, pagina: 2, porPagina: 25, bajasPendientes: 1 }} filtros={{ pagina: 2, vista: "todas" }} cooperativas={coops.map((c) => ({ id: c.id, nombre: c.nombre, estado: c.estado }))} />
      </div>
    );
  } else if (v === "usuario") {
    contenido = (
      <div className="flex flex-col gap-6">
        <MigaObjeto label={usuarioDetalle.nombre_completo} />
        <PageHeader title={usuarioDetalle.nombre_completo} estado={<StatusBadge status="ACTIVA" dominio="cuenta" />} description="Pasajero · carla@correo.com">
          <UsuarioActions usuarioId="u1" nombre="Carla Méndez" role="user" isBanned={false} />
        </PageHeader>
        <UsuarioDetailTabs usuario={usuarioDetalle} />
      </div>
    );
  } else if (v === "incidencias") {
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Incidencias" description="Primero las de prioridad alta." />
        <IncidenciasTable data={incidencias} ahora={ahora} />
      </div>
    );
  } else if (v === "incidencia") {
    contenido = <IncidenciaDetail incidencia={incidencias[0]} currentUser={{ id: "u4", nombre_completo: "Admin EnBus" }} />;
  } else if (v === "comisiones") {
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Comisiones" description="Ciclos de comisión de cada cooperativa y sus pagos.">
          <GenerarCicloDialog cooperativas={coops.map((c) => ({ id: c.id, nombre: c.nombre, comision_porcentaje: c.comision_porcentaje }))} tasa={tasa} />
        </PageHeader>
        <CiclosTable data={ciclos} cooperativas={coops} tasa={tasa} />
      </div>
    );
  } else if (v === "tarifas") {
    contenido = (
      <div className="flex flex-col gap-6">
        <PageHeader title="Tarifas" description="Precio de encomiendas y tasa BCV.">
          <CreateTarifaDialog vigente={tarifa} rutas={rutasSim} />
        </PageHeader>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-6 lg:col-span-5">
            <TarifaVigenteCard tarifa={tarifa} programada={programada} />
            <TasaBCVCard tasa={tasa} hoy={hoyVE()} />
            <Simulador tarifa={tarifa} rutas={rutasSim} tasa={tasa} />
          </div>
          <div className="lg:col-span-7">
            <HistorialTarifasTable tarifas={[programada, tarifa, { ...tarifa, id: "t0", tarifa_por_kg: 2, estado: "ANTERIOR", nota: null }]} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <TasaBCVProvider tasaInicial={tasa}>
      <AdminShell user={user} menuAbierto={null} headerExtra={<TasaBCVChip href="/admin/tarifas#tasa-bcv" />}>
        {contenido}
      </AdminShell>
    </TasaBCVProvider>
  );
}
