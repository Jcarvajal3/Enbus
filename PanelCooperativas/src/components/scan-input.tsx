"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Barcode } from "@phosphor-icons/react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Encomienda } from "@/lib/types/encomiendas";
import { Input } from "@/components/ui/input";
import { useBarcodeScan } from "@/hooks/use-barcode-scan";
import { CameraQRTrigger } from "@/components/camera-qr-scanner";

interface ScanInputProps {
  onEncomiendaFound?: (encomienda: Encomienda) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBoletoFound?: (boleto: any) => void;
  cooperativaId: string;
  disabled?: boolean;
  mode?: "encomiendas" | "boletos";
}

export function ScanInput({ 
  onEncomiendaFound, 
  onBoletoFound, 
  cooperativaId, 
  disabled = false,
  mode = "encomiendas" 
}: ScanInputProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const disabledRef = useRef(disabled);
  const [isSearching, setIsSearching] = useState(false);
  // Stable client instance — not recreated on every render
  const supabase = useMemo(() => createClient(), []);

  // Keep ref in sync so blur handler always reads latest disabled value
  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const handleSearch = useCallback(async (code: string) => {
    if (!code) return;
    setIsSearching(true);
    
    try {
      if (mode === "encomiendas") {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(code);
        const orCondition = isUUID 
          ? `id.eq.${code},tracking_id.eq.${code},qr_data.eq.${code}`
          : `tracking_id.eq.${code},qr_data.eq.${code}`;

        const { data, error } = await supabase
          .from("encomiendas")
          .select("*")
          .eq("cooperativa_id", cooperativaId)
          .or(orCondition)
          .single();
          
        if (error || !data) {
          toast.error("Encomienda no encontrada");
        } else {
          onEncomiendaFound?.(data as Encomienda);
        }
      } else if (mode === "boletos") {
        const { data, error } = await supabase
          .from("boletos")
          .select(`
            id, codigo_boleto, asiento, estado, pasajero_nombre,
            comprador:profiles!comprador_id(nombre_completo),
            viaje:viajes!viaje_id(ruta:rutas(ciudad_origen, ciudad_destino))
          `)
          .eq("cooperativa_id", cooperativaId)
          .or(`qr_embarque_data.eq.${code},codigo_boleto.eq.${code}`)
          .single();

        if (error || !data) {
          toast.error("Boleto no encontrado");
        } else {
          onBoletoFound?.(data);
        }
      }
    } catch {
      toast.error(mode === "encomiendas" ? "Error al buscar la encomienda" : "Error al buscar el boleto");
    } finally {
      setIsSearching(false);
      setValue(""); // Limpiar input después de procesar
    }
  }, [cooperativaId, onEncomiendaFound, onBoletoFound, mode, supabase]);

  // Use the custom hook for barcode scanner detection
  useBarcodeScan(handleSearch, disabled || isSearching);

  // Auto-focus logic
  useEffect(() => {
    if (disabled) return;
    
    // Focus immediately if not disabled
    inputRef.current?.focus();
    
    let timeoutId: NodeJS.Timeout;
    
    const handleBlur = () => {
      // Use ref to avoid stale closure capturing initial value of `disabled`
      timeoutId = setTimeout(() => {
        if (!disabledRef.current && document.activeElement !== inputRef.current) {
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

  const handleManualKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && value.trim()) {
      handleSearch(value.trim());
    }
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="relative flex-1">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Barcode size={24} weight="regular" className="text-muted-foreground" />
        </div>
        <Input
          ref={inputRef}
          type="text"
          placeholder="Escanear QR o escribir Tracking ID..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleManualKeyDown}
          disabled={disabled || isSearching}
          className="pl-11 h-12 text-lg shadow-sm transition-shadow focus-visible:ring-primary"
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
