"use client";

// ─── PIN de retiro ──────────────────────────────────────────────────────────
// Se valida en el servidor (fn_validar_pin_retiro): cada intento fallido cuenta
// y a los 10 el PIN se bloquea. Con foco al abrir y tras cada intento fallido.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { validarPin } from "@/app/cooperativas/(panel)/entrega/actions";
import { CheckCircle, Warning, LockKey } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { requireOnline } from "@/components/connectivity-banner";
import { humanizeError, isNetworkError } from "@/lib/errores";
import { PIN_MAX_INTENTOS as MAX_INTENTOS, PIN_RETIRO_LONGITUD } from "@/lib/artefactos.generated";

interface PinInputProps {
  encomiendaId: string;
  initialIntentos: number;
  initialBloqueado: boolean;
  /** PIN correcto: se pasa para entregarlo (el servidor lo revisa otra vez). */
  onValidado: (pin: string) => void;
  onBlocked: () => void;
}

export function PinInput({ encomiendaId, initialIntentos, initialBloqueado, onValidado, onBlocked }: PinInputProps) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pin, setPin] = useState("");
  const [isValidating, setIsValidating] = useState(false);
  const validandoRef = useRef(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [intentosRestantes, setIntentosRestantes] = useState(Math.max(0, MAX_INTENTOS - initialIntentos));
  const [isBlocked, setIsBlocked] = useState(initialBloqueado);

  // Tras un intento fallido el campo vuelve a habilitarse: devolverle el foco.
  useEffect(() => {
    if (!isValidating && !isSuccess && !isBlocked) inputRef.current?.focus();
  }, [isValidating, isSuccess, isBlocked]);

  const handleValidate = useCallback(
    async (pinCode: string) => {
      // Cada intento fallido cuenta en el servidor: nunca dos validaciones a la vez.
      if (validandoRef.current) return;
      validandoRef.current = true;
      setIsValidating(true);
      setErrorMsg("");

      try {
        const result = await requireOnline(() => validarPin(encomiendaId, pinCode))();

        if (!result.success) {
          setPin("");
          setErrorMsg(result.error);
          return;
        }
        const v = result.data;
        if (v.valido) {
          setIsSuccess(true);
          onValidado(pinCode);
          return;
        }
        setPin("");
        if (v.bloqueado) {
          setIsBlocked(true);
          setIntentosRestantes(0);
          setErrorMsg(v.mensaje || "El PIN se bloqueó por intentos fallidos.");
          onBlocked();
        } else {
          setIntentosRestantes(v.intentos_restantes);
          setErrorMsg(v.mensaje || `PIN incorrecto. Te quedan ${v.intentos_restantes} intentos.`);
        }
      } catch (err) {
        setErrorMsg(
          isNetworkError(err)
            ? "Sin conexión: no se puede validar el PIN. Revisa tu internet e intenta de nuevo."
            : humanizeError(err, "verificar el PIN")
        );
        setPin("");
      } finally {
        validandoRef.current = false;
        setIsValidating(false);
      }
    },
    [encomiendaId, onValidado, onBlocked]
  );

  const conError = Boolean(errorMsg) && !isBlocked && !isSuccess;

  return (
    <div className="flex flex-col items-center justify-center py-2 space-y-4">
      <label htmlFor={`${uid}-pin`} className="text-sm font-medium">
        Pídele a quien retira su PIN de 4 dígitos
      </label>
      <InputOTP
        ref={inputRef}
        id={`${uid}-pin`}
        maxLength={PIN_RETIRO_LONGITUD}
        inputMode="numeric"
        pattern="^[0-9]*$"
        autoFocus
        value={pin}
        onChange={(value) => {
          setPin(value);
          if (errorMsg && !isBlocked) setErrorMsg("");
          if (value.length === PIN_RETIRO_LONGITUD && !isValidating && !isSuccess && !isBlocked) {
            void handleValidate(value);
          }
        }}
        disabled={isBlocked || isSuccess || isValidating}
        aria-invalid={conError ? true : undefined}
        aria-describedby={`${uid}-estado`}
        className={cn(isSuccess && "text-success-text", isBlocked && "opacity-50")}
      >
        <InputOTPGroup>
          {Array.from({ length: PIN_RETIRO_LONGITUD }, (_, i) => (
            <InputOTPSlot
              key={i}
              index={i}
              className={cn(isSuccess && "border-success", conError && "border-2 border-destructive")}
            />
          ))}
        </InputOTPGroup>
      </InputOTP>

      <div id={`${uid}-estado`} className="min-h-6 flex items-center justify-center text-center text-sm" aria-live="polite">
        {isValidating ? (
          <span className="text-muted-foreground">Revisando el PIN…</span>
        ) : isSuccess ? (
          <span className="flex items-center gap-1.5 font-medium text-success-text">
            <CheckCircle size={18} weight="fill" aria-hidden />
            PIN correcto
          </span>
        ) : isBlocked ? (
          <span className="flex items-center gap-1.5 font-medium text-destructive-text">
            <LockKey size={18} weight="fill" aria-hidden />
            {errorMsg || "El PIN se bloqueó por intentos fallidos."}
          </span>
        ) : errorMsg ? (
          <span className="flex items-center gap-1.5 font-medium text-destructive-text" role="alert">
            <Warning size={18} aria-hidden />
            {errorMsg}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {intentosRestantes < MAX_INTENTOS
              ? `Te quedan ${intentosRestantes} ${intentosRestantes === 1 ? "intento" : "intentos"}.`
              : "Se valida al escribir el cuarto dígito."}
          </span>
        )}
      </div>
    </div>
  );
}
