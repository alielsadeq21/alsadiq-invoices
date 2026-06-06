'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Branch, Invoice, InvoiceItem, InvoiceFormItem } from '@/lib/types';
import { formatCurrency, generateInvoiceNumber, getCurrentYear, getTodayISO } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
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
  ArrowRight,
  Plus,
  Trash2,
  Save,
  Printer,
  FileText,
  Loader2,
  User,
  Truck,
  Clock,
  Calendar,
  Calculator,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function InvoiceFormPage() {
  const { navigateTo, pageParams, settings } = useAppStore();
  const id = pageParams.id;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [branchId, setBranchId] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(getTodayISO());
  const [invoiceTime, setInvoiceTime] = useState(() => {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  });
  const [receiverName, setReceiverName] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [items, setItems] = useState<InvoiceFormItem[]>([
    { item_name: '', quantity: 1, unit_count: 1, unit_price: 0, total_price: 0 },
  ]);
  const [applyTax, setApplyTax] = useState(false);
  const [taxRate, setTaxRate] = useState(settings?.default_tax_rate || 0);
  const [notes, setNotes] = useState('');

  // Track if form has been modified for beforeunload warning
  const [hasChanges, setHasChanges] = useState(false);
  const savingRef = useRef(false);

  // Mark form as changed whenever any field is updated
  const markChanged = useCallback(() => {
    if (!savingRef.current) {
      setHasChanges(true);
    }
  }, []);

  // Wrapper for state setters that also marks form as changed
  const setBranchIdChanged = (v: string) => { setBranchId(v); markChanged(); };
  const setInvoiceDateChanged = (v: string) => { setInvoiceDate(v); markChanged(); };
  const setInvoiceTimeChanged = (v: string) => { setInvoiceTime(v); markChanged(); };
  const setReceiverNameChanged = (v: string) => { setReceiverName(v); markChanged(); };
  const setDriverNameChanged = (v: string) => { setDriverName(v); markChanged(); };
  const setDriverPhoneChanged = (v: string) => { setDriverPhone(v); markChanged(); };
  const setNotesChanged = (v: string) => { setNotes(v); markChanged(); };

  // beforeunload warning
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasChanges]);

  useEffect(() => {
    loadBranches();
    if (id) {
      setIsEdit(true);
      loadInvoice(id);
    } else {
      generateNewInvoiceNumber();
    }
  }, [id]);

  useEffect(() => {
    if (settings?.default_tax_rate && settings.default_tax_rate > 0) {
      setApplyTax(true);
      setTaxRate(settings.default_tax_rate);
    }
  }, [settings]);

  const loadBranches = async () => {
    const { data } = await supabase
      .from('branches')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (data) setBranches(data as Branch[]);
  };

  const generateNewInvoiceNumber = async () => {
    const year = getCurrentYear();
    const { data } = await supabase
      .from('invoices')
      .select('invoice_number')
      .like('invoice_number', `INV-${year}-%`)
      .order('invoice_number', { ascending: false })
      .limit(1);

    let lastNum = 0;
    if (data && data.length > 0) {
      const parts = data[0].invoice_number.split('-');
      lastNum = parseInt(parts[parts.length - 1]) || 0;
    }
    setInvoiceNumber(generateInvoiceNumber(lastNum, year));
  };

  const loadInvoice = async (invoiceId: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invoices')
        .select('*, items:invoice_items(*)')
        .eq('id', invoiceId)
        .single();

      if (error || !data) {
        toast.error('لم يتم العثور على الفاتورة');
        navigateTo('invoices');
        return;
      }

      const invoice = data as Invoice & { items: InvoiceItem[] };

      // Block editing of finalized/locked invoices (security protection)
      // Once an invoice is saved, it becomes locked - no modifications allowed
      if (invoice.status === 'active' || invoice.status === 'cancelled' || invoice.status === 'partially_returned' || invoice.status === 'fully_returned') {
        toast.error('لا يمكن تعديل فاتورة مُنهية. الفواتير بعد الحفظ تصبح مقفلة.');
        navigateTo('invoice-detail', { id: invoiceId });
        return;
      }

      setInvoiceNumber(invoice.invoice_number);
      setBranchId(invoice.branch_id);
      setInvoiceDate(invoice.invoice_date);
      setInvoiceTime(invoice.invoice_time || '');
      setReceiverName(invoice.receiver_name || '');
      setDriverName(invoice.driver_name || '');
      setDriverPhone(invoice.driver_phone || '');
      setApplyTax(invoice.tax_rate > 0);
      setTaxRate(invoice.tax_rate);
      setNotes(invoice.notes || '');

      if (invoice.items && invoice.items.length > 0) {
        setItems(
          invoice.items.map((item) => ({
            item_name: item.item_name,
            quantity: Number(item.quantity),
            unit_count: Number(item.unit_count) || 1,
            unit_price: Number(item.unit_price),
            total_price: Number(item.total_price),
          }))
        );
      }

      // Mark as no changes after loading existing invoice
      setHasChanges(false);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في تحميل الفاتورة');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, field: keyof InvoiceFormItem, value: string | number) => {
    markChanged();
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index] };

      if (field === 'item_name') {
        item.item_name = value as string;
      } else if (field === 'quantity') {
        item.quantity = Math.max(0, Number(value) || 0);
        item.total_price = item.quantity * item.unit_count * item.unit_price;
      } else if (field === 'unit_count') {
        item.unit_count = Math.max(1, Number(value) || 1);
        item.total_price = item.quantity * item.unit_count * item.unit_price;
      } else if (field === 'unit_price') {
        item.unit_price = Math.max(0, Number(value) || 0);
        item.total_price = item.quantity * item.unit_count * item.unit_price;
      }

      updated[index] = item;
      return updated;
    });
  };

  const addItem = () => {
    markChanged();
    setItems((prev) => [
      ...prev,
      { item_name: '', quantity: 1, unit_count: 1, unit_price: 0, total_price: 0 },
    ]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('يجب أن تحتوي الفاتورة على صنف واحد على الأقل');
      return;
    }
    markChanged();
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.total_price, 0);
  const taxAmount = applyTax ? (subtotal * taxRate) / 100 : 0;
  const total = subtotal + taxAmount;
  const totalPieces = items.reduce((sum, item) => sum + (item.quantity * item.unit_count), 0);

  const validateForm = (): boolean => {
    if (!branchId) {
      toast.error('يرجى اختيار الفرع');
      return false;
    }
    if (!invoiceDate) {
      toast.error('يرجى تحديد تاريخ الفاتورة');
      return false;
    }
    const hasEmptyName = items.some((item) => !item.item_name.trim());
    if (hasEmptyName) {
      toast.error('يرجى إدخال اسم جميع الأصناف');
      return false;
    }
    const hasZeroPrice = items.some((item) => item.unit_price <= 0);
    if (hasZeroPrice) {
      toast.error('يرجى إدخال سعر الوحدة لجميع الأصناف');
      return false;
    }
    const hasZeroQty = items.some((item) => item.quantity <= 0);
    if (hasZeroQty) {
      toast.error('يرجى إدخال الكمية لجميع الأصناف');
      return false;
    }
    return true;
  };

  const handleSave = async (andPrint = false) => {
    if (!validateForm()) return;

    savingRef.current = true;
    setSaving(true);
    try {
      if (isEdit && id) {
        const { error: invError } = await supabase
          .from('invoices')
          .update({
            branch_id: branchId,
            invoice_date: invoiceDate,
            invoice_time: invoiceTime || null,
            receiver_name: receiverName || null,
            driver_name: driverName || null,
            driver_phone: driverPhone || null,
            subtotal,
            tax_rate: applyTax ? taxRate : 0,
            tax_amount: taxAmount,
            total,
            notes: notes || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (invError) throw invError;

        await supabase.from('invoice_items').delete().eq('invoice_id', id);
        const itemsData = items.map((item) => ({
          invoice_id: id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_count: item.unit_count,
          unit_price: item.unit_price,
          total_price: item.total_price,
        }));
        const { error: itemsError } = await supabase.from('invoice_items').insert(itemsData);
        if (itemsError) throw itemsError;

        toast.success('تم تحديث الفاتورة بنجاح');
      } else {
        const { data: invData, error: invError } = await supabase
          .from('invoices')
          .insert({
            invoice_number: invoiceNumber,
            branch_id: branchId,
            invoice_date: invoiceDate,
            invoice_time: invoiceTime || null,
            receiver_name: receiverName || null,
            driver_name: driverName || null,
            driver_phone: driverPhone || null,
            subtotal,
            tax_rate: applyTax ? taxRate : 0,
            tax_amount: taxAmount,
            total,
            notes: notes || null,
          })
          .select('id')
          .single();

        if (invError) throw invError;

        const itemsData = items.map((item) => ({
          invoice_id: invData.id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_count: item.unit_count,
          unit_price: item.unit_price,
          total_price: item.total_price,
        }));
        const { error: itemsError } = await supabase.from('invoice_items').insert(itemsData);
        if (itemsError) throw itemsError;

        toast.success('تم حفظ الفاتورة بنجاح');
        setHasChanges(false);

        if (andPrint) {
          navigateTo('invoice-detail', { id: invData.id, print: 'true' });
          return;
        }

        navigateTo('invoice-detail', { id: invData.id });
        return;
      }

      await supabase.from('audit_log').insert({
        action: isEdit ? 'update_invoice' : 'create_invoice',
        details: { invoice_number: invoiceNumber, total },
      });

      setHasChanges(false);

      if (andPrint && id) {
        navigateTo('invoice-detail', { id, print: 'true' });
      } else if (id) {
        navigateTo('invoice-detail', { id });
      }
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء حفظ الفاتورة');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // Keyboard shortcuts: Ctrl+S to save, Ctrl+P to save & print
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!saving) handleSave(false);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (!saving) handleSave(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [saving, items, branchId, invoiceDate, invoiceTime, receiverName, driverName, driverPhone, applyTax, taxRate, notes, isEdit, id, invoiceNumber]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => {
            if (hasChanges) {
              const confirmed = window.confirm('لديك تغييرات غير محفوظة. هل تريد المغادرة؟');
              if (!confirmed) return;
            }
            navigateTo('invoices');
          }}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isEdit ? 'تعديل الفاتورة' : 'فاتورة صرف جديدة'}
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">{invoiceNumber}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            حفظ
            <span className="text-[10px] text-muted-foreground hidden sm:inline">Ctrl+S</span>
          </Button>
          <Button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
            حفظ وطباعة
            <span className="text-[10px] text-white/70 hidden sm:inline">Ctrl+P</span>
          </Button>
        </div>
      </div>

      {/* Invoice Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              بيانات الفاتورة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>رقم الفاتورة</Label>
                <Input value={invoiceNumber} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>الفرع *</Label>
                <Select value={branchId} onValueChange={setBranchIdChanged}>
                  <SelectTrigger>
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  التاريخ *
                </Label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDateChanged(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  الوقت
                </Label>
                <Input
                  type="time"
                  value={invoiceTime}
                  onChange={(e) => setInvoiceTimeChanged(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Delivery Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              بيانات التسليم
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  اسم المستلم
                </Label>
                <Input
                  value={receiverName}
                  onChange={(e) => setReceiverNameChanged(e.target.value)}
                  placeholder="اسم مستلم البضاعة"
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" />
                  اسم السائق
                </Label>
                <Input
                  value={driverName}
                  onChange={(e) => setDriverNameChanged(e.target.value)}
                  placeholder="اسم السائق"
                />
              </div>
              <div className="space-y-2">
                <Label>هاتف السائق</Label>
                <Input
                  value={driverPhone}
                  onChange={(e) => setDriverPhoneChanged(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  dir="ltr"
                  className="text-left"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Items Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-lg">الأصناف</CardTitle>
            <Button onClick={addItem} size="sm" variant="outline" className="gap-1">
              <Plus className="w-4 h-4" />
              إضافة صنف
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8">#</TableHead>
                    <TableHead className="text-right min-w-[160px]">اسم الصنف</TableHead>
                    <TableHead className="text-right w-28">الكمية</TableHead>
                    <TableHead className="text-center w-28">عدد/وحدة</TableHead>
                    <TableHead className="text-center w-32">إجمالي القطع</TableHead>
                    <TableHead className="text-right w-32">سعر الوحدة</TableHead>
                    <TableHead className="text-right w-36">الإجمالي</TableHead>
                    <TableHead className="text-center w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => {
                    const totalItemPieces = item.quantity * item.unit_count;
                    return (
                      <TableRow key={index}>
                        <TableCell className="font-medium text-muted-foreground">
                          {index + 1}
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.item_name}
                            onChange={(e) => updateItem(index, 'item_name', e.target.value)}
                            placeholder="اسم الصنف"
                            className="h-9"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={item.quantity || ''}
                            onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                            placeholder="0"
                            className="h-9 text-left"
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="numeric"
                            value={item.unit_count || ''}
                            onChange={(e) => updateItem(index, 'unit_count', e.target.value)}
                            placeholder="1"
                            className="h-9 text-center"
                            min="1"
                            step="1"
                          />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Calculator className="w-3.5 h-3.5 text-primary" />
                            <span className={`font-bold text-sm ${totalItemPieces > 1 ? 'text-primary' : 'text-muted-foreground'}`}>
                              {totalItemPieces.toLocaleString('ar-EG')}
                            </span>
                          </div>
                          {item.unit_count > 1 && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {item.quantity} × {item.unit_count}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={item.unit_price || ''}
                            onChange={(e) => updateItem(index, 'unit_price', e.target.value)}
                            placeholder="0.00"
                            className="h-9 text-left"
                            min="0"
                            step="0.01"
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-left">
                          {formatCurrency(item.total_price)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(index)}
                            className="h-8 w-8 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Totals & Notes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.3 }}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-5">
              <Label htmlFor="notes">ملاحظات</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotesChanged(e.target.value)}
                placeholder="أي ملاحظات إضافية..."
                className="mt-2"
                rows={4}
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.4 }}>
          <Card className="border-0 shadow-md">
            <CardContent className="p-5 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b">
                <Checkbox
                  id="apply-tax"
                  checked={applyTax}
                  onCheckedChange={(checked) => { setApplyTax(checked as boolean); markChanged(); }}
                />
                <Label htmlFor="apply-tax" className="cursor-pointer">
                  تطبيق الضريبة
                </Label>
                {applyTax && (
                  <div className="flex items-center gap-2 mr-auto">
                    <Input
                      type="number"
                      value={taxRate || ''}
                      onChange={(e) => { setTaxRate(Number(e.target.value) || 0); markChanged(); }}
                      className="w-20 h-8 text-left"
                      min="0"
                      max="100"
                      step="0.01"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span className="font-semibold">{formatCurrency(subtotal)}</span>
              </div>

              {applyTax && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">
                    الضريبة ({taxRate}%)
                  </span>
                  <span className="font-semibold">{formatCurrency(taxAmount)}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t">
                <span className="text-lg font-bold">الإجمالي النهائي</span>
                <span className="text-xl font-bold text-primary">
                  {formatCurrency(total)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>عدد الأصناف: {items.length}</span>
                <span>إجمالي القطع: {totalPieces.toLocaleString('ar-EG')}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
