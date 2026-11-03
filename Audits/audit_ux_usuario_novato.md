# Auditoría UX de EnBus desde los ojos de un usuario nuevo

**Método.** Recorrí cada pantalla leyendo el código fuente: textos, botones, estados, validaciones, errores, estados vacíos y navegación. En cada una me pregunté qué vería y entendería alguien que nunca ha usado EnBus. No ejecuté la app ni modifiqué el repositorio. Para entender la intención consulté `Specs/` (General_Spec, Payments_Spec, Taquilla_Encomiendas_Spec), pero juzgo solo lo que el código muestra. Cuando un hallazgo depende del esquema de BD o del entorno, lo indico como **(probable)**.

**Severidad.** **Crítica**: bloquea un flujo principal, hace perder dinero o datos, o engaña sobre algo importante. **Alta**: el usuario se atasca o se equivoca con facilidad. **Media**: confusión o fricción notable. **Baja**: pulido.

Las rutas son relativas a la raíz del repo `C:\Users\Javie\Documents\Dev\Panas Cargo`.

---

## 1. App móvil (pasajero / remitente / destinatario) — `EnBusApp`

### 1.1 Acceso: login, registro, recuperar contraseña

**M-01. "Recuperar contraseña" no deja poner una contraseña nueva** · Alta · `EnBusApp/app/(auth)/recuperar.tsx:30-36`, `EnBusApp/app/_layout.tsx:90-94`
- Lo que vivo: "Pido el enlace, lo abro desde el correo y la app me mete directo al Inicio. Nunca me pidió una contraseña nueva. La próxima vez que cierre sesión sigo sin saber mi clave."
- Por qué confunde: el enlace redirige a `recuperar` (`Linking.createURL('recuperar')`) y, como ya hay sesión, el layout raíz te manda a `/(tabs)`. En la app no existe ninguna pantalla que llame a `updateUser({ password })`. Es un flujo que no termina.

**M-02. El botón "Google" parece no hacer nada (probable)** · Alta · `EnBusApp/app/(auth)/login.tsx:112-131`
- Lo que vivo: "Toco 'Google', el botón parpadea y no pasa nada."
- Por qué confunde: en React Native, `signInWithOAuth` devuelve una URL que hay que abrir con `WebBrowser.openAuthSessionAsync` y el código la ignora. No hay feedback ni alternativa.

**M-03. Los errores de login y registro llegan en inglés técnico** · Alta · `EnBusApp/app/(auth)/login.tsx:104-106`
- Lo que vivo: "Me sale 'Invalid login credentials' o 'Email not confirmed'."
- Por qué confunde: se muestra `err.message` de Supabase tal cual. Un usuario venezolano no sabe si la clave está mal, si falta confirmar el correo o si el usuario no existe.

**M-04. Tras registrarme no sé qué hacer** · Media · `EnBusApp/app/(auth)/login.tsx:97-102`
- Lo que vivo: "Sale un toast de 2 segundos: 'Te enviamos un enlace de confirmación'. El formulario sigue lleno, en modo Registrarse. ¿Ya puedo entrar? ¿Dónde reviso?"
- Por qué confunde: no hay pantalla de "Revisa tu correo", ni opción de reenviar el enlace, ni se cambia al modo "Iniciar sesión".

**M-05. El lema de la pantalla de entrada no menciona las encomiendas** · Baja · `EnBusApp/app/(auth)/login.tsx:155-160`
- Lo que vivo: "Dice 'EnBus App — Rastreo y compra de boletos'. Yo vine a mandar un paquete; ¿es la app correcta?"

**M-06. El registro pide cédula, pero quien entra con Google nunca la completa** · Alta · `EnBusApp/app/(auth)/login.tsx:198-204` y `EnBusApp/app/boletos/[id].tsx:392-393`
- Lo que vivo: "Entré con Google y mi pase de abordaje dice 'Pasajero: —' y 'C.I.: —'."
- Por qué confunde: nada te pide completar el perfil antes de comprar. El boleto sale sin identificación.

### 1.2 Inicio

**M-07. Se mezclan tres nombres para lo mismo: "Enviar", "Paquetes", "Encomiendas"** · Media · `EnBusApp/src/components/SearchForm.tsx:166-169`, `EnBusApp/app/(tabs)/index.tsx:178-186`, `EnBusApp/app/(tabs)/_layout.tsx:144`
- Lo que vivo: "El selector dice 'Viajar / Enviar', la tarjeta dice 'Paquetes en camino', la pestaña dice 'Encomiendas' y dentro el título es 'Mis Paquetes'."
- Por qué confunde: cuatro nombres para un mismo concepto. Lo mismo pasa con "Boletos" (pestaña) y "Mis Viajes" (título).

**M-08. Puedo elegir el mismo origen y destino** · Baja · `EnBusApp/src/components/SearchForm.tsx:138-158`
- Lo que vivo: "Elegí Caracas → Caracas y me dijo 'Sin viajes en esta ruta', como si fuera culpa de la ruta."

**M-09. Si una ruta no tiene viajes, quedo bloqueado sin alternativa** · Media · `EnBusApp/src/components/SearchForm.tsx:141-148`
- Lo que vivo: "Aparece 'Sin viajes en esta ruta' y el botón 'Buscar Boletos' se desactiva. No me sugiere ciudades cercanas ni me dice qué rutas sí existen."
- Por qué confunde: el selector ofrece todas las ciudades de Venezuela, aunque la mayoría no tiene servicio.

**M-10. Un error de red se ve igual que "no hay viajes"** · Media · `EnBusApp/src/components/SearchForm.tsx:123-127`
- Lo que vivo: "Sin datos móviles, la fecha queda gris y el botón desactivado, sin ningún mensaje."
- Por qué confunde: el error se traga en silencio (`console.error` solo en DEV).

### 1.3 Compra de boletos: búsqueda, salidas, asientos

**M-11. El precio dice "Bs" pero la cooperativa lo cargó en dólares** · Crítica · `EnBusApp/app/boletos/buscar.tsx:508`, `PanelCooperativas/src/app/cooperativas/(panel)/rutas/client.tsx:283`
- Lo que vivo: "Caracas–Maracaibo a '15 Bs'. Es casi gratis. Luego en el pago me dice '≈ 0,04 USD'."
- Por qué confunde: el gerente escribe el precio en un campo rotulado "Precio Pasaje ($)" y la app muestra ese mismo número como bolívares. Todo el cálculo de pago (Bs y su conversión BCV) queda mal. Ver también P-05 y la tabla de la sección 5.

**M-12. Un error de red se presenta como "Sin salidas ese día"** · Alta · `EnBusApp/app/boletos/buscar.tsx:250-252` y `:459-463`
- Lo que vivo: "Me dice que no hay viajes y que pruebe otro día. Cambio de día tres veces y nada; en realidad no tenía conexión."

**M-13. Los precios tienen formatos distintos en cada paso** · Baja · `EnBusApp/app/boletos/buscar.tsx:508,558,676`, `EnBusApp/src/components/SeatSelector.tsx:161,170`, `EnBusApp/src/components/PaymentFlow.tsx:502`
- Lo que vivo: "Veo '15 Bs', luego '15.00 Bs' y luego '15,00 Bs'. Punto y coma decimal se alternan."

**M-14. Los asientos que pierdo desaparecen sin aviso** · Media · `EnBusApp/src/components/SeatSelector.tsx:109-112`
- Lo que vivo: "Tenía marcados el 12 y el 13. De repente solo queda el 12 y no me di cuenta."
- Por qué confunde: el comentario dice "drop it silently". No hay un toast tipo "El asiento 13 acaba de ser tomado".

**M-15. Compro tres asientos pero no puedo indicar quién viaja** · Alta · `EnBusApp/app/boletos/buscar.tsx:313-323`, `EnBusApp/app/boletos/[id].tsx:392-393`
- Lo que vivo: "Compré para mi mamá y mi hermano. Los tres boletos salen a mi nombre y con mi cédula. ¿Los dejarán subir?"
- Por qué confunde: no se piden nombre ni cédula por pasajero. La taquilla sí los pide (`venta-flow.tsx:320-350`), así que app y taquilla se comportan distinto.

