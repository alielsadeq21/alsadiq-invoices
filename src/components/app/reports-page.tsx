'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { toast } from 'sonner';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function ReportsPage() {
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

  useEffect(() => {
    loadDailyReport();
  }, [dailyDate]);

  useEffect(() => {
    loadMonthlyReport();
  }, [monthlyMonth]);

  useEffect(() => {
    loadBranchReport();
  }, [branchMonth]);

  const loadDailyReport = async () => {
    try {
      const { data: invoices } = await supabase
        .from('invoices')
        .select('*, branches(name), items:invoice_items(*)')
        .eq('invoice_date', dailyDate)
        .eq('status', 'active');

      const { data: returns } = await supabase
        .from('returns')
        .select('total')
        .eq('return_date', dailyDate);

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

      const { data: invoices } = await supabase
        .from('invoices')
        .select('total, invoice_date')
        .gte('invoice_date', monthStart)
        .lte('invoice_date', monthEnd)
        .eq('status', 'active');

      const { data: returns } = await supabase
        .from('returns')
        .select('total')
        .gte('return_date', monthStart)
        .lte('return_date', monthEnd);

      const totalSpending = (invoices || []).reduce((s, i) => s + Number(i.total), 0);
      const totalReturns = (returns || []).reduce((s, r) => s + Number(r.total), 0);

      // Previous month
      const prevMonth = subMonths(monthDate, 1);
      const prevStart = startOfMonth(prevMonth).toISOString().split('T')[0];
      const prevEnd = endOfMonth(prevMonth).toISOString().split('T')[0];

      const { data: prevInvoices } = await supabase
        .from('invoices')
        .select('total')
        .gte('invoice_date', prevStart)
        .lte('invoice_date', prevEnd)
        .eq('status', 'active');

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

      const { data: invoices } = await supabase
        .from('invoices')
        .select('branch_id, total, branches(name)')
        .gte('invoice_date', monthStart)
        .lte('invoice_date', monthEnd)
        .eq('status', 'active');

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
      } else {
        const wsData = [
          ['تقرير الفروع', branchMonth],
          [],
          ['الفرع', 'عدد الفواتير', 'الإجمالي'],
          ...branchData.map((b) => [b.name, b.count, b.total]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        XLSX.utils.book_append_sheet(wb, ws, 'تقرير الفروع');
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
          <p className="text-muted-foreground text-sm mt-1">تقارير الصرف والمرتجعات</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportExcel} className="gap-2">
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
          <Button variant="outline" onClick={exportPDF} className="gap-2">
            <FileText className="w-4 h-4" />
            PDF
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
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
      </Tabs>
    </div>
  );
}
