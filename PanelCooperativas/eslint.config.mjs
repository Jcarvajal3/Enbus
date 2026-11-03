import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Clases de color sueltas de Tailwind (bg-emerald-50, text-slate-600…): se usan los
// tokens del sistema (shared/tokens.json). Ver el mapa de reemplazo en shared/README.md.
const PALETA_TAILWIND =
  "\\b(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow|placeholder|caret|accent)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b";
const MENSAJE_TOKENS =
  "Usa los tokens del sistema (bg-success-light, text-warning-text…), no colores sueltos de Tailwind. Ver shared/README.md.";

// Nivel "error" desde la integración de la fase 4 (antes "warn" mientras la oleada 2 limpiaba sus archivos)
// (paso manual 9 de Audits/fase4_spec.md).
const NIVEL = "error";

// ─── Barrido panel de la fase 5 (Audits/fase5/fase5_spec.md §4) ─────────────
// En "error" desde la integración de la fase 5 (§5 paso 1; antes "warn" mientras
// la oleada 2 limpiaba sus archivos). Regla local, sin dependencias.
const NIVEL_BARRIDO = "error";
const CLASES_BARRIDO = [
  {
    re: /(^|[\s:])bg-accent(?![-\w])/,
    mensaje: "bg-accent está prohibido fuera de gráficos (§2.3): hover/foco = bg-muted text-foreground; selección = bg-accent-strong.",
  },
  { re: /\bh-([3-6]) w-\1\b/, mensaje: "Usa size-N en lugar de h-N w-N (§2.3)." },
  { re: /(^|[\s:])rounded(?![-\w])/, mensaje: "`rounded` suelto: usa rounded-sm (o el radio del rol, D9)." },
];
const barrido = {
  rules: {
    clases: {
      meta: { type: "suggestion", schema: [] },
      create(context) {
        const revisar = (node, texto) => {
          if (typeof texto !== "string") return;
          for (const { re, mensaje } of CLASES_BARRIDO) {
            if (re.test(texto)) context.report({ node, message: mensaje });
          }
        };
        return {
          Literal: (node) => revisar(node, node.value),
          TemplateElement: (node) => revisar(node, node.value.raw),
          JSXAttribute(node) {
            if (node.name?.name === "weight" && node.value?.type === "Literal" && node.value.value === "duotone") {
              context.report({ node, message: 'weight="duotone" está prohibido (D21): regular, o fill en iconos de estado.' });
            }
          },
          CallExpression(node) {
            const c = node.callee;
            if (c.type === "MemberExpression" && c.object?.name === "toast" && c.property?.name === "error") {
              context.report({ node, message: "Usa avisarError(…) de @/lib/avisos (persistente, con cierre) en lugar de toast.error (SY-08)." });
            }
          },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    ignores: ["src/components/ui/**"],
    rules: {
      "no-restricted-syntax": [
        NIVEL,
        { selector: `Literal[value=/${PALETA_TAILWIND}/]`, message: MENSAJE_TOKENS },
        { selector: `TemplateElement[value.raw=/${PALETA_TAILWIND}/]`, message: MENSAJE_TOKENS },
      ],
      "jsx-a11y/label-has-associated-control": [NIVEL, { assert: "either" }],
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "jsx-a11y/click-events-have-key-events": NIVEL,
      "jsx-a11y/no-static-element-interactions": NIVEL,
      "jsx-a11y/no-noninteractive-element-interactions": NIVEL,
      "jsx-a11y/interactive-supports-focus": NIVEL,
      "jsx-a11y/anchor-is-valid": NIVEL,
    },
  },
  {
    files: ["src/**/*.{js,jsx,mjs,ts,tsx,mts,cts}"],
    plugins: { barrido },
    rules: { "barrido/clases": NIVEL_BARRIDO },
  },
  {
    // Único punto permitido para toast.error.
    files: ["src/lib/avisos.ts"],
    rules: { "barrido/clases": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
