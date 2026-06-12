'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { InventoryCount, InventoryCountItem, Branch, Product, Inventory } from '@/lib/types';
import { formatDate, formatDateTime, generateCountNumber, getCurrentYear, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  ClipboardCheck,
  Plus,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Loader2,
  Package,
  History,
  Building2,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

// ─── Extended types ────────────────────────────────────────────────────────────
interface CountRow extends Omit<InventoryCount, 'branches' | 'items'> {
  branches?: { name: string } | null;
  items?: CountItemRow[];
}

interface CountItemRow extends Omit<InventoryCountItem, 'products'> {
  products?: { name: string; unit_price: number; unit_count: number } | null;
}

interface CountFormItem {
  product_id: string;
  product_name: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  notes: string;
}

type StatusFilter = 'all' | 'draft' | 'confirmed' | 'cancelled';

const PAGE_SIZE = 10;

// ─── Status helpers ────────────────────────────────────────────────────────────
const statusLabel: Record<string, string> = {
  draft: 'مسودة',
  confirmed: 'مؤكد',
  cancelled: 'ملغي',
};

const statusColor: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusIcon: Record<string, typeof CheckCircle2> = {
  draft: History,
  confirmed: CheckCircle2,
  cancelled: XCircle,
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function InventoryCountsPage() {
  const { user, hasPermission } = useAppStore();

  // Data
  const [counts, setCounts] = useState<CountRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Create dialog
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    branch_id: '',
    count_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [formItems, setFormItems] = useState<CountFormItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailCount, setDetailCount] = useState<CountRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Confirm dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmingCount, setConfirmingCount] = useState<CountRow | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingCount, setCancellingCount] = useState<CountRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // ─── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadBranches();
    loadProducts();
  }, []);

  useEffect(() => {
    loadCounts();
  }, [page, search, statusFilter, branchFilter, dateFrom, dateTo]);

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      if (data) setBranches(data as Branch[]);
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      if (data) setProducts(data as Product[]);
    } catch (err) {
      console.error('Error loading products:', err);
    }
  };

  const loadCounts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('inventory_counts')
        .select('*, branches(name), items:inventory_count_items(*, products(name, unit_price, unit_count))', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search) {
        query = query.or(`count_number.ilike.%${search}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (branchFilter !== 'all') {
        query = query.eq('branch_id', branchFilter);
      }
      if (dateFrom) {
        query = query.gte('count_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('count_date', dateTo);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        setCounts(data as unknown as CountRow[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error('Error loading counts:', err);
    } finally {
      setLoading(false);
    }
  };

  const hasActiveFilters = search || statusFilter !== 'all' || branchFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setBranchFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const stats = useMemo(() => {
    const total = totalCount;
    const draft = counts.filter((c) => c.status === 'draft').length;
    const confirmed = counts.filter((c) => c.status === 'confirmed').length;
    const itemsWithDiff = counts.reduce((sum, c) => {
      return sum + (c.items?.filter((i) => i.difference !== 0).length || 0);
    }, 0);
    return { total, draft, confirmed, itemsWithDiff };
  }, [counts, totalCount]);

  const openCreateDialog = () => {
    setCreateForm({
      branch_id: '',
      count_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setFormItems([]);
    setCreating(false);
    setCreateDialogOpen(true);
  };

  const handleBranchSelect = async (branchId: string) => {
    setCreateForm((prev) => ({ ...prev, branch_id: branchId }));

    if (!branchId) {
      setFormItems([]);
      return;
    }

    setLoadingInventory(true);
    try {
      const { data: inventoryData, error } = await supabase
        .from('inventory')
        .select('*, products(name, unit_price, unit_count)')
        .eq('branch_id', branchId);

      if (error) throw error;

      if (inventoryData) {
        const items: CountFormItem[] = (inventoryData as (Inventory & { products?: { name: string } })[]).map((inv) => ({
          product_id: inv.product_id,
          product_name: inv.products?.name || 'غير معروف',
          system_quantity: inv.quantity,
          actual_quantity: inv.quantity,
          difference: 0,
          notes: '',
        }));
        setFormItems(items);
      } else {
        setFormItems([]);
      }
    } catch (err) {
      console.error('Error loading inventory:', err);
      toast.error('حدث خطأ أثناء تحميل المخزون');
      setFormItems([]);
    } finally {
      setLoadingInventory(false);
    }
  };

  const updateFormItem = (index: number, field: 'actual_quantity' | 'notes', value: string | number) => {
    const updated = [...formItems];
    const item = { ...updated[index] };

    if (field === 'actual_quantity') {
      const val = Number(value) || 0;
      item.actual_quantity = val;
      item.difference = val - item.system_quantity;
    } else if (field === 'notes') {
      item.notes = value as string;
    }

    updated[index] = item;
    setFormItems(updated);
  };

  const handleCreateCount = async () => {
    if (!createForm.branch_id) {
      toast.error('يرجى اختيار الفرع');
      return;
    }
    if (formItems.length === 0) {
      toast.error('لا توجد أصناف في المخزون لهذا الفرع');
      return;
    }

    setCreating(true);
    try {
      const year = getCurrentYear();
      const { data: lastCount } = await supabase
        .from('inventory_counts')
        .select('count_number')
        .like('count_number', `IC-${year}-%`)
        .order('count_number', { ascending: false })
        .limit(1);

      let lastNum = 0;
      if (lastCount && lastCount.length > 0) {
        const parts = lastCount[0].count_number.split('-');
        lastNum = parseInt(parts[parts.length - 1]) || 0;
      }

      const countNumber = generateCountNumber(lastNum, year);

      const { data: newCount, error: countError } = await supabase
        .from('inventory_counts')
        .insert({
          count_number: countNumber,
          branch_id: createForm.branch_id,
          count_date: createForm.count_date,
          status: 'draft',
          notes: createForm.notes.trim() || null,
          created_by: user?.id || null,
        })
        .select('id')
        .single();

      if (countError) throw countError;
      if (!newCount) throw new Error('Failed to create count');

      const itemsPayload = formItems.map((item) => ({
        count_id: newCount.id,
        product_id: item.product_id,
        system_quantity: item.system_quantity,
        actual_quantity: item.actual_quantity,
        difference: item.difference,
        notes: item.notes.trim() || null,
      }));

      const { error: itemsError } = await supabase
        .from('inventory_count_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      await supabase.from('audit_log').insert({
        action: 'create_inventory_count',
        details: {
          count_number: countNumber,
          branch_id: createForm.branch_id,
          items_count: formItems.length,
        },
      });

      toast.success('تم إنشاء الجرد بنجاح');
      setCreateDialogOpen(false);
      loadCounts();
    } catch (err) {
      console.error('Error creating count:', err);
      toast.error('حدث خطأ أثناء إنشاء الجرد');
    } finally {
      setCreating(false);
    }
  };

  const openDetailDialog = async (count: CountRow) => {
    setDetailCount(count);
    setDetailDialogOpen(true);

    if (!count.items || count.items.length === 0) {
      setLoadingDetail(true);
      try {
        const { data, error } = await supabase
          .from('inventory_count_items')
          .select('*, products(name, unit_price, unit_count)')
          .eq('count_id', count.id)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setDetailCount({ ...count, items: data as CountItemRow[] });
        }
      } catch (err) {
        console.error('Error loading count items:', err);
      } finally {
        setLoadingDetail(false);
      }
    } else {
      setLoadingDetail(false);
    }
  };

  const openConfirmDialog = (count: CountRow) => {
    setConfirmingCount(count);
    setConfirmDialogOpen(true);
  };

  const handleConfirmCount = async () => {
    if (!confirmingCount) return;
    setConfirming(true);

    try {
      const count = confirmingCount;

      let items = count.items;
      if (!items || items.length === 0) {
        const { data, error } = await supabase
          .from('inventory_count_items')
          .select('*, products(name, unit_price, unit_count)')
          .eq('count_id', count.id);

        if (error) throw error;
        items = (data as CountItemRow[]) || [];
      }

      if (items.length === 0) {
        toast.error('لا توجد عناصر في هذا الجرد');
        setConfirming(false);
        return;
      }

      for (const item of items) {
        if (item.difference === 0) continue;

        const { data: invData } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('branch_id', count.branch_id)
          .single();

        if (invData) {
          const { error: updateErr } = await supabase
            .from('inventory')
            .update({
              quantity: item.actual_quantity,
              last_updated: new Date().toISOString(),
            })
            .eq('id', invData.id);

          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase
            .from('inventory')
            .insert({
              product_id: item.product_id,
              branch_id: count.branch_id,
              quantity: item.actual_quantity,
              min_quantity: 0,
              last_updated: new Date().toISOString(),
            });

          if (insertErr) throw insertErr;
        }

        const { error: txErr } = await supabase
          .from('inventory_transactions')
          .insert({
            product_id: item.product_id,
            branch_id: count.branch_id,
            transaction_type: 'count',
            quantity: item.difference,
            reference_type: 'inventory_count',
            reference_id: count.id,
            notes: `تسوية جرد - جرد رقم ${count.count_number}`,
            created_by: user?.id || null,
          });

        if (txErr) throw txErr;
      }

      const { error: statusError } = await supabase
        .from('inventory_counts')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', count.id);

      if (statusError) throw statusError;

      await supabase.from('audit_log').insert({
        action: 'confirm_inventory_count',
        details: {
          count_number: count.count_number,
          items_with_differences: items.filter((i) => i.difference !== 0).length,
          total_items: items.length,
        },
      });

      toast.success('تم تأكيد الجرد وتحديث المخزون بنجاح');
      setConfirmDialogOpen(false);
      setConfirmingCount(null);
      loadCounts();
    } catch (err) {
      console.error('Error confirming count:', err);
      toast.error('حدث خطأ أثناء تأكيد الجرد');
    } finally {
      setConfirming(false);
    }
  };

  const openCancelDialog = (count: CountRow) => {
    setCancellingCount(count);
    setCancelDialogOpen(true);
  };

  const handleCancelCount = async () => {
    if (!cancellingCount) return;
    setCancelling(true);

    try {
      const { error } = await supabase
        .from('inventory_counts')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', cancellingCount.id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        action: 'cancel_inventory_count',
        details: {
          count_number: cancellingCount.count_number,
        },
      });

      toast.success('تم إلغاء الجرد بنجاح');
      setCancelDialogOpen(false);
      setCancellingCount(null);
      loadCounts();
    } catch (err) {
      console.error('Error cancelling count:', err);
      toast.error('حدث خطأ أثناء إلغاء الجرد');
    } finally {
      setCancelling(false);
    }
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const getDifferenceColor = (diff: number) => {
    if (diff > 0) return 'text-emerald-600 dark:text-emerald-400';
    if (diff < 0) return 'text-red-600 dark:text-red-400';
    return 'text-muted-foreground';
  };

  const getDifferenceBg = (diff: number) => {
    if (diff > 0) return 'bg-emerald-50 dark:bg-emerald-900/20';
    if (diff < 0) return 'bg-red-50 dark:bg-red-900/20';
    return '';
  };

  const getDifferenceLabel = (diff: number) => {
    if (diff > 0) return 'زيادة';
    if (diff < 0) return 'نقص';
    return 'متطابق';
  };

  const getProductName = useCallback((productId: string) => {
    return products.find((p) => p.id === productId)?.name || 'غير معروف';
  }, [products]);

  const getBranchName = useCallback((branchId: string) => {
    return branches.find((b) => b.id === branchId)?.name || 'غير معروف';
  }, [branches]);

  // ─── Render: Loading ───────────────────────────────────────────────────────
  if (loading && counts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
            <Loader2 className="w-6 h-6 animate-spin text-white" />
          </div>
          <p className="text-muted-foreground text-sm">جاري تحميل الجرد...</p>
        </div>
      </div>
    );
  }

  // ─── Stat cards data ───────────────────────────────────────────────────────
  const statCards = [
    {
      title: 'إجمالي الجرد',
      value: stats.total,
      icon: ClipboardCheck,
      color: 'text-sky-600 dark:text-sky-400',
      bg: 'bg-sky-50 dark:bg-sky-900/20',
    },
    {
      title: 'جرد معلق',
      value: stats.draft,
      icon: History,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      title: 'جرد مؤكد',
      value: stats.confirmed,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      title: 'أصناف بفروقات',
      value: stats.itemsWithDiff,
      icon: Package,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
    },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
            <ClipboardCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">جرد المخزون</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              جرد المخزون الفعلي ومقارنته بالكميات بالنظام وتسوية الفروقات
            </p>
          </div>
        </div>
        {hasPermission('inventory_counts', 'create') && (
          <Button onClick={openCreateDialog} className="gap-2 shadow-lg" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
            <Plus className="w-4 h-4" />
            جرد جديد
          </Button>
        )}
      </motion.div>

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

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #38bdf8, #0284c7, #0369a1)' }} />
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث برقم الجرد..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  className="pr-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as StatusFilter); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحالات</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="confirmed">مؤكد</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
              <Select value={branchFilter} onValueChange={(v) => { setBranchFilter(v); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="كل الفروع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                placeholder="من تاريخ"
              />
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                placeholder="إلى تاريخ"
              />
              {hasActiveFilters && (
                <div className="col-span-full flex justify-end">
                  <Button variant="outline" onClick={clearFilters} className="gap-2">
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Counts Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
                <p className="text-muted-foreground text-sm">جاري التحميل...</p>
              </div>
            ) : counts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #7dd3fc, #0284c7)' }}>
                  <ClipboardCheck className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد عمليات جرد</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إنشاء أي جرد بعد. ابدأ بجرد المخزون ومقارنته بالنظام.
                </p>
                {hasPermission('inventory_counts', 'create') && (
                  <Button onClick={openCreateDialog} className="gap-2 shadow-lg" size="lg" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
                    <Plus className="w-5 h-5" />
                    جرد جديد
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #38bdf8, #0284c7, #0369a1)' }} />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right">رقم الجرد</TableHead>
                          <TableHead className="text-right hidden md:table-cell">الفرع</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">تاريخ الجرد</TableHead>
                          <TableHead className="text-center">إجمالي الأصناف</TableHead>
                          <TableHead className="text-center">أصناف بفروقات</TableHead>
                          <TableHead className="text-center">الحالة</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {counts.map((count) => {
                          const StatusIcon = statusIcon[count.status] || History;
                          const totalItems = count.items?.length || 0;
                          const diffItems = count.items?.filter((i) => i.difference !== 0).length || 0;

                          return (
                            <TableRow key={count.id} className="hover:bg-sky-50/50 dark:hover:bg-sky-900/10 transition-colors">
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg, #7dd3fc, #0284c7)' }}>
                                    <ClipboardCheck className="w-4 h-4 text-white" />
                                  </div>
                                  <span className="font-mono">{count.count_number}</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5 text-sky-500" />
                                  {count.branches?.name || getBranchName(count.branch_id)}
                                </div>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground">
                                {formatDate(count.count_date)}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline" className="font-mono">
                                  {totalItems}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'font-mono',
                                    diffItems > 0
                                      ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400'
                                      : 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                                  )}
                                >
                                  {diffItems}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge className={cn('gap-1', statusColor[count.status])}>
                                  <StatusIcon className="w-3 h-3" />
                                  {statusLabel[count.status]}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-sky-50 dark:hover:bg-sky-900/20"
                                    onClick={() => openDetailDialog(count)}
                                    title="عرض التفاصيل"
                                  >
                                    <Eye className="w-4 h-4 text-sky-600" />
                                  </Button>
                                  {count.status === 'draft' && hasPermission('inventory_counts', 'edit') && (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20"
                                        onClick={() => openConfirmDialog(count)}
                                        title="تأكيد الجرد"
                                      >
                                        <CheckCircle2 className="w-4 h-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                                        onClick={() => openCancelDialog(count)}
                                        title="إلغاء الجرد"
                                      >
                                        <XCircle className="w-4 h-4" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Mobile Card Layout */}
                <div className="sm:hidden divide-y">
                  {counts.map((count) => {
                    const StatusIcon = statusIcon[count.status] || History;
                    const totalItems = count.items?.length || 0;
                    const diffItems = count.items?.filter((i) => i.difference !== 0).length || 0;
                    const borderColor = count.status === 'draft' ? '#f59e0b' : count.status === 'confirmed' ? '#10b981' : '#ef4444';
                    return (
                      <motion.div
                        key={count.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 border-r-4 hover:bg-muted/30 transition-all"
                        style={{ borderRightColor: borderColor }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: 'linear-gradient(135deg, #7dd3fc, #0284c7)' }}>
                              <ClipboardCheck className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium text-sm font-mono">{count.count_number}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(count.count_date)}</p>
                            </div>
                          </div>
                          <Badge className={cn('gap-1 text-[10px]', statusColor[count.status])}>
                            <StatusIcon className="w-3 h-3" />
                            {statusLabel[count.status]}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{count.branches?.name || getBranchName(count.branch_id)}</span>
                            <span>{totalItems} صنف</span>
                            {diffItems > 0 && <span className="text-red-600 dark:text-red-400 font-medium">{diffItems} فرق</span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-sky-50 dark:hover:bg-sky-900/20" onClick={() => openDetailDialog(count)}>
                              <Eye className="w-3.5 h-3.5 text-sky-600" />
                            </Button>
                            {count.status === 'draft' && hasPermission('inventory_counts', 'edit') && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20" onClick={() => openConfirmDialog(count)}>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => openCancelDialog(count)}>
                                  <XCircle className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <p className="text-sm text-muted-foreground">
                      عرض {((page - 1) * PAGE_SIZE) + 1} - {Math.min(page * PAGE_SIZE, totalCount)} من {totalCount}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        السابق
                      </Button>
                      <span className="text-sm font-medium px-2">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        التالي
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ─── CREATE DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
                <ClipboardCheck className="w-4 h-4 text-white" />
              </div>
              جرد جديد
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="branch">الفرع</Label>
                <Select
                  value={createForm.branch_id}
                  onValueChange={handleBranchSelect}
                >
                  <SelectTrigger id="branch">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="count_date">تاريخ الجرد</Label>
                <Input
                  id="count_date"
                  type="date"
                  value={createForm.count_date}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, count_date: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="count_notes">ملاحظات</Label>
              <Textarea
                id="count_notes"
                value={createForm.notes}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>

            <Separator />

            {loadingInventory ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
                  <Loader2 className="w-5 h-5 animate-spin text-white" />
                </div>
                <p className="text-muted-foreground text-sm">جاري تحميل المخزون...</p>
              </div>
            ) : formItems.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">
                    أصناف المخزون ({formItems.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    أدخل الكمية الفعلية لكل صنف
                  </p>
                </div>
                <ScrollArea className="max-h-[40vh]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">#</TableHead>
                        <TableHead className="text-right">المنتج</TableHead>
                        <TableHead className="text-center">الكمية بالنظام</TableHead>
                        <TableHead className="text-center">الكمية الفعلية</TableHead>
                        <TableHead className="text-center">الفرق</TableHead>
                        <TableHead className="text-right hidden md:table-cell">ملاحظات</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formItems.map((item, index) => (
                        <TableRow
                          key={item.product_id}
                          className={cn(getDifferenceBg(item.difference), 'transition-colors')}
                        >
                          <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                          <TableCell className="font-medium">{item.product_name}</TableCell>
                          <TableCell className="text-center font-mono">
                            {item.system_quantity}
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                              value={item.actual_quantity}
                              onChange={(e) => updateFormItem(index, 'actual_quantity', e.target.value)}
                              className="w-20 text-center mx-auto font-mono"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn('font-mono font-bold', getDifferenceColor(item.difference))}>
                              {item.difference > 0 ? '+' : ''}{item.difference}
                            </span>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Input
                              value={item.notes}
                              onChange={(e) => updateFormItem(index, 'notes', e.target.value)}
                              placeholder="ملاحظة..."
                              className="w-32"
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>

                <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/50">
                  <div className="text-sm">
                    <span className="text-muted-foreground">إجمالي الأصناف: </span>
                    <span className="font-bold">{formItems.length}</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">أصناف بفروقات: </span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formItems.filter((i) => i.difference !== 0).length}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">زيادة: </span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      {formItems.filter((i) => i.difference > 0).length}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">نقص: </span>
                    <span className="font-bold text-red-600 dark:text-red-400">
                      {formItems.filter((i) => i.difference < 0).length}
                    </span>
                  </div>
                </div>
              </div>
            ) : createForm.branch_id ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Package className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">لا يوجد مخزون لهذا الفرع</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <ClipboardCheck className="w-12 h-12 mb-3 opacity-40" />
                <p className="text-sm">اختر فرعاً لتحميل أصناف المخزون</p>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleCreateCount}
              disabled={creating || formItems.length === 0}
              className="gap-2"
              style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الإنشاء...
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4" />
                  إنشاء الجرد
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DETAIL DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #38bdf8, #0284c7)' }}>
                <Eye className="w-4 h-4 text-white" />
              </div>
              تفاصيل الجرد
            </DialogTitle>
          </DialogHeader>

          {detailCount && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">رقم الجرد</p>
                  <p className="font-mono font-semibold">{detailCount.count_number}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الفرع</p>
                  <p className="font-semibold">{detailCount.branches?.name || getBranchName(detailCount.branch_id)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">تاريخ الجرد</p>
                  <p className="font-semibold">{formatDate(detailCount.count_date)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">الحالة</p>
                  <Badge className={cn('gap-1', statusColor[detailCount.status])}>
                    {(() => {
                      const Icon = statusIcon[detailCount.status] || History;
                      return <Icon className="w-3 h-3" />;
                    })()}
                    {statusLabel[detailCount.status]}
                  </Badge>
                </div>
              </div>

              {detailCount.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">ملاحظات</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{detailCount.notes}</p>
                </div>
              )}

              <Separator />

              {loadingDetail ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="mr-2 text-muted-foreground">جاري تحميل التفاصيل...</span>
                </div>
              ) : (
                <>
                  <ScrollArea className="max-h-[40vh]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">المنتج</TableHead>
                          <TableHead className="text-center">الكمية بالنظام</TableHead>
                          <TableHead className="text-center">الكمية الفعلية</TableHead>
                          <TableHead className="text-center">الفرق</TableHead>
                          <TableHead className="text-center">الحالة</TableHead>
                          <TableHead className="text-right hidden md:table-cell">ملاحظات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailCount.items?.map((item, index) => (
                          <TableRow
                            key={item.id}
                            className={cn(getDifferenceBg(item.difference), 'transition-colors')}
                          >
                            <TableCell className="font-mono text-xs">{index + 1}</TableCell>
                            <TableCell className="font-medium">
                              {item.products?.name || getProductName(item.product_id)}
                            </TableCell>
                            <TableCell className="text-center font-mono">
                              {item.system_quantity}
                            </TableCell>
                            <TableCell className="text-center font-mono">
                              {item.actual_quantity}
                            </TableCell>
                            <TableCell className="text-center">
                              <span className={cn('font-mono font-bold', getDifferenceColor(item.difference))}>
                                {item.difference > 0 ? '+' : ''}{item.difference}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge
                                variant="outline"
                                className={cn(
                                  'text-xs',
                                  item.difference > 0
                                    ? 'border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400'
                                    : item.difference < 0
                                    ? 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-400'
                                    : 'border-gray-300 text-gray-500 dark:border-gray-600 dark:text-gray-400'
                                )}
                              >
                                {getDifferenceLabel(item.difference)}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                              {item.notes || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  <div className="flex flex-wrap gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="text-sm">
                      <span className="text-muted-foreground">إجمالي الأصناف: </span>
                      <span className="font-bold">{detailCount.items?.length || 0}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">أصناف بفروقات: </span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {detailCount.items?.filter((i) => i.difference !== 0).length || 0}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">زيادة: </span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        {detailCount.items?.filter((i) => i.difference > 0).length || 0}
                      </span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">نقص: </span>
                      <span className="font-bold text-red-600 dark:text-red-400">
                        {detailCount.items?.filter((i) => i.difference < 0).length || 0}
                      </span>
                    </div>
                  </div>
                </>
              )}

              <div className="text-xs text-muted-foreground">
                <span>تاريخ الإنشاء: {formatDateTime(detailCount.created_at)}</span>
                {detailCount.updated_at !== detailCount.created_at && (
                  <span className="mr-4">آخر تحديث: {formatDateTime(detailCount.updated_at)}</span>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              إغلاق
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CONFIRM DIALOG ──────────────────────────────────────────────────── */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <CheckCircle2 className="w-4 h-4 text-white" />
              </div>
              تأكيد الجرد
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                هل أنت متأكد من تأكيد الجرد رقم{' '}
                <span className="font-mono font-bold">{confirmingCount?.count_number}</span>؟
              </p>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  ⚠️ تنبيه: سيتم تنفيذ الإجراءات التالية:
                </p>
                <ul className="text-sm text-amber-700 dark:text-amber-400 mt-2 space-y-1 list-disc list-inside">
                  <li>تحديث كميات المخزون لتطابق الكميات الفعلية</li>
                  <li>إنشاء حركات مخزون (تسويات) للأصناف ذات الفروقات</li>
                  <li>لا يمكن التراجع عن هذا الإجراء</li>
                </ul>
              </div>
              {confirmingCount?.items && (
                <div className="text-sm text-muted-foreground">
                  عدد الأصناف بفروقات:{' '}
                  <span className="font-bold text-foreground">
                    {confirmingCount.items.filter((i) => i.difference !== 0).length}
                  </span>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCount}
              disabled={confirming}
              className="bg-emerald-600 hover:bg-emerald-700 gap-2"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري التأكيد...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  تأكيد الجرد
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── CANCEL DIALOG ──────────────────────────────────────────────────── */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <XCircle className="w-4 h-4 text-white" />
              </div>
              إلغاء الجرد
            </AlertDialogTitle>
            <AlertDialogDescription>
              <p>
                هل أنت متأكد من إلغاء الجرد رقم{' '}
                <span className="font-mono font-bold">{cancellingCount?.count_number}</span>؟
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                يمكن إلغاء الجرد في حالة المسودة فقط. لن يتم تأثير على المخزون.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelCount}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 gap-2"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جاري الإلغاء...
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  إلغاء الجرد
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
