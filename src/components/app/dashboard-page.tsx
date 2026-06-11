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

      // Monthly chart data (last 6 months)
      const monthlyPromises: Promise<{ month: string; total: number; returns: number; net: number }>[] = [];
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
          ]).then(([invRes, retRes]) => {
            const total = (invRes.data || []).reduce((s, i) => s + Number(i.total), 0);
            const returns = (retRes.data || []).reduce((s, r) => s + Number(r.total), 0);
            return {
              month: monthLabel,
              total,
              returns,
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
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      title: 'صرف اليوم',
      value: formatCurrency(stats.todayTotal),
      icon: TrendingUp,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      title: 'مرتجعات اليوم',
      value: formatCurrency(stats.todayReturns),
      icon: RotateCcw,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      title: 'فروع نشطة',
      value: stats.activeBranches,
      icon: Building2,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse space-y-4 w-full max-w-4xl">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-xl" />
            ))}
          </div>
          <div className="h-80 bg-muted rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">لوحة التحكم</h1>
          <p className="text-muted-foreground text-sm mt-1">
            مرحباً، {useAppStore.getState().user?.full_name || 'علي محمد الصادق'}
          </p>
        </div>
        {hasPermission('invoices', 'create') && (
          <Button
            onClick={() => navigateTo('invoice-form')}
            className="gap-2 shadow-md"
          >
            <Plus className="w-4 h-4" />
            فاتورة جديدة
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.title}</p>
                      <p className="text-2xl font-bold mt-1">{card.value}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${card.bg}`}>
                      <Icon className={`w-6 h-6 ${card.color}`} />
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card className="border-0 shadow-md bg-gradient-to-l from-primary to-emerald-700 text-primary-foreground">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-primary-foreground/80">صافي الصرف اليوم</p>
              <p className="text-3xl font-bold mt-1">{formatCurrency(stats.netSpending)}</p>
              <p className="text-xs text-primary-foreground/60 mt-1">
                إجمالي الصرف - إجمالي المرتجعات
              </p>
            </div>
            <Activity className="w-12 h-12 text-primary-foreground/30" />
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">الصرف الشهري</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
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
                        borderRadius: '8px',
                        direction: 'rtl',
                      }}
                    />
                    <Legend />
                    <Bar dataKey="total" name="الصرف" fill="oklch(0.52 0.11 172)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="returns" name="المرتجعات" fill="oklch(0.65 0.2 25)" radius={[4, 4, 0, 0]} />
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
          transition={{ duration: 0.3, delay: 0.6 }}
        >
          <Card className="border-0 shadow-md h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">أكثر الفروع صرفاً</CardTitle>
              <p className="text-xs text-muted-foreground">هذا الشهر</p>
            </CardHeader>
            <CardContent>
              {branchSpending.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  لا توجد بيانات
                </div>
              ) : (
                <div className="space-y-4">
                  {branchSpending.map((branch, i) => (
                    <div key={branch.branch_id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium truncate">{branch.branch_name}</span>
                        <span className="text-muted-foreground text-xs">{branch.invoice_count} فاتورة</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{
                              width: `${Math.min((branch.total / (branchSpending[0]?.total || 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold min-w-[80px] text-left">
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
          transition={{ duration: 0.3, delay: 0.7 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2 flex-row items-center justify-between">
              <CardTitle className="text-lg">آخر الفواتير</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="text-primary"
                onClick={() => navigateTo('invoices')}
              >
                عرض الكل
                <ArrowUpLeft className="w-4 h-4 mr-1" />
              </Button>
            </CardHeader>
            <CardContent>
              {recentInvoices.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  لا توجد فواتير
                </div>
              ) : (
                <div className="space-y-3">
                  {recentInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigateTo('invoice-detail', { id: invoice.id })}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{invoice.invoice_number}</p>
                          <p className="text-xs text-muted-foreground">
                            {(invoice as unknown as { branches?: { name: string } })?.branches?.name || 'غير معروف'} • {formatDate(invoice.invoice_date)}
                          </p>
                        </div>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold">{formatCurrency(invoice.total)}</p>
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${getStatusColor(invoice.status)}`}
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
          transition={{ duration: 0.3, delay: 0.8 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">أكثر الأصناف صرفاً</CardTitle>
              <p className="text-xs text-muted-foreground">هذا الشهر</p>
            </CardHeader>
            <CardContent>
              {topItems.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                  لا توجد بيانات
                </div>
              ) : (
                <div className="space-y-3">
                  {topItems.map((item, i) => (
                    <div
                      key={item.name}
                      className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary/20 flex items-center justify-center text-sm font-bold text-secondary-foreground">
                          {i + 1}
                        </div>
                        <div>
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            كمية: {item.count.toLocaleString('ar-EG')}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold">{formatCurrency(item.total)}</p>
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
