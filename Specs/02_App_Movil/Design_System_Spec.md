# App Móvil: Sistema de Diseño

## 1. Filosofía
La app debe mantener el **mejor diseño UI del mundo**: un aspecto **ultramoderno, premium, limpio y vibrante**. Nos enfocamos en una estética luminosa, con un uso magistral de los espacios en blanco, jerarquías tipográficas claras y acentos visuales dorados.

Se utiliza el preset shadcn/ui `b38BG2CiQ` (estilo **Maia**, base **Neutral**) como ancla para los tokens de diseño, **estrictamente en modo claro (Light Mode Only)**. Se elimina cualquier soporte o referencia al modo oscuro para mantener la frescura y la estética diáfana que caracteriza a las apps financieras o utilitarias de primer nivel en la actualidad.

> **Preset Code**: `b38BG2CiQ`
> **Estilo**: Maia (Radix) adaptado para UI Premium
> **Base de Color**: Neutral Modificada (Fondos ultra claros grisáceos con tarjetas blancas puras)
> **Modo**: ☀️ Light Mode Only

## 2. Tipografía

### 2.1 Estrategia Tipográfica
La combinación de una tipografía serif clásica con una sans-serif geométrica moderna es el secreto de esta UI premium.

- **Fuente de Títulos y Cifras (KPIs)**: **Lora** (Google Fonts, Serif) — Aporta elegancia, autoridad y un toque editorial premium. Se usa en títulos de sección, subtítulos, y números/montos de gran escala (ej. $420,000).
- **Fuente de Cuerpo y UI**: **Outfit** (Google Fonts, Sans-Serif) — Aporta un aspecto moderno, limpio, geométrico y altamente legible. Se usa en párrafos, labels, botones, inputs y metadatos complementarios.
- **Fallback Web**: Lora -> `Georgia, serif`, Outfit -> `system-ui, sans-serif`.

### 2.2 Implementación en Expo (Paso a Paso)

#### Paso 1: Dependencias
```bash
npx expo install expo-font @expo-google-fonts/lora @expo-google-fonts/outfit expo-splash-screen
```

#### Paso 2: Cargar fuentes en Root Layout (`app/_layout.tsx`)
```tsx
import { useFonts, Lora_600SemiBold, Lora_700Bold } from '@expo-google-fonts/lora';
import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold } from '@expo-google-fonts/outfit';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'Lora-SemiBold': Lora_600SemiBold,
    'Lora-Bold': Lora_700Bold,
    'Outfit-Regular': Outfit_400Regular,
    'Outfit-Medium': Outfit_500Medium,
    'Outfit-SemiBold': Outfit_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  // ... resto del layout
}
```

#### Paso 3: Configurar NativeWind / Tailwind (`tailwind.config.js`)
```js
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit-Regular', 'sans-serif'], // Por defecto para la UI
        medium: ['Outfit-Medium', 'sans-serif'],
        semibold: ['Outfit-SemiBold', 'sans-serif'],
        heading: ['Lora-Bold', 'serif'],
        'heading-semi': ['Lora-SemiBold', 'serif'],
      },
    },
  },
};
```

### 2.3 Tabla de Uso y Jerarquía

| Elemento | Fuente | Peso | Tamaño (Mobile) | Clase Tailwind |
|---|---|---|---|---|
| Grandes Cifras (Ej. $420,000) | **Lora** | Bold (700) | `36px` a `48px` | `font-heading text-4xl` / `text-5xl` |
| Títulos de sección | **Lora** | Bold (700) | `20px` a `28px` | `font-heading text-xl` / `text-2xl` |
| Subtítulos / Títulos de Card | **Lora** | Semi-Bold (600) | `16px` a `18px` | `font-heading-semi text-base` / `text-lg` |
| Etiquetas de Categoría (Ej. RETIREMENT)| **Outfit** | Medium (500) | `11px` - `12px` | `font-medium text-[11px] tracking-widest uppercase text-muted-foreground` |
| Cuerpo de texto principal | **Outfit** | Regular (400) | `14px` - `16px` | `text-base` |
| Texto secundario / Descriptivo | **Outfit** | Regular (400)| `13px` - `14px` | `text-sm text-muted-foreground` |
| Botones primarios (CTAs) | **Outfit** | Semi-Bold (600)| `16px` | `font-semibold text-base` |
| Inputs / Placeholders | **Outfit** | Regular (400)| `15px` - `16px` | `text-base placeholder:text-muted-foreground` |

### 2.4 Reglas Estrictas Tipográficas
- **Lora** debe emplearse *exclusivamente* para encabezados de página, títulos de tarjetas y montos/estadísticas heroicas (el contenido principal con el que el usuario reacciona primero).
- **Outfit** se utiliza para toda la interfaz visual y datos secundarios donde la claridad minuciosa es primordial.
- **NUNCA** mezclar la fuente Serif con los inputs, labels de inputs o botones.

## 3. Paleta de Colores y Contrastes

La aplicación está diseñada para funcionar **solo en Modo Claro (Light Mode)**. Cualquier indicativo de variante dark debe descartarse.

