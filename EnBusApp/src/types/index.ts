/**
 * REF-03: Shared TypeScript types for common database record shapes.
 *
 * These types match the actual Supabase schema used by the app queries.
 * Fields come from the real SELECT queries in the screens, not assumptions.
 *
 * Las RPC que devuelven `jsonb` no generan tipos: sus respuestas están tipadas
 * a mano al final de este archivo (contratos §3.2 de la fase 2). Dinero: `monto`,
 * `precio`, `costo_calculado`… son USD de referencia; los Bs se calculan con la
 * tasa BCV (`monto_bs`, `tasa_bcv`, `tasa_bcv_fecha`).
 */

import type { MonedaPago } from '@/src/utils/dinero';

export type { MonedaPago, TasaRef } from '@/src/utils/dinero';

// ─── Auth / Profiles ──────────────────────────────────────────────────────────

export interface PerfilUsuario {
  id: string;
  email?: string;
  /** Full name stored in profiles table */
  nombre_completo?: string;
  /** Auth metadata alias — may differ from profiles.nombre_completo */
  nombre?: string;
  apellido?: string;
  cedula_rif?: string;
  telefono?: string;
  avatar_url?: string;
  /** Preferencias de aviso (columnas `notif_*` de `profiles`) */
  notif_boletos?: boolean | null;
  notif_encomiendas?: boolean | null;
  notif_recordatorios?: boolean | null;
  /** Fase 4: la cuenta se dio de baja (`fn_eliminar_mi_cuenta`); `AuthContext` cierra la sesión */
  eliminada_at?: string | null;
  created_at: string;
}

// ─── Encomiendas ──────────────────────────────────────────────────────────────

/**
 * Estados logísticos (enum `estado_encomienda`). El cobro no es un estado: un
 * pago en verificación es `pagos.estado_verificacion = 'PENDIENTE'` (ver
 * `getCobroEncomienda` en `src/utils/estados.ts`).
 */
export type EstadoEncomienda =
  | 'PENDIENTE_DE_ESCANEO'
  | 'EN_RECEPCION'
  | 'POR_PAGAR'
  | 'PAGADA'
  | 'EN_TRANSITO'
  | 'EN_OFICINA_DESTINO'
  | 'ENTREGADA'
  | 'CANCELADA'
  | 'DEVUELTA';

export type ModalidadPago = 'ORIGEN' | 'DESTINO';

export type OrigenRegistroEncomienda = 'APP' | 'TAQUILLA';

export interface Encomienda {
  id: string;
  tracking_id?: string;
  sender_id: string;
  receiver_user_id?: string;
  receiver_nombre?: string;
  receiver_cedula_rif?: string;
  receiver_telefono?: string;
  /** Cómo se vinculó el destinatario con su cuenta EnBus ('CEDULA' | 'TELEFONO') */
  receiver_vinculado_por?: 'CEDULA' | 'TELEFONO' | null;
  /** Column name in Supabase is `descripcion_contenido` */
  descripcion_contenido?: string;
  peso_kg?: number;
  /** USD de referencia */
  valor_declarado?: number;
  /**
   * USD de referencia; se cobra en Bs a la tasa BCV. Viene `null` hasta que la
   * taquilla pesa el paquete.
   */
  costo_calculado?: number | null;
  modalidad_pago?: ModalidadPago;
  /** Viene `null` hasta que la cooperativa recibe el paquete */
  pin_retiro?: string | null;
  /**
   * Foto que toma la taquilla: ruta en el bucket privado (filas antiguas: URL
   * completa). Mostrar con `urlFotoEncomienda`.
   */
  foto_evidencia_url?: string | null;
  /** Foto que subió el remitente desde la app (ruta en el bucket; `urlFotoEncomienda`) */
  foto_cliente_path?: string | null;
  /** La taquilla recibió sin foto y dejó el motivo */
  foto_omitida_motivo?: string | null;
  /** APP: la creó el remitente. TAQUILLA: alta presencial (el remitente real va en `remitente_*`) */
  origen_registro?: OrigenRegistroEncomienda;
  remitente_nombre?: string | null;
  remitente_cedula?: string | null;
  remitente_telefono?: string | null;
  sucursal_origen_id?: string | null;
  sucursal_destino_id?: string | null;
  intentos_pin?: number | null;
  pin_bloqueado?: boolean | null;
  entregada_at?: string | null;
  /** La retiró otra persona autorizada (`retiro_nombre`, `retiro_cedula`) */
  retiro_tercero?: boolean | null;
  retiro_nombre?: string | null;
  retiro_cedula?: string | null;
  /** Entregada sin PIN por el administrador de la cooperativa */
  entrega_sin_pin_motivo?: string | null;
  estado_origen?: string;
  ciudad_origen?: string;
  estado_destino?: string;
  ciudad_destino?: string;
  estado: EstadoEncomienda;
  cooperativa_id?: string;
  created_at: string;
  updated_at?: string;
  /** Joined when the query asks for `profiles:sender_id(*)` */
  profiles?: PerfilUsuario;
}

