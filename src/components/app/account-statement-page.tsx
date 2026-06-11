'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Branch, AccountStatementEntry } from '@/lib/types';
import { formatCurrency, formatDate, numberToArabicWords } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  Printer,
  FileDown,
  FileSpreadsheet,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  ScrollText,
  Receipt,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  CalendarRange,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function AccountStatementPage() {
  const { settings, user, isAdmin } = useAppStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [entries, setEntries] = useState<AccountStatementEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  // Summary
  const [totalDebit, setTotalDebit] = useState(0);
  const [totalCredit, setTotalCredit] = useState(0);
  const [netBalance, setNetBalance] = useState(0);

  // Branch name for display
  const [branchName, setBranchName] = useState('');

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    let query = supabase.from('branches').select('*').eq('is_active', true).order('name');
    if (!isAdmin && user?.branch_id) query = query.eq('id', user.branch_id);
    const { data } = await query;
    if (data) {
      setBranches(data as Branch[]);
      // Auto-select branch for non-admin users
      if (!isAdmin && user?.branch_id && data.length > 0) {
        setSelectedBranch(user.branch_id);
      }
    }
  };

  const generateStatement = useCallback(async () => {
    if (!selectedBranch) {
      toast.error('يرجى اختيار الفرع');
      return;
    }
    if (!dateFrom || !dateTo) {
      toast.error('يرجى تحديد فترة الكشف');
      return;
    }

    setLoading(true);
    setGenerated(false);

    try {
      const allEntries: AccountStatementEntry[] = [];

      // 1. Load invoices for this branch in the date range
      let invoiceQuery = supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total, status')
        .eq('branch_id', selectedBranch)
        .gte('invoice_date', dateFrom)
        .lte('invoice_date', dateTo)
        .neq('status', 'cancelled')
        .order('invoice_date', { ascending: true });

      const { data: invoices, error: invError } = await invoiceQuery;
      if (invError) throw invError;

      if (invoices) {
        for (const inv of invoices) {
          allEntries.push({
            date: inv.invoice_date,
            description: inv.status === 'partially_returned'
              ? 'فاتورة مبيعات (مرتجع جزئي)'
              : inv.status === 'fully_returned'
              ? 'فاتورة مبيعات (مرتجع كلي)'
              : 'فاتورة مبيعات',
            reference: inv.invoice_number,
            debit: inv.total,
            credit: 0,
            balance: 0,
            type: 'invoice',
          });
        }
      }

      // 2. Load returns for this branch in the date range
      let returnQuery = supabase
        .from('returns')
        .select('id, return_number, return_date, total')
        .eq('branch_id', selectedBranch)
        .gte('return_date', dateFrom)
        .lte('return_date', dateTo)
        .order('return_date', { ascending: true });

      const { data: returns, error: retError } = await returnQuery;
      if (retError) throw retError;

      if (returns) {
        for (const ret of returns) {
          allEntries.push({
            date: ret.return_date,
            description: 'مرتجع',
            reference: ret.return_number,
            debit: 0,
            credit: ret.total,
            balance: 0,
            type: 'return',
          });
        }
      }

      // 3. Load payments for this branch in the date range
      let paymentQuery = supabase
        .from('payments')
        .select('id, payment_number, payment_date, amount, payment_method')
        .eq('branch_id', selectedBranch)
        .gte('payment_date', dateFrom)
        .lte('payment_date', dateTo)
        .order('payment_date', { ascending: true });

      const { data: payments, error: payError } = await paymentQuery;
      if (payError) throw payError;

      if (payments) {
        for (const pay of payments) {
          allEntries.push({
            date: pay.payment_date,
            description: `إيصال قبض (${pay.payment_method || ''})`,
            reference: pay.payment_number,
            debit: 0,
            credit: pay.amount,
            balance: 0,
            type: 'payment',
          });
        }
      }

      // 4. Sort all entries by date
      allEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // 5. Calculate running balance
      let runningBalance = 0;
      let dTotal = 0;
      let cTotal = 0;

      for (const entry of allEntries) {
        runningBalance += entry.debit - entry.credit;
        entry.balance = runningBalance;
        dTotal += entry.debit;
        cTotal += entry.credit;
      }

      // 6. Apply type filter
      let filtered = allEntries;
      if (typeFilter !== 'all') {
        filtered = allEntries.filter(e => e.type === typeFilter);
      }

      setEntries(filtered);
      setTotalDebit(dTotal);
      setTotalCredit(cTotal);
      setNetBalance(dTotal - cTotal);
      setGenerated(true);

      // Get branch name
      const branch = branches.find(b => b.id === selectedBranch);
      setBranchName(branch?.name || '');

    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء إنشاء كشف الحساب');
    } finally {
      setLoading(false);
    }
  }, [selectedBranch, dateFrom, dateTo, typeFilter, branches]);

  const handlePrint = () => {
    const html = generateStatementHTML();
    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1000);
  };

  const handleDownloadPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      container.style.top = '0';
      container.style.width = '750px';
      container.style.background = '#fff';
      container.style.padding = '20px';
      document.body.appendChild(container);

      container.innerHTML = generateStatementHTML().replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
      });

      document.body.removeChild(container);

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      const imgWidth = pdfWidth - 10;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      // If content is longer than one page, split across pages
      let yOffset = 0;
      let page = 0;
      while (yOffset < imgHeight) {
        if (page > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 5, 5 - yOffset * (imgWidth / canvas.width), imgWidth, imgHeight);
        yOffset += (pdfHeight - 10) / (imgWidth / canvas.width);
        page++;
      }

      pdf.save(`account-statement-${branchName}-${dateFrom}-to-${dateTo}.pdf`);
      toast.success('تم تحميل كشف الحساب كـ PDF');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل PDF');
    }
  };

  const handleDownloadExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wsData = [
        ['كشف حساب الفرع: ' + branchName],
        ['الفترة: ' + formatDate(dateFrom) + ' إلى ' + formatDate(dateTo)],
        [],
        ['التاريخ', 'البيان', 'رقم المرجع', 'مدين (عليه)', 'دائن (له)', 'الرصيد'],
      ];

      for (const entry of entries) {
        wsData.push([
          entry.date,
          entry.description,
          entry.reference,
          entry.debit > 0 ? String(entry.debit) : '',
          entry.credit > 0 ? String(entry.credit) : '',
          String(entry.balance),
        ]);
      }

      wsData.push([]);
      wsData.push(['', '', 'الإجمالي', String(totalDebit), String(totalCredit), String(netBalance)]);

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Set column widths
      ws['!cols'] = [
        { wch: 15 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'كشف الحساب');
      XLSX.writeFile(wb, `account-statement-${branchName}-${dateFrom}-to-${dateTo}.xlsx`);

      toast.success('تم تحميل كشف الحساب كـ Excel');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل Excel');
    }
  };

  const generateStatementHTML = (): string => {
    const factoryName = settings?.factory_name || 'مصنع الصادق';
    const factoryAddress = settings?.address || '';
    const factoryPhone = settings?.phone || '';

    let rowsHTML = '';
    for (const entry of entries) {
      const debitCell = entry.debit > 0 ? formatCurrency(entry.debit) : '—';
      const creditCell = entry.credit > 0 ? formatCurrency(entry.credit) : '—';
      const balanceColor = entry.balance > 0 ? '#dc2626' : entry.balance < 0 ? '#16a34a' : '#666';
      const typeIcon = entry.type === 'invoice' ? '📄' : entry.type === 'payment' ? '💰' : '↩️';

      rowsHTML += `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${formatDate(entry.date)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px;">${typeIcon} ${entry.description}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; font-weight: 600;">${entry.reference}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; text-align: left; color: #dc2626;">${entry.debit > 0 ? formatCurrency(entry.debit) : '—'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; text-align: left; color: #16a34a;">${entry.credit > 0 ? formatCurrency(entry.credit) : '—'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 13px; text-align: left; font-weight: 700; color: ${balanceColor};">${formatCurrency(Math.abs(entry.balance))}${entry.balance > 0 ? ' ع' : entry.balance < 0 ? ' ل' : ''}</td>
        </tr>
      `;
    }

    return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>كشف حساب - ${branchName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Cairo', sans-serif; direction: rtl; color: #1a1a1a; background: #fff; padding: 15mm; }
    .statement { max-width: 750px; margin: 0 auto; }
    .header { background: #0D7C66; color: white; padding: 20px 24px; border-radius: 12px 12px 0 0; text-align: center; }
    .header h1 { font-size: 24px; font-weight: 800; margin-bottom: 4px; }
    .header .factory-info { font-size: 13px; opacity: 0.85; }
    .divider { height: 3px; background: #D4A843; }
    .sub-header { padding: 16px 24px; background: #f8faf9; border-bottom: 1px solid #e5e7eb; }
    .sub-header h2 { font-size: 18px; font-weight: 700; color: #0D7C66; }
    .sub-header .period { font-size: 13px; color: #666; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #0D7C66; color: white; padding: 10px 12px; font-size: 13px; font-weight: 700; text-align: right; }
    thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(6) { text-align: left; }
    .summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; margin-top: 16px; padding: 16px; background: #f0faf7; border: 2px solid #0D7C66; border-radius: 10px; }
    .summary-item { text-align: center; }
    .summary-label { font-size: 12px; color: #666; }
    .summary-value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .summary-debit .summary-value { color: #dc2626; }
    .summary-credit .summary-value { color: #16a34a; }
    .summary-net .summary-value { color: #0D7C66; }
    .amount-words { margin-top: 12px; padding: 10px; background: #fff; border: 1px dashed #0D7C66; border-radius: 6px; font-size: 13px; color: #555; text-align: center; font-weight: 600; }
    .footer { margin-top: 20px; padding: 12px 0; border-top: 1px solid #eee; display: flex; justify-content: space-between; }
    .signature-box { text-align: center; }
    .signature-label { font-size: 12px; color: #666; }
    .signature-line { width: 140px; border-bottom: 1px solid #999; margin-top: 30px; }
    @media print { body { padding: 5mm; } }
  </style>
</head>
<body>
  <div class="statement">
    <div class="header">
      <h1>كشف حساب فرع</h1>
      <div class="factory-info">${factoryName}${factoryAddress ? ' - ' + factoryAddress : ''}${factoryPhone ? ' | ' + factoryPhone : ''}</div>
    </div>
    <div class="divider"></div>
    <div class="sub-header">
      <h2>${branchName}</h2>
      <div class="period">الفترة من ${formatDate(dateFrom)} إلى ${formatDate(dateTo)}</div>
    </div>
    <table>
      <thead>
        <tr>
          <th>التاريخ</th>
          <th>البيان</th>
          <th>رقم المرجع</th>
          <th>مدين (عليه)</th>
          <th>دائن (له)</th>
          <th>الرصيد</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHTML || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#999;">لا توجد حركات في هذه الفترة</td></tr>'}
      </tbody>
    </table>
    <div class="summary">
      <div class="summary-item summary-debit">
        <div class="summary-label">إجمالي المدين (عليه)</div>
        <div class="summary-value">${formatCurrency(totalDebit)}</div>
      </div>
      <div class="summary-item summary-credit">
        <div class="summary-label">إجمالي الدائن (له)</div>
        <div class="summary-value">${formatCurrency(totalCredit)}</div>
      </div>
      <div class="summary-item summary-net">
        <div class="summary-label">الرصيد الصافي</div>
        <div class="summary-value">${formatCurrency(Math.abs(netBalance))} ${netBalance > 0 ? '(عليه)' : netBalance < 0 ? '(له)' : ''}</div>
      </div>
    </div>
    <div class="amount-words">
      الرصيد: ${numberToArabicWords(Math.abs(netBalance))} ${netBalance > 0 ? '(مدين/عليه)' : netBalance < 0 ? '(دائن/له)' : ''}
    </div>
    <div class="footer">
      <div class="signature-box">
        <div class="signature-label">المحاسب</div>
        <div class="signature-line"></div>
      </div>
      <div class="signature-box">
        <div class="signature-label">مسؤول الفرع</div>
        <div class="signature-line"></div>
      </div>
    </div>
  </div>
</body>
</html>`;
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      invoice: 'فاتورة',
      payment: 'إيصال قبض',
      return: 'مرتجع',
    };
    return labels[type] || type;
  };

  const getTypeBadgeColor = (type: string) => {
    const colors: Record<string, string> = {
      invoice: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      payment: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      return: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    };
    return colors[type] || '';
  };

  const getTypeGradient = (type: string) => {
    const gradients: Record<string, string> = {
      invoice: 'from-red-500 to-rose-600',
      payment: 'from-emerald-500 to-teal-600',
      return: 'from-amber-500 to-orange-600',
    };
    return gradients[type] || 'from-gray-500 to-gray-600';
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'invoice': return Receipt;
      case 'payment': return ArrowDownToLine;
      case 'return': return RotateCcw;
      default: return FileText;
    }
  };

  const getTypeBorderColor = (type: string) => {
    const colors: Record<string, string> = {
      invoice: 'border-r-red-500',
      payment: 'border-r-emerald-500',
      return: 'border-r-amber-500',
    };
    return colors[type] || 'border-r-gray-500';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }} className="sm:flex-row sm:items-center sm:justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-teal-500/25">
            <ScrollText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">كشف حساب الفرع</h1>
            <p className="text-muted-foreground text-[11px] sm:text-sm mt-0.5">
              عرض تفصيلي لكل حركات الفرع من فواتير ومرتجعات ومدفوعات
            </p>
          </div>
        </div>
        {generated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} className="text-xs text-muted-foreground">
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="bg-muted/60 rounded-full px-3 py-1.5">
              <Building2 className="w-3.5 h-3.5" />
              <span className="font-medium text-foreground">{branchName}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} className="bg-muted/60 rounded-full px-3 py-1.5">
              <CalendarRange className="w-3.5 h-3.5" />
              <span className="font-medium text-foreground">{formatDate(dateFrom)} — {formatDate(dateTo)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-lg overflow-hidden relative">
        <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-teal-500 via-emerald-500 to-teal-600" />
        <CardContent className="p-3 sm:p-5 pt-4 sm:pt-6">
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                الفرع *
              </Label>
              <Select value={selectedBranch} onValueChange={setSelectedBranch} disabled={!isAdmin && !!user?.branch_id}>
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <CalendarRange className="w-3 h-3" />
                من تاريخ *
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-xs sm:text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <CalendarRange className="w-3 h-3" />
                إلى تاريخ *
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-xs sm:text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                <FileText className="w-3 h-3" />
                نوع الحركة
              </Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="invoice">فواتير فقط</SelectItem>
                  <SelectItem value="payment">إيصالات قبض فقط</SelectItem>
                  <SelectItem value="return">مرتجعات فقط</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end col-span-2 lg:col-span-1">
              <Button
                onClick={generateStatement}
                disabled={loading}
                className="w-full gap-2 h-9 text-xs sm:text-sm bg-gradient-to-l from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-md shadow-teal-500/20 transition-all duration-200"
              >
                <Search className="w-4 h-4" />
                {loading ? 'جاري التحليل...' : 'عرض الكشف'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statement Results */}
      {generated && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Action Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }} className="mb-4">
            <Button
              onClick={handlePrint}
              variant="outline"
              className="gap-2 text-xs sm:text-sm h-8 sm:h-9 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 dark:hover:bg-teal-950/30 dark:hover:border-teal-700 dark:hover:text-teal-400 transition-all duration-200"
            >
              <Printer className="w-3.5 h-3.5" />
              طباعة
            </Button>
            <Button
              onClick={handleDownloadPDF}
              variant="outline"
              className="gap-2 text-xs sm:text-sm h-8 sm:h-9 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-700 dark:hover:bg-rose-950/30 dark:hover:border-rose-700 dark:hover:text-rose-400 transition-all duration-200"
            >
              <FileDown className="w-3.5 h-3.5" />
              تحميل PDF
            </Button>
            <Button
              onClick={handleDownloadExcel}
              variant="outline"
              className="gap-2 text-xs sm:text-sm h-8 sm:h-9 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 dark:hover:bg-emerald-950/30 dark:hover:border-emerald-700 dark:hover:text-emerald-400 transition-all duration-200"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              تحميل Excel
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5 mb-4">
            <Card className="border-0 shadow-lg overflow-hidden group transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-red-500 to-rose-500" />
              <CardContent className="p-4 sm:p-5 bg-gradient-to-bl from-red-50/80 via-white to-white dark:from-red-950/30 dark:via-card dark:to-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-md shadow-red-500/25 group-hover:shadow-lg group-hover:shadow-red-500/30 transition-all duration-300">
                    <TrendingUp className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium text-red-600/70 dark:text-red-400/70 uppercase tracking-wide">إجمالي المدين (عليه)</p>
                    <p className="text-lg sm:text-2xl font-extrabold text-red-600 dark:text-red-400 mt-0.5">{formatCurrency(totalDebit)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden group transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-emerald-500 to-teal-500" />
              <CardContent className="p-4 sm:p-5 bg-gradient-to-bl from-emerald-50/80 via-white to-white dark:from-emerald-950/30 dark:via-card dark:to-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/25 group-hover:shadow-lg group-hover:shadow-emerald-500/30 transition-all duration-300">
                    <TrendingDown className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-wide">إجمالي الدائن (له)</p>
                    <p className="text-lg sm:text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">{formatCurrency(totalCredit)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-lg overflow-hidden group transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5">
              <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-teal-500 to-emerald-600" />
              <CardContent className="p-4 sm:p-5 bg-gradient-to-bl from-teal-50/80 via-white to-white dark:from-teal-950/30 dark:via-card dark:to-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br ${netBalance > 0 ? 'from-red-500 to-rose-600' : netBalance < 0 ? 'from-emerald-500 to-teal-600' : 'from-teal-500 to-emerald-700'} flex items-center justify-center shadow-md ${netBalance > 0 ? 'shadow-red-500/25' : netBalance < 0 ? 'shadow-emerald-500/25' : 'shadow-teal-500/25'} group-hover:shadow-lg transition-all duration-300`}>
                    <Scale className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
                  </div>
                  <div>
                    <p className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wide">الرصيد الصافي</p>
                    <p className={`text-lg sm:text-2xl font-extrabold mt-0.5 ${netBalance > 0 ? 'text-red-600 dark:text-red-400' : netBalance < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-teal-700 dark:text-teal-400'}`}>
                      {formatCurrency(Math.abs(netBalance))}
                      <span className="text-[10px] sm:text-sm font-semibold mr-1 opacity-75">
                        {netBalance > 0 ? '(عليه)' : netBalance < 0 ? '(له)' : ''}
                      </span>
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Amount in words */}
          {netBalance !== 0 && (
            <Card className="border-0 shadow-md mb-4 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-l from-teal-400 via-emerald-400 to-teal-500" />
              <CardContent className="p-3 bg-gradient-to-l from-teal-50/50 via-transparent to-emerald-50/50 dark:from-teal-950/20 dark:via-transparent dark:to-emerald-950/20">
                <p className="text-xs sm:text-sm text-center text-muted-foreground">
                  الرصيد: <span className="font-bold text-foreground">{numberToArabicWords(Math.abs(netBalance))}</span>
                  <span className="mr-1 font-medium">{netBalance > 0 ? '(مدين/عليه)' : netBalance < 0 ? '(دائن/له)' : ''}</span>
                </p>
              </CardContent>
            </Card>
          )}

          {/* Transactions - Mobile Card Layout */}
          <Card className="border-0 shadow-lg sm:hidden overflow-hidden">
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="py-16 px-4">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center mb-4 shadow-inner">
                    <FileText className="w-10 h-10 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-lg font-bold mb-1.5">لا توجد حركات</h3>
                  <p className="text-muted-foreground text-sm text-center max-w-[240px]">
                    لا توجد حركات مسجلة لهذا الفرع في الفترة المحددة
                  </p>
                </div>
              ) : (
                <div>
                  {entries.map((entry, idx) => {
                    const TypeIcon = getTypeIcon(entry.type);
                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.2 }}
                        className={`border-r-4 ${getTypeBorderColor(entry.type)} border-b last:border-b-0 transition-colors duration-200 hover:bg-muted/30`}
                      >
                        <div className="p-3.5">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="mb-2">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getTypeGradient(entry.type)} flex items-center justify-center shadow-sm`}>
                                <TypeIcon className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-semibold ${getTypeBadgeColor(entry.type)}`}>
                                  {getTypeLabel(entry.type)}
                                </span>
                                <span className="text-xs font-bold mr-1.5">{entry.reference}</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-muted-foreground font-medium bg-muted/50 px-2 py-0.5 rounded-full">{formatDate(entry.date)}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mb-2.5 mr-10">{entry.description}</p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="mr-10">
                            <div style={{ display: 'flex', gap: '12px' }} className="text-[11px]">
                              {entry.debit > 0 && (
                                <span className="text-red-600 dark:text-red-400 font-bold">عليه: {formatCurrency(entry.debit)}</span>
                              )}
                              {entry.credit > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">له: {formatCurrency(entry.credit)}</span>
                              )}
                            </div>
                            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${entry.balance > 0 ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30' : entry.balance < 0 ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'bg-muted/50'}`}>
                              {formatCurrency(Math.abs(entry.balance))}
                              <span className="text-[9px] font-semibold mr-0.5 opacity-80">
                                {entry.balance > 0 ? 'ع' : entry.balance < 0 ? 'ل' : ''}
                              </span>
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Transactions - Desktop Table Layout */}
          <Card className="border-0 shadow-lg hidden sm:block overflow-hidden">
            <CardContent className="p-0">
              {entries.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="py-20 px-4">
                  <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center mb-5 shadow-inner">
                    <FileText className="w-12 h-12 text-muted-foreground/40" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">لا توجد حركات</h3>
                  <p className="text-muted-foreground text-sm text-center max-w-[300px]">
                    لا توجد حركات مسجلة لهذا الفرع في الفترة المحددة
                  </p>
                </div>
              ) : (
                <div>
                  {/* Gradient accent bar */}
                  <div className="h-1.5 bg-gradient-to-l from-teal-500 via-emerald-500 to-teal-600" />
                  <div style={{ overflowX: 'auto' }}>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gradient-to-l from-muted/80 to-muted/40 hover:from-muted/80 hover:to-muted/40">
                          <TableHead className="text-right font-bold text-foreground/80">التاريخ</TableHead>
                          <TableHead className="text-right font-bold text-foreground/80">البيان</TableHead>
                          <TableHead className="text-right font-bold text-foreground/80">رقم المرجع</TableHead>
                          <TableHead className="text-left font-bold text-foreground/80">مدين (عليه)</TableHead>
                          <TableHead className="text-left font-bold text-foreground/80">دائن (له)</TableHead>
                          <TableHead className="text-left font-bold text-foreground/80">الرصيد</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {entries.map((entry, idx) => (
                          <TableRow key={idx} className="transition-colors duration-150 hover:bg-muted/40">
                            <TableCell className="text-sm font-medium">{formatDate(entry.date)}</TableCell>
                            <TableCell>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${getTypeGradient(entry.type)} flex items-center justify-center shadow-sm`}>
                                  {(() => {
                                    const Icon = getTypeIcon(entry.type);
                                    return <Icon className="w-3.5 h-3.5 text-white" />;
                                  })()}
                                </div>
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold ${getTypeBadgeColor(entry.type)}`}>
                                  {getTypeLabel(entry.type)}
                                </span>
                                <span className="text-sm text-muted-foreground">{entry.description}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-bold text-sm">{entry.reference}</TableCell>
                            <TableCell className="text-left font-bold text-red-600 dark:text-red-400">
                              {entry.debit > 0 ? formatCurrency(entry.debit) : <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="text-left font-bold text-emerald-600 dark:text-emerald-400">
                              {entry.credit > 0 ? formatCurrency(entry.credit) : <span className="text-muted-foreground/40">—</span>}
                            </TableCell>
                            <TableCell className="text-left">
                              <span className={`font-extrabold px-2 py-1 rounded-md text-sm ${entry.balance > 0 ? 'text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30' : entry.balance < 0 ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : ''}`}>
                                {formatCurrency(Math.abs(entry.balance))}
                                <span className="text-[10px] font-semibold mr-1 opacity-75">
                                  {entry.balance > 0 ? 'ع' : entry.balance < 0 ? 'ل' : ''}
                                </span>
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
