'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Invoice, Return, Payment, Expense, Inventory, InventoryTransaction, Branch, Product } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package,
  Wallet,
  Download,
  Search,
  Calendar,
  ArrowUpDown,
  FileText,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

// ─── Helper: date range ────────────────────────────────────────────────────────
const getStartDate = (period: string): string => {
  const now = new Date();
  switch (period) {
    case 'today':
      return now.toISOString().split('T')[0];
    case 'week': {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString().split('T')[0];
    }
    case 'month': {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().split('T')[0];
    }
    case 'year': {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().split('T')[0];
    }
    default:
      return '';
  }
};

const CHART_COLORS = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899'];

// ─── CSV Export ─────────────────────────────────────────────────────────────────
function exportCSV(filename: string, headers: string[], rows: string[][]) {
  const BOM = '\uFEFF';
  const csvContent =
    BOM +
    [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast.success('تم تصدير ملف CSV');
}

// ─── Component ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const { user, isAdmin, hasPermission } = useAppStore();
  const canExport = hasPermission('reports', 'export');

  // ── Shared state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('sales');
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Sales state ───────────────────────────────────────────────────────────────
  const [salesData, setSalesData] = useState({
    totalSales: 0,
    totalReturns: 0,
    netSales: 0,
    avgInvoice: 0,
    invoiceCount: 0,
    byBranch: [] as { name: string; total: number }[],
    byProduct: [] as { name: string; qty: number; total: number }[],
    invoices: [] as any[],
  });

  // ── Inventory state ───────────────────────────────────────────────────────────
  const [invMovements, setInvMovements] = useState({
    inCount: 0,
    outCount: 0,
    adjustCount: 0,
    transferCount: 0,
    inValue: 0,
    outValue: 0,
    movements: [] as any[],
  });
  const [invBalances, setInvBalances] = useState({
    totalItems: 0,
    totalValue: 0,
    byBranch: [] as { name: string; count: number; value: number }[],
    lowStock: [] as { product_name: string; branch_name: string; quantity: number; min_quantity: number }[],
  });
  const [branchDebts, setBranchDebts] = useState<
    { branch_name: string; total_transferred: number; total_paid: number; remaining: number }[]
  >([]);

  // ── Financial state ───────────────────────────────────────────────────────────
  const [finData, setFinData] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    outstandingDebts: 0,
    cashFlow: 0,
    paymentsReceived: 0,
    expensesPaid: 0,
    monthlyTrend: [] as { month: string; revenue: number; expenses: number }[],
    customerDebts: [] as { customer_name: string; total_unpaid: number; invoice_count: number }[],
    finBranchDebts: [] as { branch_name: string; remaining: number }[],
  });

  // ── General state ─────────────────────────────────────────────────────────────
  const [generalData, setGeneralData] = useState({
    totalInvoices: 0,
    totalReturns: 0,
    totalPayments: 0,
    totalExpenses: 0,
    totalTransfers: 0,
    totalRevenue: 0,
    totalExpenseAmount: 0,
    netProfit: 0,
    branchPerformance: [] as { name: string; invoices: number; revenue: number; returns: number; expenses: number }[],
    topProducts: [] as { name: string; qty: number; total: number }[],
  });

  // ── Derived date range ────────────────────────────────────────────────────────
  const dateFrom = useMemo(() => {
    if (period === 'custom') return customFrom;
    return getStartDate(period);
  }, [period, customFrom]);

  const dateTo = useMemo(() => {
    if (period === 'custom') return customTo || new Date().toISOString().split('T')[0];
    return new Date().toISOString().split('T')[0];
  }, [period, customTo]);

  // ── Load Sales ────────────────────────────────────────────────────────────────
  const loadSales = async () => {
    if (!dateFrom && !dateTo) return;
    setLoading(true);
    try {
      let invQ = supabase
        .from('invoices')
        .select('id, total, branch_id, invoice_date, branches(name), items:invoice_items(item_name, quantity, total_price)')
        .eq('status', 'active');

      if (dateFrom) invQ = invQ.gte('invoice_date', dateFrom);
      if (dateTo) invQ = invQ.lte('invoice_date', dateTo);
      if (!isAdmin && user?.branch_id) invQ = invQ.eq('branch_id', user.branch_id);

      const { data: invoices } = await invQ;

      let retQ = supabase.from('returns').select('total, branch_id');
      if (dateFrom) retQ = retQ.gte('return_date', dateFrom);
      if (dateTo) retQ = retQ.lte('return_date', dateTo);
      if (!isAdmin && user?.branch_id) retQ = retQ.eq('branch_id', user.branch_id);

      const { data: returns } = await retQ;

      const invList: any[] = invoices || [];
      const retList: any[] = returns || [];
      const totalSales = invList.reduce((s, i) => s + Number(i.total), 0);
      const totalReturns = retList.reduce((s, r) => s + Number(r.total), 0);
      const invoiceCount = invList.length;

      // By branch
      const branchMap: Record<string, { name: string; total: number }> = {};
      invList.forEach((inv) => {
        const bName = (inv.branches as any)?.name || 'غير معروف';
        if (!branchMap[inv.branch_id]) branchMap[inv.branch_id] = { name: bName, total: 0 };
        branchMap[inv.branch_id].total += Number(inv.total);
      });
      const byBranch = Object.values(branchMap).sort((a, b) => b.total - a.total);

      // By product
      const productMap: Record<string, { name: string; qty: number; total: number }> = {};
      invList.forEach((inv) => {
        (inv.items || []).forEach((item: any) => {
          const name = item.item_name || 'غير معروف';
          if (!productMap[name]) productMap[name] = { name, qty: 0, total: 0 };
          productMap[name].qty += Number(item.quantity || 0);
          productMap[name].total += Number(item.total_price || 0);
        });
      });
      const byProduct = Object.values(productMap).sort((a, b) => b.total - a.total);

      setSalesData({
        totalSales,
        totalReturns,
        netSales: totalSales - totalReturns,
        avgInvoice: invoiceCount > 0 ? totalSales / invoiceCount : 0,
        invoiceCount,
        byBranch,
        byProduct,
        invoices: invList,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load Inventory ────────────────────────────────────────────────────────────
  const loadInventory = async () => {
    setLoading(true);
    try {
      // Movements
      let movQ = supabase
        .from('inventory_transactions')
        .select('transaction_type, quantity, products(name), branches(name)');

      if (dateFrom) movQ = movQ.gte('created_at', dateFrom);
      if (dateTo) movQ = movQ.lte('created_at', dateTo + 'T23:59:59');
      if (!isAdmin && user?.branch_id) movQ = movQ.eq('branch_id', user.branch_id);

      const { data: movements } = await movQ;
      const movList: any[] = movements || [];

      const inMov = movList.filter((m) => m.transaction_type === 'in');
      const outMov = movList.filter((m) => m.transaction_type === 'out');
      const adjustMov = movList.filter((m) => m.transaction_type === 'adjust');
      const transferMov = movList.filter((m) => m.transaction_type === 'transfer');

      setInvMovements({
        inCount: inMov.length,
        outCount: outMov.length,
        adjustCount: adjustMov.length,
        transferCount: transferMov.length,
        inValue: inMov.reduce((s, m) => s + Number(m.quantity), 0),
        outValue: outMov.reduce((s, m) => s + Number(m.quantity), 0),
        movements: movList,
      });

      // Balances
      const { data: invData } = await supabase
        .from('inventory')
        .select('quantity, min_quantity, product_id, branch_id, products(name, unit_price), branches(name)');

      let items: any[] = invData || [];
      if (!isAdmin && user?.branch_id) items = items.filter((i) => i.branch_id === user.branch_id);

      const totalItems = items.length;
      const totalValue = items.reduce((s, i) => s + Number(i.quantity) * Number(i.products?.unit_price || 0), 0);

      const brMap: Record<string, { name: string; count: number; value: number }> = {};
      items.forEach((i) => {
        const brName = i.branches?.name || 'غير معروف';
        if (!brMap[brName]) brMap[brName] = { name: brName, count: 0, value: 0 };
        brMap[brName].count += 1;
        brMap[brName].value += Number(i.quantity) * Number(i.products?.unit_price || 0);
      });

      const lowStock = items
        .filter((i) => Number(i.quantity) <= Number(i.min_quantity || 0))
        .map((i) => ({
          product_name: i.products?.name || 'غير معروف',
          branch_name: i.branches?.name || 'غير معروف',
          quantity: Number(i.quantity),
          min_quantity: Number(i.min_quantity || 0),
        }));

      setInvBalances({ totalItems, totalValue, byBranch: Object.values(brMap), lowStock });

      // Branch debts from inventory_transfers
      const { data: transfers } = await supabase
        .from('inventory_transfers')
        .select('to_branch_id, total_amount, to_branch:branches!inventory_transfers_to_branch_id_fkey(name)')
        .eq('status', 'confirmed');

      const { data: transferPayments } = await supabase
        .from('payments')
        .select('branch_id, amount');

      const debtMap: Record<string, { branch_name: string; total_transferred: number; total_paid: number }> = {};
      (transfers || []).forEach((t: any) => {
        const bName = t.to_branch?.name || 'غير معروف';
        if (!debtMap[t.to_branch_id]) debtMap[t.to_branch_id] = { branch_name: bName, total_transferred: 0, total_paid: 0 };
        debtMap[t.to_branch_id].total_transferred += Number(t.total_amount);
      });

      (transferPayments || []).forEach((p: any) => {
        if (debtMap[p.branch_id]) {
          debtMap[p.branch_id].total_paid += Number(p.amount);
        }
      });

      const debts = Object.values(debtMap).map((d) => ({
        ...d,
        remaining: d.total_transferred - d.total_paid,
      }));
      setBranchDebts(debts);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load Financial ────────────────────────────────────────────────────────────
  const loadFinancial = async () => {
    if (!dateFrom && !dateTo) return;
    setLoading(true);
    try {
      // Revenue (invoices)
      let invQ = supabase.from('invoices').select('total, invoice_date').eq('status', 'active');
      if (dateFrom) invQ = invQ.gte('invoice_date', dateFrom);
      if (dateTo) invQ = invQ.lte('invoice_date', dateTo);
      if (!isAdmin && user?.branch_id) invQ = invQ.eq('branch_id', user.branch_id);
      const { data: invoices } = await invQ;

      // Expenses
      let expQ = supabase.from('expenses').select('amount, expense_date');
      if (dateFrom) expQ = expQ.gte('expense_date', dateFrom);
      if (dateTo) expQ = expQ.lte('expense_date', dateTo);
      if (!isAdmin && user?.branch_id) expQ = expQ.eq('branch_id', user.branch_id);
      const { data: expenses } = await expQ;

      // Payments
      let payQ = supabase.from('payments').select('amount, payment_date');
      if (dateFrom) payQ = payQ.gte('payment_date', dateFrom);
      if (dateTo) payQ = payQ.lte('payment_date', dateTo);
      if (!isAdmin && user?.branch_id) payQ = payQ.eq('branch_id', user.branch_id);
      const { data: payments } = await payQ;

      const invList: any[] = invoices || [];
      const expList: any[] = expenses || [];
      const payList: any[] = payments || [];

      const totalRevenue = invList.reduce((s, i) => s + Number(i.total), 0);
      const totalExpenses = expList.reduce((s, e) => s + Number(e.amount), 0);
      const paymentsReceived = payList.reduce((s, p) => s + Number(p.amount), 0);
      const netProfit = totalRevenue - totalExpenses;
      const cashFlow = paymentsReceived - totalExpenses;

      // Monthly trend (last 6 months)
      const monthlyTrend: { month: string; revenue: number; expenses: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const mStart = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
        const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
        const monthLabel = d.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' });

        const rev = invList
          .filter((inv) => inv.invoice_date >= mStart && inv.invoice_date <= mEnd)
          .reduce((s, inv) => s + Number(inv.total), 0);
        const exp = expList
          .filter((e) => e.expense_date >= mStart && e.expense_date <= mEnd)
          .reduce((s, e) => s + Number(e.amount), 0);

        monthlyTrend.push({ month: monthLabel, revenue: rev, expenses: exp });
      }

      // Customer debts: invoices minus payments
      const { data: unpaidInvoices } = await supabase
        .from('invoices')
        .select('customer_id, total, customers(name)')
        .eq('status', 'active');

      // Get payments for customers
      const { data: customerPayments } = await supabase
        .from('payments')
        .select('customer_id, amount')
        .not('customer_id', 'is', null);

      const custDebtMap: Record<string, { customer_name: string; total_unpaid: number; invoice_count: number }> = {};
      (unpaidInvoices || []).forEach((inv: any) => {
        if (!inv.customer_id) return;
        const cName = inv.customers?.name || 'غير معروف';
        if (!custDebtMap[inv.customer_id]) custDebtMap[inv.customer_id] = { customer_name: cName, total_unpaid: 0, invoice_count: 0 };
        custDebtMap[inv.customer_id].total_unpaid += Number(inv.total);
        custDebtMap[inv.customer_id].invoice_count += 1;
      });

      // Subtract payments from customer debts
      (customerPayments || []).forEach((pay: any) => {
        if (pay.customer_id && custDebtMap[pay.customer_id]) {
          custDebtMap[pay.customer_id].total_unpaid -= Number(pay.amount);
        }
      });

      const customerDebts = Object.values(custDebtMap)
        .filter((c) => c.total_unpaid > 0)
        .sort((a, b) => b.total_unpaid - a.total_unpaid);

      // Branch debts from transfers
      const { data: transfers } = await supabase
        .from('inventory_transfers')
        .select('to_branch_id, total_amount, to_branch:branches!inventory_transfers_to_branch_id_fkey(name)')
        .eq('status', 'confirmed');

      const { data: transferPayments } = await supabase.from('payments').select('branch_id, amount');

      const finDebtMap: Record<string, { branch_name: string; remaining: number }> = {};
      (transfers || []).forEach((t: any) => {
        const bName = t.to_branch?.name || 'غير معروف';
        if (!finDebtMap[t.to_branch_id]) finDebtMap[t.to_branch_id] = { branch_name: bName, remaining: 0 };
        finDebtMap[t.to_branch_id].remaining += Number(t.total_amount);
      });
      (transferPayments || []).forEach((p: any) => {
        if (finDebtMap[p.branch_id]) finDebtMap[p.branch_id].remaining -= Number(p.amount);
      });
      const finBranchDebts = Object.values(finDebtMap).filter((d) => d.remaining > 0);

      const outstandingDebts = customerDebts.reduce((s, c) => s + c.total_unpaid, 0) + finBranchDebts.reduce((s, d) => s + d.remaining, 0);

      setFinData({
        totalRevenue,
        totalExpenses,
        netProfit,
        outstandingDebts,
        cashFlow,
        paymentsReceived,
        expensesPaid: totalExpenses,
        monthlyTrend,
        customerDebts,
        finBranchDebts,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Load General ──────────────────────────────────────────────────────────────
  const loadGeneral = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // Counts
      const { count: invoiceCount } = await supabase
        .from('invoices')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      const { count: returnCount } = await supabase
        .from('returns')
        .select('*', { count: 'exact', head: true });

      const { count: paymentCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true });

      const { count: expenseCount } = await supabase
        .from('expenses')
        .select('*', { count: 'exact', head: true });

      const { count: transferCount } = await supabase
        .from('inventory_transfers')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed');

      // Totals
      let invQ = supabase.from('invoices').select('total').eq('status', 'active');
      if (!isAdmin && user?.branch_id) invQ = invQ.eq('branch_id', user.branch_id);
      const { data: invData } = await invQ;
      const totalRevenue = (invData || []).reduce((s, i) => s + Number(i.total), 0);

      let expQ = supabase.from('expenses').select('amount');
      if (!isAdmin && user?.branch_id) expQ = expQ.eq('branch_id', user.branch_id);
      const { data: expData } = await expQ;
      const totalExpenseAmount = (expData || []).reduce((s, e) => s + Number(e.amount), 0);

      // Branch performance
      let branchInvQ = supabase
        .from('invoices')
        .select('branch_id, total, branches(name)')
        .eq('status', 'active');
      if (!isAdmin && user?.branch_id) branchInvQ = branchInvQ.eq('branch_id', user.branch_id);
      const { data: branchInvData } = await branchInvQ;

      let branchRetQ = supabase.from('returns').select('branch_id, total, branches(name)');
      if (!isAdmin && user?.branch_id) branchRetQ = branchRetQ.eq('branch_id', user.branch_id);
      const { data: branchRetData } = await branchRetQ;

      let branchExpQ = supabase.from('expenses').select('branch_id, amount, branches(name)');
      if (!isAdmin && user?.branch_id) branchExpQ = branchExpQ.eq('branch_id', user.branch_id);
      const { data: branchExpData } = await branchExpQ;

      const perfMap: Record<string, { name: string; invoices: number; revenue: number; returns: number; expenses: number }> = {};
      (branchInvData || []).forEach((inv: any) => {
        const bName = inv.branches?.name || 'غير معروف';
        if (!perfMap[inv.branch_id]) perfMap[inv.branch_id] = { name: bName, invoices: 0, revenue: 0, returns: 0, expenses: 0 };
        perfMap[inv.branch_id].invoices += 1;
        perfMap[inv.branch_id].revenue += Number(inv.total);
      });
      (branchRetData || []).forEach((ret: any) => {
        const bName = ret.branches?.name || 'غير معروف';
        if (!perfMap[ret.branch_id]) perfMap[ret.branch_id] = { name: bName, invoices: 0, revenue: 0, returns: 0, expenses: 0 };
        perfMap[ret.branch_id].returns += Number(ret.total);
      });
      (branchExpData || []).forEach((exp: any) => {
        const bName = exp.branches?.name || 'غير معروف';
        if (!perfMap[exp.branch_id]) perfMap[exp.branch_id] = { name: bName, invoices: 0, revenue: 0, returns: 0, expenses: 0 };
        perfMap[exp.branch_id].expenses += Number(exp.amount);
      });
      const branchPerformance = Object.values(perfMap).sort((a, b) => b.revenue - a.revenue);

      // Top products
      const { data: itemsData } = await supabase
        .from('invoice_items')
        .select('item_name, quantity, total_price');

      const prodMap: Record<string, { name: string; qty: number; total: number }> = {};
      (itemsData || []).forEach((item: any) => {
        const name = item.item_name || 'غير معروف';
        if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0 };
        prodMap[name].qty += Number(item.quantity || 0);
        prodMap[name].total += Number(item.total_price || 0);
      });
      const topProducts = Object.values(prodMap).sort((a, b) => b.total - a.total).slice(0, 10);

      setGeneralData({
        totalInvoices: invoiceCount || 0,
        totalReturns: returnCount || 0,
        totalPayments: paymentCount || 0,
        totalExpenses: expenseCount || 0,
        totalTransfers: transferCount || 0,
        totalRevenue,
        totalExpenseAmount,
        netProfit: totalRevenue - totalExpenseAmount,
        branchPerformance,
        topProducts,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Effects ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'sales') loadSales();
  }, [activeTab, period, customFrom, customTo]);

  useEffect(() => {
    if (activeTab === 'inventory') loadInventory();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'financial') loadFinancial();
  }, [activeTab, period, customFrom, customTo]);

  useEffect(() => {
    if (activeTab === 'general') loadGeneral();
  }, [activeTab]);

  // ── Export handlers ───────────────────────────────────────────────────────────
  const handleExportSales = () => {
    exportCSV(
      'تقارير_المبيعات',
      ['المنتج', 'الكمية المباعة', 'الإجمالي'],
      salesData.byProduct.map((p) => [p.name, p.qty.toString(), p.total.toFixed(2)])
    );
  };

  const handleExportInventory = () => {
    exportCSV(
      'تقارير_المخزون',
      ['المنتج', 'الفرع', 'الكمية', 'الحد الأدنى'],
      invBalances.lowStock.map((i) => [i.product_name, i.branch_name, i.quantity.toString(), i.min_quantity.toString()])
    );
  };

  const handleExportFinancial = () => {
    const rows: string[][] = [];
    rows.push(['إجمالي الإيرادات', finData.totalRevenue.toFixed(2)]);
    rows.push(['إجمالي المصروفات', finData.totalExpenses.toFixed(2)]);
    rows.push([finData.netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة', Math.abs(finData.netProfit).toFixed(2)]);
    rows.push(['التدفقات النقدية', finData.cashFlow.toFixed(2)]);
    rows.push(['المديونيات المستحقة', finData.outstandingDebts.toFixed(2)]);
    rows.push([]);
    rows.push(['العميل', 'المبلغ المستحق', 'عدد الفواتير']);
    finData.customerDebts.forEach((c) => rows.push([c.customer_name, c.total_unpaid.toFixed(2), c.invoice_count.toString()]));
    exportCSV('تقارير_مالية', ['البند', 'القيمة'], rows);
  };

  const handleExportGeneral = () => {
    const rows: string[][] = [];
    rows.push(['عدد الفواتير', generalData.totalInvoices.toString()]);
    rows.push(['عدد المرتجعات', generalData.totalReturns.toString()]);
    rows.push(['عدد المدفوعات', generalData.totalPayments.toString()]);
    rows.push(['عدد المصروفات', generalData.totalExpenses.toString()]);
    rows.push(['عدد التحويلات', generalData.totalTransfers.toString()]);
    rows.push(['إجمالي الإيرادات', generalData.totalRevenue.toFixed(2)]);
    rows.push(['إجمالي المصروفات', generalData.totalExpenseAmount.toFixed(2)]);
    rows.push([generalData.netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة', Math.abs(generalData.netProfit).toFixed(2)]);
    rows.push([]);
    rows.push(['الفرع', 'عدد الفواتير', 'الإيرادات', 'المرتجعات', 'المصروفات']);
    generalData.branchPerformance.forEach((b) =>
      rows.push([b.name, b.invoices.toString(), b.revenue.toFixed(2), b.returns.toFixed(2), b.expenses.toFixed(2)])
    );
    exportCSV('تقرير_عام', ['البند', 'القيمة'], rows);
  };

  // ── Period Selector ───────────────────────────────────────────────────────────
  const PeriodSelector = () => (
    <Card className="border-0 shadow-md overflow-hidden">
      <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <Calendar className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-medium text-muted-foreground">فترة التقرير</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">اليوم</SelectItem>
              <SelectItem value="week">هذا الأسبوع</SelectItem>
              <SelectItem value="month">هذا الشهر</SelectItem>
              <SelectItem value="year">هذا العام</SelectItem>
              <SelectItem value="custom">مخصص</SelectItem>
            </SelectContent>
          </Select>
          {period === 'custom' && (
            <>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-40"
                placeholder="من"
              />
              <span className="text-muted-foreground text-sm">إلى</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-40"
                placeholder="إلى"
              />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  // ── Stat Card ─────────────────────────────────────────────────────────────────
  const StatCard = ({
    title,
    value,
    icon: Icon,
    color,
    bgColor,
    index = 0,
  }: {
    title: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
    bgColor: string;
    index?: number;
  }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
    >
      <Card className="border-0 shadow-md hover:shadow-lg transition-shadow overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
            </div>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: bgColor.includes('emerald') ? 'linear-gradient(135deg, #10b981, #059669)' : bgColor.includes('red') ? 'linear-gradient(135deg, #ef4444, #dc2626)' : bgColor.includes('blue') ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : bgColor.includes('amber') ? 'linear-gradient(135deg, #f59e0b, #d97706)' : bgColor.includes('primary') ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : 'linear-gradient(135deg, #64748b, #475569)' }}>
              <Icon className="w-5 h-5 text-white" />
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );

  // ── Recharts Tooltip style ────────────────────────────────────────────────────
  const tooltipStyle = {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    direction: 'rtl' as const,
    fontSize: 12,
  };

  // ── RENDER ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
            <BarChart3 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">التقارير المتقدمة</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              تقارير شاملة عن المبيعات والمخزون والمالية
              {!isAdmin && user?.branch_name && ` - فرع ${user.branch_name}`}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="sales" className="gap-1.5 text-xs sm:text-sm">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">تقارير</span> المبيعات
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5 text-xs sm:text-sm">
            <Package className="w-4 h-4" />
            <span className="hidden sm:inline">تقارير</span> المخزون
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-1.5 text-xs sm:text-sm">
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">تقارير</span> مالية
          </TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5 text-xs sm:text-sm">
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">تقارير</span> عامة
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════ SALES TAB ═══════════════════════ */}
        <TabsContent value="sales" className="space-y-4 mt-4">
          <PeriodSelector />

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="إجمالي المبيعات"
              value={formatCurrency(salesData.totalSales)}
              icon={TrendingUp}
              color="text-emerald-600"
              bgColor="bg-emerald-50 dark:bg-emerald-900/20"
              index={0}
            />
            <StatCard
              title="إجمالي المرتجعات"
              value={formatCurrency(salesData.totalReturns)}
              icon={TrendingDown}
              color="text-red-600"
              bgColor="bg-red-50 dark:bg-red-900/20"
              index={1}
            />
            <StatCard
              title="صافي المبيعات"
              value={formatCurrency(salesData.netSales)}
              icon={BarChart3}
              color="text-blue-600"
              bgColor="bg-blue-50 dark:bg-blue-900/20"
              index={2}
            />
            <StatCard
              title="متوسط قيمة الفاتورة"
              value={formatCurrency(salesData.avgInvoice)}
              icon={ArrowUpDown}
              color="text-amber-600"
              bgColor="bg-amber-50 dark:bg-amber-900/20"
              index={3}
            />
          </div>

          {/* Sales by Branch Chart */}
          {salesData.byBranch.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <BarChart3 className="w-3.5 h-3.5 text-white" />
                    </div>
                    المبيعات حسب الفرع
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={salesData.byBranch} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                        <Bar dataKey="total" name="المبيعات" fill="#10b981" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Sales by Product Table */}
          {salesData.byProduct.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <Package className="w-3.5 h-3.5 text-white" />
                    </div>
                    المبيعات حسب المنتج
                  </CardTitle>
                  {canExport && (
                    <Button variant="outline" size="sm" onClick={handleExportSales} className="gap-1.5">
                      <Download className="w-4 h-4" />
                      تصدير CSV
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                    <ScrollArea className="max-h-96">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="text-right">#</TableHead>
                              <TableHead className="text-right">المنتج</TableHead>
                              <TableHead className="text-center">الكمية المباعة</TableHead>
                              <TableHead className="text-right">الإجمالي</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {salesData.byProduct.map((p, i) => (
                              <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                                <TableCell className="text-muted-foreground">
                                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}>
                                    {i + 1}
                                  </div>
                                </TableCell>
                                <TableCell className="font-medium">{p.name}</TableCell>
                                <TableCell className="text-center">{p.qty.toLocaleString('ar-EG')}</TableCell>
                                <TableCell className="font-semibold text-emerald-600">{formatCurrency(p.total)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </div>
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2 max-h-96 overflow-y-auto">
                    {salesData.byProduct.map((p, i) => (
                      <div key={i} className="rounded-xl border-r-4 border-amber-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}>
                              {i + 1}
                            </div>
                            <span className="font-medium text-sm">{p.name}</span>
                          </div>
                          <span className="font-semibold text-sm text-emerald-600">{formatCurrency(p.total)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">الكمية: {p.qty.toLocaleString('ar-EG')}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {salesData.byBranch.length === 0 && salesData.byProduct.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <BarChart3 className="w-10 h-10 text-white" />
              </div>
              <p className="text-lg font-semibold">لا توجد بيانات مبيعات</p>
              <p className="text-sm text-muted-foreground mt-1">للفترة المحددة</p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════ INVENTORY TAB ═══════════════════════ */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
          {/* Inventory Movement */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                    <ArrowUpDown className="w-3.5 h-3.5 text-white" />
                  </div>
                  حركة المخزون
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="text-sm text-muted-foreground">وارد</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{invMovements.inCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{invMovements.inValue.toLocaleString('ar-EG')} وحدة</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                    <p className="text-sm text-muted-foreground">صادر</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">{invMovements.outCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">{invMovements.outValue.toLocaleString('ar-EG')} وحدة</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                    <p className="text-sm text-muted-foreground">تسوية</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{invMovements.adjustCount}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-sm text-muted-foreground">تحويل</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">{invMovements.transferCount}</p>
                  </div>
                </div>
                {/* Movement chart */}
                {((invMovements.inCount + invMovements.outCount + invMovements.adjustCount + invMovements.transferCount) > 0) && (
                  <div className="h-64 mt-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'وارد', value: invMovements.inCount },
                            { name: 'صادر', value: invMovements.outCount },
                            { name: 'تسوية', value: invMovements.adjustCount },
                            { name: 'تحويل', value: invMovements.transferCount },
                          ]}
                          cx="50%"
                          cy="50%"
                          outerRadius={90}
                          dataKey="value"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {CHART_COLORS.map((color, i) => (
                            <Cell key={i} fill={color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Current Balances */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                    <Package className="w-3.5 h-3.5 text-white" />
                  </div>
                  أرصدة المخزون
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                  <div className="text-center p-3 rounded-xl bg-primary/5">
                    <p className="text-sm text-muted-foreground">إجمالي الأصناف</p>
                    <p className="text-2xl font-bold text-primary mt-1">{invBalances.totalItems}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="text-sm text-muted-foreground">إجمالي القيمة</p>
                    <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(invBalances.totalValue)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                    <p className="text-sm text-muted-foreground">مخزون منخفض</p>
                    <p className="text-2xl font-bold text-amber-600 mt-1">{invBalances.lowStock.length}</p>
                  </div>
                </div>

                {invBalances.byBranch.length > 0 && (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={invBalances.byBranch} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCurrency(v)} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                        <Bar dataKey="value" name="القيمة" fill="#10b981" radius={[0, 6, 6, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Branch Debts */}
          {branchDebts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                      <Wallet className="w-3.5 h-3.5 text-white" />
                    </div>
                    مديونيات الفروع
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="text-right">الفرع</TableHead>
                            <TableHead className="text-right">إجمالي التحويلات</TableHead>
                            <TableHead className="text-right">إجمالي المدفوعات</TableHead>
                            <TableHead className="text-right">المبلغ المتبقي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {branchDebts.map((d, i) => (
                            <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="font-medium">{d.branch_name}</TableCell>
                              <TableCell>{formatCurrency(d.total_transferred)}</TableCell>
                              <TableCell className="text-emerald-600">{formatCurrency(d.total_paid)}</TableCell>
                              <TableCell className={`font-semibold ${d.remaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {formatCurrency(d.remaining)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2">
                    {branchDebts.map((d, i) => (
                      <div key={i} className="rounded-xl border-r-4 border-red-500 bg-card p-3 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                              <Wallet className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="font-medium text-sm">{d.branch_name}</span>
                          </div>
                          <span className={`font-semibold text-sm ${d.remaining > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                            {formatCurrency(d.remaining)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>تحويلات: {formatCurrency(d.total_transferred)}</span>
                          <span className="text-emerald-600">مدفوع: {formatCurrency(d.total_paid)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Low Stock */}
          {invBalances.lowStock.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <TrendingDown className="w-3.5 h-3.5 text-white" />
                    </div>
                    مخزون منخفض
                  </CardTitle>
                  {canExport && (
                    <Button variant="outline" size="sm" onClick={handleExportInventory} className="gap-1.5">
                      <Download className="w-4 h-4" />
                      تصدير CSV
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <ScrollArea className="max-h-96">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="text-right">المنتج</TableHead>
                              <TableHead className="text-right">الفرع</TableHead>
                              <TableHead className="text-center">الكمية الحالية</TableHead>
                              <TableHead className="text-center">الحد الأدنى</TableHead>
                              <TableHead className="text-center">الحالة</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {invBalances.lowStock.map((item, i) => (
                              <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                                <TableCell className="font-medium">{item.product_name}</TableCell>
                                <TableCell>{item.branch_name}</TableCell>
                                <TableCell className="text-center font-semibold">{item.quantity}</TableCell>
                                <TableCell className="text-center">{item.min_quantity}</TableCell>
                                <TableCell className="text-center">
                                  <Badge
                                    variant="secondary"
                                    className={
                                      item.quantity <= 0
                                        ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                    }
                                  >
                                    {item.quantity <= 0 ? 'نفد' : 'منخفض'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </div>
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2 max-h-96 overflow-y-auto">
                    {invBalances.lowStock.map((item, i) => (
                      <div key={i} className="rounded-xl border-r-4 border-amber-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{item.product_name}</span>
                          <Badge
                            variant="secondary"
                            className={
                              item.quantity <= 0
                                ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px]'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]'
                            }
                          >
                            {item.quantity <= 0 ? 'نفد' : 'منخفض'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">الفرع: {item.branch_name}</p>
                        <div className="flex justify-between text-xs mt-1">
                          <span>الكمية: <strong>{item.quantity}</strong></span>
                          <span>الحد الأدنى: {item.min_quantity}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {invBalances.totalItems === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                <Package className="w-10 h-10 text-white" />
              </div>
              <p className="text-lg font-semibold">لا توجد بيانات مخزون</p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════ FINANCIAL TAB ═══════════════════════ */}
        <TabsContent value="financial" className="space-y-4 mt-4">
          <PeriodSelector />

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="الإيرادات"
              value={formatCurrency(finData.totalRevenue)}
              icon={ArrowUpRight}
              color="text-emerald-600"
              bgColor="bg-emerald-50 dark:bg-emerald-900/20"
              index={0}
            />
            <StatCard
              title="المصروفات"
              value={formatCurrency(finData.totalExpenses)}
              icon={ArrowDownRight}
              color="text-red-600"
              bgColor="bg-red-50 dark:bg-red-900/20"
              index={1}
            />
            <StatCard
              title={finData.netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
              value={formatCurrency(Math.abs(finData.netProfit))}
              icon={finData.netProfit >= 0 ? TrendingUp : TrendingDown}
              color={finData.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}
              bgColor={finData.netProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}
              index={2}
            />
            <StatCard
              title="المديونيات المستحقة"
              value={formatCurrency(finData.outstandingDebts)}
              icon={Wallet}
              color="text-amber-600"
              bgColor="bg-amber-50 dark:bg-amber-900/20"
              index={3}
            />
          </div>

          {/* Revenue vs Expenses Bar Chart */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                    <TrendingUp className="w-3.5 h-3.5 text-white" />
                  </div>
                  الإيرادات مقابل المصروفات</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[
                        {
                          name: finData.netProfit >= 0 ? 'ربح' : 'خسارة',
                          الإيرادات: finData.totalRevenue,
                          المصروفات: finData.totalExpenses,
                        },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="الإيرادات" fill="#10b981" radius={[6, 6, 0, 0]} />
                      <Bar dataKey="المصروفات" fill="#ef4444" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Monthly Trend Line Chart */}
          {finData.monthlyTrend.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    اتجاه الإيرادات والمصروفات الشهرية</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={finData.monthlyTrend} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                        <Legend />
                        <Line type="monotone" dataKey="revenue" name="الإيرادات" stroke="#10b981" strokeWidth={2} dot={{ r: 4 }} />
                        <Line type="monotone" dataKey="expenses" name="المصروفات" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Cash Flow & Debts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cash Flow */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
              <Card className="border-0 shadow-md h-full overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                      <Wallet className="w-3.5 h-3.5 text-white" />
                    </div>
                    التدفقات النقدية</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm">المدفوعات المستلمة</span>
                    </div>
                    <span className="font-semibold text-emerald-600">{formatCurrency(finData.paymentsReceived)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="w-4 h-4 text-red-600" />
                      <span className="text-sm">المصروفات المدفوعة</span>
                    </div>
                    <span className="font-semibold text-red-600">{formatCurrency(finData.expensesPaid)}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-primary" />
                      <span className="text-sm font-medium">صافي التدفق النقدي</span>
                    </div>
                    <span className={`font-bold ${finData.cashFlow >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(finData.cashFlow)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Branch Debts */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
              <Card className="border-0 shadow-md h-full overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                      <Wallet className="w-3.5 h-3.5 text-white" />
                    </div>
                    مديونيات الفروع للمصنع</CardTitle>
                </CardHeader>
                <CardContent>
                  {finData.finBranchDebts.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                      لا توجد مديونيات
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {finData.finBranchDebts.map((d, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                          <div>
                            <p className="font-medium">{d.branch_name}</p>
                          </div>
                          <span className="font-semibold text-red-600">{formatCurrency(d.remaining)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Customer Debts */}
          {finData.customerDebts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                      <Wallet className="w-3.5 h-3.5 text-white" />
                    </div>
                    مديونيات العملاء
                  </CardTitle>
                  {canExport && (
                    <Button variant="outline" size="sm" onClick={handleExportFinancial} className="gap-1.5">
                      <Download className="w-4 h-4" />
                      تصدير CSV
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <ScrollArea className="max-h-96">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="text-right">العميل</TableHead>
                              <TableHead className="text-center">عدد الفواتير</TableHead>
                              <TableHead className="text-right">المبلغ المستحق</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {finData.customerDebts.map((c, i) => (
                              <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                                <TableCell className="font-medium">{c.customer_name}</TableCell>
                                <TableCell className="text-center">{c.invoice_count}</TableCell>
                                <TableCell className="font-semibold text-red-600">{formatCurrency(c.total_unpaid)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </div>
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2 max-h-96 overflow-y-auto">
                    {finData.customerDebts.map((c, i) => (
                      <div key={i} className="rounded-xl border-r-4 border-red-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                              <Wallet className="w-3.5 h-3.5 text-white" />
                            </div>
                            <span className="font-medium text-sm">{c.customer_name}</span>
                          </div>
                          <span className="font-semibold text-sm text-red-600">{formatCurrency(c.total_unpaid)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">عدد الفواتير: {c.invoice_count}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {finData.totalRevenue === 0 && finData.totalExpenses === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <Wallet className="w-10 h-10 text-white" />
              </div>
              <p className="text-lg font-semibold">لا توجد بيانات مالية</p>
              <p className="text-sm text-muted-foreground mt-1">للفترة المحددة</p>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════ GENERAL TAB ═══════════════════════ */}
        <TabsContent value="general" className="space-y-4 mt-4">
          {/* Summary Dashboard */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="border-0 shadow-md bg-gradient-to-l from-primary to-emerald-700 text-primary-foreground overflow-hidden">
              <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #fbbf24, #ffffff, #fbbf24)' }} />
              <CardContent className="p-6">
                <h2 className="text-lg font-bold mb-4">ملخص عام</h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-primary-foreground/70">إجمالي الإيرادات</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(generalData.totalRevenue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-primary-foreground/70">إجمالي المصروفات</p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(generalData.totalExpenseAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-primary-foreground/70">
                      {generalData.netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}
                    </p>
                    <p className="text-2xl font-bold mt-1">{formatCurrency(Math.abs(generalData.netProfit))}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Activity Summary */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                    <BarChart3 className="w-3.5 h-3.5 text-white" />
                  </div>
                  ملخص النشاط</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="text-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                    <TrendingUp className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-emerald-600">{generalData.totalInvoices}</p>
                    <p className="text-xs text-muted-foreground">فواتير</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
                    <TrendingDown className="w-6 h-6 text-red-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-red-600">{generalData.totalReturns}</p>
                    <p className="text-xs text-muted-foreground">مرتجعات</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
                    <Wallet className="w-6 h-6 text-blue-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-blue-600">{generalData.totalPayments}</p>
                    <p className="text-xs text-muted-foreground">مدفوعات</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                    <ArrowDownRight className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-amber-600">{generalData.totalExpenses}</p>
                    <p className="text-xs text-muted-foreground">مصروفات</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20">
                    <ArrowUpDown className="w-6 h-6 text-purple-600 mx-auto mb-1" />
                    <p className="text-2xl font-bold text-purple-600">{generalData.totalTransfers}</p>
                    <p className="text-xs text-muted-foreground">تحويلات</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Branch Performance Table */}
          {generalData.branchPerformance.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <Building2 className="w-3.5 h-3.5 text-white" />
                    </div>
                    أداء الفروع
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <ScrollArea className="max-h-96">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30 hover:bg-muted/30">
                              <TableHead className="text-right">الفرع</TableHead>
                              <TableHead className="text-center">الفواتير</TableHead>
                              <TableHead className="text-right">الإيرادات</TableHead>
                              <TableHead className="text-right">المرتجعات</TableHead>
                              <TableHead className="text-right">المصروفات</TableHead>
                              <TableHead className="text-right">صافي</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {generalData.branchPerformance.map((b, i) => {
                              const net = b.revenue - b.returns - b.expenses;
                              return (
                                <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                                  <TableCell className="font-medium">{b.name}</TableCell>
                                  <TableCell className="text-center">{b.invoices}</TableCell>
                                  <TableCell className="text-emerald-600">{formatCurrency(b.revenue)}</TableCell>
                                  <TableCell className="text-red-600">{formatCurrency(b.returns)}</TableCell>
                                  <TableCell className="text-amber-600">{formatCurrency(b.expenses)}</TableCell>
                                  <TableCell className={`font-semibold ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {formatCurrency(net)}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    </ScrollArea>
                  </div>
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2 max-h-96 overflow-y-auto">
                    {generalData.branchPerformance.map((b, i) => {
                      const net = b.revenue - b.returns - b.expenses;
                      return (
                        <div key={i} className="rounded-xl border-r-4 border-amber-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                <Building2 className="w-3.5 h-3.5 text-white" />
                              </div>
                              <span className="font-medium text-sm">{b.name}</span>
                            </div>
                            <span className={`font-semibold text-sm ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(net)}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                            <div><span className="text-muted-foreground">إيرادات:</span> <span className="text-emerald-600 font-medium">{formatCurrency(b.revenue)}</span></div>
                            <div><span className="text-muted-foreground">مرتجعات:</span> <span className="text-red-600 font-medium">{formatCurrency(b.returns)}</span></div>
                            <div><span className="text-muted-foreground">مصروفات:</span> <span className="text-amber-600 font-medium">{formatCurrency(b.expenses)}</span></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Top Products */}
          {generalData.topProducts.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #f59e0b, #fbbf24, #f59e0b)' }} />
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <TrendingUp className="w-3.5 h-3.5 text-white" />
                    </div>
                    أكثر المنتجات مبيعاً
                  </CardTitle>
                  {canExport && (
                    <Button variant="outline" size="sm" onClick={handleExportGeneral} className="gap-1.5">
                      <Download className="w-4 h-4" />
                      تصدير CSV
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="text-right">#</TableHead>
                            <TableHead className="text-right">المنتج</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-right">الإجمالي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {generalData.topProducts.map((p, i) => (
                            <TableRow key={i} className="hover:bg-muted/40 transition-colors">
                              <TableCell className="text-muted-foreground">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}>
                                  {i + 1}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-center">{p.qty.toLocaleString('ar-EG')}</TableCell>
                              <TableCell className="font-semibold text-emerald-600">{formatCurrency(p.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2">
                    {generalData.topProducts.map((p, i) => (
                      <div key={i} className="rounded-xl border-r-4 border-amber-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}>
                              {i + 1}
                            </div>
                            <span className="font-medium text-sm">{p.name}</span>
                          </div>
                          <span className="font-semibold text-sm text-emerald-600">{formatCurrency(p.total)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">الكمية: {p.qty.toLocaleString('ar-EG')}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {generalData.totalInvoices === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <FileText className="w-10 h-10 text-white" />
              </div>
              <p className="text-lg font-semibold">لا توجد بيانات</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