export interface HistorialEncomienda {
  id: string;
  encomienda_id: string;
  estado: EstadoEncomienda;
  descripcion?: string;
  created_at: string;
}

/** `fn_remitente_de_encomienda` (el teléfono llega enmascarado). */
export interface RemitenteEncomienda {
  nombre: string | null;
  telefono: string | null;
}

// ─── Boletos ──────────────────────────────────────────────────────────────────

/** Estados reales del enum `estado_boleto`. */
export type EstadoBoleto =
  | 'RESERVADO'
  | 'PAGADO'
  | 'USADO'
  | 'CANCELADO'
  | 'EXPIRADO';

/**
 * Estado que ve el usuario (espejo de `estado_ui_boleto` en la base): RESERVADO
 * se desdobla según el pago de la compra.
 */
export type EstadoUiBoleto =
  | 'RESERVA_SIN_PAGAR'
  | 'PAGO_EN_VERIFICACION'
  | 'PAGO_RECHAZADO'
  | Exclude<EstadoBoleto, 'RESERVADO'>;

export interface Ruta {
  ciudad_origen: string;
  ciudad_destino: string;
  duracion_estimada_min?: number;
  /** USD de referencia */
  precio_pasaje?: number;
}

export type EstadoViaje = 'PROGRAMADO' | 'EN_CURSO' | 'COMPLETADO' | 'CANCELADO';

export interface Cooperativa {
  id?: string;
  nombre: string;
  calificacion_promedio?: number;
}

/**
 * Viaje as returned by the detail screen query (viajes/[id].tsx).
 * Includes joined relations.
 */
export interface Viaje {
  id: string;
  cooperativa_id?: string;
  fecha_hora_salida: string;
  asientos_totales?: number;
  asientos_disponibles?: number;
  numero_unidad?: string;
  nombre_chofer?: string;
  /** Enum `estado_viaje` */
  estado?: EstadoViaje;
  rutas?: Ruta;
  cooperativas?: Cooperativa;
}

export interface Boleto {
  id: string;
  codigo_boleto?: string;
  comprador_id: string;
  viaje_id?: string;
  cooperativa_id?: string;
  /** Los boletos apartados juntos comparten `compra_id` */
  compra_id?: string;
  /** Último pago registrado para la compra */
  pago_id?: string | null;
  asiento?: string;
  asientos?: string[];
  /** USD de referencia (rutas.precio_pasaje al reservar) */
  precio?: number;
  monto_total?: number;
  estado: EstadoBoleto;
  /** `null` mientras hay un pago en verificación: la reserva no vence */
  reserva_expira_at?: string | null;
  motivo_cancelacion?: string;
  /** USD de referencia; se paga en Bs a la tasa BCV del día del reembolso */
  monto_reembolso?: number | null;
  /** La cooperativa ya devolvió el dinero (`fn_registrar_reembolso`) */
  reembolso_procesado?: boolean | null;
  reembolso_procesado_at?: string | null;
  reembolso_metodo?: MetodoReembolso | null;
  reembolso_referencia?: string | null;
  reembolso_nota?: string | null;
  qr_embarque_data?: string | null;
  embarcado_at?: string | null;
  pasajero_nombre?: string | null;
  pasajero_cedula?: string | null;
  pasajero_telefono?: string | null;
  /** Embed `pago:pagos!boletos_pago_id_fkey(...)` */
  pago?: PagoBoletoEmbed | null;
  created_at: string;
  viajes?: {
    fecha_hora_salida: string;
    numero_unidad?: string;
    nombre_chofer?: string;
    rutas?: Ruta;
  };
  cooperativas?: { nombre: string };
  profiles?: { nombre_completo?: string; cedula_rif?: string };
}

