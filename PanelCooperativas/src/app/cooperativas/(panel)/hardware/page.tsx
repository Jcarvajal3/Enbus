"use client";

// ─── Impresora y lector (#53, P-60, PC-51) ───────────────────────────────────
// Para ambos roles (menú "Impresora y lector"). Tres bloques:
// - Impresora: estado, conectar o cambiar, ticket de prueba y ancho del papel.
//   Al abrir el panel la impresora guardada se reconecta sola (use-impresora).
// - Lector: campo de prueba que distingue un lector (todo el código en menos de
//   medio segundo) de lo escrito a mano.
// - Sonido: "Sonar al escanear" (lib/sonido, preferencia de este equipo) y pruebas.

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from "react";
import { CheckCircle, Info, Printer, Scan, SpeakerHigh, WarningCircle } from "@phosphor-icons/react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useImpresora } from "@/hooks/use-impresora";
import { mensajeErrorImpresora, printer } from "@/lib/printing/bluetooth";
import { anchoPapel, buildTicket, caracteresPorLinea, setAnchoPapel, type AnchoPapel } from "@/lib/printing/escpos";
import { reproducirSonido, setSonidoActivado, sonidoActivado, suscribirSonido } from "@/lib/sonido";
import { formatFechaHoraVE } from "@/lib/fechas";
import { cn } from "@/lib/utils";

/** Un lector escribe todo el código en menos de esto. */
const LIMITE_LECTOR_MS = 500;
/** Lectores sin Enter al final: se evalúa tras esta pausa. */
const PAUSA_MS = 300;
const MIN_CARACTERES = 4;

// ── Ancho del papel: preferencia de este equipo, observable entre componentes ──
const EVENTO_PAPEL = "enbus:papel";
function suscribirPapel(cambio: () => void) {
  window.addEventListener(EVENTO_PAPEL, cambio);
  window.addEventListener("storage", cambio);
  return () => {
    window.removeEventListener(EVENTO_PAPEL, cambio);
    window.removeEventListener("storage", cambio);
  };
}
function guardarPapel(ancho: AnchoPapel) {
  setAnchoPapel(ancho);
  window.dispatchEvent(new Event(EVENTO_PAPEL));
}

type PruebaLector = { tipo: "lector"; codigo: string; ms: number } | { tipo: "mano"; codigo: string };

function SeccionImpresora() {
  const uid = useId();
  const { estado, nombre, conectar } = useImpresora();
  const papel = useSyncExternalStore(suscribirPapel, anchoPapel, () => "58" as AnchoPapel);
  const [conectando, setConectando] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);

  const conectada = estado === "conectada";
  const soportado = estado !== "no-soportado";

  const alConectar = async () => {
    setConectando(true);
    try {
      await conectar();
    } finally {
      setConectando(false);
    }
  };

  const imprimirPrueba = async () => {
    setImprimiendo(true);
    try {
      const n = caracteresPorLinea(papel);
      const regla = "1234567890".repeat(Math.ceil(n / 10)).slice(0, n);
      await printer.write(
        buildTicket({
          title: "PRUEBA",
          lines: [
            { label: "Fecha", value: formatFechaHoraVE(new Date()) },
            { label: "Papel", value: `${papel} mm (${n} caracteres)` },
          ],
          footer: `${regla}\nSi la regla cabe en una línea, el ancho es correcto.`,
          papel,
        })
      );
      toast.success("Enviamos el ticket de prueba a la impresora.");
    } catch (err) {
      toast.error(mensajeErrorImpresora(err) ?? "No se imprimió el ticket de prueba. Intenta de nuevo.");
    } finally {
      setImprimiendo(false);
    }
  };

  const textoEstado =
    estado === "conectada"
      ? `Conectada · ${nombre ?? "Impresora"}`
      : estado === "reconectando"
        ? "Reconectando…"
        : estado === "no-soportado"
          ? "Este navegador no puede usar impresoras Bluetooth. Usa Chrome o Edge."
          : "Sin conectar";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Printer size={24} weight="duotone" aria-hidden />
          Impresora
        </CardTitle>
        <CardDescription>Impresora térmica de tickets por Bluetooth.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4" role="status" aria-live="polite">
          <span
            className={cn(
              "size-3 shrink-0 rounded-full",
              conectada ? "bg-success" : estado === "reconectando" ? "bg-warning" : "bg-muted-foreground"
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-medium">{textoEstado}</p>
            {!conectada && soportado && nombre && (
              <p className="text-sm text-muted-foreground">Última impresora: {nombre}</p>
            )}
          </div>
          {estado === "reconectando" && <Spinner size="sm" className="ml-auto" />}
        </div>

        {soportado ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button onClick={() => void alConectar()} className="flex-1" disabled={conectando}>
              {conectando ? "Buscando impresoras…" : conectada ? "Cambiar impresora" : "Conectar impresora"}
            </Button>
            <Button
              onClick={() => void imprimirPrueba()}
              variant="outline"
              disabled={!conectada || imprimiendo}
              className="flex-1"
            >
              {imprimiendo ? "Imprimiendo…" : "Imprimir ticket de prueba"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sin impresora Bluetooth, los boletos y las guías salen por la ventana de impresión del navegador.
          </p>
        )}

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Ancho del papel</legend>
          <div className="flex gap-3">
            {(["58", "80"] as const).map((ancho) => (
              <label
                key={ancho}
                htmlFor={`${uid}-papel-${ancho}`}
                className={cn(
                  "flex flex-1 cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  papel === ancho ? "border-foreground bg-muted/60 font-medium" : "hover:bg-muted/40"
                )}
              >
                <input
                  id={`${uid}-papel-${ancho}`}
                  type="radio"
                  name={`${uid}-papel`}
                  value={ancho}
                  checked={papel === ancho}
                  onChange={() => guardarPapel(ancho)}
                  className="accent-foreground"
                />
                {ancho} mm
              </label>
            ))}
          </div>
        </fieldset>

        <p className="flex items-start gap-2 rounded-md bg-info-light p-3 text-sm text-info-deep">
          <Info size={20} className="mt-0.5 shrink-0" aria-hidden />
          Al abrir el panel intentamos reconectarla sola.
        </p>
      </CardContent>
    </Card>
  );
}

