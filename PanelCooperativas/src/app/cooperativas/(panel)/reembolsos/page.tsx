import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/supabase/cached";
import { ReembolsosClient } from "./client";

export const metadata = {
  title: "Reembolsos | EnBus Panel",
  description: "Devoluciones de boletos cancelados de tu cooperativa.",
};

export default async function ReembolsosPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  // Ambos roles ven la bandeja y registran devoluciones (fn_reembolsos valida la cooperativa).
  return <ReembolsosClient />;
}
