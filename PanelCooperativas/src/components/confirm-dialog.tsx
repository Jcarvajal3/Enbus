"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { SpinnerIcon, WarningCircle } from "@phosphor-icons/react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { humanizeError } from "@/lib/errores";
import { cn } from "@/lib/utils";

// ─── Confirmación según reversibilidad (#36) ─────────────────────────────────
// Para acciones irreversibles o con impacto en terceros: dice qué va a pasar,
// usa un verbo específico, muestra la carga, pide motivo cuando afecta a otros
// y solo se cierra si la operación salió bien (el error se ve dentro).

export type ResultadoConfirmacion = { ok: boolean; error?: string } | void;

export type ConfirmDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  titulo: string;
  descripcion?: ReactNode;
  /** Lista "Qué va a pasar". */
  impacto?: ReactNode[];
  /** Texto del botón, p. ej. "Desactivar cooperativa". */
  verbo: string;
  /** Texto mientras corre, p. ej. "Desactivando…". */
  verboCargando?: string;
  tono?: "default" | "destructive";
  /** Pide un motivo (obligatorio) antes de confirmar. */
  motivo?: { etiqueta: string; placeholder?: string; minimo?: number; chips?: string[] };
  /**
   * Texto que la persona debe escribir para confirmar. Con una lista acepta
   * cualquiera de las opciones (p. ej. [nombre, RIF]).
   */
  confirmarEscribiendo?: string | string[];
  /** Texto del botón para salir sin hacer nada (por defecto "Cancelar"). */
  textoCancelar?: string;
  onConfirm(motivo?: string): Promise<ResultadoConfirmacion>;
};

const MINIMO_MOTIVO = 5;

function opcionesEscribir(v: string | string[] | undefined): string[] {
  return (Array.isArray(v) ? v : [v]).filter((o): o is string => Boolean(o && o.trim()));
}

/** "«Transportes Lara»" o "«Transportes Lara» o «J-12345678-9»" */
function listaOpciones(opciones: string[]) {
  return opciones.map((o) => `«${o}»`).join(" o ");
}

/** Compara sin distinguir mayúsculas, espacios repetidos ni guiones (RIF "J-123…" = "j123…"). */
function coincide(escrito: string, esperado: string) {
  const limpiar = (s: string) => s.trim().toLowerCase().replace(/[\s.\-_]+/g, "");
  return limpiar(escrito) !== "" && limpiar(escrito) === limpiar(esperado);
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onOpenChange } = props;
  // Vive en la raíz: mientras corre, ni Esc ni "Cancelar" cierran el diálogo.
  const [enCurso, setEnCurso] = useState(false);
  const enCursoRef = useRef(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(siguiente) => {
        if (!siguiente && enCursoRef.current) return;
        onOpenChange(siguiente);
      }}
    >
      {open && (
        <Contenido
          {...props}
          enCurso={enCurso}
          setEnCurso={(v) => {
            enCursoRef.current = v;
            setEnCurso(v);
          }}
          enCursoRef={enCursoRef}
        />
      )}
    </AlertDialog>
  );
}

