# Glosario y vocabulario único

Fuente única de los términos que ven pasajeros y operadores en la app, el panel de cooperativas, el panel de EnBus y la landing (plan #22, DS-04). Los mapas de estados del código (`EnBusApp/src/utils/estados.ts`, `PanelCooperativas/src/lib/estados.ts`, `LandingEnBus/lib/estados.ts`) siguen la tabla de §3.

## 1. Regla de uso

- **En títulos, botones, pestañas, menús y etiquetas de estado se usa el término del glosario.** Los sinónimos ("paquete", "pasaje", "ticket", "envío") solo aparecen en texto corrido.
- El nombre de una pantalla es el mismo en el menú, en el H1 y en el breadcrumb.
- Hay dos etiquetas por estado: **pasajero** (app y landing) y **operador** (panel de cooperativas y panel de EnBus). El **tono** (color) es el mismo para ambos.
- Español de Venezuela, con tildes. Montos con el formateador `dinero.ts`: "Bs 1.250,00" / "≈ USD 12,40 · BCV 02/10".

## 2. Términos

| Término | Definición | Notas de uso |
|---|---|---|
| **Boleto** | Derecho a un asiento en una salida. Código `BOL-XXXXXXXX`. | No "ticket" ni "pasaje" en títulos. |
| **Pase de abordaje** | Lo que el pasajero muestra para subir al bus: el QR y el código corto legible `BOL-XXXX-XXXX` (guion tras 4 caracteres). La taquilla acepta el código con o sin guiones, en minúsculas o el QR `PASS-…`. | Título del detalle de un boleto pagado. |
| **Viaje / Salida** | Un bus de una ruta en una fecha y hora. "Viaje" en general; "Salida" cuando importa la hora ("Salidas de hoy"). | — |
| **Encomienda** | Paquete enviado entre oficinas de una cooperativa. | No "paquete" en títulos ("Mis encomiendas", no "Mis paquetes"). |
| **Código de seguimiento** | Identificador de la encomienda: `EB-AAMMDD-NNNNN`. Es lo que codifica el QR y lo que se rastrea. | No "tracking" ni "guía" ante el pasajero ("guía" solo en el ticket impreso de la taquilla). |
| **PIN de retiro** | 4 dígitos que se generan cuando la taquilla recibe la encomienda; quien recibe lo presenta con su cédula para retirarla. | Se bloquea tras 10 intentos fallidos. |
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
| **Tasa BCV** | Bolívares por 1 USD publicada por el BCV para el día. Los precios de referencia están en USD y se cobran en Bs a la tasa BCV del día. | "≈ USD 12,40 · BCV 02/10". |

Métodos de pago: **Pago Móvil** · **Transferencia** · **Zelle** · **Efectivo**.
Roles (en este orden cuando se listan): **Pasajero** · **Taquillero** · **Administrador de cooperativa** · **Administrador EnBus**.
Etapas de la línea de tiempo de una encomienda (app): **Envío creado** · **Recibida en taquilla** · **En camino** · **Lista para retirar** · **Entregada**.

## 3. Estados

Tonos: `pendiente`, `info`, `exito`, `peligro`, `neutro`, `terminado` (los colores concretos y su contraste los fijan `Badge` en la app y `StatusBadge` en el panel). "—" = no se muestra a ese público.

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
| cooperativa · PENDIENTE / RECHAZADA / ACTIVA / SUSPENDIDA / DESACTIVADA | — | En revisión / Rechazada / Activa / Suspendida / Desactivada | pendiente / peligro / exito / pendiente / neutro |
| incidencia · ABIERTA / EN_PROCESO / RESUELTA | Recibido / En revisión / Resuelto | Abierta / En proceso / Resuelta | peligro / pendiente / exito |
| ciclo · pagado=false / true | — | Pendiente / Pagado el dd/mm | pendiente / exito |

Los subestados del boleto (`RESERVA_SIN_PAGAR`, `PAGO_EN_VERIFICACION`, `PAGO_RECHAZADO`) salen de `estado_ui_boleto(estado, pago.estado_verificacion)`; ver `State_Machines_Spec.md` §2.2. El reembolso no es un estado del enum: es un boleto `CANCELADO` con `monto_reembolso > 0` y `reembolso_procesado` falso o verdadero.

## 4. Nombres de pantalla (menú = H1 = breadcrumb)

**App (EnBusApp)**
- Pestañas: **Inicio**, **Boletos** (título "Mis boletos", CTA "Buscar viaje"), **Encomiendas** (título "Mis encomiendas", CTA "Enviar encomienda").
- Selector de Inicio: "Viajar | Enviar encomienda". Tarjetas: "Boletos activos" / "Encomiendas activas".
- Detalle de un boleto pagado: "Pase de abordaje". Ayuda: "Ayuda".

**Panel de cooperativas**
"Resumen", "Taquilla de boletos", "Taquilla de encomiendas", "Pagos por verificar", "Reembolsos", "Despacho", "Recepción en destino", "Entrega", "Rutas", "Viajes", "Empleados", "Configuración".

**Panel de EnBus (admin)**
"Resumen", "Solicitudes", "Cooperativas", "Buscar encomienda", "Tarifas", "Comisiones", "Incidencias", "Usuarios".

No usar: "Mis Viajes", "Mis Paquetes", "Paquetes en camino", "tracking", "ticket" en títulos.
