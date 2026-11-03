# App Móvil: Sistema de Diseño

> **Obsoleto: la fuente es [`EnBusApp/DESIGN.md`](../../EnBusApp/DESIGN.md) (reglas y kit de UI de la app) y [`shared/README.md`](../../shared/README.md) (tokens y formatos comunes a la app, el panel y la landing).**
> La versión anterior de este documento (Lora + Outfit, preset de shadcn, NativeWind) ya no describe la app y se retiró. Esta página solo resume lo esencial; ante cualquier duda manda `DESIGN.md`.

## Dónde vive cada cosa

| Qué | Dónde |
|---|---|
| Colores, radios y duraciones (app, panel y landing) | `shared/tokens.json` → `node shared/generar.mjs` → `EnBusApp/src/tokens.generated.ts` |
| Tokens de la app (`Colors`, `Typography`, `Spacing`, `Sizes`, `Radius`, `Motion`, `Layout`…) | `EnBusApp/src/theme.ts` |
| Kit de UI | `EnBusApp/src/components/ui/` |
| Estado de dominio → etiqueta y tono | `EnBusApp/src/utils/estados.ts` |
| Cédula, teléfono, ciudades, fechas VE, códigos y PIN | `shared/ve.ts`, `shared/artefactos.ts` (reexportados en `src/utils/{validation,formatters,codigos}.ts`) |
| Reglas de los artefactos (boleto, QR, seguimiento, PIN) | `Specs/00_General/Artefactos_Compartidos.md` |

## Tipografía

Una sola fuente: **Roobert** (variable; el peso elige la instancia). Nunca se escribe
`fontFamily`, `fontSize` ni `fontWeight` a mano: `<Text variant="…">` con los roles
`display`, `title`, `heading`, `subheading`, `body`, `bodyStrong`, `secondary`, `label`,
`caption`, `overline` y `button`. Escala: `micro 9 · xs 11 · sm 13 · base 15 · lg 17 ·
xl 20 · 2xl 24 · 3xl 30 · 4xl 36`, cada una con su interlineado.

## Paleta

Solo modo claro.

| Rol | Token | Valor |
|---|---|---|
| Marca (superficie, nunca texto) | `primary` | `#FFC757` amarillo |
| Acento cálido | `secondary` | `#FF7648` coral |
| Acción / selección | `accent` | `#4A7FF8` azul |
| Fondos | `background` · `surface` · `surfaceDark` | blanco · `#F0EFEB` · `#E8E6E1` |
| Texto | `foreground` · `mutedForeground` | `#202020` · `#666666` |
| Bordes | `border` · `borderStrong` | `#E8E6E1` (separadores) · `#8C8C8C` (controles, ≥ 3:1) |
| Estados | `success` · `warning` · `info` · `destructive` (+ `…Light` para fondos) | verde, ámbar, azul, rojo |

## Reglas de texto

- El color vivo de marca o de estado es para superficies, bordes e iconos. **El texto
  usa `foreground`, `mutedForeground` o un token de texto**: `primaryText` `#8A5A00`,
  `successText` `#147638`, `warningText` `#A34B08`, `infoText` `#1D4ED8`,
  `dangerText` `#B91C1C` (todos ≥ 4,5:1 sobre blanco, `surface` y `surfaceDark`).
  En `Text`: `primaryText`, `successText`, `warningText`, `infoText`, `dangerText`.
- Sobre un fondo suave (`…Light`, insignias) el texto usa el tono *deep* (≥ 6:1), que
  ya aplica `StatusPalette` / `Badge`.
- Sin `#hex` ni `rgba()` fuera de `src/theme.ts` (lo comprueba ESLint); transparencias
  con `alpha(color, 0.12)`.
- Copy en español de Venezuela, con tildes, claro y accionable; montos con `<Monto>`
  (USD de referencia y Bs a la tasa BCV del día).
- Animaciones con `Motion` y respetando "reducir movimiento" (`useReducedMotion()`).
