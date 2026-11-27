// Escribe las plantillas de correo de Supabase Auth en supabase/templates/ con el diseño de
// shared/correo.ts. Uso (Node ≥ 23.6, TypeScript nativo):  node shared/correos-auth.ts
//
// Las variables {{ .ConfirmationURL }}, {{ .Email }}, {{ .NewEmail }} y {{ .Token }} las
// reemplaza Supabase al enviar. Local: supabase/config.toml las referencia. Producción: copiar
// asunto y HTML en Supabase › Authentication › Emails › Templates (ver supabase/templates/README.md).
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { correoHtml, type Correo } from "./correo.ts";

const DESTINO = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "templates");
const URL = "{{ .ConfirmationURL }}";
const SEGURIDAD = "Si no fuiste tú, ignora este correo: tu cuenta sigue segura.";

const plantillas: Record<string, Correo> = {
  confirmacion: {
    asunto: "Confirma tu correo en EnBus",
    preencabezado: "Un paso más y podrás comprar tus boletos y enviar encomiendas.",
    titulo: "Confirma tu correo",
    parrafos: [
      "¡Bienvenido a EnBus! Toca el botón para confirmar tu correo y activar tu cuenta.",
      "Con tu cuenta compras boletos, guardas tus pases de abordaje y sigues tus encomiendas.",
    ],
    boton: { texto: "Confirmar mi correo", url: URL },
    enlaceAlternativo: true,
    despedida: ["El enlace vence en 24 horas.", "Si no creaste una cuenta en EnBus, ignora este correo."],
    motivo: "Recibes este correo porque alguien creó una cuenta en EnBus con esta dirección.",
  },
  recuperacion: {
    asunto: "Restablece tu contraseña de EnBus",
    preencabezado: "Crea una contraseña nueva para entrar a tu cuenta.",
    estado: { texto: "Seguridad", tono: "info" },
    titulo: "Crea una contraseña nueva",
    parrafos: ["Recibimos un pedido para restablecer la contraseña de tu cuenta de EnBus. Toca el botón para crear una nueva."],
    boton: { texto: "Crear contraseña nueva", url: URL },
    enlaceAlternativo: true,
    despedida: ["El enlace vence en 1 hora y solo sirve una vez.", SEGURIDAD],
    motivo: "Recibes este correo porque se pidió cambiar la contraseña de tu cuenta de EnBus.",
  },
  "cambio-correo": {
    asunto: "Confirma tu nuevo correo en EnBus",
    preencabezado: "Confirma el cambio de correo de tu cuenta.",
    estado: { texto: "Seguridad", tono: "info" },
    titulo: "Confirma tu nuevo correo",
    parrafos: ["Pediste cambiar el correo de tu cuenta de EnBus de **{{ .Email }}** a **{{ .NewEmail }}**. Toca el botón para confirmarlo."],
    boton: { texto: "Confirmar el cambio", url: URL },
    enlaceAlternativo: true,
    despedida: [SEGURIDAD],
    motivo: "Recibes este correo porque se pidió cambiar el correo de tu cuenta de EnBus.",
  },
  "enlace-magico": {
    asunto: "Tu enlace para entrar a EnBus",
    preencabezado: "Entra a tu cuenta sin contraseña.",
    titulo: "Entra a tu cuenta",
    parrafos: ["Toca el botón para entrar a tu cuenta de EnBus."],
    boton: { texto: "Entrar a EnBus", url: URL },
    enlaceAlternativo: true,
    despedida: ["El enlace vence en 1 hora y solo sirve una vez.", SEGURIDAD],
    motivo: "Recibes este correo porque se pidió entrar a EnBus con esta dirección.",
  },
  invitacion: {
    asunto: "Te invitaron a EnBus",
    preencabezado: "Acepta la invitación y crea tu contraseña.",
    titulo: "Te invitaron a EnBus",
    parrafos: ["Te crearon una cuenta en EnBus. Toca el botón para aceptar la invitación y crear tu contraseña."],
    boton: { texto: "Aceptar invitación", url: URL },
    enlaceAlternativo: true,
    despedida: ["Si no esperabas esta invitación, ignora este correo."],
    motivo: "Recibes este correo porque te invitaron a EnBus.",
  },
  reautenticacion: {
    asunto: "Tu código de verificación de EnBus",
    preencabezado: "Usa este código para confirmar que eres tú.",
    estado: { texto: "Seguridad", tono: "info" },
    titulo: "Confirma que eres tú",
    parrafos: ["Escribe este código en EnBus para continuar."],
    destacado: { etiqueta: "Tu código", valor: "{{ .Token }}" },
    despedida: ["No compartas este código con nadie: EnBus nunca te lo va a pedir.", SEGURIDAD],
    motivo: "Recibes este correo porque se pidió verificar tu identidad en EnBus.",
  },
  "aviso-contrasena": {
    asunto: "Cambiaste tu contraseña de EnBus",
    preencabezado: "La contraseña de tu cuenta se cambió.",
    estado: { texto: "Seguridad", tono: "info" },
    titulo: "Tu contraseña cambió",
    parrafos: ["La contraseña de tu cuenta de EnBus (**{{ .Email }}**) se cambió hace un momento."],
    nota: {
      texto: "Si no fuiste tú, restablece tu contraseña de inmediato desde “¿Olvidaste tu contraseña?” y escríbenos a soporte.",
      tono: "aviso",
    },
    motivo: "Recibes este aviso de seguridad por tu cuenta de EnBus.",
  },
  "aviso-correo": {
    asunto: "Cambiaste el correo de tu cuenta de EnBus",
    preencabezado: "El correo de tu cuenta se cambió.",
    estado: { texto: "Seguridad", tono: "info" },
    titulo: "Tu correo cambió",
    parrafos: ["El correo de tu cuenta de EnBus cambió de **{{ .OldEmail }}** a **{{ .Email }}**."],
    nota: { texto: "Si no fuiste tú, escríbenos a soporte de inmediato.", tono: "aviso" },
    motivo: "Recibes este aviso de seguridad por tu cuenta de EnBus.",
  },
};

mkdirSync(DESTINO, { recursive: true });
for (const [nombre, correo] of Object.entries(plantillas)) {
  writeFileSync(join(DESTINO, `${nombre}.html`), correoHtml(correo), "utf8");
  console.log(`escrito supabase/templates/${nombre}.html`);
}
