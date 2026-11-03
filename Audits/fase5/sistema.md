# Fase 5 · Sistema de diseño: coherencia entre productos (SY-)

Alcance: lo que solo se ve **comparando** la app (EnBusApp), el panel de cooperativas, el admin y la landing. No repite auditorías de pantalla.
Limitación: las cuentas `taquillero`, `admincoop` y `superadmin` todavía no tienen rol (todas acaban en `/login`). El panel interno se revisó por código; del panel se vieron solo las pantallas públicas. La landing se revisó por código.

## 1. Reglas propuestas

1. **Una sola acción principal por pantalla, con el mismo color en los tres productos**: amarillo `primary` y texto `ink` (10,5:1). El azul es para selección y para lo que está en curso, nunca para la acción principal.
2. **Un solo color por dominio**: Boletos = azul `accent` + icono `Ticket`. Encomiendas = coral `secondary` + icono `Package`. Igual en pestañas, tarjetas, gráficos y filtros.
3. **Orden fijo**: Boletos antes que Encomiendas en todos los menús, pestañas, selectores, tarjetas y gráficos.
4. **Ningún estado se pinta a mano**: todo pasa por `StatusBadge` (app y panel) o por `estadoEncomienda` (landing), con la tabla del §4. Eso incluye cuentas, rutas, sucursales y métodos de pago.
5. **Un tono = un color, un icono y un peso** en todos los productos. "Suspendida" no puede ser ámbar en un sitio y rojo en otro.
6. **Etiquetas de campo idénticas**: "Correo", "Contraseña", "Cédula", "Teléfono", "Origen", "Destino". Sin "Email", sin "Correo electrónico", sin "Desde/Hacia".
7. **Botón de confirmar = verbo + objeto** ("Cancelar envío"). Sin "Sí, …". Para salir sin hacer nada: "Volver" si la acción empieza por "Cancelar"; si no, "Cancelar".
8. **Fechas y horas siempre con `ve.ts`**: `formatHoraVE` (12 h, "2:30 p. m.") y `formatFechaVE` ("03/10/2026"), en hora de Venezuela. Nada de `Intl` sin `timeZone`, nada de 24 h.
9. **Montos solo con `<Monto>` / `dinero.ts`. Cédula, teléfono, RIF y ciudad solo con los formateadores de `shared/ve.ts`.** Nunca el valor crudo de la base.
10. **Mismo texto para el mismo error** (`EB_*`, Auth, red) en app y panel: un catálogo compartido.
11. **Mismo comportamiento de feedback**: el error se queda visible hasta que se cierra; el éxito se va solo a los 3 s; "Sin conexión" va en ámbar, igual en app y panel.
12. **Contraste mínimo del sistema**: texto ≥ 4,5:1 y bordes de controles ≥ 3:1 (`border-strong`). El amarillo, el coral y el azul vivo nunca llevan texto blanco.
13. **Una sola marca**: el bloque "EB" (texto `ink` sobre `primary`, radio `sm`) + "EnBus". Es el mismo en el icono de la app, el favicon, la PWA, los encabezados, el sidebar y los logins.
14. **Los radios y las sombras salen de `tokens.json`** en los tres proyectos. Botones y campos son píldora (`full`) también en la landing.
15. **Iconos: una familia (Phosphor) y tres pesos**: `regular` en navegación y estados vacíos, `bold` en botones y chips, `fill` solo para iconos de estado y marca. `duotone` no se usa.

## 2. Hallazgos

