# Panel Cooperativas: Integración de Hardware

## 1. Objetivo
Definir cómo el Panel Web (PWA) interactúa con dispositivos de hardware de taquilla.

## 2. Dispositivos Soportados

### 2.1 Escáner de Códigos QR / Barras (USB)
- **Tipo**: Escáner 2D USB que emula teclado (HID).
- **Funcionamiento**: Al escanear un código, inyecta los caracteres en el input enfocado y envía un `Enter` al final.
- **Implementación**: El input de búsqueda/escaneo siempre tiene `autofocus` y un event listener que intercepta secuencias rápidas de caracteres (indicativo de escáner vs. tipeo humano).
- **Criterio de detección**: Si se reciben más de 6 caracteres en menos de 100ms, se considera entrada de escáner.

### 2.2 Impresora Térmica (Bluetooth)
- **Tipo**: Impresora portátil de tickets con Bluetooth.
- **Protocolo**: Comandos ESC/POS.
- **Conexión**: Via **Web Bluetooth API** (`navigator.bluetooth`).
- **Flujo**:
  1. En la primera conexión, el usuario "empareja" la impresora desde Configuración del Panel.
  2. El ID del dispositivo Bluetooth se guarda en `localStorage`.
  3. En impresiones subsecuentes, la conexión se establece automáticamente.
  4. La impresión es directa (sin diálogo de impresión del navegador).

### 2.3 Cámara (Fallback para QR + Evidencia)
- **Uso 1**: Si no hay escáner USB, botón **"Escanear con Cámara"** usando `navigator.mediaDevices.getUserMedia()` + librería de detección QR (ej: `jsQR`).
- **Uso 2**: Captura de fotografía de evidencia del paquete.
- **Implementación**: Canvas + video stream. Al presionar capturar, se toma un frame, se convierte a blob y se sube a Supabase Storage.

## 3. Compatibilidad
| API | Chrome Desktop | Chrome Android | Safari | Firefox |
|---|---|---|---|---|
| Web Bluetooth | ✅ | ✅ | ❌ | ❌ |
| getUserMedia (cámara) | ✅ | ✅ | ✅ | ✅ |
| HID (escáner USB) | ✅ | N/A | ✅ | ✅ |

> **Nota**: El panel se diseña para **Chrome** como navegador principal. Safari y Firefox no soportan Web Bluetooth. Para esos navegadores, la impresión se realiza mediante `window.print()` como fallback.

## 4. Configuración de Hardware
- Página: `/cooperativas/configuracion/hardware`
- Sección **Impresora**: Botón "Emparejar Impresora Bluetooth" + Estado de conexión.
- Sección **Escáner**: Test de escaneo (input de prueba para verificar que el escáner funcione).
