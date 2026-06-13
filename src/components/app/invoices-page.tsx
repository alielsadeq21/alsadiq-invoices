'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Invoice, Branch } from '@/lib/types';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';
import { generateInvoiceDocument, generateThermalDocument } from '@/lib/invoice-template';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Search,
  Plus,
  Eye,
  Copy,
  XCircle,
  FileText,
  Printer,
  Receipt,
  Calendar,
  Building2,
  DollarSign,
  Hash,
} from 'lucide-react';
import DataTablePagination from '@/components/ui/data-table-pagination';
import { toast } from 'sonner';
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
import { Textarea } from '@/components/ui/textarea';

const PAGE_SIZE = 10;

/** Map invoice status to a right-border accent color for mobile cards */
function getStatusAccent(status: string) {
  const map: Record<string, string> = {
    active: 'border-r-emerald-500',
    cancelled: 'border-r-red-500',
    partially_returned: 'border-r-amber-500',
    fully_returned: 'border-r-gray-400',
  };
  return map[status] || 'border-r-gray-300';
}

/** Map invoice status to gradient background for status badges */
function getStatusGradient(status: string) {
  const map: Record<string, string> = {
    active: 'bg-gradient-to-l from-emerald-500 to-emerald-600 text-white shadow-emerald-200 dark:shadow-emerald-900/30',
    cancelled: 'bg-gradient-to-l from-red-500 to-red-600 text-white shadow-red-200 dark:shadow-red-900/30',
    partially_returned: 'bg-gradient-to-l from-amber-500 to-amber-600 text-white shadow-amber-200 dark:shadow-amber-900/30',
    fully_returned: 'bg-gradient-to-l from-gray-400 to-gray-500 text-white shadow-gray-200 dark:shadow-gray-900/30',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
}

/** Map invoice status to gradient for icon circle */
function getStatusIconGradient(status: string) {
  const map: Record<string, string> = {
    active: 'from-emerald-400 to-emerald-600',
    cancelled: 'from-red-400 to-red-600',
    partially_returned: 'from-amber-400 to-amber-600',
    fully_returned: 'from-gray-300 to-gray-500',
  };
  return map[status] || 'from-gray-300 to-gray-400';
}

export default function InvoicesPage() {
  const { navigateTo, user, isAdmin, hasPermission } = useAppStore();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingInvoice, setCancellingInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const loadBranches = async () => {
    let query = supabase.from('branches').select('*').order('name');
    if (!isAdmin && user?.branch_id) query = query.eq('id', user.branch_id);
    const { data } = await query;
    if (data) setBranches(data as Branch[]);
  };

  const loadInvoices = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('invoices')
        .select('*, branches(name), customers(name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`invoice_number.ilike.%${search}%,branches.name.ilike.%${search}%`);
      }
      if (dateFrom) {
        query = query.gte('invoice_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('invoice_date', dateTo);
      }
      if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter);
      }
      // Branch user: always filter by their branch
      if (!isAdmin && user?.branch_id) {
        query = query.eq('branch_id', user.branch_id);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (!error && data) {
        setInvoices(data as unknown as Invoice[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [page, search, dateFrom, dateTo, branchFilter, statusFilter]);

  const handleCancel = async () => {
    if (!cancellingInvoice) return;
    if (!cancelReason.trim()) {
      toast.error('يرجى إدخال سبب الإلغاء');
      return;
    }

    try {
      const { error } = await supabase
        .from('invoices')
        .update({
          status: 'cancelled',
          cancel_reason: cancelReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cancellingInvoice.id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        action: 'cancel_invoice',
        details: { invoice_number: cancellingInvoice.invoice_number, reason: cancelReason },
      });

      toast.success('تم إلغاء الفاتورة');
      setCancelDialogOpen(false);
      setCancellingInvoice(null);
      setCancelReason('');
      loadInvoices();
    } catch (err) {
      toast.error('حدث خطأ أثناء إلغاء الفاتورة');
    }
  };

  const handleDuplicate = async (invoice: Invoice) => {
    try {
      // Load original items
      const { data: origItems } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      // Generate new number
      const year = new Date().getFullYear();
      const { data: lastInv } = await supabase
        .from('invoices')
        .select('invoice_number')
        .like('invoice_number', `INV-${year}-%`)
        .order('invoice_number', { ascending: false })
        .limit(1);

      let lastNum = 0;
      if (lastInv && lastInv.length > 0) {
        const parts = lastInv[0].invoice_number.split('-');
        lastNum = parseInt(parts[parts.length - 1]) || 0;
      }
      const newNumber = `INV-${year}-${(lastNum + 1).toString().padStart(4, '0')}`;

      const { data: newInv, error } = await supabase
        .from('invoices')
        .insert({
          invoice_number: newNumber,
          branch_id: invoice.branch_id,
          invoice_date: new Date().toISOString().split('T')[0],
          subtotal: invoice.subtotal,
          tax_rate: invoice.tax_rate,
          tax_amount: invoice.tax_amount,
          total: invoice.total,
          notes: invoice.notes,
        })
        .select('id')
        .single();

      if (error) throw error;

      if (origItems && origItems.length > 0) {
        const newItems = origItems.map((item) => ({
          invoice_id: newInv.id,
          item_name: item.item_name,
          quantity: item.quantity,
          unit_count: item.unit_count || 1,
          unit_price: item.unit_price,
          total_price: item.total_price,
        }));
        await supabase.from('invoice_items').insert(newItems);
      }

      toast.success('تم تكرار الفاتورة بنجاح');
      navigateTo('invoice-detail', { id: newInv.id });
    } catch (err) {
      toast.error('حدث خطأ أثناء تكرار الفاتورة');
    }
  };

  const handleQuickPrint = async (invoice: Invoice, type: 'a4' | 'thermal') => {
    try {
      // Load invoice items
      const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id);

      // Load branch data (full details for invoices)
      const { data: branch } = await supabase
        .from('branches')
        .select('*')
        .eq('id', invoice.branch_id)
        .single();

      const { settings } = useAppStore.getState();

      // Load customer name if invoice has customer_id
      let quickCustomerName = '';
      if ((invoice as any).customer_id) {
        const { data: customer } = await supabase
          .from('customers')
          .select('name')
          .eq('id', (invoice as any).customer_id)
          .single();
        if (customer) quickCustomerName = customer.name;
      }

      const docData = {
        invoice,
        items: items || [],
        branchName: branch?.name || '',
        branch: branch || null,
        customerName: quickCustomerName,
        settings,
        userFullName: useAppStore.getState().user?.full_name || 'علي محمد الصادق',
      };

      const htmlDoc = type === 'a4'
        ? generateInvoiceDocument(docData)
        : generateThermalDocument(docData);

      const windowFeatures = type === 'a4'
        ? 'width=800,height=1000'
        : 'width=340,height=800';

      const printWindow = window.open('', '_blank', windowFeatures);
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
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الطباعة');
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ─── Header ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="sm:flex-row sm:items-center sm:justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Icon in gradient circle */}
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 shrink-0">
            <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">الفواتير</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="mt-0.5">
              <Hash className="w-3.5 h-3.5 text-muted-foreground" />
              <p className="text-muted-foreground text-xs sm:text-sm">
                إجمالي <span className="font-bold text-foreground">{totalCount}</span> فاتورة
              </p>
            </div>
          </div>
        </div>
        {hasPermission('invoices', 'create') && (
          <Button
            onClick={() => navigateTo('invoice-form')}
            className="gap-2 w-full sm:w-auto bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-200 dark:shadow-emerald-900/30 border-0 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            فاتورة جديدة
          </Button>
        )}
      </div>

      {/* ─── Filters ─── */}
      <Card className="border-0 shadow-md overflow-hidden relative">
        {/* Gradient top border accent */}
        <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
        <CardContent className="p-3 sm:p-4 pt-4 sm:pt-5">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)' }} className="sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
            <div className="relative col-span-2 lg:col-span-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الفاتورة..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pr-10 h-9"
              />
            </div>
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">من تاريخ</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-9 text-xs sm:text-sm"
              />
            </div>
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">إلى تاريخ</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-9 text-xs sm:text-sm"
              />
            </div>
            {isAdmin && (
              <div>
                <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">الفرع</Label>
                <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm">
                    <SelectValue />
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
            <div>
              <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block">الحالة</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9 text-xs sm:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="active">نشطة</SelectItem>
                  <SelectItem value="cancelled">ملغاة</SelectItem>
                  <SelectItem value="partially_returned">مرتجع جزئياً</SelectItem>
                  <SelectItem value="fully_returned">مرتجع كلياً</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── Invoices List ─── */}
      {loading ? (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          </CardContent>
        </Card>
      ) : invoices.length === 0 ? (
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="py-20 px-4">
              {/* Gradient icon circle */}
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-5 shadow-xl shadow-emerald-200 dark:shadow-emerald-900/30">
                <FileText className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">لا توجد فواتير</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                لم يتم إنشاء أي فواتير بعد. ابدأ بإنشاء أول فاتورة مبيعات لتتبع عمليات البيع والتسليم.
              </p>
              <Button
                onClick={() => navigateTo('invoice-form')}
                className="gap-2 shadow-lg bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white border-0 shadow-emerald-200 dark:shadow-emerald-900/30 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                size="lg"
              >
                <Plus className="w-5 h-5" />
                إنشاء فاتورة جديدة
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Mobile Card Layout ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="sm:hidden">
            {invoices.map((invoice) => (
              <Card
                key={invoice.id}
                className={`border-0 shadow-md cursor-pointer transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] overflow-hidden border-r-4 ${getStatusAccent(invoice.status)}`}
                onClick={() => navigateTo('invoice-detail', { id: invoice.id })}
              >
                <CardContent className="p-4">
                  {/* Top row: Invoice number + status */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }} className="mb-3">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                      {/* Invoice number icon in gradient circle */}
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${getStatusIconGradient(invoice.status)} flex items-center justify-center shadow-sm shrink-0`}>
                        <FileText className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm tracking-tight">{invoice.invoice_number}</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="mt-0.5">
                          <Building2 className="w-3 h-3 text-muted-foreground" />
                          <p className="text-[11px] text-muted-foreground">
                            {(invoice as { branches?: { name: string } }).branches?.name || ''}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Gradient status badge */}
                    <Badge
                      className={`text-[10px] font-medium shadow-sm border-0 px-2.5 py-0.5 ${getStatusGradient(invoice.status)}`}
                    >
                      {getStatusLabel(invoice.status)}
                    </Badge>
                  </div>

                  {/* Info row: Date + Total */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="mt-2 pt-2.5 border-t border-dashed">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(invoice.invoice_date)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="font-bold text-sm">{formatCurrency(invoice.total)}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="mt-3 pt-2.5 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8 text-[11px] gap-1.5 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 dark:hover:bg-emerald-950 dark:hover:text-emerald-400 transition-colors"
                      onClick={(e) => { e.stopPropagation(); navigateTo('invoice-detail', { id: invoice.id }); }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      عرض
                    </Button>
                    {hasPermission('invoices', 'print') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-[11px] gap-1.5 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 dark:hover:bg-blue-950 dark:hover:text-blue-400 transition-colors"
                        onClick={(e) => { e.stopPropagation(); handleQuickPrint(invoice, 'a4'); }}
                      >
                        <Printer className="w-3.5 h-3.5" />
                        طباعة
                      </Button>
                    )}
                    {invoice.status === 'active' && hasPermission('invoices', 'delete') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 h-8 text-[11px] gap-1.5 text-destructive hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:hover:bg-red-950 dark:hover:text-red-400 border-destructive/30 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCancellingInvoice(invoice);
                          setCancelDialogOpen(true);
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        إلغاء
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ─── Desktop Table Layout ─── */}
          <Card className="border-0 shadow-md overflow-hidden hidden sm:block">
            {/* Gradient accent bar at top */}
            <div className="h-1 bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">رقم الفاتورة</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">الفرع</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider hidden md:table-cell">العميل</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider hidden md:table-cell">التاريخ</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">الإجمالي</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">الحالة</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">الأصناف</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow
                        key={invoice.id}
                        className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
                        onClick={() => navigateTo('invoice-detail', { id: invoice.id })}
                      >
                        <TableCell>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${getStatusIconGradient(invoice.status)} flex items-center justify-center shadow-sm shrink-0`}>
                              <FileText className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="font-semibold text-sm">{invoice.invoice_number}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm">{(invoice as { branches?: { name: string } }).branches?.name || '—'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm">
                          {(invoice as any).customers?.name || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-sm">{formatDate(invoice.invoice_date)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-bold text-sm">{formatCurrency(invoice.total)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Badge
                            className={`text-[10px] font-medium shadow-sm border-0 px-2.5 py-0.5 ${getStatusGradient(invoice.status)}`}
                          >
                            {getStatusLabel(invoice.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell text-sm">
                          {invoice.items?.length || '—'}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.125rem' }}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950 dark:hover:text-emerald-400 transition-colors"
                              onClick={() => navigateTo('invoice-detail', { id: invoice.id })}
                              title="عرض"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {hasPermission('invoices', 'print') && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-blue-950 dark:hover:text-blue-400 transition-colors"
                                  onClick={() => handleQuickPrint(invoice, 'a4')}
                                  title="طباعة A4"
                                >
                                  <Printer className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 hover:bg-purple-50 hover:text-purple-700 dark:hover:bg-purple-950 dark:hover:text-purple-400 transition-colors"
                                  onClick={() => handleQuickPrint(invoice, 'thermal')}
                                  title="طباعة حرارية"
                                >
                                  <Receipt className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {invoice.status === 'active' && (
                              <>
                                {hasPermission('invoices', 'create') && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950 dark:hover:text-amber-400 transition-colors"
                                    onClick={() => handleDuplicate(invoice)}
                                    title="تكرار"
                                  >
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                )}
                                {hasPermission('invoices', 'delete') && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950 dark:hover:text-red-400 transition-colors"
                                    onClick={() => {
                                      setCancellingInvoice(invoice);
                                      setCancelDialogOpen(true);
                                    }}
                                    title="إلغاء"
                                  >
                                    <XCircle className="w-4 h-4" />
                                  </Button>
                                )}
                              </>
                            )}
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
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                label="فاتورة"
              />
            </CardContent>
          </Card>

          {/* ─── Mobile Pagination ─── */}
          <div className="sm:hidden">
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-0.5 bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
              <DataTablePagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
                label="فاتورة"
              />
            </Card>
          </div>
        </>
      )}

      {/* Cancel Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الفاتورة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء الفاتورة {cancellingInvoice?.invoice_number}؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>سبب الإلغاء *</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="أدخل سبب إلغاء الفاتورة..."
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setCancelReason(''); setCancellingInvoice(null); }}>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive hover:bg-destructive/90">
              إلغاء الفاتورة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
