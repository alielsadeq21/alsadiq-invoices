'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Payment, Branch } from '@/lib/types';
import { formatCurrency, formatDate, generatePaymentNumber, getCurrentYear } from '@/lib/utils';
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
  Eye,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
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
  const { navigateTo } = useAppStore();
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
    // Generate payment number
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
                      <TableHead className="text-right hidden lg:table-cell">ملاحظات</TableHead>
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
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate hidden lg:table-cell">
                          {payment.notes || '—'}
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
