import type { Metadata } from "next";

// Zona de administración (login incluido): título por defecto y fuera de los buscadores.
export const metadata: Metadata = {
  title: {
    default: "Administración · EnBus",
    template: "%s · EnBus",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
