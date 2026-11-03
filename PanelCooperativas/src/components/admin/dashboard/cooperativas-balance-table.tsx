import { Buildings } from "@phosphor-icons/react/dist/ssr";
import { CeldaEnlace } from "@/components/celda-enlace";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Monto } from "@/components/monto";
import { TonoBadge } from "@/components/status-badge";
import { FilaVacia } from "@/components/fila-vacia";
import { TarjetaTabla } from "@/components/admin/detalle";
import type { TasaRef } from "@/lib/dinero";
import type { CooperativaBalance } from "@/lib/types/admin-dashboard";

interface CooperativasBalanceTableProps {
  data: CooperativaBalance[];
  /** Tasa BCV de hoy para el equivalente en Bs (null: solo USD). */
  tasa?: TasaRef | null;
}

/** 10 → "10 %", 7.5 → "7,5 %". */
function porcentaje(n: number | string): string {
  return `${String(Number(n)).replace(".", ",")} %`;
}

export function CooperativasBalanceTable({ data, tasa = null }: CooperativasBalanceTableProps) {
  return (
    <TarjetaTabla titulo="Comisiones pendientes" descripcion="En USD de referencia; se pagan en Bs a la tasa del día.">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Cooperativa</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Comisión</TableHead>
            <TableHead className="text-right">Pendiente</TableHead>
            <TableHead>Ciclos sin pagar</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <FilaVacia colSpan={4} icon={Buildings} titulo="No hay cooperativas registradas" />
          ) : (
            data.map((item) => (
              <TableRow key={item.cooperativa_id} className="relative">
                <CeldaEnlace
                  href={`/admin/cooperativas/${item.cooperativa_id}?tab=balance`}
                  etiqueta={`Ver el balance de ${item.nombre}`}
                >
                  {item.nombre}
                </CeldaEnlace>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {porcentaje(item.comision_porcentaje)}
                </TableCell>
                <TableCell className="text-right">
                  <Monto usd={item.monto_pendiente} tasa={tasa} moneda="USD" size="sm" align="right" />
                </TableCell>
                <TableCell>
                  {/* El significado no depende solo del color (AD5-29). */}
                  {item.ciclos_impagos >= 2 ? (
                    <TonoBadge tono="peligro">{item.ciclos_impagos} ciclos sin pagar</TonoBadge>
                  ) : (
                    <span className="tabular-nums">{item.ciclos_impagos}</span>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TarjetaTabla>
  );
}
