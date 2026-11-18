"use client";

import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useMigaObjeto } from "@/components/miga-objeto";
import { MenuUsuario } from "@/components/app-sidebar";

// ─── Cabecera móvil compacta (< md) ──────────────────────────────────────────
// 56 px, sticky. Título de la sección; con un objeto abierto (<MigaObjeto>) añade "←"
// hacia la sección. A la derecha, el contexto global (`extra`: impresora y tasa BCV) y
// el avatar que abre el menú del usuario (tema y cerrar sesión).

export function CabeceraMovil({
  seccion,
  extra,
  nombre,
  rol,
  login,
}: {
  seccion: { item: { title: string; tituloPagina?: string; href: string } } | null;
  extra?: React.ReactNode;
  nombre: string;
  rol: string;
  login: string;
}) {
  const objeto = useMigaObjeto();
  const titulo = seccion ? (seccion.item.tituloPagina ?? seccion.item.title) : "EnBus";
  const conVolver = Boolean(seccion && objeto);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-1 bg-card px-2 shadow-subtle">
      {seccion && conVolver && (
        <Link
          href={seccion.item.href}
          aria-label={`Volver a ${seccion.item.title}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft aria-hidden className="size-6" />
        </Link>
      )}
      <p className={cn("min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight", !conVolver && "pl-2")}>
        {titulo}
      </p>
      {extra && <div className="flex shrink-0 items-center gap-1.5">{extra}</div>}
      <MenuUsuario variante="avatar" nombre={nombre} rol={rol} login={login} />
    </header>
  );
}
