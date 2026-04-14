# EnBus: Especificaciones Generales

## Objetivo
Startup que ofrece un ecosistema de servicios de bus en Venezuela, donde los clientes podrán comprar boletos de bus y realizar envíos/encomiendas más económicos y rápidos aprovechando las rutas nacionales interurbanas.

## Modelo de Negocio e Intermediación
EnBus actúa como un **facilitador**. No integra procesadores de pago: los clientes pagan directamente a las cuentas de las cooperativas (transferencia, Zelle, efectivo, etc.) utilizando los datos bancarios proporcionados por cada cooperativa.

1. **Comisiones**: Al final de cada ciclo (semana/mes), se genera un balance. La cooperativa debe una comisión porcentual a EnBus por cada envío o pasaje vendido mediante la plataforma.
2. **Precios Estandarizados**: Cuando una cooperativa se afilia a EnBus, acepta utilizar los precios estandarizados definidos por el Super Admin. La tarifa de encomiendas es por kg y considera también el tiempo estimado de recorrido del viaje.
3. **Seguro de Encomiendas**: Toda encomienda procesada por EnBus cuenta con un seguro gratuito contra pérdida. El costo lo absorbe EnBus. Cobertura: **3 veces el valor declarado del paquete**.

> **Nota**: El sistema de Puntos de Fidelidad está **descartado para la V1**. Se implementará en versiones futuras.

## Actores del Sistema
1. **Cliente / Usuario**: Usa la App Móvil. Puede ser Remitente (envía encomiendas) o Destinatario (recibe encomiendas) o Viajero (compra boletos).
2. **Personal de Oficina / Taquillero**: Usa el Panel Web de Cooperativas (PWA Next.js). Empleado de una sucursal de cooperativa.
3. **Administrador de Cooperativa**: Usa el Panel Web de Cooperativas. Gestiona rutas, horarios, empleados y métodos de pago de su cooperativa.
4. **Super Admin (EnBus)**: Usa el Panel Web de Super Admin (Next.js). Gestión financiera, auditoría, control de cooperativas, tarifas estandarizadas.
5. **Plataforma / Sistema**: Ejecuta lógicas automáticas, notificaciones y validaciones.

> **Nota**: Los conductores de bus **no son actores del sistema** en la V1. No requieren interfaz propia.

## Flujo de Uso: Encomiendas

### Enviar
1. **Creación**: El cliente ingresa a la App, presiona "Crear nuevo envío" y completa el formulario Wizard (ver `02_App_Movil/Section_Encomiendas_Spec.md`). El sistema le muestra una lista de cooperativas que tienen rutas hacia el destino seleccionado y los horarios de las próximas salidas.
2. **Generación QR**: Al culminar el formulario, el Sistema crea la encomienda con estado `PENDIENTE_DE_ESCANEO` y genera un Código QR en el teléfono del cliente.
3. **Acercamiento a Taquilla**: El cliente acude a la taquilla de la cooperativa seleccionada y muestra el QR. Si ya conoce el peso aproximado de su paquete, habrá utilizado la calculadora de costos estimada en la app.
4. **Escaneo y Recepción**: El personal de oficina escanea el QR con su Panel Administrador (escáner USB o cámara como fallback). El sistema valida que la cooperativa tenga una ruta activa hacia el destino seleccionado. Si no hay ruta, arroja un error. Si hay ruta, asocia la encomienda y cambia el estado a `EN_RECEPCION`.
5. **Carga de Datos Físicos**: El personal pesa la encomienda e ingresa el peso en el Panel. El sistema calcula el costo automáticamente basándose en la **tarifa estandarizada por kg** y el **tiempo estimado de recorrido**.
6. **Emisión de Guía**: El empleado confirma los datos y el Sistema genera el precio final. Al mismo tiempo crea una Guía/Etiqueta imprimible con datos y código QR de rastreo.
7. **Notificación de Cobro**: La encomienda pasa al estado `POR_PAGAR`. Si la modalidad es "Cobro en Destino", el destinatario recibe notificación Push + WhatsApp con el monto total a pagar.
8. **Pago**: Se muestran en la App los datos bancarios de la cooperativa. El cliente realiza el pago por fuera de la app (transferencia, Zelle, efectivo). Luego regresa a la app y confirma ingresando: **número de referencia**, **fecha de la transacción** y **banco emisor**.
    - *Caso Cobro en Origen*: El remitente paga. El pago solo es posible después del pesaje.
    - *Caso Cobro en Destino*: El destinatario puede pagar en cualquier momento desde la app o en físico al retirar.
    - En ambos casos, el personal de la cooperativa **verifica manualmente** el pago y lo marca como pagado en su Panel.