**M-16. Al terminar veo un solo boleto aunque compré varios** · Alta · `EnBusApp/app/boletos/buscar.tsx:343`
- Lo que vivo: "Pagué tres asientos y la app me muestra un boleto con 'Asiento 12'. ¿Dónde están los otros dos?"
- Por qué confunde: se navega solo a `boletos[0]` y no se explica que los demás están en "Mis Viajes".

**M-17. Los ocupados del viaje anterior se ven un instante** · Baja · `EnBusApp/app/boletos/buscar.tsx:264-284`
- Lo que vivo: "Cambio de salida y por un momento el mapa muestra los ocupados del bus anterior."
- Por qué confunde: `asientosOcupados` no se limpia al cambiar de selección, y si falla la carga se queda con datos viejos sin avisar.

**M-18. No hay cronómetro durante la compra** · Media · `EnBusApp/app/boletos/buscar.tsx:321-322`
- Lo que vivo: "Solo después de pagar descubro que tenía 30 minutos."

### 1.4 Pago (PaymentFlow), compartido por boletos y encomiendas

**M-19. "Comprobante enviado" aparece antes de que se guarde nada; si salgo, pierdo la compra** · Crítica · `EnBusApp/src/components/PaymentFlow.tsx:194-206`, `:263-266`; `EnBusApp/app/boletos/buscar.tsx:306-349`, `:351-354`
- Lo que vivo: "Pagué por Pago Móvil, metí la referencia y vi el check verde 'Comprobante enviado'. Cerré la app tranquilo. Mi boleto no existe."
- Por qué confunde: en boletos, el pago y los boletos solo se crean al tocar "Continuar" en la pantalla de éxito. Si tocas atrás en la cabecera (que sigue activa), cierras la app o falla la inserción porque alguien tomó el asiento, aparece "No se pudo generar el boleto" **después** de pagar. Es el clásico "¿me cobraron?".

**M-20. En iPhone no se puede escribir la fecha del pago** · Crítica · `EnBusApp/src/components/PaymentFlow.tsx:353-364`, `:137-139`
- Lo que vivo: "Me pide 'DD/MM/AAAA', pero el teclado numérico del iPhone no tiene '/'. Nunca puedo registrar el pago."
- Por qué confunde: `keyboardType="number-pad"` combinado con un regex que exige barras. No hay máscara ni selector de fecha.

**M-21. Si la inserción del pago falla, el boleto queda sin comprobante y sin aviso** · Crítica · `EnBusApp/app/boletos/buscar.tsx:334-341`
- Lo que vivo: "La app me lleva a mi boleto 'Reservado'. En taquilla no aparece mi referencia y me dejan expirar."
- Por qué confunde: el error del insert en `pagos` solo se loguea en DEV. Además el pago se asocia únicamente al primer boleto.

**M-22. El pago en efectivo usa textos de pago ya hecho** · Alta · `EnBusApp/src/components/PaymentFlow.tsx:385`, `:233-239`, `:435`
- Lo que vivo: "Elegí 'Efectivo en taquilla'. El botón dice 'Confirmar pago en taquilla' y luego 'Comprobante enviado… La cooperativa verificará tu pago'. ¡No he pagado nada! Y arriba decía 'Total a transferir'."
- Por qué confunde: los textos asumen una transferencia. Además el usuario tiene 30 minutos para ir físicamente a la taquilla (ver M-25), lo cual no es realista.

**M-23. Banco emisor: lista con duplicados y opciones que no son bancos** · Media · `EnBusApp/src/components/PaymentFlow.tsx:31-39`
- Lo que vivo: "Aparecen 'BNC' y 'Banco Nacional de Crédito (BNC)'. Pagué por Zelle y me obliga a elegir 'Banco emisor': ¿pongo 'Zelle'? También está 'BOD', que ya no existe."

**M-24. Otras fricciones del formulario de pago** · Media · `EnBusApp/src/components/PaymentFlow.tsx:299`, `:342`, `:546`, `:128-130`, `:113-121`
- Lo que vivo:
  - "El equivalente en USD solo aparece si elijo Zelle. Si pago en Bs no sé qué tasa usar."
  - "El campo de referencia dice 'Últimos 4 dígitos o más'. ¿Cuatro o todos?"
  - "El número de cuenta se corta con '…' y no hay botón de copiar."
  - "Si falla la carga de métodos, solo me ofrece efectivo sin explicar por qué."
- Por qué confunde: varias decisiones pequeñas que obligan a adivinar.

**M-25. "Continuar" no muestra carga y admite doble toque** · Media · `EnBusApp/src/components/PaymentFlow.tsx:263-266`
- Lo que vivo: "Toqué dos veces y me salió un error de asiento ocupado."

**M-26. La palabra "Confirmar" se repite en tres niveles distintos** · Baja · `EnBusApp/app/boletos/buscar.tsx:102`, `EnBusApp/src/components/PaymentFlow.tsx:291`
- Lo que vivo: "La cabecera dice 'Confirmar pago (03/03)'. Dentro hay otro paso 'Confirmar pago' con su propio 'Volver a métodos'. Hay dos botones de volver y cada uno me lleva a un sitio diferente."

### 1.5 Mi boleto: QR, cancelación y calificación

**M-27. Ya pagué, pero el boleto dice "Pendiente de pago, paga antes de que expire"** · Crítica · `EnBusApp/app/boletos/[id].tsx:333-349` y `:419-426`
- Lo que vivo: "Arriba un banner naranja con cuenta regresiva: 'Pendiente de pago. Paga antes de que expire el tiempo'. Abajo dice 'Pago en verificación'. ¿Pago otra vez?"
- Por qué confunde: hay dos mensajes contradictorios. El estado `RESERVADO` se usa tanto para "no he pagado" como para "pagué y la cooperativa no ha verificado".

**M-28. Si la cooperativa tarda más de 30 minutos, mi boleto pagado "expira"** · Crítica · `EnBusApp/app/boletos/[id].tsx:117-122`, `EnBusApp/src/utils/estados.ts` (texto de EXPIRADO)
- Lo que vivo: "A los 30 minutos pasó a 'Expirado: el tiempo para pagar la reserva terminó y el asiento se liberó'. ¡Pero yo pagué! ¿Quién me devuelve el dinero?"
- Por qué confunde: el plazo depende de la cooperativa, no del usuario. No hay instrucción de reclamo ni canal de soporte (ver M-52).

**M-29. "Cancelar reserva" de un boleto ya pagado dice "sin costo" y no habla de reembolso** · Alta · `EnBusApp/app/boletos/[id].tsx:184-218`, `:476-479`
- Lo que vivo: "Mi pago aún no estaba verificado. Cancelé y dice 'Cancelado sin costo'. ¿Y mis bolívares?"

**M-30. "Solicitar cancelación" cancela al instante y no explica el reembolso** · Alta · `EnBusApp/app/boletos/[id].tsx:450`, `:228-250`
- Lo que vivo: "El botón dice 'Solicitar', pero el boleto pasa a Cancelado en el momento. Me dice 'El reembolso se procesa en 1–2 días hábiles', sin decir a qué cuenta ni quién. La cooperativa no tiene ninguna pantalla para reembolsos (ver P-29)."

**M-31. Un fallo de red se muestra como "Boleto no encontrado… puede que haya sido eliminado"** · Alta · `EnBusApp/app/boletos/[id].tsx:100-102`, `:299-310`
- Lo que vivo: "Se me fue la señal en el terminal y la app me dice que mi boleto fue eliminado. Pánico."
- Por qué confunde: además, si había caché se muestran datos viejos sin indicar que podrían no estar actualizados.

**M-32. El QR muestra textos internos** · Baja · `EnBusApp/src/components/QRCodeViewer.tsx:44-46`
- Lo que vivo: "Debajo del QR dice 'PASS-BOL-8F3K…'. En encomiendas aparece un código larguísimo (UUID) en vez del número de guía."

**M-33. El pase no dice dónde ni a qué hora presentarse** · Alta · `EnBusApp/app/boletos/[id].tsx:391-405` (en la app no aparecen "sucursal" ni "dirección")
- Lo que vivo: "¿En qué terminal subo? ¿Con cuánta anticipación llego?"
- Por qué confunde: la app nunca muestra la dirección de la sucursal, ni en boletos ni en encomiendas, aunque la cooperativa sí la registra (`tab-sucursales.tsx:171-175`).

