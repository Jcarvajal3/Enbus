"use client";

import { Button } from "@/components/ui/button";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-between px-2 py-4 ${className}`}>
      <div className="text-sm text-muted-foreground">
        Página <span className="font-medium">{currentPage}</span> de{" "}
        <span className="font-medium">{totalPages}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
        >
          <CaretLeft className="h-4 w-4 mr-1" />
          Anterior
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
        >
          Siguiente
          <CaretRight className="h-4 w-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
