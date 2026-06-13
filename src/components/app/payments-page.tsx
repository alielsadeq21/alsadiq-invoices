'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Payment, Branch, PaymentMethod } from '@/lib/types';
import { formatCurrency, formatDate, generatePaymentNumber, getCurrentYear } from '@/lib/utils';
import { generatePaymentReceiptDocument, generateThermalPaymentReceiptDocument } from '@/lib/payment-receipt-template';
import { createPaymentJournalEntry } from '@/lib/accounting';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Banknote,
  Plus,
  Search,
  ChevronRight,
  ChevronLeft,
  Printer,
  Download,
  Receipt,
  Eye,
  Building2,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

const defaultMethodLabels: Record<string, string> = {
  cash: 'كاش',
  bank_transfer: 'تحويل بنكي',
  cheque: 'شيك',
};

const defaultMethodColors: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  bank_transfer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cheque: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function PaymentsPage() {
  const { navigateTo, settings, user, isAdmin, hasPermission } = useAppStore();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentNumber, setPaymentNumber] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  useEffect(() => {
    loadBranches();
    loadPaymentMethods();
  }, []);

  useEffect(() => {
    loadPayments();
  }, [page, search, branchFilter]);

  const loadBranches = async () => {
    let query = supabase.from('branches').select('*').eq('is_active', true).order('name');
    if (!isAdmin && user?.branch_id) query = query.eq('id', user.branch_id);
    const { data } = await query;
    if (data) setBranches(data as Branch[]);
  };

  const loadPaymentMethods = async () => {
    try {
      const { data, error } = await supabase.from('payment_methods').select('*').order('sort_order');
      if (!error && data && data.length > 0) {
        setPaymentMethods(data as PaymentMethod[]);
      } else {
        setPaymentMethods([
          { id: 'cash', name: 'كاش', is_default: true, sort_order: 1, created_at: '' },
          { id: 'bank_transfer', name: 'تحويل بنكي', is_default: false, sort_order: 2, created_at: '' },
          { id: 'cheque', name: 'شيك', is_default: false, sort_order: 3, created_at: '' },
        ]);
      }
    } catch {
      setPaymentMethods([
        { id: 'cash', name: 'كاش', is_default: true, sort_order: 1, created_at: '' },
        { id: 'bank_transfer', name: 'تحويل بنكي', is_default: false, sort_order: 2, created_at: '' },
        { id: 'cheque', name: 'شيك', is_default: false, sort_order: 3, created_at: '' },
      ]);
    }
  };

  const getMethodLabel = (method: string): string => {
    const found = paymentMethods.find(m => m.id === method || m.name === method);
    if (found) return found.name;
    return defaultMethodLabels[method] || method;
  };

  const getMethodColor = (method: string): string => {
    if (defaultMethodColors[method]) return defaultMethodColors[method];
    return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
  };

  const loadPayments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('payments')
        .select('*, branches(name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`payment_number.ilike.%${search}%`);
      }
      if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter);
      }
      // Branch user: always filter by their branch
      if (!isAdmin && user?.branch_id) {
        query = query.eq('branch_id', user.branch_id);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        setPayments(data as unknown as Payment[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = async () => {
    const year = getCurrentYear();
    const { data: lastPay } = await supabase
      .from('payments')
      .select('payment_number')
      .like('payment_number', `PAY-${year}-%`)
      .order('payment_number', { ascending: false })
      .limit(1);

    let lastNum = 0;
    if (lastPay && lastPay.length > 0) {
      const parts = lastPay[0].payment_number.split('-');
      lastNum = parseInt(parts[parts.length - 1]) || 0;
    }
    setPaymentNumber(generatePaymentNumber(lastNum, year));
    // Auto-select branch for non-admin users
    if (!isAdmin && user?.branch_id) {
      setSelectedBranchId(user.branch_id);
    } else {
      setSelectedBranchId('');
    }
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    const defaultMethod = paymentMethods.find(m => m.is_default);
    setPaymentMethod(defaultMethod?.id || 'cash');
    setNotes('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!selectedBranchId) {
      toast.error('يرجى اختيار الفرع');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error('يرجى إدخال مبلغ صحيح');
      return;
    }
    if (!paymentDate) {
      toast.error('يرجى تحديد التاريخ');
      return;
    }

    setSaving(true);
    try {
      const { data: newPayment, error } = await supabase.from('payments').insert({
        payment_number: paymentNumber,
        branch_id: selectedBranchId,
        amount: Number(amount),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: notes || null,
      }).select('id').single();

      if (error) throw error;

      // Log activity
      await supabase.from('audit_log').insert({
        action: 'create_payment',
        details: { payment_number: paymentNumber, amount: Number(amount), branch_id: selectedBranchId },
      });

      // ===== قيد تلقائي: قبض من فرع =====
      try {
        const jeResult = await createPaymentJournalEntry({
          paymentId: newPayment.id,
          paymentNumber: paymentNumber,
          date: paymentDate,
          amount: Number(amount),
          paymentMethod: paymentMethod,
          branchId: selectedBranchId,
          createdBy: user?.id || null,
        });

        if (jeResult.success) {
          // ربط القيد بالإيصال
          await supabase
            .from('payments')
            .update({ journal_entry_id: jeResult.entryId } as any)
            .eq('id', newPayment.id);

          toast.success('تم تسجيل إيصال القبض وإنشاء القيد المحاسبي بنجاح');
        } else {
          toast.success('تم تسجيل إيصال القبض (لم يتم إنشاء القيد المحاسبي)');
        }
      } catch (jeErr) {
        console.error('Journal entry error:', jeErr);
        toast.success('تم تسجيل إيصال القبض (خطأ في إنشاء القيد المحاسبي)');
      }

      setDialogOpen(false);
      loadPayments();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ الإيصال');
    } finally {
      setSaving(false);
    }
  };

  // Print payment receipt A4
  const handlePrintReceipt = (payment: Payment) => {
    const branchName = (payment as any).branches?.name || '—';

    const htmlDoc = generatePaymentReceiptDocument({
      paymentNumber: payment.payment_number,
      branchName,
      branchAddress: null,
      branchPhone: null,
      amount: Number(payment.amount),
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      notes: payment.notes,
      settings,
      generatedAt: new Date().toISOString(),
    });

    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    printWindow.document.write(htmlDoc);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1200);
  };

  // Print thermal payment receipt
  const handlePrintThermal = (payment: Payment) => {
    const branchName = (payment as any).branches?.name || '—';

    const htmlDoc = generateThermalPaymentReceiptDocument({
      paymentNumber: payment.payment_number,
      branchName,
      branchAddress: null,
      branchPhone: null,
      amount: Number(payment.amount),
      paymentDate: payment.payment_date,
      paymentMethod: payment.payment_method,
      notes: payment.notes,
      settings,
      generatedAt: new Date().toISOString(),
    });

    const printWindow = window.open('', '_blank', 'width=340,height=800');
    if (!printWindow) {
      toast.error('يرجى السماح بالنوافذ المنبثقة للطباعة');
      return;
    }

    printWindow.document.write(htmlDoc);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 1500);
  };

  // Export payment receipt as PDF
  const handleExportPDF = async (payment: Payment) => {
    const branchName = (payment as any).branches?.name || '—';
    toast.info('جاري إنشاء ملف PDF...');

    let iframe: HTMLIFrameElement | null = null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const htmlDoc = generatePaymentReceiptDocument({
        paymentNumber: payment.payment_number,
        branchName,
        branchAddress: null,
        branchPhone: null,
        amount: Number(payment.amount),
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        notes: payment.notes,
        settings,
        generatedAt: new Date().toISOString(),
      });

      iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1200px;border:none;z-index:-1;';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iframeDoc) {
        document.body.removeChild(iframe);
        toast.error('حدث خطأ أثناء إنشاء ملف PDF');
        return;
      }

      iframeDoc.open();
      iframeDoc.write(htmlDoc);
      iframeDoc.close();

      await new Promise<void>((resolve) => {
        const checkReady = () => {
          const container = iframeDoc.querySelector('.rcpt-container');
          if (container) {
            setTimeout(resolve, 2500);
          } else {
            setTimeout(checkReady, 500);
          }
        };
        checkReady();
      });

      const rcptEl = iframeDoc.querySelector('.rcpt-container') as HTMLElement;
      if (!rcptEl) {
        if (iframe.parentNode) document.body.removeChild(iframe);
        toast.error('حدث خطأ أثناء إنشاء ملف PDF');
        return;
      }

      const canvas = await html2canvas(rcptEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: rcptEl.scrollWidth,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
      pdf.save(`إيصال_${payment.payment_number}.pdf`);

      if (iframe.parentNode) document.body.removeChild(iframe);
      toast.success('تم تحميل ملف PDF');
    } catch (err) {
      console.error(err);
      if (iframe?.parentNode) document.body.removeChild(iframe);
      toast.error('حدث خطأ أثناء إنشاء ملف PDF');
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Banknote className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">إيصالات القبض</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              تسجيل دفعات الفروع
              <span className="inline-flex items-center gap-1 mr-2 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <Banknote className="w-3 h-3" />
                {totalCount} إيصال
              </span>
            </p>
          </div>
        </div>
        {hasPermission('payments', 'create') && (
          <Button
            onClick={openCreateDialog}
            className="gap-2 shadow-lg text-white transition-all duration-200 hover:shadow-xl hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
          >
            <Plus className="w-4 h-4" />
            إيصال قبض جديد
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="h-1" style={{ background: 'linear-gradient(90deg, #10b981, #059669, #047857)' }} />
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الإيصال..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pr-10"
              />
            </div>
            {isAdmin && (
              <div>
                <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setPage(1); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="كل الفروع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payments Content */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin" />
                <span className="text-muted-foreground text-sm">جاري التحميل...</span>
              </div>
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #d1fae5, #a7f3d0)' }}>
                <Banknote className="w-12 h-12 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold mb-2 text-foreground">لا توجد إيصالات</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                لم يتم تسجيل أي إيصالات قبض بعد. ابدأ بتسجيل أول دفعة من فرع.
              </p>
              {hasPermission('payments', 'create') && (
                <Button
                  onClick={openCreateDialog}
                  className="gap-2 shadow-lg text-white transition-all duration-200 hover:shadow-xl hover:scale-[1.02]"
                  size="lg"
                  style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                >
                  <Plus className="w-5 h-5" />
                  تسجيل إيصال قبض
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Gradient accent bar at top */}
              <div className="h-1" style={{ background: 'linear-gradient(90deg, #10b981, #059669, #047857)' }} />

              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-right font-semibold">رقم الإيصال</TableHead>
                      <TableHead className="text-right font-semibold">الفرع</TableHead>
                      <TableHead className="text-right font-semibold">التاريخ</TableHead>
                      <TableHead className="text-right font-semibold">المبلغ</TableHead>
                      <TableHead className="text-center font-semibold">طريقة الدفع</TableHead>
                      <TableHead className="text-center font-semibold">طباعة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id} className="transition-colors duration-150 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              <Banknote className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-medium">{payment.payment_number}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{(payment as any).branches?.name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span>{formatDate(payment.payment_date)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(payment.amount)}</span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className={`text-[10px] px-2.5 py-0.5 ${getMethodColor(payment.payment_method)}`}>
                            {getMethodLabel(payment.payment_method)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {hasPermission('payments', 'print') ? (
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
                                onClick={() => handlePrintReceipt(payment)}
                                title="طباعة A4"
                              >
                                <Printer className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-orange-50 hover:text-orange-600 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 transition-colors"
                                onClick={() => handlePrintThermal(payment)}
                                title="طباعة حرارية"
                              >
                                <Receipt className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-colors"
                                onClick={() => handleExportPDF(payment)}
                                title="تحميل PDF"
                              >
                                <Download className="w-4 h-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile Card Layout */}
              <div className="sm:hidden p-3 space-y-3">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="relative rounded-xl bg-card border border-border shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                    style={{ borderRightWidth: '4px', borderRightColor: '#10b981' }}
                  >
                    <div className="p-3 sm:p-4">
                      {/* Top: Payment number + Amount */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            <Banknote className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm leading-tight">{payment.payment_number}</p>
                            <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 mt-1 ${getMethodColor(payment.payment_method)}`}>
                              {getMethodLabel(payment.payment_method)}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="font-bold text-emerald-600 dark:text-emerald-400 text-lg leading-tight">{formatCurrency(payment.amount)}</p>
                          <p className="text-[10px] text-muted-foreground">ج.م</p>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="mt-3 space-y-1.5">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Building2 className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">{(payment as any).branches?.name || '—'}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm text-muted-foreground">{formatDate(payment.payment_date)}</span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      {hasPermission('payments', 'print') && (
                        <div className="mt-3 pt-3 border-t border-border/50" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5 flex-1 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 dark:hover:border-blue-800 transition-colors"
                            onClick={() => handlePrintReceipt(payment)}
                          >
                            <Printer className="w-3.5 h-3.5" />
                            A4
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5 flex-1 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200 dark:hover:bg-orange-900/20 dark:hover:text-orange-400 dark:hover:border-orange-800 transition-colors"
                            onClick={() => handlePrintThermal(payment)}
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            حراري
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5 flex-1 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-colors"
                            onClick={() => handleExportPDF(payment)}
                          >
                            <Download className="w-3.5 h-3.5" />
                            PDF
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
                  <p className="text-sm text-muted-foreground font-medium">
                    صفحة <span className="text-foreground font-bold">{page}</span> من <span className="text-foreground font-bold">{totalPages}</span>
                    <span className="hidden sm:inline mr-2 text-muted-foreground">({totalCount} إيصال)</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs font-medium hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-colors"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                      السابق
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1 text-xs font-medium hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-colors"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                    >
                      التالي
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Create Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  <Banknote className="w-4 h-4" />
                </div>
                تسجيل إيصال قبض
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" style={{ minHeight: 0 }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الإيصال</Label>
                <Input value={paymentNumber} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>الفرع *</Label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId} disabled={!isAdmin && !!user?.branch_id}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>المبلغ (ج.م) *</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="text-left"
                  min="0"
                  step="0.01"
                />
              </div>
              <div className="space-y-2">
                <Label>التاريخ *</Label>
                <Input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 shrink-0 border-t bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button
                onClick={handleSave}
                disabled={saving}
                className="text-white shadow-md transition-all duration-200 hover:shadow-lg hover:scale-[1.02]"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ الإيصال'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
