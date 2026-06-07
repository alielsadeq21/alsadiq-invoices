'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Branch, BranchAccount } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  TrendingUp,
  TrendingDown,
  ArrowUpLeft,
  Building2,
} from 'lucide-react';

interface AccountTransaction {
  type: 'invoice' | 'return' | 'payment';
  number: string;
  date: string;
  debit: number;  // Amount owed (invoices)
  credit: number; // Amount paid (returns + payments)
  notes: string;
}

export default function BranchAccountsPage() {
  const { navigateTo } = useAppStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [accounts, setAccounts] = useState<BranchAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [transactions, setTransactions] = useState<AccountTransaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    loadBranchAccounts();
  }, []);

  const loadBranchAccounts = async () => {
    setLoading(true);
    try {
      // Load all branches
      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .order('name');

      if (!branchData) return;
      setBranches(branchData as Branch[]);

      // Calculate account for each branch
      const accountPromises = branchData.map(async (branch) => {
        // Total active invoices
        const { data: invoices } = await supabase
          .from('invoices')
          .select('total')
          .eq('branch_id', branch.id)
          .eq('status', 'active');

        const totalInvoiced = (invoices || []).reduce((sum, inv) => sum + Number(inv.total), 0);

        // Total returns
        const { data: returns } = await supabase
          .from('returns')
          .select('total')
          .eq('branch_id', branch.id);

        const totalReturned = (returns || []).reduce((sum, ret) => sum + Number(ret.total), 0);

        // Total payments
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

    try {
      const txns: AccountTransaction[] = [];

      // Load invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select('invoice_number, total, invoice_date, status')
        .eq('branch_id', branch.id)
        .eq('status', 'active')
        .order('invoice_date', { ascending: false });

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
      const { data: returns } = await supabase
        .from('returns')
        .select('return_number, total, return_date')
        .eq('branch_id', branch.id)
        .order('return_date', { ascending: false });

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
      const { data: payments } = await supabase
        .from('payments')
        .select('payment_number, amount, payment_date, payment_method')
        .eq('branch_id', branch.id)
        .order('payment_date', { ascending: false });

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

      // Sort by date descending
      txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(txns);
    } catch (err) {
      console.error(err);
    } finally {
      setDetailLoading(false);
    }
  };

  const totalInvoiced = accounts.reduce((s, a) => s + a.total_invoiced, 0);
  const totalReturned = accounts.reduce((s, a) => s + a.total_returned, 0);
  const totalPaid = accounts.reduce((s, a) => s + a.total_paid, 0);
  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const selectedAccount = accounts.find((a) => a.branch_id === selectedBranch?.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">كشف حساب الفروع</h1>
        <p className="text-muted-foreground text-sm mt-1">
          متابعة أرصدة الفروع والديون المستحقة
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي الفواتير</p>
            <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي المرتجعات</p>
            <p className="text-xl font-bold text-red-600 mt-1">{formatCurrency(totalReturned)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-muted-foreground">إجمالي المدفوعات</p>
            <p className="text-xl font-bold text-blue-600 mt-1">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md bg-gradient-to-l from-primary to-emerald-700 text-primary-foreground">
          <CardContent className="p-4 text-center">
            <p className="text-sm text-primary-foreground/80">إجمالي المتبقي</p>
            <p className="text-xl font-bold mt-1">{formatCurrency(totalBalance)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Branches Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : accounts.length === 0 ? (
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
                  {accounts.map((account) => (
                    <TableRow key={account.branch_id}>
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
                          onClick={() => {
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
        <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              كشف حساب: {selectedBranch?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedAccount && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">الفواتير</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(selectedAccount.total_invoiced)}</p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">المرتجعات</p>
                <p className="text-sm font-bold text-red-600">{formatCurrency(selectedAccount.total_returned)}</p>
              </div>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center">
                <p className="text-[10px] text-muted-foreground">المدفوعات</p>
                <p className="text-sm font-bold text-blue-600">{formatCurrency(selectedAccount.total_paid)}</p>
              </div>
              <div className={`p-3 rounded-lg text-center ${selectedAccount.balance > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                <p className="text-[10px] text-muted-foreground">المتبقي</p>
                <p className={`text-sm font-bold ${selectedAccount.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {formatCurrency(selectedAccount.balance)}
                </p>
              </div>
            </div>
          )}

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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((txn, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] ${
                            txn.type === 'invoice'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : txn.type === 'return'
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                          }`}
                        >
                          {txn.notes}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-sm">{txn.number}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">{formatDate(txn.date)}</TableCell>
                      <TableCell className="font-semibold text-red-600">
                        {txn.debit > 0 ? formatCurrency(txn.debit) : '—'}
                      </TableCell>
                      <TableCell className="font-semibold text-emerald-600">
                        {txn.credit > 0 ? formatCurrency(txn.credit) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {transactions.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        لا توجد حركات على هذا الحساب
                      </TableCell>
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
