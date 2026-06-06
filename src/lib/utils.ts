import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { clsx } from 'clsx';

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('ar-EG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' ج.م';
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy', { locale: ar });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(d, 'dd/MM/yyyy hh:mm a', { locale: ar });
}

export function generateInvoiceNumber(lastNumber: number, year: number): string {
  const nextNum = lastNumber + 1;
  const padded = nextNum.toString().padStart(4, '0');
  return `INV-${year}-${padded}`;
}

export function generateReturnNumber(lastNumber: number, year: number): string {
  const nextNum = lastNumber + 1;
  const padded = nextNum.toString().padStart(4, '0');
  return `RET-${year}-${padded}`;
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'نشطة',
    cancelled: 'ملغاة',
    partially_returned: 'مرتجع جزئياً',
    fully_returned: 'مرتجع كلياً',
  };
  return labels[status] || status;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    partially_returned: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    fully_returned: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  };
  return colors[status] || '';
}

export function cn(...inputs: (string | boolean | undefined | null | Record<string, boolean>)[]): string {
  return clsx(inputs);
}

export function getCurrentYear(): number {
  return new Date().getFullYear();
}

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}
