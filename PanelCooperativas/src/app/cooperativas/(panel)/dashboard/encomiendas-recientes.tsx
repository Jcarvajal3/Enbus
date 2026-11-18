"use client";

// Encomiendas recientes del Resumen: tabla en escritorio, tarjetas en móvil.

import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { FilaVacia } from "@/components/fila-vacia";
import { CeldaEnlace } from "@/components/celda-enlace";
import { EntityCard } from "@/components/entity-card";
import { ListaResponsive } from "@/components/lista-responsive";
import { IconTile } from "@/components/icon-tile";
import { formatFechaHoraCortaVE } from "@/lib/fechas";
import { formatCiudad } from "@/lib/ciudades";
import { ICONO_SECCION } from "@/lib/navigation";
import type { EncomiendaReciente } from "./resumen-vista";

/** Quién envía: en el alta presencial `sender_id` es el empleado; el remitente real está en `remitente_nombre`. */
function nombreRemitente(enc: EncomiendaReciente) {
  if (enc.origen_registro === "TAQUILLA" && enc.remitente_nombre) return enc.remitente_nombre;
  const embed = enc.sender;
  const sender = (Array.isArray(embed) ? embed[0] : embed) as { nombre_completo?: string | null } | null;
  return enc.remitente_nombre || sender?.nombre_completo || "Sin nombre";
}

const hrefDe = (enc: EncomiendaReciente) =>
  `/cooperativas/taquilla/encomiendas?encomienda=${encodeURIComponent(enc.id)}`;

export function EncomiendasRecientes({ items }: { items: EncomiendaReciente[] }) {
  return (
    <Card className="gap-0 overflow-hidden p-0 max-md:overflow-visible max-md:bg-transparent max-md:shadow-none">
      <ListaResponsive
        items={items}
        clave={(enc) => enc.id ?? enc.tracking_id}
        etiqueta="Encomiendas recientes"
        vacio={
          <Table>
            <TableBody>
              <FilaVacia colSpan={6} icon={ICONO_SECCION.taquillaEncomiendas} titulo="Todavía no hay encomiendas" />
            </TableBody>
          </Table>
        }
        tabla={(filas) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead className="hidden xl:table-cell">Remitente</TableHead>
                <TableHead>Destinatario</TableHead>
                <TableHead className="hidden lg:table-cell">Ruta</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((enc) => (
                <TableRow key={enc.id ?? enc.tracking_id} className="relative">
                  <CeldaEnlace
                    href={hrefDe(enc)}
                    etiqueta={`Ver encomienda ${enc.tracking_id}`}
                    className="font-mono text-[13px] text-foreground"
                  >
                    {enc.tracking_id}
                  </CeldaEnlace>
                  <TableCell className="hidden max-w-48 truncate xl:table-cell">{nombreRemitente(enc)}</TableCell>
                  <TableCell className="max-w-48 truncate">{enc.receiver_nombre}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {formatCiudad(enc.ciudad_origen)} → {formatCiudad(enc.ciudad_destino)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={enc.estado} dominio="encomienda" />
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{formatFechaHoraCortaVE(enc.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        tarjeta={(enc) => (
          <EntityCard
            href={hrefDe(enc)}
            leading={<IconTile icon={ICONO_SECCION.taquillaEncomiendas} tone="coral" />}
            title={`${formatCiudad(enc.ciudad_origen)} → ${formatCiudad(enc.ciudad_destino)}`}
            subtitle={enc.receiver_nombre || nombreRemitente(enc)}
            badge={<StatusBadge status={enc.estado} dominio="encomienda" />}
            meta={enc.tracking_id}
            etiqueta={`Ver encomienda ${enc.tracking_id}`}
          />
        )}
      />
    </Card>
  );
}
