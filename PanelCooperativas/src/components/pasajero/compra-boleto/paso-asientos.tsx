"use client";

// ─── Paso 1: elige tus asientos ──────────────────────────────────────────────
// Mapa con los asientos ocupados al día (se refresca solo). Los asientos que esta misma compra ya
// tiene apartados se muestran libres y elegidos (no cuentan como ocupados). Si falta la cédula o el
// teléfono del perfil se piden aquí mismo, antes de apartar, sin sacar a la persona del flujo.

import { AvisoError } from "@/components/aviso-error";
import { SeatSelector } from "@/components/boletos/seat-selector";
import { Card } from "@/components/ui/card";
import { PerfilCompleto } from "@/components/pasajero/perfil-completo";
import { AvisoCompra, type AvisoFlujo } from "./aviso-compra";
import { MAX_ASIENTOS } from "./tipos";

export function PasoAsientos({
  totalAsientos,
  ocupados,
  errorOcupados,
  onReintentar,
  seleccion,
  onChange,
  bloqueado,
  aviso,
  pidiendoPerfil,
  cedulaInicial,
  telefonoInicial,
  onPerfilListo,
}: {
  totalAsientos: number;
  ocupados: ReadonlySet<string> | null;
  errorOcupados: string | null;
  onReintentar: () => void | Promise<void>;
  seleccion: string[];
  onChange: (asientos: string[]) => void;
  bloqueado: boolean;
  aviso: AvisoFlujo | null;
  pidiendoPerfil: boolean;
  cedulaInicial: string | null;
  telefonoInicial: string | null;
  onPerfilListo: () => void;
}) {
  return (
    <>
      <div aria-live="polite">
        {aviso &&
          (aviso.tono === "error" ? (
            <AvisoError>{aviso.texto}</AvisoError>
          ) : (
            <AvisoCompra tono="info">{aviso.texto}</AvisoCompra>
          ))}
      </div>

      <SeatSelector
        totalAsientos={totalAsientos}
        ocupados={ocupados}
        seleccion={seleccion}
        onChange={onChange}
        error={errorOcupados}
        onReintentar={onReintentar}
        maxSeleccion={MAX_ASIENTOS}
        modo="pasajero"
        bloqueado={bloqueado || pidiendoPerfil}
      />

      {pidiendoPerfil && (
        <Card className="p-5 py-5" role="region" aria-label="Completa tus datos para apartar los asientos">
          <PerfilCompleto cedulaInicial={cedulaInicial} telefonoInicial={telefonoInicial} onListo={onPerfilListo} />
        </Card>
      )}
    </>
  );
}