// ─── Notificaciones ───────────────────────────────────────────────────────────

export type RecursoTipo = 'boleto' | 'encomienda' | 'viaje';

/**
 * Tipos conocidos de `notificaciones_usuario.tipo` (fase 4, §3.2). Hay más (los
 * cambios de estado de encomienda que encola el trigger) y las filas antiguas
 * tienen `null`: `iconoNotificacion` cae entonces en `recurso_tipo`.
 */
export type TipoNotificacion =
  | 'BOLETO_CONFIRMADO'
  | 'PAGO_APROBADO'
  | 'PAGO_RECHAZADO'
  | 'PAGO_EN_VERIFICACION'
  | 'RESERVA_SIN_PAGAR'
  | 'VIAJE_CANCELADO'
  | 'VIAJE_REPROGRAMADO'
  | 'REEMBOLSO_ENVIADO'
  | 'ENCOMIENDA_PARA_TI'
  | 'ENCOMIENDA_RECHAZADA'
  | 'DEVOLUCION_AUTOMATICA';

export interface Notificacion {
  id: string;
  usuario_id: string;
  /** Fase 4: elige icono y tono (`iconoNotificacion`); `null` en filas antiguas */
  tipo?: TipoNotificacion | (string & {}) | null;
  titulo: string;
  mensaje?: string;
  leida: boolean;
  recurso_tipo?: RecursoTipo;
  recurso_id?: string;
  created_at: string;
}

// ─── Fase 4: próximo viaje y baja de cuenta (§3.4) ───────────────────────────

/** El boleto PAGADO que sale antes (de ahora − 30 min a ahora + 48 h), con los asientos de su compra. */
export type ProximoViaje = {
  /** Primer boleto de la compra (orden natural de asiento) */
  boletoId: string;
  /** `codigo_boleto` de ese boleto, tal como se guarda ("BOL-7CABE4AD") */
  codigo: string;
  compraId: string | null;
  /** Asientos de la misma compra en orden natural ("9", "14", "15") */
  asientos: string[];
  /** ISO de `viajes.fecha_hora_salida` */
  salida: string;
  /** ISO de `viajes.fecha_hora_llegada_est` */
  llegada: string | null;
  /** Ya legibles ("Mérida", "Puerto La Cruz") */
  ciudadOrigen: string;
  ciudadDestino: string;
  /** Nombre de la cooperativa ('' si no viene) */
  cooperativa: string;
};

/** `fn_eliminar_mi_cuenta(p_motivo)` */
export type ResultadoEliminarCuenta = { eliminada_at: string; ya_procesado?: boolean };

/** Códigos `EB_*` de las RPC (incluye los de la fase 4). Fuente: `src/utils/errores.ts`. */
export type { CodigoEB } from '@/src/utils/errores';

// ─── Pagos ────────────────────────────────────────────────────────────────────

/** Enum `tipo_metodo_pago` (cuentas de la cooperativa). */
export type TipoMetodoPago = 'PAGO_MOVIL' | 'TRANSFERENCIA_BANCARIA' | 'ZELLE' | 'EFECTIVO';

/** Cómo devolvió la cooperativa el dinero de un boleto (`boletos.reembolso_metodo`). */
export type MetodoReembolso = TipoMetodoPago;

/** Columna generada `pagos.estado_verificacion`. */
export type EstadoVerificacionPago = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';