### 1.6 Mis Viajes (pestaña Boletos)

**M-34. La lista muestra la fecha de compra, no la del viaje** · Alta · `EnBusApp/app/(tabs)/boletos.tsx:98`
- Lo que vivo: "Veo 'Caracas → Mérida, 2 oct'. Era el día en que compré, no el día en que viajo."

**M-35. Letras "B", "E", "R" sin explicación** · Baja · `EnBusApp/src/components/TransactionCard.tsx:17-21`
- Lo que vivo: "Cada tarjeta tiene un círculo con una letra. ¿Qué significa la 'R'?"

**M-36. Un error de carga parece lista vacía** · Media · `EnBusApp/app/(tabs)/boletos.tsx:53-59`, `:111-124`
- Lo que vivo: "Sin red me dice 'Sin boletos activos. Empieza por buscar un viaje'. Me asusto: ¿perdí mis boletos?"
- Por qué confunde: el hook devuelve `error`, pero la pantalla no lo usa.

### 1.7 Encomiendas: crear un envío

**M-37. La pestaña Encomiendas abre en "Para Mí", siempre vacía y sin botón para enviar** · Alta · `EnBusApp/app/(tabs)/encomiendas.tsx:32`, `:112-116`, `:180-192`
- Lo que vivo: "Entro a Encomiendas para mandar algo y veo 'Sin paquetes en camino'. No hay ningún botón de 'Enviar'; tengo que descubrir la otra pestaña."

**M-38. "Tarifa referencial" usa el precio del pasaje de bus** · Alta · `EnBusApp/app/encomiendas/nueva.tsx:408-411`
- Lo que vivo: "Elijo la cooperativa y dice 'Tarifa referencial 15 Bs'. Al final en taquilla me cobran otra cosa."
- Por qué confunde: `precio_pasaje` es el valor del boleto de persona, no de la encomienda.

**M-39. Peso máximo: el aviso dice 25 kg, la validación acepta 100 kg** · Media · `EnBusApp/app/encomiendas/nueva.tsx:525`, `EnBusApp/src/utils/validation.ts:57-60`, `PanelCooperativas/src/components/encomiendas/recepcion-modal.tsx:121-123`
- Lo que vivo: "Puse 40 kg, la app lo aceptó, y la taquilla lo rechaza porque su límite es 25 kg."

**M-40. Moneda mezclada dentro del mismo formulario** · Media · `EnBusApp/app/encomiendas/nueva.tsx:491`, `:516`, `:612-613`
- Lo que vivo: "El valor declarado va en '$' y el costo estimado en 'Bs'. Nadie me explica para qué sirve el valor declarado (el seguro cubre 3 veces ese valor según `Specs/00_General/General_Spec.md:11`)."

**M-41. Detalles del formulario: campos opcionales sin marcar y errores genéricos** · Baja · `EnBusApp/app/encomiendas/nueva.tsx:481-487`, `EnBusApp/src/utils/validation.ts:45-49`
- Lo que vivo:
  - "'Peso estimado (kg)' parece obligatorio y no lo es."
  - "Escribo '2,5' con coma y lo toma como 2."
  - "Me sale 'Campo debe tener al menos 2 caracteres'. ¿Qué campo?"

**M-42. El paso 3 dice "¡Todo listo!" antes de guardar nada** · Alta · `EnBusApp/app/encomiendas/nueva.tsx:573-583`
- Lo que vivo: "Un check verde enorme y '¡Todo listo!'. Salí de la app. No se había creado nada; faltaba tocar 'Generar código QR'."

**M-43. "Pago yo ahora" en realidad es "pago en taquilla"** · Media · `EnBusApp/app/encomiendas/nueva.tsx:636-644`
- Lo que vivo: "Elijo 'Pago yo ahora' y debajo dice 'Pagarás el envío al entregar el paquete en taquilla'. ¿Ahora o después? Además, la opción preseleccionada es 'Paga quien recibe', aunque no la elegí yo."

**M-44. No dice dónde llevar el paquete ni qué no se puede enviar** · Alta · `EnBusApp/app/encomiendas/nueva.tsx:396-428` y `:647-652`
- Lo que vivo: "Elegí la cooperativa, pero no sé en qué oficina entregarlo, en qué horario, ni si puedo mandar líquidos o medicinas."

**M-45. Errores silenciosos en rutas y en el cálculo de costo** · Media · `EnBusApp/app/encomiendas/nueva.tsx:131-133`, `:166-169`
- Lo que vivo: "Sin red dice 'Ninguna cooperativa cubre este trayecto'. Y el costo estimado simplemente desaparece."

### 1.8 Encomiendas: detalle del envío y seguimiento

**M-46. La línea de tiempo marca "Entregada al destinatario" en paquetes pagados, cancelados o devueltos** · Crítica · `EnBusApp/app/encomiendas/enviar/[id].tsx:173-195`, `EnBusApp/app/encomiendas/recibir/[id].tsx:111-128`
- Lo que vivo: "Pagué en taquilla (estado 'Pagada') y la línea de tiempo muestra todo en verde, incluido 'Entregada al destinatario'. Mi paquete sigue en Caracas. Y uno que cancelé también aparece como 'Entregado'."
- Por qué confunde: si el estado actual (`PAGADA`, `PENDIENTE_VERIFICACION`, `CANCELADA`, `DEVUELTA`) no está en `STATUS_FLOW`, todas las etapas se marcan como completadas.

**M-47. Al remitente le piden pagar aunque eligió "Paga quien recibe"** · Alta · `EnBusApp/app/encomiendas/enviar/[id].tsx:257-287`
- Lo que vivo: "Elegí que pagara mi primo y aun así me aparece 'Pago requerido' con todo el formulario."
- Por qué confunde: la pantalla de envío muestra el pago para cualquier `POR_PAGAR` sin mirar `modalidad_pago`. La de recibir sí lo filtra.

**M-48. Jerga y textos repetidos** · Baja · `EnBusApp/app/encomiendas/enviar/[id].tsx:290`, `:305`, `:238-242`
- Lo que vivo: "'Logística', 'Tracking'... En recibir la misma tarjeta se llama 'Seguimiento'. El estado 'Pagada' dice 'el envío continúa su ruta', aunque aún no salió."

**M-49. Al cancelar no hay confirmación de éxito y no queda claro qué pasa con el paquete** · Media · `EnBusApp/app/encomiendas/enviar/[id].tsx:39`, `:149-171`
- Lo que vivo: "Cancelé y la app me devolvió a la lista sin decir nada. El paquete ya estaba 'En recepción' en la taquilla. ¿Me lo devuelven? ¿Dónde lo busco?"

### 1.9 Encomiendas: recibir un paquete

**M-50. El destinatario nunca ve sus paquetes en la app** · Crítica · `EnBusApp/src/hooks/useEncomiendas.ts:54`, `EnBusApp/app/encomiendas/nueva.tsx:265-280`, `supabase/migrations/20260414000002_tables.sql:124`
- Lo que vivo: "Mi tía me envió algo. Tengo la app, mi cédula y mi teléfono, y 'Para Mí' sigue vacío. ¿Dónde está mi PIN de retiro?"
- Por qué confunde: la lista filtra por `receiver_user_id`, y nadie (ni la app ni ningún trigger) llena ese campo. Toda la pantalla de recibir (PIN, pago en destino) es inalcanzable desde la lista.

**M-51. Si llego a la pantalla de recibir, los datos se contradicen** · Media · `EnBusApp/app/encomiendas/recibir/[id].tsx:184-194`, `:203-206`, `:212-214`, `:235`, `:239-251`
- Lo que vivo:
  - "El PIN aparece desde antes de que el paquete salga, y '––––' si aún no existe."
  - "El costo dice 'Se paga al retirar' aunque lo pagó el remitente."
  - "Debajo del remitente sale un teléfono enmascarado '•••••1234' sin etiqueta."
  - "Puedo terminar en un formulario para pagar 0,00 Bs."
  - "Si falla el cambio de estado después de pagar, no me entero."

### 1.10 Notificaciones