/** El contenido se monta al abrir: motivo, texto y error empiezan vacíos cada vez. */
function Contenido({
  onOpenChange,
  titulo,
  descripcion,
  impacto,
  verbo,
  verboCargando,
  tono = "default",
  motivo,
  confirmarEscribiendo,
  textoCancelar = "Cancelar",
  onConfirm,
  enCurso,
  setEnCurso,
  enCursoRef,
}: ConfirmDialogProps & {
  enCurso: boolean;
  setEnCurso(v: boolean): void;
  enCursoRef: RefObject<boolean>;
}) {
  const uid = useId();
  const id = (s: string) => `${uid}-${s}`;
  const cancelarRef = useRef<HTMLButtonElement>(null);
  const motivoRef = useRef<HTMLTextAreaElement>(null);
  const escribirRef = useRef<HTMLInputElement>(null);
  const [textoMotivo, setTextoMotivo] = useState("");
  const [escrito, setEscrito] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [errorEscrito, setErrorEscrito] = useState<string | null>(null);

  const minimo = motivo?.minimo ?? MINIMO_MOTIVO;
  const opciones = opcionesEscribir(confirmarEscribiendo);
  const destructivo = tono === "destructive";

  const enviar = async (e?: FormEvent) => {
    e?.preventDefault();
    if (enCursoRef.current) return; // sin doble envío

    // El foco va al primer campo con error para que se lea y se corrija.
    const motivoInvalido = Boolean(motivo) && textoMotivo.trim().length < minimo;
    const escritoInvalido = opciones.length > 0 && !opciones.some((o) => coincide(escrito, o));
    setErrorMotivo(motivoInvalido ? `Escribe el motivo (mínimo ${minimo} caracteres).` : null);
    setErrorEscrito(escritoInvalido ? `Escribe ${listaOpciones(opciones)} para confirmar.` : null);
    if (motivoInvalido || escritoInvalido) {
      (motivoInvalido ? motivoRef.current : escribirRef.current)?.focus();
      return;
    }

    setError(null);
    setEnCurso(true);
    try {
      const resultado = await onConfirm(motivo ? textoMotivo.trim() : undefined);
      if (resultado && !resultado.ok) {
        setError(resultado.error || "No pudimos completar la acción. Intenta de nuevo.");
        return;
      }
      setEnCurso(false);
      onOpenChange(false);
    } catch (err) {
      setError(humanizeError(err, "completar la acción"));
    } finally {
      setEnCurso(false);
    }
  };

  const elegirChip = (chip: string) => {
    setErrorMotivo(null);
    if (/^otro$/i.test(chip.trim())) {
      setTextoMotivo("");
      motivoRef.current?.focus();
      return;
    }
    setTextoMotivo(chip);
  };

  return (
    <AlertDialogContent
      /* Mismos modificadores que AlertDialogContent para que tailwind-merge los reemplace
         (un `sm:max-w-lg` suelto pierde contra `data-[size=default]:sm:max-w-md`). */
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-lg"
      initialFocus={destructivo ? cancelarRef : undefined}
    >
      <form onSubmit={enviar} noValidate className="grid gap-5">
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          {descripcion && (
            <AlertDialogDescription render={<div />}>{descripcion}</AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {impacto && impacto.length > 0 && (
          <div className="rounded-xl border bg-muted/40 p-4 text-sm">
            <p className="mb-2 font-medium">Qué va a pasar</p>
            <ul className="list-disc space-y-1.5 pl-5 text-foreground">
              {impacto.map((linea, i) => (
                <li key={i}>{linea}</li>
              ))}
            </ul>
          </div>
        )}

        {motivo && (
          <div className="grid gap-2">
            <Label htmlFor={id("motivo")}>{motivo.etiqueta}</Label>
            {motivo.chips && motivo.chips.length > 0 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Motivos frecuentes">
                {motivo.chips.map((chip) => {
                  const activo = textoMotivo === chip;
                  return (
                    <Button
                      key={chip}
                      type="button"
                      size="sm"
                      variant={activo ? "default" : "outline"}
                      aria-pressed={activo}
                      disabled={enCurso}
                      onClick={() => elegirChip(chip)}
                    >
                      {chip}
                    </Button>
                  );
                })}
              </div>
            )}
            <Textarea
              id={id("motivo")}
              ref={motivoRef}
              value={textoMotivo}
              placeholder={motivo.placeholder}
              disabled={enCurso}
              rows={3}
              maxLength={500}
              aria-invalid={errorMotivo ? true : undefined}
              aria-describedby={errorMotivo ? id("motivo-error") : id("motivo-ayuda")}
              onChange={(e) => {
                setTextoMotivo(e.target.value);
                if (errorMotivo) setErrorMotivo(null);
              }}
            />
            {errorMotivo ? (
              <p id={id("motivo-error")} className="text-sm text-destructive-text">
                {errorMotivo}
              </p>
            ) : (
              <p id={id("motivo-ayuda")} className="text-xs text-muted-foreground">
                Obligatorio · mínimo {minimo} caracteres.
              </p>
            )}
          </div>
        )}

        {opciones.length > 0 && (
          <div className="grid gap-2">
            <Label htmlFor={id("escribir")}>
              <span>
                Para confirmar, escribe{" "}
                {opciones.map((o, i) => (
                  <span key={o}>
                    {i > 0 && " o "}
                    <strong className="font-semibold">{o}</strong>
                  </span>
                ))}
              </span>
            </Label>
            <Input
              id={id("escribir")}
              ref={escribirRef}
              value={escrito}
              autoComplete="off"
              spellCheck={false}
              disabled={enCurso}
              aria-invalid={errorEscrito ? true : undefined}
              aria-describedby={errorEscrito ? id("escribir-error") : undefined}
              onChange={(e) => {
                setEscrito(e.target.value);
                if (errorEscrito) setErrorEscrito(null);
              }}
            />
            {errorEscrito && (
              <p id={id("escribir-error")} className="text-sm text-destructive-text">
                {errorEscrito}
              </p>
            )}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive-text"
          >
            <WarningCircle className="mt-0.5 size-4 shrink-0" weight="fill" aria-hidden />
            <p>{error}</p>
          </div>
        )}

        <AlertDialogFooter>
          <Button
            ref={cancelarRef}
            type="button"
            variant="outline"
            disabled={enCurso}
            onClick={() => onOpenChange(false)}
          >
            {textoCancelar}
          </Button>
          <Button
            type="submit"
            disabled={enCurso}
            aria-busy={enCurso || undefined}
            className={cn(
              destructivo &&
                "bg-red-700 text-white hover:bg-red-800 dark:bg-red-600 dark:hover:bg-red-700"
            )}
          >
            {enCurso && <SpinnerIcon className="animate-spin" aria-hidden />}
            {enCurso ? verboCargando ?? "Procesando…" : verbo}
          </Button>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  );
}
