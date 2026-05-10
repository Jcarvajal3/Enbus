import { getUserProfile } from "@/lib/supabase/cached";
import { redirect } from "next/navigation";
import { PanelShell } from "@/components/panel-shell";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserProfile();

  if (!user) {
    redirect("/cooperativas/login");
  }

  return <PanelShell user={user}>{children}</PanelShell>;
}