9. **Fotografía de Evidencia**: Tras el pago, el empleado pega la etiqueta en la caja y toma una fotografía desde su dispositivo (Panel/Tablet) para confirmar el embalaje en buen estado con la guía expuesta. La encomienda pasa a estado `PAGADA`.
10. **Generación de PIN**: El sistema genera un **PIN de retiro de 4 dígitos numéricos**. El celular del destinatario recibe un WhatsApp automático indicando: el envío, el enlace de seguimiento web, y su PIN de retiro secreto. El PIN también se envía por email. Si el destinatario tiene la App, el registro aparece en su sección de Encomiendas.
11. **Despacho**: Cuando el bus parte, el empleado marca el lote de encomiendas como "Despachadas". Pasan al estado `EN_TRANSITO`. Notificación Push enviada al remitente y destinatario. Notificación WhatsApp al destinatario.

### Recibir
1. **Llegada**: Al llegar el bus a la terminal, la oficina de destino escanea las guías físicas marcándolas como "Recibidas en Taquilla". El estado cambia a `EN_OFICINA_DESTINO`. El destinatario recibe notificación Push + WhatsApp con su PIN de retiro.
2. **Retiro**: El destinatario asiste a la taquilla, presenta documento de identidad (Cédula/RIF) y su **PIN de retiro (4 dígitos)**.
3. **Cobro en destino (Si aplica)**: Si la modalidad es "Cobro a destino" y aún no se ha pagado, el destinatario paga en la oficina. El empleado registra el cobro en su panel.
4. **Entrega Física**: El empleado ingresa el PIN en el Panel. El sistema valida (máximo **10 intentos fallidos** antes de bloquear). El empleado entrega la carga.
5. **Cierre**: La encomienda cambia al estado terminal `ENTREGADA`. No se envían notificaciones.

### Retención y Devolución
- Si una encomienda en estado `EN_OFICINA_DESTINO` no es retirada en **5 días hábiles**, se devuelve a la sucursal de origen.
- El remitente recibe notificación de que el paquete fue devuelto.
- El remitente debe **pagar el envío de regreso** para recuperar el paquete.

### Cancelación
- El remitente puede cancelar la encomienda desde la App **antes de que se registre el pago** (estados `PENDIENTE_DE_ESCANEO`, `EN_RECEPCION`, `POR_PAGAR`).
- Una vez pagada, la cancelación no es posible desde la App.

### Límites Físicos (Referencia)
- Dimensiones máximas referenciales: **50 × 50 × 50 cm** (orientativo, no bloqueante).
- Peso máximo por encomienda: **25 kg**.
- Estos límites se muestran como advertencia informativa en la app y la calculadora, pero **no se crean campos de entrada para dimensiones** en el formulario del cliente ni en la calculadora pública. Las dimensiones solo las verifica visualmente el taquillero al recibir el paquete.

### Máquina de Estados: Encomienda
Referencia completa: `00_General/State_Machines_Spec.md`

## Flujo de Uso: Boletos

### Compra de Boleto
1. El usuario busca rutas desde la pantalla de Inicio o desde el módulo de Boletos.
2. Selecciona un viaje (bus) de la lista de resultados.
3. Accede a la **página de detalles** donde se muestran los asientos disponibles.
4. Selecciona su(s) asiento(s) y procede al pago.
5. **Pago**: Se muestran los datos bancarios de la cooperativa. El usuario paga externamente y confirma en la app ingresando: **número de referencia**, **fecha** y **banco emisor**. La cooperativa verifica y marca como pagado.
6. Una vez pagado, se genera un **QR de embarque** y se revelan datos sensibles del viaje: **número de unidad (bus)** y **nombre del chófer**.
7. El boleto aparece en la sección "Boletos" del usuario.

