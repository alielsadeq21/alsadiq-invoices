'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { formatCurrency, formatDate, getStatusLabel, getStatusColor } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileText,
  Package,
  Building2,
  Calendar,
  ArrowUpDown,
  Download,
  Search,
  Hash,
  DollarSign,
  Receipt,
  Eye,
  ArrowUpRight,
  Calculator,
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
import type { Branch, Invoice } from '@/lib/types';

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

const CHART_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

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
export default function SalesPage() {
  const { user, isAdmin, hasPermission, navigateTo } = useAppStore();
  const canView = isAdmin || hasPermission('sales', 'view');
  const canExport = isAdmin || hasPermission('sales', 'export');

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [period, setPeriod] = useState('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [summaryData, setSummaryData] = useState({
    totalSales: 0,
    totalReturns: 0,
    netSales: 0,
    avgInvoice: 0,
    invoiceCount: 0,
    totalTax: 0,
  });

  const [byBranch, setByBranch] = useState<{ name: string; total: number }[]>([]);
  const [byProduct, setByProduct] = useState<{ name: string; qty: number; total: number }[]>([]);
  const [dailyTrend, setDailyTrend] = useState<{ date: string; sales: number; returns: number }[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<any[]>([]);

  // ── Derived date range ──────────────────────────────────────────────────────
  const dateFrom = useMemo(() => {
    if (period === 'custom') return customFrom;
    return getStartDate(period);
  }, [period, customFrom]);

  const dateTo = useMemo(() => {
    if (period === 'custom') return customTo || new Date().toISOString().split('T')[0];
    return new Date().toISOString().split('T')[0];
  }, [period, customTo]);

  // ── Load branches ───────────────────────────────────────────────────────────
  useEffect(() => {
    const loadBranches = async () => {
      let query = supabase.from('branches').select('*').eq('is_active', true).order('name');
      if (!isAdmin && user?.branch_id) query = query.eq('id', user.branch_id);
      const { data } = await query;
      if (data) setBranches(data as Branch[]);
    };
    loadBranches();
  }, [isAdmin, user?.branch_id]);

  // ── Load all sales data ─────────────────────────────────────────────────────
  const loadSalesData = useCallback(async () => {
    if (!dateFrom && !dateTo && period !== 'year') return;
    setLoading(true);
    try {
      // 1. Load invoices
      let invQ = supabase
        .from('invoices')
        .select('id, invoice_number, total, tax_amount, branch_id, invoice_date, status, branches(name), customers(name), items:invoice_items(item_name, quantity, total_price)', { count: 'exact' })
        .neq('status', 'cancelled');

      if (dateFrom) invQ = invQ.gte('invoice_date', dateFrom);
      if (dateTo) invQ = invQ.lte('invoice_date', dateTo);
      if (!isAdmin && user?.branch_id) invQ = invQ.eq('branch_id', user.branch_id);
      if (branchFilter !== 'all') invQ = invQ.eq('branch_id', branchFilter);

      const { data: invoices, count: invCount } = await invQ;

      // 2. Load returns
      let retQ = supabase.from('returns').select('total, branch_id, return_date');
      if (dateFrom) retQ = retQ.gte('return_date', dateFrom);
      if (dateTo) retQ = retQ.lte('return_date', dateTo);
      if (!isAdmin && user?.branch_id) retQ = retQ.eq('branch_id', user.branch_id);
      if (branchFilter !== 'all') retQ = retQ.eq('branch_id', branchFilter);

      const { data: returns } = await retQ;

      const invList: any[] = invoices || [];
      const retList: any[] = returns || [];

      // 3. Calculate summary
      const totalSales = invList.reduce((s, i) => s + Number(i.total), 0);
      const totalReturns = retList.reduce((s, r) => s + Number(r.total), 0);
      const totalTax = invList.reduce((s, i) => s + Number(i.tax_amount || 0), 0);
      const invoiceCount = invList.length;

      setSummaryData({
        totalSales,
        totalReturns,
        netSales: totalSales - totalReturns,
        avgInvoice: invoiceCount > 0 ? totalSales / invoiceCount : 0,
        invoiceCount,
        totalTax,
      });

      // 4. By branch
      const branchMap: Record<string, { name: string; total: number }> = {};
      invList.forEach((inv) => {
        const bName = inv.branches?.name || 'غير معروف';
        if (!branchMap[inv.branch_id]) branchMap[inv.branch_id] = { name: bName, total: 0 };
        branchMap[inv.branch_id].total += Number(inv.total);
      });
      setByBranch(Object.values(branchMap).sort((a, b) => b.total - a.total));

      // 5. By product
      const productMap: Record<string, { name: string; qty: number; total: number }> = {};
      invList.forEach((inv) => {
        (inv.items || []).forEach((item: any) => {
          const name = item.item_name || 'غير معروف';
          if (!productMap[name]) productMap[name] = { name, qty: 0, total: 0 };
          productMap[name].qty += Number(item.quantity || 0);
          productMap[name].total += Number(item.total_price || 0);
        });
      });
      setByProduct(Object.values(productMap).sort((a, b) => b.total - a.total).slice(0, 10));

      // 6. Daily trend (last 30 days)
      const dailyMap: Record<string, { sales: number; returns: number }> = {};
      invList.forEach((inv) => {
        const d = inv.invoice_date;
        if (!dailyMap[d]) dailyMap[d] = { sales: 0, returns: 0 };
        dailyMap[d].sales += Number(inv.total);
      });
      retList.forEach((ret) => {
        const d = ret.return_date;
        if (!dailyMap[d]) dailyMap[d] = { sales: 0, returns: 0 };
        dailyMap[d].returns += Number(ret.total);
      });
      const trend = Object.entries(dailyMap)
        .map(([date, data]) => ({ date, ...data }))
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(-30);
      setDailyTrend(trend);

      // 7. Recent invoices (last 10)
      const recent = invList
        .sort((a: any, b: any) => new Date(b.created_at || b.invoice_date).getTime() - new Date(a.created_at || a.invoice_date).getTime())
        .slice(0, 10);
      setRecentInvoices(recent);

    } catch (err) {
      console.error('Error loading sales data:', err);
      toast.error('حدث خطأ أثناء تحميل بيانات المبيعات');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, branchFilter, isAdmin, user?.branch_id, period]);

  useEffect(() => {
    if (canView) loadSalesData();
  }, [loadSalesData, canView]);

  // ── Export ──────────────────────────────────────────────────────────────────
  const handleExport = () => {
    const rows: string[][] = [];
    rows.push(['إجمالي المبيعات', summaryData.totalSales.toFixed(2)]);
    rows.push(['إجمالي المرتجعات', summaryData.totalReturns.toFixed(2)]);
    rows.push(['صافي المبيعات', summaryData.netSales.toFixed(2)]);
    rows.push(['عدد الفواتير', summaryData.invoiceCount.toString()]);
    rows.push(['متوسط قيمة الفاتورة', summaryData.avgInvoice.toFixed(2)]);
    rows.push(['إجمالي الضريبة', summaryData.totalTax.toFixed(2)]);
    rows.push([]);
    rows.push(['الفرع', 'إجمالي المبيعات']);
    byBranch.forEach((b) => rows.push([b.name, b.total.toFixed(2)]));
    rows.push([]);
    rows.push(['المنتج', 'الكمية', 'الإجمالي']);
    byProduct.forEach((p) => rows.push([p.name, p.qty.toString(), p.total.toFixed(2)]));
    exportCSV('تقرير_المبيعات', ['البند', 'القيمة'], rows);
  };

  // ── Tooltip style ──────────────────────────────────────────────────────────
  const tooltipStyle = {
    backgroundColor: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    direction: 'rtl' as const,
    fontSize: 12,
  };

  // ── Permission denied ──────────────────────────────────────────────────────
  if (!canView) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <TrendingUp className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-xl font-bold">غير مسموح</h2>
          <p className="text-muted-foreground text-sm text-center max-w-xs">
            ليس لديك صلاحية لعرض صفحة المبيعات
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ─── Header ─── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="sm:flex-row sm:items-center sm:justify-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shadow-lg shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight">المبيعات</h1>
              <p className="text-muted-foreground text-[11px] sm:text-sm mt-0.5">
                ملخص شامل لعمليات البيع والإيرادات
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {hasPermission('invoices', 'create') && (
              <Button
                onClick={() => navigateTo('invoice-form')}
                className="gap-2 text-white shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shrink-0"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">فاتورة جديدة</span>
                <span className="sm:hidden">فاتورة</span>
              </Button>
            )}
            {canExport && (
              <Button
                variant="outline"
                onClick={handleExport}
                className="gap-2 shrink-0"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">تصدير</span>
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ─── Filters ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Card className="border-0 shadow-md overflow-hidden relative">
          <div className="absolute top-0 right-0 left-0 h-1 bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
          <CardContent className="p-3 sm:p-4 pt-4 sm:pt-5">
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
              <div>
                <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  الفترة
                </Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger className="h-9 text-xs sm:text-sm">
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
              </div>
              {period === 'custom' && (
                <>
                  <div>
                    <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 block">من تاريخ</Label>
                    <Input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-9 text-xs sm:text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 block">إلى تاريخ</Label>
                    <Input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-9 text-xs sm:text-sm"
                    />
                  </div>
                </>
              )}
              {isAdmin && (
                <div>
                  <Label className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    الفرع
                  </Label>
                  <Select value={branchFilter} onValueChange={setBranchFilter}>
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
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── Summary Cards ─── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          {/* Total Sales */}
          <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">إجمالي المبيعات</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(summaryData.totalSales)}</p>
            </CardContent>
          </Card>

          {/* Total Returns */}
          <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  <TrendingDown className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">المرتجعات</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(summaryData.totalReturns)}</p>
            </CardContent>
          </Card>

          {/* Net Sales */}
          <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                  <BarChart3 className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">صافي المبيعات</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(summaryData.netSales)}</p>
            </CardContent>
          </Card>

          {/* Invoice Count */}
          <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)' }}>
                  <Hash className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">عدد الفواتير</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-violet-600 dark:text-violet-400">{summaryData.invoiceCount}</p>
            </CardContent>
          </Card>

          {/* Avg Invoice */}
          <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                  <ArrowUpDown className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">متوسط الفاتورة</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-amber-600 dark:text-amber-400">{formatCurrency(summaryData.avgInvoice)}</p>
            </CardContent>
          </Card>

          {/* Total Tax */}
          <Card className="border-0 shadow-md hover:shadow-lg transition-all duration-300 group overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} className="mb-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform" style={{ background: 'linear-gradient(135deg, #06b6d4, #0891b2)' }}>
                  <Calculator className="w-4 h-4 text-white" />
                </div>
                <span className="text-[10px] sm:text-xs text-muted-foreground font-medium">الضريبة المحصلة</span>
              </div>
              <p className="text-base sm:text-xl font-bold text-cyan-600 dark:text-cyan-400">{formatCurrency(summaryData.totalTax)}</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="py-12">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="text-muted-foreground text-sm mr-3">جاري تحليل البيانات...</p>
        </div>
      ) : (
        <>
          {/* ─── Charts Row ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            {/* Daily Trend Chart */}
            {dailyTrend.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 }}
              >
                <Card className="border-0 shadow-md overflow-hidden">
                  <div className="h-[3px] bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                        <TrendingUp className="w-3.5 h-3.5 text-white" />
                      </div>
                      اتجاه المبيعات اليومية
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56 sm:h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={dailyTrend}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis
                            dataKey="date"
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => {
                              const d = new Date(v);
                              return `${d.getDate()}/${d.getMonth() + 1}`;
                            }}
                          />
                          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                          <Legend />
                          <Line type="monotone" dataKey="sales" name="المبيعات" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Line type="monotone" dataKey="returns" name="المرتجعات" stroke="#ef4444" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Sales by Branch Chart */}
            {byBranch.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.2 }}
              >
                <Card className="border-0 shadow-md overflow-hidden">
                  <div className="h-[3px] bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                        <Building2 className="w-3.5 h-3.5 text-white" />
                      </div>
                      المبيعات حسب الفرع
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-56 sm:h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={byBranch} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={tooltipStyle} />
                          <Bar dataKey="total" name="المبيعات" fill="#10b981" radius={[0, 6, 6, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </div>

          {/* ─── Products Section ─── */}
          {byProduct.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.25 }}
            >
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px] bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                      <Package className="w-3.5 h-3.5 text-white" />
                    </div>
                    أكثر المنتجات مبيعاً
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Mobile Cards */}
                  <div className="sm:hidden p-3 space-y-2 max-h-80 overflow-y-auto">
                    {byProduct.map((p, i) => (
                      <div
                        key={i}
                        className="rounded-xl border-r-4 border-amber-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}
                            >
                              {i + 1}
                            </div>
                            <span className="font-medium text-sm truncate">{p.name}</span>
                          </div>
                          <span className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(p.total)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 mr-9">الكمية المباعة: {p.qty.toLocaleString('ar-EG')}</p>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <div className="h-[3px] bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                    <ScrollArea className="max-h-96">
                      <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="text-right w-12">#</TableHead>
                            <TableHead className="text-right">المنتج</TableHead>
                            <TableHead className="text-center">الكمية المباعة</TableHead>
                            <TableHead className="text-right">الإجمالي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {byProduct.map((p, i) => (
                            <TableRow key={i} className="hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors">
                              <TableCell>
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white' }}>
                                  {i + 1}
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-center">{p.qty.toLocaleString('ar-EG')}</TableCell>
                              <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(p.total)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ─── Recent Invoices ─── */}
          {recentInvoices.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
            >
              <Card className="border-0 shadow-md overflow-hidden">
                <div className="h-[3px] bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm sm:text-base flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                      <FileText className="w-3.5 h-3.5 text-white" />
                    </div>
                    آخر الفواتير
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigateTo('invoices')}
                    className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/20"
                  >
                    عرض الكل
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Mobile Cards */}
                  <div className="sm:hidden divide-y">
                    {recentInvoices.map((inv) => (
                      <div
                        key={inv.id}
                        className="p-3.5 cursor-pointer hover:bg-muted/30 transition-colors"
                        onClick={() => navigateTo('invoice-detail', { id: inv.id })}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="mb-1.5">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              <FileText className="w-3.5 h-3.5 text-white" />
                            </div>
                            <div>
                              <span className="font-semibold text-sm">{inv.invoice_number}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="mt-0.5">
                                <Building2 className="w-3 h-3 text-muted-foreground" />
                                <span className="text-[11px] text-muted-foreground">{inv.branches?.name || ''}</span>
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                            <span className="font-bold text-sm">{formatCurrency(inv.total)}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(inv.invoice_date)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table */}
                  <div className="hidden sm:block">
                    <div className="h-[3px] bg-gradient-to-l from-emerald-500 via-teal-500 to-cyan-500" />
                    <div style={{ overflowX: 'auto' }}>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30 hover:bg-muted/30">
                            <TableHead className="text-right">رقم الفاتورة</TableHead>
                            <TableHead className="text-right">الفرع</TableHead>
                            <TableHead className="text-right hidden md:table-cell">العميل</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                            <TableHead className="text-right">الإجمالي</TableHead>
                            <TableHead className="text-center">الحالة</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentInvoices.map((inv) => (
                            <TableRow
                              key={inv.id}
                              className="cursor-pointer hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors"
                              onClick={() => navigateTo('invoice-detail', { id: inv.id })}
                            >
                              <TableCell>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                                    <FileText className="w-3.5 h-3.5 text-white" />
                                  </div>
                                  <span className="font-semibold text-sm">{inv.invoice_number}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  <Building2 className="w-3.5 h-3.5" />
                                  {inv.branches?.name || '—'}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm hidden md:table-cell">{inv.customers?.name || '—'}</TableCell>
                              <TableCell className="text-sm hidden sm:table-cell">{formatDate(inv.invoice_date)}</TableCell>
                              <TableCell className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(inv.total)}</TableCell>
                              <TableCell className="text-center">
                                <Badge variant="secondary" className={getStatusColor(inv.status)}>
                                  {getStatusLabel(inv.status)}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Empty state */}
          {byBranch.length === 0 && byProduct.length === 0 && dailyTrend.length === 0 && recentInvoices.length === 0 && !loading && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="border-0 shadow-md overflow-hidden">
                <CardContent className="p-0">
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-5 shadow-xl shadow-emerald-200 dark:shadow-emerald-900/30">
                      <TrendingUp className="w-12 h-12 text-white" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد بيانات مبيعات</h3>
                    <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                      لم يتم العثور على عمليات بيع في الفترة المحددة. ابدأ بإنشاء فاتورة جديدة.
                    </p>
                    {hasPermission('invoices', 'create') && (
                      <Button
                        onClick={() => navigateTo('invoice-form')}
                        className="gap-2 shadow-lg text-white border-0 transition-all duration-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]"
                        size="lg"
                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
                      >
                        <FileText className="w-5 h-5" />
                        إنشاء فاتورة جديدة
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}