| Token | HEX Aprox. | Definición Visual y Uso |
|---|---|---|
| `--background` | `#F8F9FA` | Gris ultra-claro y neutral. El lienzo sobre el que todo descansa. Da aire al diseño. |
| `--foreground` | `#111827` | Texto principal. Es un gris oscuro profundo, para no abrumar como el negro absoluto. |
| `--card` | `#FFFFFF` | Blanco puro absoluto. Crea un contraste visual inmediato con el fondo, acentuando los componentes. |
| `--card-foreground` | `#111827` | Texto o contenido sobre las superficies blancas. |
| `--primary` | `#FFC107` / `#FBBF24` | **Amarillo Premium / Dorado Brillante**. Para las acciones imperativas (Botones _Save Threshold_, barras de progreso). |
| `--primary-foreground` | `#452000` | Texto cálido tostado, garantizando alto contraste y legibilidad impecable sobre los botones amarillos. |
| `--secondary` | `#F3F4F6` | Para áreas interactivas secundarias. |
| `--muted` | `#F1F5F9` | Color utilizado para el 'track' pasivo de los sliders, progress bars, o inputs con fondos sutiles. |
| `--muted-foreground`| `#6B7280` | Gris ceniza fundamental para reducir la carga cognitiva en subtítulos descriptivos ("_Set the minimum balance..._"). |
| `--border` | `#E5E7EB` | Bordes ligeros que dividen elementos sin aportar ruido. |

## 4. Espaciado y Layout (Airy Design)
Un diseño de alta gama exige espacio para "respirar".
- **Paddings de Tarjetas (Cards)**: Dejar atrás estrecheces. Usar paddings confortables: `p-6` a `p-8` en contenedores amplios; las sub-tarjetas usan mínimo `p-5`.
- **Gap entre secciones**: Incrementar a `gap-6` o `gap-8`.
- **Breathing Heights**: Incremento del salto de línea entre títulos y sus textos de descripción usando por ejemplo `mt-1.5` o `gap-2`.
- **Botones y CTAs**: Separarlos del resto del componente visual con un margen de seguridad (`mt-6` a `mt-8`).

## 5. Geometría: Bordes y Sombras
- **Card Border Radius (Radios Amplios)**: Abandonar esquinas duras. El `--radius` general global evoluciona a proporciones orgánicas. Usar `rounded-3xl` (`20px - 24px`) para los grandes contenedores (Cards).
- **Botones & Progress Bars**: Estilo 'Pill' (píldoras). Deberán llevar un `rounded-full` para que sus esquinas conformen un semicírculo perfecto.
- **Inputs**: Textareas e inputs mantienen una curvatura balanceada (ej. `rounded-xl` o `rounded-2xl` - 12px a 16px).
- **Shadows Premium**: Rehusar sombras cerradas y duras. Adoptar una sombra sumamente suave, prolongada e indirecta.
  - Equivalente Tailwind: `shadow-xl shadow-black-[0.03]` o custom `box-shadow: 0 8px 30px rgba(0, 0, 0, 0.04);`.
- **Stroke**: Aplicar delineados apenas perceptibles (`border border-slate-100`) para separar las tarjetas blancas del fondo.

## 6. Detalles por Componente
- **Barras de Progreso**: Altas y dominantes (`h-3` o `h-4`). Totalmente redondeadas (`rounded-full`). Se percibe la base (`bg-muted`) y el relleno destacado (`bg-primary`).
- **Listas de Transacciones**: Cada ítem en la lista tiene su icono envuelto de modo individual dentro de una burbuja sutil (background `bg-muted` o `bg-secondary` puramente circular `rounded-full` de `40px` o `w-10 h-10`). Esto ordena visualmente la métrica.
- **Botones Pequeños ("New Goal")**: Tienen estilo un badge, son transparentes o blancos, con un sutil borde gris (`variant="outline"`), texto en Outfit medio y curvatura `rounded-full`.
- **Input Textareas ("Notes")**: No usan caja fuerte con borde oscuro; optan por fondos sutiles con borde casi transparente y padding generoso.

## 7. Jerarquías Textuales (El "Wow" Factor)
La magia del diseño se basa en **extremos de tamaño y peso**. Es indispensable acentuar el rango dinámico del contenido:
1. **Micro-Labels**: Usado para categorización, ej._"RETIREMENT"_. Usa letras de escaso tamaño, todas en mayúsculas y espaciado acentuado entre cada letra (`uppercase tracking-widest text-muted-foreground font-medium text-[11px]`).
2. **Hero Numbers**: Números dominantes, impactantes. Usa Lora en su mayor exponente sin temer al espacio que puedan abarcar (`text-5xl font-heading`).
3. **Descriptors**: Textos secundarios grises ("_65% achieved_"). Siempre contrapuestos por el texto numérico en el otro extremo usando un sistema flex/space-between.
4. **Interacción**: Todas estas jerarquías funcionan en un fondo blanco inmaculado.

---
**Nota Final**: Esta directiva impulsa la interfaz móvil fuera de un "MVP funcional" para ser un referente de diseño ("Producto de Clase Mundial"). Se precisa precisión píxel-a-píxel en el uso de los márgenes y las dos familias tipográficas introducidas para materializar la experiencia.
