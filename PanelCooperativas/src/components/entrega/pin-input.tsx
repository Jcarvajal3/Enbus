"use client";

import { useState, useCallback } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { validarPin } from "@/app/cooperativas/(panel)/entrega/actions";
import { CheckCircle, Warning, LockKey } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { requireOnline } from "@/components/connectivity-banner";

interface PinInputProps {
  encomiendaId: string;
  initialIntentos: number;
  initialBloqueado: boolean;
  onSuccess: () => void;
  onBlocked: () => void;
}

export function PinInput({
  encomiendaId,
  initialIntentos,
  initialBloqueado,
  onSuccess,
  onBlocked,
}: PinInputProps) {
  const [pin, setPin] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState(10 - initialIntentos);
  const [isBlocked, setIsBlocked] = useState(initialBloqueado);
  const [shake, setShake] = useState(false);

  const handleValidate = useCallback(async (pinCode: string) => {
    setIsValidating(true);
    setErrorMsg("");

    try {
      const result = await requireOnline(() => validarPin(encomiendaId, pinCode))();

      if (result.success) {
        setIsSuccess(true);
        onSuccess();
      } else {
        setPin(""); // Limpiar para intentar de nuevo
        
        if (result.bloqueado) {
          setIsBlocked(true);
          onBlocked();
          setErrorMsg(result.mensaje || "PIN bloqueado.");
        } else {
          setIntentosRestantes(result.intentosRestantes ?? 0);
          setErrorMsg(result.mensaje || "PIN incorrecto");
          setShake(true);
          setTimeout(() => setShake(false), 500);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error de conexión al validar";
      setErrorMsg(message);
      setPin("");
    } finally {
      setIsValidating(false);
    }
  }, [encomiendaId, onSuccess, onBlocked]);

  return (
    <div className="flex flex-col items-center justify-center py-2 space-y-4">
      <div className={cn("transition-all duration-200", shake && "animate-shake")}>
        <InputOTP
          maxLength={4}
          value={pin}
          onChange={(value) => {
            setPin(value);
            if (value.length === 4 && !isValidating && !isSuccess && !isBlocked) {
              void handleValidate(value);
            }
          }}
          disabled={isBlocked || isSuccess || isValidating}
          className={cn(
            isSuccess && "text-emerald-500",
            errorMsg && !isBlocked && "text-destructive",
            isBlocked && "opacity-50"
          )}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className={cn(isSuccess && "border-emerald-500", errorMsg && "border-destructive")} />
            <InputOTPSlot index={1} className={cn(isSuccess && "border-emerald-500", errorMsg && "border-destructive")} />
            <InputOTPSlot index={2} className={cn(isSuccess && "border-emerald-500", errorMsg && "border-destructive")} />
            <InputOTPSlot index={3} className={cn(isSuccess && "border-emerald-500", errorMsg && "border-destructive")} />
          </InputOTPGroup>
        </InputOTP>
      </div>

      <div className="h-6 flex items-center justify-center text-sm">
        {isSuccess ? (
          <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
            <CheckCircle size={18} weight="fill" />
            PIN Validado
          </span>
        ) : isBlocked ? (
          <span className="flex items-center gap-1.5 text-destructive font-medium">
            <LockKey size={18} weight="fill" />
            {errorMsg || "PIN bloqueado. Contactar soporte."}
          </span>
        ) : errorMsg ? (
          <span className="flex items-center gap-1.5 text-destructive font-medium">
            <Warning size={18} />
            {errorMsg}
          </span>
        ) : (
          <span className="text-muted-foreground">
            Ingresa los 4 dígitos. Intentos: {intentosRestantes}
          </span>
        )}
      </div>
    </div>
  );
}