/** Fila de `metodos_pago_cooperativa`. */
export interface MetodoPago {
  id: string;
  cooperativa_id: string;
  tipo: TipoMetodoPago;
  banco?: string | null;
  titular: string;
  /** Cuenta, o teléfono en Pago Móvil */
  numero_cuenta?: string | null;
  cedula_rif?: string | null;
  email_zelle?: string | null;
  instrucciones?: string | null;
  activo: boolean;
}

/** Fila de `pagos` (columnas de la fase 2 incluidas). */
export interface Pago {
  id: string;
  encomienda_id?: string | null;
  boleto_id?: string | null;
  pagador_id: string;
  cooperativa_id: string;
  metodo_pago_id?: string | null;
  /** USD de referencia esperado (base de comisiones) */
  monto: number;
  /** Bs esperados = monto × tasa_bcv. Null en pagos anteriores a la fase 2 */
  monto_bs?: number | null;
  tasa_bcv?: number | null;
  /** 'YYYY-MM-DD' */
  tasa_bcv_fecha?: string | null;
  /** Moneda en la que pagó el cliente */
  moneda: MonedaPago;
  /** Lo que el cliente dice que pagó, en `moneda` */
  monto_declarado?: number | null;
  tipo_pago: 'DIGITAL' | 'EFECTIVO';
  numero_referencia?: string | null;
  /** 'YYYY-MM-DD' */
  fecha_transaccion?: string | null;
  banco_emisor?: string | null;
  verificado: boolean;
  verificado_at?: string | null;
  rechazado_at?: string | null;
  motivo_rechazo?: string | null;
  estado_verificacion: EstadoVerificacionPago;
  created_at: string;
}

/** Columnas del embed `pago:pagos!boletos_pago_id_fkey(...)` que lee la app. */
export type PagoBoletoEmbed = Pick<
  Pago,
  | 'id'
  | 'estado_verificacion'
  | 'tipo_pago'
  | 'motivo_rechazo'
  | 'numero_referencia'
  | 'banco_emisor'
  | 'monto'
  | 'monto_bs'
  | 'moneda'
  | 'monto_declarado'
  | 'tasa_bcv'
  | 'tasa_bcv_fecha'
  | 'created_at'
>;

/** Lo mínimo que hace falta de un pago para saber su estado. */
export type PagoEstadoMinimo = Partial<
  Pick<Pago, 'estado_verificacion' | 'verificado' | 'rechazado_at' | 'motivo_rechazo' | 'created_at'>
> & { estado?: EstadoVerificacionPago | null };

/**
 * Lo que el usuario declara en `PaymentFlow` (parámetros `p_*` de
 * `fn_checkout_boletos` y `fn_registrar_pago_encomienda`).
 */
export interface PagoDeclarado {
  metodo_pago_id: string;
  /** Normalizada: sin espacios ni separadores; Zelle en mayúsculas */
  numero_referencia: string;
  /** 'YYYY-MM-DD' */
  fecha_transaccion: string;
  /** "0134 · Banesco", "Otro banco" o "Zelle" */
  banco_emisor: string;
  /** En Bs (o en USD si el método es Zelle). Null = el monto exacto esperado */
  monto_declarado: number | null;
  /** Capture ya subido a `comprobantes-pago` (obligatorio en Pago Móvil) */
  comprobante_path: string | null;
}

/** Cuánto hay que pagar, tal como lo calculó el servidor. */
export interface CotizacionPago {
  totalUsd: number;
  /** Null si no hay tasa BCV vigente */
  totalBs: number | null;
  tasa: number | null;
  /** 'YYYY-MM-DD' */
  tasaFecha: string | null;
}

// ─── Respuestas de RPC (jsonb, §3.2) ──────────────────────────────────────────

/** `fn_tasa_bcv_vigente` (una fila o ninguna). */
export interface TasaBCVVigente {
  tasa: number;
  /** 'YYYY-MM-DD' */
  fecha: string;
  /** Origen de la tasa: la automática o 'manual' (cargada por el super admin) */
  fuente: string;
  dias_antiguedad: number;
  actualizada_at: string;
}

