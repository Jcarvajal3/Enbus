# shared/ — fuente única de tokens y formatos de EnBus

La app (Expo), el panel (Next.js) y la landing (Next.js) compilan por separado y no
pueden importar archivos fuera de su raíz. Por eso lo común vive aquí y un script lo
**copia** a cada proyecto como `*.generated.*`.

```
shared/
  tokens.json     colores (claro y oscuro), paleta de la app, radios y duraciones
  ve.ts           formatos venezolanos: cédula, teléfono, RIF, ciudades, fechas VE, duración
  artefactos.ts   código de boleto, QR del pase, código de seguimiento, PIN de retiro
  generar.mjs     node shared/generar.mjs [--check]   (Node ≥ 18, sin dependencias)
  tests/          pruebas de ve.ts y artefactos.ts      (npm test, Node ≥ 22.6)
```

## Uso

```bash
node shared/generar.mjs           # escribe los archivos generados que cambiaron
node shared/generar.mjs --check   # no escribe; sale con 1 y lista los que no coinciden
```

Después de editar `tokens.json`, `ve.ts` o `artefactos.ts`, ejecuta el script y
versiona los generados junto con la fuente. `--check` y las pruebas corren en el CI
(`.github/workflows/ci.yml`, job `shared`) y conviene correrlos antes de cada entrega:

```bash
node shared/generar.mjs --check
cd shared && npm test      # node --experimental-strip-types --test "tests/*.test.ts"
```

**Regla: nunca edites un `*.generated.*` a mano.** Empiezan con
`GENERADO por shared/generar.mjs — no editar a mano`; `--check` detecta cualquier
cambio. Edita la fuente en `shared/` y vuelve a generar.

## Qué genera

| Archivo | Contenido |
|---|---|
| `EnBusApp/src/tokens.generated.ts` | `palette` (paleta cruda de la app) y `tokens = { claro, movimiento, radio }` en camelCase. La app no tiene modo oscuro. `src/theme.ts` lo consume. |
| `EnBusApp/src/utils/ve.generated.ts`, `artefactos.generated.ts` | copias de `ve.ts` y `artefactos.ts` |
| `PanelCooperativas/src/app/tokens.generated.css` | `:root { … }` y `.dark { … }` con todas las variables de color, `--radius` y `--duration-*` |
| `PanelCooperativas/src/lib/ve.generated.ts`, `artefactos.generated.ts` | copias |
| `LandingEnBus/app/tokens.generated.css` | `:root { … }` (la landing no tiene modo oscuro) |
| `LandingEnBus/lib/ve.generated.ts`, `artefactos.generated.ts` | copias |

Los proyectos importan **los módulos de siempre**, que reexportan lo generado con los
mismos nombres y firmas:

- App: `src/utils/validation.ts` (cédula y teléfono), `src/utils/codigos.ts`
  (artefactos), `src/utils/formatters.ts` (`formatCity` y los formatos VE), `src/theme.ts`.
- Panel: `src/lib/ve.ts`, `src/lib/rif.ts`, `src/lib/ciudades.ts`, `src/lib/fechas.ts`;
  los artefactos se importan de `@/lib/artefactos.generated`.
- Landing: `lib/rif.ts`; el resto, de `@/lib/ve.generated` y `@/lib/artefactos.generated`.

## tokens.json

- `claro` y `oscuro`: claves en kebab-case iguales a las variables CSS
  (`"success-text": "#147638"` → `--success-text`). Deben tener las mismas claves (el
  script lo comprueba). En la app se pasan a camelCase (`tokens.claro.successText`).
- `paleta`: la paleta cruda de `theme.ts` (`yellow`, `greenText`, `borderStrong`…).
  Un valor puede apuntar a otro token: `"green-text": "{claro.success-text}"`.
- `radio` (px) y `movimiento.duration` (ms): `Radius` y `Motion.duration` de la app;
  en CSS, `--radius` (= `radio.md`) y `--duration-instant|fast|base|slow|slower|ambient`.
- Las claves que empiezan con `$` son comentarios.

### Tokens de estado (panel y landing, clases de Tailwind v4)

| Rol | Fondo suave | Texto sobre el fondo suave (≥ 6:1) | Texto sobre `background`/`card` (≥ 4,5:1) | Color vivo (iconos, bordes) |
|---|---|---|---|---|
| Éxito | `bg-success-light` | `text-success-deep` | `text-success-text` | `bg-success`, `border-success/40` |
| Aviso | `bg-warning-light` | `text-warning-deep` | `text-warning-text` | `bg-warning`, `border-warning/40` |
| Información | `bg-info-light` | `text-info-deep` | `text-info-text` | `bg-info`, `border-info/40` |
| Peligro | `bg-destructive-light` | `text-destructive-deep` | `text-destructive-text` | `bg-destructive`, `border-destructive/40` |
| Marca | `bg-primary-light` | — | `text-primary-text` | `bg-primary` |

