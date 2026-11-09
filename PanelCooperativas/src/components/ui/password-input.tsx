"use client";

import * as React from "react";
import { Eye, EyeSlash } from "@phosphor-icons/react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Campo de contraseña con botón de ojo ────────────────────────────────────
// Mismo `Input` del sistema con un botón dentro, a la derecha, que muestra u
// oculta lo escrito. El `autoComplete` lo pone quien lo usa ("current-password"
// en los login, "new-password" al crearla). Al enviar el formulario vuelve a
// ocultarse: el gestor de contraseñas del navegador reconoce el campo y la
// contraseña no queda a la vista. Con el ratón el foco se queda en el campo;
// con el teclado el botón es un paso más del orden de foco (Tab).

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

function PasswordInput({ className, disabled, id, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);
  const botonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    const form = botonRef.current?.form;
    if (!form) return;
    const ocultar = () => setVisible(false);
    form.addEventListener("submit", ocultar);
    return () => form.removeEventListener("submit", ocultar);
  }, []);

  return (
    <div data-slot="password-input" className="relative w-full">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        // pr-10: espacio para el botón. -ms-reveal: Edge trae su propio ojo; aquí sobra.
        className={cn("pr-10 [&::-ms-reveal]:hidden [&::-ms-clear]:hidden", className)}
        {...props}
      />
      <button
        ref={botonRef}
        type="button"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        aria-controls={id}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-1 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none after:absolute after:-inset-1 hover:bg-muted hover:text-foreground focus-visible:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeSlash className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  );
}

export { PasswordInput };
