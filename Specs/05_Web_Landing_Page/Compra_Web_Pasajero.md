# Compra web para el pasajero (boletos y encomiendas)

Fecha: 2026-11-24. Reemplaza lo dicho en `Rediseno_Portada_Pasajero.md` §4 ("no hay compra en la web"):
desde ahora la web es una versión web de la app del pasajero.

## Objetivo

- La portada (`/`) va directo al grano, al estilo Kayak: buscador de pasajes (origen ⇄ destino, fecha)
  y cotizador de encomiendas arriba, y **salidas reales** visibles sin iniciar sesión.
- Buscar y ver viajes es público. Para **continuar** (elegir asientos, registrar una encomienda) se pide
  iniciar sesión y se vuelve al mismo punto (`?next=`).
- El pasajero tiene su área: mis boletos, mis encomiendas y configuración de la cuenta.
- Paridad funcional con la app (EnBusApp): mismas RPC, mismas reglas, mismos formatos (`shared/`).

## Reglas que no se negocian

- No se toca la base de datos (sin migraciones nuevas). Todo se resuelve con lo que ya existe.
- **Nunca** se mencionan comisiones (ver memoria "comisiones en pausa").
- Formatos solo desde `src/lib/*.generated.ts` y `src/lib/{ve,dinero,fechas,errores}.ts`
  (teléfono `0414-123.45.67`, cédula `V-12345678`, Bs `1.250,50`, hora y fecha en America/Caracas).
  Campos de formulario desde `src/components/campos/*` (TelefonoField, CedulaField, MontoField,
  BancoField, FechaField, CiudadField, Calendario…). Nada de formateadores nuevos duplicados.
- Montos: precio en USD en BD; se muestra Bs como principal y "≈ USD x · BCV dd/mm" (como la app).
- Lint del proyecto (`eslint.config.mjs`): sin `weight="duotone"`, `size-N` en vez de `h-N w-N`,
  sin `rounded` suelto, sin `toast.error` (usar `avisarError` de `@/lib/avisos`), sin colores sueltos
  de la paleta Tailwind, jsx-a11y en error.
- Next 16: el middleware es `src/proxy.ts`. Leer `node_modules/next/dist/docs/` antes de usar APIs
  de Next (caché, `searchParams` asíncronos, server actions, etc.).
- Estilo del sitio: todo vive bajo `.sitio` (`src/app/(sitio)/sitio.css`, tokens `--s-*`, primitivos
  `.s-boton`, `.s-chip`, `.s-tarjeta`…) + CSS Modules por componente. Los campos de `components/campos`
  y `components/ui` (Tailwind con los tokens de `shared/tokens.json`) se pueden usar dentro del sitio.
- Móvil primero: 360 px sin scroll horizontal; filtros en hoja inferior en móvil.
- Accesibilidad: etiquetas reales, foco visible, `aria-live` para resultados y errores.
- Nada se commitea sin que lo pida el usuario.

## Roles y sesión

