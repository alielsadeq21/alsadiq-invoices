'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
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
  ClipboardList,
  FileText,
  XCircle,
  RotateCcw,
  Building2,
  Package,
  Settings,
  Filter,
  Banknote,
} from 'lucide-react';

const PAGE_SIZE = 20;

const actionLabels: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  create_invoice: { label: 'إنشاء فاتورة', icon: FileText, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  cancel_invoice: { label: 'إلغاء فاتورة', icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  create_return: { label: 'إنشاء مرتجع', icon: RotateCcw, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  create_branch: { label: 'إضافة فرع', icon: Building2, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  update_settings: { label: 'تحديث الإعدادات', icon: Settings, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  create_product: { label: 'إضافة منتج', icon: Package, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400' },
  create_payment: { label: 'إيصال قبض', icon: Banknote, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400' },
};

export default function ActivityLogPage() {
  const { user, isAdmin } = useAppStore();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  useEffect(() => {
    loadLogs();
  }, [page, actionFilter]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;

      if (!error && data) {
        let filteredData = data as AuditLog[];
        // Branch filtering for non-admin users (client-side since audit_log details is JSON)
        if (!isAdmin && user?.branch_id) {
          filteredData = filteredData.filter((log) => {
            if (!log.details) return true; // Keep entries without details
            const details = log.details as Record<string, unknown>;
            // If details has branch_id, check if it matches user's branch
            if (details.branch_id) return details.branch_id === user.branch_id;
            // If details has branch_name, keep it (backward compat)
            if (details.branch_name) return true; // Branch-related entries
            // Keep entries that don't relate to specific branches (e.g., settings changes)
            return !['create_branch', 'update_settings'].includes(log.action);
          });
        }
        setLogs(filteredData);
        setTotalCount(!isAdmin && user?.branch_id ? filteredData.length : (count || 0));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getActionInfo = (action: string) => {
    return actionLabels[action] || { label: action, icon: ClipboardList, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400' };
  };

  const formatDetails = (details: Record<string, unknown> | null, action: string): string => {
    if (!details) return '—';
    const parts: string[] = [];

    if (details.invoice_number) parts.push(`فاتورة: ${details.invoice_number}`);
    if (details.return_number) parts.push(`مرتجع: ${details.return_number}`);
    if (details.branch_name) parts.push(`فرع: ${details.branch_name}`);
    if (details.product_name) parts.push(`منتج: ${details.product_name}`);
    if (details.reason) parts.push(`السبب: ${details.reason}`);
    if (details.total) parts.push(`المبلغ: ${Number(details.total).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`);
    if (details.amount) parts.push(`المبلغ: ${Number(details.amount).toLocaleString('ar-EG', { minimumFractionDigits: 2 })} ج.م`);

    if (parts.length === 0) {
      return JSON.stringify(details, null, 2).slice(0, 100);
    }

    return parts.join(' | ');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">سجل النشاط</h1>
          <p className="text-muted-foreground text-sm mt-1">
            متابعة جميع العمليات التي تتم على النظام ({totalCount} عملية)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="كل العمليات" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العمليات</SelectItem>
              <SelectItem value="create_invoice">إنشاء فاتورة</SelectItem>
              <SelectItem value="cancel_invoice">إلغاء فاتورة</SelectItem>
              <SelectItem value="create_return">إنشاء مرتجع</SelectItem>
              <SelectItem value="create_branch">إضافة فرع</SelectItem>
              <SelectItem value="create_product">إضافة منتج</SelectItem>
              <SelectItem value="create_payment">إيصال قبض</SelectItem>
              <SelectItem value="update_settings">تحديث الإعدادات</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <ClipboardList className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد عمليات مسجلة</h3>
              <p className="text-muted-foreground text-sm text-center max-w-xs">
                سيتم تسجيل جميع العمليات تلقائياً هنا عند إنشاء فواتير أو مرتجعات أو إضافة فروع.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">التاريخ والوقت</TableHead>
                      <TableHead className="text-center">العملية</TableHead>
                      <TableHead className="text-right">التفاصيل</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const info = getActionInfo(log.action);
                      return (
                        <TableRow key={log.id}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDateTime(log.created_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className={`text-[10px] ${info.color}`}>
                              {info.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                            {formatDetails(log.details, log.action)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
                    <button
                      className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
                      onClick={() => setPage(Math.max(1, page - 1))}
                      disabled={page <= 1}
                    >
                      السابق
                    </button>
                    <button
                      className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                      disabled={page >= totalPages}
                    >
                      التالي
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
