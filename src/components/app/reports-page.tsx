'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  FileSpreadsheet,
  FileText,
  Calendar,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Package,
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function ReportsPage() {
  const { user, isAdmin, hasPermission } = useAppStore();
  const [activeTab, setActiveTab] = useState('daily');

  // Daily report
  const [dailyDate, setDailyDate] = useState(new Date().toISOString().split('T')[0]);
  const [dailyData, setDailyData] = useState({
    invoiceCount: 0,
    totalSpending: 0,
    totalReturns: 0,
    netSpending: 0,
    invoices: [] as any[],
  });

  // Monthly report
  const [monthlyMonth, setMonthlyMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [monthlyData, setMonthlyData] = useState({
    invoiceCount: 0,
    totalSpending: 0,
    totalReturns: 0,
    netSpending: 0,
    prevMonthTotal: 0,
    change: 0,
    dailyBreakdown: [] as any[],
  });

  // Branch report
  const [branchMonth, setBranchMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [branchData, setBranchData] = useState<any[]>([]);

  // Expenses report
  const [expMonth, setExpMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [expData, setExpData] = useState({
    totalExpenses: 0,
    count: 0,
    byCategory: [] as { name: string; total: number; count: number }[],
    byBranch: [] as { name: string; total: number; count: number }[],
    dailyBreakdown: [] as { day: string; total: number }[],
  });

  // Inventory report
  const [invData, setInvData] = useState({
    totalProducts: 0,
    totalValue: 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    byBranch: [] as { name: string; count: number; value: number }[],
    lowStockItems: [] as { product_name: string; branch_name: string; quantity: number; min_quantity: number }[],
  });

  // Permission checks
  const canExport = hasPermission('reports', 'export');

  useEffect(() => {
    loadDailyReport();
  }, [dailyDate]);

  useEffect(() => {
    loadMonthlyReport();
  }, [monthlyMonth]);

  useEffect(() => {
    loadBranchReport();
  }, [branchMonth]);

  useEffect(() => {
    loadExpensesReport();
  }, [expMonth]);

  useEffect(() => {
    loadInventoryReport();
  }, []);

  const loadDailyReport = async () => {
    try {
      let invoiceQuery = supabase
        .from('invoices')
        .select('*, branches(name), items:invoice_items(*)')
        .eq('invoice_date', dailyDate)
        .eq('status', 'active');

      // Filter by branch for non-admin users
      if (!isAdmin && user?.branch_id) {
        invoiceQuery = invoiceQuery.eq('branch_id', user.branch_id);
      }

      const { data: invoices } = await invoiceQuery;

      let returnQuery = supabase
        .from('returns')
        .select('total')
        .eq('return_date', dailyDate);

      // Filter returns by branch for non-admin users
      if (!isAdmin && user?.branch_id) {
        returnQuery = returnQuery.eq('branch_id', user.branch_id);
      }

      const { data: returns } = await returnQuery;

      const totalSpending = (invoices || []).reduce((s, i) => s + Number(i.total), 0);
      const totalReturns = (returns || []).reduce((s, r) => s + Number(r.total), 0);

      setDailyData({
        invoiceCount: invoices?.length || 0,
        totalSpending,
        totalReturns,
        netSpending: totalSpending - totalReturns,
        invoices: invoices || [],
      });
    } catch (err) {
      console.error(err);
    }
  };

  const loadMonthlyReport = async () => {
    try {
      const [year, month] = monthlyMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthStart = startOfMonth(monthDate).toISOString().split('T')[0];
      const monthEnd = endOfMonth(monthDate).toISOString().split('T')[0];

      let invoiceQuery = supabase
        .from('invoices')
        .select('total, invoice_date')
        .gte('invoice_date', monthStart)
        .lte('invoice_date', monthEnd)
        .eq('status', 'active');

      if (!isAdmin && user?.branch_id) {
        invoiceQuery = invoiceQuery.eq('branch_id', user.branch_id);
      }

      const { data: invoices } = await invoiceQuery;

      let returnQuery = supabase
        .from('returns')
        .select('total')
        .gte('return_date', monthStart)
        .lte('return_date', monthEnd);

      if (!isAdmin && user?.branch_id) {
        returnQuery = returnQuery.eq('branch_id', user.branch_id);
      }

      const { data: returns } = await returnQuery;

      const totalSpending = (invoices || []).reduce((s, i) => s + Number(i.total), 0);
      const totalReturns = (returns || []).reduce((s, r) => s + Number(r.total), 0);

      // Previous month
      const prevMonth = subMonths(monthDate, 1);
      const prevStart = startOfMonth(prevMonth).toISOString().split('T')[0];
      const prevEnd = endOfMonth(prevMonth).toISOString().split('T')[0];

      let prevInvoiceQuery = supabase
        .from('invoices')
        .select('total')
        .gte('invoice_date', prevStart)
        .lte('invoice_date', prevEnd)
        .eq('status', 'active');

      if (!isAdmin && user?.branch_id) {
        prevInvoiceQuery = prevInvoiceQuery.eq('branch_id', user.branch_id);
      }

      const { data: prevInvoices } = await prevInvoiceQuery;

      const prevTotal = (prevInvoices || []).reduce((s, i) => s + Number(i.total), 0);
      const change = prevTotal > 0 ? ((totalSpending - prevTotal) / prevTotal) * 100 : 0;

      // Daily breakdown
      const dailyMap: Record<string, number> = {};
      (invoices || []).forEach((inv) => {
        const day = inv.invoice_date;
        dailyMap[day] = (dailyMap[day] || 0) + Number(inv.total);
      });

      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const dailyBreakdown: { day: string; total: number }[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${year}-${month}-${d.toString().padStart(2, '0')}`;
        dailyBreakdown.push({
          day: d.toString(),
          total: dailyMap[dayStr] || 0,
        });
      }

      setMonthlyData({
        invoiceCount: invoices?.length || 0,
        totalSpending,
        totalReturns,
        netSpending: totalSpending - totalReturns,
        prevMonthTotal: prevTotal,
        change,
        dailyBreakdown,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const loadBranchReport = async () => {
    try {
      const [year, month] = branchMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthStart = startOfMonth(monthDate).toISOString().split('T')[0];
      const monthEnd = endOfMonth(monthDate).toISOString().split('T')[0];

      let invoiceQuery = supabase
        .from('invoices')
        .select('branch_id, total, branches(name)')
        .gte('invoice_date', monthStart)
        .lte('invoice_date', monthEnd)
        .eq('status', 'active');

      // For non-admin users, only show their branch
      if (!isAdmin && user?.branch_id) {
        invoiceQuery = invoiceQuery.eq('branch_id', user.branch_id);
      }

      const { data: invoices } = await invoiceQuery;

      const branchMap: Record<string, { name: string; total: number; count: number }> = {};
      (invoices || []).forEach((inv: any) => {
        const bName = inv.branches?.name || 'غير معروف';
        if (!branchMap[inv.branch_id]) {
          branchMap[inv.branch_id] = { name: bName, total: 0, count: 0 };
        }
        branchMap[inv.branch_id].total += Number(inv.total);
        branchMap[inv.branch_id].count += 1;
      });

      const branchList = Object.entries(branchMap)
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.total - a.total);

      setBranchData(branchList);
    } catch (err) {
      console.error(err);
    }
  };

  const loadExpensesReport = async () => {
    try {
      const [year, month] = expMonth.split('-');
      const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthStart = startOfMonth(monthDate).toISOString().split('T')[0];
      const monthEnd = endOfMonth(monthDate).toISOString().split('T')[0];

      let query = supabase
        .from('expenses')
        .select('amount, category_id, branch_id, expense_date, expense_categories(name), branches(name)')
        .gte('expense_date', monthStart)
        .lte('expense_date', monthEnd);

      if (!isAdmin && user?.branch_id) {
        query = query.eq('branch_id', user.branch_id);
      }

      const { data } = await query;
      const expenses = data || [];

      const totalExpenses = expenses.reduce((s: number, e: any) => s + Number(e.amount), 0);

      // By category
      const catMap: Record<string, { name: string; total: number; count: number }> = {};
      expenses.forEach((e: any) => {
        const catName = e.expense_categories?.name || 'غير مصنف';
        if (!catMap[catName]) catMap[catName] = { name: catName, total: 0, count: 0 };
        catMap[catName].total += Number(e.amount);
        catMap[catName].count += 1;
      });
      const byCategory = Object.values(catMap).sort((a, b) => b.total - a.total);

      // By branch
      const brMap: Record<string, { name: string; total: number; count: number }> = {};
      expenses.forEach((e: any) => {
        const brName = e.branches?.name || 'غير معروف';
        if (!brMap[brName]) brMap[brName] = { name: brName, total: 0, count: 0 };
        brMap[brName].total += Number(e.amount);
        brMap[brName].count += 1;
      });
      const byBranch = Object.values(brMap).sort((a, b) => b.total - a.total);

      // Daily breakdown
      const dailyMap: Record<string, number> = {};
      expenses.forEach((e: any) => {
        dailyMap[e.expense_date] = (dailyMap[e.expense_date] || 0) + Number(e.amount);
      });
      const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
      const dailyBreakdown: { day: string; total: number }[] = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dayStr = `${year}-${month}-${d.toString().padStart(2, '0')}`;
        dailyBreakdown.push({ day: d.toString(), total: dailyMap[dayStr] || 0 });
      }

      setExpData({ totalExpenses, count: expenses.length, byCategory, byBranch, dailyBreakdown });
    } catch (err) {
      console.error(err);
    }
  };

  const loadInventoryReport = async () => {
    try {
      const { data: invData } = await supabase
        .from('inventory')
        .select('quantity, min_quantity, product_id, branch_id, products(name, unit_price), branches(name)');

      let items: any[] = invData || [];
      if (!isAdmin && user?.branch_id) {
        items = items.filter((i: any) => i.branch_id === user.branch_id);
      }

      const totalProducts = items.length;
      const totalValue = items.reduce((s: number, i: any) => s + (Number(i.quantity) * Number(i.products?.unit_price || 0)), 0);
      const lowStockItems = items.filter((i: any) => Number(i.quantity) <= Number(i.min_quantity || 0) && Number(i.quantity) > 0);
      const outOfStockItems = items.filter((i: any) => Number(i.quantity) <= 0);

      // By branch
      const brMap: Record<string, { name: string; count: number; value: number }> = {};
      items.forEach((i: any) => {
        const brName = i.branches?.name || 'غير معروف';
        if (!brMap[brName]) brMap[brName] = { name: brName, count: 0, value: 0 };
        brMap[brName].count += 1;
        brMap[brName].value += Number(i.quantity) * Number(i.products?.unit_price || 0);
      });
      const byBranch = Object.values(brMap);

      const lowStockList = [...lowStockItems, ...outOfStockItems].map((i: any) => ({
        product_name: i.products?.name || 'غير معروف',
        branch_name: i.branches?.name || 'غير معروف',
        quantity: Number(i.quantity),
        min_quantity: Number(i.min_quantity || 0),
      }));

      setInvData({
        totalProducts,
        totalValue,
        lowStockCount: lowStockItems.length,
        outOfStockCount: outOfStockItems.length,
        byBranch,
        lowStockItems: lowStockList,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      if (activeTab === 'daily') {
        const wsData = [
          ['تقرير يومي', dailyDate],
          [],
          ['عدد الفواتير', dailyData.invoiceCount],
          ['إجمالي الصرف', dailyData.totalSpending],
          ['إجمالي المرتجعات', dailyData.totalReturns],
          ['صافي الصرف', dailyData.netSpending],
          [],
          ['رقم الفاتورة', 'الفرع', 'الإجمالي', 'الحالة'],
          ...dailyData.invoices.map((inv: any) => [
            inv.invoice_number,
            inv.branches?.name || '',
            inv.total,
            inv.status,
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير يومي');
      } else if (activeTab === 'monthly') {
        const wsData = [
          ['تقرير شهري', monthlyMonth],
          [],
          ['عدد الفواتير', monthlyData.invoiceCount],
          ['إجمالي الصرف', monthlyData.totalSpending],
          ['إجمالي المرتجعات', monthlyData.totalReturns],
          ['صافي الصرف', monthlyData.netSpending],
          ['صرف الشهر السابق', monthlyData.prevMonthTotal],
          ['نسبة التغيير', `${monthlyData.change.toFixed(1)}%`],
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير شهري');
      } else if (activeTab === 'branch') {
        const wsData = [
          ['تقرير الفروع', branchMonth],
          [],
          ['الفرع', 'عدد الفواتير', 'الإجمالي'],
          ...branchData.map((b) => [b.name, b.count, b.total]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير الفروع');
      } else if (activeTab === 'expenses') {
        const wsData = [
          ['تقرير المصروفات', expMonth],
          [],
          ['عدد المصروفات', expData.count],
          ['إجمالي المصروفات', expData.totalExpenses],
          [],
          ['التصنيف', 'العدد', 'الإجمالي'],
          ...expData.byCategory.map((c) => [c.name, c.count, c.total]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير المصروفات');
      } else if (activeTab === 'inventory') {
        const wsData = [
          ['تقرير المخزون'],
          [],
          ['إجمالي الأصناف', invData.totalProducts],
          ['إجمالي القيمة', invData.totalValue],
          ['مخزون منخفض', invData.lowStockCount],
          ['نفد المخزون', invData.outOfStockCount],
          [],
          ['المنتج', 'الفرع', 'الكمية', 'الحد الأدنى'],
          ...invData.lowStockItems.map((i) => [i.product_name, i.branch_name, i.quantity, i.min_quantity]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير المخزون');
      }

      XLSX.writeFile(wb, `تقرير_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
      toast.success('تم تصدير ملف Excel');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في التصدير');
    }
  };

  const exportPDF = async () => {
    toast.info('جاري إنشاء ملف PDF...');
    try {
      const html2canvas = (await import('html2canvas')).default;
      const jsPDF = (await import('jspdf')).default;

      const reportEl = document.getElementById(`report-${activeTab}`);
      if (!reportEl) return;

      const canvas = await html2canvas(reportEl, { scale: 2, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`تقرير_${activeTab}_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast.success('تم تحميل ملف PDF');
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ في إنشاء PDF');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">التقارير</h1>
          <p className="text-muted-foreground text-sm mt-1">
            تقارير الصرف والمرتجعات
            {!isAdmin && user?.branch_name && ` - فرع ${user.branch_name}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Button variant="outline" onClick={exportExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4" />
                Excel
              </Button>
              <Button variant="outline" onClick={exportPDF} className="gap-2">
                <FileText className="w-4 h-4" />
                PDF
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="daily" className="gap-1">
            <Calendar className="w-4 h-4" />
            يومي
          </TabsTrigger>
          <TabsTrigger value="monthly" className="gap-1">
            <BarChart3 className="w-4 h-4" />
            شهري
          </TabsTrigger>
          <TabsTrigger value="branch" className="gap-1">
            <TrendingUp className="w-4 h-4" />
            حسب الفرع
          </TabsTrigger>
          <TabsTrigger value="expenses" className="gap-1">
            <TrendingDown className="w-4 h-4" />
            مصروفات
          </TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1">
            <Package className="w-4 h-4" />
            مخزون
          </TabsTrigger>
        </TabsList>

        {/* Daily Report */}
        <TabsContent value="daily" className="space-y-4 mt-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label>تاريخ التقرير</Label>
                <Input
                  type="date"
                  value={dailyDate}
                  onChange={(e) => setDailyDate(e.target.value)}
                  className="w-48"
                />
              </div>
            </CardContent>
          </Card>

          <div id="report-daily" className="space-y-4 bg-white p-4 rounded-lg">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">عدد الفواتير</p>
                  <p className="text-2xl font-bold text-primary mt-1">{dailyData.invoiceCount}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي الصرف</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(dailyData.totalSpending)}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي المرتجعات</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(dailyData.totalReturns)}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm bg-primary/5">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">صافي الصرف</p>
                  <p className="text-2xl font-bold text-primary mt-1">{formatCurrency(dailyData.netSpending)}</p>
                </CardContent>
              </Card>
            </div>

            {dailyData.invoices.length > 0 && (
              <Card className="border shadow-sm">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">رقم الفاتورة</TableHead>
                        <TableHead className="text-right">الفرع</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                        <TableHead className="text-center">عدد الأصناف</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyData.invoices.map((inv: any) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>{inv.branches?.name || '—'}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(inv.total)}</TableCell>
                          <TableCell className="text-center">{inv.items?.length || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Monthly Report */}
        <TabsContent value="monthly" className="space-y-4 mt-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label>الشهر</Label>
                <Input
                  type="month"
                  value={monthlyMonth}
                  onChange={(e) => setMonthlyMonth(e.target.value)}
                  className="w-48"
                />
              </div>
            </CardContent>
          </Card>

          <div id="report-monthly" className="space-y-4 bg-white p-4 rounded-lg">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">عدد الفواتير</p>
                  <p className="text-2xl font-bold text-primary mt-1">{monthlyData.invoiceCount}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي الصرف</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(monthlyData.totalSpending)}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">صرف الشهر السابق</p>
                  <p className="text-2xl font-bold text-gray-500 mt-1">{formatCurrency(monthlyData.prevMonthTotal)}</p>
                </CardContent>
              </Card>
              <Card className={`border shadow-sm ${monthlyData.change >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">نسبة التغيير</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {monthlyData.change >= 0 ? (
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-600" />
                    )}
                    <p className={`text-2xl font-bold ${monthlyData.change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {Math.abs(monthlyData.change).toFixed(1)}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Chart */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">الصرف اليومي خلال الشهر</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="total" name="الصرف" fill="oklch(0.52 0.11 172)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Branch Report */}
        <TabsContent value="branch" className="space-y-4 mt-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label>الشهر</Label>
                <Input
                  type="month"
                  value={branchMonth}
                  onChange={(e) => setBranchMonth(e.target.value)}
                  className="w-48"
                />
              </div>
            </CardContent>
          </Card>

          <div id="report-branch" className="space-y-4 bg-white p-4 rounded-lg">
            {branchData.length > 0 && (
              <>
                <Card className="border shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">صرف الفروع هذا الشهر</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={branchData} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                          <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                          <Bar dataKey="total" name="الصرف" fill="oklch(0.52 0.11 172)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border shadow-sm">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">الفرع</TableHead>
                          <TableHead className="text-center">عدد الفواتير</TableHead>
                          <TableHead className="text-right">الإجمالي</TableHead>
                          <TableHead className="text-right">النسبة</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchData.map((branch) => {
                          const grandTotal = branchData.reduce((s: number, b: any) => s + b.total, 0);
                          const percentage = grandTotal > 0 ? (branch.total / grandTotal) * 100 : 0;
                          return (
                            <TableRow key={branch.id}>
                              <TableCell className="font-medium">{branch.name}</TableCell>
                              <TableCell className="text-center">{branch.count}</TableCell>
                              <TableCell className="font-semibold">{formatCurrency(branch.total)}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden max-w-[100px]">
                                    <div
                                      className="h-full bg-primary rounded-full"
                                      style={{ width: `${percentage}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-muted-foreground">{percentage.toFixed(1)}%</span>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            )}

            {branchData.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <BarChart3 className="w-12 h-12 mb-3 opacity-50" />
                <p>لا توجد بيانات لهذا الشهر</p>
              </div>
            )}
          </div>
        </TabsContent>
        {/* Expenses Report */}
        <TabsContent value="expenses" className="space-y-4 mt-4">
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Label>الشهر</Label>
                <Input
                  type="month"
                  value={expMonth}
                  onChange={(e) => setExpMonth(e.target.value)}
                  className="w-48"
                />
              </div>
            </CardContent>
          </Card>

          <div id="report-expenses" className="space-y-4 bg-white p-4 rounded-lg">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">عدد المصروفات</p>
                  <p className="text-2xl font-bold text-primary mt-1">{expData.count}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي المصروفات</p>
                  <p className="text-2xl font-bold text-purple-600 mt-1">{formatCurrency(expData.totalExpenses)}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">متوسط المصروف</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(expData.count > 0 ? expData.totalExpenses / expData.count : 0)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Daily Chart */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">المصروفات اليومية خلال الشهر</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={expData.dailyBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Bar dataKey="total" name="المصروفات" fill="oklch(0.55 0.2 300)" radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* By Category */}
            {expData.byCategory.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">حسب التصنيف</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">التصنيف</TableHead>
                        <TableHead className="text-center">العدد</TableHead>
                        <TableHead className="text-right">الإجمالي</TableHead>
                        <TableHead className="text-right">النسبة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expData.byCategory.map((cat, i) => {
                        const pct = expData.totalExpenses > 0 ? (cat.total / expData.totalExpenses) * 100 : 0;
                        return (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{cat.name}</TableCell>
                            <TableCell className="text-center">{cat.count}</TableCell>
                            <TableCell className="font-semibold">{formatCurrency(cat.total)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden max-w-[100px]">
                                  <div className="h-full bg-purple-600 rounded-full" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{pct.toFixed(1)}%</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Inventory Report */}
        <TabsContent value="inventory" className="space-y-4 mt-4">
          <div id="report-inventory" className="space-y-4 bg-white p-4 rounded-lg">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي الأصناف</p>
                  <p className="text-2xl font-bold text-primary mt-1">{invData.totalProducts}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">إجمالي القيمة</p>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(invData.totalValue)}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">مخزون منخفض</p>
                  <p className="text-2xl font-bold text-amber-600 mt-1">{invData.lowStockCount}</p>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">نفد المخزون</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{invData.outOfStockCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* By Branch */}
            {invData.byBranch.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">المخزون حسب الفرع</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={invData.byBranch} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => formatCurrency(v)} />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        <Bar dataKey="value" name="القيمة" fill="oklch(0.52 0.11 172)" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Low Stock Items */}
            {invData.lowStockItems.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">أصناف منخفضة / نفدت</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المنتج</TableHead>
                        <TableHead className="text-right">الفرع</TableHead>
                        <TableHead className="text-center">الكمية الحالية</TableHead>
                        <TableHead className="text-center">الحد الأدنى</TableHead>
                        <TableHead className="text-center">الحالة</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invData.lowStockItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell>{item.branch_name}</TableCell>
                          <TableCell className="text-center font-semibold">{item.quantity}</TableCell>
                          <TableCell className="text-center">{item.min_quantity}</TableCell>
                          <TableCell className="text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-medium ${
                              item.quantity <= 0
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {item.quantity <= 0 ? 'نفد' : 'منخفض'}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {invData.lowStockItems.length === 0 && invData.totalProducts > 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-50" />
                <p>جميع الأصناف بمستوى مخزون جيد</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
