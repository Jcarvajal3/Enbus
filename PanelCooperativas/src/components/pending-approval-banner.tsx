"use client";

import { useUser } from "@/hooks/use-user";
import { Clock, X } from "@phosphor-icons/react";
import { useState } from "react";

export function PendingApprovalBanner() {
  const { user } = useUser();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (user.cooperativa_estado !== "PENDIENTE") return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="
        relative flex items-center justify-center gap-2
        bg-amber-500 text-amber-950
        px-4 py-2.5 text-sm font-medium text-center
        animate-in slide-in-from-top duration-300
      "
    >
      <Clock size={16} weight="bold" aria-hidden className="shrink-0" />
      <span>
        Tu cooperativa está <strong>pendiente de aprobación</strong>. Nuestro equipo revisará tu solicitud y recibirás una notificación cuando sea activada.
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Cerrar notificación"
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 hover:bg-amber-600/30 transition-colors cursor-pointer"
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
