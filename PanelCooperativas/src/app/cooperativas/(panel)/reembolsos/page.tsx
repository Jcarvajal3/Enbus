import { Suspense } from "react";
import { ReembolsosClient } from "./client";
import { listarReembolsos } from "./actions";

export default async function ReembolsosPage() {
  // Ambos roles ven la bandeja y registran devoluciones (fn_reembolsos valida la cooperativa).
  // Los datos llegan con la página (sin un primer render vacío).
  const inicial = await listarReembolsos("TODOS");
  // TabsUrl lee ?estado= con useSearchParams.
  return (
    <Suspense>
      <ReembolsosClient inicial={inicial} />
    </Suspense>
  );
}
