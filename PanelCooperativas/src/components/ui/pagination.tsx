"use client";

import { PaginacionTabla } from "@/components/paginacion-tabla";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

/** @deprecated Usa `PaginacionTabla` (y `usePaginacion`, con `?pagina=`) de components/paginacion-tabla. */
export function Pagination({ currentPage, totalPages, onPageChange, className }: PaginationProps) {
  return (
    <div className={cn(className)}>
      <PaginacionTabla pagina={currentPage} paginas={totalPages} onCambio={onPageChange} />
    </div>
  );
}
