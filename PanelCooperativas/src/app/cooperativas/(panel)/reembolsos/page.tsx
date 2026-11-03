import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import { ReembolsosClient } from "./client";
import { listarReembolsos } from "./actions";

export const metadata = {
  title: "Reembolsos | EnBus Panel",
  description: "Devoluciones de boletos cancelados de tu cooperativa.",
};

export default async function ReembolsosPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  // Ambos roles ven la bandeja y registran devoluciones (fn_reembolsos valida la cooperativa).
  // Los datos llegan con la página (sin un primer render vacío con spinner).
  const inicial = await listarReembolsos("TODOS");
  return <ReembolsosClient inicial={inicial} />;
}
