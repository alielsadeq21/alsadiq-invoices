'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { DashboardStats, MonthlyData, BranchSpending, Invoice } from '@/lib/types';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FileText,
  TrendingUp,
  RotateCcw,
  Building2,
  Plus,
  ArrowUpLeft,
  Activity,
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';
import { motion } from 'framer-motion';

export default function DashboardPage() {
  const { navigateTo, settings, user, isAdmin, hasPermission } = useAppStore();
  const [stats, setStats] = useState<DashboardStats>({
    todayInvoices: 0,
    todayTotal: 0,
    todayReturns: 0,
    activeBranches: 0,
    netSpending: 0,
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [branchSpending, setBranchSpending] = useState<BranchSpending[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [topItems, setTopItems] = useState<{ name: string; count: number; total: number }[]>([]);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const userBranchId = user?.branch_id || null;

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const currentMonth = format(new Date(), 'yyyy-MM');

      // Today's invoices
      let todayInvoicesQuery = supabase
        .from('invoices')
        .select('total')
        .eq('invoice_date', today)
        .eq('status', 'active');
      if (userBranchId && !isAdmin) todayInvoicesQuery = todayInvoicesQuery.eq('branch_id', userBranchId);
      const { data: todayInvoices } = await todayInvoicesQuery;

      const todayTotal = (todayInvoices || []).reduce((sum, inv) => sum + Number(inv.total), 0);

      // Today's returns
      let todayReturnsQuery = supabase
        .from('returns')
        .select('total')
        .eq('return_date', today);
      if (userBranchId && !isAdmin) todayReturnsQuery = todayReturnsQuery.eq('branch_id', userBranchId);
      const { data: todayReturns } = await todayReturnsQuery;

      const todayReturnsTotal = (todayReturns || []).reduce((sum, ret) => sum + Number(ret.total), 0);

      // Active branches
      let activeBranches = 0;
      if (userBranchId && !isAdmin) {
        activeBranches = 1; // Branch user only sees their own branch
      } else {
        const { count: branchCount } = await supabase
          .from('branches')
          .select('*', { count: 'exact', head: true })
          .eq('is_active', true);
        activeBranches = branchCount || 0;
      }

      setStats({
        todayInvoices: todayInvoices?.length || 0,
        todayTotal,
        todayReturns: todayReturnsTotal,
        activeBranches,
        netSpending: todayTotal - todayReturnsTotal,
      });

      // Today's expenses
      let todayExpensesQuery = supabase
        .from('expenses')
        .select('amount')
        .eq('expense_date', today);
      if (userBranchId && !isAdmin) todayExpensesQuery = todayExpensesQuery.eq('branch_id', userBranchId);
      const { data: todayExpensesData } = await todayExpensesQuery;
      const todayExpTotal = (todayExpensesData || []).reduce((sum: number, exp: any) => sum + Number(exp.amount), 0);
      setTodayExpenses(todayExpTotal);

      // Low stock count
      const { data: allInventory } = await supabase
        .from('inventory')
        .select('quantity, min_quantity, branch_id');
      let relevantInv: any[] = allInventory || [];
      if (userBranchId && !isAdmin) {
        relevantInv = relevantInv.filter((item: any) => item.branch_id === userBranchId);
      }
      const lowStock = relevantInv.filter((item: any) => Number(item.quantity) <= Number(item.min_quantity || 0)).length;
      setLowStockCount(lowStock);

      // Monthly chart data (last 6 months)
      const monthlyPromises: Promise<{ month: string; total: number; returns: number; expenses: number; net: number }>[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(new Date(), i);
        const monthStart = startOfMonth(date).toISOString().split('T')[0];
        const monthEnd = endOfMonth(date).toISOString().split('T')[0];
        const monthLabel = format(date, 'MMM yyyy', { locale: ar });

        monthlyPromises.push(
          Promise.all([
            (() => {
              let q = supabase
                .from('invoices')
                .select('total')
                .gte('invoice_date', monthStart)
                .lte('invoice_date', monthEnd)
                .eq('status', 'active');
              if (userBranchId && !isAdmin) q = q.eq('branch_id', userBranchId);
              return q;
            })(),
            (() => {
              let q = supabase
                .from('returns')
                .select('total')
                .gte('return_date', monthStart)
                .lte('return_date', monthEnd);
              if (userBranchId && !isAdmin) q = q.eq('branch_id', userBranchId);
              return q;
            })(),
            (() => {
              let q = supabase
                .from('expenses')
                .select('amount')
                .gte('expense_date', monthStart)
                .lte('expense_date', monthEnd);
              if (userBranchId && !isAdmin) q = q.eq('branch_id', userBranchId);
              return q;
            })(),
          ]).then(([invRes, retRes, expRes]) => {
            const total = (invRes.data || []).reduce((s, i) => s + Number(i.total), 0);
            const returns = (retRes.data || []).reduce((s, r) => s + Number(r.total), 0);
            const expenses = (expRes.data || []).reduce((s: number, e: any) => s + Number(e.amount), 0);
            return {
              month: monthLabel,
              total,
              returns,
              expenses,
              net: total - returns,
            };
          })
        );
      }

      const monthly = await Promise.all(monthlyPromises);
      setMonthlyData(monthly);

      // Branch spending this month
      const monthStart = startOfMonth(new Date()).toISOString().split('T')[0];
      const monthEnd = endOfMonth(new Date()).toISOString().split('T')[0];

      let branchInvoicesQuery = supabase
        .from('invoices')
        .select('branch_id, total, branches(name)')
        .gte('invoice_date', monthStart)
        .lte('invoice_date', monthEnd)
        .eq('status', 'active');
      if (userBranchId && !isAdmin) branchInvoicesQuery = branchInvoicesQuery.eq('branch_id', userBranchId);
      const { data: branchInvoices } = await branchInvoicesQuery;

      const branchMap: Record<string, { name: string; total: number; count: number }> = {};
      (branchInvoices || []).forEach((inv) => {
        const branchData = inv.branches as unknown as { name: string } | null;
        const bName = branchData?.name || 'غير معروف';
        if (!branchMap[inv.branch_id]) {
          branchMap[inv.branch_id] = { name: bName, total: 0, count: 0 };
        }
        branchMap[inv.branch_id].total += Number(inv.total);
        branchMap[inv.branch_id].count += 1;
      });

      const branchList = Object.entries(branchMap)
        .map(([id, data]) => ({ branch_id: id, branch_name: data.name, total: data.total, invoice_count: data.count }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setBranchSpending(branchList);

      // Recent invoices
      let recentInvoicesQuery = supabase
        .from('invoices')
        .select('*, branches(name)')
        .order('created_at', { ascending: false })
        .limit(5);
      if (userBranchId && !isAdmin) recentInvoicesQuery = recentInvoicesQuery.eq('branch_id', userBranchId);
      const { data: recent } = await recentInvoicesQuery;

      setRecentInvoices((recent as unknown as Invoice[]) || []);

      // Top items this month
      const { data: itemsData } = await supabase
        .from('invoice_items')
        .select('item_name, quantity, total_price')
        .gte('created_at', monthStart);

      const itemMap: Record<string, { name: string; count: number; total: number }> = {};
      (itemsData || []).forEach((item: { item_name: string; quantity: number; total_price: number }) => {
        if (!itemMap[item.item_name]) {
          itemMap[item.item_name] = { name: item.item_name, count: 0, total: 0 };
        }
        itemMap[item.item_name].count += Number(item.quantity);
        itemMap[item.item_name].total += Number(item.total_price);
      });

      const topItemsList = Object.values(itemMap)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
      setTopItems(topItemsList);
    } catch (err) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'فواتير اليوم',
      value: stats.todayInvoices,
      icon: FileText,
      gradient: 'from-emerald-400 to-emerald-600',
      accent: 'from-emerald-400 to-emerald-500',
      lightBg: 'bg-emerald-50/80 dark:bg-emerald-950/30',
    },
    {
      title: 'صرف اليوم',
      value: formatCurrency(stats.todayTotal),
      icon: TrendingUp,
      gradient: 'from-amber-400 to-amber-600',
      accent: 'from-amber-400 to-amber-500',
      lightBg: 'bg-amber-50/80 dark:bg-amber-950/30',
    },
    {
      title: 'مرتجعات اليوم',
      value: formatCurrency(stats.todayReturns),
      icon: RotateCcw,
      gradient: 'from-red-400 to-red-600',
      accent: 'from-red-400 to-red-500',
      lightBg: 'bg-red-50/80 dark:bg-red-950/30',
    },
    {
      title: 'فروع نشطة',
      value: stats.activeBranches,
      icon: Building2,
      gradient: 'from-sky-400 to-sky-600',
      accent: 'from-sky-400 to-sky-500',
      lightBg: 'bg-sky-50/80 dark:bg-sky-950/30',
    },
    {
      title: 'مصروفات اليوم',
      value: formatCurrency(todayExpenses),
      icon: Receipt,
      gradient: 'from-purple-400 to-purple-600',
      accent: 'from-purple-400 to-purple-500',
      lightBg: 'bg-purple-50/80 dark:bg-purple-950/30',
    },
    {
      title: 'مخزون منخفض',
      value: lowStockCount,
      icon: AlertTriangle,
      gradient: 'from-orange-400 to-orange-600',
      accent: 'from-orange-400 to-orange-500',
      lightBg: 'bg-orange-50/80 dark:bg-orange-950/30',
    },
  ];

  const branchBarColors = [
    'from-emerald-400 to-emerald-600',
    'from-sky-400 to-sky-600',
    'from-amber-400 to-amber-600',
    'from-purple-400 to-purple-600',
    'from-rose-400 to-rose-600',
  ];

  const rankGradients = [
    'from-amber-300 to-amber-500',      // Gold
    'from-slate-300 to-slate-500',       // Silver
    'from-orange-400 to-orange-600',     // Bronze
    'from-slate-400 to-slate-500',       // 4th
    'from-slate-400 to-slate-500',       // 5th
  ];

  const invoiceStatusIcons: Record<string, string> = {
    active: 'bg-gradient-to-br from-emerald-400 to-emerald-600',
    cancelled: 'bg-gradient-to-br from-red-400 to-red-600',
    partially_returned: 'bg-gradient-to-br from-amber-400 to-amber-600',
    fully_returned: 'bg-gradient-to-br from-slate-400 to-slate-600',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse space-y-4 w-full max-w-4xl">
          <div className="h-8 bg-muted rounded-lg w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-2xl" />
            ))}
          </div>
          <div className="h-80 bg-muted rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">لوحة التحكم</h1>
          <p className="text-muted-foreground text-sm mt-1.5">
            مرحباً،{' '}
            <span
              className="font-semibold bg-gradient-to-l from-emerald-600 to-teal-500 bg-clip-text text-transparent"
            >
              {useAppStore.getState().user?.full_name || 'علي محمد الصادق'}
            </span>
          </p>
        </div>
        {hasPermission('invoices', 'create') && (
          <Button
            onClick={() => navigateTo('invoice-form')}
            className="gap-2 shadow-lg shadow-emerald-500/20 bg-gradient-to-l from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white border-0 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/30 hover:scale-[1.03]"
          >
            <Plus className="w-4 h-4" />
            فاتورة جديدة
          </Button>
        )}
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.4, delay: index * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <Card className="group border-0 shadow-md hover:shadow-xl hover:scale-[1.02] transition-all duration-300 overflow-hidden relative">
                {/* Top accent line */}
                <div className={`absolute top-0 right-0 left-0 h-1 bg-gradient-to-l ${card.accent}`} />
                <CardContent className="p-5 pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{card.title}</p>
                      <p className="text-2xl font-bold mt-2 tracking-tight">{card.value}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${card.gradient} shadow-lg shadow-black/5`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Net Spending Card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <Card className="border-0 shadow-lg bg-gradient-to-l from-emerald-600 via-emerald-700 to-teal-700 text-primary-foreground overflow-hidden relative">
          {/* Decorative background circles */}
          <div className="absolute -left-8 -top-8 w-32 h-32 rounded-full bg-white/5" />
          <div className="absolute -left-4 -bottom-10 w-24 h-24 rounded-full bg-white/5" />
          <CardContent className="p-6 flex items-center justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-primary-foreground/70 tracking-wide">صافي الصرف اليوم</p>
              <p className="text-4xl font-bold mt-2 tracking-tight">{formatCurrency(stats.netSpending)}</p>
              <p className="text-xs text-primary-foreground/50 mt-2 flex items-center gap-1">
                <span className="inline-block w-4 h-px bg-primary-foreground/30" />
                إجمالي الصرف - إجمالي المرتجعات
              </p>
            </div>
            <motion.div
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Activity className="w-16 h-16 text-primary-foreground/15" />
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.45, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="lg:col-span-2"
        >
          <Card className="border-0 shadow-md overflow-hidden">
            {/* Top gradient accent */}
            <div className="h-1 bg-gradient-to-l from-emerald-400 via-sky-400 to-purple-400" />
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-emerald-400 to-emerald-600" />
                <CardTitle className="text-lg tracking-tight">الصرف الشهري</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-72 bg-muted/20 rounded-xl p-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                    />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      stroke="var(--muted-foreground)"
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'var(--card)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        direction: 'rtl',
                        boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="total" name="الصرف" fill="oklch(0.52 0.11 172)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="returns" name="المرتجعات" fill="oklch(0.65 0.2 25)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="expenses" name="المصروفات" fill="oklch(0.55 0.2 300)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Branch Spending */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.55, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <Card className="border-0 shadow-md h-full overflow-hidden">
            <div className="h-1 bg-gradient-to-l from-sky-400 to-emerald-400" />
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-sky-400 to-emerald-500" />
                <div>
                  <CardTitle className="text-lg tracking-tight">أكثر الفروع صرفاً</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">هذا الشهر</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {branchSpending.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  لا توجد بيانات
                </div>
              ) : (
                <div className="space-y-4">
                  {branchSpending.map((branch, i) => (
                    <div key={branch.branch_id} className="group space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md flex items-center justify-center bg-gradient-to-br ${branchBarColors[i]} text-white text-[10px] font-bold shadow-sm`}>
                            {i + 1}
                          </div>
                          <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">{branch.branch_name}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{branch.invoice_count} فاتورة</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 bg-muted/60 rounded-full h-2.5 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min((branch.total / (branchSpending[0]?.total || 1)) * 100, 100)}%`,
                            }}
                            transition={{ duration: 0.8, delay: 0.6 + i * 0.1, ease: [0.25, 0.46, 0.45, 0.94] }}
                            className={`h-full rounded-full bg-gradient-to-l ${branchBarColors[i]} group-hover:shadow-md transition-shadow`}
                          />
                        </div>
                        <span className="text-xs font-semibold min-w-[80px] text-left tabular-nums">
                          {formatCurrency(branch.total)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <Card className="border-0 shadow-md overflow-hidden">
            <div className="h-1 bg-gradient-to-l from-amber-400 to-emerald-400" />
            <CardHeader className="pb-2 pt-5 flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-amber-400 to-emerald-500" />
                <CardTitle className="text-lg tracking-tight">آخر الفواتير</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:bg-primary/10 gap-1"
                onClick={() => navigateTo('invoices')}
              >
                عرض الكل
                <ArrowUpLeft className="w-4 h-4" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentInvoices.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  لا توجد فواتير
                </div>
              ) : (
                <div className="space-y-2">
                  {recentInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-sm border border-transparent hover:border-muted"
                      onClick={() => navigateTo('invoice-detail', { id: invoice.id })}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${invoiceStatusIcons[invoice.status] || 'bg-gradient-to-br from-slate-400 to-slate-600'} shadow-sm`}>
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {(invoice as unknown as { branches?: { name: string } })?.branches?.name || 'غير معروف'} • {formatDate(invoice.invoice_date)}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold tabular-nums">{formatCurrency(invoice.total)}</p>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${getStatusColor(invoice.status)}`}
                        >
                          {getStatusLabel(invoice.status)}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Top Items */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.75, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <Card className="border-0 shadow-md overflow-hidden">
            <div className="h-1 bg-gradient-to-l from-purple-400 to-amber-400" />
            <CardHeader className="pb-2 pt-5">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-purple-400 to-amber-500" />
                <div>
                  <CardTitle className="text-lg tracking-tight">أكثر الأصناف صرفاً</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">هذا الشهر</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {topItems.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  لا توجد بيانات
                </div>
              ) : (
                <div className="space-y-2">
                  {topItems.map((item, i) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between p-3 rounded-xl hover:bg-muted/50 transition-all duration-200 hover:scale-[1.01] border border-transparent hover:border-muted"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br ${rankGradients[i]} shadow-sm`}>
                          <span className="text-sm font-bold text-white">{i + 1}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{item.name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            كمية: {item.count.toLocaleString('ar-EG')}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-bold tabular-nums">{formatCurrency(item.total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
