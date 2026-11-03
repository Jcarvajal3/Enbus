"use client"

import * as React from "react"
import Link from "next/link"
import { List } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import { cooperativasUrl } from "@/lib/urls"
import { BrandMark } from "@/components/brand-mark"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet"

const FOCO =
  "outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background"

interface NavbarProps {
  /** Secciones de la portada que se están mostrando (las que no hay se ocultan del menú). */
  secciones?: { rutas?: boolean; calcular?: boolean }
  /** true si la página empieza con el amarillo de marca (portada): sin desplazar, la marca va invertida. */
  sobreMarca?: boolean
}

export function Navbar({ secciones = {}, sobreMarca = false }: NavbarProps) {
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const portal = cooperativasUrl()

  const navLinks = [
    { label: "Inicio", href: "/#inicio" },
    { label: "Cómo funciona", href: "/#como-funciona" },
    ...(secciones.rutas ? [{ label: "Rutas", href: "/#rutas" }] : []),
    ...(secciones.calcular ? [{ label: "Calcular envío", href: "/#calcular" }] : []),
    { label: "Rastrear", href: "/rastrear" },
  ]

  React.useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 50)
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-colors duration-300",
        scrolled
          ? "border-b border-border bg-background/95 backdrop-blur-sm"
          : "bg-transparent"
      )}
    >
      <nav aria-label="Principal" className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" aria-label="EnBus, inicio" className={cn("rounded-sm text-foreground", FOCO)}>
          <BrandMark conNombre invertido={sobreMarca && !scrolled} />
        </Link>

        {/* Desktop navigation */}
        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground",
                  FOCO
                )}
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* Desktop actions: cooperativas */}
        <div className="hidden items-center gap-4 lg:flex">
          <a
            href="/registro-cooperativa"
            className={cn("rounded-full px-1 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground", FOCO)}
          >
            Registrar cooperativa
          </a>
          {portal && (
            <a
              href={`${portal}/cooperativas/login`}
              className={cn(buttonVariants({ variant: "outline" }), FOCO)}
            >
              Entrar al panel
            </a>
          )}
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className={cn("lg:hidden", FOCO)}
                aria-label="Abrir menú"
              />
            }
          >
            <List className="size-5" />
          </SheetTrigger>

          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>
                <BrandMark conNombre />
              </SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <SheetClose key={link.href} render={<a href={link.href} className={cn("rounded-sm", FOCO)} />}>
                  <span className="inline-flex w-full rounded-sm px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    {link.label}
                  </span>
                </SheetClose>
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-3 border-t border-border px-6 py-6">
              <p className="text-sm font-medium text-foreground">¿Eres una cooperativa?</p>
              <a
                href="/registro-cooperativa"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), FOCO)}
                onClick={() => setOpen(false)}
              >
                Registrar cooperativa
              </a>
              {portal && (
                <a
                  href={`${portal}/cooperativas/login`}
                  className={cn(buttonVariants({ size: "lg" }), FOCO)}
                  onClick={() => setOpen(false)}
                >
                  Entrar al panel
                </a>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