**M-52. No hay canal de ayuda ni de reclamo en toda la app** · Alta · (en `EnBusApp/app` no aparece "soporte", "ayuda" ni "reportar")
- Lo que vivo: "Mi boleto expiró después de pagar, mi paquete aparece entregado sin estarlo, mi PIN se bloqueó. ¿A quién le escribo?"
- Por qué confunde: el admin tiene un tipo de incidencia "Reporte de Usuario" (`PanelCooperativas/src/components/admin/incidencias/incidencias-table.tsx:114`), pero el usuario no tiene cómo crearla.

**M-53. Tocar una notificación push abre la lista, no el boleto o paquete** · Media · `EnBusApp/app/_layout.tsx:84`
- Lo que vivo: "Me llegó 'Tu encomienda está lista para retirar'. La toco y me deja en la lista; tengo que buscarla otra vez."

**M-54. Notificaciones cortadas y sin acción** · Baja · `EnBusApp/app/notificaciones.tsx:63-66`, `:176-180`, `:201-207`
- Lo que vivo: "El mensaje se corta en dos líneas y, si no tiene recurso asociado, al tocarlo no pasa nada. 'Marcar todas como leídas' es solo un icono de casilla."

### 1.11 Perfil

**M-55. "Cerrar sesión" no pide confirmación** · Baja · `EnBusApp/app/perfil.tsx:292`

**M-56. Faltan opciones básicas en el perfil** · Media · `EnBusApp/app/perfil.tsx:286-300`
- Lo que vivo: "No puedo cambiar mi contraseña, borrar mi cuenta, ver términos y privacidad ni contactar a nadie. El botón de editar es un lápiz sin texto."

### 1.12 Pantallas huérfanas y errores generales

**M-57. Pantalla `viajes/[id]` huérfana con otro flujo de compra** · Baja · `EnBusApp/app/viajes/[id].tsx` (ninguna ruta la enlaza)
- Si llega por un deep link, el usuario ve un flujo de 2 pasos distinto del de 3 pasos de `buscar`. Hay que eliminarla o unificarla.

**M-58. La pantalla de error dice "vuelve al inicio" pero solo ofrece "Reintentar"** · Baja · `EnBusApp/src/components/ErrorBoundary.tsx:46-49`, `:64-66`

---

## 2. Panel de cooperativas (taquillero y gerente) — `PanelCooperativas/src/app/cooperativas`

### 2.1 Registro, login, recuperación e invitaciones

**P-01. Los enlaces de invitación a empleados no funcionan** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/empleados/actions.ts:57`, `.../empleados/client.tsx:45`, `PanelCooperativas/src/app/cooperativas/invite/[token]/actions.ts:24-31`
- Lo que vivo (gerente): "Invito a mi taquillera y le copio el enlace. Ella lo abre y ve 'Invitación Inválida — Invitación no encontrada'."
- Por qué confunde: el enlace usa `invitacion.id`, pero la página busca por la columna `token`. En la landing sí se usa `token` (`LandingEnBus/app/registro-cooperativa/actions.ts:92`).

**P-02. Una invitación inválida o vencida es un callejón sin salida** · Alta · `PanelCooperativas/src/app/cooperativas/invite/[token]/page.tsx:45-62`
- Lo que vivo: "'Esta invitación ha expirado.' No hay botón para ir al login ni para pedir otra."
- Por qué confunde: la invitación de la landing vence a los 7 días y la de empleados a las 48 horas, y no se avisa del plazo en ningún sitio.

**P-03. Hay dos registros de cooperativa y funcionan distinto** · Alta · `PanelCooperativas/src/app/cooperativas/registro/actions.ts:90-168` vs `LandingEnBus/app/registro-cooperativa/actions.ts:82-116`
- Lo que vivo: "Desde el panel creo una contraseña y entro de inmediato. Desde la web pública me dicen que espere un correo con un enlace. ¿Cuál es el bueno? Si uso los dos, el segundo me dice 'Ya existe una cooperativa con este RIF'."

**P-04. Problemas del formulario de registro en el panel** · Media · `PanelCooperativas/src/app/cooperativas/registro/page.tsx:213-224`; `.../registro/actions.ts:64-68`, `:106`
- Lo que vivo:
  - "Mi RIF es J-12345678-9 y lo rechaza; solo acepta J-12345678. Una cooperativa con RIF G- (gobierno) no puede registrarse."
  - "El correo repetido me lo dicen en el paso 2, pero el campo está en el paso 1."
  - "A veces el error sale en inglés: 'Error al crear la cuenta: A user with this email…'."

**P-05. Login y recuperación: mensajes genéricos o en inglés** · Media · `PanelCooperativas/src/app/cooperativas/login/login-client.tsx:33-35`, `PanelCooperativas/src/app/cooperativas/recuperar/recuperar-client.tsx:36`, `PanelCooperativas/src/app/cooperativas/invite/[token]/actions.ts:87`, `:103`
- Lo que vivo: "Todo error es 'Credenciales inválidas', incluso si mi cuenta está suspendida. Recuperar me muestra 'For security purposes, you can only request this after 60 seconds'."

**P-06. Al aceptar una invitación, mi cédula y teléfono quedan como "PENDIENTE"** · Baja · `PanelCooperativas/src/app/cooperativas/invite/[token]/actions.ts:81-82`
- Esa palabra aparece luego como si fuera un dato real en el detalle del admin (`cooperativa-detail-tabs.tsx:319-320`).

### 2.2 Navegación y estructura general

**P-07. "Entrega de Encomiendas" no está en el menú** · Crítica · `PanelCooperativas/src/lib/navigation.ts:7-62`, `PanelCooperativas/src/app/cooperativas/(panel)/entrega/page.tsx:121-124`
- Lo que vivo (taquillero de destino): "Llegó el destinatario con su PIN. ¿Dónde entrego el paquete? En el menú solo hay 'Recepción Destino'."
- Por qué confunde: la pantalla existe, pero ningún enlace del panel lleva a ella. El último paso de la cadena de encomiendas no se puede descubrir.

**P-08. No hay aviso si la cooperativa está suspendida o rechazada** · Alta · `PanelCooperativas/src/components/pending-approval-banner.tsx:12`
- Lo que vivo: "Me rechazaron (o me suspendieron) y el panel se ve normal. Programo viajes y nadie compra."
- Por qué confunde: el banner solo existe para `PENDIENTE`, y además se puede cerrar con una X sin volver a aparecer en esa sesión.

**P-09. Mi rol se muestra como texto de sistema** · Baja · `PanelCooperativas/src/components/app-sidebar.tsx:116`, `:131`
- Lo que vivo: "Bajo mi nombre dice 'admin cooperativa' o 'taquillero', en minúscula, como un código."

**P-10. Las pantallas de error muestran el mensaje técnico** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/error.tsx:26`
- En producción Next.js entrega un texto genérico en inglés ("An error occurred in the Server Components render…").

**P-11. El nombre "Rutas y Horarios" engaña** · Media · `PanelCooperativas/src/lib/navigation.ts:39`
- Lo que vivo: "Entro a 'Rutas y Horarios' para cambiar la hora del bus de las 7 y no hay horarios. Están en 'Viajes Programados'."

**P-12. El cuadro de escaneo me roba el foco cada 2 segundos** · Alta · `PanelCooperativas/src/components/scan-input.tsx:101-107`
- Lo que vivo: "Intento escribir en el filtro de fecha o en el buscador y, a los 2 segundos, el cursor salta al cuadro de escaneo. Lo que tecleo se va al lugar equivocado."

**P-13. El placeholder de escaneo usa jerga en inglés y la búsqueda distingue mayúsculas** · Media · `PanelCooperativas/src/components/scan-input.tsx:134`, `:72`
- Lo que vivo: "En la taquilla de boletos me dice 'escribir Tracking ID'. Escribo el código del boleto en minúsculas y no lo encuentra."

### 2.3 Dashboard

**P-14. Todo el dinero aparece en dólares aunque la app cobra en bolívares** · Crítica · `PanelCooperativas/src/lib/utils.ts:49-51`, `PanelCooperativas/src/app/cooperativas/(panel)/dashboard/page.tsx:219`, `:237`
- Lo que vivo (gerente): "'Ingresos del Día: US$ 4.500,00'. ¿4.500 dólares hoy? Eran bolívares."
- Por qué confunde: `formatCurrency` siempre usa USD y suma montos registrados en Bs. En Taquilla Boletos el mismo precio sale como "Bs.S" (`taquilla/boletos/page.tsx:171`). Ver la tabla de la sección 5.

