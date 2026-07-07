"use client"

import * as React from "react"
import { List } from "@phosphor-icons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet"

const navLinks = [
  { label: "Inicio", href: "#inicio" },
  { label: "Como Funciona", href: "#como-funciona" },
  { label: "Rutas", href: "#rutas" },
  { label: "Rastrear", href: "#rastrear" },
] as const

export function Navbar() {
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)

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
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
        <a href="#inicio" className="text-xl font-bold tracking-tight text-foreground">
          EnBus
        </a>

        <ul className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="rounded-md px-3 py-2 text-sm font-medium text-foreground/70 transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <div className="hidden items-center gap-3 lg:flex">
          <a
            href="/cooperativas/login"
            className="text-sm font-medium text-foreground/60 transition-colors hover:text-foreground"
          >
            Portal Cooperativas
          </a>
          <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
            Calcular Envio
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Abrir menu"
              />
            }
          >
            <List className="size-5" />
          </SheetTrigger>

          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>EnBus</SheetTitle>
            </SheetHeader>

            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <SheetClose key={link.href} render={<a href={link.href} />}>
                  <span className="inline-flex w-full rounded-md px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted">
                    {link.label}
                  </span>
                </SheetClose>
              ))}
            </div>

            <div className="mt-auto flex flex-col gap-3 border-t border-border px-6 py-6">
              <Button
                className="w-full bg-foreground text-background hover:bg-foreground/90"
                onClick={() => setOpen(false)}
              >
                Calcular Envio
              </Button>
              <a
                href="/cooperativas/login"
                className="text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => setOpen(false)}
              >
                Portal Cooperativas
              </a>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
