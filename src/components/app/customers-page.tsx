'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import DataTablePagination from '@/components/ui/data-table-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Users,
  Plus,
  Search,
  Edit,
  Shield,
  UserCheck,
  UserX,
  Filter,
  Loader2,
  Phone,
  MapPin,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function CustomersPage() {
  const { user: currentUser, isAdmin, hasPermission } = useAppStore();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    tax_number: '',
    is_active: true,
    notes: '',
  });

  // Toggle active confirmation
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [togglingCustomer, setTogglingCustomer] = useState<Customer | null>(null);

  // Customer account statement
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [statementData, setStatementData] = useState<{
    invoices: any[];
    payments: any[];
    returns: any[];
    totalInvoiced: number;
    totalPaid: number;
    totalReturned: number;
    balance: number;
  }>({ invoices: [], payments: [], returns: [], totalInvoiced: 0, totalPaid: 0, totalReturned: 0, balance: 0 });
  const [loadingStatement, setLoadingStatement] = useState(false);

  const openStatement = async (customer: Customer) => {
    setStatementCustomer(customer);
    setStatementDialogOpen(true);
    setLoadingStatement(true);
    try {
      // Load invoices for this customer
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, total, status, branches(name)')
        .eq('customer_id', customer.id)
        .order('invoice_date', { ascending: false });

      // Load payments related to this customer's invoices
      // Since payments table doesn't have customer_id, we need to get invoice IDs first
      const invoiceIds = (invoices || []).map((inv: any) => inv.id);

      let payments: any[] = [];
      if (invoiceIds.length > 0) {
        const { data: payData } = await supabase
          .from('payments')
          .select('id, payment_number, payment_date, amount, payment_method, branch_id, branches(name)')
          .in('branch_id', (invoices || []).map((inv: any) => inv.branch_id))
          .order('payment_date', { ascending: false });
        payments = payData || [];
      }

      // Load returns for this customer's invoices
      let returns: any[] = [];
      if (invoiceIds.length > 0) {
        const { data: retData } = await supabase
          .from('returns')
          .select('id, return_number, return_date, total, branches(name)')
          .in('original_invoice_id', invoiceIds)
          .order('return_date', { ascending: false });
        returns = retData || [];
      }

      const totalInvoiced = (invoices || []).filter((inv: any) => inv.status === 'active' || inv.status === 'partially_returned').reduce((s: number, inv: any) => s + Number(inv.total), 0);
      const totalReturned = (returns || []).reduce((s: number, r: any) => s + Number(r.total), 0);
      const totalPaid = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

      setStatementData({
        invoices: invoices || [],
        payments,
        returns,
        totalInvoiced,
        totalPaid,
        totalReturned,
        balance: totalInvoiced - totalPaid - totalReturned,
      });
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل كشف الحساب');
    } finally {
      setLoadingStatement(false);
    }
  };

  const canView = isAdmin || hasPermission('customers', 'view');
  const canCreate = isAdmin || hasPermission('customers', 'create');
  const canEdit = isAdmin || hasPermission('customers', 'edit');
  const canDelete = isAdmin || hasPermission('customers', 'delete');

  useEffect(() => {
    if (!canView) return;
    loadData();
  }, [canView, page, pageSize, search, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('customers')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
      }
      if (statusFilter === 'active') {
        query = query.eq('is_active', true);
      } else if (statusFilter === 'inactive') {
        query = query.eq('is_active', false);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (error) throw error;
      if (data) setCustomers(data as Customer[]);
      setTotalCount(count || 0);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const logAction = async (action: string, details: Record<string, unknown>) => {
    try {
      await supabase.from('audit_log').insert({ action, details });
    } catch {
      // Silent fail for audit logging
    }
  };

  const openAddDialog = () => {
    setEditingCustomer(null);
    setForm({
      name: '',
      phone: '',
      address: '',
      tax_number: '',
      is_active: true,
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: customer.phone || '',
      address: customer.address || '',
      tax_number: customer.tax_number || '',
      is_active: customer.is_active,
      notes: customer.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('يرجى إدخال اسم العميل');
      return;
    }

    setSaving(true);
    try {
      if (editingCustomer) {
        // Update customer
        const { error } = await supabase
          .from('customers')
          .update({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            tax_number: form.tax_number.trim() || null,
            is_active: form.is_active,
            notes: form.notes.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingCustomer.id);

        if (error) throw error;

        await logAction('update_customer', {
          customer_id: editingCustomer.id,
          customer_name: form.name.trim(),
          updated_by: currentUser?.id,
        });

        toast.success('تم تحديث العميل بنجاح');
      } else {
        // Insert new customer
        const { error } = await supabase.from('customers').insert({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          tax_number: form.tax_number.trim() || null,
          is_active: form.is_active,
          notes: form.notes.trim() || null,
        });

        if (error) throw error;

        await logAction('create_customer', {
          customer_name: form.name.trim(),
          phone: form.phone.trim() || null,
          created_by: currentUser?.id,
        });

        toast.success('تم إضافة العميل بنجاح');
      }

      setDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!togglingCustomer) return;

    try {
      const newStatus = !togglingCustomer.is_active;
      const { error } = await supabase
        .from('customers')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', togglingCustomer.id);

      if (error) throw error;

      await logAction(newStatus ? 'activate_customer' : 'deactivate_customer', {
        customer_id: togglingCustomer.id,
        customer_name: togglingCustomer.name,
        action_by: currentUser?.id,
      });

      toast.success(newStatus ? 'تم تفعيل العميل' : 'تم تعطيل العميل');
      setToggleDialogOpen(false);
      setTogglingCustomer(null);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تغيير الحالة');
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-24 h-24 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5">
          <Shield className="w-12 h-12 text-red-500" />
        </div>
        <h3 className="text-xl font-bold mb-2">غير مصرح بالوصول</h3>
        <p className="text-muted-foreground text-sm text-center">
          ليس لديك صلاحية لعرض هذه الصفحة
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6 text-primary" />
              إدارة العملاء
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              إجمالي العملاء: {totalCount}
            </p>
          </div>
          {canCreate && (
            <Button onClick={openAddDialog} className="gap-2 shadow-md">
              <Plus className="w-4 h-4" />
              إضافة عميل
            </Button>
          )}
        </div>
      </motion.div>

      {/* Search & Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو رقم الهاتف..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pr-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-[130px]">
                    <Filter className="w-4 h-4 ml-1" />
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">معطل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Customers Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                  <Users className="w-12 h-12 text-primary/60" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا يوجد عملاء</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إضافة أي عملاء بعد. أضف عميلاً لبدء إدارة بيانات العملاء.
                </p>
                {canCreate && (
                  <Button onClick={openAddDialog} className="gap-2 shadow-md" size="lg">
                    <Plus className="w-5 h-5" />
                    إضافة عميل جديد
                  </Button>
                )}
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الاسم</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">الهاتف</TableHead>
                      <TableHead className="text-right hidden md:table-cell">العنوان</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">الرقم الضريبي</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${c.is_active ? 'bg-primary/10' : 'bg-muted'}`}>
                              <span className={`text-sm font-bold ${c.is_active ? 'text-primary' : 'text-muted-foreground'}`}>
                                {c.name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <span className="font-medium text-sm">{c.name}</span>
                              <span className="block text-xs text-muted-foreground sm:hidden">
                                {c.phone || '—'}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-sm">
                          {c.phone || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-sm max-w-[200px] truncate">
                          {c.address || '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                          {c.tax_number || '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={
                              c.is_active
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }
                          >
                            {c.is_active ? 'نشط' : 'معطل'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(c)}
                                title="تعديل"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${c.is_active ? 'text-destructive hover:text-destructive' : 'text-emerald-600 hover:text-emerald-600'}`}
                                onClick={() => {
                                  setTogglingCustomer(c);
                                  setToggleDialogOpen(true);
                                }}
                                title={c.is_active ? 'تعطيل' : 'تفعيل'}
                              >
                                {c.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => openStatement(c)}
                              title="كشف حساب"
                            >
                              <FileText className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <DataTablePagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                label="عميل"
              />
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Add/Edit Customer Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingCustomer ? 'تعديل العميل' : 'إضافة عميل جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="customer-name">اسم العميل *</Label>
              <Input
                id="customer-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: شركة النور للتجارة"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-phone" className="flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                رقم الهاتف
              </Label>
              <Input
                id="customer-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="مثال: 01012345678"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-address" className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                العنوان
              </Label>
              <Input
                id="customer-address"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="مثال: القاهرة - المعادي"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-tax" className="flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                الرقم الضريبي
              </Label>
              <Input
                id="customer-tax"
                value={form.tax_number}
                onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                placeholder="مثال: 300-123-456789"
                dir="ltr"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="customer-active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label htmlFor="customer-active">عميل نشط</Label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-notes">ملاحظات</Label>
              <Textarea
                id="customer-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="أي ملاحظات إضافية..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
              {editingCustomer ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Active Confirmation */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {togglingCustomer?.is_active ? 'تعطيل العميل' : 'تفعيل العميل'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingCustomer?.is_active
                ? `هل أنت متأكد من تعطيل العميل "${togglingCustomer?.name}"؟ لن يكون متاحاً للاستخدام في الفواتير.`
                : `هل أنت متأكد من تفعيل العميل "${togglingCustomer?.name}"؟`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTogglingCustomer(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              className={togglingCustomer?.is_active ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {togglingCustomer?.is_active ? 'تعطيل' : 'تفعيل'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Customer Account Statement Dialog */}
      <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              كشف حساب: {statementCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-180px)] pl-1">
            {loadingStatement ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-6 py-4">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">إجمالي الفواتير</p>
                    <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(statementData.totalInvoiced)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-blue-600 dark:text-blue-400">إجمالي المدفوعات</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{formatCurrency(statementData.totalPaid)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400">إجمالي المرتجعات</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-300">{formatCurrency(statementData.totalReturned)}</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${statementData.balance > 0 ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-800'}`}>
                    <p className={`text-xs ${statementData.balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'}`}>الرصيد المتبقي</p>
                    <p className={`text-lg font-bold ${statementData.balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-gray-700 dark:text-gray-300'}`}>{formatCurrency(statementData.balance)}</p>
                  </div>
                </div>

                {/* Invoices */}
                {statementData.invoices.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">الفواتير ({statementData.invoices.length})</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right text-xs">رقم الفاتورة</TableHead>
                            <TableHead className="text-right text-xs">الفرع</TableHead>
                            <TableHead className="text-right text-xs hidden sm:table-cell">التاريخ</TableHead>
                            <TableHead className="text-right text-xs">المبلغ</TableHead>
                            <TableHead className="text-center text-xs">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statementData.invoices.map((inv: any) => (
                            <TableRow key={inv.id}>
                              <TableCell className="font-medium text-xs">{inv.invoice_number}</TableCell>
                              <TableCell className="text-xs">{inv.branches?.name || '—'}</TableCell>
                              <TableCell className="text-xs hidden sm:table-cell">{formatDate(inv.invoice_date)}</TableCell>
                              <TableCell className="font-semibold text-xs">{formatCurrency(Number(inv.total))}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className={`text-[9px] ${
                                  inv.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                                  inv.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                                  inv.status === 'fully_returned' ? 'bg-gray-100 text-gray-800' :
                                  'bg-amber-100 text-amber-800'
                                }`}>
                                  {inv.status === 'active' ? 'نشطة' :
                                   inv.status === 'cancelled' ? 'ملغاة' :
                                   inv.status === 'fully_returned' ? 'مرتجعة' : 'مرتجع جزئياً'}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {/* Returns */}
                {statementData.returns.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">المرتجعات ({statementData.returns.length})</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right text-xs">رقم المرتجع</TableHead>
                            <TableHead className="text-right text-xs hidden sm:table-cell">الفرع</TableHead>
                            <TableHead className="text-right text-xs hidden sm:table-cell">التاريخ</TableHead>
                            <TableHead className="text-right text-xs">المبلغ</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {statementData.returns.map((ret: any) => (
                            <TableRow key={ret.id}>
                              <TableCell className="font-medium text-xs">{ret.return_number}</TableCell>
                              <TableCell className="text-xs hidden sm:table-cell">{ret.branches?.name || '—'}</TableCell>
                              <TableCell className="text-xs hidden sm:table-cell">{formatDate(ret.return_date)}</TableCell>
                              <TableCell className="font-semibold text-xs text-red-600">{formatCurrency(Number(ret.total))}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {statementData.invoices.length === 0 && statementData.returns.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    لا توجد حركات لهذا العميل
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
