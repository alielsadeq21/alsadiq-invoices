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
  Loader2,
} from 'lucide-react';
import { motion } from 'framer-motion';

const PAGE_SIZE = 20;

const actionLabels: Record<string, { label: string; icon: typeof FileText; color: string; mobileColor: string }> = {
  create_invoice: { label: 'إنشاء فاتورة', icon: FileText, color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400', mobileColor: 'border-emerald-500' },
  cancel_invoice: { label: 'إلغاء فاتورة', icon: XCircle, color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400', mobileColor: 'border-red-500' },
  create_return: { label: 'إنشاء مرتجع', icon: RotateCcw, color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', mobileColor: 'border-amber-500' },
  create_branch: { label: 'إضافة فرع', icon: Building2, color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', mobileColor: 'border-blue-500' },
  update_settings: { label: 'تحديث الإعدادات', icon: Settings, color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400', mobileColor: 'border-purple-500' },
  create_product: { label: 'إضافة منتج', icon: Package, color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400', mobileColor: 'border-cyan-500' },
  create_payment: { label: 'إيصال قبض', icon: Banknote, color: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400', mobileColor: 'border-teal-500' },
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
        // Use server count for accurate pagination (approximate for non-admin, exact for admin)
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getActionInfo = (action: string) => {
    return actionLabels[action] || { label: action, icon: ClipboardList, color: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400', mobileColor: 'border-gray-500' };
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
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
            <ClipboardList className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">سجل النشاط</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              متابعة جميع العمليات التي تتم على النظام ({totalCount} عملية)
            </p>
          </div>
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

      {/* Logs */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          {/* Gradient top bar */}
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #64748b, #94a3b8, #64748b)' }} />
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
                  <p className="text-sm text-muted-foreground">جاري التحميل...</p>
                </div>
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
                  <ClipboardList className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد عمليات مسجلة</h3>
                <p className="text-muted-foreground text-sm text-center max-w-xs">
                  سيتم تسجيل جميع العمليات تلقائياً هنا عند إنشاء فواتير أو مرتجعات أو إضافة فروع.
                </p>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #64748b, #94a3b8, #64748b)' }} />
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="text-right">التاريخ والوقت</TableHead>
                        <TableHead className="text-center">العملية</TableHead>
                        <TableHead className="text-right">التفاصيل</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => {
                        const info = getActionInfo(log.action);
                        const ActionIcon = info.icon;
                        return (
                          <TableRow key={log.id} className="hover:bg-muted/40 transition-colors">
                            <TableCell className="text-sm whitespace-nowrap">
                              {formatDateTime(log.created_at)}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
                                  <ActionIcon className="w-3.5 h-3.5 text-white" />
                                </div>
                                <Badge variant="secondary" className={`text-[10px] ${info.color}`}>
                                  {info.label}
                                </Badge>
                              </div>
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

                {/* Mobile Cards */}
                <div className="sm:hidden p-3 space-y-3 max-h-[70vh] overflow-y-auto">
                  {logs.map((log) => {
                    const info = getActionInfo(log.action);
                    const ActionIcon = info.icon;
                    return (
                      <motion.div
                        key={log.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={`rounded-xl border-r-4 ${info.mobileColor} bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #64748b, #475569)' }}>
                              <ActionIcon className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <Badge variant="secondary" className={`text-[10px] ${info.color}`}>
                                {info.label}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {formatDateTime(log.created_at)}
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
                          {formatDetails(log.details, log.action)}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      صفحة {page} من {totalPages}
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
                        onClick={() => setPage(Math.max(1, page - 1))}
                        disabled={page <= 1}
                      >
                        السابق
                      </button>
                      <button
                        className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted disabled:opacity-50 transition-colors"
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
      </motion.div>
    </div>
  );
}
