import { createClient } from "@/lib/supabase/server";
import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { RutasClient } from "./client";

export default async function RutasPage() {
  const user = await getUserProfile();
  if (!user) redirect("/cooperativas/login");

  const supabase = await createClient();

  const { data: rutas } = await supabase
    .from("rutas")
    .select("*")
    .eq("cooperativa_id", user.cooperativa_id)
    .order("created_at", { ascending: false });

  return (
    <RutasClient rutas={rutas || []} userRole={user.role} />
  );
}