export interface ResumenBoleto {
  id: string;
  codigo_boleto: string;
  asiento: string;
  estado: EstadoBoleto;
  estado_ui: EstadoUiBoleto;
  precio_usd: number;
  reserva_expira_at: string | null;
  qr_embarque_data: string | null;
  /** Datos del pasajero de ese asiento (fase 3; `null` hasta que se asignan) */
  pasajero_nombre: string | null;
  pasajero_cedula: string | null;
  pasajero_telefono: string | null;
}

export interface ResumenPago {
  id: string;
  estado: EstadoVerificacionPago;
  monto_usd: number;
  monto_bs: number | null;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  moneda: MonedaPago;
  monto_declarado: number | null;
  motivo_rechazo: string | null;
}

/**
 * `Resumen` de una compra: lo devuelven `fn_reservar_asientos`,
 * `fn_checkout_boletos`, `fn_vender_boletos_taquilla` y `fn_cobrar_reserva_taquilla`.
 * Solo incluye los boletos vivos (RESERVADO, PAGADO, USADO).
 */
export interface ResumenCompra {
  compra_id: string;
  /** Hora del servidor: `offset = Date.parse(server_now) - Date.now()` */
  server_now: string;
  viaje_id: string | null;
  cooperativa_id: string | null;
  boletos: ResumenBoleto[];
  total_usd: number | null;
  /** Vencimiento más próximo de los boletos RESERVADO; null si no vencen */
  reserva_expira_at: string | null;
  pago: ResumenPago | null;
  /** true cuando la clave de idempotencia ya se había usado (no se creó otro pago) */
  repetido?: boolean;
}

/** Nombre corto usado en la especificación. */
export type Resumen = ResumenCompra;

/** `fn_reservar_asientos`: Resumen + la tasa con la que se cotizó. */
export interface ResumenReserva extends ResumenCompra {
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
  total_bs: number | null;
}

/** Un pasajero por asiento para `fn_asignar_pasajeros` (`p_pasajeros`). */
export interface PasajeroAsiento {
  asiento: string;
  nombre: string;
  cedula: string;
  telefono?: string | null;
}

/** `fn_asignar_pasajeros`: Resumen + cuántos boletos cambió y qué asientos siguen sin datos. */
export interface ResultadoAsignarPasajeros extends ResumenCompra {
  actualizados: number;
  asientos_sin_datos: string[];
}

/** `fn_liberar_reserva` */
export interface ResultadoLiberarReserva {
  liberados: number;
}

/** `fn_cancelar_boleto` */
export interface ResultadoCancelacionBoleto {
  estado: 'CANCELADO';
  reembolso_usd: number | null;
  reembolso_bs_estimado: number | null;
  tasa_bcv: number | null;
  tasa_bcv_fecha: string | null;
}

/** `fn_registrar_pago_encomienda` (con `repetido` solo trae `pago_id` y `estado`). */
export interface ResultadoPagoEncomienda {
  pago_id: string;
  estado: 'PENDIENTE';
  monto_usd?: number;
  monto_bs?: number;
  tasa_bcv?: number;
  tasa_bcv_fecha?: string;
  moneda?: MonedaPago;
  monto_declarado?: number;
  repetido?: boolean;
}

export type ResultadoEmbarqueTipo =
  | 'VALIDO'
  | 'USADO'
  | 'CANCELADO'
  | 'EXPIRADO'
  | 'VIAJE_CANCELADO'
  | 'OTRO_VIAJE'
  | 'OTRO_DIA'
  | 'PAGO_EN_VERIFICACION'
  | 'PAGO_RECHAZADO'
  | 'RESERVA_SIN_PAGAR'
  | 'NO_ENCONTRADO'
  | 'OTRA_COOPERATIVA';

