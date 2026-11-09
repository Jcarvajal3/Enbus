"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, CopySimple, Plus, X } from "@phosphor-icons/react";
import {
  DIAS,
  DIAS_LABORABLES,
  DIA_LARGO,
  MAX_TRAMOS,
  PRESETS_HORARIO,
  TEXTO_HORARIO_LARGO,
  aMinutos,
  conDia,
  copiarDia,
  cruzaMedianoche,
  deMinutos,
  errorDia,
  hora12,
  horarioATexto,
  horarioInicial,
  mismoHorario,
  opcionesHora,
  tramo,
  type DiaSemana,
  type HorarioSemana,
  type Tramo,
} from "@/lib/horario";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Campo "Horario de atención" del formulario de sucursal.
//   - Sin horario: botón para agregarlo (es opcional).
//   - Texto libre antiguo (sin horario_semana): se muestra y se puede pasar al editor;
//     el texto se conserva hasta que guarden.
//   - Editor por días: abierto/cerrado, hora de apertura y cierre (12 h), hasta dos turnos,
//     atajos para copiar un día y presets comunes.
// ─────────────────────────────────────────────────────────────────────────────

const OPCIONES_ABRE = opcionesHora(30);
const OPCIONES_CIERRA = opcionesHora(30, true);
const TRAMO_POR_DEFECTO = tramo("08:00", "17:00");

interface CampoHorarioProps {
  /** id del contenedor (recibe el foco si hay error). */
  id: string;
  semana: HorarioSemana | null;
  /** Texto libre antiguo de la sucursal ("" si no tenía o si ya usa el editor). */
  textoAnterior: string;
  onChange: (semana: HorarioSemana | null, textoAnterior: string) => void;
  error?: string;
  disabled?: boolean;
}

