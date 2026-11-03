export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import RecuperarPageClient from "./recuperar-client";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecuperarPage() {
  return <RecuperarPageClient />;
}
