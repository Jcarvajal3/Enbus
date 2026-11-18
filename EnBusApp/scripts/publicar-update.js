#!/usr/bin/env node
/**
 * Publica una actualización OTA (EAS Update) en un canal.
 *
 * Uso:  node scripts/publicar-update.js <preview|production> "<mensaje>" [--forzar]
 *
 * - Usa el mismo entorno de EAS que el build del canal (--environment), así las
 *   EXPO_PUBLIC_* salen de EAS y no de tu máquina.
 * - Se niega a publicar con cambios sin commitear en EnBusApp (salvo --forzar),
 *   para que lo publicado siempre corresponda a un commit.
 * - Ojo: la forma recomendada es el workflow de GitHub "EAS Update" (Linux), porque
 *   el runtimeVersion (fingerprint) debe coincidir con el calculado en EAS Build.
 */
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');

const CANALES = ['preview', 'production'];
const raiz = path.resolve(__dirname, '..');

function uso(error) {
  if (error) console.error(`Error: ${error}\n`);
  console.error(
    'Uso: node scripts/publicar-update.js <preview|production> "<mensaje>" [--forzar]\n' +
      '  npm run update:preview -- "mensaje"\n' +
      '  npm run update:production -- "mensaje"',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const forzar = args.includes('--forzar');
const [canal, ...resto] = args.filter((a) => a !== '--forzar');
const mensaje = resto.join(' ').trim();

if (!CANALES.includes(canal)) uso(`el canal debe ser uno de: ${CANALES.join(', ')}.`);
if (!mensaje) uso('el mensaje es obligatorio.');

if (!forzar) {
  const git = spawnSync('git', ['status', '--porcelain', '--', '.'], { cwd: raiz, encoding: 'utf8' });
  if (git.status !== 0) uso('no se pudo consultar git (¿estás dentro del repo?). Usa --forzar para omitirlo.');
  if (git.stdout.trim()) {
    console.error(`Hay cambios sin commitear en EnBusApp:\n${git.stdout}`);
    console.error('Haz commit antes de publicar (o usa --forzar bajo tu responsabilidad).');
    process.exit(1);
  }
}

const fs = require('node:fs');
const win = process.platform === 'win32';

// Sin shell: con shell:true en Windows, cmd.exe interpreta comillas, &, % y ^ del
// mensaje (inyección de comandos y mensajes rotos). En Windows se invoca el npx-cli.js
// de Node directamente, así los argumentos llegan intactos.
let comando = 'npx';
let prefijo = [];
if (win) {
  const npxCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
  if (!fs.existsSync(npxCli)) {
    console.error('No se encontró npx junto a Node (' + npxCli + '). Publica desde el workflow de GitHub "EAS Update".');
    process.exit(1);
  }
  comando = process.execPath;
  prefijo = [npxCli];
}
const eas = [
  'eas-cli', 'update',
  '--channel', canal,
  '--environment', canal,
  '--message', mensaje,
  '--non-interactive',
];

console.log(`Publicando en "${canal}": ${mensaje}`);
const hijo = spawn(comando, [...prefijo, '--yes', ...eas], { cwd: raiz, stdio: 'inherit' });
hijo.on('error', (e) => {
  console.error(`No se pudo ejecutar eas-cli: ${e.message}`);
  process.exit(1);
});
hijo.on('exit', (codigo) => process.exit(codigo ?? 1));
