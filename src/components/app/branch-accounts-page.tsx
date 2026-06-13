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
  const { navigateTo, settings, user, isAdmin } = useAppStore();
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
      let branchQuery = supabase
        .from('branches')
        .select('*')
        .order('name');
      if (!isAdmin && user?.branch_id) branchQuery = branchQuery.eq('id', user.branch_id);
      const { data: branchData } = await branchQuery;

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
        notes: 'فاتورة مبيعات',
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
      payment: { label: 'دفعة', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' },
    };
    const c = config[type] || { label: notes, className: 'bg-gray-100 text-gray-800' };
    return (
      <Badge variant="secondary" className={`text-[10px] ${c.className}`}>
        {c.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.75rem' }}>
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shadow-lg shadow-primary/25">
            <Wallet className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">كشف حساب الفروع</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
              متابعة أرصدة الفروع والديون المستحقة
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-lg">
          <Building2 className="w-3.5 h-3.5" />
          <span>{filteredAccounts.length} فرع</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* Invoiced Card */}
        <Card className="border-0 shadow-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-emerald-100/50 dark:from-emerald-950/40 dark:via-background dark:to-emerald-900/20" />
          <CardContent className="p-3.5 sm:p-5 relative z-10">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-md shadow-emerald-500/30 group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
              </div>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-1">إجمالي الفواتير</p>
            <p className="text-lg sm:text-2xl font-bold bg-gradient-to-l from-emerald-600 to-emerald-800 bg-clip-text text-transparent">{formatCurrency(totalInvoiced)}</p>
          </CardContent>
        </Card>

        {/* Returned Card */}
        <Card className="border-0 shadow-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-50 via-white to-red-100/50 dark:from-red-950/40 dark:via-background dark:to-red-900/20" />
          <CardContent className="p-3.5 sm:p-5 relative z-10">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-rose-500 to-red-700 flex items-center justify-center shadow-md shadow-rose-500/30 group-hover:scale-110 transition-transform duration-300">
                <TrendingDown className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
              </div>
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-1">إجمالي المرتجعات</p>
            <p className="text-lg sm:text-2xl font-bold bg-gradient-to-l from-rose-600 to-red-700 bg-clip-text text-transparent">{formatCurrency(totalReturned)}</p>
          </CardContent>
        </Card>

        {/* Paid Card */}
        <Card className="border-0 shadow-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group">
          <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-cyan-100/50 dark:from-sky-950/40 dark:via-background dark:to-sky-900/20" />
          <CardContent className="p-3.5 sm:p-5 relative z-10">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-sky-500 to-cyan-700 flex items-center justify-center shadow-md shadow-sky-500/30 group-hover:scale-110 transition-transform duration-300">
                <Wallet className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
              </div>
              <div className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-1">إجمالي المدفوعات</p>
            <p className="text-lg sm:text-2xl font-bold bg-gradient-to-l from-sky-600 to-cyan-700 bg-clip-text text-transparent">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>

        {/* Balance Card */}
        <Card className="border-0 shadow-lg overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl group">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-orange-100/50 dark:from-amber-950/40 dark:via-background dark:to-amber-900/20" />
          <CardContent className="p-3.5 sm:p-5 relative z-10">
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-700 flex items-center justify-center shadow-md shadow-amber-500/30 group-hover:scale-110 transition-transform duration-300">
                <FileText className="w-5 h-5 sm:w-5.5 sm:h-5.5 text-white" />
              </div>
              <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground font-medium mb-1">إجمالي المتبقي</p>
            <p className="text-lg sm:text-2xl font-bold bg-gradient-to-l from-amber-600 to-orange-700 bg-clip-text text-transparent">{formatCurrency(totalBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search / Filters Card */}
      <Card className="border-0 shadow-lg overflow-hidden">
        <div className="h-1 bg-gradient-to-l from-primary via-emerald-500 to-cyan-500" />
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث باسم الفرع..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pr-10 bg-muted/30 border-none focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>
        </CardContent>
      </Card>

      {/* Branches List */}
      {loading ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0">
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">جاري التحميل...</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : filteredAccounts.length === 0 ? (
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary/20 to-emerald-200/30 dark:from-primary/20 dark:to-emerald-800/20 flex items-center justify-center mb-5 shadow-lg">
                <Wallet className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد بيانات</h3>
              <p className="text-muted-foreground text-sm text-center max-w-xs leading-relaxed">
                لم يتم تسجيل أي فواتير أو دفعات بعد.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="flex flex-col gap-3 sm:hidden">
            {filteredAccounts.map((account) => {
              const branch = branches.find(b => b.id === account.branch_id);
              return (
                <Card
                  key={account.branch_id}
                  className="border-0 shadow-lg cursor-pointer active:scale-[0.98] transition-all duration-300 hover:shadow-xl overflow-hidden"
                  onClick={() => { if (branch) openBranchDetail(branch); }}
                >
                  <div className={`h-1 ${account.balance > 0 ? 'bg-gradient-to-l from-amber-400 to-orange-500' : 'bg-gradient-to-l from-emerald-400 to-green-500'}`} />
                  <CardContent className="p-4">
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.625rem' }}>
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shadow-md shadow-primary/20">
                          <Building2 className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm leading-tight">{account.branch_name}</h3>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {account.balance > 0 ? 'رصيد مستحق' : 'لا توجد مستحقات'}
                          </p>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center">
                        <ArrowUpLeft className="w-4 h-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-emerald-600/70 font-medium">الفواتير</p>
                        <p className="font-bold text-emerald-600 text-sm mt-0.5">{formatCurrency(account.total_invoiced)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-rose-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-rose-600/70 font-medium">المرتجعات</p>
                        <p className="font-bold text-rose-600 text-sm mt-0.5">{formatCurrency(account.total_returned)}</p>
                      </div>
                      <div className="bg-gradient-to-br from-sky-50 to-cyan-100/50 dark:from-sky-900/20 dark:to-sky-800/10 rounded-xl p-2.5 text-center">
                        <p className="text-[10px] text-sky-600/70 font-medium">المدفوعات</p>
                        <p className="font-bold text-sky-600 text-sm mt-0.5">{formatCurrency(account.total_paid)}</p>
                      </div>
                      <div className={`rounded-xl p-2.5 text-center ${account.balance > 0 ? 'bg-gradient-to-br from-amber-50 to-orange-100/50 dark:from-amber-900/20 dark:to-amber-800/10' : 'bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10'}`}>
                        <p className={`text-[10px] font-medium ${account.balance > 0 ? 'text-amber-600/70' : 'text-emerald-600/70'}`}>المتبقي</p>
                        <p className={`font-bold text-sm mt-0.5 ${account.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {formatCurrency(account.balance)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 pt-2.5 border-t border-border/50">
                      <button className="w-full flex items-center justify-center gap-1.5 text-xs text-primary font-medium py-1.5 rounded-lg bg-primary/5 hover:bg-primary/10 transition-colors">
                        <FileText className="w-3.5 h-3.5" />
                        عرض كشف الحساب
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Desktop Table Layout */}
          <Card className="border-0 shadow-lg hidden sm:block overflow-hidden">
            <div className="h-1.5 bg-gradient-to-l from-primary via-emerald-500 to-cyan-500" />
            <CardContent className="p-0">
              <div style={{ overflowX: 'auto' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">الفرع</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">إجمالي الفواتير</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider hidden sm:table-cell">إجمالي المرتجعات</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider hidden md:table-cell">إجمالي المدفوعات</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">المتبقي</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">كشف حساب</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAccounts.map((account) => (
                      <TableRow
                        key={account.branch_id}
                        className="cursor-pointer hover:bg-muted/40 transition-colors duration-200 group"
                        onClick={() => {
                          const branch = branches.find(b => b.id === account.branch_id);
                          if (branch) openBranchDetail(branch);
                        }}
                      >
                        <TableCell>
                          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '0.625rem' }}>
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shadow-sm shadow-primary/20 group-hover:scale-105 transition-transform duration-200">
                              <Building2 className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-semibold text-sm">{account.branch_name}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold text-emerald-600">{formatCurrency(account.total_invoiced)}</TableCell>
                        <TableCell className="hidden sm:table-cell font-semibold text-rose-600">{formatCurrency(account.total_returned)}</TableCell>
                        <TableCell className="hidden md:table-cell font-semibold text-sky-600">{formatCurrency(account.total_paid)}</TableCell>
                        <TableCell>
                          <span className={`font-bold inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm ${account.balance > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                            {formatCurrency(account.balance)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-colors duration-200"
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
            </CardContent>
          </Card>
        </>
      )}

      {/* Branch Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] w-[95vw] sm:w-auto p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2.5 text-base sm:text-lg">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-emerald-700 flex items-center justify-center shadow-md shadow-primary/20">
                  <Wallet className="w-4.5 h-4.5 text-white" />
                </div>
                <span>كشف حساب: {selectedBranch?.name}</span>
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-4 sm:px-6" style={{ minHeight: 0 }}>
          {/* Summary Cards */}
          {selectedAccount && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 rounded-xl text-center">
                <p className="text-[9px] sm:text-[10px] text-emerald-600/70 font-medium">الفواتير</p>
                <p className="text-xs sm:text-sm font-bold text-emerald-600 mt-0.5">{formatCurrency(detailTotalInvoiced)}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-rose-50 to-red-100/50 dark:from-red-900/20 dark:to-red-800/10 rounded-xl text-center">
                <p className="text-[9px] sm:text-[10px] text-rose-600/70 font-medium">المرتجعات</p>
                <p className="text-xs sm:text-sm font-bold text-rose-600 mt-0.5">{formatCurrency(detailTotalReturned)}</p>
              </div>
              <div className="p-2.5 sm:p-3 bg-gradient-to-br from-sky-50 to-cyan-100/50 dark:from-sky-900/20 dark:to-sky-800/10 rounded-xl text-center">
                <p className="text-[9px] sm:text-[10px] text-sky-600/70 font-medium">المدفوعات</p>
                <p className="text-xs sm:text-sm font-bold text-sky-600 mt-0.5">{formatCurrency(detailTotalPaid)}</p>
              </div>
              <div className={`p-2.5 sm:p-3 rounded-xl text-center ${detailBalance > 0 ? 'bg-gradient-to-br from-amber-50 to-orange-100/50 dark:from-amber-900/20 dark:to-amber-800/10' : 'bg-gradient-to-br from-emerald-50 to-green-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10'}`}>
                <p className={`text-[9px] sm:text-[10px] font-medium ${detailBalance > 0 ? 'text-amber-600/70' : 'text-emerald-600/70'}`}>المتبقي</p>
                <p className={`text-xs sm:text-sm font-bold mt-0.5 ${detailBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatCurrency(detailBalance)}
                </p>
              </div>
            </div>
          )}

          {/* Date Filter & Actions */}
          <div className="flex flex-col gap-2 sm:gap-3 mb-4 p-3 sm:p-4 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-l from-primary via-emerald-500 to-cyan-500 rounded-full -mt-0.5 mb-1" />
            <div className="grid grid-cols-2 gap-2 w-full">
              <div>
                <label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block font-medium">من تاريخ</label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm bg-background border-border/50" />
              </div>
              <div>
                <label className="text-[10px] sm:text-xs text-muted-foreground mb-1 block font-medium">إلى تاريخ</label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-8 sm:h-9 text-xs sm:text-sm bg-background border-border/50" />
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={applyDateFilter} className="gap-1.5 text-xs h-8 rounded-lg hover:bg-primary/10 hover:text-primary hover:border-primary/30">
                <Calendar className="w-3.5 h-3.5" />
                تطبيق
              </Button>
              <Button variant="ghost" size="sm" onClick={clearDateFilter} className="text-xs h-8 rounded-lg">
                مسح
              </Button>
              <div className="flex gap-2 mr-auto">
                <Button variant="outline" size="sm" onClick={handlePrintStatement} className="gap-1.5 text-xs h-8 rounded-lg hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 dark:hover:bg-emerald-900/20">
                  <Printer className="w-3.5 h-3.5" />
                  طباعة
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportPDF} className="gap-1.5 text-xs h-8 rounded-lg hover:bg-sky-50 hover:text-sky-600 hover:border-sky-300 dark:hover:bg-sky-900/20">
                  <Download className="w-3.5 h-3.5" />
                  PDF
                </Button>
              </div>
            </div>
          </div>

          {/* Transactions Table with Running Balance */}
          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">جاري التحميل...</p>
              </div>
            </div>
          ) : (
            <div className="border rounded-xl overflow-hidden shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-right font-semibold text-xs">البيان</TableHead>
                    <TableHead className="text-right font-semibold text-xs">الرقم</TableHead>
                    <TableHead className="text-right font-semibold text-xs hidden sm:table-cell">التاريخ</TableHead>
                    <TableHead className="text-right font-semibold text-xs">مدين (عليه)</TableHead>
                    <TableHead className="text-right font-semibold text-xs">دائن (له)</TableHead>
                    <TableHead className="text-right font-semibold text-xs hidden md:table-cell">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    let running = 0;
                    return transactions.map((txn, index) => {
                      running += txn.debit - txn.credit;
                      return (
                        <TableRow key={index} className="hover:bg-muted/30 transition-colors duration-150">
                          <TableCell>
                            <TypeBadge type={txn.type} notes={txn.notes} />
                          </TableCell>
                          <TableCell className="font-medium text-sm">{txn.number}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{formatDate(txn.date)}</TableCell>
                          <TableCell className="font-semibold text-rose-600">
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
                    <TableRow className="bg-gradient-to-l from-muted/60 to-muted/30 font-bold">
                      <TableCell colSpan={3} className="text-center text-sm">الإجمالي</TableCell>
                      <TableCell className="text-rose-600">{formatCurrency(detailTotalInvoiced)}</TableCell>
                      <TableCell className="text-emerald-600">{formatCurrency(detailTotalReturned + detailTotalPaid)}</TableCell>
                      <TableCell className="hidden md:table-cell">{formatCurrency(detailBalance)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
