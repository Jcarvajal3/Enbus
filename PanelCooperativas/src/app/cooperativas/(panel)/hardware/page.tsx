"use client";

// ─── Impresora y lector (#53, P-60, PC-51) ───────────────────────────────────
// Para ambos roles (menú "Impresora y lector"). Tres bloques:
// - Impresora: estado, conectar o cambiar, ticket de prueba y ancho del papel.
//   Al abrir el panel la impresora guardada se reconecta sola (use-impresora).
// - Lector: campo de prueba que distingue un lector (todo el código en menos de
//   medio segundo) de lo escrito a mano.
// - Sonido: "Sonar al escanear" (lib/sonido, preferencia de este equipo) y pruebas.

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type KeyboardEvent } from "react";
import { CheckCircle, Info, Scan, SpeakerHigh, WarningCircle } from "@phosphor-icons/react";
import { PageHeader } from "@/components/page-header";
import { GrupoOpciones, OpcionTile } from "@/components/opcion-tile";
import { avisarError, avisarExito } from "@/lib/avisos";
import { ICONO_SECCION } from "@/lib/navigation";
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
      avisarExito("Enviamos el ticket de prueba a la impresora.");
    } catch (err) {
      avisarError(mensajeErrorImpresora(err) ?? "No se imprimió el ticket de prueba. Intenta de nuevo.");
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
          <ICONO_SECCION.impresora className="size-5 text-muted-foreground" aria-hidden />
          Impresora
        </CardTitle>
        <CardDescription>Térmica de tickets, por Bluetooth.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-3 rounded-md bg-muted/50 p-4" role="status" aria-live="polite">
          <span
            className={cn(
              "size-3 shrink-0 rounded-full",
              conectada ? "bg-success" : estado === "reconectando" ? "bg-warning" : "bg-muted-foreground"
            )}
            aria-hidden
          />
          <div className="flex min-w-0 flex-col gap-0.5">
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
          <p className="text-sm text-muted-foreground">Los boletos y las guías salen por la impresión del navegador.</p>
        )}

        <div className="flex flex-col gap-2">
          <p id={`${uid}-papel`} className="text-sm font-medium">
            Ancho del papel
          </p>
          <GrupoOpciones etiqueta="Ancho del papel" className="grid grid-cols-2 gap-2">
            {(["58", "80"] as const).map((ancho) => (
              <OpcionTile
                key={ancho}
                seleccionado={papel === ancho}
                onSelect={() => guardarPapel(ancho)}
                titulo={`${ancho} mm`}
                detalle={`${caracteresPorLinea(ancho)} caracteres`}
              />
            ))}
          </GrupoOpciones>
        </div>

        {/* Solo tiene sentido si el navegador puede usar Bluetooth (si no, contradice el aviso de arriba). */}
        {soportado && (
          <p className="flex items-start gap-2 rounded-md bg-info-light p-3 text-sm text-info-deep">
            <Info className="mt-0.5 size-4 shrink-0 text-info-text" weight="fill" aria-hidden />
            Al abrir el panel intentamos reconectarla sola.
          </p>
        )}
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
          <Scan className="size-5 text-muted-foreground" aria-hidden />
          Lector
        </CardTitle>
        <CardDescription>De códigos, USB o Bluetooth.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${uid}-lector`}>Prueba el lector aquí</Label>
          <Input
            id={`${uid}-lector`}
            autoComplete="off"
            spellCheck={false}
            value={valor}
            onChange={alEscribir}
            onKeyDown={alTecla}
            className="font-mono"
          />
        </div>

        <div className="flex min-h-20 flex-col justify-center rounded-md bg-muted/50 p-4" role="status" aria-live="polite">
          {prueba?.tipo === "lector" ? (
            <div className="flex items-start gap-3">
              <CheckCircle className="size-5 shrink-0 text-success-text" weight="fill" aria-hidden />
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-semibold text-success-text">El lector funciona ({prueba.ms} ms)</p>
                <p className="truncate font-mono text-sm text-foreground">{prueba.codigo}</p>
              </div>
            </div>
          ) : prueba?.tipo === "mano" ? (
            <div className="flex items-start gap-3">
              <WarningCircle className="size-5 shrink-0 text-warning-text" weight="fill" aria-hidden />
              <p className="text-sm font-medium text-warning-deep">Parece escrito a mano: un lector tarda menos de medio segundo.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Escanea un código para probarlo.</p>
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
          <SpeakerHigh className="size-5 text-muted-foreground" aria-hidden />
          Sonido
        </CardTitle>
        <CardDescription>Un tono confirma cada escaneo. Se guarda en este equipo.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
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
    <div className="flex w-full max-w-4xl flex-col gap-6">
      <PageHeader title="Impresora y lector" description="La impresora y el lector de este equipo." />
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
