#!/usr/bin/env node
// Corre en EAS Build antes de instalar dependencias (`eas-build-pre-install`).
// Sin estas variables la app compila igual pero abre con "La app no está
// configurada": mejor que la build falle en el primer minuto.
// Se definen en el entorno de EAS del perfil (`eas env:push <entorno>`), no en
// `.env.local`: ese archivo está en .gitignore y no se sube a EAS.

const requeridas = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const faltan = requeridas.filter((nombre) => !process.env[nombre]);

if (faltan.length > 0) {
  const entorno = process.env.EAS_BUILD_PROFILE ?? 'del perfil';
  console.error(
    `\n[EnBus] Faltan ${faltan.join(' y ')} en el entorno de EAS (${entorno}).\n` +
      `Cárgalas desde EnBusApp con:  eas env:push ${process.env.EAS_BUILD_PROFILE ?? '<entorno>'} --path .env.local\n`
  );
  process.exit(1);
}

console.log(`[EnBus] Variables de Supabase presentes: ${requeridas.join(', ')}.`);
