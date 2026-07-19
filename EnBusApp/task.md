# P0 Fixes — EnBusApp Design System

## Phase 1: Foundation
- [x] P0-05/P0-09 Actualizar `tw/index.tsx` para importar `Typography.family` en FONT_MAP

## Phase 2: Critical Components
- [x] P0-01 Reescribir estilos en `PaymentFlow.tsx` — importar theme, StyleSheet.create, fontFamily
- [x] P0-02 Corregir `ErrorBoundary.tsx` — importar theme, colores correctos, fontFamily
- [x] P0-06 Corregir `InputField.tsx` — eliminar COLORS local, importar Colors del theme
- [x] P0-07 Corregir `Toast.tsx` — importar theme, fontFamily, accesibilidad

## Phase 3: Screens with 100% inline styles
- [x] P0-08a Migrar `login.tsx` → StyleSheet.create + tokens
- [x] P0-08b Migrar `viajes/[id].tsx` → StyleSheet.create + tokens
- [x] P0-08c Migrar `encomiendas/enviar/[id].tsx` → StyleSheet.create + tokens

# P1 Fixes — EnBusApp Design System Alignment

## Phase 4: Component Polish & Off-Brand Colors Cleanup
- [x] P1-05 Reestructurar `StarRating.tsx` — eliminar estilos inline y usar `Colors.primary` y `Colors.border`
- [x] P1-06 Reestructurar `QRCodeViewer.tsx` — eliminar colores hardcoded e inline y agregar accesibilidad
- [x] P1-07 Reparar fallback en `Spinner.tsx` para usar `Colors.primary`
- [x] P1-08 Corregir background de `SkeletonLoader.tsx` para usar `Colors.surfaceDark`
- [x] P1-10 Eliminar dependencia obsoleta `@expo-google-fonts/lora`
- [x] P1-11 Corregir color inactivo de tab en `app/(tabs)/_layout.tsx` a `Colors.tabInactive`
- [x] P1-12 Eliminar `#D97706` off-brand en `nueva.tsx` y `TransactionCard.tsx` migrando a `Colors.warning/warningLight`

# P2 & P3 Fixes — Fine Tuning & Layout Polish

## Phase 5: Style Refinement & Touch Overlap Solution
- [x] P2-04 Eliminar aritmética de espaciados en `app/(tabs)/index.tsx` usando tokens directos
- [x] P2-08 Corregir opacidades para desactivados en `src/components/CalendarModal.tsx` con tokens del theme
- [x] P2-13 Solucionar recreación de `StateAccordion` dentro de useCallback en `src/components/LocationSelector.tsx`
- [x] P3-01 Crear la guía oficial de referencia del sistema de diseño (`DESIGN.md`)
- [x] P3-04 Solucionar posible superposición táctil en `src/components/PressableScale.tsx` reemplazando overlay absoluto por AnimatedPressable
