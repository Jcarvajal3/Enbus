# Glosario y vocabulario único

Fuente única de los términos que ven pasajeros y operadores en la app, el panel de cooperativas, el panel de EnBus y la landing (plan #22, DS-04). Los mapas de estados del código (`EnBusApp/src/utils/estados.ts`, `PanelCooperativas/src/lib/estados.ts`, `LandingEnBus/lib/estados.ts`) siguen la tabla de §3.

## 1. Regla de uso

- **En títulos, botones, pestañas, menús y etiquetas de estado se usa el término del glosario.** Los sinónimos ("paquete", "pasaje", "ticket", "envío") solo aparecen en texto corrido.
- El nombre de una pantalla es el mismo en el menú, en el H1 y en el breadcrumb.
- Hay dos etiquetas por estado: **pasajero** (app y landing) y **operador** (panel de cooperativas y panel de EnBus). El **tono** (color) es el mismo para ambos.
- Español de Venezuela, con tildes. Montos con el formateador `dinero.ts`: "Bs 1.250,00" / "≈ USD 12,40 · BCV 02/10".
- Fechas y horas solo con `shared/ve.ts`, en hora de Venezuela y 12 h. Pasajero (app, landing): "mar. 3 nov.", "2:30 p. m.", "mar. 3 nov. · 2:30 p. m.". Operador (tablas del panel y del admin): "03/11/2026", "03/11 · 2:30 p. m."; listas con tiempo relativo ("hace 5 min").
- Contraseña: mínimo 8 caracteres en todas partes. Ayuda "Mínimo 8 caracteres."; error "Usa al menos 8 caracteres.".

## 2. Términos

| Término | Definición | Notas de uso |
|---|---|---|
| **Boleto** | Derecho a un asiento en una salida. Código `BOL-XXXXXXXX`. | No "ticket" ni "pasaje" en títulos. |
| **Pase de abordaje** | Lo que el pasajero muestra para subir al bus: el QR y el código corto legible `BOL-XXXX-XXXX` (guion tras 4 caracteres). La taquilla acepta el código con o sin guiones, en minúsculas o el QR `PASS-…`. | Título del detalle de un boleto pagado. |
| **Viaje / Salida** | Un bus de una ruta en una fecha y hora. "Viaje" en general; "Salida" cuando importa la hora ("Salidas de hoy"). | — |
| **Encomienda** | Paquete enviado entre oficinas de una cooperativa. | No "paquete" en títulos ("Mis encomiendas", no "Mis paquetes"). |
| **Código de seguimiento** | Identificador de la encomienda: `EB-AAMMDD-NNNNN`. Es lo que codifica el QR y lo que se rastrea. | No "tracking" ni "guía" ante el pasajero ("guía" solo en el ticket impreso de la taquilla). |
| **PIN de retiro** | 4 dígitos que se generan cuando la taquilla recibe la encomienda; quien recibe lo presenta con su cédula para retirarla. Viene en la guía impresa ("dáselo solo a quien recibe"). | Se bloquea tras 10 intentos fallidos. Validarlo deja 15 minutos para confirmar la entrega; si vence: "Vuelve a validar el PIN de retiro: la validación vence a los 15 minutos." |
| **Paga al enviar** | Modalidad `ORIGEN`. Largo: "Paga quien envía, al entregar el paquete". | — |
| **Paga al retirar** | Modalidad `DESTINO`. Largo: "Paga quien recibe, al retirarlo". | — |
| **Taquilla** | Oficina o mostrador de la cooperativa donde se venden boletos y se reciben y entregan encomiendas. | "Taquilla de boletos", "Taquilla de encomiendas". |
| **Taquillero** | Empleado de la cooperativa que atiende la taquilla (rol `taquillero`). | — |
| **Administrador de cooperativa** | Responsable de la cooperativa en el panel (rol `admin_cooperativa`). | — |
| **Administrador EnBus** | Equipo de EnBus (rol `super_admin`). | No "super admin" ante cooperativas. |
| **Pasajero** | Persona que usa la app (rol `user`), compre boletos o envíe encomiendas. | — |
| **Registrar pago** | **Acción**: el pasajero informa un pago hecho por fuera (referencia, fecha, banco) o la taquilla registra un cobro. | Botones: "Registrar pago". |
| **Pagado · Pendiente** | **Estado** del cobro. | No mezclar acción y estado ("Pagar" no es un estado). |
| **Reembolso** | Devolución del dinero de un boleto cancelado: 95 % si cancela el pasajero, 100 % si la cooperativa cancela el viaje. La cooperativa devuelve el dinero y lo registra en "Reembolsos". | Pasajero: "Reembolso pendiente" / "Reembolsado". Operador: "Por devolver" / "Devuelto". |
| **Apartar** | Reservar un asiento sin pagar (30 minutos, o hasta que la cooperativa verifique el pago). | "Apartar y pagar en taquilla". |
| **Requiere tu atención** | Bandeja del Resumen del panel (`fn_bandeja_cooperativa`): pagos por verificar, reembolsos por devolver, encomiendas por vencer en oficina, listas para despachar, en camino y la próxima salida. | Título de la tarjeta del Resumen. |
| **Marcar llegada** | Acción del panel que cierra un viaje en ruta (`EN_CURSO → COMPLETADO`). | Botón en "Viajes". |
| **Tarifa vigente · programada** | Tarifa de encomiendas en uso · publicada con fecha futura, que entra en vigor sola a esa hora. | Panel de EnBus › "Tarifas". |
| **Sucursal** | Oficina de una cooperativa en una ciudad. Cada empleado trabaja en una. | Pestaña "Sucursales" de "Configuración". Sin sucursal asignada: aviso "Sin sucursal". |
| **Impresora y lector** | Impresora térmica y lector de códigos que usa la taquilla. | Pantalla del panel; su estado se ve en la barra superior ("Impresora"). |
| **Eliminar cuenta** | Baja de la cuenta del pasajero desde la app (Perfil) o la web (`/eliminar-cuenta`). Se pide que no queden boletos por usar, pagos en verificación, encomiendas en curso ni reembolsos pendientes. | El perfil queda como "Cuenta eliminada"; los boletos y encomiendas se conservan para la cooperativa. |
| **Tasa BCV** | Bolívares por 1 USD publicada por el BCV para el día. Los precios de referencia están en USD y se cobran en Bs a la tasa BCV del día. | "≈ USD 12,40 · BCV 02/10". |

Métodos de pago: **Pago Móvil** · **Transferencia** · **Zelle** · **Efectivo**.
Roles (en este orden cuando se listan): **Pasajero** · **Taquillero** · **Administrador de cooperativa** · **Administrador EnBus**.
Etapas de la línea de tiempo de una encomienda (app): **Envío creado** · **Recibida en taquilla** · **En camino** · **Lista para retirar** · **Entregada**.

## 3. Estados

Tonos (los colores concretos y su contraste los fijan `Badge` en la app y `StatusBadge` en el panel; las insignias no llevan icono). "—" = no se muestra a ese público.

| Tono | Uso | App | Web |
|---|---|---|---|
| exito | Hecho, válido, listo | `success` | `bg-success-light text-success-deep` |
| pendiente | Espera algo de alguien | `pending` | `bg-warning-light text-warning-deep` |
| info | En curso, avanza solo | `progress` | `bg-info-light text-info-deep` |
| peligro | Rechazado o bloqueado: requiere acción | `danger` | `bg-destructive-light text-destructive-deep` |
| terminado | Cerrado sin incidencia (historial) | `done` | `bg-muted text-foreground` |
| neutro | Anulado o inactivo | `neutral` (contorno) | `border border-border bg-background text-foreground` |

Los avisos que no son un estado ("Quedan 3", "Sin sucursal", "2 ciclos sin pagar", tasa desactualizada) usan el tono `pendiente` (o `peligro` si bloquean) sin ser una insignia de estado.

| Dominio · estado | Pasajero | Operador | Tono |
|---|---|---|---|
| encomienda · PENDIENTE_DE_ESCANEO | Por entregar en taquilla | Por recibir | pendiente |
| encomienda · EN_RECEPCION | Recibiéndose en taquilla | En recepción | pendiente |
| encomienda · POR_PAGAR | Pago pendiente | Por cobrar | pendiente |
| encomienda · PAGADA | Pagada · por salir | Lista para despacho | info |
| encomienda · EN_TRANSITO | En camino | En tránsito | info |
| encomienda · EN_OFICINA_DESTINO | Lista para retirar | En oficina de destino | exito (pasajero) / info (operador) |
| encomienda · ENTREGADA | Entregada | Entregada | exito |
| encomienda · CANCELADA | Cancelada | Cancelada | neutro |
| encomienda · DEVUELTA | Devuelta al remitente | Devuelta al remitente | terminado |
| boleto · RESERVA_SIN_PAGAR | Sin pagar | Reserva sin pagar | pendiente |
| boleto · PAGO_EN_VERIFICACION | Pago en verificación | Pago por verificar | pendiente |
| boleto · PAGO_RECHAZADO | Pago rechazado | Pago rechazado | peligro |
| boleto · RESERVADO (sin subestado) | Apartado | Apartado | pendiente |
| boleto · PAGADO | Confirmado | Pagado | exito |
| boleto · USADO | Viaje realizado | Embarcado | terminado |
| boleto · CANCELADO | Cancelado | Cancelado | neutro |
| boleto · EXPIRADO | Vencido | Vencido | terminado |
| reembolso · pendiente / procesado | Reembolso pendiente / Reembolsado | Por devolver / Devuelto | pendiente / exito |
| viaje · PROGRAMADO / EN_CURSO / COMPLETADO / CANCELADO | Programado / En ruta / Completado / Cancelado | igual | info / info / terminado / neutro |
| pago · PENDIENTE / APROBADO / RECHAZADO | En verificación / Confirmado / Rechazado | Por verificar / Aprobado / Rechazado | pendiente / exito / peligro |
| cobro encomienda · COSTO_PENDIENTE / SIN_PAGO / EN_VERIFICACION / RECHAZADO / PAGADO / NO_APLICA | Costo por calcular / Sin pagar / Pago en verificación / Pago rechazado / Pago confirmado / Sin cobro | Por calcular / Por cobrar / Por verificar / Rechazado / Pagado / Sin cobro | neutro / pendiente / pendiente / peligro / exito / neutro |
| cooperativa · PENDIENTE / RECHAZADA / ACTIVA / SUSPENDIDA / DESACTIVADA | — | En revisión / Rechazada / Activa / Suspendida / Desactivada | pendiente / peligro / exito / peligro / neutro |
| cuenta (usuario o empleado) · ACTIVA / SUSPENDIDA / ELIMINADA | — / — / Cuenta eliminada | Activa / Suspendida / Cuenta eliminada | exito / peligro / terminado |
| recurso (ruta, sucursal, método de pago) · activo / inactivo | — | Activa / Inactiva | exito / neutro |
| incidencia · ABIERTA / EN_PROCESO / RESUELTA | Recibido / En revisión / Resuelto | Abierta / En proceso / Resuelta | info (pasajero) o peligro (operador) / pendiente / exito |
| prioridad de incidencia · alta / media / baja | — | Alta / Media / Baja | peligro / pendiente / neutro |
| ciclo · pagado=false / true | — | Pendiente / Pagado el dd/mm | pendiente / exito |
| tarifa · vigente / programada / histórica | — | Vigente / Programada / Anterior | exito / info / neutro |
| reputación de cooperativa · promedio ≥ 4 / ≥ 3 / < 3 / sin calificaciones | — | Reputación excelente / Reputación regular / Requiere revisión / Todavía no la califican | exito / pendiente / peligro / neutro |
| retención en oficina de destino (de 5 días hábiles) · 0–2 / 3 / 4 o más | — | "N días hábiles" | neutro / pendiente / peligro |
| disponibilidad (aviso) · ≤ 5 / 0 | Quedan N / Agotado | Quedan N / Agotado | pendiente / peligro |

"Suspendida" es un bloqueo (no puede vender o no puede entrar), por eso va en `peligro` tanto para la cooperativa como para la cuenta; la acción es "Suspender …" / "Reactivar …" (destructiva). Para el pasajero, su reporte "Recibido" va en `info`: no es un error suyo.

Los subestados del boleto (`RESERVA_SIN_PAGAR`, `PAGO_EN_VERIFICACION`, `PAGO_RECHAZADO`) salen de `estado_ui_boleto(estado, pago.estado_verificacion)`; ver `State_Machines_Spec.md` §2.2. El reembolso no es un estado del enum: es un boleto `CANCELADO` con `monto_reembolso > 0` y `reembolso_procesado` falso o verdadero.

## 4. Nombres de pantalla (menú = H1 = breadcrumb)

**App (EnBusApp)**
- Pestañas: **Inicio**, **Boletos** (título "Mis boletos", CTA "Buscar viaje"), **Encomiendas** (título "Mis encomiendas", CTA "Enviar encomienda").
- Selector de Inicio: "Viajar | Enviar encomienda". Tarjetas: "Boletos activos" / "Encomiendas activas".
- Detalle de un boleto pagado: "Pase de abordaje". Ayuda: "Ayuda".

**Panel de cooperativas** (en este orden, por grupos del menú)
"Resumen" · **Ventas y cobros**: "Taquilla de boletos", "Taquilla de encomiendas", "Pagos por verificar", "Reembolsos" · **Encomiendas en ruta**: "Despacho", "Recepción en destino", "Entrega" · **Operación**: "Viajes", "Rutas" · **Cooperativa**: "Empleados", "Configuración" (pestañas "Sucursales", "Métodos de pago", "Datos") · pie del menú: "Impresora y lector".

**Panel de EnBus (admin)**
"Resumen" · **Por atender**: "Solicitudes", "Incidencias" · **Directorio**: "Cooperativas", "Usuarios", "Encomiendas" · **Dinero**: "Comisiones", "Tarifas".

Pestaña del navegador: "<Sección> · EnBus" (por defecto "Panel de cooperativas · EnBus" / "Administración · EnBus").

No usar: "Mis Viajes", "Mis Paquetes", "Paquetes en camino", "Buscar encomienda", "tracking", "ticket" en títulos.

**Verbos y etiquetas**

| Situación | Usar | No usar |
|---|---|---|
| Acceder | Título "Iniciar sesión"; botón "Entrar"; cargando "Entrando…"; segmento de la app "Entrar \| Crear cuenta" | "Ingresar", "Acceder" |
| Salir de la cuenta | "Cerrar sesión" | "Salir" |
| Campos | "Correo", "Contraseña", "Cédula", "Teléfono", "Origen", "Destino", "Fecha" | "Email", "Correo electrónico", "Desde", "Hacia" |
| Avanzar en un asistente | "Continuar" · contador "Paso 2 de 4" | "Siguiente" |
| Paso anterior de un asistente (web) | "Atrás" (en la app, la ← de la cabecera) | — |
| Salir sin hacer nada tras "Cancelar …" | "Volver" | "No, mantener", "Mantenerla", "Todavía no" |
| Cerrar un diálogo neutro | "Cancelar" | "Cerrar" (solo la × y los avisos) |
| Cerrar tras un éxito | "Listo" | "Aceptar", "OK" |
| Guardar | "Guardar cambios" · "Guardar <objeto>" · "Guardando…" | "Aceptar", "OK" |
| Confirmar una acción | Verbo + objeto: "Cancelar envío", "Cancelar reserva", "Suspender cuenta", "Marcar llegada" | "Sí, …", "Confirmar" a secas |
| Salir de un asistente con datos | "¿Salir sin terminar?" · "Salir sin guardar" / "Seguir editando" | — |
| Reintentar | "Reintentar" / "Reintentando…" | "Intentar de nuevo" |
| Pagos | "Registrar pago" · "Verificar pago" | "Validar pago", "Verificar" a secas |
| Viajes | "Programar viaje" ("Programar N salidas" solo en lote) · "Marcar salida" · "Marcar llegada" | — |
| Cuentas | "Suspender cuenta" · "Reactivar cuenta" | "Desactivar cuenta", "Bloquear" |
| Ir a otra parte | "Ir al Resumen" · "Ir a Mis boletos" | — |
| Comprar | "Buscar viaje" · "Apartar y pagar en taquilla" | "Reservar" como verbo |
| Encomienda | "Enviar encomienda" · "Código de seguimiento" · "PIN de retiro" | "Paquete", "tracking", "guía" (salvo la guía impresa) |
| Puntuación | Mayúscula solo inicial · "…" tipográfico · sin "¡!" salvo un único éxito de cierre por flujo | Mayúscula en cada palabra |
