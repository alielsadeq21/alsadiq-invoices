'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Payment, Branch } from '@/lib/types';
import { formatCurrency, formatDate, generatePaymentNumber, getCurrentYear } from '@/lib/utils';
import { generatePaymentReceiptDocument, generateThermalPaymentReceiptDocument } from '@/lib/payment-receipt-template';
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
} from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 10;

const paymentMethodLabels: Record<string, string> = {
  cash: 'كاش',
  bank_transfer: 'تحويل بنكي',
  cheque: 'شيك',
};

const paymentMethodColors: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  bank_transfer: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  cheque: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function PaymentsPage() {
  const { navigateTo, settings } = useAppStore();
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
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank_transfer' | 'cheque'>('cash');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadPayments();
  }, [page, search, branchFilter]);

  const loadBranches = async () => {
    const { data } = await supabase.from('branches').select('*').eq('is_active', true).order('name');
    if (data) setBranches(data as Branch[]);
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
    setSelectedBranchId('');
    setAmount('');
    setPaymentDate(new Date().toISOString().split('T')[0]);
    setPaymentMethod('cash');
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
      const { error } = await supabase.from('payments').insert({
        payment_number: paymentNumber,
        branch_id: selectedBranchId,
        amount: Number(amount),
        payment_date: paymentDate,
        payment_method: paymentMethod,
        notes: notes || null,
      });

      if (error) throw error;

      // Log activity
      await supabase.from('audit_log').insert({
        action: 'create_payment',
        details: { payment_number: paymentNumber, amount: Number(amount), branch_id: selectedBranchId },
      });

      toast.success('تم تسجيل إيصال القبض بنجاح');
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إيصالات القبض</h1>
          <p className="text-muted-foreground text-sm mt-1">
            تسجيل دفعات الفروع ({totalCount} إيصال)
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2 shadow-md">
          <Plus className="w-4 h-4" />
          إيصال قبض جديد
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
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
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <Banknote className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد إيصالات</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                لم يتم تسجيل أي إيصالات قبض بعد. ابدأ بتسجيل أول دفعة من فرع.
              </p>
              <Button onClick={openCreateDialog} className="gap-2 shadow-md" size="lg">
                <Plus className="w-5 h-5" />
                تسجيل إيصال قبض
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الإيصال</TableHead>
                      <TableHead className="text-right">الفرع</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-center hidden md:table-cell">طريقة الدفع</TableHead>
                      <TableHead className="text-center">طباعة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-medium">{payment.payment_number}</TableCell>
                        <TableCell>{(payment as any).branches?.name || '—'}</TableCell>
                        <TableCell className="hidden sm:table-cell">{formatDate(payment.payment_date)}</TableCell>
                        <TableCell className="font-semibold text-primary">{formatCurrency(payment.amount)}</TableCell>
                        <TableCell className="text-center hidden md:table-cell">
                          <Badge variant="secondary" className={`text-[10px] ${paymentMethodColors[payment.payment_method] || ''}`}>
                            {paymentMethodLabels[payment.payment_method] || payment.payment_method}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handlePrintReceipt(payment)}
                              title="طباعة A4"
                            >
                              <Printer className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handlePrintThermal(payment)}
                              title="طباعة حرارية"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleExportPDF(payment)}
                              title="تحميل PDF"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-sm text-muted-foreground">
                    صفحة {page} من {totalPages}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                    >
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-primary" />
              تسجيل إيصال قبض
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم الإيصال</Label>
                <Input value={paymentNumber} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>الفرع *</Label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
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
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">كاش</SelectItem>
                    <SelectItem value="bank_transfer">تحويل بنكي</SelectItem>
                    <SelectItem value="cheque">شيك</SelectItem>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ الإيصال'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
