export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import RestablecerPageClient from "./restablecer-client";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function RestablecerPage() {
  return <RestablecerPageClient />;
}
