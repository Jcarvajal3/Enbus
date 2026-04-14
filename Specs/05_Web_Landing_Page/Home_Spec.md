# Landing Page: Home

## 1. Objetivo
Página pública principal, indexada por motores de búsqueda (SEO). Diseñada para promover confianza en EnBus y convertir visitantes en usuarios de la App.

## 2. Stack
- Next.js con SSR/SSG.
- Tailwind CSS + shadcn/ui.
- Meta tags OpenGraph para previews en WhatsApp/redes sociales.

## 3. Secciones de la Página

### 3.1 Hero
- Título principal impactante (ej: "Envía tus paquetes por bus en Venezuela, rápido y seguro").
- Subtítulo con propuesta de valor.
- CTA principal: **"Descarga la App"** (enlaces a App Store / Google Play).
- CTA secundario: **"Rastrea tu envío"** (scroll al módulo Track & Trace).
- Imagen/ilustración de fondo relacionada con transporte.

### 3.2 Track & Trace (Inline)
- Input de texto prominente: "Ingresa tu número de seguimiento".
- Botón: **"Rastrear"**.
- Al ingresar un Tracking ID (`EB-YYMMDD-XXXXX`):
  - Llama a la Edge Function `track-and-trace` (pública, rate-limited).
  - Muestra un `<StatusTimeline />` con el estado actual (sin datos sensibles de remitente/destinatario).
- No requiere login.
- Ver especificación completa: `Track_and_Trace_Spec.md`.

### 3.3 Cómo Funciona
- 3-4 pasos ilustrados:
  1. Crea tu envío en la App.
  2. Lleva tu paquete a la taquilla.
  3. Nosotros lo transportamos.
  4. El destinatario lo retira con su PIN.

### 3.4 Calculadora Pública
- Widget embebido para estimar costos de envío.
- Campos: Peso (kg), Origen (estado/ciudad), Destino (estado/ciudad).
- Resultado: Costo estimado + disclaimer.
- Ver especificación completa: `Calculadora_Publica_Spec.md`.

### 3.5 Cooperativas Afiliadas
- Logos de las cooperativas activas en un carrusel.
- Cada una con su calificación promedio (★).

### 3.6 Descarga la App
- Badges de App Store y Google Play.
- Mockup del celular con screenshot de la app.

### 3.7 Footer
- Links: Términos y Condiciones, Política de Privacidad, Contacto.
- Redes sociales.
- © EnBus.

## 4. SEO
- `<title>`: "EnBus — Envíos y Boletos de Bus en Venezuela"
- `<meta description>`: Descripción compelling de 150 caracteres.
- `<h1>`: Uno por página (el del Hero).
- OpenGraph: imagen, título y descripción para previews en WhatsApp.
- Structured Data (JSON-LD): Organización + ServicioLocal.
