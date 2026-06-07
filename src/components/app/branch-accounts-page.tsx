'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Branch, BranchAccount } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { generateAccountStatementDocument } from '@/lib/account-statement-template';
import type { StatementTransaction } from '@/lib/account-statement-template';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Wallet,
  Building2,
  ArrowUpLeft,
  Printer,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  Search,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';

export default function BranchAccountsPage() {
  const { navigateTo, settings } = useAppStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<BranchAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState('');

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [transactions, setTransactions] = useState<StatementTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadBranchAccounts();
  }, []);

  const loadBranchAccounts = async () => {
    setLoading(true);
    try {
      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .order('name');

      if (!branchData) return;
      setBranches(branchData as Branch[]);

      const accountPromises = branchData.map(async (branch) => {
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total')
          .eq('branch_id', branch.id)
          .eq('status', 'active');

        const totalInvoiced = (invoices || []).reduce((sum, inv) => sum + Number(inv.total), 0);

        const { data: returns } = await supabase
          .from('returns')
          .select('total')
          .eq('branch_id', branch.id);

        const totalReturned = (returns || []).reduce((sum, ret) => sum + Number(ret.total), 0);

        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('branch_id', branch.id);

        const totalPaid = (payments || []).reduce((sum, pay) => sum + Number(pay.amount), 0);

        return {
          branch_id: branch.id,
          branch_name: branch.name,
          total_invoiced: totalInvoiced,
          total_returned: totalReturned,
          total_paid: totalPaid,
          balance: totalInvoiced - totalReturned - totalPaid,
        };
      });

      const accountsData = await Promise.all(accountPromises);
      setAccounts(accountsData.sort((a, b) => b.balance - a.balance));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openBranchDetail = async (branch: Branch) => {
    setSelectedBranch(branch);
    setDetailDialogOpen(true);
    setDetailLoading(true);
    setDateFrom('');
    setDateTo('');

    try {
      await loadBranchTransactions(branch.id);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadBranchTransactions = async (branchId: string) => {
    const txns: StatementTransaction[] = [];

    // Load invoices
    let invoiceQuery = supabase
      .from('invoices')
      .select('invoice_number, total, invoice_date, status')
      .eq('branch_id', branchId)
      .eq('status', 'active');

    if (dateFrom) invoiceQuery = invoiceQuery.gte('invoice_date', dateFrom);
    if (dateTo) invoiceQuery = invoiceQuery.lte('invoice_date', dateTo);

    const { data: invoices } = await invoiceQuery.order('invoice_date', { ascending: true });

    (invoices || []).forEach((inv) => {
      txns.push({
        type: 'invoice',
        number: inv.invoice_number,
        date: inv.invoice_date,
        debit: Number(inv.total),
        credit: 0,
        notes: 'فاتورة صرف',
      });
    });

    // Load returns
    let returnQuery = supabase
      .from('returns')
      .select('return_number, total, return_date')
      .eq('branch_id', branchId);

    if (dateFrom) returnQuery = returnQuery.gte('return_date', dateFrom);
    if (dateTo) returnQuery = returnQuery.lte('return_date', dateTo);

    const { data: returns } = await returnQuery.order('return_date', { ascending: true });

    (returns || []).forEach((ret) => {
      txns.push({
        type: 'return',
        number: ret.return_number,
        date: ret.return_date,
        debit: 0,
        credit: Number(ret.total),
        notes: 'مرتجع',
      });
    });

    // Load payments
    let paymentQuery = supabase
      .from('payments')
      .select('payment_number, amount, payment_date, payment_method')
      .eq('branch_id', branchId);

    if (dateFrom) paymentQuery = paymentQuery.gte('payment_date', dateFrom);
    if (dateTo) paymentQuery = paymentQuery.lte('payment_date', dateTo);

    const { data: payments } = await paymentQuery.order('payment_date', { ascending: true });

    const methodLabels: Record<string, string> = {
      cash: 'كاش',
      bank_transfer: 'تحويل بنكي',
      cheque: 'شيك',
    };

    (payments || []).forEach((pay) => {
      txns.push({
        type: 'payment',
        number: pay.payment_number,
        date: pay.payment_date,
        debit: 0,
        credit: Number(pay.amount),
        notes: `دفعة (${methodLabels[pay.payment_method] || pay.payment_method})`,
      });
    });

    // Sort by date ascending for running balance
    txns.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    setTransactions(txns);
  };

  const applyDateFilter = async () => {
    if (!selectedBranch) return;
    setDetailLoading(true);
    try {
      await loadBranchTransactions(selectedBranch.id);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const clearDateFilter = async () => {
    setDateFrom('');
    setDateTo('');
    if (!selectedBranch) return;
    setDetailLoading(true);
    try {
      await loadBranchTransactions(selectedBranch.id);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  // Compute detail totals
  const detailTotalInvoiced = transactions.filter(t => t.type === 'invoice').reduce((s, t) => s + t.debit, 0);
  const detailTotalReturned = transactions.filter(t => t.type === 'return').reduce((s, t) => s + t.credit, 0);
  const detailTotalPaid = transactions.filter(t => t.type === 'payment').reduce((s, t) => s + t.credit, 0);
  const detailBalance = detailTotalInvoiced - detailTotalReturned - detailTotalPaid;

  const totalInvoiced = accounts.reduce((s, a) => s + a.total_invoiced, 0);
  const totalReturned = accounts.reduce((s, a) => s + a.total_returned, 0);
  const totalPaid = accounts.reduce((s, a) => s + a.total_paid, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const selectedAccount = accounts.find((a) => a.branch_id === selectedBranch?.id);

  // Filter accounts by search
  const filteredAccounts = accounts.filter(a =>
    a.branch_name.includes(searchFilter)
  );

  // Print account statement
  const handlePrintStatement = () => {
    if (!selectedBranch) return;

    const htmlDoc = generateAccountStatementDocument({
      branchName: selectedBranch.name,
      branchAddress: selectedBranch.address,
      branchPhone: selectedBranch.phone,
      settings,
      transactions,
      totalInvoiced: detailTotalInvoiced,
      totalReturned: detailTotalReturned,
      totalPaid: detailTotalPaid,
      balance: detailBalance,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
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

  // Export account statement as PDF
  const handleExportPDF = async () => {
    if (!selectedBranch) return;
    toast.info('جاري إنشاء ملف PDF...');

    let iframe: HTMLIFrameElement | null = null;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const htmlDoc = generateAccountStatementDocument({
        branchName: selectedBranch.name,
        branchAddress: selectedBranch.address,
        branchPhone: selectedBranch.phone,
        settings,
        transactions,
        totalInvoiced: detailTotalInvoiced,
        totalReturned: detailTotalReturned,
        totalPaid: detailTotalPaid,
        balance: detailBalance,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
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
          const container = iframeDoc.querySelector('.stmt-container');
          if (container) {
            setTimeout(resolve, 2500);
          } else {
            setTimeout(checkReady, 500);
          }
        };
        checkReady();
      });

      const stmtEl = iframeDoc.querySelector('.stmt-container') as HTMLElement;
      if (!stmtEl) {
        if (iframe.parentNode) document.body.removeChild(iframe);
        toast.error('حدث خطأ أثناء إنشاء ملف PDF');
        return;
      }

      const canvas = await html2canvas(stmtEl, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        width: stmtEl.scrollWidth,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, Math.min(pdfHeight, pdf.internal.pageSize.getHeight()));
      pdf.save(`كشف_حساب_${selectedBranch.name}.pdf`);

      if (iframe.parentNode) document.body.removeChild(iframe);
      toast.success('تم تحميل ملف PDF');
    } catch (err) {
      console.error(err);
      if (iframe?.parentNode) document.body.removeChild(iframe);
      toast.error('حدث خطأ أثناء إنشاء ملف PDF');
    }
  };

  // Type badge component
  const TypeBadge = ({ type, notes }: { type: string; notes: string }) => {
    const config: Record<string, { label: string; className: string }> = {
      invoice: { label: 'فاتورة', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
      return: { label: 'مرتجع', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
      payment: { label: 'دفعة', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
    };
    const c = config[type] || { label: notes, className: 'bg-gray-100 text-gray-800' };
    return (
      <Badge variant="secondary" className={`text-[10px] ${c.className}`}>
        {c.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">كشف حساب الفروع</h1>
          <p className="text-muted-foreground text-sm mt-1">
            متابعة أرصدة الفروع والديون المستحقة
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <p className="text-sm text-muted-foreground">إجمالي الفواتير</p>
            </div>
            <p className="text-xl font-bold text-emerald-600">{formatCurrency(totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <TrendingDown className="w-4 h-4 text-red-600" />
              <p className="text-sm text-muted-foreground">إجمالي المرتجعات</p>
            </div>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalReturned)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Wallet className="w-4 h-4 text-blue-600" />
              <p className="text-sm text-muted-foreground">إجمالي المدفوعات</p>
            </div>
            <p className="text-xl font-bold text-blue-600">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-gradient-to-l from-primary to-emerald-700 text-primary-foreground">
          <CardContent className="p-4 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-primary-foreground/80" />
              <p className="text-sm text-primary-foreground/80">إجمالي المتبقي</p>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث باسم الفرع..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Branches Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <Wallet className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد بيانات</h3>
              <p className="text-muted-foreground text-sm text-center max-w-xs">
                لم يتم تسجيل أي فواتير أو دفعات بعد.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الفرع</TableHead>
                    <TableHead className="text-right">إجمالي الفواتير</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">إجمالي المرتجعات</TableHead>
                    <TableHead className="text-right hidden md:table-cell">إجمالي المدفوعات</TableHead>
                    <TableHead className="text-right">المتبقي</TableHead>
                    <TableHead className="text-center">كشف حساب</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((account) => (
                    <TableRow key={account.branch_id} className="cursor-pointer hover:bg-muted/50" onClick={() => {
                      const branch = branches.find(b => b.id === account.branch_id);
                      if (branch) openBranchDetail(branch);
                    }}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium">{account.branch_name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold">{formatCurrency(account.total_invoiced)}</TableCell>
                      <TableCell className="hidden sm:table-cell text-red-600">{formatCurrency(account.total_returned)}</TableCell>
                      <TableCell className="hidden md:table-cell text-blue-600">{formatCurrency(account.total_paid)}</TableCell>
                      <TableCell>
                        <span className={`font-bold ${account.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {formatCurrency(account.balance)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            const branch = branches.find(b => b.id === account.branch_id);
                            if (branch) openBranchDetail(branch);
                          }}
                          title="كشف حساب مفصل"
                        >
                          <ArrowUpLeft className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Branch Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              كشف حساب: {selectedBranch?.name}
            </DialogTitle>
          </DialogHeader>

          {/* Summary Cards */}
          {selectedAccount && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">الفواتير</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(detailTotalInvoiced)}</p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">المرتجعات</p>
                <p className="text-sm font-bold text-red-600">{formatCurrency(detailTotalReturned)}</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">المدفوعات</p>
                <p className="text-sm font-bold text-blue-600">{formatCurrency(detailTotalPaid)}</p>
              </div>
              <div className={`p-3 rounded-lg text-center ${detailBalance > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                <p className="text-[10px] text-muted-foreground">المتبقي</p>
                <p className={`text-sm font-bold ${detailBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatCurrency(detailBalance)}
                </p>
              </div>
            </div>
          )}

          {/* Date Filter & Actions */}
          <div className="flex flex-col sm:flex-row items-end gap-3 mb-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex-1 grid grid-cols-2 gap-2 w-full">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={applyDateFilter} className="gap-1 flex-1 sm:flex-none">
                <Calendar className="w-3.5 h-3.5" />
                تطبيق
              </Button>
              <Button variant="ghost" size="sm" onClick={clearDateFilter} className="flex-1 sm:flex-none">
                مسح
              </Button>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button variant="outline" size="sm" onClick={handlePrintStatement} className="gap-1 flex-1 sm:flex-none">
                <Printer className="w-3.5 h-3.5" />
                طباعة
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1 flex-1 sm:flex-none">
                <Download className="w-3.5 h-3.5" />
                PDF
              </Button>
            </div>
          </div>

          {/* Transactions Table with Running Balance */}
          {detailLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              جاري التحميل...
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right">الرقم</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                    <TableHead className="text-right">مدين (عليه)</TableHead>
                    <TableHead className="text-right">دائن (له)</TableHead>
                    <TableHead className="text-right hidden md:table-cell">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    let running = 0;
                    return transactions.map((txn, index) => {
                      running += txn.debit - txn.credit;
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <TypeBadge type={txn.type} notes={txn.notes} />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{txn.number}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{formatDate(txn.date)}</TableCell>
                          <TableCell className="font-semibold text-red-600">
                            {txn.debit > 0 ? formatCurrency(txn.debit) : '—'}
                          </TableCell>
                          <TableCell className="font-semibold text-emerald-600">
                            {txn.credit > 0 ? formatCurrency(txn.credit) : '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell font-bold text-sm">
                            {formatCurrency(running)}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        لا توجد حركات على هذا الحساب
                      </TableCell>
                    </TableRow>
                  )}
                  {transactions.length > 0 && (
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={3} className="text-center">الإجمالي</TableCell>
                      <TableCell className="text-red-600">{formatCurrency(detailTotalInvoiced)}</TableCell>
                      <TableCell className="text-emerald-600">{formatCurrency(detailTotalReturned + detailTotalPaid)}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatCurrency(detailBalance)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