| ID | P | Dónde | Problema | Cambio propuesto | Principio |
|---|---|---|---|---|---|
| SY-01 | P0 | `EnBusApp/assets/images/icon.png`, `splash-icon.png`, `favicon.png`; `EnBusApp/app.json:3` (`"name": "EnBusApp"`); `PanelCooperativas/public/icon-192.png`, `icon-512.png`; `PanelCooperativas/src/app/favicon.ico` = `LandingEnBus/app/favicon.ico`; `PanelCooperativas/public/manifest.json:7-8` | **Ningún producto tiene marca propia.** El icono de la app y el de la PWA del panel son la plantilla de Expo (la "A" azul con guías de construcción). El favicon del panel y el de la landing es el triángulo de Vercel. En el teléfono, la app se llama "EnBusApp". El color del manifest es `#09090b` (zinc de shadcn). | Exportar el bloque "EB" (texto `ink` 800 sobre `#FFC757`, radio 10/40 del lado) a `icon.png` 1024, al adaptive icon, a `splash-icon.png`, a `favicon.png`/`favicon.ico` (app, panel y landing) y a `icon-192/512.png`. `app.json` → `"name": "EnBus"`. Manifest → `theme_color: "#FFC757"`, `background_color: "#FFFFFF"`. | Confianza, estética-usabilidad, Jakob |
| SY-02 | P0 | App `src/components/ui/Button.tsx:70-76` (`accent` por defecto, `gradient`). Usos: `app/(tabs)/boletos.tsx:300`, `app/(tabs)/encomiendas.tsx:248`, login "Entrar". Panel `components/ui/button.tsx:11`. Landing `components/ui/button.tsx:11`. Capturas `app-anon-390-login.png` y `panel-anon-390-cooperativas_login.png` | **La acción principal falla AA en la app y cambia de color en cada producto.** Texto blanco de 15 pt sobre `accent` #4A7FF8 = **3,7:1**. El botón flotante `gradient` ("Buscar viaje", "Enviar encomienda") pone texto blanco sobre amarillo→coral = **1,55–2,65:1**. Además, la acción principal es azul en la app, amarilla en el panel y negra en la landing. | En la app, `Button` usa por defecto `variant='primary'` (amarillo + `ink`, 10,5:1). Se elimina la variante `gradient`: en su lugar, `primary` con `glow`. `accent` queda solo para chips y selección. En la landing, `default` pasa a `bg-primary text-primary-foreground` (en el hero amarillo se usa `bg-foreground`, como hoy, pero solo ahí). Si se mantiene el azul en la app, el fondo debe ser `palette.blueDark` #2F5FD0 (5,7:1). | WCAG 1.4.3, similitud, Jakob |
| SY-03 | P1 | Panel `components/activity-chart.tsx:20-29` y `components/admin/dashboard/activity-chart.tsx:20-29`. App `app/(tabs)/index.tsx:159-169` y la barra de pestañas | **Los colores de dominio están invertidos entre productos.** En la app, Boletos = azul y Encomiendas = coral. En los gráficos del panel, Encomiendas = amarillo y **Boletos = coral**. Quien use los dos productos lee al revés. | `boletos.color = "var(--color-chart-3)"` (azul). `encomiendas.color = "var(--color-chart-2)"` (coral). El amarillo queda para la marca y la acción principal. Se documenta en `shared/README.md` como "color de dominio". | Similitud, consistencia externa |
| SY-04 | P1 | App `app/(tabs)/index.tsx:58-67` (EB sobre `primaryLight`, radio 10); login de la app (EB en círculo pálido). Panel `components/app-sidebar.tsx:69-71` y `app/cooperativas/login/login-client.tsx:83-85,109-111` (icono `Bus`); `components/admin-sidebar.tsx:95-100` y `app/admin/login/login-client.tsx:107-110` ("EB"); landing `components/navbar.tsx:61-63` (solo texto) | **La marca tiene 5 versiones.** Hay EB pálido en cuadrado, EB pálido en círculo, autobús sobre amarillo y EB sobre amarillo. Este último es un **círculo** a 1440 px, porque `rounded-lg` = 20 px sobre un bloque de 32–40 px, y un cuadrado a 390 px. La landing usa solo texto. | Un componente `MarcaEB` por plataforma: cuadrado de 32 px (40 en login), fondo `primary`, texto "EB" `ink` 800, radio `sm` (10 px) → en el panel, `rounded-[var(--radius-sm)]`, no `rounded-lg`. Va seguido de "EnBus" y del subtítulo de zona ("Cooperativas" / "Administración"). Sustituye a `Bus` en el sidebar y en el login del panel, al `primaryLight` de la app y al texto solo de la landing. | Similitud, reconocimiento de marca |
| SY-05 | P1 | `app/cooperativas/login/login-client.tsx:113,128,159`; `app/admin/login/login-client.tsx:142,158,194`; `app/cooperativas/recuperar/recuperar-client.tsx:113`; `app/cooperativas/registro/page.tsx:251`; app `app/(auth)/login.tsx:320,404`, `recuperar.tsx:77`. Capturas `panel-anon-1440-*_login.png` | **Los dos logins del mismo panel no se parecen.** El de cooperativas tiene panel izquierdo negro forzado (`dark`), "Email" y el botón "Iniciar sesión". El del admin tiene panel beige, "Correo", "Entrar" y otro estilo de enlace. El campo de correo tiene 5 nombres: "Email", "Email de tu cuenta", "Correo", "Correo electrónico" y "Correo del…". | Las dos pantallas usan el mismo layout: panel izquierdo `bg-muted` (sin `dark` forzado), la marca de SY-04 y el mismo enlace (SY-20). Etiqueta "Correo" en todas partes, también en la app y en recuperar/registro. El botón de acceso dice "Entrar" (app, admin y cooperativas). El título de la tarjeta sigue siendo "Iniciar sesión". | Consistencia interna, Jakob |
| SY-06 | P1 | App `app/(auth)/login.tsx:110,348`, `cuenta/contrasena.tsx:39`, `(auth)/restablecer.tsx:27`; `supabase/config.toml:175` (6). Panel `cooperativas/registro/page.tsx:38`, `restablecer-client.tsx:53` (8). `errores.ts` app (fallback "6") | **La misma cuenta de Supabase tiene dos reglas de contraseña.** La app pide 6 caracteres y el panel 8. Los textos también difieren: "Usa al menos 6 caracteres." frente a "La contraseña debe tener al menos 8 caracteres.". | Añadir a `shared/ve.ts` `CLAVE_MINIMO = 8` y `CLAVE_ERROR = "Usa al menos 8 caracteres."`, y `CLAVE_AYUDA = "Mínimo 8 caracteres."` para la ayuda bajo el campo. Usarlas en los 5 formularios. `minimum_password_length = 8`. | Consistencia, prevención de errores |
| SY-07 | P1 | `EnBusApp/src/utils/errores.ts:56-90` frente a `PanelCooperativas/src/lib/errores.ts:30-34, 260-345` | **El mismo error se cuenta distinto en cada producto.** Sin red: "…Revisa tu conexión e intenta de nuevo." frente a "…Revisa tu conexión a internet e intenta de nuevo.". Genérico: "Intenta de nuevo en unos segundos." frente a "Intenta de nuevo; si sigue fallando, avísanos.". Sesión: "Inicia sesión de nuevo." frente a "…para continuar.". Enlace vencido, correo inválido, usuario inexistente y cédula duplicada también difieren. `EB_DEMASIADOS_INTENTOS`: "muchos intentos" frente a "demasiados intentos". | Crear `shared/errores.ts` (TS puro, generado como los demás) con el catálogo `MSG` de Auth, red, Postgres y respaldo `EB_*`. App y panel conservan solo los textos propios del contexto (asiento ocupado, "Otro compañero ya resolvió este pago"). | Consistencia, Tesler |
| SY-08 | P1 | Panel `components/ui/sonner.tsx` (183 llamadas `toast.*`, ninguna con `duration`); app `src/components/Toast.tsx:71-86` | **Los toasts se comportan distinto.** En la app, el error se queda hasta que se cierra y el icono va en color y en `fill`. En el panel, el error desaparece a los 4 s y los iconos son neutros: en una taquilla con prisa, el error se pierde. | En `sonner.tsx`: `closeButton`; iconos `weight="fill"` y en color (`text-success-text`, `text-destructive-text`, `text-info-text`, `text-warning-text`); `toastOptions={{ duration: 3000 }}`. Wrapper `avisarError(msg)` = `toast.error(msg, { duration: Infinity })`, usado en lugar de `toast.error`. | Visibilidad del estado, pico-final |
| SY-09 | P1 | App `app/_layout.tsx:62-75, 246-254` (`Colors.warning` sólido); panel `components/connectivity-banner.tsx:129-165` (`destructive-light`) | **"Sin conexión" va en ámbar en la app y en rojo en el panel**, con textos distintos. Solo el panel avisa de "Conexión restaurada". | Ámbar en los dos (`warning-light` + `warning-deep`, icono `WifiSlash` bold). Texto: app "Sin conexión. Ves lo último guardado."; panel "Sin conexión. No se guardarán cambios.". "Conexión restaurada" se mantiene en el panel y se añade el mismo aviso verde de 3 s en la app. | Similitud, visibilidad del estado |
| SY-10 | P1 | `components/admin/usuarios/usuarios-table.tsx:53-70`; `app/admin/(panel)/usuarios/[id]/page.tsx:36-43`; `components/admin/cooperativas/cooperativa-detail-tabs.tsx:186-188, 306-308, 352-362`; `app/cooperativas/(panel)/empleados/client.tsx:381`; `rutas/client.tsx:290-292`; `configuracion/tab-sucursales.tsx:456` | **La misma cuenta bloqueada tiene 3 nombres y 3 tonos**: "Suspendida" (rojo, admin usuarios), "Bloqueado" (rojo, ficha de cooperativa) y "Desactivado" (texto gris, empleados). "Activa" va en `outline` en usuarios y en verde en cooperativas. Hay 13 insignias de estado hechas a mano fuera de `StatusBadge`. | En `lib/estados.ts`, nuevos dominios `cuenta` (ACTIVA "Activa" exito · SUSPENDIDA "Suspendida" peligro · ELIMINADA "Cuenta eliminada" terminado) y `recurso` (ACTIVO "Activa" exito · INACTIVO "Inactiva" neutro) para rutas, sucursales y métodos. Esas 13 insignias se sustituyen por `<StatusBadge dominio=…>`. El verbo de la acción sigue la etiqueta: "Suspender cuenta" / "Reactivar cuenta" también en empleados (hoy "Desactivar cuenta"). | Similitud, Jakob |
| SY-11 | P1 | `PanelCooperativas/src/lib/estados.ts:217-222, 233`; app `src/utils/estados.ts:177`; Glosario §3 | **Mismo nombre, distinto tono, y un tono que asusta.** Una cooperativa "Suspendida" es ámbar (pendiente) y una cuenta "Suspendida" es roja. Al pasajero, su reporte "Recibido" se le muestra **en rojo** (incidencia ABIERTA = peligro), como si fuera un error suyo. | Cooperativa SUSPENDIDA → `peligro` (no puede vender: es un bloqueo, no una espera). Incidencia ABIERTA: tono `info` para el pasajero (`TONO_PASAJERO.incidencia = { ABIERTA: "info" }` en el panel; `tone: 'progress'` en la app). Para el operador sigue en `peligro`. Actualizar el Glosario §3. | Von Restorff (el rojo solo para el problema real), modelo mental |
| SY-12 | P1 | App `src/utils/formatters.ts:30-50` (`dateTime`, `timeOnly` sin `timeZone`; `timeOnly` en 24 h aunque el comentario dice "3:45 PM"); `app/boletos/[id].tsx:859`; `src/components/StatusTimeline.tsx:41`. Panel `lib/types/pagos.ts:168-180` (`formatSalidaCorta` en 24 h), `lib/utils.ts:15-41` | **La hora de salida se escribe distinto según la pantalla.** El pase de abordaje dice "14:30" en la hora del teléfono. La búsqueda y las tarjetas dicen "2:30 p. m." en hora de Venezuela. "Pagos por verificar" del panel dice "04/10 14:30" y el resto del panel "2:30 p. m.". | Borrar `timeOnly`, `dateTime` y `dateFull` de la app y usar `formatHoraVE` / `formatFechaVE(iso, {weekday:'short', day:'numeric', month:'short'})`. En el panel, `formatSalidaCorta` → `${formatFechaVE(iso,{day:'2-digit',month:'2-digit'})} · ${formatHoraVE(iso)}`. Los `dateFormatter*` de `lib/utils.ts` se sustituyen por los de `ve.ts`. | Consistencia, prevención de errores (un pasajero no debe dudar de la hora) |
| SY-13 | P1 | App `src/components/SearchForm.tsx:686-689` y `app/boletos/buscar.tsx:1228-1231` (`textTransform: 'capitalize'`). Captura `app-pasajero-390-inicio.png` | **Mayúsculas en cada palabra**: "Elige Origen Y Destino" y "Sin Salidas En Esta Ruta". Rompe la regla de mayúscula inicial que sigue todo el sistema. | Quitar `textTransform`. Poner en mayúscula solo la primera letra del texto de la fecha en `formatShortDate` (`s.charAt(0).toUpperCase() + s.slice(1)`). | Consistencia tipográfica |
| SY-14 | P1 | App `src/components/SearchForm.tsx:273` y siguiente ("Desde"/"Hacia"); `app/encomiendas/nueva.tsx` ("Origen → Destino", pin azul y pin coral); panel y landing ("Origen"/"Destino"). Capturas `app-pasajero-390-inicio.png` y `app-pasajero-390-encomiendas_nueva.png` | **El mismo dato tiene dos nombres y dos colores.** Al buscar un viaje se lee "DESDE/HACIA" con pines amarillos. Al enviar una encomienda se lee "Origen/Destino" con pin azul y pin coral (los colores de dominio de SY-03). | "Origen" / "Destino" en todas partes. En los dos flujos, el mismo `LocationTrigger` y el mismo pin (`MapPin` fill `primaryText` sobre `primaryLight`). | Similitud, Jakob |
| SY-15 | P1 | App `app/(tabs)/_layout.tsx:147-149` | **La barra de pestañas pone Encomiendas antes que Boletos**, al revés que el selector de Inicio ("Viajar · Enviar encomienda"), las tarjetas "Tu actividad", el menú del panel ("Taquilla de boletos" → "…de encomiendas") y el Glosario §4. | Orden: Inicio · Boletos · Encomiendas. | Consistencia de posición, memoria espacial |
| SY-16 | P1 | App `app/(tabs)/boletos.tsx:227,300`; `app/(tabs)/encomiendas.tsx:133,163,248`. Capturas `app-pasajero-390-boletos.png` y `app-pasajero-390-encomiendas.png` | **El mismo botón tiene tres aspectos.** "Buscar viaje" es azul en el estado vacío y degradado cuando flota. "Enviar encomienda" es azul (Enviadas), beige (Para mí) y degradado (flotante). | Los CTA de creación ("Buscar viaje", "Enviar encomienda") usan siempre `primary` con su icono de dominio, en el estado vacío y en la barra flotante. | Similitud, Jakob |
| SY-17 | P1 | Panel `components/ui/input.tsx`, `select.tsx`, `textarea.tsx`, `checkbox.tsx` (`border-input` = #E8E6E1). App `Field.tsx` (`borderStrong`) | **El borde de los campos del panel no se ve**: 1,25:1 sobre blanco y 1,15:1 sobre su relleno. En la app el borde es 3,4:1. Las capturas lo muestran: el campo del panel casi no se distingue del fondo y el de la app sí. | Sustituir `border-input` por `border-input-border` (= `border-strong`, 3,4:1) en los cuatro componentes base. El token ya existe y el README ya lo pide. | WCAG 1.4.11, consistencia |
| SY-18 | P1 | Panel `components/ui/dropdown-menu.tsx:91,116,162,204`, `select.tsx:120` (`focus:bg-accent focus:text-accent-foreground`) | **Al pasar por un menú o un selector, la opción se pinta en azul vivo con texto blanco (3,7:1).** Es el único azul de selección del panel; el sidebar marca lo activo en beige. | `focus:bg-muted focus:text-foreground` (o `bg-sidebar-accent`), igual que el ítem activo del sidebar. | WCAG 1.4.3, similitud |
| SY-19 | P1 | `PanelCooperativas/src/app/layout.tsx:14-17`; `admin/(panel)/layout.tsx:11`; `cooperativas/(panel)/configuracion/page.tsx:14`, `reembolsos/page.tsx:7`; `LandingEnBus/app/layout.tsx:23-25` | **El título de la pestaña del navegador no dice dónde estás.** Por defecto, el panel muestra el lema de la landing sin tildes ("EnBus — Envios seguros…"). Algunas páginas se duplican ("Reembolsos \| EnBus Panel \| EnBus", "Panel de Administración — EnBus \| EnBus"). Hay tres separadores: "\|", "·" y "—". | Plantilla `"%s · EnBus"` en panel y landing. Por defecto, "Panel de cooperativas · EnBus" y "Administración · EnBus". Cada página define `title` = su H1 ("Reembolsos"). | Orientación (¿dónde estoy?), consistencia |
| SY-20 | P1 | App: enlace `accent` (login "¿Olvidaste tu contraseña?", 3,2:1 sobre beige). Panel cooperativas: `text-primary-text` sin subrayado. Admin y landing: `text-foreground` + subrayado amarillo (`landing ui/button.tsx` variante `link`). Panel `ui/button.tsx:20` (`link` = `text-primary`, 1,55:1, sin usos) | **Hay tres estilos de enlace** y el de la app no llega a AA. | Enlace = texto `primary-text` (#8A5A00, 5,9:1 en blanco y 5,2:1 en beige), peso 500, subrayado con `decoration-primary` al hover/foco (web) y siempre subrayado en texto corrido. En la app, `Colors.primaryText`. Corregir la variante `link` del panel. | WCAG 1.4.3, similitud |
| SY-21 | P1 | `LandingEnBus/lib/estados.ts:110-164` (`nombreLocalidad`), `normalizarCodigoSeguimiento` (:89); usos en `app/rastrear/page.tsx`, `components/calculadora.tsx`, `popular-routes.tsx`, `lib/consultas.ts` | **La landing tiene su propia tabla de ciudades y su propio normalizador de códigos.** "cua" sale "Cúa" en app y panel, pero "Cua" en la landing; también "San Antonio del Tachira" sin tilde, y hay claves erróneas ("tario", "yritagua"). Con conectores, la landing escribe "Valle de la Pascua" y el resto "…De La…" cuando la ciudad no está en la tabla. La landing acepta "EB26100312345" sin guiones; `normalizarTracking` del panel, no. | La landing usa `formatCiudad` de `ve.generated`. En `shared/ve.ts`, el fallback de `formatCiudad` deja en minúscula los conectores (de, del, la, las, los, y), y `normalizarTracking` añade los guiones como hace la landing. Después se borran `nombreLocalidad` y `normalizarCodigoSeguimiento`. | Fuente única, consistencia |
| SY-22 | P2 | App `src/utils/estados.ts:14` (terminado y neutro → `neutral`); `src/theme.ts:497-541` | **La app no distingue "terminado" de "neutro"**: "Viaje realizado", "Vencido" y "Devuelta" se ven igual que "Cancelado". En el panel y en la landing son distintos (`bg-muted` frente a contorno). | Añadir `StatusTone 'done'` (fondo `surfaceDark`, texto `foreground`). `neutral` pasa a contorno (fondo blanco, borde `border`, texto `mutedForeground`). Mapear terminado → `done`. | Similitud con el contrato |
| SY-23 | P2 | App `ui/Badge.tsx:46` (11 pt bold, sin icono); panel `status-badge.tsx:58` + `ui/badge.tsx:8` (12 px medium) | La misma insignia de estado tiene otro peso y otro tamaño en cada producto. | Panel: `text-xs font-semibold`. App: 12 pt `semibold`. Ninguna de las dos lleva icono dentro (el icono va en banners y avisos, §4). | Consistencia tipográfica |
| SY-24 | P2 | App `ui/Button.tsx:84-89` (`danger` #dc2626 sólido); panel `confirm-dialog.tsx:309-312` (#B91C1C sólido) y `ui/button.tsx:18` (`destructive`: #dc2626 sobre su 10 %, **4,1:1**) | Tres rojos para "acción destructiva", y la variante suave del panel no llega a AA. | Confirmación destructiva = fondo `destructive-text` y texto blanco (6,5:1) en los dos. Variante suave: texto `destructive-text` sobre `destructive/10` (5,5:1); en la app, `dangerSoft.foreground = Colors.dangerText`. | WCAG 1.4.3, similitud |
| SY-25 | P2 | App `encomiendas/enviar/[id].tsx:228-236` ("Sí, cancelar" / "No, mantener"), `boletos/[id].tsx` ("Sí, cancelar reserva" / "Mantener reserva"), `useWizardBack.ts:87-95` ("Salir" / "Seguir editando"); panel `cooperativa-actions.tsx` ("Sí, desactivar para siempre"), `tarifa-programada-aviso.tsx` ("Mantenerla"), `viajes/client.tsx` ("Todavía no") | **Los diálogos de confirmación usan seis fórmulas** para confirmar y para salir sin hacer nada. | Confirmar = verbo + objeto: "Cancelar envío", "Cancelar reserva", "Salir sin guardar", "Desactivar cooperativa". Salir sin hacer nada = "Volver" cuando el verbo es "Cancelar …"; si no, "Cancelar". "Marcar llegada" / "Todavía no" → "Marcar llegada" / "Cancelar". | Consistencia, Hick |
| SY-26 | P2 | App `src/components/ui/Screen.tsx:139-142, 205-209` (`regular`, `WarningCircle`); panel `components/empty-state.tsx:15`, `error-state.tsx:93,110` (`duotone`, `CloudWarning`) | Los estados vacío y de error tienen la misma forma en app y panel, pero el icono y el peso cambian. | Peso `regular` en los dos productos. Error = `WarningCircle` en los dos. Fuera `duotone` (21 usos en el panel, 0 en la app). | Similitud, consistencia iconográfica |
| SY-27 | P2 | App `app/boletos/buscar.tsx:923-935` ("Quedan N" en `danger`; valoración con `tone="pending"` + estrella); panel `components/boletos/venta-flow.tsx:1006-1013` ("Pocos asientos" en `warning`, "Agotado" en `destructive`) | **"Quedan pocos asientos" es rojo en la app y ámbar en el panel.** La valoración (★ 4,6) usa el color de un estado "pendiente". | "Quedan N" (≤ 5) en tono `pendiente` en los dos; "Agotado" en `peligro`. Valoración: insignia neutra con `Star` fill `primaryText`, como en el panel (`cooperativas-table.tsx:82`). | Von Restorff, semántica del color |
| SY-28 | P2 | App `app/(tabs)/boletos.tsx:229,256` (`CheckCircle` en "Activos" y en el vacío "Sin boletos activos") | `CheckCircle` es el icono de "éxito" en todo el sistema, pero aquí marca una lista vacía y una pestaña. | Pestaña "Activos" y su estado vacío con `Ticket`. "Historial" con `ClockCounterClockwise` (el icono de "terminado", §4). | Semántica de iconos |
| SY-29 | P2 | Panel `components/admin/cooperativas/cooperativa-detail-tabs.tsx:243,349,350`; `components/admin/usuarios/usuario-actions.tsx:276`; `components/pagos/verificar-pago-dialog.tsx:439` | Cédulas, RIF y teléfonos crudos de la base ("04145550001") junto a otros ya formateados ("0414-555.00.01"). | `formatCedula`, `formatTelefono` y `normalizeRif` de `@/lib/ve`. | Consistencia de formatos |
| SY-30 | P2 | `PanelCooperativas/src/lib/estados.ts:364` | Rol `super_admin` = "Superadministrador"; el Glosario dice **"Administrador EnBus"**. | `super_admin: "Administrador EnBus"`. | Vocabulario único |
| SY-31 | P2 | App `src/components/ui/Monto.tsx:52` (`sm` → secundario `micro` 9 pt); panel `monto.tsx` (12 px) | La referencia "≈ USD 12,40 · BCV 02/10" sale a 9 pt en las listas de la app. El tema reserva `micro` para contadores. | `sm: { variant: 'caption' }` (11 pt). | Legibilidad |
| SY-32 | P2 | `PanelCooperativas/src/app/globals.css:77-85`, `LandingEnBus/app/globals.css:76-84`; 15 usos de `rounded` (4 px) en el panel | Los radios de la web están escritos a mano: `3xl` = 32 (token 36), `4xl` = 40 (sin token), sin `xs`. El `rounded` de 4 px queda fuera de la escala. | Que `shared/generar.mjs` escriba `--radius-xs…3xl` desde `tokens.radio`. `rounded` → `rounded-sm`. | Fuente única de tokens |
| SY-33 | P2 | `LandingEnBus/components/ui/button.tsx:7` y `.campo-control` en `app/globals.css:184` (`rounded-sm`, 10 px) | En la landing, botones y campos son rectángulos redondeados; en la app y en el panel son píldora. | `rounded-full` en `Button` y en `.campo-control`. | Similitud entre productos |
| SY-34 | P2 | `PanelCooperativas/src/lib/dinero.ts`, `EnBusApp/src/utils/dinero.ts`, `LandingEnBus/lib/dinero.ts` | `dinero.ts` está copiado a mano en tres sitios. Hoy coinciden, pero nada lo garantiza; `shared/` existe justo para esto. | Mover el contrato a `shared/dinero.ts` y generarlo. `tasaRefDe` queda en un `dinero.app.ts` de la app. | Fuente única |
| SY-35 | P2 | App `app/perfil.tsx:616-626` (`Switch`). Captura `app-pasajero-390-perfil.png` | En la web, el interruptor activo sale con el pulgar **turquesa** (`activeThumbColor` por defecto de RN-web), un color que no está en la paleta. | Añadir `activeThumbColor={Colors.white}`. | Coherencia cromática |
| SY-36 | P2 | App `app/(tabs)/boletos.tsx:247` ("Tus pasajes, reservas y pases de abordaje"), `src/components/ui/ScreenHeader.tsx:9` y `Text.tsx:9` (ejemplos "Gestiona y consulta tus pasajes"), `theme.ts:206` ("Mis Viajes, Mis Paquetes") | El subtítulo de "Mis boletos" usa los sinónimos que el Glosario prohíbe en cabeceras. La documentación del kit enseña nombres viejos. | Quitar el subtítulo (la pestaña y el título ya lo dicen). Ejemplos → "Mis boletos" / "Mis encomiendas". | Vocabulario único, menos texto |

Total: **36** (P0: 2 · P1: 19 · P2: 15).

## 3. Lo que ya es coherente (no tocar)

- Las tablas de estados (etiquetas de pasajero y operador) de app, panel y landing coinciden con el Glosario §3, salvo los tonos de SY-11 y SY-22.
- Código de boleto (`formatCodigoBoleto`), cédula y teléfono vienen de `shared/` en app y panel. `Monto` y `formatMoney` coinciden.
- Verbos frecuentes: "Reintentar" (66 usos, ninguna variante), "Guardar cambios" / "Guardando…", "Cerrar sesión" y "…" tipográfico en todas partes. Tuteo en todo el sistema (sin "usted").
- Familia de iconos única: Phosphor en los tres. En el panel no quedan clases de paleta de Tailwind ni hex sueltos; el modo oscuro usa solo tokens.

## 4. Contrato de coherencia

### 4.1 Tonos (fuente única: `StatusPalette` en la app, `StatusBadge` en el panel, `CLASES_TONO` en la landing)

| Tono | Uso | App (`StatusTone`) | Web (clases) | Icono (Phosphor, `fill` en banners) |
|---|---|---|---|---|
| exito | Hecho, válido, listo | `success` | `bg-success-light text-success-deep` | `CheckCircle` |
| pendiente | Espera algo de alguien | `pending` | `bg-warning-light text-warning-deep` | `Clock` |
| info | En curso, avanza solo | `progress` | `bg-info-light text-info-deep` | `ArrowCircleRight` |
| peligro | Rechazado o bloqueado: requiere acción | `danger` | `bg-destructive-light text-destructive-deep` | `XCircle` |
| terminado | Cerrado sin incidencia (historial) | `done` (nuevo, SY-22) | `bg-muted text-foreground` | `ClockCounterClockwise` |
| neutro | Anulado o inactivo | `neutral` (contorno) | `border border-border bg-background text-foreground` | `Prohibit` |
| aviso (no es un estado) | "Quedan 3", tasa desactualizada, sin conexión | `pending` | ídem pendiente | `Warning` |
| error de formulario (no es un estado) | Mensaje bajo el campo o en el diálogo | `dangerText` | `text-destructive-text` | `WarningCircle` |

Mensajes informativos que no son estado: `Info`. Las insignias (`StatusBadge`) no llevan icono; los banners, avisos y toasts sí (icono `fill` en el color vivo del tono).

### 4.2 Tabla única de estados

| Dominio · estado | Pasajero (app, landing) | Operador (panel, admin) | Tono |
|---|---|---|---|
| boleto · RESERVA_SIN_PAGAR | Sin pagar | Reserva sin pagar | pendiente |
| boleto · PAGO_EN_VERIFICACION | Pago en verificación | Pago por verificar | pendiente |
| boleto · PAGO_RECHAZADO | Pago rechazado | Pago rechazado | peligro |
| boleto · RESERVADO | Apartado | Apartado | pendiente |
| boleto · PAGADO | Confirmado | Pagado | exito |
| boleto · USADO | Viaje realizado | Embarcado | terminado |
| boleto · CANCELADO | Cancelado | Cancelado | neutro |
| boleto · EXPIRADO | Vencido | Vencido | terminado |
| reembolso · PENDIENTE | Reembolso pendiente | Por devolver | pendiente |
| reembolso · PROCESADO | Reembolsado | Devuelto | exito |
| encomienda · PENDIENTE_DE_ESCANEO | Por entregar en taquilla | Por recibir | pendiente |
| encomienda · EN_RECEPCION | Recibiéndose en taquilla | En recepción | pendiente |
| encomienda · POR_PAGAR | Pago pendiente | Por cobrar | pendiente |
| encomienda · PAGADA | Pagada · por salir | Lista para despacho | info |
| encomienda · EN_TRANSITO | En camino | En tránsito | info |
| encomienda · EN_OFICINA_DESTINO | Lista para retirar | En oficina de destino | exito (pasajero) / info (operador) |
| encomienda · ENTREGADA | Entregada | Entregada | exito |
| encomienda · CANCELADA | Cancelada | Cancelada | neutro |
| encomienda · DEVUELTA | Devuelta al remitente | Devuelta al remitente | terminado |
| cobro encomienda · COSTO_PENDIENTE / SIN_PAGO / EN_VERIFICACION / RECHAZADO / PAGADO / NO_APLICA | Costo por calcular / Sin pagar / Pago en verificación / Pago rechazado / Pago confirmado / Sin cobro | Sin costo / Por cobrar / Por verificar / Rechazado / Pagado / Sin cobro | neutro / pendiente / pendiente / peligro / exito / neutro |
| pago · PENDIENTE | En verificación | Por verificar | pendiente |
| pago · APROBADO | Confirmado | Aprobado | exito |
| pago · RECHAZADO | Rechazado | Rechazado | peligro |
| viaje · PROGRAMADO | Programado | Programado | info |
| viaje · EN_CURSO | En ruta | En ruta | info |
| viaje · COMPLETADO | Completado | Completado | terminado |
| viaje · CANCELADO | Cancelado | Cancelado | neutro |
| cooperativa · PENDIENTE | — | En revisión | pendiente |
| cooperativa · RECHAZADA | — | Rechazada | peligro |
| cooperativa · ACTIVA | — | Activa | exito |
| cooperativa · SUSPENDIDA | — | Suspendida | **peligro** (antes pendiente, SY-11) |
| cooperativa · DESACTIVADA | — | Desactivada | neutro |
| cuenta · ACTIVA *(nuevo, SY-10)* | — | Activa | exito |
| cuenta · SUSPENDIDA *(nuevo)* | — | Suspendida | peligro |
| cuenta · ELIMINADA *(nuevo)* | Cuenta eliminada | Cuenta eliminada | terminado |
| recurso (ruta, sucursal, método) · ACTIVO / INACTIVO *(nuevo)* | — | Activa / Inactiva | exito / neutro |
| incidencia · ABIERTA | Recibido | Abierta | **info** (pasajero, SY-11) / peligro (operador) |
| incidencia · EN_PROCESO | En revisión | En proceso | pendiente |
| incidencia · RESUELTA | Resuelto | Resuelta | exito |
| ciclo de comisión · false / true | — | Pendiente / Pagado el dd/mm | pendiente / exito |
| tarifa · vigente / programada / histórica | — | Vigente / Programada / Anterior | exito / info / neutro |
| disponibilidad (aviso) · ≤ 5 / 0 | Quedan N / Agotado | Quedan N / Agotado | pendiente / peligro |

Nota: "Sin costo" (operador, COSTO_PENDIENTE) es una propuesta para completar la columna, porque hoy el panel no tiene la tabla de cobro como dominio.

### 4.3 Dominios, marca y formatos

| Concepto | Canon |
|---|---|
| Boletos | Azul `accent` · `Ticket` · siempre antes que Encomiendas |
| Encomiendas | Coral `secondary` · `Package` |
| Acción principal | Amarillo `primary` + texto `ink` (los tres productos) |
| Selección (chip, pestaña activa) | Azul: `accent` como fondo solo con texto ≥ 18 pt bold; si no, `blueDark` |
| Enlace | `primary-text`, subrayado |
| Marca | Bloque "EB" (`ink` sobre `primary`, radio `sm`) + "EnBus" · subzona: "Cooperativas" / "Administración" |
| Hora | `formatHoraVE` → "2:30 p. m." |
| Fecha | `formatFechaVE` → "03/10/2026"; corta "vie. 03/10" (`formatHaceTiempo`) |
| Fecha y hora | "03/10/2026 · 2:30 p. m." |
| Monto | `<Monto>` → "Bs 1.250,00" + "≈ USD 12,40 · BCV 02/10" |
| Cédula / teléfono / RIF | "V-30.000.001" / "0414-555.00.01" / "J-12345678-9" (`shared/ve.ts`) |
| Boleto / seguimiento / PIN | "BOL-7CAB-E4AD" / "EB-261003-12345" / 4 dígitos (`shared/artefactos.ts`) |
| Ciudad | `formatCiudad` → "Puerto La Cruz", "San Juan de los Morros" |
| Título de pestaña del navegador | "<H1> · EnBus" |

### 4.4 Verbos y etiquetas canónicas

| Situación | Usar | No usar |
|---|---|---|
| Acceder | Título "Iniciar sesión"; botón **"Entrar"**; cargando "Entrando…" | "Iniciar sesión" en el botón, "Ingresar", "Acceder" |
| Salir de la cuenta | "Cerrar sesión" | "Salir" |
| Crear cuenta | "Crear cuenta" (app) · "Registra tu cooperativa" (panel) | "Regístrate" |
| Campos | "Correo", "Contraseña", "Cédula", "Teléfono", "Origen", "Destino", "Fecha" | "Email", "Correo electrónico", "Desde", "Hacia" |
| Ayuda de contraseña | "Mínimo 8 caracteres." / error "Usa al menos 8 caracteres." | Cualquier otra fórmula |
| Avanzar en un asistente | "Continuar" | "Siguiente" |
| Retroceder dentro de un asistente / cerrar sin hacer nada tras "Cancelar …" | "Volver" | "Atrás", "No, mantener", "Mantenerla", "Todavía no" |
| Cerrar un diálogo neutro | "Cancelar" | "Cerrar" (solo para la × y los toasts) |
| Guardar | "Guardar cambios" (edición) · "Guardar <objeto>" (alta) · "Guardando…" | "Aceptar", "OK" |
| Confirmar acción | Verbo + objeto: "Cancelar envío", "Cancelar reserva", "Desactivar cooperativa", "Marcar llegada" | "Sí, …", "Confirmar" a secas |
| Salir de un asistente con datos | Título "¿Salir sin terminar?" · botones "Salir sin guardar" / "Seguir editando" | — |
| Reintentar | "Reintentar" / "Reintentando…" | "Intentar de nuevo", "Actualizar" (salvo refrescar datos) |
| Pagos | Acción "Registrar pago"; estados "Pagado", "Pendiente" | "Pagar" como estado |
| Comprar | "Buscar viaje" · "Apartar y pagar en taquilla" | "Reservar" como verbo |
| Encomienda | "Enviar encomienda" · "Código de seguimiento" · "PIN de retiro" | "Paquete", "tracking", "guía" (salvo la guía impresa) |
| Roles | Pasajero · Taquillero · Administrador de cooperativa · Administrador EnBus | "Superadministrador", "super admin" |
| Métodos de pago | Pago Móvil · Transferencia · Zelle · Efectivo | — |
| Puntuación | Mayúscula solo inicial · "…" tipográfico · sin "¡!" salvo un único éxito de cierre por flujo | Mayúscula en cada palabra (`capitalize`) |

## 5. Capturas usadas

- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-anon-390-login.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-pasajero-390-inicio.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-pasajero-390-boletos.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-pasajero-390-encomiendas.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-pasajero-390-encomiendas_nueva.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-pasajero-390-perfil.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/app-pasajero-390-cuenta_eliminar.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/panel-anon-1440-cooperativas_login.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/panel-anon-1440-admin_login.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/panel-anon-1440-cooperativas_registro.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/panel-anon-390-cooperativas_login.png
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/favicon_panel.png (favicon.ico del panel y de la landing)
- /tmp/claude-0/-home-user/d6a5fb77-1245-58c6-b016-af5f49bf2d6a/scratchpad/qa/sistema/favicon_app.png
- /home/user/enbus/EnBusApp/assets/images/icon.png · /home/user/enbus/PanelCooperativas/public/icon-192.png
