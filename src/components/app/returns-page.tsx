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
  const { navigateTo } = useAppStore();
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
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, branch_id, branches(name)')
      .in('status', ['active', 'partially_returned'])
      .order('created_at', { ascending: false });

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

      // Insert return items with unit_count
      const itemsData = checkedItems.map((item) => ({
        return_id: retData.id,
        item_name: item.item_name,
        quantity: item.quantity,
        unit_count: item.unit_count,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));
      await supabase.from('return_items').insert(itemsData);

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
        <div>
          <h1 className="text-2xl font-bold">المرتجعات</h1>
          <p className="text-muted-foreground text-sm mt-1">
            إجمالي: {totalCount} مرتجع
          </p>
        </div>
        <Button onClick={openCreateDialog} className="gap-2 shadow-md">
          <Plus className="w-4 h-4" />
          مرتجع جديد
        </Button>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث برقم المرتجع..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Returns Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : returns.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <RotateCcw className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد مرتجعات</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                لم يتم تسجيل أي مرتجعات بعد. يمكنك إنشاء مرتجع من أي فاتورة نشطة لإدارة الاسترجاعات.
              </p>
              <Button onClick={openCreateDialog} className="gap-2 shadow-md" size="lg">
                <Plus className="w-5 h-5" />
                إنشاء مرتجع جديد
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم المرتجع</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">الفاتورة الأصلية</TableHead>
                      <TableHead className="text-right hidden md:table-cell">الفرع</TableHead>
                      <TableHead className="text-right hidden md:table-cell">التاريخ</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-center">عرض</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {returns.map((ret) => (
                      <TableRow key={ret.id}>
                        <TableCell className="font-medium">{ret.return_number}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {(ret as any).original_invoice?.invoice_number || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {(ret as any).branches?.name || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{formatDate(ret.return_date)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(ret.total)}</TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
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
                      <ArrowRight className="w-4 h-4" />
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

      {/* Create Return Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-primary" />
              إنشاء مرتجع جديد
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>رقم المرتجع</Label>
                <Input value={returnNumber} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>الفاتورة الأصلية *</Label>
                <Select value={selectedInvoiceId} onValueChange={selectInvoice}>
                  <SelectTrigger>
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
                <Label>أصناف المرتجع</Label>
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
                                className="w-4 h-4 accent-primary"
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
                                <span className="font-bold text-primary text-sm">
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

                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <div className="flex items-center gap-4">
                    <span className="font-bold">إجمالي المرتجع</span>
                    {returnTotalPieces > 0 && (
                      <span className="text-sm text-muted-foreground">
                        ({returnTotalPieces.toLocaleString('ar-EG')} قطعة)
                      </span>
                    )}
                  </div>
                  <span className="text-lg font-bold text-primary">{formatCurrency(returnTotal)}</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            <Button onClick={handleSaveReturn} disabled={saving}>
              {saving ? 'جاري الحفظ...' : 'حفظ المرتجع'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Return Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>تفاصيل المرتجع {selectedReturn?.return_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">الفرع:</span>
                <p className="font-medium">{(selectedReturn as any)?.branches?.name || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">التاريخ:</span>
                <p className="font-medium">{selectedReturn ? formatDate(selectedReturn.return_date) : ''}</p>
              </div>
              <div>
                <span className="text-muted-foreground">الفاتورة الأصلية:</span>
                <p className="font-medium">{(selectedReturn as any)?.original_invoice?.invoice_number || '—'}</p>
              </div>
              <div>
                <span className="text-muted-foreground">الإجمالي:</span>
                <p className="font-bold text-primary">{selectedReturn ? formatCurrency(selectedReturn.total) : ''}</p>
              </div>
            </div>

            {returnItems.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
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
                              <span className="font-bold text-primary text-sm">
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
              <div className="p-3 bg-muted rounded-lg text-sm">
                <span className="font-semibold">ملاحظات:</span> {selectedReturn.notes}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
