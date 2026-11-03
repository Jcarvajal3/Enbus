# Auditoría experta UX/UI — Ecosistema EnBus

Fecha: 02/10/2026 · Alcance: App móvil (Expo Router), Panel de cooperativas, Super admin y Landing · Método: revisión heurística del código fuente, sin ejecutar la app. Todas las rutas son relativas a `C:\Users\Javie\Documents\Dev\Panas Cargo`.

**Cómo leer cada propuesta:** Problema (archivo:línea) → Ley/principio → Propuesta → Impacto (Alto/Medio/Bajo) · Esfuerzo (S = horas, M = 1–3 días, L = más de 3 días).

**Contrastes medidos (WCAG 2.1, calculados sobre los tokens de `EnBusApp/src/theme.ts`).** Se usan como evidencia a lo largo del informe:

| Par de color (texto / fondo) | Ratio | AA texto normal (4.5) | AA texto grande / UI (3.0) |
|---|---|---|---|
| `primary` #FFC757 sobre blanco | **1.55:1** | No cumple | No cumple |
| `secondary` #FF7648 sobre blanco (o blanco sobre coral) | **2.65:1** | No cumple | No cumple |
| `success` #22c55e sobre blanco | 2.28:1 | No cumple | No cumple |
| `mutedForeground` #8A8A8A sobre blanco | 3.45:1 | No cumple | Cumple |
| `mutedForeground` sobre `surface` #F0EFEB | 3.00:1 | No cumple | Límite |
| Blanco sobre `accent` #4A7FF8 | 3.70:1 | No cumple | Cumple |
| Badge `pending` (#f59e0b sobre #fef3c7) | **1.93:1** | No cumple | No cumple |
| Badge `success` (#22c55e sobre #dcfce7) | **2.07:1** | No cumple | No cumple |
| Badge `progress` (#3b82f6 sobre #dbeafe) | 3.01:1 | No cumple | Límite |
| Badge `danger` (#dc2626 sobre #fee2e2) | 3.95:1 | No cumple | Cumple |
| `foreground` #202020 sobre amarillo | 10.52:1 | Cumple | Cumple |

---

# 1. App móvil (EnBusApp) — prioridad máxima

## Resumen de la superficie

El kit de UI (`src/components/ui`) es sólido: tokens centralizados, `estados.ts` como fuente única de etiquetas, `IconButton` con 44 pt, errores inline en `Field` y casi ningún hex suelto en las pantallas. Los problemas graves no son de estética. Se concentran en cinco cosas:

1. **Integridad del checkout.** El boleto se crea después de una pantalla que ya dice "Comprobante enviado".
2. **Estados que mienten.** Hay errores de red que se muestran como "sin resultados" y timelines que marcan "Entregada" cuando el paquete no se ha entregado.
3. **Contraste.** El amarillo de marca se usa para texto crítico: monto, asiento y PIN.
4. **Formatos venezolanos.** La fecha no se puede escribir con el teclado numérico, y cédula y teléfono no tienen máscara.
5. **Navegación Android.** No se intercepta el back, así que los wizards pierden su estado.

## 1.1 Arranque, sesión y conectividad

**APP-01 — Detección offline sólo al iniciar o volver del background**
- Problema: `isOffline` se activa sólo cuando `getSession()` vence o falla (`EnBusApp/src/contexts/AuthContext.tsx:78-98`) o al volver a primer plano (`:112-128`). No hay `NetInfo`. Si la conexión cae mientras el usuario está en el checkout, nada se lo indica. Además, si la app arranca sin red y sin sesión restaurada, `_layout.tsx:90-91` lo manda al login: el pasajero no puede abrir el boleto que tiene en caché.
- Principio: Nielsen #1 (Visibilidad del estado del sistema); Nielsen #9 (Ayudar a reconocer y recuperarse de errores); contexto de conectividad irregular.
- Propuesta: suscribirse a `@react-native-community/netinfo` y exponer `isOffline` en tiempo real. Si no hay red y existe caché, entrar en modo "solo lectura" con acceso a "Mis boletos" (los QR ya están cacheados en `boletos/[id].tsx:66-73`). El banner debería decir: "Sin conexión. Puedes ver tus boletos guardados; las compras se reanudarán al reconectar." y llevar un botón "Reintentar".
- Impacto: Alto · Esfuerzo: M

**APP-02 — El banner offline empuja el Stack y duplica el inset superior**
- Problema: `OfflineBanner` se renderiza fuera del `Stack` con `paddingTop: insets.top` (`app/_layout.tsx:56-69,101`), y cada pantalla vuelve a aplicar `SafeAreaView edges={['top']}` (`src/components/ui/Screen.tsx:33`). El resultado es un hueco doble arriba y el header desplazado. El banner tampoco tiene acción.
- Principio: Ley de Prägnanz / consistencia (Nielsen #4); safe areas en móvil.
- Propuesta: renderizarlo como overlay absoluto sobre el header (o como franja dentro de `Screen`) y que ocupe sólo el alto de la barra de estado más 28 pt. Añadir "Reintentar" a la derecha.
- Impacto: Medio · Esfuerzo: S

**APP-03 — Splash "EB" en amarillo sobre amarillo claro**
- Problema: `app/_layout.tsx:48` pinta "EB" con `color="primary"` sobre `primaryLight`, con un contraste aproximado de 1.4:1. Lo mismo ocurre en el logo del login (`app/(auth)/login.tsx:148`) y en el del home (`app/(tabs)/index.tsx:79`).
- Principio: WCAG 1.4.11 (Contraste de elementos no textuales); Aesthetic-usability (la marca se percibe "lavada").
- Propuesta: usar el isotipo real en SVG, o "EB" en `foreground` (#202020) sobre amarillo sólido (10.5:1).
- Impacto: Bajo · Esfuerzo: S

## 1.2 Autenticación (login, registro, recuperar)

**APP-04 — Errores de Supabase sin traducir mostrados al usuario**
- Problema: `login.tsx:105-106` muestra `err.message` tal cual ("Invalid login credentials", "User already registered", "Email not confirmed"). Lo mismo pasa en `recuperar.tsx:38-41`, `PaymentFlow.tsx:208-211`, `buscar.tsx:345-347`, `boletos/[id].tsx:208-210,252-254`, `nueva.tsx:295-298` y `perfil.tsx:128-131`.
- Principio: Nielsen #9 (mensajes en lenguaje del usuario, que indiquen la solución); Nielsen #2 (Coincidencia con el mundo real).
- Propuesta: crear `src/utils/errores.ts` con `humanizeError(err, contexto)` que traduzca los códigos conocidos y dé un genérico accionable. Copys sugeridos:
  - "Correo o contraseña incorrectos. Revisa los datos o recupera tu contraseña."
  - "Ya existe una cuenta con este correo. Inicia sesión."
  - "Confirma tu correo: te enviamos un enlace a {email}."
  - Red: "No pudimos conectarnos. Revisa tu conexión e intenta de nuevo."
  - Nunca mostrar texto técnico.
- Impacto: Alto · Esfuerzo: S

**APP-05 — Registro largo, sin máscaras ni validación de formato venezolano**
- Problema: el registro pide 6 campos de golpe (`login.tsx:179-241`). Cédula y teléfono sólo se validan como "no vacíos" (`:55-56`). Hay utilidades en `src/utils/validation.ts:26-41`, pero no se usan aquí y sus reglas son laxas (teléfono de 7 a 11 dígitos, cédula de 4 a 12 caracteres alfanuméricos). Tampoco hay `returnKeyType`/`onSubmitEditing` en ningún campo de la app (grep sin resultados): el usuario tiene que cerrar el teclado y tocar el siguiente campo.
- Principio: Ley de Miller / carga cognitiva; Ley de Tesler (la complejidad del formato debe absorberla el sistema); Postel (ser liberal con lo que se acepta); Nielsen #5 (Prevención de errores).
- Propuesta:
  1. Registro en dos tiempos: "Correo + contraseña" para crear la cuenta, y nombre, cédula y teléfono pedidos al primer checkout (progressive disclosure), prellenados después.
  2. Componentes `CedulaField` (selector V/E/J/P + numérico, que muestra "V-12.345.678") y `TelefonoField` (selector de operadora 0412/0414/0424/0416/0426/0422 + 7 dígitos, que muestra "0414-123.45.67"). Ambos deben aceptar cualquier pegado ("+58 414 1234567", "v12345678") y normalizar.
  3. `returnKeyType="next"` con foco encadenado y `"go"` en el último campo.
  4. `autoComplete="password"`/`"new-password"` en contraseñas.
- Impacto: Alto · Esfuerzo: M

**APP-06 — "Recuperar contraseña" termina en un callejón sin salida**
- Problema: el enlace del correo redirige a `Linking.createURL('recuperar')` (`recuperar.tsx:30-32`), que es la misma pantalla que pide el email. No existe pantalla para "definir nueva contraseña". Además, el feedback es un toast seguido de `router.back()` inmediato (`:35-36`): el usuario no ve con calma a qué correo se envió.
- Principio: Nielsen #3 (Control y libertad); Nielsen #1; Peak-end rule (la recuperación es un momento de estrés).
- Propuesta: crear la ruta `(auth)/restablecer` que maneje el evento `PASSWORD_RECOVERY` y muestre "Nueva contraseña + Confirmar". Sustituir el toast por un estado de éxito persistente: "Revisa tu correo. Enviamos un enlace a j•••@gmail.com. Puede tardar unos minutos y llegar a Spam." con los botones "Abrir correo", "Reenviar (en 60 s)" y "Volver a iniciar sesión". Prellenar el email desde el login.
- Impacto: Alto · Esfuerzo: M

**APP-07 — Propuesta de valor débil y CTA social ambiguo**
- Problema: el tagline "Rastreo y compra de boletos" (`login.tsx:158-160`) omite las encomiendas. El botón dice sólo "Google" (`:278`). El toast "Sesión iniciada con éxito" (`:82`) es ruido, porque la navegación ya confirma.
- Principio: Ley de Jakob (el patrón conocido es "Continuar con Google"); Nielsen #8 (Diseño estético y minimalista).
- Propuesta: tagline "Boletos de autobús y encomiendas entre ciudades, desde tu teléfono". Botón "Continuar con Google". Eliminar el toast de éxito del login.
- Impacto: Bajo · Esfuerzo: S

## 1.3 Navegación global e IA

**APP-08 — El gesto o botón "atrás" de Android rompe los wizards**
- Problema: no hay `BackHandler`, `beforeRemove` ni `usePreventRemove` en todo el proyecto (grep sin coincidencias). En `boletos/buscar.tsx:351-354` y `encomiendas/nueva.tsx:331` el paso anterior sólo se maneja desde la flecha del header. El back físico o el gesto cierran la pantalla completa y se pierde el formulario: en `nueva.tsx` son 9 campos y una foto.
- Principio: Ley de Jakob (en Android, "atrás" retrocede un paso); Nielsen #3 (Control y libertad); Nielsen #5.
- Propuesta: hook `useWizardBack(step, setStep, isDirty)` que en el paso >1 retroceda un paso. En el paso 1 con datos, mostrar una confirmación: "¿Salir sin terminar? Perderás los datos del envío." con "Seguir editando" (primario) y "Salir". Opcional: guardar un borrador en AsyncStorage y ofrecer "Retomar envío pendiente" en Encomiendas (efecto Zeigarnik).
- Impacto: Alto · Esfuerzo: S

**APP-09 — Perfil y notificaciones sólo se alcanzan desde Inicio**
- Problema: la campana y el avatar viven en el header de Home (`app/(tabs)/index.tsx:88-101`). "Mis Viajes" (`boletos.tsx:137`) y "Mis Paquetes" (`encomiendas.tsx:123-126`) usan `ScreenHeader` sin `right`. El spec exige "Header Actions (siempre visibles)" (`Specs/02_App_Movil/Navigation_Spec.md`, sección 1 y 3).
- Principio: Nielsen #4 (Consistencia); Ley de Jakob; Ley de Fitts (el usuario tiene que cambiar de tab para llegar).
- Propuesta: pasar `right={<HeaderActions/>}` (campana con badge + avatar con inicial) en los tres tabs mediante un componente compartido.
- Impacto: Medio · Esfuerzo: S

**APP-10 — Vocabulario inconsistente para el mismo concepto**
- Problema:
  - Tab "Boletos" (`(tabs)/_layout.tsx:145`) → título "Mis Viajes" (`boletos.tsx:137`) → tile "Boletos activos" (`index.tsx:172`) → toggle "Viajar" (`SearchForm.tsx:167`) → CTA "Buscar Boletos" (`SearchForm.tsx:249`) / "Buscar Viaje" (`boletos.tsx:191`) → detalle "Pase de abordaje" (`boletos/[id].tsx:322`).
  - Tab "Encomiendas" → título "Mis Paquetes" (`encomiendas.tsx:124`) → tile "Paquetes en camino" (`index.tsx:181`) → toggle "Enviar" → CTA "Registrar Envío" (`SearchForm.tsx:249`) / "Crear Nuevo Envío" (`encomiendas.tsx:189`).
- Principio: Nielsen #4 (Consistencia y estándares); Ley de Prägnanz; Gestalt de similitud.
- Propuesta: definir un glosario (ver sección 5) y aplicarlo. Tab "Boletos" / título "Mis boletos" / CTA "Buscar viaje". Tab "Encomiendas" / título "Mis encomiendas" / CTA "Enviar encomienda". El toggle de Home quedaría "Viajar | Enviar encomienda".
- Impacto: Medio · Esfuerzo: S

**APP-11 — Ruta huérfana que duplica el checkout**
- Problema: `app/viajes/[id].tsx` (300 líneas) reimplementa selección de asientos y pago en 2 pasos, con realtime de asientos (`:100-124`), pero ninguna pantalla navega a ella (grep de `/viajes/` sin resultados). El checkout real de `buscar.tsx` tiene 3 pasos y no tiene realtime. También se duplican `generateBoletoCode` (`buscar.tsx:52`, `viajes/[id].tsx:34`) y `CompactLocation` (`buscar.tsx:689`, `nueva.tsx:674`).
- Principio: consistencia (Nielsen #4); deuda del design system (dos comportamientos para la misma tarea).
- Propuesta: extraer un `CheckoutBoleto` único (asientos con realtime → pago → creación atómica) y usarlo desde `buscar`. `viajes/[id]` quedaría como deep link que reutiliza ese flujo, o se elimina.
- Impacto: Medio · Esfuerzo: M

## 1.4 Inicio (Home) y formulario de búsqueda

**APP-12 — El formulario se bloquea en silencio si falla la carga de fechas**
- Problema: en `SearchForm.tsx:123-125` el error se traga. `activeDates` queda en `null`, `calendarEnabled` en `false` (`:139`) y `canSubmit` en `false` (`:148`). El botón "Buscar Boletos" queda deshabilitado sin explicación y el selector muestra una fecha que no se puede tocar. Con red inestable, el flujo principal del producto queda bloqueado.
- Principio: Nielsen #9; Nielsen #1; error recovery por encima de bloqueo; Postel.
- Propuesta: si la consulta de fechas falla, no bloquear. Habilitar el calendario sin restricción de días y permitir la búsqueda; los resultados resuelven la disponibilidad. Mostrar una ayuda inline: "No pudimos verificar las fechas disponibles. Puedes buscar igual." con "Reintentar".
- Impacto: Alto · Esfuerzo: S

**APP-13 — La fecha cambia sola sin avisar y el CTA deshabilitado no explica por qué**
- Problema: `SearchForm.tsx:118-122` salta la fecha al primer día con viajes sin decir nada. Con "Sin viajes en esta ruta" (`:144`) el CTA queda deshabilitado (`:246`) y no hay salida (ni rutas alternativas ni aviso).
- Principio: Nielsen #1; Nielsen #3; DESIGN.md regla 5 ("Un callejón sin salida no es un estado vacío aceptable").
- Propuesta:
  - Al ajustar la fecha, mostrar una ayuda bajo el selector: "Próxima salida disponible: vie. 9 oct." con resaltado breve.
  - Para rutas sin viajes: "No hay salidas programadas de Caracas a Mérida." con "Cambiar destino" y "Avisarme cuando haya salidas" (suscripción a alerta).
  - Un CTA deshabilitado siempre debe ir con un texto que diga qué falta ("Elige origen y destino").
- Impacto: Medio · Esfuerzo: S

**APP-14 — Origen y destino lado a lado truncan ciudades y el swap es diminuto**
- Problema: dos pills de media anchura con `numberOfLines={1}` (`SearchForm.tsx:175-210, 291-297`) truncan "San Juan de los Morros" o "Puerto La Cruz". El botón de intercambio mide 34 pt (`:342-343`). En `buscar.tsx:737` y `nueva.tsx:749`, los `CompactLocation` miden 38 pt (`Sizes.control.sm`).
- Principio: Ley de Fitts (objetivo de al menos 44–48 pt); Ley de Jakob (las apps de bus y avión apilan Origen sobre Destino con el swap a la derecha); WCAG 2.5.5.
- Propuesta: apilar verticalmente "Desde" y "Hacia" (pills de 56–60 pt a ancho completo) con el swap de 44 pt anclado a la derecha entre ambos. Llevar `CompactLocation` a `Sizes.control.md` (44) como mínimo.
- Impacto: Medio · Esfuerzo: S

**APP-15 — El selector de localidad obliga a dos niveles y no recuerda nada**
- Problema: `LocationSelector.tsx:142-205` agrupa por estado en acordeones cerrados. Sin escribir, elegir una ciudad cuesta abrir hoja → expandir estado → elegir ciudad. El campo de búsqueda no tiene `autoFocus` (`:105-114`). No hay recientes ni populares, y nada impide elegir la misma ciudad como origen y destino (`SearchForm.tsx` no lo valida).
- Principio: Ley de Hick (24 estados y más de 50 ciudades); efecto de posición serial (lo frecuente arriba); Nielsen #7 (Flexibilidad y eficiencia); Nielsen #5.
- Propuesta: al abrir, foco automático en la búsqueda; secciones "Recientes" (últimas 3 búsquedas en AsyncStorage) y "Populares" (Caracas, Valencia, Maracaibo, Barquisimeto, Mérida…) antes del índice por estados; deshabilitar en destino la ciudad elegida como origen, con la ayuda "Ya es tu origen".
- Impacto: Medio · Esfuerzo: M

**APP-16 — El Home no muestra el próximo viaje**
- Problema: las tiles de actividad sólo muestran conteos (`index.tsx:164-188`). El pasajero que viaja hoy necesita su QR en un toque, y ahora son tres (tab → lista → boleto). Además, "Paquetes en camino" cuenta paquetes que todavía no se han entregado en taquilla (`ActivityContext` usa `isEncomiendaActiva`).
- Principio: Ley de Fitts y zona del pulgar; efecto Zeigarnik (tareas en curso visibles); posición serial (lo urgente primero).
- Propuesta: si hay un boleto `PAGADO` con salida en menos de 48 h, mostrar sobre el buscador una tarjeta "Tu próximo viaje · Hoy 8:30 p. m. · Caracas → Mérida · Asiento 14" con el botón "Ver pase de abordaje". Renombrar la tile a "Encomiendas activas".
- Impacto: Alto · Esfuerzo: M

**APP-17 — El hero decorativo empuja el CTA principal**
- Problema: `HERO_SPACER = 96` (`index.tsx:254, 310-318`) reserva 96 pt de "ola" entre el título y el formulario, con un margen negativo para compensar el subtítulo.
- Principio: Aesthetic-usability vs. eficiencia; Ley de Fitts (el CTA queda más lejos de la zona del pulgar en pantallas de 640 dp).
- Propuesta: reducir el espaciador a 24–32 pt o poner la ilustración detrás del título. Priorizar que "Buscar viaje" quede por encima del pliegue en pantallas de 360×640.
- Impacto: Bajo · Esfuerzo: S

**APP-18 — El calendario no ofrece atajos y siempre exige confirmar**
- Problema: `CalendarModal.tsx` obliga a elegir el día y luego tocar "Confirmar fecha" (`:203-213`). No hay chips "Hoy / Mañana" y se puede navegar a meses pasados (`:94-100` no tiene límite inferior). Los días con salidas no se distinguen positivamente: sólo se atenúan los que no tienen.
- Principio: Ley de Hick; Nielsen #7 (aceleradores); Von Restorff (destacar los días con salida).
- Propuesta: tira horizontal de 7 días con disponibilidad bajo el selector de fecha ("Hoy · Mañana · Sáb 4 …", con un punto en los días con salida), calendario completo sólo como "Más fechas", selección con un toque que cierra el modal, y deshabilitar "Mes anterior" en el mes actual.
- Impacto: Medio · Esfuerzo: M

## 1.5 Compra de boletos: resultados → asiento → pago → boleto

**APP-19 — Un error de red se muestra como "Sin salidas ese día"**
- Problema: `buscar.tsx:250-252` traga el error. `viajes` queda vacío y se muestra el EmptyState "Sin salidas ese día… Prueba con otro día" (`:459-470`). Lo mismo pasa con los asientos ocupados (`:274-277`): si fallan, se muestran todos libres.
- Principio: Nielsen #9; Nielsen #1. Es un estado que miente, y el usuario cambia de fecha en vano.
- Propuesta: añadir el estado `error` con un EmptyState propio: "No pudimos cargar las salidas. Revisa tu conexión." con el botón "Reintentar". Para asientos: "No pudimos actualizar los asientos ocupados" + "Reintentar", y bloquear "Continuar al pago" hasta tener datos.
- Impacto: Alto · Esfuerzo: S

**APP-20 — Las tarjetas de resultado omiten datos de decisión y el precio no tiene formato**
- Problema: `buscar.tsx:488-516` muestra cooperativa, "hora · duración", rating, `${viaje.precio} Bs` (sin separadores de miles ni decimales) y "N libres". Faltan la hora de llegada y el equivalente en USD (el usuario venezolano decide en dólares, y `useTasaBCV` ya existe). La urgencia por pocos asientos no se destaca. La pill con la inicial de la cooperativa (`EntityCard.tsx:108-112`) ocupa 52×80 pt sin aportar información.
- Principio: Ley de Miller (comparar sin memorizar); Von Restorff; Nielsen #2; Prägnanz.
- Propuesta: fila "8:30 p. m. → 6:15 a. m. (+1) · 9h 45m"; precio "Bs 1.250,00" con "≈ $ 12,40" debajo (tasa BCV); badge `danger` "Quedan 3" cuando haya 5 o menos; reemplazar la pill de la inicial por el logo de la cooperativa o eliminarla.
- Impacto: Alto · Esfuerzo: S

**APP-21 — Elegir salida cuesta dos toques y el orden queda escondido**
- Problema: primero se selecciona la tarjeta (`buscar.tsx:491`) y después hay que tocar "Continuar con X" en la barra flotante (`:578-592`). Ordenar por precio requiere abrir una hoja de "Filtrar" (`:603-640`).
- Principio: Ley de Hick y de Fitts (el CTA está lejos de la tarjeta); progressive disclosure inverso (lo frecuente no debe esconderse).
- Propuesta: tocar la tarjeta lleva directo a asientos, y la tarjeta muestra un chevron. Chips de orden en línea sobre la lista ("Más temprano · Más barato") y la hoja sólo para el filtro de cooperativa.
- Impacto: Medio · Esfuerzo: S

**APP-22 — No hay retención de asiento: el conflicto aparece después de pagar**
- Problema: los ocupados se consultan una vez al seleccionar el viaje (`buscar.tsx:264-284`), sin realtime. Los boletos se insertan en `handlePaymentSuccess` (`:306-349`), es decir, después de que el usuario ya hizo el Pago Móvil. Si otro pasajero tomó el asiento, el usuario ve "No se pudo generar el boleto: duplicate key…" (`:345-347`) con el dinero ya transferido. `SeatSelector.tsx:109-112` "suelta en silencio" los asientos tomados por otros.
- Principio: Nielsen #5 (Prevención de errores); Peak-end rule (es el peor final posible); Doherty (feedback realtime).
- Propuesta:
  1. Crear la reserva (`RESERVADO`, con `reserva_expira_at`) al confirmar asientos, antes de mostrar los datos de pago.
  2. Mostrar un temporizador persistente en el header de pago ("Asientos 14 y 15 reservados por 14:59") para dar urgencia legible (Goal-gradient).
  3. Suscribirse a realtime de asientos como hace `viajes/[id].tsx:100-124`.
  4. Si un asiento elegido se ocupa, avisar: "El asiento 14 acaba de ser tomado. Elige otro." en lugar de quitarlo en silencio.
- Impacto: Alto · Esfuerzo: L

**APP-23 — "Comprobante enviado" se muestra antes de crear el boleto (riesgo de pérdida de compra)**
- Problema: en el checkout de boletos `PaymentFlow` no inserta el pago (`PaymentFlow.tsx:194-204`, porque aún no hay `boleto_ids`). Pasa a `step === 'enviado'` y muestra un check verde, "Comprobante enviado… Tu reserva se confirma en cuanto un taquillero lo valide." (`:226-240`) y un botón "Continuar" (`:263-266`). El boleto y el pago sólo se crean al tocar "Continuar" (`buscar.tsx:306-343`). Si el usuario cierra la app o vuelve atrás tras ver el check, no existe ni boleto ni pago. Además, si el insert del pago falla, se ignora en silencio (`buscar.tsx:334-341`, sólo `console.error` en dev): queda un boleto sin comprobante que la cooperativa no puede verificar.
- Principio: Nielsen #1 (el estado mostrado no coincide con el real); Peak-end rule; Nielsen #5; Doherty (no hay confirmación real).
- Propuesta: "Registrar pago" debe ejecutar en una sola operación (idealmente una RPC/Edge Function transaccional) la reserva del asiento, la creación del boleto y la inserción del pago. Sólo si todo tiene éxito se navega directo al boleto con un estado de éxito real ("¡Listo! Tu pago está en verificación"). Eliminar el paso intermedio "Continuar". Si el pago falla, mantener al usuario en el formulario con los datos intactos y el mensaje "No pudimos registrar tu pago. Tus datos siguen aquí; intenta de nuevo."
- Impacto: Alto · Esfuerzo: M

**APP-24 — El monto a pagar es casi ilegible (amarillo sobre amarillo)**
- Problema: `PaymentFlow.tsx:501` pinta el monto (`display` de 30 pt) con `color="primary"` (#FFC757) sobre `primaryLight` (amarillo al 15 % sobre blanco). El contraste es de ≈1.5:1 en el dato más importante del checkout.
- Principio: WCAG 1.4.3 (incluso texto grande exige 3:1); Von Restorff (destacar sí, pero legible); confianza en el pago.
- Propuesta: monto en `foreground` (#202020) de peso heavy sobre fondo amarillo claro, o texto oscuro sobre un bloque amarillo sólido (10.5:1). Regla del sistema: `primary` nunca como color de texto (ver DS-01).
- Impacto: Alto · Esfuerzo: S

**APP-25 — No se pueden copiar los datos bancarios y el número de cuenta se trunca**
- Problema: `AccountRow` (`PaymentFlow.tsx:540-551`) usa `numberOfLines={1}` (una cuenta de 20 dígitos se corta) y no tiene acción de copiar (no hay `expo-clipboard` en el proyecto). Para hacer un Pago Móvil, el usuario tiene que memorizar teléfono, cédula y banco y cambiar de app.
- Principio: Ley de Miller / carga de memoria; Nielsen #6 (Reconocer antes que recordar); Nielsen #7.
- Propuesta: botón "Copiar" de 44 pt en cada fila, con feedback "Copiado" (<400 ms, Doherty). Para Pago Móvil, un botón "Copiar todo" que genere "Banco: 0102 Banco de Venezuela · Tel: 0414-1234567 · C.I.: V-12345678 · Monto: 1.250,00". Mostrar el código del banco y permitir dos líneas en el valor.
- Impacto: Alto · Esfuerzo: S

**APP-26 — La fecha de la transacción no se puede escribir con el teclado que se muestra**
- Problema: `PaymentFlow.tsx:353-364` exige "DD/MM/AAAA" (regex en `:138`) pero abre `keyboardType="number-pad"`, que en Android no tiene "/". El usuario no puede cumplir el formato y recibe "Usa el formato DD/MM/AAAA".
- Principio: Nielsen #5; Postel (aceptar "02102026", "2/10/26"…); Ley de Tesler.
- Propuesta: reemplazar el campo por chips "Hoy" (por defecto) · "Ayer" · "Otra fecha" (que abre `CalendarModal`), o al menos aplicar una máscara automática que inserte las barras. Copy: "¿Cuándo hiciste el pago?".
- Impacto: Alto · Esfuerzo: S

**APP-27 — Lista de bancos con duplicados, sin búsqueda y mezclada con métodos**
- Problema: `BANCOS_VE` (`PaymentFlow.tsx:31-39`) incluye "BNC" y "Banco Nacional de Crédito (BNC)", "BOD" (ya fusionado con BNC) y "Zelle"/"PayPal" como si fueran bancos. No tiene buscador ni código bancario. "Otras" está en medio de la lista.
- Principio: Ley de Hick; Nielsen #2; posición serial (los más usados primero).
- Propuesta: lista canónica SUDEBAN con código ("0102 · Banco de Venezuela", "0134 · Banesco", "0105 · Mercantil", "0108 · Provincial", "0191 · BNC"…), los 5 más usados arriba, buscador y "Otro banco" al final. Quitar Zelle y PayPal.
- Impacto: Medio · Esfuerzo: S

**APP-28 — El USD sólo aparece en Zelle y la tasa no tiene fecha**
- Problema: `AmountBadge` muestra el USD sólo cuando `isZelle` (`PaymentFlow.tsx:299`). En el paso de métodos no hay referencia en dólares. La tasa no indica de qué día es (`:517`) y la caché es sólo en memoria (`useTasaBCV.ts:18-19`), así que offline desaparece. En Zelle, el monto grande sigue en Bs y el USD queda en segundo plano.
- Principio: Nielsen #2 (los venezolanos razonan en USD); Nielsen #1; jerarquía visual.
- Propuesta: mostrar siempre "Bs 1.250,00 · ≈ $ 12,40". Pie: "Tasa BCV del 02/10/2026: 100,80 Bs/$". En Zelle, invertir la jerarquía (USD grande, Bs secundario). Persistir la última tasa en AsyncStorage con su fecha.
- Impacto: Medio · Esfuerzo: S

**APP-29 — Dos "atrás" y un indicador de progreso que engaña**
- Problema: en el paso 3 del wizard, el header dice "03 / 03" (`buscar.tsx:361-368`), pero dentro de `PaymentFlow` hay tres sub-pasos más (métodos → formulario → enviado → "Continuar"), con su propio enlace "Volver a métodos" en `caption` de unos 30 pt (`PaymentFlow.tsx:278-289`). El botón de pago es amarillo (`variant="primary"`, `:378-386`), mientras que el resto de CTAs del flujo son azules (`accent`).
- Principio: Goal-gradient (el progreso debe reflejar lo que falta de verdad); Nielsen #4; Ley de Fitts; Von Restorff (el CTA principal debe tener siempre el mismo color).
- Propuesta: modelar el checkout como "Viaje → Asientos → Pago → Confirmación" (4 pasos visibles). El método de pago debe ser un selector en la misma pantalla (radio cards) y no una sub-navegación. Que el back del header gobierne todo. CTA final en `accent`: "Registrar pago de Bs 1.250,00".
- Impacto: Medio · Esfuerzo: M

**APP-30 — "Efectivo en taquilla" aparece aunque la cooperativa no lo acepte**
- Problema: si no hay métodos o falla la consulta, se inyecta efectivo como fallback (`PaymentFlow.tsx:113-130`) sin avisar del error.
- Principio: Nielsen #1; Nielsen #9.
- Propuesta: diferenciar "error al cargar métodos" ("No pudimos cargar las formas de pago" + "Reintentar") de "cooperativa sin métodos digitales" ("Esta cooperativa sólo acepta pago en taquilla").
- Impacto: Medio · Esfuerzo: S

**APP-31 — Mensajes contradictorios sobre el estado `RESERVADO`**
- Problema: tras pagar, el boleto muestra cuatro mensajes distintos para el mismo estado:
  - Badge "Reservado" (`estados.ts:25`).
  - Banner "Pendiente de pago — Paga antes de que expire el tiempo" con cuenta regresiva (`boletos/[id].tsx:333-349`).
  - Bloque del QR "Pago en verificación" (`:419-427`).
  - Hint "Pendiente de que la cooperativa verifique tu pago" (`estados.ts:27`).
  
  El usuario que ya pagó lee que debe pagar. El cliente marca `EXPIRADO` localmente al llegar a 00:00 (`:119-121`) aunque haya un comprobante pendiente.
- Principio: Nielsen #2 y #4; Nielsen #1; ansiedad en el peak-end.
- Propuesta: distinguir `RESERVADO` sin pago ("Reserva pendiente de pago · expira en 14:59") de `RESERVADO` con pago registrado ("Pago en verificación · Te avisaremos cuando la cooperativa lo confirme (normalmente en menos de 30 min)"), sin cuenta regresiva amenazante. No forzar `EXPIRADO` en el cliente: esperar al servidor.
- Impacto: Alto · Esfuerzo: M

**APP-32 — El número de asiento está en amarillo sobre blanco y la hora de salida es secundaria**
- Problema: `TicketField highlight` pinta el asiento con `color="primary"` (`boletos/[id].tsx:603-606`), con un contraste de 1.55:1. La hora de salida va como `caption` gris bajo la fecha (`:394-398`).
- Principio: WCAG 1.4.3; jerarquía visual (lo que mira el pasajero en el andén es la hora, el asiento y el QR).
- Propuesta: asiento en `foreground` heavy de 30 pt. Bloque superior con "Sale: vie. 2 oct · 8:30 p. m." en `heading`. Añadir el terminal o la dirección de embarque si existe el dato.
- Impacto: Alto · Esfuerzo: S

**APP-33 — El QR de abordaje no sube el brillo y su leyenda no sirve en taquilla**
- Problema: `QRCodeViewer` no implementa `autoMaxBrightness` (la prop ni siquiera se desestructura, `QRCodeViewer.tsx:21`), y el boleto pasa además `autoMaxBrightness={false}` (`boletos/[id].tsx:416`). El QR mide 160 pt. La leyenda muestra el payload crudo (`:44-46`): "PASS-BOL-…" en el boleto, y el UUID de 36 caracteres en la encomienda (`encomiendas/enviar/[id].tsx:251`). Si el lector de la taquilla falla, el taquillero no puede dictar ni teclear un UUID.
- Principio: contexto de uso (andén con sol, pantallas de gama media); Nielsen #9 (recuperación manual); Postel.
- Propuesta: implementar `expo-brightness` al mostrar el QR. Botón "Mostrar QR en pantalla completa" (QR de 280 pt o más). Leyenda con el código corto legible ("BOL-7KQ2 M9XA" agrupado de 4 en 4 / tracking "ENC-…"), igual al que el panel acepta en su `ScanInput`.
- Impacto: Alto · Esfuerzo: S

**APP-34 — Una compra de varios asientos sólo lleva al primer boleto**
- Problema: `buscar.tsx:343` navega a `boletos[0]` aunque se hayan comprado N asientos.
- Principio: Nielsen #1; Peak-end.
- Propuesta: pantalla de confirmación de compra con la lista de N pases ("2 boletos · Asientos 14 y 15") o un boleto con paginación horizontal de pases.
- Impacto: Medio · Esfuerzo: S

**APP-35 — "Solicitar cancelación" cancela de inmediato y el reembolso se calcula en el cliente**
- Problema: el botón dice "Solicitar cancelación (95% reembolso)" (`boletos/[id].tsx:450`), pero `handleCancelPagado` escribe `CANCELADO` al instante (`:231-238`) y calcula el reembolso en la app (`:230`). La reserva se cancela con `Alert` nativo (`:187-217`) y el boleto pagado con `BottomSheet`: dos patrones para la misma acción.
- Principio: Nielsen #2 (lo que dice el botón tiene que ser lo que pasa); Nielsen #4; prevención de errores.
- Propuesta: usar el mismo `BottomSheet` de confirmación en ambos casos. Copy exacto según la política: "Cancelar boleto · Recibirás Bs 1.187,50 (95%) en 1–2 días hábiles al mismo medio de pago." Si la cancelación requiere aprobación, el estado debería ser "Cancelación solicitada" y no `CANCELADO`.
- Impacto: Medio · Esfuerzo: M

**APP-36 — Lista "Mis Viajes": el subtítulo es la fecha de compra, no la de viaje**
- Problema: `boletos.tsx:98` usa `formatDate(item.created_at)`. La lista se ordena por `created_at` (`useRealtime.ts:96`), no por fecha de salida. La pill con la letra "B/E/R" (`TransactionCard.tsx:17-21`) no se entiende, y "R" usa el tono `success`, que se confunde con un estado.
- Principio: Nielsen #2; posición serial (el próximo viaje arriba); Gestalt de similitud (el color de tipo se confunde con el color de estado).
- Propuesta: subtítulo "Sale vie. 2 oct · 8:30 p. m. · Asiento 14". Activos ordenados por salida ascendente; historial descendente. Reemplazar la pill de letra por un icono (Ticket / ArrowUp / ArrowDown) en un tono neutro.
- Impacto: Alto · Esfuerzo: S

**APP-37 — Las listas no tienen estado de error**
- Problema: `useRealtime` devuelve `error` (`useRealtime.ts:186`), pero ni `boletos.tsx` ni `encomiendas.tsx` ni `notificaciones.tsx` lo usan. Sin caché y sin red se muestra "Sin boletos activos" o "Sin paquetes en camino".
- Principio: Nielsen #9; Nielsen #1.
- Propuesta: si hay `error` y no hay datos, mostrar EmptyState "No pudimos cargar tus boletos" + "Reintentar". Si hay `error` y hay caché, una franja "Mostrando datos guardados · actualizado hace 2 h".
- Impacto: Medio · Esfuerzo: S

**APP-38 — Estrellas de calificación pequeñas y de bajo contraste**
- Problema: `StarRating.tsx:54-63`: estrella de 26 pt con padding de 4, es decir, 34 pt por objetivo. Las rellenas son `primary` (1.55:1) y las vacías `border` (#E8E6E1, ≈1.2:1).
- Principio: Ley de Fitts (48 pt en móvil); WCAG 1.4.11.
- Propuesta: objetivo de 48 pt (icono de 32 + padding de 8). Estrella vacía con contorno `mutedForeground`. Rellena en ámbar oscuro (#B45309) o amarillo con borde oscuro. Etiqueta por nivel ("Malo… Excelente") para dar feedback semántico.
- Impacto: Bajo · Esfuerzo: S

## 1.6 Encomiendas: nueva, enviar, recibir, seguimiento

**APP-39 — Un éxito prematuro: "¡Todo listo!" antes de guardar**
- Problema: el paso 3 "Revisa y confirma" abre con un check verde y "¡Todo listo!" (`nueva.tsx:571-583`) cuando todavía no se ha guardado nada. Si el insert falla (`:294-298`), el usuario ya celebró.
- Principio: Nielsen #1; Peak-end rule; consistencia del lenguaje visual (el check verde significa "hecho").
- Propuesta: cambiar el encabezado a "Revisa antes de generar tu código" con un icono neutro (ClipboardText). Reservar el check verde para la pantalla de detalle tras el insert real ("¡Encomienda registrada! Lleva tu paquete a la taquilla con este QR.").
- Impacto: Medio · Esfuerzo: S

**APP-40 — Reglas de peso contradictorias**
- Problema: la alerta dice "Peso máximo 25 kg" (`nueva.tsx:525`), pero `validatePeso` acepta hasta 100 kg (`validation.ts:58-60`) y el peso es opcional (`:53`), aunque la etiqueta "Peso estimado (kg)" no dice "opcional" (`nueva.tsx:481`). El costo estimado depende del peso.
- Principio: Nielsen #4; Nielsen #5; Nielsen #2.
- Propuesta: validar 0,1–25 kg con un error inline accionable: "El máximo es 25 kg. Para paquetes más pesados consulta en taquilla.". Etiqueta "Peso aproximado (kg)" con la ayuda "Lo usamos para estimar el costo". Si es opcional, decirlo.
- Impacto: Medio · Esfuerzo: S

**APP-41 — El costo estimado está en amarillo y la tarifa de referencia es la del pasaje**
- Problema: el costo estimado usa `color="primary"` sobre blanco (`nueva.tsx:515`), con 1.55:1. En el paso 1, la subtítulo "Tarifa referencial {precio_pasaje} Bs" (`:409-411`) usa el precio del boleto de pasajero como referencia para una encomienda.
- Principio: WCAG 1.4.3; Nielsen #2 (información que confunde).
- Propuesta: costo en `foreground`. En el paso 1, mostrar "Desde Bs X (según peso)" desde la calculadora, o "Tarifa según peso en taquilla".
- Impacto: Medio · Esfuerzo: S

**APP-42 — "Pago yo ahora" contradice su propia ayuda; la decisión llega tarde**
- Problema: la opción "Pago yo ahora" (`nueva.tsx:636`) tiene la ayuda "Pagarás el envío al entregar el paquete en taquilla" (`:642`). La decisión "¿Quién paga?" aparece en el paso de resumen, después de "¡Todo listo!".
- Principio: Nielsen #2; posición serial (las decisiones antes del resumen); Nielsen #5.
- Propuesta: llevar "¿Quién paga el envío?" al paso 2 con radio cards: "Yo, al entregar en taquilla" / "Quien recibe, al retirar". El resumen sólo debe mostrar lo elegido con "Editar".
- Impacto: Medio · Esfuerzo: S

**APP-43 — Datos del destinatario sin máscara ni atajos**
- Problema: cédula con `keyboardType="default"` (`nueva.tsx:447-454`) y teléfono sin máscara (`:455-463`). No se puede elegir de la agenda. El "Valor declarado ($)" va en USD mientras todo lo demás está en Bs (`:489-497`).
- Principio: Postel; Ley de Tesler; Nielsen #7 (aceleradores).
- Propuesta: reutilizar `CedulaField`/`TelefonoField` (APP-05). Botón "Elegir de mis contactos" (`expo-contacts`) que prellene nombre y teléfono. Valor declarado con un selector "$ / Bs" y la conversión visible.
- Impacto: Medio · Esfuerzo: M

**APP-44 — La timeline marca "Entregada" en estados intermedios**
- Problema: `buildTimeline` (`encomiendas/enviar/[id].tsx:173-195` y `recibir/[id].tsx:111-128`) sólo conoce 5 (o 4) etapas. Si el estado actual no está en `STATUS_FLOW` (`PAGADA`, `PENDIENTE_VERIFICACION`, `POR_PAGAR` en recibir, `PENDIENTE_DE_ESCANEO` en recibir, `CANCELADA`, `DEVUELTA`), ninguna etapa es "actual", `reachedCurrent` queda en `false` y todas se marcan completadas, incluida "Entregada al destinatario". Un paquete pagado o cancelado aparece como entregado.
- Principio: Nielsen #1 (estado falso); confianza; Peak-end.
- Propuesta: mapear cada estado a una etapa (por ejemplo `POR_PAGAR`, `PENDIENTE_VERIFICACION` y `PAGADA` → "Recibida en taquilla"). En `CANCELADA`/`DEVUELTA`, cortar la timeline con un nodo rojo "Cancelada el 02/10". Para ambos lados, derivarla de una única tabla en `estados.ts` (`ENCOMIENDA_ETAPA`).
- Impacto: Alto · Esfuerzo: S

**APP-45 — El PIN de retiro está en amarillo sobre blanco**
- Problema: `recibir/[id].tsx:188` pinta el PIN `display` de 36 pt con `color="primary"` (1.55:1). Es el dato que el destinatario dicta en el mostrador. Además, el costo dice "Se paga al retirar" cuando `costo_calculado` es null (`:203-206`), aunque la modalidad sea `ORIGEN` (paga el remitente).
- Principio: WCAG 1.4.3; Nielsen #2.
- Propuesta: PIN en `foreground` sobre un bloque `primaryLight`, con un botón "Copiar". Mostrarlo sólo, o destacarlo, cuando el estado sea `EN_OFICINA_DESTINO` ("Lista para retirar: presenta este PIN y tu cédula"). Costo: si `modalidad_pago === 'ORIGEN'` → "Pagado por el remitente"; si no → "Por calcular al llegar".
- Impacto: Alto · Esfuerzo: S

**APP-46 — No se puede compartir el seguimiento con el destinatario**
- Problema: el detalle de envío (`enviar/[id].tsx`) no tiene acción de compartir. Si el destinatario no tiene la app, no sabe cuándo retirar.
- Principio: Ley de Jakob (WhatsApp es el canal por defecto en Venezuela); Nielsen #7.
- Propuesta: botón "Avisar a {nombre} por WhatsApp" con el mensaje prellenado: "Te envié una encomienda por {cooperativa}. Seguimiento: {tracking}. Cuando llegue a {ciudad}, retírala con tu cédula. Descarga EnBus: {link}".
- Impacto: Medio · Esfuerzo: S

**APP-47 — Recibir: el error post-pago se traga; la lista usa nombres de ciudad crudos**
- Problema: `recibir/[id].tsx:249-251` ignora el error al pasar a `PENDIENTE_VERIFICACION`. `encomiendas.tsx:76` muestra `${item.ciudad_origen} → …` sin `formatCity`, mientras que boletos sí lo usa (`boletos.tsx:95`).
- Principio: Nielsen #9; Nielsen #4.
- Propuesta: mostrar el error con "Reintentar" y aplicar `formatCity` en todas las superficies.
- Impacto: Bajo · Esfuerzo: S

**APP-48 — Fotos: el permiso denegado no tiene salida y no hay progreso de subida**
- Problema: si se niega el permiso, sólo aparece un toast (`nueva.tsx:186-194`). Durante la subida, un toast "Subiendo foto del paquete…" (`:261`) sin progreso. En red lenta, el botón sigue en `loading` sin más información.
- Principio: Nielsen #9; Doherty (feedback de progreso); Nielsen #1.
- Propuesta: si se deniega, "Activa el acceso a la cámara en Ajustes" + botón "Abrir ajustes" (`Linking.openSettings`). Subida con estado en el botón "Subiendo foto… 60%", comprimiendo a 1280 px y calidad 0,6 antes de subir (gama media, datos caros).
- Impacto: Bajo · Esfuerzo: S

## 1.7 Notificaciones y perfil

**APP-49 — La push lleva a la lista, no al recurso**
- Problema: `onNotificationResponse: () => router.push('/notificaciones')` (`app/_layout.tsx:84`). Si se recibe en primer plano, es un toast de 3,5 s sin acción (`:79-83`).
- Principio: Ley de Fitts (un toque de más); Nielsen #7.
- Propuesta: leer `recurso_tipo`/`recurso_id` del `data` de la push y navegar directo al boleto o la encomienda. Toast en primer plano con la acción "Ver".
- Impacto: Medio · Esfuerzo: S

**APP-50 — Notificaciones sin agrupación ni iconos por tipo; pulso infinito**
- Problema: todas usan `Bell` (`notificaciones.tsx:155-159`). No hay agrupación "Hoy / Ayer / Esta semana", la fecha no tiene hora (`:183`) y `PulseDot` anima sin fin cada notificación no leída (`:248-268`), con duraciones fuera de tokens (`:254-255`). No se respeta "reducir movimiento" en ninguna parte de la app (no hay `useReducedMotion`).
- Principio: Gestalt de similitud y región común; Nielsen #8; WCAG 2.3.3 / 2.2.2 (movimiento); batería en gama media.
- Propuesta: icono y tono por tipo (Ticket azul, Package coral, CheckCircle verde para "pago verificado"). Secciones por día. Hora relativa ("hace 5 min"). Un punto estático en lugar del pulso. `useReducedMotion()` para desactivar `StaggerItem` y los pulsos.
- Impacto: Medio · Esfuerzo: S

**APP-51 — El toast oculta los errores a los 3,5 s**
- Problema: `AUTO_HIDE_MS = 3500` para todos los tipos (`Toast.tsx:53`), con mensajes de hasta 3 líneas (`:133`), y aparece arriba mientras la acción está abajo.
- Principio: WCAG 2.2.1 (tiempo ajustable); Nielsen #9; DESIGN.md regla 6.
- Propuesta: los errores persisten hasta que se cierran (con "Cerrar" o "Reintentar"); los de éxito duran 3 s; duración proporcional al texto (unos 60 ms por carácter, mínimo 4 s). Opcional: snackbar inferior sobre la tab bar, cerca del pulgar.
- Impacto: Medio · Esfuerzo: S

**APP-52 — Perfil incompleto y cierre de sesión sin confirmar**
- Problema: "Cerrar sesión" ejecuta `signOut` directamente (`perfil.tsx:292`). No hay cambio de contraseña, preferencias de notificación (que el spec pide), ayuda/soporte, términos, privacidad ni "Eliminar cuenta" (obligatorio en Google Play). La versión está hardcodeada como `'1.0.0'` (`:39`). La validación de teléfono (mínimo 8 caracteres, `:97`) difiere de la de registro y la de encomiendas.
- Principio: Nielsen #3 y #5; Nielsen #10 (Ayuda y documentación); Nielsen #4.
- Propuesta: secciones "Cuenta" (datos, contraseña), "Preferencias" (notificaciones), "Ayuda" ("Contactar soporte por WhatsApp", "Preguntas frecuentes"), "Legal" y "Zona de peligro" (eliminar cuenta). Confirmar el cierre de sesión con "Se borrarán los boletos guardados en este teléfono". Versión desde `expo-constants`. Validadores compartidos.
- Impacto: Medio · Esfuerzo: M

## 1.8 Design system de la app (específico)

**APP-53 — El token `primary` se usa como color de texto en datos críticos**
- Problema: `Text color="primary"` aparece en el monto de pago (`PaymentFlow.tsx:501`), el asiento (`boletos/[id].tsx:604`), el PIN (`recibir/[id].tsx:188`), el costo (`nueva.tsx:515`) y el costo de recepción (`recibir/[id].tsx:208`). También en logos y estrellas. El `COLOR_MAP` de `Text.tsx:35-45` lo permite sin restricción.
- Principio: WCAG 1.4.3 / 1.4.11; Aesthetic-usability.
- Propuesta: quitar `primary` y `success` de `TextColorToken`. Añadir tokens de texto accesibles: `primaryText` (#8A5A00, ámbar oscuro, de al menos 4.5:1 sobre blanco), `successText` (#15803D), `warningText` (#B45309) y `infoText` (#1D4ED8). Mantener los colores vivos sólo para superficies y bordes.
- Impacto: Alto · Esfuerzo: S

**APP-54 — Los badges de estado no cumplen contraste y usan 9 pt en mayúsculas**
- Problema: `Badge` usa `size="micro"` (9 pt) en mayúsculas (`Badge.tsx:44`), con contrastes de 1.93:1 (pending) y 2.07:1 (success) (tabla inicial). Son la señal principal del estado del boleto o la encomienda.
- Principio: WCAG 1.4.3; legibilidad en gama media; Von Restorff (el estado debe resaltar).
- Propuesta: badge de 11 pt (`xs`), peso bold, sin mayúsculas forzadas ("Pago en verificación"). Primer plano oscuro por tono (ámbar #92400E, verde #166534, azul #1E40AF, rojo #991B1B) sobre el fondo suave actual: todos superan 6:1. Añadir un icono por tono para no depender del color (WCAG 1.4.1).
- Impacto: Alto · Esfuerzo: S

**APP-55 — Texto `muted` y etiquetas de la tab bar por debajo de 4.5:1**
- Problema: `mutedForeground` #8A8A8A da 3.45:1 sobre blanco y 3.0:1 sobre `surface`. Se usa en `caption` de 11 pt de forma masiva (subtítulos, timestamps, ayudas). Las etiquetas de la tab bar son de 11 pt: las inactivas, muted sobre beige (3.0:1); las activas, blancas sobre azul (3.7:1) (`(tabs)/_layout.tsx:113-122`).
- Principio: WCAG 1.4.3; uso exterior con brillo bajo.
- Propuesta: subir `mutedForeground` a #6B6B6B (≈5.3:1 sobre blanco, ≈4.6:1 sobre beige). Etiquetas de la tab bar de 12 pt. Indicador activo en `foreground` o un azul más oscuro (#2F5FD0, ≈5.4:1 con blanco).
- Impacto: Alto · Esfuerzo: S

**APP-56 — Cinco formateadores de dinero distintos**
- Problema: `formatters.ts:53-64` (`currencyBs`, `currencyUSD`), `useTasaBCV.ts:124-140` (`formatBs`, `formatUSD`), `PaymentFlow.tsx:71-72` (`money`), y plantillas crudas como `${x} Bs` en `buscar.tsx:508,558,676`, `SeatSelector.tsx:161,170`, `enviar/[id].tsx:310`, `recibir/[id].tsx:204` y `boletos/[id].tsx:478,563`. Unas veces sale "1250 Bs", otras "1.250,00 Bs".
- Principio: Nielsen #4; Ley de Prägnanz.
- Propuesta: un único `formatMoney(monto, { moneda, conUSD })`. Convención: "Bs 1.250,00" (símbolo delante, 2 decimales). Para USD: "$ 12,40". Regla de lint que prohíba la plantilla `` `${...} Bs` ``.
- Impacto: Medio · Esfuerzo: S

**APP-57 — `Field` no asocia la etiqueta con el input ni anuncia errores**
- Problema: el `label` se renderiza como un `Text` separado (`Field.tsx:90-94`) y el `TextInput` no recibe `accessibilityLabel` (`:110-119`). TalkBack lee el placeholder ("Juan Pérez"). El error no tiene `accessibilityLiveRegion`. En tono `light` sobre fondo blanco, el campo no tiene borde en reposo (`:258-259`, borde transparente) y no se distingue del fondo.
- Principio: WCAG 1.3.1, 3.3.1, 4.1.2; WCAG 1.4.11 (límite del control).
- Propuesta: `accessibilityLabel={label}` y `accessibilityHint={helper}` en el `TextInput`; error con `accessibilityLiveRegion="assertive"`; borde en reposo `Colors.border` reforzado (al menos 3:1 frente al fondo) cuando el tono sea `light` sobre fondo blanco.
- Impacto: Medio · Esfuerzo: S

**APP-58 — Códigos de ciudad tipo aeropuerto que se repiten**
- Problema: `cityCode` toma las 3 primeras letras (`RouteSummary.tsx:26-29`): "SAN" sirve para San Cristóbal, San Fernando, San Juan, San Felipe, San Carlos y San Diego; "PUE" para Puerto Ayacucho, La Cruz, Ordaz y Cabello. Es una convención de aerolínea que el pasajero de autobús no usa.
- Principio: Ley de Jakob (modelo mental del usuario de autobús); Nielsen #2; Prägnanz.
- Propuesta: mostrar el nombre completo de la ciudad en `subheading` (dos líneas permitidas) con la hora debajo ("Caracas · 8:30 p. m." → "Mérida · 6:15 a. m.").
- Impacto: Medio · Esfuerzo: S

**APP-59 — Componentes muertos y duplicados**
- Problema: `src/components/Spinner.tsx` no se importa en ningún sitio. `SkeletonLoader` y `CardSkeleton` conviven, pero `LoadingState` (spinner) se usa en los detalles en lugar de skeletons. Hay animaciones con duración literal (`SkeletonLoader.tsx:35-36`, `BottomSheet.tsx:55`, `notificaciones.tsx:254`). `Specs/02_App_Movil/Design_System_Spec.md` describe otra tipografía (Lora) y otra paleta (`#452000`), que no coinciden con `DESIGN.md`.
- Principio: consistencia del sistema; Doherty (los skeletons reducen la espera percibida frente a un spinner).
- Propuesta: borrar `Spinner`. Skeletons de detalle (boleto, encomienda) que imiten la estructura final. Mover las duraciones a `Motion`. Marcar el spec como obsoleto o sincronizarlo con `DESIGN.md`.
- Impacto: Bajo · Esfuerzo: S

---

# 2. Panel de cooperativas (PanelCooperativas · `/cooperativas`)

Rutas relativas a `PanelCooperativas/src/`; `(p)` = `app/cooperativas/(panel)`.

## Resumen de la superficie

El panel tiene buenos cimientos (shadcn, `ScanInput`, banner de conectividad, impresión Bluetooth), pero no está optimizado para el experto de mostrador. Faltan cuatro cosas: atajos, feedback sensorial al escanear, confirmaciones en las acciones irreversibles y un vocabulario de estados completo. Hay tres problemas estructurales:

1. **Entrega no está en el menú.**
2. **Monedas mezcladas.** Rutas en $, venta en Bs y ticket impreso con "$".
3. **`StatusBadge` incompleto.** Muestra enums crudos.

## 2.1 Auth / onboarding / invitación

**PC-01 — Login sin aceleradores**
- Problema: no hay `autoFocus` en el email, ni `autoComplete="username"`/`"current-password"`, ni botón para mostrar la contraseña (`app/cooperativas/login/login-client.tsx:124-148`).
- Principio: Nielsen #7; Ley de Jakob.
- Propuesta: añadir `autoFocus`, `autoComplete` y un botón de ojo con `aria-label="Mostrar contraseña"`.
- Impacto: Medio · Esfuerzo: S

**PC-02 — Errores de Supabase sin traducir**
- Problema: `recuperar/recuperar-client.tsx:36`, `restablecer/restablecer-client.tsx:62` y `registro/actions.ts:106` muestran el mensaje de Supabase tal cual.
- Principio: Nielsen #9 y #2.
- Propuesta: compartir el mapa de errores con la app (ver APP-04). Ejemplo: "Ya pediste un enlace hace poco. Espera 1 minuto y vuelve a intentarlo."
- Impacto: Medio · Esfuerzo: S

**PC-03 — Paso 1 del registro sin `<form>` y con un único error global**
- Problema: el paso 1 no es un `<form>` (`registro/page.tsx:118-191`, botón `type="button"` en `:180`) y los errores van en un Alert global (`:120-126`). Además, si el email ya existe, el error aparece recién en el paso 2 (`registro/actions.ts:64-68`).
- Principio: WCAG 3.3.1 y 3.3.3; prevención de errores frente a recuperación.
- Propuesta:
  - `<form onSubmit>` para que Enter avance de paso.
  - Error inline en cada campo, con `aria-invalid` y `aria-describedby`.
  - Validar el email al salir del paso 1 y, si falla, devolver el foco a ese campo.
- Impacto: Medio · Esfuerzo: M

**PC-04 — RIF y teléfono exigen el formato exacto**
- Problema: el RIF obliga a escribir "J-" y el guion a mano (`registro/page.tsx:220`), y el teléfono no tiene patrón (`:228-236`).
- Principio: Ley de Postel; Ley de Tesler.
- Propuesta:
  - RIF: aceptar "j123456789" y formatear a "J-12345678-9".
  - Teléfono: selector de operadora (0412/0414/0416/0424/0426/0422) más 7 dígitos.
  - Reutilizar los helpers de formato de la sección 5.
- Impacto: Medio · Esfuerzo: M

**PC-05 — Invitación inválida sin salida**
- Problema: la pantalla de invitación inválida no ofrece ninguna acción (`invite/[token]/page.tsx:45-62`). Para el aviso offline usa `alert()` (`:111`) y tiene fondos claros fijos (`:39,47,92`).
- Principio: Nielsen #3; Nielsen #4.
- Propuesta:
  - Botón "Ir a iniciar sesión".
  - Copy: "Este enlace venció o ya fue usado. Pide a tu administrador uno nuevo (vencen a las 48 h)."
  - Alert inline en lugar de `alert()`.
- Impacto: Medio · Esfuerzo: S

**PC-06 — Panel de autenticación copiado 5 veces y éxito ilegible**
- Problema: el mismo panel lateral está copiado en 5 pantallas (`login-client.tsx:76-97`, `recuperar-client.tsx:48-69`, `restablecer-client.tsx:106-127`, `registro/page.tsx:57-92`, `invite/[token]/page.tsx:68-89`). El mensaje de éxito usa `text-emerald-500` sobre `bg-emerald-500/10`, ≈2,5:1 (`recuperar-client.tsx:88-89`, `restablecer-client.tsx:156-157`).
- Principio: consistencia; WCAG 1.4.3.
- Propuesta: extraer un `<AuthLayout>` y usar los tokens `success` con un foreground oscuro.
- Impacto: Bajo · Esfuerzo: S

## 2.2 Shell, navegación e IA

**PC-07 — "Entrega" no aparece en el menú**
- Problema: `lib/navigation.ts:7-62` tiene 9 rutas y ninguna es `/cooperativas/entrega`, y ninguna otra pantalla enlaza a ella. Un flujo central del negocio (retiro del paquete por el destinatario) sólo se abre escribiendo la URL.
- Principio: Nielsen #6 (reconocer antes que recordar); Ley de Jakob.
- Propuesta: añadir "Entrega" (icono `Handshake`) para ambos roles, dentro del grupo "Mostrador".
- Impacto: Alto · Esfuerzo: S

**PC-08 — Sidebar plano, sin grupos y sin orden por rol**
- Problema: 9 ítems planos y Dashboard primero también para el taquillero (`navigation.ts:7-62`, `components/app-sidebar.tsx:76-97`).
- Principio: Ley de Hick; Gestalt (proximidad, región común); efecto de posición serial.
- Propuesta:
  - Agrupar en "Mostrador" (Boletos, Encomiendas, Despacho, Recepción, Entrega), "Planificación" (Viajes, Rutas) y "Administración" (Empleados, Configuración, Hardware).
  - El taquillero entra directo a su pantalla de mostrador.
- Impacto: Alto · Esfuerzo: S

**PC-09 — Nombres distintos en el menú y en el H1**
- Problema: "Rutas y Horarios" contra "Rutas", "Viajes Programados" contra "Viajes", "Gestión Empleados" contra "Empleados", "Recepción Destino" contra "Recepción en Destino" (`navigation.ts:15,33,39,45,51`; `(p)/rutas/client.tsx:140`; `(p)/viajes/client.tsx:202`). El rol aparece como slug ("Admin Cooperativa", `app-sidebar.tsx:116,131`) frente a "Administrador" (`(p)/empleados/client.tsx:165`).
- Principio: Nielsen #4; Nielsen #2.
- Propuesta: un nombre corto por destino, idéntico en menú, H1 y breadcrumb, y un mapa de etiquetas de rol compartido.
- Impacto: Medio · Esfuerzo: S

**PC-10 — El ítem activo no se marca en subrutas**
- Problema: la comparación es por pathname exacto (`app-sidebar.tsx:83-87`). Con `?tab=` o `/configuracion/hardware` no se marca ningún ítem.
- Principio: Nielsen #1.
- Propuesta: comparar con `pathname.startsWith(base)`.
- Impacto: Medio · Esfuerzo: S

**PC-11 — El header no informa del estado operativo**
- Problema: el header de 64 px sólo repite el título (`components/panel-shell.tsx:29-39`).
- Principio: Nielsen #1; Nielsen #8.
- Propuesta: barra de estado de mostrador con "Sucursal Valencia · Impresora conectada · En línea · 14:32" y un botón global "Escanear (F2)".
- Impacto: Medio · Esfuerzo: M

**PC-12 — Banner de aprobación pendiente sin pasos**
- Problema: el banner no dice qué hacer mientras tanto y reaparece en cada recarga (`components/pending-approval-banner.tsx:9,27`).
- Principio: efecto Zeigarnik; Goal-gradient.
- Propuesta: checklist de puesta en marcha con progreso: "Mientras aprobamos tu cooperativa: ☐ Crea tus sucursales ☐ Agrega métodos de pago ☐ Crea tus rutas (1/3)".
- Impacto: Medio · Esfuerzo: M

**PC-13 — Tema forzado en dos sitios**
- Problema: el root fuerza `light` (`app/layout.tsx:32`) y el panel usa `ThemeProvider defaultTheme="system"` (`(p)/layout.tsx:20`).
- Principio: consistencia.
- Propuesta: dejar una sola fuente de verdad para el tema.
- Impacto: Bajo · Esfuerzo: S

## 2.3 Dashboard

**PC-14 — Dashboard de vanidad, sin trabajo pendiente**
- Problema: sólo muestra 4 contadores (`(p)/dashboard/page.tsx:179-223`).
- Principio: efecto Zeigarnik; Nielsen #1; posición serial.
- Propuesta: una bandeja "Requiere tu atención" con tarjetas enlazadas:
  - "4 pagos por verificar".
  - "2 encomiendas con más de 3 días en oficina (se devuelven en 1 día)".
  - "Próxima salida: Valencia → Caracas en 25 min · 12 encomiendas por despachar".
- Impacto: Alto · Esfuerzo: M

**PC-15 — Ingresos en USD mientras la taquilla cobra en Bs**
- Problema: "Ingresos del Día" se formatea en USD (`dashboard/page.tsx:219`, vía `formatCurrency` de `lib/utils.ts:49-51`), pero la taquilla trabaja en Bs.
- Principio: Nielsen #4; Nielsen #2.
- Propuesta: "Bs 12.345,00 · ≈ $ 245,00 (BCV 02/10)".
- Impacto: Alto · Esfuerzo: M

**PC-16 — Tabla reciente sin enlaces, ciudades mal formateadas y comisión en rojo**
- Problema: las filas de la tabla reciente no se pueden abrir (`dashboard/page.tsx:272-288`). "san_juan" se muestra como "San_juan" (`:279`). La comisión pendiente sale en `text-destructive` (`:236`). El skeleton de carga no coincide con el layout final (`(p)/dashboard/loading.tsx:13-28`).
- Principio: Nielsen #4; Von Restorff mal aplicado; Doherty.
- Propuesta: filas que abran el `DetalleSheet`, `formatCity` compartido, comisión con tono neutro o warning y un skeleton fiel al layout.
- Impacto: Bajo · Esfuerzo: S

## 2.4 Taquilla de boletos (venta y embarque)

**PC-17 — El embarque no valida fecha y hora y muestra el nombre del comprador**
- Problema: el diálogo "Boleto Válido" no muestra fecha ni hora (`(p)/taquilla/boletos/page.tsx:360-403`). La consulta del escaneo no las trae (`components/scan-input.tsx:66-70`). Se prioriza el nombre del comprador sobre `pasajero_nombre` (`page.tsx:377,280`).
- Principio: Nielsen #5 (prevención de errores); legibilidad en mostrador.
- Propuesta:
  - Mostrar "Sale HOY 08:00 · Valencia → Caracas · Asiento 14 · Pasajero: Ana Pérez, V-12.345.678".
  - Si el viaje no es de hoy, bloqueo rojo: "Este boleto es para el viaje de MAÑANA 06:00".
- Impacto: Alto · Esfuerzo: M

**PC-18 — Todo boleto rechazado dice "Boleto inválido"**
- Problema: `RESERVADO`, `EXPIRADO` y `CANCELADO` terminan en el mismo mensaje (`page.tsx:120-128`).
- Principio: Nielsen #9.
- Propuesta: un mensaje por causa:
  - `RESERVADO`: "Pago pendiente de verificación" con la acción "Verificar pago ahora".
  - `EXPIRADO`: "Reserva vencida: el asiento se liberó".
  - `CANCELADO`: "Boleto cancelado el 01/10".
- Impacto: Alto · Esfuerzo: S

**PC-19 — Confirmar embarque depende del ratón y no hay feedback sensorial**
- Problema: no hay `initialFocus` en "Confirmar Embarque" y "Cancelar" va primero (`page.tsx:393-400`). No existen atajos, sonido ni vibración en todo el panel (grep sin resultados).
- Principio: Ley de Fitts; Nielsen #7 (eficiencia de experto); Doherty.
- Propuesta:
  - Opción A, autoembarque: al escanear un boleto válido se embarca solo, con un banner verde a pantalla, beep corto y "Deshacer (Z)" durante 10 s.
  - Opción B: foco en "Confirmar", donde Enter confirma y Esc cancela.
  - En ambas: beep grave en error y un panel fijo "Último escaneo" junto al input.
- Impacto: Alto · Esfuerzo: M

**PC-20 — El escáner sigue activo con el diálogo de pago abierto**
- Problema: el `disabled` del `ScanInput` no incluye `pagoVerification` (`page.tsx:201`).
- Principio: Nielsen #5.
- Propuesta: añadir `|| !!pagoVerification` a la condición.
- Impacto: Medio · Esfuerzo: S

**PC-21 — "Validar pago" sólo aprueba y sin comparar montos**
- Problema: no hay opción de rechazar ni comparación entre lo declarado y lo esperado, y se puede aprobar sin que exista un pago asociado (`page.tsx:454-477`).
- Principio: Nielsen #5; Nielsen #3.
- Propuesta:
  - Mostrar "Esperado Bs 1.250,00 · Declarado Bs 1.200,00 ⚠ Faltan Bs 50,00", junto con la referencia, el banco y la fecha.
  - Botones "Aprobar" y "Rechazar…" (con motivo, que se notifica al pasajero).
- Impacto: Alto · Esfuerzo: M

**PC-22 — Asistente de venta poco eficiente y no accesible**
- Problema:
  - Las tarjetas de viaje son `Card onClick`, inaccesibles por teclado (`components/boletos/venta-flow.tsx:259-263`).
  - Sin autofocus ni `<form>`, Enter no avanza (`:323-360`).
  - La cédula es texto libre (`:333-339`).
  - Los labels de pago no están asociados (`:392,400,408`).
  - El progreso sólo dice "Paso N" (`:219-223`).
- Principio: WCAG 2.1.1, 1.3.1; Goal-gradient; Postel.
- Propuesta:
  - Stepper visual de 5 pasos.
  - Enter = siguiente.
  - Autofocus en el primer campo de cada paso.
  - `CedulaField` con prefijo V/E y `TelefonoField` 04xx.
  - Tarjetas como `<button>`/`radio`.
- Impacto: Alto · Esfuerzo: M

**PC-23 — "Vender otro" arrastra el pago de la venta anterior**
- Problema: al vender otro boleto no se reinician `tipoPago` ni `referenciaData` (`venta-flow.tsx:485-491`), aunque `handleOpenChange` sí lo hace (`:138-139`).
- Principio: Nielsen #5. Riesgo de registrar una referencia duplicada.
- Propuesta: un `resetFlow()` único para ambos caminos.
- Impacto: Alto · Esfuerzo: S

**PC-24 — Impresión incompleta e inconsistente**
- Problema:
  - Sin impresora térmica se usa `window.print()`, que imprime la página entera (`venta-flow.tsx:87,92`).
  - Existe `printFallback` (`lib/printing/print-helpers.ts:48`) pero no se usa.
  - El ticket no lleva ruta, fecha ni hora y usa "$" (`print-helpers.ts:26-31`).
  - No se imprime automáticamente.
- Principio: Nielsen #1; Peak-end (el ticket es lo que se lleva el pasajero).
- Propuesta:
  - Autoimprimir al confirmar si hay impresora.
  - Usar `printFallback` con `@media print`.
  - Contenido del ticket: Cooperativa · Ruta · "Sale vie 02/10 08:00" · Unidad · Asiento · Pasajero y C.I. · Total en Bs · Código y QR.
- Impacto: Alto · Esfuerzo: M

**PC-25 — Selector de asientos sin semántica y con doble clic**
- Problema: los asientos no tienen `aria-label` ni `aria-pressed`, y el número se sustituye por "✓" al seleccionar (`components/boletos/seat-selector.tsx:99-111`). Hacen falta dos clics (`:163-172`). Los asientos se ordenan como texto, así que "10A" va antes que "2A" (`pasajeros-viaje-sheet.tsx:69`).
- Principio: WCAG 4.1.2; Ley de Fitts; Nielsen #4.
- Propuesta: mostrar "✓ 14", `aria-label="Asiento 14, libre"`, Enter para confirmar y orden natural.
- Impacto: Medio · Esfuerzo: S

**PC-26 — Filtros de la taquilla de boletos defectuosos**
- Problema:
  - Labels sin asociar (`page.tsx:206,223`).
  - Opciones con enum crudo ("PAGADO", `:212-217`).
  - El filtro de fecha usa `new Date("YYYY-MM-DD")` en UTC, con 4 h de desfase (`:92-98`).
  - Filtra por fecha de venta y no de viaje.
  - Límite de 50 registros sin aviso (`:84`).
- Principio: WCAG 1.3.1; Nielsen #2; Nielsen #1.
- Propuesta: etiquetas en español, separar "Fecha del viaje" de "Fecha de venta", fechas en hora local, paginación en servidor y un aviso "Mostrando 50 de 312".
- Impacto: Medio · Esfuerzo: M

## 2.5 Taquilla de encomiendas (recepción → pago → foto)

**PC-27 — Recepción sin foco en el peso y con montos en "$"**
- Problema: no hay `autoFocus` ni `<form>` (`components/encomiendas/recepcion-modal.tsx:281-291`). El costo se muestra como `"$" + toFixed(2)` (`:303-305`).
- Principio: Nielsen #7; Nielsen #4.
- Propuesta: foco en "Peso (kg)", Enter = "Confirmar recepción" y el total en "Bs 1.250,00 · ≈ $ 12,40".
- Impacto: Alto · Esfuerzo: S

**PC-28 — Sin ruta activa, el modal se cierra con un toast**
- Problema: si no hay ruta activa, el modal se cierra y sólo queda un toast (`recepcion-modal.tsx:80-84`).
- Principio: Nielsen #9.
- Propuesta: mantener el modal abierto con "No hay ruta activa hacia San Juan de los Morros" y el botón "Crear ruta" (sólo para administradores).
- Impacto: Medio · Esfuerzo: S

**PC-29 — Pago sin conciliar y confirmaciones asimétricas**
- Problema: el pago reportado y el monto a cobrar se muestran sin compararse (`components/encomiendas/pago-modal.tsx:152-157` frente a `:178-179`). "Aprobar Pago Digital" no pide confirmación (`:191-201`), pero "Cobrado en Efectivo" sí (`:233-259`).
- Principio: Nielsen #5; Nielsen #4.
- Propuesta: aviso de diferencia ("Faltan Bs 120,00") y un mismo patrón para ambos: confirmación o "Deshacer".
- Impacto: Alto · Esfuerzo: M

**PC-30 — Captura de foto que atrapa al usuario**
- Problema: el modal no se puede cerrar (`components/encomiendas/photo-capture-modal.tsx:158-162`) y la única salida ante un fallo es "Recargar Página" (`:182`).
- Principio: Nielsen #3.
- Propuesta: alternativas "Subir archivo" (`<input type=file capture>`) y "Omitir y registrar después", que deja la encomienda marcada como "Falta foto".
- Impacto: Alto · Esfuerzo: M

**PC-31 — Detalle incompleto, refresco agresivo y filas inaccesibles**
- Problema:
  - El `select` de la tabla no trae la descripción ni la foto (`(p)/taquilla/encomiendas/page.tsx:54-59`).
  - Realtime devuelve a la página 1 y muestra el spinner (`:49-50,93`).
  - Las filas usan `onClick` (`:193-197`).
  - El botón de reimprimir sólo tiene `title` (`:319-326`).
  - Se muestran crudos "ORIGEN"/"DESTINO" (`recepcion-modal.tsx:253-255`, `detalle-sheet.tsx:126-128`).
  - La guía se reimprime siempre como PDF y no por la impresora térmica (`page.tsx:299-316`).
- Principio: Doherty; WCAG 2.1.1 y 4.1.2; Nielsen #2 y #4.
- Propuesta:
  - Refresco silencioso con un chip "3 nuevas · Ver".
  - Tracking ID como enlace.
  - `aria-label="Reimprimir guía ENC-123"`.
  - "Paga al enviar" / "Paga al retirar".
  - Misma ruta de impresión térmica que en la recepción.
- Impacto: Medio · Esfuerzo: M

## 2.6 Despacho

**PC-32 — Despacho irreversible sin confirmar y sin validar destino**
- Problema: el despacho se ejecuta sin confirmación (`(p)/despacho/page.tsx:105-126`) y además pasa el viaje a `EN_CURSO` (`actions.ts:31-33`). No se compara el destino del paquete con el del viaje (`page.tsx:85-99`). Al cambiar de viaje se conserva la lista escaneada (`:175`).
- Principio: Nielsen #5 (poka-yoke); prevención frente a recuperación; Despacho_Spec §2.3.
- Propuesta:
  - Bloqueo al escanear: "Esta encomienda va a Maracaibo; el viaje va a Caracas".
  - AlertDialog: "¿Despachar 12 encomiendas en Valencia → Caracas 08:00 · Unidad 14? No se puede deshacer."
  - Separar "Despachar encomiendas" de "Marcar salida del bus".
  - Pedir confirmación antes de vaciar la lista al cambiar de viaje.
- Impacto: Alto · Esfuerzo: M

**PC-33 — Sólo se puede despachar escaneando**
- Problema: no hay una lista de encomiendas listas para despachar, sólo el escaneo.
- Principio: Nielsen #6.
- Propuesta: panel "Listas para Caracas (8)" con "Agregar todas" y verificación por escaneo.
- Impacto: Medio · Esfuerzo: M

**PC-34 — Fechas en UTC y accesibilidad de despacho**
- Problema: la fecha por defecto se calcula en UTC (`page.tsx:34,47-50`), así que después de las 20:00 muestra el día siguiente. Las tarjetas son `div onClick` (`:173-177`), la X para quitar no tiene `aria-label` (`:246-248`) y un toast muestra "EN TRANSITO" (`:88`).
- Principio: Nielsen #2; WCAG 2.1.1 y 4.1.2.
- Propuesta: un helper de fecha local para Venezuela, botones reales y etiquetas en español.
- Impacto: Medio · Esfuerzo: S

**PC-35 — Posible inconsistencia de datos que produce estados vacíos falsos (verificar)**
- Problema: Despacho escribe `viaje_asignado_id` (`(p)/despacho/actions.ts:19`), pero Recepción lee `viaje_id` (`recepcion-destino/page.tsx:59`), que es la columna de la migración (`supabase/migrations/20260414000002_tables.sql:126`). En la UI esto aparecería como "Sin viaje asignado" o como lotes vacíos.
- Principio: Nielsen #1.
- Propuesta: unificar la columna. La corrección es de datos, pero el síntoma es de UX.
- Impacto: Alto · Esfuerzo: S

## 2.7 Recepción en destino

**PC-36 — Escanear recibe al instante y sin deshacer; el lote viene premarcado**
- Problema: el escaneo recibe la encomienda de inmediato, sin deshacer y sin validar la sucursal (`(p)/recepcion-destino/page.tsx:85-105`). En el lote, todas las encomiendas vienen marcadas (`recepcion-lote-modal.tsx:98-100`).
- Principio: prevención frente a recuperación; Nielsen #3; sesgo por defecto.
- Propuesta: modo "verificar escaneando" con un contador "8/12 verificadas" y la acción "Reportar faltantes (4)". Tras cada escaneo, un toast "Recibida · Deshacer (10 s)".
- Impacto: Alto · Esfuerzo: M

**PC-37 — Microcopy técnico y feedback pobre en recepción**
- Problema: el estado vacío dice "'EN_TRANSITO'" y "esta cooperativa/sucursal" (`page.tsx:145`). El feedback es un toast con emoji (`:96`). El botón volver no tiene `aria-label` (`recepcion-lote-modal.tsx:159-166`) y hay un spinner blanco sobre amarillo (`:275`).
- Principio: Nielsen #2; WCAG 4.1.2 y 1.4.11.
- Propuesta: copy "No hay encomiendas en camino hacia tu sucursal", un panel "Último escaneo" y etiquetas accesibles.
- Impacto: Medio · Esfuerzo: S

## 2.8 Entrega

**PC-38 — Entrega sin `ScanInput` ni autofocus**
- Problema: la búsqueda de Entrega no usa `ScanInput` ni tiene autofocus (`(p)/entrega/page.tsx:126-137`), a diferencia del resto de pantallas operativas.
- Principio: Ley de Jakob interna (consistencia entre pantallas); Nielsen #7.
- Propuesta: `ScanInput` en modo entrega, donde escanear el QR o tracking abre el modal directamente.
- Impacto: Alto · Esfuerzo: S

**PC-39 — "Cobro Destino" pintado en verde como "Pagado"**
- Problema: ambas variantes usan `emerald` (`(p)/entrega/page.tsx:186-188`).
- Principio: Gestalt de similitud; Nielsen #5. El taquillero puede entregar sin cobrar.
- Propuesta: ámbar con el texto "Cobrar al retirar: Bs 850,00" y bloquear "Confirmar entrega" hasta registrar el cobro.
- Impacto: Alto · Esfuerzo: S

**PC-40 — No se exige verificar la cédula**
- Problema: el modal muestra la cédula pero no obliga a verificarla (`components/entrega/entrega-modal.tsx:236`).
- Principio: Nielsen #5 (forcing function).
- Propuesta: checkbox obligatorio "Verifiqué la cédula V-12.345.678 de quien retira", con la opción "Retira un tercero autorizado" que pide nombre y C.I.
- Impacto: Alto · Esfuerzo: S

**PC-41 — PIN de retiro con fallas**
- Problema: el PIN no tiene autofocus (`components/entrega/pin-input.tsx:69-78`). La clase `animate-shake` no existe (`:68`). El mensaje "Contactar soporte" no dice cómo (`:103`). El cobro no se confirma (`entrega-modal.tsx:301-318`). Los días en oficina se cuentan desde `updated_at` (`page.tsx:95-103`), sin aviso de devolución.
- Principio: Nielsen #9; Nielsen #1; Nielsen #4.
- Propuesta:
  - Autofocus en el PIN.
  - "PIN bloqueado tras 3 intentos. El destinatario puede pedir uno nuevo desde la app o al WhatsApp 0412-…".
  - Contar los días desde la llegada a oficina y avisar "Se devuelve en 2 días hábiles".
- Impacto: Medio · Esfuerzo: M

## 2.9 Viajes y rutas

**PC-42 — `alert()`/`confirm()` nativos y estados crudos**
- Problema: se usan diálogos nativos en `(p)/viajes/client.tsx:132-190` y `(p)/rutas/client.tsx:74-128`. No hay toast de éxito. Los badges muestran "EN_CURSO" (`viajes/client.tsx:288,425`) y los detalles usan el `StatusBadge` de encomiendas para boletos (`:484`).
- Principio: Nielsen #4; Nielsen #2; Nielsen #1.
- Propuesta: `toast` + `AlertDialog` del sistema y un `StatusBadge dominio="viaje"`.
- Impacto: Medio · Esfuerzo: S

**PC-43 — Lista de viajes que no sirve al mostrador**
- Problema: el orden es descendente sin límite (`viajes/page.tsx:22`) y el filtro de fecha usa UTC (`client.tsx:109`).
- Principio: posición serial; Nielsen #7.
- Propuesta: pestañas "Hoy · Próximos 7 días · Historial", con orden ascendente desde ahora.
- Impacto: Medio · Esfuerzo: M

**PC-44 — Programar viaje sin vista previa ni salida**
- Problema: labels sin `htmlFor` (`client.tsx:341-405`), días "M"/"Mi" ambiguos (`:367-368`), sin resumen de cuántos viajes se crearán y sin botón Cancelar (`:411-415`).
- Principio: WCAG 1.3.1; Nielsen #1 y #5; Nielsen #3.
- Propuesta: días "Lun Mar Mié…" con nombre accesible, resumen dinámico ("Se crearán 24 salidas entre el 05/10 y el 31/10") y validar que la fecha inicial sea anterior o igual a la final.
- Impacto: Medio · Esfuerzo: M

**PC-45 — El detalle del viaje no se puede imprimir**
- Problema: el sheet de detalle (`client.tsx:420-538`) no permite imprimir.
- Principio: Ley de Jakob (el chofer necesita un manifiesto en papel).
- Propuesta: botón "Imprimir manifiesto" con pasajeros (asiento, nombre, C.I.) y encomiendas (tracking, destinatario).
- Impacto: Medio · Esfuerzo: M

**PC-46 — Rutas: moneda, validaciones y estado vacío**
- Problema: el precio va en "$" (`(p)/rutas/client.tsx:177,283`) mientras la venta va en Bs. La duración se pide en minutos y se formatea de forma inconsistente (`:172-174,279-280`). Se permite origen igual a destino (`:116-131`). El estado vacío no tiene CTA (`:215-219`).
- Principio: Nielsen #4; Ley de Tesler; Nielsen #5.
- Propuesta: decidir la moneda base (ver la sección 5), mostrar ambas monedas, pedir la duración en horas y minutos, validar origen distinto de destino y añadir el CTA "Crear tu primera ruta".
- Impacto: Alto · Esfuerzo: M

## 2.10 Empleados y configuración

**PC-47 — La invitación es un enlace sin canal ni caducidad visible**
- Problema: no se ve que la invitación vence a las 48 h (`(p)/empleados/actions.ts:46`), no hay WhatsApp ni lista de pendientes, y se usa la jerga "Enlace mágico" (`client.tsx:99-112`). Si no hay sucursales, el Select queda vacío (`:122-131`).
- Principio: Nielsen #1; efecto Zeigarnik; Nielsen #2.
- Propuesta:
  - Botones "Copiar enlace" y "Enviar por WhatsApp".
  - "Vence el 04/10 a las 14:30".
  - Sección "Invitaciones pendientes (2)" con reenviar y revocar.
  - Sin sucursales: "Primero crea una sucursal → Configuración › Sucursales".
- Impacto: Alto · Esfuerzo: M

**PC-48 — Borrados sin confirmar**
- Problema: métodos de pago y sucursales se borran sin confirmación (`(p)/configuracion/tab-metodos-pago.tsx:267-275`, `tab-sucursales.tsx:227-235`).
- Principio: Nielsen #5 y #3.
- Propuesta: AlertDialog "¿Eliminar Pago Móvil Banesco? Los pasajeros dejarán de verlo al pagar.", o un toast con "Deshacer".
- Impacto: Alto · Esfuerzo: S

**PC-49 — El formulario de método de pago no se adapta al tipo**
- Problema: muestra todos los campos siempre, incluido "Email Zelle" para Pago Móvil, y a Pago Móvil le falta el teléfono (`tab-metodos-pago.tsx:207-211`). Usa un `<select>` nativo (`:197-205`).
- Principio: progressive disclosure; Nielsen #2.
- Propuesta: campos por tipo:
  - Pago Móvil: banco (lista con código) + teléfono 04xx + cédula.
  - Transferencia: banco + cuenta de 20 dígitos + RIF.
  - Zelle: email + titular.
  - Añadir una vista previa "Así lo verá el pasajero".
- Impacto: Alto · Esfuerzo: M

**PC-50 — Interruptores falsos e iconos sin nombre**
- Problema: "Activo/Activa" son `<span>` que se comportan como interruptor (`tab-metodos-pago.tsx:257-263`, `tab-sucursales.tsx:217-223`). Los iconos de 28 px no tienen `aria-label` (`:264-275`, `:224-235`). Estado y ciudad de la sucursal son texto libre (`tab-sucursales.tsx:167-168`).
- Principio: WCAG 2.1.1, 4.1.2 y 2.5.5; Ley de Fitts; consistencia de datos.
- Propuesta: `Switch` con label, botones de 36–40 px con `aria-label="Editar sucursal Valencia"` y selects de estado/ciudad reutilizando `ESTADOS_VENEZUELA`.
- Impacto: Medio · Esfuerzo: M

**PC-51 — Hardware fuera del alcance del taquillero**
- Problema: Hardware es un Link metido en `TabsList` (`(p)/configuracion/page.tsx:91-96`) y toda la configuración es sólo para admin (`:32-39`). No hay reconexión automática de la impresora y la UI muestra "Desconectada" junto al nombre guardado (`lib/printing/bluetooth.ts:42-49`). Las etiquetas "Online/Offline" están en inglés (`hardware/page.tsx:118-120`).
- Principio: Ley de Jakob; Nielsen #1 y #2.
- Propuesta: "Hardware" como ítem propio para ambos roles, con:
  - Reconectar al cargar.
  - "Imprimir ticket de prueba".
  - "Probar escáner".
  - "Probar sonido".
  - Ancho de papel 58/80 mm.
- Impacto: Alto · Esfuerzo: M

## 2.11 Transversal del panel

**PC-52 — `ScanInput` roba el foco y no distingue offline**
- Problema: re-enfoca a los 2 s aunque el usuario esté en otro campo (`components/scan-input.tsx:101-108`). Sin red responde "no encontrada" (`:58-60`). El placeholder dice "Tracking ID" también en el modo boletos (`:134`).
- Principio: Nielsen #3; Nielsen #9.
- Propuesta:
  - Re-enfocar sólo si `document.activeElement === document.body`.
  - Sin red: "Sin conexión: no se puede validar el código".
  - Placeholder por modo: "Escanea el QR del boleto o escribe el código".
- Impacto: Alto · Esfuerzo: S

**PC-53 — El banner de conexión no dice qué está bloqueado**
- Problema: el banner dice "Funcionalidad limitada" (`components/connectivity-banner.tsx:143`). Sondea cada 30 s cuando la spec pide 10 s (`:10`). Usa el token inexistente `destructive-foreground` (`:137`).
- Principio: Nielsen #1; WCAG 1.4.3.
- Propuesta: "Sin conexión. No puedes vender, cobrar ni escanear hasta que vuelva internet." y deshabilitar visiblemente los botones de escritura.
- Impacto: Medio · Esfuerzo: M

**PC-54 — Tablas no responsive y toasts sin semántica**
- Problema: todas las tablas usan scroll horizontal con celdas truncadas (`components/ui/table.tsx:9-12`). Sonner no tiene `richColors` ni posición (`components/ui/sonner.tsx:11-45`) y hay emojis en los toasts (`recepcion-destino/page.tsx:96`, `entrega-modal.tsx:184`). El sr-only dice "Close" en inglés (`components/ui/dialog.tsx:97`, `sheet.tsx:75`).
- Principio: responsive; WCAG 4.1.2 (idioma de la etiqueta); Nielsen #4.
- Propuesta: vista de tarjetas por debajo de `md`, `<Toaster richColors position="top-center">`, sin emojis y "Cerrar".
- Impacto: Medio · Esfuerzo: M

---

# 3. Super admin (PanelCooperativas · `/admin`)

Rutas relativas a `PanelCooperativas/src/`.

## Resumen de la superficie

El admin es funcionalmente rico (simulador de tarifas, ciclos de comisión, incidencias), pero visualmente vive aparte del sistema. Tiene su propia paleta de acento (naranja/esmeralda), superficies `slate-950` fijas que se rompen en tema claro y acciones destructivas de alto impacto (desactivar cooperativa, suspender usuario, liquidar ciclo, publicar tarifa) sin motivo, sin deshacer y con doble envío posible.

## 3.1 Shell, login y estados globales

**AD-01 — Error y 404 ilegibles en tema claro; superficies oscuras fijas**
- Problema: `app/admin/(panel)/error.tsx:19,24,33` y `not-found.tsx:7,11` usan `text-white`/`text-slate-400`, lo que en tema claro deja blanco sobre blanco. Los diálogos, `incidencia-detail.tsx` y `usuario-detail-tabs.tsx` (186 líneas con colores fijos) asumen fondo oscuro, aunque el sidebar ofrece el tema claro (`components/admin-sidebar.tsx:173`).
- Principio: WCAG 1.4.3; Nielsen #9; Nielsen #4.
- Propuesta: migrar a `bg-background`/`text-foreground`/`text-muted-foreground`. Texto de error: "No pudimos cargar esta sección. Reintenta; si persiste, comparte este código con soporte: {digest}", con el botón "Volver al resumen".
- Impacto: Alto · Esfuerzo: M

**AD-02 — Acento sin sistema**
- Problema: la marca usa `orange-600` (`admin-sidebar.tsx:94,99,145`; `app/admin/login/login-client.tsx:95,104,167`), los CTA `emerald-600` (`create-cooperativa-dialog.tsx:104`, `generar-ciclo-dialog.tsx:133`), el badge `blue-500` (`admin-sidebar.tsx:122`) y el foco `emerald` u `orange` según la tabla.
- Principio: Nielsen #4; Von Restorff diluido (si todo destaca, nada destaca); Ley de Jakob entre superficies.
- Propuesta: acción primaria con `bg-primary text-primary-foreground`. Reservar emerald para éxito, amber para advertencia y destructive para riesgo. Logo EnBus en lugar del icono `Shield`.
- Impacto: Alto · Esfuerzo: M

**AD-03 — Navegación y títulos**
- Problema:
  - El breadcrumb tiene un solo nivel (`components/admin-shell.tsx:13-30`).
  - El menú dice "Dashboard" y el H1 "Panel de Control" (`lib/admin-navigation.ts:7`, `dashboard/page.tsx:39`).
  - Hay tres estilos de H1 distintos.
  - El rol aparece como "super admin" (`admin-sidebar.tsx:151`).
  - El badge de pendientes tiene `animate-pulse` permanente y mide `text-[10px]` (`:122`).
- Principio: Nielsen #1; Nielsen #4; WCAG 2.4.8 y 2.2.2.
- Propuesta:
  - Breadcrumb "Cooperativas › Expresos del Táchira".
  - `PageHeader` único.
  - Etiqueta de rol "Superadministrador".
  - Badge estático "99+" con `aria-label="3 solicitudes pendientes"`.
- Impacto: Medio · Esfuerzo: S

**AD-04 — Login de admin**
- Problema: falta `autoComplete` (`login-client.tsx:142-163`), el error OAuth se muestra crudo (`:81`) y la opción dice "Google Workspace" (`:186`). Hay `text-slate-500` sobre `slate-950`, con ≈3,7:1.
- Principio: WCAG 1.3.5 y 1.4.3; Nielsen #9.
- Propuesta: "Continuar con Google". Error: "No pudimos iniciar sesión con Google. Intenta de nuevo o usa tu correo." Añadir "¿Olvidaste tu contraseña?".
- Impacto: Medio · Esfuerzo: S

**AD-05 — `AlertDialogAction` no se cierra ni se deshabilita: doble envío**
- Problema: la acción del diálogo no cierra el diálogo (`components/ui/alert-dialog.tsx:164-174`) y en varias acciones el botón no se deshabilita (`cooperativa-actions.tsx:276,300,325`, `ciclos-table.tsx:303`, `incidencia-detail.tsx:287`).
- Principio: Nielsen #5; Doherty (feedback inmediato).
- Propuesta: patrón único `ConfirmDialog` con `loading` ("Suspendiendo…"), botón deshabilitado y cierre al terminar.
- Impacto: Alto · Esfuerzo: S

## 3.2 Dashboard

**AD-06 — 7 KPIs en una fila, sin comparación y en la moneda equivocada**
- Problema: siete KPIs comparten fila (`dashboard/page.tsx:44`, `lg:grid-cols-7`, unos 130 px cada uno). No tienen delta (`kpi-card.tsx:23-27`), todo está en USD (`lib/utils.ts:49-51`) mientras la taquilla vende en Bs, y hay abreviaturas opacas ("Comisiones Est.", "Solicitudes Reg.", `:64,76`).
- Principio: Ley de Miller; Nielsen #1 (un dato sin referencia no sirve para decidir); Nielsen #2.
- Propuesta:
  - Dos bandas: "Finanzas hoy", con tarjetas grandes (Ingresos brutos, Comisiones estimadas), y "Operación".
  - Delta en cada KPI ("▲ 12% vs. ayer") y un sparkline de 7 días.
  - Moneda dual (ver sección 5).
- Impacto: Alto · Esfuerzo: M

**AD-07 — Tarjetas de alerta no clicables y advertencias en rojo**
- Problema: las tarjetas de Solicitudes y Alertas no enlazan a nada (`dashboard/page.tsx:75-88`), y la variante `warning` se pinta con el rojo destructive (`kpi-card.tsx:17-24`).
- Principio: Ley de Fitts; semántica de color (Gestalt de similitud).
- Propuesta: tarjeta enlazada a `/admin/solicitudes` o a `/admin/incidencias?estado=ABIERTA`, en ámbar y con "Revisar →".
- Impacto: Medio · Esfuerzo: S

**AD-08 — Gráficos y enlaces poco legibles**
- Problema:
  - Los enlaces usan `text-primary` (`cooperativas-balance-table.tsx:49`, `incidencias-recientes-table.tsx:66`), con 1,55:1.
  - El eje X de rutas se solapa (`rutas-chart.tsx:49-54`).
  - El eje Y de cooperativas usa `width={80}` y trunca los nombres (`top-cooperativas-chart.tsx:56`).
  - El gráfico de actividad no tiene YAxis.
- Principio: WCAG 1.4.3; Ley de Prägnanz.
- Propuesta: enlaces en `text-foreground` con subrayado amarillo, barras horizontales para rutas y escalas visibles.
- Impacto: Medio · Esfuerzo: S

## 3.3 Cooperativas y solicitudes

**AD-09 — Rechazar una solicitud destruye la cooperativa para siempre**
- Problema: el rechazo pone `DESACTIVADA` (`app/admin/(panel)/solicitudes/actions.ts:91-98`). La UI define ese estado como "irreversible y permanente" (`components/admin/cooperativas/cooperativa-actions.tsx:320`). Si la cooperativa intenta volver a postularse, la landing responde "Ya existe una cooperativa registrada con este RIF." (`LandingEnBus/app/registro-cooperativa/actions.ts:46`). El motivo del rechazo no se guarda.
- Principio: Nielsen #3; Nielsen #5; Nielsen #9 para el solicitante.
- Propuesta: estado `RECHAZADA` con `motivo_rechazo` y la opción de reenviar con el mismo RIF. Texto del diálogo: "La cooperativa recibirá el motivo y podrá corregir sus datos y volver a postularse." Chips de motivos frecuentes: "RIF inválido", "Datos de contacto incompletos", "Documentación pendiente".
- Impacto: Alto · Esfuerzo: M

**AD-10 — El admin decide sin ver los datos clave**
- Problema: la tabla de solicitudes no muestra representante ni mensaje (`components/admin/solicitudes/solicitudes-table.tsx:52-57`), aunque la landing los guarda en `descripcion` (`LandingEnBus/app/registro-cooperativa/actions.ts:72`). La comisión viene preseleccionada al 10% sin contexto (`aprobar-dialog.tsx:31`).
- Principio: Nielsen #6; sesgo de anclaje.
- Propuesta: hoja lateral con Representante, Teléfono, Email, Mensaje y Fecha, con las acciones dentro. En la comisión: "Por cada Bs 100 vendidos, EnBus recibe Bs 10".
- Impacto: Alto · Esfuerzo: M

**AD-11 — El correo prometido puede no salir**
- Problema: los diálogos prometen "Se enviará un correo" (`rechazar-dialog.tsx:72`), pero si el envío falla sólo queda un registro en el log (`solicitudes/actions.ts:45-55,106-115`), y el toast confirma igual.
- Principio: Nielsen #1.
- Propuesta: devolver `emailEnviado` y avisar: "Solicitud rechazada, pero no pudimos enviar el correo a {email}. [Copiar mensaje]".
- Impacto: Medio · Esfuerzo: S

**AD-12 — Desactivar o suspender en un clic, sin motivo**
- Problema: desactivar está disponible en cualquier estado y se confirma con un clic, bajo un título "⚠️ ADVERTENCIA CRÍTICA" con clases en conflicto (`cooperativa-actions.tsx:309-330,317`). Suspender no pide motivo ni notifica (`:261-281`), y el toast dice "Estado cambiado a suspendida" (`:99`). En el texto aparecen asteriscos de Markdown literales (`:271,295,319`; `cooperativa-detail-tabs.tsx:501`).
- Principio: Nielsen #5 (prevención antes que recuperación); Aesthetic-usability.
- Propuesta:
  - Desactivar exige escribir el nombre o RIF y un motivo, y muestra el impacto ("3 encomiendas en curso, 2 ciclos impagos"). Botón "Sí, desactivar permanentemente".
  - Suspender pide un motivo que se envía a la cooperativa. Toast: "Expresos X suspendida. No podrá vender ni recibir encomiendas nuevas. [Deshacer]".
  - Usar `<strong>` en lugar de asteriscos.
- Impacto: Alto · Esfuerzo: M

**AD-13 — Regex de RIF que rechaza el formato oficial**
- Problema: el placeholder sugiere "J-12345678" (`create-cooperativa-dialog.tsx:198`) y el servidor exige `^J-\d{8,9}$` (`app/admin/(panel)/cooperativas/actions.ts:25-27`), que no admite el dígito verificador con guion. Los errores sólo llegan por toast. Los límites del logo no coinciden: 2 MB en cliente frente a 5 MB en servidor (`create-cooperativa-dialog.tsx:33`, `actions.ts:60`).
- Principio: Ley de Postel; WCAG 3.3.1/3.3.3; Nielsen #4.
- Propuesta: un helper único `normalizeRif()` que acepte `[JGVEP]-?\d{8}-?\d` y produzca "J-12345678-9", con error inline. Un solo límite visible: "PNG, JPG o WebP · máx. 2 MB".
- Impacto: Alto · Esfuerzo: S

**AD-14 — Tablas sin teclado, filtros que no viven en la URL y sin paginación**
- Problema:
  - Las filas son `<tr onClick>` (`cooperativas-table.tsx:114-117`, `usuarios-table.tsx:148-151`, `incidencias-table.tsx:231-235`), y no hay ningún `aria-label` en todo el admin.
  - Los filtros son estado local (`cooperativas-table.tsx:32-44`).
  - Una cooperativa nueva aparece como "0.0 (0)" con la estrella llena (`:139-148`).
  - El detalle tiene 7 pestañas sin `?tab=` (`cooperativa-detail-tabs.tsx:53-75`) y le falta el caso PENDIENTE (`:103-111`).
- Principio: WCAG 2.1.1 y 4.1.2; Nielsen #3 (volver atrás conserva el contexto); Nielsen #2.
- Propuesta: el nombre como `<Link>`, filtros y pestaña en la URL, columnas ordenables, paginación de 25, "Sin calificaciones" en lugar de 0.0 y un badge "Pendiente de aprobación" con "Revisar solicitud".
- Impacto: Alto · Esfuerzo: M

## 3.4 Tarifas y comisiones

**AD-15 — No se puede simular la tarifa nueva antes de publicarla**
- Problema: el simulador sólo usa la tarifa vigente (`components/admin/tarifas/simulador.tsx:17-53`). "Crear e Instalar" publica sin un paso de revisión (`create-tarifa-dialog.tsx:186`). Con fecha futura, la tarifa anterior se desactiva al instante y la nueva aparece como "Activa" (`tarifas/actions.ts:41-61`, `tarifa-vigente-card.tsx:59`).
- Principio: Nielsen #5; progressive disclosure; Nielsen #1.
- Propuesta: un paso "Revisar cambios" con columnas Antes → Después y una simulación de referencia ("Caracas → Maracaibo, 5 kg: Bs 1.840 → Bs 2.110 (+14,7%)"). Botón "Publicar tarifa". Estado "Programada para 05/10 06:00".
- Impacto: Alto · Esfuerzo: M

**AD-16 — Simulador y formulario poco legibles**
- Problema:
  - El factor por minuto usa el icono `CurrencyDollar` (`create-tarifa-dialog.tsx:105`).
  - La ayuda va en `text-[10px]` (`:117-119`).
  - El slider no tiene nombre accesible y su mínimo no coincide con el del input (`simulador.tsx:124-142`).
  - El total va en amarillo (`:175,178`).
  - La fórmula usa "$" y el resultado "US$" (`:44`).
  - Se repite el icono `Scales` (`tarifa-vigente-card.tsx:48,58,70`).
- Principio: WCAG 1.4.3, 4.1.2; Nielsen #2 y #4; Gestalt de similitud (iconos iguales para cosas distintas).
- Propuesta: ayuda de al menos 12 px con el resultado en vivo ("Para 8 h: +240%"), `aria-label` y `aria-valuetext` en el slider, total en `foreground` sobre `bg-primary/15` y un icono distinto por concepto.
- Impacto: Medio · Esfuerzo: S

**AD-17 — El ciclo de comisión se genera sobre fechas no previsualizadas y excluye el último día**
- Problema:
  - Las fechas siguen editables después de la vista previa (`components/admin/comisiones/generar-ciclo-dialog.tsx:199-216`) y `handleGenerate` usa el estado actual (`:95-99`).
  - Las fechas por defecto se calculan en UTC (`:33-34`).
  - El filtro del servidor `lte(periodo_fin T03:59:59.999Z)` corta al final del día anterior (`app/admin/(panel)/comisiones/actions.ts:119`).
- Principio: Nielsen #5; confianza (los números deben cuadrar).
- Propuesta: invalidar la vista previa ante cualquier cambio (`setPreviews(null)`), mostrar "Período previsualizado: 01/09–07/09" junto a "Confirmar y generar", calcular las fechas en `America/Caracas` y corregir el límite superior.
- Impacto: Alto · Esfuerzo: S

**AD-18 — Liquidar sin soporte y con vocabulario variable**
- Problema: no se pide referencia, método ni fecha del pago (`ciclos-table.tsx:296`). La misma acción aparece como "Liquidar", "solvente", "Confirmar Liquidación", "Pagado" y "Liquidado" (`:264-307`). Los montos usan `"$"+toFixed(2)` (`:118-296`) junto a "US$ 1.234,56", las fechas mezclan ISO crudo y `es-ES` (`:244-278`), y cada "Pendiente" lleva `animate-pulse` (`:267`).
- Principio: Nielsen #4; Nielsen #3; WCAG 2.2.2.
- Propuesta: acción "Registrar pago" con los campos referencia, método y fecha. Estados "Pendiente" y "Pagado el 02/10". "Revertir" disponible 24 h con auditoría. `formatMoney` y `formatFecha` comunes. Badges estáticos.
- Impacto: Alto · Esfuerzo: M

## 3.5 Incidencias y usuarios

**AD-19 — Estado desconocido mostrado como "Resuelta" y lista sin prioridad**
- Problema: el fallback del estado es "Resuelta" (`incidencias-table.tsx:267`). La lista se ordena sólo por fecha (`lib/data/admin-incidencias.ts:15`) y los badges miden 10–11 px (`incidencias-table.tsx:240,264`).
- Principio: Nielsen #1 (estado engañoso); efecto de posición serial; Ley de Hick.
- Propuesta: fallback neutro que muestre el literal. Vista por defecto "Abiertas y en proceso", ordenada por severidad y antigüedad ("hace 3 h"). Texto de al menos 12 px.
- Impacto: Medio · Esfuerzo: M

**AD-20 — "Activar seguro" disponible cuando no corresponde**
- Problema: se puede activar con el caso ABIERTO, sin asignar y con valor declarado 0, lo que produce un "reembolso de $0.00" (`incidencia-detail.tsx:148-150,262-296`). Compite con "Tomar caso" como segundo primario (`:300-307`). Para resolver hay que tomar el caso antes (`incidencias/actions.ts:72`). Los errores muestran "ABIERTA"/"EN_PROCESO" crudos (`:24,72`) y hay una errata, "encomiendas pérdidas" (`:154`).
- Principio: Nielsen #5; Von Restorff (un solo primario por pantalla); Ley de Tesler.
- Propuesta: habilitar el seguro sólo en `EN_PROCESO` con valor mayor que 0, y si no: "Esta encomienda no declaró valor; registra la compensación manualmente". "Resolver" disponible desde ABIERTA con autoasignación. Etiquetas humanas y corregir "perdidas".
- Impacto: Alto · Esfuerzo: S

**AD-21 — Usuarios truncados a 500 y suspensión "temporal" de 100 años**
- Problema:
  - La consulta corta en 500 sin avisar (`lib/data/admin-usuarios.ts:25`) y la búsqueda es sólo en cliente (`usuarios-table.tsx:37-48`).
  - "Suspenderá temporalmente" (`usuario-actions.tsx:197`) aplica en realidad `876000h` (`usuarios/actions.ts:162`), se puede usar sobre otros superadmins y no pide motivo.
  - Un fallo de WhatsApp aparece como éxito (`usuario-actions.tsx:131`).
  - Todo lo que no es DIGITAL se etiqueta "Efectivo" (`usuario-detail-tabs.tsx:477`).
  - Todo lo que no es ENVIADO se etiqueta "Fallido" (`:542-546`).
- Principio: Nielsen #1; Nielsen #2; Nielsen #5.
- Propuesta:
  - Búsqueda en servidor con `?q=` y paginación ("1–50 de 2.340").
  - "Suspender acceso indefinidamente (podrás reactivarlo cuando quieras)", con motivo obligatorio y doble confirmación si el destino es un administrador.
  - Toast de aviso cuando un canal falle.
  - Mapa de métodos completo y un estado "En cola".
- Impacto: Alto · Esfuerzo: M

**AD-22 — Tabla de usuarios de 9 columnas y filtros sin label**
- Problema: la tabla tiene 9 columnas (`usuarios-table.tsx:128-136`). Los filtros usan etiquetas `<span>` no asociadas (`:89,105`). El filtro de cooperativas sólo lista las activas (`usuarios/page.tsx:27-28`). Las pestañas del detalle no hacen wrap (`usuario-detail-tabs.tsx:115`). La explicación de los botones deshabilitados va en `title` (`usuario-actions.tsx:147-166`).
- Principio: Ley de Miller; WCAG 1.3.1, 1.4.10 y 4.1.2.
- Propuesta: celda "Nombre + correo" en dos líneas, ocultar columnas en pantallas por debajo de `lg`, `Label htmlFor`, todas las cooperativas agrupadas por estado, pestañas con scroll y el motivo de deshabilitado visible como texto.
- Impacto: Medio · Esfuerzo: S

---

# 4. Landing (LandingEnBus)

Rutas relativas a `LandingEnBus/`.

## Resumen de la superficie

La landing usa los mismos tokens que la app (bien). Sin embargo, hoy resta confianza:

- Sus CTA no hacen nada.
- Tiene placeholders visibles y testimonios inventados.
- Faltan tildes.
- El formulario de registro rechaza el RIF de su propio ejemplo.

Hay además una segunda copia de la landing servida desde el panel.

**LP-01 — Los CTA principales no hacen nada**
- Problema: los botones son `<Button>` sin `href` ni `onClick`: "Calcular costo de envio" y "Rastrear paquete" (`components/hero.tsx:49-63`), el navbar (`navbar.tsx:81-83,117-122`), `calculator-cta.tsx:20-23` y `popular-routes.tsx:51-53`. El ancla `#rastrear` no existe (`navbar.tsx:21`). Los enlaces del footer son `#` (`footer.tsx:8-31`).
- Principio: Nielsen #1; Ley de Fitts; confianza; Peak-end.
- Propuesta: un solo CTA primario por vista. Mientras no exista la calculadora, el primario debe ser "Rastrear encomienda", con un input inline en el hero ("Ingresa tu código, ej. ENC-7KQ2…"), y el secundario "Descarga la app". Ocultar lo que no funcione y enlazar las rutas a `/envios/{origen}-{destino}`.
- Impacto: Alto · Esfuerzo: M

**LP-02 — Propuesta de valor incompleta**
- Problema: el H1 y el subtítulo sólo hablan de paquetes (`hero.tsx:37-45`), mientras la metadata promete "Envíos y Boletos" (`app/layout.tsx:12`).
- Principio: Ley de Jakob; claridad de la propuesta.
- Propuesta: H1 "Boletos de bus y encomiendas por toda Venezuela, en un solo lugar". Subtítulo "Compra tu pasaje o envía tu paquete con cooperativas verificadas. Paga con Pago Móvil y sigue tu viaje o envío en tiempo real".
- Impacto: Alto · Esfuerzo: S

**LP-03 — Placeholders, testimonios ficticios y cifras sin respaldo**
- Problema:
  - Placeholders visibles: "Imagen de servicio de envios" (`hero.tsx:68-71`) y "App Mockup" (`app-download.tsx:86-89`).
  - Testimonios inventados con 5 estrellas fijas (`testimonials.tsx:5-24,52-58`).
  - "50+ Ciudades" (`hero.tsx:8-16`) y "desde 15 USD" sin decir de qué (`popular-routes.tsx:5-10,39`).
- Principio: Aesthetic-usability; confianza (y riesgo de reseñas falsas).
- Propuesta: retirar los testimonios y mostrar "Cooperativas afiliadas" con logos reales y su ★ (spec §3.5). Cifras desde la base de datos. Precios con la aclaración "Encomienda de 5 kg · referencial al 02/10".
- Impacto: Alto · Esfuerzo: M

**LP-04 — Faltan tildes en todo el sitio**
- Problema: "envio", "Como Funciona", "Por que", "traves", "verificacion", "Abrir menu", entre otras (`hero.tsx:33-44`, `navbar.tsx:19,82,94,121`, `benefits.tsx:13-41`, `how-it-works.tsx:7-33`, `footer.tsx:17-25`, `app/layout.tsx:12-35`).
- Principio: confianza; Aesthetic-usability; SEO ("envíos").
- Propuesta: revisión ortográfica completa.
- Impacto: Medio · Esfuerzo: S

**LP-05 — El RIF de ejemplo se rechaza y el formulario borra lo escrito**
- Problema:
  - El placeholder y la ayuda dicen "J-12345678-9" (`app/registro-cooperativa/page.tsx:170,177`), pero el `pattern` es `^J-\d{8,9}$` (`:172`) y la acción del servidor aplica el mismo regex (`actions.ts:26-29`). Quien sigue el ejemplo no puede registrarse.
  - El formulario usa `useActionState` con inputs no controlados, así que un error del servidor vacía todo (`page.tsx:21,131`).
  - El error genérico "Todos los campos obligatorios son requeridos." (`actions.ts:23`) no dice qué campo falla.
- Principio: Ley de Postel; Nielsen #5 y #9; WCAG 3.3.1/3.3.3.
- Propuesta: aceptar "j123456789", "J-12345678-9" y variantes, y normalizar al salir del campo. Devolver `fieldErrors` y `values` para repintar con `defaultValue`. Resumen con `role="alert"` y foco en el primer campo con error.
- Impacto: Alto · Esfuerzo: S

**LP-06 — Expectativas contradictorias y éxito no garantizado**
- Problema: la página promete "Acceso Inmediato al Panel" (`page.tsx:85-86`) y a la vez habla de "pendiente de aprobación" (`:33,40`). El éxito pide revisar el correo (`:37-38`), pero si el envío falla sólo se registra un `console.warn` (`actions.ts:112-114`). El fallback del enlace es `http://localhost:3001` (`actions.ts:103`, `page.tsx:267`).
- Principio: Nielsen #2; Peak-end; Nielsen #1.
- Propuesta: "Configura tu panel mientras revisamos tu solicitud (24–48 h hábiles)". Mensaje de éxito: "Enviamos la invitación a **{email}**. ¿No llegó en 10 min? Revisa spam · [Reenviar] · [Escríbenos por WhatsApp]". El build debe fallar si falta la variable de entorno.
- Impacto: Alto · Esfuerzo: S

**LP-07 — Formulario: teléfono sin validar, contraste bajo y sin consentimiento**
- Problema:
  - El teléfono no tiene `inputMode` ni patrón (`page.tsx:204-212`).
  - Las etiquetas son de 12 px en mayúsculas y en `#8A8A8A` (`:145-235`).
  - El borde del input mide ≈1,1:1 (`:156`) y la ayuda del RIF va en 10 px (`:177`).
  - No hay casilla de términos y los enlaces legales son `#`.
  - Los beneficios están ocultos en móvil (`:57`).
  - La página es `"use client"` sin metadata propia (`:1`).
- Principio: Ley de Postel; WCAG 1.4.3, 1.4.11 y 2.4.7; progressive disclosure; SEO.
- Propuesta:
  - Teléfono con `inputMode="tel"`, normalizado a "0414-1234567".
  - Etiquetas de 14 px en `foreground`, bordes de al menos 3:1 y anillo de foco `#202020`.
  - Casilla "Acepto los Términos y la Política de privacidad".
  - Beneficios colapsables arriba en móvil.
  - Separar `page.tsx` (servidor, con metadata) del formulario (cliente).
- Impacto: Medio · Esfuerzo: S

**LP-08 — SEO, rendimiento y modo oscuro**
- Problema:
  - Faltan `metadataBase`, imagen OG (crítica para las vistas previas en WhatsApp), canonical, JSON-LD, `robots.ts` y `sitemap.ts` (`app/layout.tsx:11-37`).
  - La fuente `RoobertVF.ttf` pesa 740 KB.
  - Hay animaciones CSS sin uso (`globals.css:207-228`).
  - El `theme-provider` no está montado.
  - El foco amarillo es invisible sobre las secciones `bg-primary` (`components/ui/button.tsx:7`).
- Principio: Doherty (rendimiento percibido en 3G); WCAG 2.4.7; encontrabilidad.
- Propuesta: metadata completa con OG 1200×630, fuente woff2 con subset latino (unos 100 KB), limpiar el código muerto y `focus-visible:ring-foreground` sobre amarillo.
- Impacto: Alto · Esfuerzo: S

**LP-09 — Landing duplicada en el panel**
- Problema: siete componentes son idénticos en `PanelCooperativas/src/components/landing/**`. `navbar` y `footer` ya divergen (la copia del panel no tiene "Registrar Cooperativa"), y `PanelCooperativas/src/app/page.tsx:1-26` sirve una segunda home pública.
- Principio: consistencia; SEO (contenido duplicado); mantenibilidad.
- Propuesta: que `/` del panel redirija a `/cooperativas/login` o a la landing, y eliminar la copia.
- Impacto: Medio · Esfuerzo: S

**LP-10 — Faltan pagos locales y captura de interesados**
- Problema: no se mencionan Pago Móvil ni los pagos en Bs/USD. Las tiendas aparecen como "Próximamente" con `opacity-50` (`app-download.tsx:43-82`) y no hay forma de dejar el contacto. El footer dice "Una plataforma de Panas Cargo" con el año fijo (`footer.tsx:108,111`).
- Principio: Ley de Jakob (expectativas locales); efecto Zeigarnik (captar el interés pendiente).
- Propuesta: en Beneficios, "Paga con Pago Móvil, transferencia o efectivo en taquilla". Añadir "Avísame cuando esté disponible (WhatsApp)". Año dinámico y una marca única.
- Impacto: Medio · Esfuerzo: S

---

# 5. Transversal: design system y consistencia entre superficies

## 5.1 Diagnóstico

| Aspecto | App móvil | Panel cooperativas | Super admin | Landing |
|---|---|---|---|---|
| Fuente de tokens | `src/theme.ts` + `DESIGN.md` (muy disciplinado; casi sin hex en pantallas) | `globals.css` (shadcn) + decenas de clases `emerald/amber/slate` fijas | Paleta propia `orange-600`/`emerald-600` + superficies `slate-950` fijas | `globals.css` con los mismos hex que la app (bien) |
| Color de acción primaria | `accent` azul (y a veces `primary` amarillo: `PaymentFlow.tsx:378`) | `primary` amarillo / verde ad hoc | naranja / esmeralda | negro `foreground` |
| Moneda | Bs (sin formato) + USD sólo en Zelle | Bs en venta, **$ en rutas, dashboard, recepción y ticket impreso** | USD (`formatCurrency`) y "$"+`toFixed` | "desde 15 USD" |
| Mapa de estados | `estados.ts` completo, con *hint* | `status-badge.tsx` con 6 de 9 estados de encomienda y 0 de boleto | Mapas locales por componente | n/a |
| Contraste de texto secundario | #8A8A8A (3.45:1) | #8A8A8A (3.4:1) | `slate-400/500` sobre oscuro (~3.7:1) | #8A8A8A |

**DS-01 — El amarillo de marca se usa como texto en las cuatro superficies**
- Problema: #FFC757 sobre blanco da 1.55:1. Se usa para montos, PIN, asiento (app), tracking IDs y enlaces (panel), enlaces y el total del simulador (admin), y precios e iconos (landing).
- Principio: WCAG 1.4.3 / 1.4.11.
- Propuesta: una regla de sistema común: **el amarillo es superficie, nunca texto sobre blanco.** Crear el token `primary-text` / `--primary-text` (#8A5A00 o similar, ≥4.5:1) para los raros casos de texto de marca. Subir `muted-foreground` a #6B6B6B en todas las superficies. Usar un anillo de foco sólido de 2 px en `foreground` con offset (el `ring` amarillo al 50% es invisible).
- Impacto: Alto · Esfuerzo: S

**DS-02 — Tokens compartidos en un paquete**
- Problema: los mismos hex viven en tres sitios (`EnBusApp/src/theme.ts:60-77`, `PanelCooperativas/src/app/globals.css`, `LandingEnBus/app/globals.css`) y el admin los ignora.
- Principio: consistencia (Nielsen #4); Ley de Jakob interna (el gerente que usa app y panel ve una sola marca).
- Propuesta: crear `packages/tokens` (JSON de Style Dictionary) que genere `theme.ts` para RN y variables CSS para Next. Prohibir por lint las clases `bg-(emerald|amber|slate|orange|rose|blue)-\d+` en `PanelCooperativas/src` (regla `no-restricted-syntax` o plugin de Tailwind), salvo en `components/ui`. Añadir los tokens que hoy se usan sin definirse: `destructive-foreground`, `warning-foreground`, `success-foreground`.
- Impacto: Alto · Esfuerzo: M

**DS-03 — Una sola fuente de verdad para estados de dominio**
- Problema: hay cinco mapas distintos: `EnBusApp/src/utils/estados.ts`, `PanelCooperativas/src/components/status-badge.tsx:12-27`, `components/admin/usuarios/usuario-detail-tabs.tsx:57-92`, `incidencias-table.tsx:76-127` y `STATUS_FLOW` en `encomiendas/enviar/[id].tsx:31-37` / `recibir/[id].tsx:28-33`. Además, la app usa el estado `PENDIENTE_VERIFICACION` (`EnBusApp/src/utils/estados.ts:69` y lo escribe `EnBusApp/app/encomiendas/recibir/[id].tsx:243`), que **no existe** en el enum `estado_encomienda` (`supabase/migrations/20260414000001_enums.sql:2-12`). La escritura falla y el error se traga (`recibir/[id].tsx:249-251`): el destinatario cree que su pago quedó registrado.
- Principio: Nielsen #4; Nielsen #1.
- Propuesta: crear `packages/dominio/estados.ts` con `{label, labelOperador, tone, hint, etapa}` por estado y dominio (`boleto`, `encomienda`, `viaje`, `cooperativa`, `incidencia`, `ciclo`). La app usa `label` + `hint` (lenguaje del pasajero). El panel usa `labelOperador` (lenguaje de mostrador). Ambos comparten color y etapa. Alinear el enum o eliminar `PENDIENTE_VERIFICACION` (y modelar "pago en verificación" como `POR_PAGAR` + `pago.verificado=false`).
- Impacto: Alto · Esfuerzo: M

**Vocabulario actual vs. propuesto**

| Estado (BD) | App (`estados.ts`) | Panel (`status-badge.tsx` / pantallas) | Admin | **Propuesto pasajero / operador** |
|---|---|---|---|---|
| PENDIENTE_DE_ESCANEO | "Por entregar en taquilla" | "Pendiente" | "Pendiente Escaneo" | "Por entregar en taquilla" / "Por recibir" |
| EN_RECEPCION | "En recepción" | crudo `EN_RECEPCION` | "En Recepción" | "Recibida en taquilla" / "En recepción" |
| POR_PAGAR | "Por pagar" (rojo) | "Por Pagar" (ámbar) | "Por Pagar" | "Pago pendiente" (ámbar en todas) |
| PAGADA | "Pagada" (azul) | "Pagada" (verde) | "Pagada" | "Lista para despacho" / "Pagada · por despachar" |
| EN_TRANSITO | "En tránsito" | "En Tránsito" | "En Tránsito" | "En camino" / "En tránsito" |
| EN_OFICINA_DESTINO | "Lista para retirar" | crudo | "En Oficina Destino" | "Lista para retirar" / "En oficina destino" |
| ENTREGADA | "Entregada" (verde) | "Entregada" (gris) | "Entregada" | "Entregada" (verde en todas) |
| CANCELADA | "Cancelada" (neutro) | "Cancelada" (rojo) | "Cancelada" | "Cancelada" (neutro) |
| DEVUELTA | "Devuelta" | crudo | "Devuelta" | "Devuelta al remitente" |
| Boleto RESERVADO | "Reservado" | crudo "RESERVADO" (filtro) | "Reservado" | "Pago en verificación" (si hay pago) / "Reserva sin pagar" |
| Boleto PAGADO | **"Confirmado"** | crudo "PAGADO" | "Pagado" | "Confirmado" / "Pagado" |
| Boleto USADO | "Viaje completado" | "Embarcado" / crudo | "Usado" | "Viaje realizado" / "Embarcado" |

Tampoco coinciden las etiquetas de las timelines de la app: "Orden creada / Recibida en taquilla" (envío) frente a "Procesada" (recepción). Deberían salir del mismo mapa `etapa`.

**DS-04 — Glosario de producto único**
- Problema: el mismo objeto recibe nombres distintos según la pantalla. Ver APP-10 y PC-09, y además "Liquidar / solvente / Pagado / Liquidado" (AD-18), "Paga al enviar" vs "ORIGEN" vs "Pago yo ahora" vs "Pagado Origen" (APP-42, PC-31, PC-39) y "Taquillero" vs "admin cooperativa" vs "Admin Coop" vs "Administrador".
- Principio: Nielsen #2 y #4.
- Propuesta: un glosario de una página en `Specs/00_General/Glosario.md` con estos términos: **Boleto**, **Pase de abordaje** (el QR), **Viaje / Salida**, **Encomienda** (no "paquete" en títulos), **Código de seguimiento**, **PIN de retiro**, **Paga al enviar / Paga al retirar**, **Taquilla**, **Taquillero / Administrador de cooperativa / Administrador EnBus**, **Registrar pago** (acción) y **Pagado / Pendiente** (estado). Se aplica con grep en el CI.
- Impacto: Medio · Esfuerzo: S

**DS-05 — Moneda canónica y formato único**
- Problema: Bs sin formato (app), Bs/$ mezclados (panel), US$ (admin) y USD (landing). La tasa BCV sólo aparece en la app y sin fecha. El ticket térmico imprime "$" mientras la venta se registra en Bs (`PanelCooperativas/src/lib/printing/print-helpers.ts:30`).
- Principio: Nielsen #4; Nielsen #2 (el venezolano razona en USD y paga en Bs); prevención de errores de cobro.
- Propuesta: decidir la moneda canónica del precio (recomendado: **USD de referencia + cobro en Bs a tasa BCV del día**, que es la práctica local) y crear `formatMoney({ bs, usd, tasa, fechaTasa })` en el paquete compartido. Convención visual: "Bs 1.250,00" en grande y "≈ $ 12,40 · BCV 02/10" en pequeño. Las comisiones del admin se muestran en la moneda canónica y con la equivalencia.
- Impacto: Alto · Esfuerzo: M

**DS-06 — Helpers de formato venezolano compartidos**
- Problema: no existe un helper de cédula, teléfono o RIF en ninguna superficie. Las validaciones divergen: la app acepta un teléfono de 7–11 dígitos, el perfil exige 8 o más, y el RIF usa el regex `^J-\d{8,9}$` en landing y admin.
- Principio: Ley de Postel; Ley de Tesler.
- Propuesta: un paquete `@enbus/ve` con:
  - `normalizeCedula`: "v12345678" → "V-12345678"; se muestra "V-12.345.678".
  - `normalizeRif`: [JGVEP] + 8 dígitos + verificador.
  - `normalizeTelefono`: operadoras 0412/0414/0416/0422/0424/0426 y fijos 02xx; se muestra "0414-123.45.67".
  - `formatCity` (ya existe en la app; el panel muestra "San_juan").
  - `formatFechaVE` (zona `America/Caracas`; hoy hay varios cálculos en UTC que se desfasan después de las 20:00 en `despacho/page.tsx:34`, `generar-ciclo-dialog.tsx:33-34` y `taquilla/boletos/page.tsx:92-98`).
  - Componentes `CedulaField` y `TelefonoField` para RN y web.
- Impacto: Alto · Esfuerzo: M

**DS-07 — Patrón único para acciones destructivas e irreversibles**
- Problema: conviven `Alert` nativo (app), `alert()`/`confirm()` (panel viajes, rutas y empleados), `AlertDialog` que no se cierra (admin) y acciones sin ninguna confirmación (borrar método de pago o sucursal, despacho, recepción por escaneo).
- Principio: Nielsen #5 vs. recuperación; Nielsen #3; Nielsen #4.
- Propuesta: decidir por reversibilidad.
  - **Reversible y frecuente** (recibir, embarcar, quitar de la lista): ejecutar al instante con un toast "Hecho · Deshacer (10 s)". Es el patrón ideal para el mostrador.
  - **Irreversible o con impacto en terceros** (despachar, desactivar, liquidar, cancelar un boleto pagado): `ConfirmDialog` con el resumen concreto del impacto, un verbo específico en el botón ("Despachar 12 encomiendas", nunca "Aceptar"), el estado `loading` y un motivo cuando afecte a terceros.
- Impacto: Alto · Esfuerzo: M

**DS-08 — Estados de carga, error y vacío honestos**
- Problema: en las tres superficies se repite el mismo antipatrón: `catch` que sólo hace `console.error` y deja la UI en "vacío". Ejemplos en la app: `SearchForm.tsx:123`, `buscar.tsx:250`, `nueva.tsx:131`, `enviar/[id].tsx:136`. En el panel: `ScanInput` sin red responde "no encontrada".
- Principio: Nielsen #1 y #9.
- Propuesta: un tipo `AsyncState = 'loading' | 'error' | 'empty' | 'ready' | 'stale'` y componentes `ErrorState` (con "Reintentar") y `StaleBanner` ("Mostrando datos guardados · actualizado hace 2 h"). Regla de revisión de código: ningún `catch` puede terminar sólo en `console.*`.
- Impacto: Alto · Esfuerzo: M

**DS-09 — Coherencia de la experiencia de punta a punta**
- Problema: los artefactos que cruzan superficies no se corresponden entre sí.
  - El QR del pase de la app codifica "PASS-BOL-…" (`boletos/[id].tsx:414`) y el de la encomienda el UUID (`enviar/[id].tsx:251`).
  - El panel busca por tracking en `ScanInput`.
  - El PIN de retiro de la app es amarillo e ilegible, mientras el panel lo exige con autofocus ausente.
  - La app promete "1–2 días hábiles" de reembolso y el panel no tiene flujo de reembolso.
- Principio: Ley de Jakob (modelo mental compartido entre pasajero y taquillero); Nielsen #4.
- Propuesta: especificar los artefactos compartidos: formato del código corto (por ejemplo "BOL-7KQ2-M9XA" / "ENC-…"), contenido del QR, longitud del PIN y copy del ticket impreso. Validar que lo que la app muestra es exactamente lo que el panel acepta, tanto por teclado como por escáner.
- Impacto: Alto · Esfuerzo: M

**DS-10 — Accesibilidad básica transversal**
- Problema:
  - Filas `onClick` sin teclado: panel (5 sitios) y admin (3).
  - Iconos sin `aria-label`: admin no tiene ninguno.
  - En la app, el `Field` no asocia su label al input.
  - Animaciones infinitas (`animate-pulse` en admin, `PulseDot` en la app) sin respetar "reducir movimiento".
  - El sr-only "Close" de shadcn está en inglés.
- Principio: WCAG 2.1.1, 2.4.7, 4.1.2, 2.2.2 y 3.1.2.
- Propuesta: checklist de PR (teclado, nombre accesible, contraste, reduce motion) y `eslint-plugin-jsx-a11y` en los dos proyectos Next. Para RN, una auditoría con Accessibility Scanner de Android en 5 pantallas clave.
- Impacto: Medio · Esfuerzo: M

---

# 6. Top 10: mayor ratio impacto/esfuerzo

Ordenadas por relación impacto/esfuerzo, con prioridad a lo que protege dinero, confianza y el flujo principal.

| # | Mejora | Superficie | Refs | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| 1 | **Tokens de texto accesibles**: el amarillo nunca como texto, `muted` #6B6B6B y badges con primer plano oscuro de 11 pt. Arregla de un golpe monto, PIN, asiento, estados, enlaces y labels en las 4 superficies. | Todas | DS-01, APP-24, APP-32, APP-45, APP-53–55, PC (tokens), AD-08, LP-07 | Alto | S |
| 2 | **Corregir la timeline de encomiendas** que marca "Entregada" en estados intermedios o cancelados, con un mapa `estado → etapa` único. | App | APP-44, DS-03 | Alto | S |
| 3 | **Mostrar errores reales en vez de "vacío"**: salidas, fechas, asientos, listas y escaneo offline, con "Reintentar". Traducir los mensajes de Supabase. | App + Panel | APP-04, APP-12, APP-19, APP-37, PC-52, DS-08 | Alto | S |
| 4 | **Pago Móvil sin fricción**: fecha con chips "Hoy / Ayer" (hoy el teclado numérico no tiene "/"), botones "Copiar" y "Copiar todo" en los datos de la cuenta, y lista de bancos con código y sin duplicados. | App | APP-25, APP-26, APP-27 | Alto | S |
| 5 | **Checkout atómico**: crear reserva, boleto y pago en una sola operación al pulsar "Registrar pago"; eliminar el falso "Comprobante enviado → Continuar"; no tragarse el fallo del insert de pago. | App | APP-23 (+ APP-22 a medio plazo) | Alto | M |
| 6 | **Navegación de mostrador**: añadir "Entrega" al sidebar, agrupar en Mostrador / Planificación / Administración y llevar Hardware al alcance del taquillero. | Panel | PC-07, PC-08, PC-51 | Alto | S |
| 7 | **`StatusBadge` completo y vocabulario único** en app, panel y admin (sin enums crudos); eliminar `PENDIENTE_VERIFICACION` o añadirlo al enum. | Todas | DS-03, DS-04, PC-42, AD-19 | Alto | S–M |
| 8 | **Escaneo de experto**: `ScanInput` que no roba el foco, feedback sonoro y visual con "Último escaneo", Enter/Esc en los diálogos, autofocus en peso y PIN, y mensajes de rechazo por causa. | Panel | PC-18, PC-19, PC-27, PC-38, PC-41, PC-52 | Alto | M |
| 9 | **Back de Android en los wizards** (paso anterior y confirmación de salida con datos) y un borrador recuperable de la encomienda. | App | APP-08 | Alto | S |
| 10 | **Normalizador venezolano compartido** (RIF, cédula, teléfono): arregla el registro de cooperativas, que hoy rechaza el RIF de su propio ejemplo y borra el formulario ante un error, y estandariza app, panel y admin. | Landing + Admin + App + Panel | LP-05, AD-13, PC-04, APP-05, DS-06 | Alto | S |

**Inmediatamente después del top 10** (Alto, también baratas):
- Confirmación y validación de destino en el despacho (PC-32).
- Verificación obligatoria de cédula y "Cobro destino" en ámbar en la entrega (PC-39, PC-40).
- Confirmación al borrar métodos de pago y sucursales (PC-48).
- Botón y diálogo con `loading` que se cierran en el admin (AD-05).
- CTA de la landing que hacen algo, sin testimonios ficticios ni placeholders (LP-01, LP-03).
- Tarjeta "Tu próximo viaje" en el Home de la app (APP-16).
- QR con brillo máximo y código corto legible (APP-33).