- Pasajero = `profiles.role = 'user'`. Staff (`taquillero`, `admin_cooperativa`, `super_admin`) comparte
  cookies en el mismo dominio: en el área de pasajero se le muestra un aviso ("Esta cuenta es del panel
  de cooperativas; para comprar usa una cuenta de pasajero") con botón para cerrar sesión. Nunca se le
  redirige al panel ni se crea un bucle (PN-01).
- Perfil "completo" = `cedula_rif` y `telefono` válidos y sin prefijo `PENDIENTE-` (lo pone
  `handle_new_user` si faltan). Para reservar asientos se exige perfil completo (igual que la app):
  se pide en línea, sin sacar al usuario del flujo.
- `src/proxy.ts`: el matcher suma las rutas del pasajero para renovar la sesión. `/cuenta/**` y
  `/comprar/**` sin sesión → `/ingresar?next=<ruta+query>`. El resto del sitio no pasa por el proxy.

## Mapa de rutas (todas en `src/app/(sitio)/`)

| Ruta | Acceso | Qué es |
|---|---|---|
| `/` | público | Buscador (pestañas Pasajes / Encomiendas) + próximas salidas + rutas populares + rastreo + preguntas + app |
| `/viajes?origen=&destino=&fecha=` | público | Resultados tipo Kayak: tira de fechas, orden, filtros, tarjetas |
| `/comprar/boleto/[viajeId]?paso=asientos\|pasajeros\|pago\|listo` | sesión | Compra de boletos |
| `/enviar?origen=&destino=&peso=` | público el paso 1 | Cotiza; para registrar pide sesión |
| `/ingresar`, `/crear-cuenta`, `/recuperar-clave`, `/restablecer-clave` | público | Auth del pasajero |
| `/auth/callback` | público | Callback de correo y Google del pasajero (solo acepta `next` relativo y del sitio) |
| `/cuenta` | sesión | Redirige a `/cuenta/boletos` |
| `/cuenta/boletos`, `/cuenta/boletos/[id]` | sesión | Próximos / historial, detalle con QR, pagar reserva, cancelar |
| `/cuenta/encomiendas`, `/cuenta/encomiendas/[id]` | sesión | Enviadas / recibidas, detalle con historial, QR, PIN, pagar |
| `/cuenta/configuracion` | sesión | Datos personales, notificaciones, contraseña, eliminar cuenta |

## Datos

Búsqueda pública (solo servidor, `import "server-only"`): `viajes` y `rutas` son solo `authenticated`,
así que se leen con el cliente de service role (`supabaseSitio()` de `src/lib/sitio/consultas.ts`)
**seleccionando solo columnas públicas** (nunca chofer, placa ni datos de pasajeros). Mismos filtros
que la app: `estado = PROGRAMADO`, `asientos_disponibles > 0`, `rutas.activa`, `rutas.precio_pasaje > 0`,
`cooperativas.estado = ACTIVA`, `fecha_hora_salida > now()`; día en America/Caracas; ciudades
normalizadas como la app (`normalizar*` de `ve.generated.ts`).

RPC del pasajero (con el cliente de sesión `createClient()` de `@/lib/supabase/server`, desde server
actions; devuelven `{ success: true, data } | { success: false, error, codigo? }`):

- Boletos: `fn_asientos_ocupados(p_viaje_id)` → `fn_reservar_asientos(p_compra_id, p_viaje_id, p_asientos)`
  (reserva 30 min) → `fn_asignar_pasajeros(p_compra_id, p_pasajeros jsonb [{asiento,nombre,cedula,telefono}])`
  → `fn_checkout_boletos(p_compra_id, p_viaje_id, p_asientos, p_metodo_pago_id, p_numero_referencia,
  p_fecha_transaccion, p_banco_emisor, p_monto_declarado, p_tasa_esperada, p_idempotency_key,
  p_comprobante_path)`; `fn_liberar_reserva(p_compra_id)` al abandonar; `fn_cancelar_boleto(p_boleto_id, p_motivo)`.
  Errores: `EB_TASA_CAMBIO` (pedir confirmar el nuevo total), `EB_ASIENTO_OCUPADO` (volver al mapa),
  `EB_DATOS_PASAJERO`, `EB_PAGO_YA_REGISTRADO`, `EB_TASA_NO_DISPONIBLE`.
- Encomiendas: `fn_cotizar_envio_publico(p_peso_kg, p_ciudad_origen, p_ciudad_destino)` (público),
  `fn_sucursales_en_ciudad(p_cooperativa_id, p_ciudad)`, INSERT en `encomiendas` con `sender_id = uid`,
  `estado = 'PENDIENTE_DE_ESCANEO'`, `idempotency_key` (23505 = éxito), y luego
  `fn_registrar_pago_encomienda(...)` cuando está `POR_PAGAR` (costo lo fija la taquilla al pesar).
- Pagos: métodos de `metodos_pago_cooperativa` (activos; sin EFECTIVO ni PUNTO_DE_VENTA en línea).
  Pago Móvil, Transferencia, Zelle. Boletos admiten además "Apartar y pagar en taquilla" (la reserva
  queda 30 min, sin RPC). Comprobante: bucket `comprobantes-pago`, ruta `<uid>/<uuid>.<ext>`,
  JPG/PNG/WEBP ≤ 5 MB, obligatorio en Pago Móvil. Tasa: `fn_tasa_bcv_vigente()`.
- Cuenta: `profiles` (nombre_completo, cedula_rif, telefono, notif_boletos, notif_encomiendas,
  notif_recordatorios), `updateUser({ password })`, `fn_eliminar_mi_cuenta(p_motivo)` + función
  `eliminar-cuenta`.
- QR: boleto = `qrBoleto()` de `artefactos.generated.ts` (o `qr_embarque_data`), encomienda =
  `qrEncomienda()`; dibujar con `qrcode.react`.

## Contratos compartidos (fase 1 los crea, fase 2 los usa)

- `src/lib/pasajero/sesion.ts` (server-only):
  `obtenerPasajero(): Promise<Pasajero | null>` (cacheado por petición con `cache`),
  `exigirPasajero(next: string): Promise<Pasajero>` (sin sesión → `redirect('/ingresar?next=…')`;
  staff → página de aviso), tipo `Pasajero = { id, email, rol, nombre, cedula, telefono, perfilCompleto, esPasajero }`.
- `src/lib/pasajero/rutas.ts`: constantes y constructores de URL
  (`urlViajes({origen,destino,fecha})`, `urlComprarBoleto(viajeId)`, `urlIngresar(next)`, …).
- `src/lib/pasajero/estados.ts`: estado visible de boleto y encomienda (port de `EnBusApp/src/utils/estados.ts`).
- `src/components/pasajero/pago/`: `<PagoPasajero>` reutilizable (lista de métodos de la cooperativa con
  datos para pagar y botón copiar, total Bs/USD con tasa, campos referencia/fecha/banco/monto/comprobante,
  validación) + `subirComprobante(file)` (cliente) + `leerMetodosPago(cooperativaId)` (server).
- `src/components/pasajero/perfil-completo.tsx`: formulario en línea de cédula y teléfono + action.

## Reparto de trabajo

Fase 1 (en paralelo, archivos disjuntos):
- **A · Sesión y cuenta base**: `src/proxy.ts`, `src/lib/supabase/middleware.ts`, `src/lib/pasajero/{sesion,rutas}.ts`,
  páginas de auth y `/auth/callback`, `components/pasajero/auth/*`, `components/pasajero/perfil-completo.tsx`,
  menú de cuenta en la barra (`components/sitio/barra*.tsx|css`, cliente, para que la portada siga estática),
  `app/(sitio)/cuenta/layout.tsx` + `cuenta/page.tsx` (navegación del área).
- **B · Portada y búsqueda**: `src/lib/pasajero/viajes.ts`, `app/(sitio)/page.tsx`, `components/sitio/inicio/*`,
  `app/(sitio)/viajes/**`, `components/pasajero/busqueda/*`, `app/(sitio)/acciones.ts`.
- **P · Pago y estados**: `components/pasajero/pago/*`, `src/lib/pasajero/{estados,pagos}.ts`.

Fase 2 (en paralelo):
- **C · Compra de boleto**: `app/(sitio)/comprar/**`, `components/pasajero/compra-boleto/*`.
- **D · Enviar encomienda**: `app/(sitio)/enviar/**`, `components/pasajero/encomienda/*`.
- **E · Área de cuenta**: `app/(sitio)/cuenta/{boletos,encomiendas,configuracion}/**`, `components/pasajero/cuenta/*`.

Fase 3: revisión, `npx tsc --noEmit`, `npm run lint`, `npm run build`, prueba en navegador.

## Configuración externa (la hace el usuario)

- Supabase Auth → URL Configuration: añadir `<dominio>/auth/callback` (y `http://localhost:3000/auth/callback`)
  a Redirect URLs para confirmación de correo, recuperación y Google.
