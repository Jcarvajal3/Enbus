// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Colores literales (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba()) solo en src/theme.ts y en
// src/tokens.generated.ts (fuente: shared/tokens.json). Todo lo demás usa Colors / alpha().
const HEX = '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';
const RGB = 'rgba?\\(';
const MENSAJE_COLOR = 'Usa Colors de src/theme.ts.';

/**
 * Regla local "sintaxis restringida" con su propia severidad: `no-restricted-syntax`
 * ya está en `error` para los colores y una regla solo admite una severidad.
 * Opciones: [{ selector, message }].
 */
const sintaxisRestringida = {
  meta: { type: 'suggestion', schema: [{ type: 'array' }] },
  create(context) {
    const visitantes = {};
    for (const { selector, message } of context.options[0] ?? []) {
      visitantes[selector] = (node) => context.report({ node, message });
    }
    return visitantes;
  },
};

// ─── Barrido app de la fase 5 (en `error` desde la integración) ───
const BARRIDO_APP = [
  {
    selector: "JSXAttribute[name.name='variant'][value.value=/^(accent|gradient|dangerSoft)$/]",
    message: 'Variante retirada (D25): usa primary o dangerGhost.',
  },
  { selector: "JSXAttribute[name.name='glow']", message: '`glow` está retirado (D25).' },
  {
    selector: "JSXAttribute[name.name='color'][value.value=/^(accent|secondary|danger)$/]",
    message: 'Color de texto retirado (D25): usa link, foreground o dangerText.',
  },
  {
    selector: "Property[key.name='textTransform'][value.value='capitalize']",
    message: 'Sin capitalize: en español solo va mayúscula inicial.',
  },
  {
    selector: "JSXOpeningElement[name.name=/^(PageTransition|LoadingState)$/]",
    message: 'Retirado (D25): la pila ya anima; la espera es ScreenSkeleton.',
  },
  {
    selector: "JSXAttribute[name.name='right'] > JSXExpressionContainer > JSXElement[openingElement.name.name='StatusBadge']",
    message: 'El estado va en `status` de ScreenHeader, no en `right`.',
  },
  {
    selector: "BinaryExpression[operator=/^[+-]$/][left.object.name='Spacing'][right.type='Literal']",
    message: 'Solo tokens de Spacing, sin ± n.',
  },
  {
    selector: "BinaryExpression[operator=/^[+-]$/][right.object.name='Spacing'][left.type='Literal']",
    message: 'Solo tokens de Spacing, sin ± n.',
  },
  {
    selector: 'Literal[value=/^(Desde|Hacia)$/]',
    message: 'Usa "Origen" y "Destino".',
  },
  {
    selector: "JSXText[value=/^\\s*(Desde|Hacia)\\s*$/]",
    message: 'Usa "Origen" y "Destino".',
  },
  {
    selector: 'Literal[value=/^Sí, /]',
    message: 'Confirmar = verbo + objeto ("Cancelar envío"), sin "Sí, …".',
  },
  {
    selector: "JSXAttribute[name.name='placeholder'][value.type='Literal'][value.value!=/^Ej\\. /]",
    message: 'Marcador solo de formato: "Ej. 0414-1234567".',
  },
];

// Fechas y horas solo con shared/ve.ts (vía src/utils/formatters.ts).
const BARRIDO_FECHAS = [
  {
    selector: 'Identifier[name=/^(timeOnly|dateTime|dateFull)$/]',
    message: 'Usa formatDiaVE / formatHoraVE / formatDiaHoraVE (D4).',
  },
  {
    selector: "Property[key.name='hour12'][value.value=false]",
    message: 'Horas en 12 h con formatHoraVE (D4).',
  },
  {
    selector: "NewExpression[callee.object.name='Intl'][callee.property.name='DateTimeFormat']",
    message: 'Fechas solo con formatters.ts / ve.ts (D4).',
  },
];

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ignores: ['src/theme.ts', 'src/tokens.generated.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${HEX}/]`, message: MENSAJE_COLOR },
        { selector: `Literal[value=/${RGB}/]`, message: MENSAJE_COLOR },
        { selector: `TemplateElement[value.raw=/${RGB}/]`, message: MENSAJE_COLOR },
      ],
    },
  },
  {
    files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'],
    ignores: ['**/*.generated.ts'],
    plugins: { enbus: { rules: { barrido: sintaxisRestringida, fechas: sintaxisRestringida } } },
    rules: {
      'enbus/barrido': ['error', BARRIDO_APP],
      'enbus/fechas': ['error', BARRIDO_FECHAS],
      'no-restricted-properties': [
        'error',
        { object: 'Alert', property: 'alert', message: 'Confirma con useConfirm / ConfirmSheet (D3).' },
        { object: 'router', property: 'back', message: 'Usa useVolver(padre): la ← nunca queda muerta.' },
      ],
    },
  },
  {
    // Los únicos sitios donde se permite lo que el barrido prohíbe.
    files: ['src/utils/formatters.ts'],
    rules: { 'enbus/fechas': 'off' },
  },
  {
    files: ['src/hooks/useVolver.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
]);
