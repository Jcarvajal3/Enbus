import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Clases de color sueltas de Tailwind (bg-emerald-50, text-slate-600…): se usan los
// tokens del sistema (shared/tokens.json). Ver el mapa de reemplazo en shared/README.md.
const PALETA_TAILWIND =
  "\\b(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow|placeholder|caret|accent)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}\\b";
const MENSAJE_TOKENS =
  "Usa los tokens del sistema (bg-success-light, text-warning-text…), no colores sueltos de Tailwind. Ver shared/README.md.";

// Nivel "warn" mientras la oleada 2 limpia sus archivos; al integrar pasan a "error"
// (paso manual 9 de Audits/fase4_spec.md).
const NIVEL = "warn";

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
