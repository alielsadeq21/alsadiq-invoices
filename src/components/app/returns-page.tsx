'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Return, InvoiceItem } from '@/lib/types';
import { formatCurrency, formatDate, generateReturnNumber, getCurrentYear } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  RotateCcw,
  Plus,
  Search,
  Eye,
  ArrowRight,
  ChevronLeft,
  FileText,
  MapPin,
  Calendar,
  Receipt,
} from 'lucide-react';
import { toast } from 'sonner';

interface ReturnFormItem {
  item_name: string;
  quantity: number;
  max_quantity: number;
  unit_count: number;
  unit_price: number;
  total_price: number;
  checked: boolean;
}

const PAGE_SIZE = 10;

export default function ReturnsPage() {
  const { navigateTo, user, isAdmin, hasPermission } = useAppStore();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create return dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [invoiceItems, setInvoiceItems] = useState<ReturnFormItem[]>([]);
  const [returnNumber, setReturnNumber] = useState('');
  const [returnNotes, setReturnNotes] = useState('');
  const [returnBranchId, setReturnBranchId] = useState('');
  const [saving, setSaving] = useState(false);

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<Return | null>(null);
  const [returnItems, setReturnItems] = useState<any[]>([]);

  useEffect(() => {
    loadReturns();
  }, [page, search]);

  const loadReturns = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('returns')
        .select('*, branches(name), original_invoice:invoices(invoice_number)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`return_number.ilike.%${search}%`);
      }

      // Branch filtering for non-admin users
      if (!isAdmin && user?.branch_id) {
        query = query.eq('branch_id', user.branch_id);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        setReturns(data as unknown as Return[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openCreateDialog = async () => {
    // Load active invoices
    let invoicesQuery = supabase
      .from('invoices')
      .select('id, invoice_number, branch_id, branches(name)')
      .in('status', ['active', 'partially_returned'])
      .order('created_at', { ascending: false });
    if (!isAdmin && user?.branch_id) {
      invoicesQuery = invoicesQuery.eq('branch_id', user.branch_id);
    }
    const { data } = await invoicesQuery;

    if (data) setInvoices(data as any);

    // Generate return number
    const year = getCurrentYear();
    const { data: lastRet } = await supabase
      .from('returns')
      .select('return_number')
      .like('return_number', `RET-${year}-%`)
      .order('return_number', { ascending: false })
      .limit(1);

    let lastNum = 0;
    if (lastRet && lastRet.length > 0) {
      const parts = lastRet[0].return_number.split('-');
      lastNum = parseInt(parts[parts.length - 1]) || 0;
    }
    setReturnNumber(generateReturnNumber(lastNum, year));

    setSelectedInvoiceId('');
    setInvoiceItems([]);
    setReturnNotes('');
    setReturnBranchId('');
    setDialogOpen(true);
  };

  const selectInvoice = async (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);

    // Load invoice items
    const { data: invData } = await supabase
      .from('invoices')
      .select('*, items:invoice_items(*)')
      .eq('id', invoiceId)
      .single();

    if (invData) {
      setReturnBranchId(invData.branch_id);
      const items = (invData.items || []).map((item: InvoiceItem) => ({
        item_name: item.item_name,
        quantity: 0,
        max_quantity: Number(item.quantity),
        unit_count: Number(item.unit_count) || 1,
        unit_price: Number(item.unit_price),
        total_price: 0,
        checked: false,
      }));
      setInvoiceItems(items);
    }
  };

  const updateReturnItem = (index: number, quantity: number) => {
    setInvoiceItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };
      item.quantity = Math.min(quantity, item.max_quantity);
      item.total_price = item.quantity * item.unit_price;
      updated[index] = item;
      return updated;
    });
  };

  const toggleReturnItem = (index: number, checked: boolean) => {
    setInvoiceItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], checked };
      if (!checked) {
        updated[index].quantity = 0;
        updated[index].total_price = 0;
      }
      return updated;
    });
  };

  const returnTotal = invoiceItems.reduce((sum, item) => sum + item.total_price, 0);
  const returnTotalPieces = invoiceItems.reduce((sum, item) => sum + (item.quantity * item.unit_count), 0);

  const handleSaveReturn = async () => {
    const checkedItems = invoiceItems.filter((i) => i.checked && i.quantity > 0);
    if (checkedItems.length === 0) {
      toast.error('يرجى تحديد أصناف المرتجع');
      return;
    }

    setSaving(true);
    try {
      const { data: retData, error } = await supabase
        .from('returns')
        .insert({
          return_number: returnNumber,
          original_invoice_id: selectedInvoiceId,
          branch_id: returnBranchId,
          total: returnTotal,
          notes: returnNotes || null,
        })
        .select('id')
        .single();

      if (error) throw error;

      // Insert return items with unit_count and product_id
      const itemsData: any[] = [];
      for (const item of checkedItems) {
        const { data: origItem } = await supabase
          .from('invoice_items')
          .select('product_id')
          .eq('invoice_id', selectedInvoiceId)
          .eq('item_name', item.item_name)
          .limit(1)
          .single();

        itemsData.push({
          return_id: retData.id,
          item_name: item.item_name,
          product_id: origItem?.product_id || null,
          quantity: item.quantity,
          unit_count: item.unit_count,
          unit_price: item.unit_price,
          total_price: item.total_price,
        });
      }
      await supabase.from('return_items').insert(itemsData);

      // Log activity
      await supabase.from('audit_log').insert({
        action: 'create_return',
        details: { return_number: returnNumber, total: returnTotal },
      });

      // Update invoice status
      const allReturned = invoiceItems.every(
        (item) => !item.checked || item.quantity >= item.max_quantity
      );
      await supabase
        .from('invoices')
        .update({
          status: allReturned ? 'fully_returned' : 'partially_returned',
          updated_at: new Date().toISOString(),
        })
        .eq('id', selectedInvoiceId);

      // ===== ربط المخزون بالمرتجعات: إرجاع للمخزون =====
      for (const retItem of checkedItems) {
        // Try to find product_id from original invoice items
        const { data: origItem } = await supabase
          .from('invoice_items')
          .select('product_id')
          .eq('invoice_id', selectedInvoiceId)
          .eq('item_name', retItem.item_name)
          .limit(1)
          .single();

        const productId = origItem?.product_id;
        if (!productId) continue;
        const totalPieces = retItem.quantity * retItem.unit_count;

        const { data: invRecord } = await supabase
          .from('inventory')
          .select('*')
          .eq('product_id', productId)
          .eq('branch_id', returnBranchId)
          .single();

        if (invRecord) {
          await supabase
            .from('inventory')
            .update({
              quantity: invRecord.quantity + totalPieces,
              last_updated: new Date().toISOString(),
            })
            .eq('id', invRecord.id);
        }

        await supabase.from('inventory_transactions').insert({
          product_id: productId,
          branch_id: returnBranchId,
          transaction_type: 'in',
          quantity: totalPieces,
          reference_type: 'return',
          reference_id: retData.id,
          notes: `مرتجع من فاتورة: ${returnNumber}`,
          created_by: user?.id || null,
        });
      }

      toast.success('تم إنشاء المرتجع بنجاح');
      setDialogOpen(false);
      loadReturns();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ المرتجع');
    } finally {
      setSaving(false);
    }
  };

  const viewReturnDetail = async (ret: Return) => {
    setSelectedReturn(ret);
    const { data } = await supabase
      .from('return_items')
      .select('*')
      .eq('return_id', ret.id);
    if (data) setReturnItems(data);
    setDetailDialogOpen(true);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg"
            style={{
              background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
              flexShrink: 0,
            }}
          >
            <RotateCcw className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">المرتجعات</h1>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'rgba(244,63,94,0.1)', color: '#e11d48' }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#e11d48' }}></span>
                {totalCount} مرتجع
              </span>
            </div>
          </div>
        </div>
        {hasPermission('returns', 'create') && (
          <Button
            onClick={openCreateDialog}
            className="gap-2 shadow-lg text-white font-semibold px-5 h-11 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
          >
            <Plus className="w-4 h-4" />
            مرتجع جديد
          </Button>
        )}
      </div>

      {/* Search */}
      <Card
        className="border-0 shadow-md overflow-hidden"
        style={{ borderTop: '3px solid', borderImage: 'linear-gradient(to left, #f43f5e, #fb7185) 1' }}
      >
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400" />
            <Input
              placeholder="بحث برقم المرتجع..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pr-10 h-11 bg-gray-50/80 border-gray-200/60 focus:bg-white transition-colors"
            />
          </div>
        </CardContent>
      </Card>

      {/* Returns Content */}
      <Card className="border-0 shadow-md overflow-hidden">
        {/* Gradient accent bar at top */}
        <div
          style={{
            height: '3px',
            background: 'linear-gradient(to left, #f43f5e, #fb7185, #fda4af)',
          }}
        />
        <CardContent className="p-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="relative">
                <div
                  className="w-10 h-10 rounded-full border-3 border-t-transparent animate-spin"
                  style={{ borderColor: '#fda4af', borderTopColor: 'transparent' }}
                />
              </div>
              <p className="text-muted-foreground text-sm font-medium">جاري التحميل...</p>
            </div>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div
                className="w-24 h-24 rounded-2xl flex items-center justify-center mb-5 shadow-lg"
                style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.15), rgba(251,113,133,0.15))' }}
              >
                <RotateCcw
                  className="w-12 h-12"
                  style={{ color: '#e11d48' }}
                />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد مرتجعات</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                لم يتم تسجيل أي مرتجعات بعد. يمكنك إنشاء مرتجع من أي فاتورة نشطة لإدارة الاسترجاعات.
              </p>
              {hasPermission('returns', 'create') && (
                <Button
                  onClick={openCreateDialog}
                  className="gap-2 shadow-lg text-white font-semibold px-6 h-11 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                  style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                  size="lg"
                >
                  <Plus className="w-5 h-5" />
                  إنشاء مرتجع جديد
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="sm:hidden p-3 space-y-3">
                {returns.map((ret) => (
                  <div
                    key={ret.id}
                    className="relative rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                    style={{ borderRight: '4px solid #f43f5e' }}
                  >
                    <div className="p-3 space-y-3">
                      {/* Return number row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                        >
                          <RotateCcw className="w-4 h-4 text-white" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p className="font-bold text-sm truncate">{ret.return_number}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <FileText className="w-3 h-3" />
                            {(ret as any).original_invoice?.invoice_number || '—'}
                          </p>
                        </div>
                        <div
                          className="text-left flex-shrink-0"
                        >
                          <p className="font-bold text-sm" style={{ color: '#e11d48' }}>
                            {formatCurrency(ret.total)}
                          </p>
                        </div>
                      </div>

                      {/* Details row */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                          style={{ background: 'rgba(244,63,94,0.06)', color: '#9f1239' }}
                        >
                          <MapPin className="w-3 h-3" />
                          {(ret as any).branches?.name || '—'}
                        </span>
                        <span
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md"
                          style={{ background: 'rgba(59,130,246,0.06)', color: '#1e40af' }}
                        >
                          <Calendar className="w-3 h-3" />
                          {formatDate(ret.return_date)}
                        </span>
                      </div>

                      {/* Action button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-9 text-xs font-medium gap-1.5 transition-all duration-200 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200"
                        onClick={() => viewReturnDetail(ret)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        عرض التفاصيل
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block">
                <div style={{ overflowX: 'auto' }}>
                  <Table>
                    <TableHeader>
                      <TableRow
                        className="border-b-0"
                        style={{ background: 'linear-gradient(to left, rgba(244,63,94,0.04), rgba(251,113,133,0.04))' }}
                      >
                        <TableHead className="text-right font-bold text-xs uppercase tracking-wider py-4" style={{ color: '#9f1239' }}>
                          رقم المرتجع
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase tracking-wider py-4 hidden sm:table-cell" style={{ color: '#9f1239' }}>
                          الفاتورة الأصلية
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase tracking-wider py-4 hidden md:table-cell" style={{ color: '#9f1239' }}>
                          الفرع
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase tracking-wider py-4 hidden md:table-cell" style={{ color: '#9f1239' }}>
                          التاريخ
                        </TableHead>
                        <TableHead className="text-right font-bold text-xs uppercase tracking-wider py-4" style={{ color: '#9f1239' }}>
                          الإجمالي
                        </TableHead>
                        <TableHead className="text-center font-bold text-xs uppercase tracking-wider py-4" style={{ color: '#9f1239' }}>
                          عرض
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returns.map((ret) => (
                        <TableRow
                          key={ret.id}
                          className="transition-all duration-150 group"
                          style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}
                        >
                          <TableCell>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm"
                                style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                              >
                                <RotateCcw className="w-3.5 h-3.5 text-white" />
                              </div>
                              <span className="font-semibold text-sm">{ret.return_number}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                              <FileText className="w-3.5 h-3.5 text-gray-400" />
                              {(ret as any).original_invoice?.invoice_number || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              {(ret as any).branches?.name || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                              <Calendar className="w-3.5 h-3.5 text-gray-400" />
                              {formatDate(ret.return_date)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span
                              className="font-bold text-sm px-2.5 py-1 rounded-md"
                              style={{ background: 'rgba(244,63,94,0.08)', color: '#e11d48' }}
                            >
                              {formatCurrency(ret.total)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-lg transition-all duration-200 hover:bg-rose-50 hover:text-rose-600"
                              onClick={() => viewReturnDetail(ret)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {totalPages > 1 && (
                <div
                  className="flex items-center justify-between px-4 py-3 border-t"
                  style={{ borderColor: 'rgba(0,0,0,0.06)', background: 'rgba(244,63,94,0.02)' }}
                >
                  <p className="text-sm text-muted-foreground font-medium">
                    صفحة <span style={{ color: '#e11d48', fontWeight: 700 }}>{page}</span> من {totalPages}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg transition-all duration-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    >
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 rounded-lg transition-all duration-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600"
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

      {/* Create Return Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                >
                  <RotateCcw className="w-4 h-4 text-white" />
                </div>
                إنشاء مرتجع جديد
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" style={{ minHeight: 0 }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="font-semibold text-sm">رقم المرتجع</Label>
                <Input value={returnNumber} disabled className="bg-muted h-10 font-mono" />
              </div>
              <div className="space-y-2">
                <Label className="font-semibold text-sm">الفاتورة الأصلية *</Label>
                <Select value={selectedInvoiceId} onValueChange={selectInvoice}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="اختر الفاتورة" />
                  </SelectTrigger>
                  <SelectContent>
                    {invoices.map((inv: any) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoice_number} - {inv.branches?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {invoiceItems.length > 0 && (
              <div className="space-y-3">
                <Label className="font-semibold text-sm">أصناف المرتجع</Label>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-center w-10">✓</TableHead>
                        <TableHead className="text-right">الصنف</TableHead>
                        <TableHead className="text-center">الكمية الأصلية</TableHead>
                        <TableHead className="text-center hidden sm:table-cell">عدد/وحدة</TableHead>
                        <TableHead className="text-center">كمية المرتجع</TableHead>
                        <TableHead className="text-center hidden md:table-cell">إجمالي القطع</TableHead>
                        <TableHead className="text-center">سعر الوحدة</TableHead>
                        <TableHead className="text-left">الإجمالي</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoiceItems.map((item, index) => {
                        const totalPieces = item.quantity * item.unit_count;
                        return (
                          <TableRow key={index}>
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                checked={item.checked}
                                onChange={(e) => toggleReturnItem(index, e.target.checked)}
                                className="w-4 h-4 accent-rose-500"
                              />
                            </TableCell>
                            <TableCell className="font-medium">{item.item_name}</TableCell>
                            <TableCell className="text-center">{item.max_quantity}</TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                              {item.unit_count > 1 ? item.unit_count : '—'}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={item.quantity || ''}
                                onChange={(e) => updateReturnItem(index, Number(e.target.value) || 0)}
                                disabled={!item.checked}
                                className="h-8 w-20 text-center mx-auto"
                                min="0"
                                max={item.max_quantity}
                                step="0.01"
                              />
                            </TableCell>
                            <TableCell className="text-center hidden md:table-cell">
                              {item.checked && item.unit_count > 1 ? (
                                <span className="font-bold text-sm" style={{ color: '#e11d48' }}>
                                  {totalPieces.toLocaleString('ar-EG')}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell className="text-center">{formatCurrency(item.unit_price)}</TableCell>
                            <TableCell className="text-left font-semibold">{formatCurrency(item.total_price)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>

                <div
                  className="flex items-center justify-between p-4 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.06), rgba(251,113,133,0.06))' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Receipt className="w-5 h-5" style={{ color: '#e11d48' }} />
                    <div>
                      <span className="font-bold text-sm">إجمالي المرتجع</span>
                      {returnTotalPieces > 0 && (
                        <span className="text-xs text-muted-foreground mr-2">
                          ({returnTotalPieces.toLocaleString('ar-EG')} قطعة)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-lg font-bold" style={{ color: '#e11d48' }}>{formatCurrency(returnTotal)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="font-semibold text-sm">ملاحظات</Label>
              <Textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 shrink-0 border-t bg-background">
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-10">إلغاء</Button>
              <Button
                onClick={handleSaveReturn}
                disabled={saving}
                className="h-10 text-white font-semibold px-5 transition-all duration-200 hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
              >
                {saving ? 'جاري الحفظ...' : 'حفظ المرتجع'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Return Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #f43f5e, #e11d48)' }}
                >
                  <Eye className="w-4 h-4 text-white" />
                </div>
                تفاصيل المرتجع {selectedReturn?.return_number}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" style={{ minHeight: 0 }}>
            {/* Info Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(244,63,94,0.05)', border: '1px solid rgba(244,63,94,0.1)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="mb-1">
                  <MapPin className="w-3.5 h-3.5" style={{ color: '#e11d48' }} />
                  <span className="text-xs text-muted-foreground">الفرع</span>
                </div>
                <p className="font-semibold text-sm">{(selectedReturn as any)?.branches?.name || '—'}</p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.1)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="mb-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs text-muted-foreground">التاريخ</span>
                </div>
                <p className="font-semibold text-sm">{selectedReturn ? formatDate(selectedReturn.return_date) : ''}</p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.1)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="mb-1">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-xs text-muted-foreground">الفاتورة الأصلية</span>
                </div>
                <p className="font-semibold text-sm">{(selectedReturn as any)?.original_invoice?.invoice_number || '—'}</p>
              </div>
              <div
                className="p-3 rounded-xl"
                style={{ background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.15)' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} className="mb-1">
                  <Receipt className="w-3.5 h-3.5" style={{ color: '#e11d48' }} />
                  <span className="text-xs text-muted-foreground">الإجمالي</span>
                </div>
                <p className="font-bold text-sm" style={{ color: '#e11d48' }}>{selectedReturn ? formatCurrency(selectedReturn.total) : ''}</p>
              </div>
            </div>

            {returnItems.length > 0 && (
              <div className="border rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2.5"
                  style={{ background: 'linear-gradient(to left, rgba(244,63,94,0.06), rgba(251,113,133,0.06))' }}
                >
                  <p className="font-semibold text-sm" style={{ color: '#9f1239' }}>أصناف المرتجع</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الصنف</TableHead>
                      <TableHead className="text-center">الكمية</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">عدد/وحدة</TableHead>
                      <TableHead className="text-center hidden sm:table-cell">إجمالي القطع</TableHead>
                      <TableHead className="text-left">الإجمالي</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returnItems.map((item) => {
                      const unitCount = Number(item.unit_count) || 1;
                      const qty = Number(item.quantity);
                      const totalPieces = qty * unitCount;
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.item_name}</TableCell>
                          <TableCell className="text-center">{qty.toLocaleString('ar-EG')}</TableCell>
                          <TableCell className="text-center hidden sm:table-cell">
                            {unitCount > 1 ? unitCount : '—'}
                          </TableCell>
                          <TableCell className="text-center hidden sm:table-cell">
                            {unitCount > 1 ? (
                              <span className="font-bold text-sm" style={{ color: '#e11d48' }}>
                                {totalPieces.toLocaleString('ar-EG')}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-left font-semibold">{formatCurrency(Number(item.total_price))}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {selectedReturn?.notes && (
              <div
                className="p-3 rounded-xl text-sm"
                style={{ background: 'rgba(244,63,94,0.04)', border: '1px solid rgba(244,63,94,0.1)' }}
              >
                <span className="font-semibold" style={{ color: '#9f1239' }}>ملاحظات:</span>{' '}
                <span className="text-gray-600">{selectedReturn.notes}</span>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
