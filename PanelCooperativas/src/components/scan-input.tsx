"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Barcode } from "@phosphor-icons/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { humanizeError, isNetworkError } from "@/lib/errores";
import { reproducirSonido } from "@/lib/sonido";
import type { Encomienda } from "@/lib/types/encomiendas";
import { Input } from "@/components/ui/input";
import { useBarcodeScan } from "@/hooks/use-barcode-scan";
import { CameraQRTrigger } from "@/components/camera-qr-scanner";

/** Por qué no se pudo resolver un código en modo `encomiendas`. */
export type ErrorEscaneo = {
  /** Lo escaneado o escrito (recortado a 32 caracteres si es un QR ajeno muy largo). */
  codigo: string;
  motivo: "no-encontrada" | "sin-red" | "error";
  /** Texto listo para mostrar. */
  mensaje: string;
};

interface ScanInputProps {
  /** Modo `encomiendas`: la encomienda encontrada en la cooperativa. */
  onEncomiendaFound?: (encomienda: Encomienda) => void;
  /**
   * Modo `boletos`: el código escaneado o escrito, limpio y en mayúsculas.
   * La página lo resuelve con `validarEmbarque` (la causa la decide el servidor).
   */
  onCodigo?: (codigo: string) => void;
  /**
   * Modo `encomiendas`: si se pasa, la pantalla se encarga del aviso (por ejemplo
   * `registrar({ codigo, tono: "error", titulo: "No encontrada", detalle: mensaje })`
   * de `useUltimoEscaneo`, que ya suena) y el campo no muestra toast ni suena.
   */
  onError?: (error: ErrorEscaneo) => void;
  cooperativaId: string;
  disabled?: boolean;
  mode?: "encomiendas" | "boletos";
  /** Texto de ayuda dentro del campo (por defecto, uno según el modo). */
  placeholder?: string;
  /** Por defecto true: suena "error" cuando no encuentra la encomienda o no hay red (sin `onError`). */
  sonido?: boolean;
}

const PLACEHOLDER: Record<NonNullable<ScanInputProps["mode"]>, string> = {
  encomiendas: "Escanea el QR o escribe el código de seguimiento (EB-…)",
  boletos: "Escanea el QR del boleto o escribe su código",
};

const MSG_SIN_RED = "Sin conexión: no se puede validar el código. Revisa tu internet.";

/** Solo se re-enfoca si nadie tiene el foco: nunca se le quita a otro campo o botón. */
function focoLibre() {
  const activo = document.activeElement;
  return !activo || activo === document.body;
}