**P-15. Indicadores ambiguos, tablas sin acción y sin guía inicial** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/dashboard/page.tsx:182`, `:229-249`, `:271-288`
- Lo que vivo:
  - "'Encomiendas Recibidas: Hoy'. ¿Recibidas en taquilla o creadas en la app?"
  - "'Comisiones Pendientes: US$ 120'. ¿A quién se las pago y cómo?"
  - "La tabla de recientes no se puede tocar."
  - "Mi cooperativa es nueva y el dashboard no me dice que primero cree sucursales, métodos de pago, rutas y viajes."

### 2.4 Taquilla de boletos

**P-16. El taquillero no puede rechazar un pago falso** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:470-478`
- Lo que vivo: "La referencia no aparece en el banco. Solo tengo 'Aprobar Pago' o 'Cancelar'. Cancelar cierra el diálogo y el boleto sigue ahí hasta expirar. El pasajero no recibe ningún motivo."

**P-17. Validar pago muestra poca información útil** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:433`, `:454-459`, `:428`
- Lo que vivo:
  - "'Método: DIGITAL'. ¿Fue Pago Móvil, transferencia o Zelle? ¿A cuál de nuestras cuentas?"
  - "Si fue Zelle, el monto aparece en Bs.S y el cliente pagó en dólares."
  - "Si no hay datos, el sistema supone que 'están asociados a otro boleto de la misma compra' y me deja aprobar a ciegas."

**P-18. Un boleto con pago en verificación aparece como "Boleto inválido" al embarcar** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:120-128`
- Lo que vivo: "El pasajero pagó por la app y aún no se había validado. Escaneo su código y dice 'Boleto inválido'. No me ofrece validar el pago ahí mismo ni explica el motivo (expirado, cancelado o pendiente)."

**P-19. "Boleto Válido" no muestra fecha ni hora del viaje** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:360-403`, `.../taquilla/boletos/actions.ts:86-101`
- Lo que vivo: "Escaneo y sale verde 'Boleto Válido'. Embarco al pasajero, y su boleto era para mañana."
- Por qué confunde: no se compara con la fecha del viaje ni se pregunta a qué bus se está embarcando.

**P-20. Los estados se muestran en mayúsculas de sistema** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:212-218`, `PanelCooperativas/src/components/status-badge.tsx:11-27`
- Lo que vivo: "El filtro y la etiqueta dicen 'PAGADO', 'RESERVADO', 'USADO'. El pasajero me enseña 'Confirmado' o 'Viaje completado' en su app. Hablamos idiomas distintos."

**P-21. "Filtrar por Fecha" filtra por fecha de venta** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:90-99`
- Lo que vivo: "Quiero ver los boletos del viaje de mañana y no salen, porque se vendieron la semana pasada. Además el día se desplaza por zona horaria."
- Por qué confunde: `new Date("AAAA-MM-DD")` se interpreta en UTC, que en Venezuela es el día anterior a las 20:00. Solo se cargan los 50 más recientes, sin aviso.

**P-22. La columna "Pasajero" muestra a quien compró** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/page.tsx:280`
- Lo que vivo: "Para tres asientos comprados por la misma persona, la lista dice tres veces el mismo nombre."

**P-23. Vender boleto en taquilla: falta información y flexibilidad** · Alta · `PanelCooperativas/src/components/boletos/venta-flow.tsx:364-427`, `:150-153`, `:378-386`, `:408-413`
- Lo que vivo:
  - "En el paso 'Pago' no aparece cuánto cobrar."
  - "Solo puedo vender un asiento por operación. Para una familia de cuatro repito el flujo cuatro veces."
  - "Solo hay 'Efectivo' o 'Transferencia'. ¿Dónde marco Pago Móvil o Zelle?"
  - "El banco es texto libre, mientras la app usa una lista."

**P-24. Si la venta falla a medias, el asiento queda ocupado** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/actions.ts:45-75`, `:59`
- Lo que vivo: "Me salió 'duplicate key value violates unique constraint…' (en inglés). Reintenté y el asiento ya figura ocupado."
- Por qué confunde: el boleto se crea `PAGADO` antes de registrar el pago. Si el pago falla, el boleto ya existe.

**P-25. App y taquilla usan formatos de código distintos** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/boletos/actions.ts:6-11`, `:33`, `EnBusApp/app/boletos/buscar.tsx:52-59`
- Lo que vivo: "Los boletos de taquilla se ven 'BL-261002-7XK2Q' y los de la app 'BOL-8F3K2Z1Q'. El QR de taquilla es un código aleatorio y el de la app es 'PASS-…'. ¿Son el mismo sistema?"

**P-26. La lista de pasajeros omite a quien pagó por la app y espera validación** · Media · `PanelCooperativas/src/components/boletos/pasajeros-viaje-sheet.tsx:68`
- Lo que vivo: "Reviso la lista antes de salir y faltan dos personas que sí pagaron."

### 2.5 Taquilla de encomiendas

**P-27. No hay forma de registrar una encomienda de alguien sin la app** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/page.tsx:136-143`
- Lo que vivo: "Llega una señora con una caja y sin teléfono inteligente. No hay botón de 'Nueva encomienda'. Solo puedo procesar las que ya vienen de la app."
- Por qué confunde: en boletos sí existe la venta presencial.

**P-28. Los paquetes con "Cobro en destino" nunca pueden despacharse** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/page.tsx:250-260`, `.../taquilla/encomiendas/actions.ts:29-38`, `.../despacho/page.tsx:85-90`
- Lo que vivo: "Recibo un paquete 'DESTINO'. El modal se cierra y queda 'Por Pagar'. En Despacho lo escaneo y dice 'Solo se pueden despachar encomiendas PAGADA'. El paquete se queda para siempre en mi oficina."
- Por qué confunde: la especificación dice que viaja sin pagar y se cobra al retirarlo (`Specs/00_General/Payments_Spec.md:63-66`), y la pantalla de Entrega está pensada para cobrar en destino.

**P-29. No hay dónde verificar el pago que hizo el destinatario desde la app** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/page.tsx:95-103`, `:152-159`, `EnBusApp/app/encomiendas/recibir/[id].tsx:241-244`
- Lo que vivo: "El destinatario pagó desde la app y la encomienda pasó a 'PENDIENTE_VERIFICACION'. En mi panel no hay pestaña para ese estado y al abrirla solo veo un detalle sin botones."
- Por qué confunde: el modal de pago se abre solo para `POR_PAGAR`. Tampoco hay pantalla de reembolsos de boletos (M-30): `monto_reembolso` no se usa en el panel de cooperativa.

**P-30. Etiquetas y modalidades sin traducir** · Alta · `PanelCooperativas/src/components/status-badge.tsx:25-26`, `PanelCooperativas/src/components/encomiendas/recepcion-modal.tsx:253-255`, `PanelCooperativas/src/components/encomiendas/detalle-sheet.tsx:127`
- Lo que vivo: "La pestaña dice 'En Recepción' y la etiqueta de la fila 'EN_RECEPCION'. Lo mismo con 'EN_OFICINA_DESTINO' y 'PENDIENTE_VERIFICACION'. La modalidad aparece como 'ORIGEN' o 'DESTINO'. ¿Quién paga qué?"

**P-31. Si no hay ruta al destino, el modal se cierra sin decirme qué hacer** · Alta · `PanelCooperativas/src/components/encomiendas/recepcion-modal.tsx:80-84`
- Lo que vivo: "Escaneo el QR del cliente, sale 'No hay ruta activa al destino seleccionado' y el modal se cierra. El cliente está frente a mí con su caja. ¿La rechazo? ¿Cómo? No hay botón para rechazar ni para cancelar la encomienda."

**P-32. El modal de recepción omite datos útiles y muestra errores técnicos** · Media · `PanelCooperativas/src/components/encomiendas/recepcion-modal.tsx:245-273`, `:140-151`
- Lo que vivo: "No veo el peso que declaró el cliente ni la foto que subió, para comparar. Si falla el cálculo, el aviso trae texto técnico de la función."

**P-33. En el cobro de origen solo puedo registrar efectivo** · Alta · `PanelCooperativas/src/components/encomiendas/pago-modal.tsx:204-226`
- Lo que vivo: "El cliente quiere pagar por Pago Móvil aquí mismo. Solo tengo 'Cobrado en Efectivo'. El pago digital únicamente se puede aprobar si el cliente lo reportó desde la app. Tampoco hay 'Rechazar pago'."

**P-34. "Pago aprobado" aunque falle el guardado** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/taquilla/encomiendas/actions.ts:78-105`
- Lo que vivo: "Me dijo 'Cobro en efectivo registrado', pero la encomienda sigue 'Por Pagar'."
- Por qué confunde: los `await` no revisan `error` y siempre devuelven `success: true`.

