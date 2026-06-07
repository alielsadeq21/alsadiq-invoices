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

export function generatePaymentNumber(lastNumber: number, year: number): string {
  const nextNum = lastNumber + 1;
  const padded = nextNum.toString().padStart(4, '0');
  return `PAY-${year}-${padded}`;
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

/**
 * Convert a number to Arabic words with "جنيه مصري" currency.
 * Example: 25300.50 → "فقط خمسة وعشرون ألف وثلاثمائة جنيه مصري و50 قرش لا غير"
 */
export function numberToArabicWords(num: number): string {
  if (num === 0) return 'صفر جنيه مصري';

  const ones = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
    'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
    'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
  const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
  const hundreds = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

  function convertBelow1000(n: number): string {
    if (n === 0) return '';
    if (n < 20) return ones[n];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? tens[t] : `${ones[u]} و${tens[t]}`;
    }
    const h = Math.floor(n / 100);
    const remainder = n % 100;
    if (remainder === 0) return hundreds[h];
    return `${hundreds[h]} و${convertBelow1000(remainder)}`;
  }

  function convertWholeNumber(n: number): string {
    if (n === 0) return '';

    if (n < 1000) return convertBelow1000(n);

    if (n < 1000000) {
      const thousands = Math.floor(n / 1000);
      const remainder = n % 1000;
      let thousandWord = '';
      if (thousands === 1) thousandWord = 'ألف';
      else if (thousands === 2) thousandWord = 'ألفان';
      else if (thousands <= 10) thousandWord = `${convertBelow1000(thousands)} آلاف`;
      else thousandWord = `${convertWholeNumber(thousands)} ألف`;

      if (remainder === 0) return thousandWord;
      return `${thousandWord} و${convertBelow1000(remainder)}`;
    }

    if (n < 1000000000) {
      const millions = Math.floor(n / 1000000);
      const remainder = n % 1000000;
      let millionWord = '';
      if (millions === 1) millionWord = 'مليون';
      else if (millions === 2) millionWord = 'مليونان';
      else if (millions <= 10) millionWord = `${convertBelow1000(millions)} ملايين`;
      else millionWord = `${convertWholeNumber(millions)} مليون`;

      if (remainder === 0) return millionWord;
      return `${millionWord} و${convertWholeNumber(remainder)}`;
    }

    const billions = Math.floor(n / 1000000000);
    const remainder = n % 1000000000;
    let billionWord = '';
    if (billions === 1) billionWord = 'مليار';
    else if (billions === 2) billionWord = 'ملياران';
    else billionWord = `${convertWholeNumber(billions)} مليار`;

    if (remainder === 0) return billionWord;
    return `${billionWord} و${convertWholeNumber(remainder)}`;
  }

  const wholePart = Math.floor(num);
  const decimalPart = Math.round((num - wholePart) * 100);

  let result = '';
  if (wholePart > 0) {
    result = convertWholeNumber(wholePart) + ' جنيه مصري';
  }

  if (decimalPart > 0) {
    if (wholePart > 0) result += ' و';
    result += decimalPart.toString() + ' قرش';
  }

  return 'فقط ' + result + ' لا غير';
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