export function ScanInput({
  onEncomiendaFound,
  onCodigo,
  onError,
  cooperativaId,
  disabled = false,
  mode = "encomiendas",
  placeholder,
  sonido = true,
}: ScanInputProps) {
  const [value, setValue] = useState("");
  const [invalido, setInvalido] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabledRef = useRef(disabled);
  /** Sube con cada código no resuelto: el campo lo deja seleccionado (el siguiente escaneo lo reemplaza). */
  const [pedirSeleccion, setPedirSeleccion] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);

  // Keep ref in sync so blur handler always reads latest disabled value
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const fallar = useCallback(
    (error: ErrorEscaneo, escrito: string) => {
      // El código queda escrito y seleccionado: se corrige o se reemplaza con el siguiente escaneo.
      setValue(escrito);
      setInvalido(true);
      setPedirSeleccion((n) => n + 1);
      if (onError) {
        onError(error);
        return;
      }
      toast.error(error.mensaje);
      if (sonido) reproducirSonido("error");
    },
    [onError, sonido]
  );

  const handleSearch = useCallback(async (code: string) => {
    if (!code) return;

    if (mode === "boletos") {
      // La validación (y su mensaje por causa) la hace la página con el servidor.
      const limpio = code.trim().toUpperCase();
      setValue("");
      setInvalido(false);
      if (limpio) onCodigo?.(limpio);
      return;
    }

    const limpio = code.trim();
    // El código de seguimiento se guarda en mayúsculas (EB-AAMMDD-NNNNN); el QR puede traer cualquier texto.
    const tracking = limpio.toUpperCase().replace(/\s+/g, "");
    // Un QR ajeno puede traer un texto largo: se recorta para que el aviso se lea.
    const mostrado = tracking.length > 32 ? `${tracking.slice(0, 32)}…` : tracking;

    // Sin red no se puede validar: decirlo, nunca "no encontrada".
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      fallar({ codigo: mostrado, motivo: "sin-red", mensaje: MSG_SIN_RED }, limpio);
      return;
    }

    setIsSearching(true);
    try {
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(limpio);
      // Valores entre comillas: un código con comas o paréntesis no rompe el filtro.
      const q = (v: string) => `"${v.replace(/["\\]/g, "")}"`;
      const condiciones = [`tracking_id.eq.${q(tracking)}`, `qr_data.eq.${q(limpio)}`];
      if (isUUID) condiciones.unshift(`id.eq.${limpio}`);

      const { data, error } = await supabase
        .from("encomiendas")
        .select("*")
        .eq("cooperativa_id", cooperativaId)
        .or(condiciones.join(","))
        .limit(1)
        .maybeSingle();

      if (error) {
        const red = isNetworkError(error);
        fallar(
          {
            codigo: mostrado,
            motivo: red ? "sin-red" : "error",
            mensaje: red ? MSG_SIN_RED : humanizeError(error, "buscar la encomienda"),
          },
          limpio
        );
      } else if (!data) {
        fallar(
          {
            codigo: mostrado,
            motivo: "no-encontrada",
            mensaje: `No encontramos la encomienda ${mostrado}. Revisa el código o búscala en la lista.`,
          },
          limpio
        );
      } else {
        setValue(""); // Encontrada: el campo queda listo para el siguiente escaneo.
        setInvalido(false);
        onEncomiendaFound?.(data as Encomienda);
      }
    } catch (err) {
      const red = isNetworkError(err);
      fallar(
        {
          codigo: mostrado,
          motivo: red ? "sin-red" : "error",
          mensaje: red ? MSG_SIN_RED : humanizeError(err, "buscar la encomienda"),
        },
        limpio
      );
    } finally {
      setIsSearching(false);
    }
  }, [cooperativaId, onEncomiendaFound, onCodigo, mode, supabase, fallar]);

  // Use the custom hook for barcode scanner detection
  useBarcodeScan(handleSearch, disabled || isSearching);

  // Auto-focus: listo para escanear, sin robar el foco a otro campo (filtros, buscadores…).
  useEffect(() => {
    if (disabled) return;

    if (focoLibre()) inputRef.current?.focus();

    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const handleBlur = () => {
      clearTimeout(timeoutId);
      // Use ref to avoid stale closure capturing initial value of `disabled`
      timeoutId = setTimeout(() => {
        if (!disabledRef.current && focoLibre()) {
          inputRef.current?.focus();
        }
      }, 2000);
    };

    const inputEl = inputRef.current;
    inputEl?.addEventListener("blur", handleBlur);

    return () => {
      clearTimeout(timeoutId);
      inputEl?.removeEventListener("blur", handleBlur);
    };
  }, [disabled]);

  // Mientras busca, el campo queda deshabilitado y pierde el foco: al terminar
  // se devuelve para el siguiente escaneo (si nadie más lo tomó).
  useEffect(() => {
    if (!isSearching && !disabledRef.current && focoLibre()) inputRef.current?.focus();
  }, [isSearching]);

  // Código no resuelto: queda escrito y seleccionado, listo para corregirlo o
  // reemplazarlo de un solo escaneo (no se borra).
  useEffect(() => {
    if (pedirSeleccion === 0 || isSearching || disabledRef.current) return;
    const el = inputRef.current;
    if (!el) return;
    if (focoLibre() || document.activeElement === el) {
      el.focus();
      el.select();
    }
  }, [pedirSeleccion, isSearching]);

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      e.preventDefault();
      handleSearch(value.trim());
    }
  };

  const texto = placeholder ?? PLACEHOLDER[mode];

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Barcode size={24} weight="regular" className="text-muted-foreground" aria-hidden />
        </div>
        <Input
          ref={inputRef}
          type="text"
          placeholder={texto}
          aria-label={texto}
          aria-invalid={invalido || undefined}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (invalido) setInvalido(false);
          }}
          onKeyDown={handleManualKeyDown}
          disabled={disabled || isSearching}
          aria-busy={isSearching || undefined}
          className="pl-11 h-12 text-lg shadow-sm transition-shadow"
          autoFocus
        />
      </div>
      <CameraQRTrigger
        onScan={(code) => { if (!isSearching) handleSearch(code); }}
        disabled={disabled || isSearching}
      />
    </div>
  );
}
