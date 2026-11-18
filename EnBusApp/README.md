# EnBus (app móvil)

App de pasajeros de EnBus hecha con [Expo](https://expo.dev) (SDK 54) y expo-router.

## Desarrollo

```bash
npm install
npm start          # servidor de desarrollo (requiere development build, no Expo Go)
npm run android    # compila y corre en Android
npm run lint
npx tsc --noEmit   # tipos
```

Las variables `EXPO_PUBLIC_*` (Supabase, WhatsApp de soporte, URL del sitio) viven en los
entornos de EAS (`development`, `preview`, `production`). `scripts/verificar-env-eas.js`
las comprueba antes de cada build.

## Actualizaciones OTA (EAS Update)

Permiten corregir y mejorar la app sin pasar por Play Store: los usuarios reciben el código nuevo
al abrir la app (la app descarga y ofrece el botón "Actualizar").

### Qué va por OTA y qué no

| Por OTA (EAS Update) | Requiere un build nuevo |
| --- | --- |
| Código JS/TS, pantallas, lógica | Dependencias nativas nuevas o con versión distinta |
| Estilos, textos, imágenes y fuentes importadas | Permisos, plugins de Expo, campos nativos de `app.json` |
| Cambios en `src/` y `app/` | Íconos, splash, nombre, package, versión nativa |

### runtimeVersion (fingerprint)

`runtimeVersion` usa la política `fingerprint`: es un hash de todo lo nativo del proyecto. Un update
solo lo reciben los builds con el **mismo** runtimeVersion. Si cambias algo nativo, el hash cambia y
hay que generar un build nuevo; los updates publicados con el hash nuevo no llegan a los builds viejos.

Para comparar antes de publicar:

```bash
npx expo-updates fingerprint:generate --platform android
eas fingerprint:compare   # contra un build o update ya publicado
```

CI corre `npx expo-doctor` para detectar dependencias desalineadas, que cambiarían el fingerprint sin querer.

### Canales y perfiles

Cada perfil de `eas.json` tiene un canal y un entorno de EAS con su mismo nombre:

| Perfil | Canal | Entorno de variables |
| --- | --- | --- |
| `development` | `development` | `development` |
| `preview` | `preview` | `preview` |
| `production` | `production` | `production` |

Un build solo recibe updates de su canal. Se publica con `--environment <canal>` para que las
`EXPO_PUBLIC_*` se tomen del mismo entorno de EAS que usó el build.

### Cómo publicar

**Recomendado: GitHub Action.** En Actions > "EAS Update" > Run workflow, elige el canal y escribe el
mensaje. Corre tipos y lint y publica desde Linux, que es donde el fingerprint coincide con el de EAS Build.

**Desde tu máquina** (con `eas login` hecho y el árbol de `EnBusApp` commiteado):

```bash
npm run update:preview -- "Corrige el filtro de rutas"
npm run update:production -- "Mensaje obligatorio"
```

El script exige mensaje, valida el canal y se niega a publicar con cambios sin commitear (`--forzar` lo omite).

### Flujo de prueba

1. Publica en `preview`.
2. Instala el APK de `preview` (el build, no el update).
3. Abre la app, ciérrala y vuelve a abrirla: la primera apertura descarga el update y la segunda lo
   aplica; o toca "Actualizar" en el aviso cuando aparezca.
4. Si todo está bien, publica lo mismo en `production`.

### Rollback

```bash
eas update:rollback            # vuelve al update anterior (o al embebido en el build)
eas update:republish --group <id>   # republica un grupo anterior como el más reciente
```

Los ids de grupo salen de `eas update:list` o del panel de expo.dev.

### Secreto EXPO_TOKEN (para el workflow)

1. En expo.dev > Account settings > Access tokens, crea un token (mejor de un robot/organización).
2. En GitHub: Settings > Secrets and variables > Actions > New repository secret, nombre `EXPO_TOKEN`.

### Notas

- **Variables:** las `EXPO_PUBLIC_*` se incrustan en el bundle al publicar, tomadas del entorno de EAS.
  Si cambias una variable, hay que publicar otro update (o un build) para que surta efecto.
- **Google Play:** un update OTA no puede cambiar el propósito principal de la app ni saltarse las
  políticas de Play; solo corregir y mejorar lo que ya está aprobado.