**P-35. La foto obligatoria me deja atrapado si la cámara falla** · Alta · `PanelCooperativas/src/components/encomiendas/photo-capture-modal.tsx:158-166`, `:182`
- Lo que vivo: "Mi PC de taquilla no tiene cámara. El modal no se puede cerrar, ni con X ni con Escape. Solo me ofrece 'Recargar Página', y al recargar la foto ya no se pide nunca más."
- Por qué confunde: no hay opción de subir un archivo ni de omitir la foto con un motivo.

**P-36. El detalle de encomienda es solo lectura, incluso cuando hay algo pendiente** · Media · `PanelCooperativas/src/components/encomiendas/detalle-sheet.tsx:45-160`
- Lo que vivo: "Abro una encomienda y no tengo ninguna acción posible. El costo sale con '$'."

### 2.6 Despacho

**P-37. "Confirmar Despacho" fallaría con un error de base de datos (probable)** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/despacho/actions.ts:17-28`
- Lo que vivo: "Escaneé 12 paquetes, toqué 'Confirmar Despacho' y me sale 'column viaje_asignado_id does not exist'."
- Por qué confunde: la columna `viaje_asignado_id` no existe en `supabase/migrations/*.sql`; solo existe `viaje_id`. Recepción en destino lee `viaje_id` (`recepcion-destino/page.tsx:59`, `recepcion-lote-modal.tsx:56`).

**P-38. Puedo cargar un paquete en el bus equivocado** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/despacho/page.tsx:85-98`
- Lo que vivo: "Seleccioné el bus a Maracaibo y escaneé un paquete para Mérida. Lo aceptó con 'Encomienda agregada'."
- Por qué confunde: no se compara el destino del paquete con el del viaje.

**P-39. Despachar pone el viaje "En curso" y detiene la venta de boletos** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/despacho/actions.ts:30-33`, `.../despacho/page.tsx:115`
- Lo que vivo: "Despaché los paquetes a las 10 a. m. para el bus de las 4 p. m. El viaje desapareció de la lista y ya no se venden boletos de esa salida. Si llega otro paquete, no puedo agregarlo."
- Por qué confunde: no se avisa de este efecto antes de confirmar.

**P-40. El selector de fecha muestra el día equivocado** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/despacho/page.tsx:34`, `:47-50`
- Lo que vivo: "Pongo hoy y aparecen los viajes de ayer, o 'No hay viajes programados para esta fecha'. Después de las 8 p. m. la fecha por defecto ya es mañana."
- Por qué confunde: `toISOString()` y `new Date("AAAA-MM-DD")` se interpretan en UTC.

**P-41. Mensaje de error técnico** · Baja · `PanelCooperativas/src/app/cooperativas/(panel)/despacho/page.tsx:88`
- Lo que vivo: "'La encomienda está en estado: POR PAGAR. Solo se pueden despachar encomiendas \"PAGADA\".' No me dice qué hacer (cobrarla)."

### 2.7 Recepción en destino

**P-42. Veo paquetes de todas las sucursales y puedo marcarlos como recibidos aquí** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/recepcion-destino/page.tsx:53-66`, `.../recepcion-destino/actions.ts:5-18`
- Lo que vivo: "Estoy en Valencia y la lista trae paquetes que van a Mérida. Escaneé uno por error y quedó 'Lista para retirar' en Valencia, con la notificación al destinatario incluida."

**P-43. Jerga en el estado vacío y "Sin viaje asignado" en todo** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/recepcion-destino/page.tsx:145`, `:174-183`
- Lo que vivo: "'No hay encomiendas en estado EN_TRANSITO'. Y si hay paquetes, todos dicen 'Sin viaje asignado' (ver P-37)."

**P-44. Después de recibir no se me indica el siguiente paso** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/recepcion-destino/page.tsx:96`
- Lo que vivo: "Sale '✅ Recibida'. ¿Y ahora? No hay enlace a 'Entregar' (ver P-07)."

### 2.8 Entrega (si alguien llega a encontrarla)

**P-45. Un PIN bloqueado no tiene solución práctica** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/entrega/actions.ts:21`, `:55`
- Lo que vivo: "'PIN bloqueado. El destinatario debe contactar a soporte.' ¿Qué soporte? No puedo verificar con su cédula y la app no tiene canal de ayuda."
- Por qué confunde: el desbloqueo existe, pero escondido en Admin › Usuarios › detalle (`PanelCooperativas/src/components/admin/usuarios/usuario-actions.tsx:222`).

**P-46. Cobro en destino sin datos, en "$", y etiquetas que no distinguen** · Alta · `PanelCooperativas/src/components/entrega/entrega-modal.tsx:288`, `:301-309`, `PanelCooperativas/src/app/cooperativas/(panel)/entrega/page.tsx:186-188`
- Lo que vivo: "'Cobro pendiente: $3.50'. 'Registrar Pago Digital' aprueba sin pedir referencia ni banco. Las etiquetas 'Pagado Origen' y 'Cobro Destino' tienen el mismo color verde."

### 2.9 Viajes programados

**P-47. Los viajes que programo salen con otra hora en la app (probable)** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/viajes/actions.ts:51-52`, `:93`
- Lo que vivo (gerente): "Programé 'Lunes a viernes 07:00'. Los pasajeros ven salida a las 03:00 a. m."
- Por qué confunde: la fecha y hora se arman en el servidor sin zona horaria. Si el servidor corre en UTC (Vercel), las 07:00 quedan como 07:00 UTC.

**P-48. Programar viajes: abreviaturas confusas y sin edición** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/viajes/client.tsx:367`, `:302-311`
- Lo que vivo:
  - "Los días son 'L M Mi J V S D'. ¿'M' es martes o miércoles?"
  - "El chofer cambió y no puedo editar el viaje; solo cancelarlo y crear otro (lo que afecta a los boletos vendidos)."
  - "No hay forma de marcar un viaje como completado."

**P-49. Cancelar un viaje con pasajeros deja los reembolsos "a mano"** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/viajes/client.tsx:543-550`
- Lo que vivo: "'Deberás gestionar el reembolso o reprogramación manualmente.' ¿Cómo? No tengo la lista de pagos ni sé si se avisa a los pasajeros."

**P-50. Errores en ventanas nativas del navegador y con texto técnico** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/viajes/client.tsx:130-149`, `.../viajes/actions.ts:88`, `:113`
- Lo que vivo: "Me salen `alert()` grises del navegador con 'Error de base de datos: …'."

### 2.10 Rutas

**P-51. El precio del pasaje se pide en "$" y la app lo muestra en Bs** · Crítica · `PanelCooperativas/src/app/cooperativas/(panel)/rutas/client.tsx:283`, `:177`
- Es el mismo problema que M-11, visto desde el panel. Ver la tabla de la sección 5.

**P-52. Pedir la duración en minutos es incómodo** · Baja · `PanelCooperativas/src/app/cooperativas/(panel)/rutas/client.tsx:279-280`
- Lo que vivo: "'Duración (min)': tengo que calcular que 8 h son 480."

**P-53. Desactivar o editar una ruta usa `alert()` del navegador** · Baja · `PanelCooperativas/src/app/cooperativas/(panel)/rutas/client.tsx:73-128`

### 2.11 Empleados

**P-54. Invitar exige una sucursal, pero no dice que primero hay que crearla** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/empleados/client.tsx:121-130`
- Lo que vivo: "El desplegable 'Sucursal Asignada' está vacío y no puedo enviar el formulario. Nadie me dice que vaya a Configuración › Sucursales."

**P-55. Gestión de invitaciones incompleta** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/empleados/client.tsx:96-111`, `.../empleados/actions.ts:31-35`, `:42`
- Lo que vivo:
  - "'Genera un enlace mágico'. ¿Le llega por correo? No: tengo que copiarlo y mandarlo yo."
  - "No veo invitaciones pendientes. Si me equivoqué, me dice 'Ya hay una invitación activa' y no puedo reenviarla ni anularla."
  - "Solo puedo invitar taquilleros, no otro administrador."
  - "La lista no muestra la sucursal de cada empleado."

### 2.12 Configuración y hardware

**P-56. Métodos de pago: el formulario muestra todos los campos para cualquier tipo** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/tab-metodos-pago.tsx:194-221`, `EnBusApp/src/components/PaymentFlow.tsx:311-313`
- Lo que vivo: "Elijo 'Pago Móvil' y me pide 'Número de Cuenta' y 'Email Zelle'. ¿El teléfono va en número de cuenta? (Sí, y solo así la app lo muestra como 'Teléfono PM'.)"

**P-57. Borrar métodos de pago o sucursales no pide confirmación** · Alta · `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/tab-metodos-pago.tsx:156`, `:271`; `.../configuracion/tab-sucursales.tsx:127`, `:231`
- Lo que vivo: "Toqué el icono de papelera y mi cuenta de Banesco desapareció al instante."

**P-58. Acciones ocultas en la lista de métodos** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/tab-metodos-pago.tsx:258-263`
- Lo que vivo: "La etiqueta 'Activo' es en realidad un botón: al tocarla se desactiva. Editar y borrar son iconos sin texto."

**P-59. En sucursales, estado y ciudad son texto libre** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/tab-sucursales.tsx:167-168`
- En rutas son listas desplegables. Escribir "Edo. Carabobo" o "valencia" no casa con las rutas.

**P-60. Hardware: jerga técnica y solo accesible al administrador** · Media · `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/hardware/page.tsx` (secciones de impresora y escáner), `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/page.tsx:32-40`, `:91-96`
- Lo que vivo:
  - "'Compatible con ESC/POS', 'Input de prueba', 'Test de Impresión', 'Online/Offline', '(< 500ms)'."
  - "El enlace 'Hardware ↗' parece abrir otra web."
  - "Como taquillero no puedo emparejar la impresora de mi propia estación; tiene que venir el gerente."

**P-61. No puedo corregir el nombre de mi cooperativa** · Baja · `PanelCooperativas/src/app/cooperativas/(panel)/configuracion/tab-datos.tsx:125-131`
- Lo que vivo: "El nombre tiene un error tipográfico y 'Solo Super Admin' puede cambiarlo. No dice cómo pedírselo."

---

## 3. Super admin — `PanelCooperativas/src/app/admin`

**A-01. Rechazar una solicitud da de baja la cooperativa para siempre** · Alta · `PanelCooperativas/src/app/admin/(panel)/solicitudes/actions.ts:92-95`, `PanelCooperativas/src/components/admin/cooperativas/cooperativa-actions.tsx:320`
- Lo que vivo: "Rechacé porque el RIF tenía un error de tipeo. La cooperativa quedó 'Desactivada (Baja permanente)' y su RIF bloqueado. No puede corregir ni volver a registrarse."
- Por qué confunde: el diálogo de rechazo no advierte que es irreversible, al contrario que "Desactivar" en Cooperativas.

**A-02. En Solicitudes falta información para decidir** · Media · `PanelCooperativas/src/components/admin/solicitudes/solicitudes-table.tsx:52-57`
- Lo que vivo: "No veo el representante legal ni el 'Mensaje / Rutas de interés' que escribió en la landing. Tampoco sé si ya aceptó la invitación y tiene usuario."

**A-03. Aprobar o rechazar dice "éxito" aunque el correo no salga** · Media · `PanelCooperativas/src/app/admin/(panel)/solicitudes/actions.ts:52-54`, `:113-115`

**A-04. Dos lugares para lo mismo** · Baja · `PanelCooperativas/src/lib/admin-navigation.ts:8-9`, `PanelCooperativas/src/components/admin/cooperativas/cooperativas-table.tsx:82`
- Lo que vivo: "Las cooperativas pendientes aparecen en 'Solicitudes' y también en 'Cooperativas' con el filtro 'Pendiente'. ¿Dónde se aprueban?"

**A-05. Dashboard con abreviaturas, jerga y montos en $** · Media · `PanelCooperativas/src/app/admin/(panel)/dashboard/page.tsx:57-88`
- Lo que vivo: "'Solicitudes Reg.', 'Comisiones Est.', 'Alertas Amarillas' (¿qué es eso?), y 'Ingresos Brutos' en dólares sumando bolívares."

**A-06. Comisiones: tres palabras para "pagado"** · Media · `PanelCooperativas/src/components/admin/comisiones/ciclos-table.tsx:79`, `:294`, `PanelCooperativas/src/components/admin/comisiones/generar-ciclo-dialog.tsx:301`
- Lo que vivo: "'Marcar ciclo como solvente', 'liquidado exitosamente', 'Pagados', y un estado 'Listo'. ¿Son lo mismo?"

**A-07. Tarifas en USD, jerga y límites distintos** · Alta · `PanelCooperativas/src/components/admin/tarifas/create-tarifa-dialog.tsx:89`, `PanelCooperativas/src/components/admin/tarifas/tarifa-vigente-card.tsx:61-62`
- Lo que vivo: "Configuro 'Tarifa base por Kilogramo (USD)' y un 'Factor Distancia 0.0050 /min'. La app le muestra al cliente 'Costo estimado X Bs'."
- Por qué confunde: el límite de peso aquí es configurable, en la app es fijo (25 en el texto, 100 en la validación) y en la recepción es 25 fijo.

**A-08. Desbloquear el PIN está escondido** · Media · `PanelCooperativas/src/components/admin/usuarios/usuario-actions.tsx:222`, `:268`
- Lo que vivo: "Una taquilla me llama por un PIN bloqueado. Tengo que adivinar el usuario dueño de la encomienda, entrar a su detalle y buscar ahí. No hay búsqueda por número de guía."

**A-09. Las incidencias no reciben reportes de los usuarios** · Media · `PanelCooperativas/src/components/admin/incidencias/incidencias-table.tsx:114`, `:123-127`
- Existe el tipo "Reporte de Usuario", pero ni la app ni el panel de cooperativa tienen cómo crear uno. "Activar Seguro" no explica la cobertura de 3 veces el valor declarado.

**A-10. El login de admin muestra errores de OAuth crudos** · Baja · `PanelCooperativas/src/app/admin/login/login-client.tsx:81`

---

## 4. Landing pública — `LandingEnBus`

**L-01. El ejemplo de RIF que muestra la landing no pasa su propia validación** · Crítica · `LandingEnBus/app/registro-cooperativa/page.tsx:170-177`
- Lo que vivo: "El campo dice 'J-12345678-9' y el ejemplo repite 'J-12345678-9'. Escribo mi RIF así y el navegador me lo rechaza. El patrón exige J-12345678, sin el último guion."

**L-02. Si el correo de invitación falla, igual dice "revisa tu correo"** · Crítica · `LandingEnBus/app/registro-cooperativa/actions.ts:106-116`, `LandingEnBus/app/registro-cooperativa/page.tsx:31-41`
- Lo que vivo: "'¡Solicitud Registrada! Revisa tu bandeja…'. Nunca llega nada. Intento de nuevo y me dice 'Ya existe una cooperativa registrada con este RIF'. Quedé atrapado."

**L-03. La mitad de los botones no hacen nada** · Alta · `LandingEnBus/components/hero.tsx:49-63`, `LandingEnBus/components/navbar.tsx:81-83`, `:117-122`, `LandingEnBus/components/calculator-cta.tsx:20-23`, `LandingEnBus/components/popular-routes.tsx:51-53`
- Lo que vivo: "'Calcular costo de envío', 'Rastrear paquete', 'Calcular ahora' y 'Ver todas las rutas': los toco y nada."
- Por qué confunde: el enlace "Rastrear" lleva a `#rastrear`, que no existe en la página (`navbar.tsx:21`).

**L-04. No hay cómo empezar a usar el servicio** · Alta · `LandingEnBus/components/app-download.tsx:27`, `:57-59`, `:78-80`
- Lo que vivo: "Me convencieron, pero la app está 'Próximamente' en las dos tiendas, la calculadora no funciona y no hay rastreo web. ¿Qué hago hoy?"

**L-05. Contenido de relleno visible** · Media · `LandingEnBus/components/hero.tsx:69-71`, `LandingEnBus/components/app-download.tsx:87-89`, `LandingEnBus/components/footer.tsx:7-32`
- Lo que vivo: "Recuadros grises que dicen 'Imagen de servicio de envíos' y 'App Mockup'. Todos los enlaces del pie (Términos, Privacidad, Contacto, redes) llevan a '#'."

**L-06. Testimonios inventados presentados como reales** · Alta · `LandingEnBus/components/testimonials.tsx:5-24`
- Lo que vivo: "'María Rodríguez: envié más de 20 paquetes', y el servicio todavía no está disponible."
- Por qué confunde: genera desconfianza, y además es un riesgo legal y reputacional.

**L-07. Precios en USD que no coinciden con la app** · Media · `LandingEnBus/components/popular-routes.tsx:4-11`, `:39`
- Lo que vivo: "'Desde 15 USD' en la web; en la app el mismo número sale como Bs."

**L-08. La landing casi no habla de boletos y tiene faltas de ortografía** · Media · `LandingEnBus/app/layout.tsx:12-14`, `LandingEnBus/components/hero.tsx:33-44`, `LandingEnBus/components/how-it-works.tsx:3-25`, `LandingEnBus/components/footer.tsx:111`
- Lo que vivo:
  - "El título promete 'Envíos y Boletos', pero toda la página habla solo de paquetes. ¿Puedo comprar pasajes?"
  - "Faltan tildes: 'Envia', 'facil', 'Como Funciona', 'Por que EnBus'."
  - "El pie dice 'Una plataforma de Panas Cargo'. ¿Qué es Panas Cargo?"

---

## 5. Inconsistencias que atraviesan todo el ecosistema

| Concepto | App móvil | Panel cooperativa | Admin | Landing |
|---|---|---|---|---|
| Precio del pasaje | "15 Bs" (`buscar.tsx:508`) | Se ingresa "($)" (`rutas/client.tsx:283`); se ve como US$ (`rutas/client.tsx:177`) y como Bs.S en taquilla (`taquilla/boletos/page.tsx:171`) | US$ (`cooperativa-detail-tabs.tsx:29-33`) | "desde 15 USD" |
| Costo de encomienda | "Bs" (`nueva.tsx:516`) | "$" (`recepcion-modal.tsx:304`, `pago-modal.tsx:155`) | Tarifa en USD | — |
| Estados del boleto | Reservado / Confirmado / Viaje completado | RESERVADO / PAGADO / USADO | — | — |
| Estados de la encomienda | "Por entregar en taquilla", "Lista para retirar" | "Pendiente", "EN_OFICINA_DESTINO" (sin traducir) | ABIERTA/EN_PROCESO (incidencias) | — |
| Código del boleto | BOL-XXXXXXXX, QR "PASS-…" | BL-AAMMDD-XXXXX, QR aleatorio | — | — |
| Identificador de la encomienda | QR con UUID; "Tracking" | "Tracking ID" | "Tracking ID" | "Rastrear" |
| Encomiendas | Encomiendas / Paquetes / Enviar / Envío | Encomiendas | Encomiendas | Envíos / Paquetes |
| Quién paga | "Pago yo ahora / Paga quien recibe" | ORIGEN / DESTINO, "Pagado Origen / Cobro Destino" | — | — |
| Peso máximo | 25 kg (texto) / 100 kg (validación) | 25 kg | Configurable | — |
| Pagado (comisión) | — | "Comisiones Pendientes" | "solvente", "liquidado", "pagado", "Listo" | — |
| Registro de cooperativa | — | Cuenta inmediata con contraseña | — | Solicitud + correo con invitación |

Además, todas las superficies muestran mensajes técnicos crudos de Supabase o Postgres, a menudo en inglés: `login.tsx:105`, `taquilla/boletos/actions.ts:59`, `viajes/actions.ts:88`, `registro/actions.ts:106`, `recuperar-client.tsx:36`, entre otros.

---

## 6. Los 10 problemas más graves

1. **Moneda incoherente en todo el ecosistema (Crítica).** El precio se carga en "$" en el panel y la app lo cobra como "Bs"; el panel suma bolívares y los muestra como US$. Cobros, conversión BCV y reportes quedan mal. (`rutas/client.tsx:283`, `EnBusApp/app/boletos/buscar.tsx:508`, `PanelCooperativas/src/lib/utils.ts:49-51`)

2. **Compra de boletos que no se guarda (Crítica).** "Comprobante enviado" aparece antes de crear el boleto y el pago. Si sales, vuelves atrás o el asiento se ocupa, pierdes la compra después de haber pagado. Además, en iPhone no se puede escribir la fecha del pago (falta la "/"). (`PaymentFlow.tsx:194-206`, `:353-364`; `buscar.tsx:306-349`)

3. **Boleto pagado que pide "paga antes de que expire" y caduca a los 30 minutos (Crítica).** La taquilla no puede rechazar pagos falsos y el usuario no tiene canal de reclamo. (`boletos/[id].tsx:117-122`, `:333-349`; `taquilla/boletos/page.tsx:470-478`)

4. **La cadena "Cobro en destino" está rota (Crítica).** Esos paquetes nunca pasan a `PAGADA`, Despacho los rechaza, y el pago que hace el destinatario en la app (`PENDIENTE_VERIFICACION`) no tiene pantalla de verificación. (`taquilla/encomiendas/actions.ts:29-38`, `despacho/page.tsx:85-90`, `taquilla/encomiendas/page.tsx:95-103`)

5. **"Entrega de Encomiendas" no está en el menú (Crítica).** El último paso operativo no se puede descubrir. (`PanelCooperativas/src/lib/navigation.ts:7-62`)

6. **Despacho poco fiable (Crítica).** Escribe en una columna inexistente, `viaje_asignado_id` **(probable)**, acepta paquetes de otro destino y cierra la venta de boletos del viaje sin avisar. (`despacho/actions.ts:17-33`, `despacho/page.tsx:85-98`)

7. **La línea de tiempo muestra "Entregada" en paquetes pagados, cancelados o devueltos (Crítica).** Le da información falsa al remitente. (`encomiendas/enviar/[id].tsx:173-195`, `recibir/[id].tsx:111-128`)

8. **El destinatario nunca ve sus paquetes ni su PIN en la app (Crítica).** Nadie llena `receiver_user_id`. (`useEncomiendas.ts:54`, `nueva.tsx:265-280`)

9. **Las invitaciones a empleados generan enlaces inválidos, y la de la landing puede no llegar nunca (Crítica).** En los dos casos el RIF o el correo quedan bloqueados sin salida. (`empleados/actions.ts:57` vs `invite/[token]/actions.ts:24-31`; `LandingEnBus/app/registro-cooperativa/actions.ts:106-116`; RIF de ejemplo inválido en `page.tsx:170-177`)

10. **Fechas y horas desplazadas por zona horaria (Crítica/Alta).** Los viajes programados pueden mostrar horas equivocadas a los pasajeros (servidor en UTC, **probable**), y los filtros de fecha de Despacho y Taquilla muestran el día anterior. (`viajes/actions.ts:51-52`, `:93`; `despacho/page.tsx:34`, `:47-50`; `taquilla/boletos/page.tsx:90-99`)

**Siguen muy de cerca:** recuperar contraseña en la app no deja poner una clave nueva (M-01); el botón de Google no hace nada (M-02); falta un canal de ayuda en la app (M-52); un error de red se presenta como "boleto eliminado" o "sin salidas" (M-12, M-31); la foto obligatoria atrapa al taquillero sin cámara (P-35); el embarque no valida la fecha del viaje (P-19); la mitad de los botones de la landing no hacen nada (L-03).
