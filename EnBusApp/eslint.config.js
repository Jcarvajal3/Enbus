// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Colores literales (#rgb, #rrggbb, #rrggbbaa, rgb()/rgba()) solo en src/theme.ts y en
// src/tokens.generated.ts (fuente: shared/tokens.json). Todo lo demás usa Colors / alpha().
const HEX = '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$';
const RGB = 'rgba?\\(';
const MENSAJE_COLOR = 'Usa Colors de src/theme.ts.';

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
]);