### Embarque
- El personal de la cooperativa escanea el QR de embarque del pasajero al momento de abordar.
- No es necesario verificar la identidad del pasajero; basta con tener el boleto/QR a mano.

### Cancelación de Boleto
- El usuario puede cancelar un boleto adquirido.
- Debe llenar un cuadro de texto explicando el motivo de la cancelación.
- Se le reintegra el **95% del valor del boleto** (penalidad del 5%).
- El reembolso es procesado por la cooperativa en **1 a 2 días hábiles**.

### Calificación por Estrellas
- Después de completar un viaje (boleto en estado `USADO`), el usuario puede calificar a la cooperativa con **1 a 5 estrellas**.
- La calificación es opcional y se solicita una sola vez por viaje.
- Las calificaciones se promedian y son visibles públicamente en la información de cada cooperativa.

### Máquina de Estados: Boleto
Referencia completa: `00_General/State_Machines_Spec.md`

## Entidades Clave del Dominio

| Concepto | Definición |
|---|---|
| **Ruta** | Relación fija origen-destino (ej: "Caracas → Valencia") con un tiempo estimado de duración. Administrada por la cooperativa. |
| **Bus / Viaje** | Instancia específica de una ruta con fecha, hora de salida y asientos. Sinónimo: cuando se dice "bus" en la interfaz, se refiere a un viaje programado. Tiene horarios recurrentes definidos por la cooperativa. |
| **Encomienda** | Paquete enviado de remitente a destinatario usando una ruta de bus. |
| **Boleto** | Pasaje comprado por un viajero para un viaje específico con asiento asignado. |
| **Tracking ID** | Identificador amigable y único de cada encomienda. Formato: `EB-YYMMDD-XXXXX`. Es el mismo en la app, la guía impresa, la landing web y el Track & Trace público. |
| **PIN de Retiro** | Código de 4 dígitos numéricos, **único por encomienda**, generado cuando la cooperativa recibe la encomienda. Se envía al destinatario por WhatsApp y email. Vence al usarse. 10 intentos fallidos = bloqueo. **No se puede regenerar**; si el destinatario lo pierde, el Super Admin reenvía la notificación con el mismo PIN original. |

## Stack Tecnológico

1. **App Móvil (Usuarios Finales)**: React Native (Expo). Notificaciones push (Expo Push), códigos QR.
2. **Ecosistema Web (Next.js)**:
   - **Landing Page Comercial** (`/`): SSR/SSG para SEO.
   - **Super Admin** (`/admin`): Panel privado de gestión EnBus.
   - **Panel Cooperativas** (`/cooperativas`): Interfaz diaria de sucursales.
3. **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions).
4. **Impresión Térmica**: Comandos ESC/POS vía **Web Bluetooth API** (impresoras Bluetooth).
5. **Notificaciones**: Twilio (WhatsApp), Expo Push (Push nativas), Email (verificación y PIN).
6. **UI/Estilos** (Preset shadcn `b38BG2CiQ`, estilo Maia, base Neutral, fuente Lora, iconos Phosphor):
   - Web: Tailwind CSS + shadcn/ui (`npx shadcn@latest init --preset b38BG2CiQ`).
   - Móvil: NativeWind + React Native Reusables (mismos tokens del preset).

## Navegación de la App Móvil
El menú inferior (Bottom Navigation) tendrá **3 tabs**:
1. **Inicio** — Búsqueda rápida y panel de actividad.
2. **Encomiendas** — Enviar y recibir paquetes.
3. **Boletos** — Historial y compra de pasajes.

El acceso al **Perfil/Configuración** se realiza desde un ícono en la esquina superior derecha del Header (no es un tab).