export function CampoHorario({ id, semana, textoAnterior, onChange, error, disabled }: CampoHorarioProps) {
  return (
    <div
      id={id}
      tabIndex={-1}
      role="group"
      aria-labelledby={`${id}-titulo`}
      aria-describedby={error ? `${id}-error` : undefined}
      className="flex min-w-0 flex-col gap-3 outline-none sm:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id={`${id}-titulo`} className="text-sm leading-none font-medium text-foreground">
          Horario de atención (opcional)
        </p>
        {semana && (
          <Button type="button" variant="link" size="sm" className="h-auto px-0" disabled={disabled} onClick={() => onChange(null, "")}>
            Quitar horario
          </Button>
        )}
      </div>

      {semana ? (
        <>
          {textoAnterior && (
            <p className="text-sm text-muted-foreground">
              Antes decía «{textoAnterior}». Se reemplaza al guardar.{" "}
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto px-0"
                disabled={disabled}
                onClick={() => onChange(null, textoAnterior)}
              >
                Volver al texto anterior
              </Button>
            </p>
          )}
          <EditorHorario id={id} value={semana} onChange={(s) => onChange(s, textoAnterior)} disabled={disabled} />
        </>
      ) : textoAnterior ? (
        <div className="flex flex-col gap-3 rounded-md border border-border p-3">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Horario actual (texto libre)</p>
            <p className="text-sm text-foreground">{textoAnterior}</p>
          </div>
          <p className="text-sm text-muted-foreground">
            Pásalo al editor por días para que los pasajeros lo vean ordenado. El texto actual se mantiene hasta que guardes.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(horarioInicial(), textoAnterior)}>
              <Clock aria-hidden />
              Pasar al editor por días
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange(null, "")}>
              Quitar horario
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border p-3">
          <p className="text-sm text-muted-foreground">Sin horario. Los pasajeros no verán a qué hora atiende esta sucursal.</p>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onChange(horarioInicial(), "")}>
            <Plus aria-hidden />
            Agregar horario
          </Button>
        </div>
      )}

      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive-text">
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EditorHorario({
  id, value, onChange, disabled,
}: {
  id: string;
  value: HorarioSemana;
  onChange: (h: HorarioSemana) => void;
  disabled?: boolean;
}) {
  const texto = horarioATexto(value);
  const todoCerrado = DIAS.every((d) => value.dias[d].length === 0);

  /** Al abrir un día cerrado: los turnos del día abierto anterior más cercano (o el siguiente), o 8 a. m. – 5 p. m. */
  function abrirDia(dia: DiaSemana) {
    const i = DIAS.indexOf(dia);
    const vecinos = [...DIAS.slice(0, i).reverse(), ...DIAS.slice(i + 1)];
    const modelo = vecinos.map((d) => value.dias[d]).find((t) => t.length > 0) ?? [TRAMO_POR_DEFECTO];
    onChange(conDia(value, dia, modelo.map((t) => ({ ...t }))));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Horarios comunes">
        {PRESETS_HORARIO.map((p) => {
          const activo = mismoHorario(value, p.crear());
          return (
            <Button
              key={p.id}
              type="button"
              variant="outline"
              size="xs"
              aria-pressed={activo}
              disabled={disabled}
              className={cn(activo && "border-accent-strong bg-muted")}
              onClick={() => onChange(p.crear())}
            >
              {p.label}
            </Button>
          );
        })}
      </div>

      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {DIAS.map((dia) => (
          <FilaDia
            key={dia}
            id={`${id}-${dia}`}
            dia={dia}
            tramos={value.dias[dia]}
            disabled={disabled}
            onAbrir={() => abrirDia(dia)}
            onCambiar={(tramos) => onChange(conDia(value, dia, tramos))}
            onCopiar={(destinos) => onChange(copiarDia(value, dia, destinos.filter((d) => d !== dia)))}
          />
        ))}
      </ul>

      <div className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2" aria-live="polite">
        <p className="text-xs text-muted-foreground">Así lo verán los pasajeros en la app</p>
        <p className="text-sm text-foreground">{texto}</p>
        {todoCerrado ? (
          <p className="text-xs text-muted-foreground">Si la sucursal ya no atiende, mejor desactívala.</p>
        ) : texto.length > TEXTO_HORARIO_LARGO ? (
          <p className="text-xs text-muted-foreground">Es un horario largo: en la app se verá en varias líneas.</p>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Segundo turno: parte el día al mediodía si se puede (8–6 → 8–12 y 2–6); si no, uno después
 * del primero sin solaparse. null si ya no cabe ninguno válido (p. ej. el primero cierra 11:30 p. m.).
 */
function conSegundoTurno(dia: DiaSemana, tramos: Tramo[]): Tramo[] | null {
  if (tramos.length !== 1 || cruzaMedianoche(tramos[0])) return null;
  const [primero] = tramos;
  const abre = aMinutos(primero.abre);
  const cierra = aMinutos(primero.cierra);
  if (abre === null || cierra === null) return null;
  if (cierra > abre && abre < 12 * 60 && cierra > 14 * 60) {
    return [tramo(primero.abre, "12:00"), tramo("14:00", primero.cierra)];
  }
  // Una hora de pausa (o media, si no alcanza) y hasta tres horas de turno, sin pasar de medianoche.
  for (const pausa of [60, 30]) {
    const inicio = cierra + pausa;
    const fin = Math.min(inicio + 180, 24 * 60);
    if (inicio >= 24 * 60 || fin <= inicio) continue;
    const propuesta = [primero, tramo(deMinutos(inicio), deMinutos(fin))];
    if (!errorDia(dia, propuesta)) return propuesta;
  }
  return null;
}

function FilaDia({
  id, dia, tramos, disabled, onAbrir, onCambiar, onCopiar,
}: {
  id: string;
  dia: DiaSemana;
  tramos: Tramo[];
  disabled?: boolean;
  onAbrir: () => void;
  onCambiar: (tramos: Tramo[]) => void;
  onCopiar: (destinos: readonly DiaSemana[]) => void;
}) {
  const nombre = DIA_LARGO[dia];
  const abierto = tramos.length > 0;
  const error = abierto ? errorDia(dia, tramos) : null;
  // Solo se ofrece "+ Turno" si cabe un segundo turno válido (sin solaparse ni pasar de medianoche).
  const segundoTurno = abierto && tramos.length < MAX_TRAMOS ? conSegundoTurno(dia, tramos) : null;

  const cambiarTramo = (i: number, campo: keyof Tramo, hora: string) =>
    onCambiar(tramos.map((t, j) => (j === i ? { ...t, [campo]: hora } : t)));

  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex h-8 items-center gap-2 sm:w-32 sm:shrink-0">
        <Switch
          id={`${id}-abierto`}
          checked={abierto}
          disabled={disabled}
          onCheckedChange={(v) => (v ? onAbrir() : onCambiar([]))}
        />
        <Label htmlFor={`${id}-abierto`} className="text-sm font-medium">
          {nombre}
        </Label>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {!abierto ? (
          <p className="flex h-8 items-center text-sm text-muted-foreground">Cerrado</p>
        ) : (
          tramos.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <SelectHora
                value={t.abre}
                opciones={OPCIONES_ABRE}
                label={`${nombre}${tramos.length > 1 ? `, turno ${i + 1}` : ""}: abre`}
                disabled={disabled}
                onChange={(h) => cambiarTramo(i, "abre", h)}
              />
              <span className="text-sm text-muted-foreground">a</span>
              <SelectHora
                value={t.cierra}
                opciones={OPCIONES_CIERRA}
                label={`${nombre}${tramos.length > 1 ? `, turno ${i + 1}` : ""}: cierra`}
                disabled={disabled}
                onChange={(h) => cambiarTramo(i, "cierra", h)}
              />
              {cruzaMedianoche(t) && <span className="text-xs text-muted-foreground">(día siguiente)</span>}
              {i > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar el turno ${i + 1} del ${nombre.toLowerCase()}`}
                  disabled={disabled}
                  onClick={() => onCambiar(tramos.filter((_, j) => j !== i))}
                >
                  <X aria-hidden />
                </Button>
              )}
            </div>
          ))
        )}
        {error && <p className="text-sm text-destructive-text">{error}</p>}
      </div>

      <div className="flex items-center gap-1 sm:shrink-0">
        {segundoTurno && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label={`Agregar un segundo turno el ${nombre.toLowerCase()}`}
            onClick={() => onCambiar(segundoTurno)}
          >
            <Plus aria-hidden />
            Turno
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            aria-label={`Copiar el horario del ${nombre.toLowerCase()}`}
            disabled={disabled}
          >
            <CopySimple aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onCopiar(DIAS_LABORABLES)}>Aplicar de lunes a viernes</DropdownMenuItem>
            <DropdownMenuItem onClick={() => onCopiar(DIAS)}>Aplicar a todos los días</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function SelectHora({
  value, opciones, label, disabled, onChange,
}: {
  value: string;
  opciones: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
  onChange: (hora: string) => void;
}) {
  // Una hora guardada fuera de la lista (p. ej. 7:15) se agrega para no perderla.
  const lista = opciones.some((o) => o.value === value)
    ? opciones
    : [...opciones, { value, label: hora12(value) }].sort((a, b) => (aMinutos(a.value) ?? 0) - (aMinutos(b.value) ?? 0));
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
      <SelectTrigger size="sm" aria-label={label} className="w-[8.5rem]">
        <SelectValue>{(v: string) => hora12(v)}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {lista.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