function SeccionLector() {
  const uid = useId();
  const [valor, setValor] = useState("");
  const [prueba, setPrueba] = useState<PruebaLector | null>(null);
  const inicioRef = useRef<number | null>(null);
  const finRef = useRef(0);
  const pausaRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(pausaRef.current), []);

  const evaluar = (codigo: string) => {
    clearTimeout(pausaRef.current);
    const inicio = inicioRef.current;
    inicioRef.current = null;
    const limpio = codigo.trim();
    if (inicio === null || limpio.length < MIN_CARACTERES) return;
    const ms = Math.max(0, Math.round(finRef.current - inicio));
    setPrueba(ms < LIMITE_LECTOR_MS ? { tipo: "lector", codigo: limpio, ms } : { tipo: "mano", codigo: limpio });
    setValor("");
  };

  const alEscribir = (e: ChangeEvent<HTMLInputElement>) => {
    const nuevo = e.target.value;
    const ahora = performance.now();
    if (!nuevo) inicioRef.current = null;
    else if (inicioRef.current === null) inicioRef.current = ahora;
    finRef.current = ahora;
    setValor(nuevo);
    clearTimeout(pausaRef.current);
    // Algunos lectores no mandan Enter al final: se evalúa tras una pausa corta.
    pausaRef.current = setTimeout(() => evaluar(nuevo), PAUSA_MS);
  };

  const alTecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      evaluar(valor);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scan size={24} weight="duotone" aria-hidden />
          Lector
        </CardTitle>
        <CardDescription>Lector de códigos USB o Bluetooth. Pruébalo antes de empezar a atender.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor={`${uid}-lector`}>Prueba el lector aquí</Label>
          <Input
            id={`${uid}-lector`}
            autoComplete="off"
            spellCheck={false}
            placeholder="Haz clic aquí y escanea cualquier código"
            value={valor}
            onChange={alEscribir}
            onKeyDown={alTecla}
            className="py-6 font-mono text-lg"
          />
        </div>

        <div className="flex min-h-[88px] flex-col justify-center rounded-lg border bg-muted/50 p-4" role="status" aria-live="polite">
          {prueba?.tipo === "lector" ? (
            <div className="flex items-start gap-3 text-success-text">
              <CheckCircle size={28} weight="fill" className="shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">El lector funciona ({prueba.ms} ms).</p>
                <p className="mt-1 truncate font-mono text-sm text-foreground">{prueba.codigo}</p>
              </div>
            </div>
          ) : prueba?.tipo === "mano" ? (
            <div className="flex items-start gap-3 text-warning-text">
              <WarningCircle size={28} weight="fill" className="shrink-0" aria-hidden />
              <p className="text-sm font-medium">
                Eso parece escrito a mano: un lector escribe todo el código en menos de medio segundo.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Escanea un código para comprobar que el lector funciona.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SeccionSonido() {
  const uid = useId();
  const activado = useSyncExternalStore(suscribirSonido, sonidoActivado, () => true);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SpeakerHigh size={24} weight="duotone" aria-hidden />
          Sonido
        </CardTitle>
        <CardDescription>Un tono corto confirma cada escaneo sin mirar la pantalla. Se guarda en este equipo.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Switch id={`${uid}-sonido`} checked={activado} onCheckedChange={(v) => setSonidoActivado(Boolean(v))} />
          <Label htmlFor={`${uid}-sonido`}>Sonar al escanear</Label>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" className="flex-1" disabled={!activado} onClick={() => reproducirSonido("exito")}>
            Probar sonido de éxito
          </Button>
          <Button variant="outline" className="flex-1" disabled={!activado} onClick={() => reproducirSonido("error")}>
            Probar sonido de error
          </Button>
        </div>
        {!activado && <p className="text-sm text-muted-foreground">Activa «Sonar al escanear» para probarlo.</p>}
      </CardContent>
    </Card>
  );
}

export default function ImpresoraYLectorPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title="Impresora y lector" description="Prepara la impresora de tickets y el lector de esta computadora." />
      <div className="grid gap-6 lg:grid-cols-2">
        <SeccionImpresora />
        <div className="flex flex-col gap-6">
          <SeccionLector />
          <SeccionSonido />
        </div>
      </div>
    </div>
  );
}
