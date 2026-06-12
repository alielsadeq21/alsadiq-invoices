'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ChevronRight, ChevronLeft, ChevronsRight, ChevronsLeft } from 'lucide-react';

interface DataTablePaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  label?: string; // e.g. "فاتورة" / "منتج"
}

export default function DataTablePagination({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [25, 50, 100],
  label = 'سجل',
}: DataTablePaginationProps) {
  if (totalCount === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20">
      {/* Showing info */}
      <div className="text-sm text-muted-foreground">
        عرض <span className="font-semibold text-foreground">{from}</span> - <span className="font-semibold text-foreground">{to}</span> من <span className="font-semibold text-foreground">{totalCount}</span> {label}
      </div>

      <div className="flex items-center gap-3">
        {/* Page size selector */}
        {onPageSizeChange && pageSizeOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">عدد في الصفحة:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[70px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((size) => (
                  <SelectItem key={size} value={String(size)} className="text-xs">
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page navigation */}
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(1)}
            disabled={page <= 1}
            title="أول صفحة"
          >
            <ChevronsRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            title="الصفحة السابقة"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>

          <span className="text-sm font-medium px-2 min-w-[80px] text-center">
            {page} / {totalPages || 1}
          </span>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            title="الصفحة التالية"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(totalPages)}
            disabled={page >= totalPages}
            title="آخر صفحة"
          >
            <ChevronsLeft className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
