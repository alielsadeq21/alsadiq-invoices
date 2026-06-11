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
  ChevronRight,
  ChevronLeft,
  Printer,
  Receipt,
} from 'lucide-react';
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

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    loadInvoices();
  }, [page, search, dateFrom, dateTo, branchFilter, statusFilter]);

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

      // Load branch name
      const { data: branch } = await supabase
        .from('branches')
        .select('name')
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">الفواتير</h1>
          <p className="text-muted-foreground text-sm mt-1">
            إجمالي: {totalCount} فاتورة
          </p>
        </div>
        {hasPermission('invoices', 'create') && (
          <Button onClick={() => navigateTo('invoice-form')} className="gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            فاتورة جديدة
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="relative sm:col-span-2 lg:col-span-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="بحث برقم الفاتورة أو الفرع..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="pr-10"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">من تاريخ</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-9"
              />
            </div>
            {isAdmin && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">الفرع</Label>
                <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setPage(1); }}>
                  <SelectTrigger className="h-9">
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
              <Label className="text-xs text-muted-foreground mb-1 block">الحالة</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="h-9">
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

      {/* Invoices Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <FileText className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد فواتير</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                لم يتم إنشاء أي فواتير بعد. ابدأ بإنشاء أول فاتورة صرف لتتبع عمليات البيع والتسليم.
              </p>
              <Button onClick={() => navigateTo('invoice-form')} className="gap-2 shadow-md" size="lg">
                <Plus className="w-5 h-5" />
                إنشاء فاتورة جديدة
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">رقم الفاتورة</TableHead>
                      <TableHead className="text-right hidden sm:table-cell">الفرع</TableHead>
                      <TableHead className="text-right hidden md:table-cell">العميل</TableHead>
                      <TableHead className="text-right hidden md:table-cell">التاريخ</TableHead>
                      <TableHead className="text-right">الإجمالي</TableHead>
                      <TableHead className="text-center">الحالة</TableHead>
                      <TableHead className="text-center hidden lg:table-cell">الأصناف</TableHead>
                      <TableHead className="text-center">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => (
                      <TableRow key={invoice.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigateTo('invoice-detail', { id: invoice.id })}>
                        <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          {(invoice as { branches?: { name: string } }).branches?.name || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {(invoice as any).customers?.name || '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">{formatDate(invoice.invoice_date)}</TableCell>
                        <TableCell className="font-semibold">{formatCurrency(invoice.total)}</TableCell>
                        <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] ${getStatusColor(invoice.status)}`}
                          >
                            {getStatusLabel(invoice.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center hidden lg:table-cell">
                          {invoice.items?.length || '—'}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
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
                                  className="h-8 w-8"
                                  onClick={() => handleQuickPrint(invoice, 'a4')}
                                  title="طباعة A4"
                                >
                                  <Printer className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
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
                                    className="h-8 w-8"
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
                                    className="h-8 w-8 text-destructive"
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

              {/* Pagination */}
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