/** `fn_validar_embarque` / `fn_confirmar_embarque` (panel). */
export type ResultadoEmbarque =
  | { resultado: 'NO_ENCONTRADO' | 'OTRA_COOPERATIVA'; codigo: string }
  | {
      resultado: Exclude<ResultadoEmbarqueTipo, 'NO_ENCONTRADO' | 'OTRA_COOPERATIVA'>;
      dias_diferencia: number;
      boleto: {
        id: string;
        codigo_boleto: string;
        asiento: string;
        estado: EstadoBoleto;
        compra_id: string;
        pasajero_nombre: string | null;
        pasajero_cedula: string | null;
        embarcado_at: string | null;
        updated_at: string;
        motivo_cancelacion: string | null;
        reserva_expira_at: string | null;
        precio_usd: number;
      };
      viaje: {
        id: string;
        salida: string;
        estado: string;
        unidad: string | null;
        origen: string;
        destino: string;
      };
      pago: {
        id: string;
        estado: EstadoVerificacionPago;
        tipo_pago: 'DIGITAL' | 'EFECTIVO';
        banco_emisor: string | null;
        numero_referencia: string | null;
        fecha_transaccion: string | null;
        monto_usd: number;
        monto_bs: number | null;
        moneda: MonedaPago;
        monto_declarado: number | null;
        tasa_bcv: number | null;
        tasa_bcv_fecha: string | null;
        motivo_rechazo: string | null;
        metodo_pago_id: string | null;
      } | null;
    };

/**
 * Contenido de `details` de un error `EB_*` (JSON). Cada RPC rellena solo lo
 * que aplica. Léelo con `parseDetalleEB(err)`.
 */
export interface DetalleEB {
  campo?:
    | 'referencia'
    | 'banco'
    | 'fecha'
    | 'monto'
    | 'motivo'
    | 'peso'
    | 'tasa'
    // Fase 3 (§3.1)
    | 'pasajeros'
    | 'sucursal'
    | 'remitente'
    | 'destinatario'
    | 'descripcion'
    | 'valor_declarado'
    | 'modalidad'
    | 'destino'
    | 'cedula'
    | 'tercero'
    | 'pin'
    | 'categoria'
    | 'metodo';
  /** Asientos afectados (`EB_ASIENTO_OCUPADO`, `EB_DATOS_PASAJERO`) */
  asientos?: string[];
  /** `EB_PAGOS_PENDIENTES`: pagos por verificar del viaje */
  pendientes?: number;
  /** `EB_PESO_INVALIDO` */
  peso_max_kg?: number;
  tasa?: number;
  tasa_fecha?: string;
  total_usd?: number;
  total_bs?: number;
  esperado?: number;
  moneda?: MonedaPago;
  rechazadas?: { id: string; resultado: string; tracking_id: string; ciudad_destino: string }[];
  ultima_fecha?: string | null;
  [otro: string]: unknown;
}

// ─── Fase 3: sucursales, cotización pública y reportes (§3.2) ────────────────

/** Fila de `fn_sucursales_en_ciudad(cooperativa, ciudad)`: dónde sale el bus o se entrega el paquete. */
export interface SucursalPunto {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  /** Texto libre, p. ej. "Lun a sáb 7:00 a. m. – 6:00 p. m." */
  horario: string | null;
  ciudad: string;
  estado_geografico: string | null;
}

/** Una cooperativa que cubre la ruta, con el costo estimado del envío. */
export interface OpcionCotizacionEnvio {
  cooperativa_id: string;
  cooperativa: string;
  calificacion: number | null;
  duracion_min: number | null;
  /** USD de referencia */
  costo_usd: number;
  /** `null` si no hay tasa BCV vigente */
  costo_bs: number | null;
}

/** `fn_cotizar_envio_publico(peso, origen, destino)` (opciones de menor a mayor costo). */
export interface CotizacionEnvioPublica {
  peso_max_kg: number;
  tasa_bcv: number | null;
  /** 'YYYY-MM-DD' */
  tasa_bcv_fecha: string | null;
  opciones: OpcionCotizacionEnvio[];
}

/** `p_categoria` de `fn_reportar_problema` (= `incidencias.categoria`). */
export type CategoriaReporte = 'PAGO' | 'BOLETO' | 'ENCOMIENDA' | 'CUENTA' | 'OTRO';

/** `fn_reportar_problema`: el reporte creado. */
export interface ReporteCreado {
  id: string;
  /** "INC-XXXXXX": el código que se le muestra al usuario */
  codigo: string;
  creada_at: string;
}