Neutros: `bg-background`, `bg-card`, `bg-muted`, `bg-surface`, `text-foreground`,
`text-muted-foreground`, `border-border` (separadores), `border-border-strong`
(bordes de controles, ≥ 3:1). En la landing, `--input-border` (= `border-strong`)
sigue siendo el borde de `.campo-control`.

### Mapa de reemplazo de clases sueltas

La regla de lint `no-restricted-syntax` (panel y landing, `warn` hasta integrar la
oleada 2; luego `error`) avisa de cualquier `bg|text|border|ring|…-<color>-<número>`
de la paleta de Tailwind fuera de `components/ui/**`.

| Antes | Después |
|---|---|
| `bg-emerald-50/100`, `dark:bg-emerald-*/15` | `bg-success-light` |
| `text-emerald-700/800/900` sobre fondo suave · sobre `background`/`card` | `text-success-deep` · `text-success-text` |
| `border-emerald-*` | `border-success/40` |
| `amber-*` / `yellow-*` | `warning` (`bg-warning-light`, `text-warning-deep`, `text-warning-text`, `border-warning/40`) |
| `blue-*` / `sky-*` | `info` (ídem) |
| `red-*` / `rose-*` | `destructive` (`bg-destructive-light`, `text-destructive-deep`, `text-destructive-text`) |
| `slate-*` / `gray-*` / `zinc-*` / `neutral-*` | `bg-muted`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-border-strong` |
| `orange-600` (acento del admin) | `bg-primary text-primary-foreground` (acción primaria) o `text-primary-text` |
| `bg-emerald-600 text-white` (CTA) | `variant` de `Button` por defecto (`bg-primary`) |

En la app, `no-restricted-syntax` (`error`) prohíbe literales `#rgb`/`#rrggbb`/`#rrggbbaa`
y `rgb(`/`rgba(` fuera de `src/theme.ts` y `src/tokens.generated.ts`: usa `Colors` y
`alpha()`.

## ve.ts y artefactos.ts

TS puro, **sin imports**, sin `\p{…}` ni lookbehind (Hermes no los soporta). Las
fechas y horas por defecto ("03/10/2026", "2:30 p. m.") se calculan a mano con el
desfase fijo de Venezuela (UTC-4), sin Intl, para que Node, el navegador y Hermes den
el mismo texto (sin errores de hidratación); solo `formatFechaVE` con `opciones` usa
Intl. `normalizeRif` no exige el dígito verificador; `rifDigitoValido` lo comprueba
(módulo 11 del SENIAT; la letra C se acepta con cualquier dígito). Lo que ya existía conserva nombre,
firma y comportamiento; la implementación canónica es la del panel (cédula, teléfono,
RIF y fechas) y la de la app para los nombres de ciudad con tildes.

`ve.ts`: `normalizarCedula`, `cedulaValida`, `formatCedula`, `cedulaParaGuardar`,
`separarCedula`, `LETRAS_CEDULA`, `CEDULA_PLACEHOLDER`, `CEDULA_ERROR`;
`normalizarTelefono`, `telefonoValido`, `formatTelefono`, `telefonoParaGuardar`,
`telefonoWhatsApp`, `mascaraTelefono`, `OPERADORAS_MOVILES`, `TELEFONO_PLACEHOLDER`,
`TELEFONO_ERROR`; `normalizeRif`, `isValidRif`, `digitoVerificadorRif`, `rifDigitoValido`,
`RIF_PLACEHOLDER`, `RIF_AYUDA`, `RIF_ERROR`, `RIF_DIGITO_ERROR`; `normalizarCiudad` (= `normalizar_localidad` de SQL), `formatCiudad`,
`formatRuta`, `mismaCiudad`; `ZONA_VE`, `fechaVE`, `hoyVE`, `sumarDiasVE`,
`fechaHoraVEaISO`, `rangoDiaVE`, `formatFechaVE`, `formatHoraVE`, `formatFechaHoraVE`,
`formatFechaCalendario`, `formatHaceTiempo`, `formatDuracion`.

`artefactos.ts`: `formatCodigoBoleto`, `normalizarCodigoBoleto`, `qrBoleto`,
`TRACKING_RE`, `normalizarTracking`, `esTracking`, `qrEncomienda`,
`PIN_RETIRO_LONGITUD`, `PIN_MAX_INTENTOS`, `PIN_VALIDACION_MINUTOS`, `pinValido`.
Reglas de cada artefacto: `Specs/00_General/Artefactos_Compartidos.md`.

Nota sobre `mascaraTelefono`: con 4 dígitos ya añade el guion ("0414" → "0414-"). Un
campo que la use debe comparar con el valor anterior para que borrar el guion borre
también el dígito (si no, el guion vuelve a aparecer).
