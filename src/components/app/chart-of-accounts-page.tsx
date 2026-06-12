'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { ChartOfAccount } from '@/lib/types';
import { formatCurrency, getAccountTypeLabel, getAccountTypeColor, getCurrentYear } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Network,
  Plus,
  Search,
  ChevronDown,
  ChevronLeft,
  Pencil,
  Trash2,
  Loader2,
  X,
  Landmark,
  CircleDollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  Shield,
  FolderTree,
  FolderOpen,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

const ACCOUNT_TYPES: ChartOfAccount['account_type'][] = ['asset', 'liability', 'equity', 'revenue', 'expense'];

const ACCOUNT_TYPE_ICONS: Record<string, React.ReactNode> = {
  asset: <Landmark className="w-4 h-4" />,
  liability: <CircleDollarSign className="w-4 h-4" />,
  equity: <Wallet className="w-4 h-4" />,
  revenue: <TrendingUp className="w-4 h-4" />,
  expense: <TrendingDown className="w-4 h-4" />,
};

const ACCOUNT_TYPE_GRADIENTS: Record<string, string> = {
  asset: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
  liability: 'linear-gradient(135deg, #f43f5e, #e11d48)',
  equity: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
  revenue: 'linear-gradient(135deg, #10b981, #059669)',
  expense: 'linear-gradient(135deg, #f59e0b, #d97706)',
};

const ACCOUNT_TYPE_BORDER_COLORS: Record<string, string> = {
  asset: '#0ea5e9',
  liability: '#f43f5e',
  equity: '#8b5cf6',
  revenue: '#10b981',
  expense: '#f59e0b',
};

interface AccountFormData {
  code: string;
  name: string;
  name_en: string;
  parent_id: string;
  account_type: ChartOfAccount['account_type'] | '';
}

const emptyForm: AccountFormData = {
  code: '',
  name: '',
  name_en: '',
  parent_id: 'none',
  account_type: '',
};

export default function ChartOfAccountsPage() {
  const { isAdmin, hasPermission } = useAppStore();

  const [accounts, setAccounts] = useState<ChartOfAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<AccountFormData>({ ...emptyForm });

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<ChartOfAccount | null>(null);

  const canView = isAdmin || hasPermission('chart_of_accounts', 'view');
  const canCreate = isAdmin || hasPermission('chart_of_accounts', 'create');
  const canEdit = isAdmin || hasPermission('chart_of_accounts', 'edit');
  const canDelete = isAdmin || hasPermission('chart_of_accounts', 'delete');

  useEffect(() => {
    if (canView) loadAccounts();
  }, [canView]);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chart_of_accounts')
        .select('*')
        .order('code');

      if (error) throw error;
      setAccounts((data as ChartOfAccount[]) || []);
      // Auto-expand root nodes
      if (data && data.length > 0) {
        const rootIds = data.filter((a: ChartOfAccount) => !a.parent_id).map((a: ChartOfAccount) => a.id);
        setExpandedNodes(new Set(rootIds));
      }
    } catch {
      toast.error('حدث خطأ أثناء تحميل الحسابات');
    } finally {
      setLoading(false);
    }
  };

  // Build tree from flat list
  const buildTree = useCallback((flatAccounts: ChartOfAccount[]): ChartOfAccount[] => {
    const map = new Map<string, ChartOfAccount>();
    const roots: ChartOfAccount[] = [];

    flatAccounts.forEach((account) => {
      map.set(account.id, { ...account, children: [] });
    });

    map.forEach((account) => {
      if (account.parent_id && map.has(account.parent_id)) {
        const parent = map.get(account.parent_id)!;
        if (!parent.children) parent.children = [];
        parent.children.push(account);
      } else {
        roots.push(account);
      }
    });

    return roots;
  }, []);

  // Filter and search
  const filteredAccounts = useMemo(() => {
    let result = accounts;

    if (typeFilter !== 'all') {
      result = result.filter((a) => a.account_type === typeFilter);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchingIds = new Set<string>();
      result.forEach((a) => {
        if (
          a.name.toLowerCase().includes(q) ||
          (a.name_en && a.name_en.toLowerCase().includes(q)) ||
          a.code.toLowerCase().includes(q)
        ) {
          matchingIds.add(a.id);
          // Add all ancestor ids
          let parentId = a.parent_id;
          while (parentId) {
            matchingIds.add(parentId);
            const parent = result.find((p) => p.id === parentId);
            parentId = parent?.parent_id || null;
          }
        }
      });
      result = result.filter((a) => matchingIds.has(a.id));
    }

    return result;
  }, [accounts, typeFilter, search]);

  const treeData = useMemo(() => buildTree(filteredAccounts), [filteredAccounts, buildTree]);

  // Stats
  const stats = useMemo(() => {
    const countByType: Record<string, number> = {};
    const balanceByType: Record<string, number> = {};
    ACCOUNT_TYPES.forEach((t) => {
      countByType[t] = 0;
      balanceByType[t] = 0;
    });
    accounts.forEach((a) => {
      countByType[a.account_type] = (countByType[a.account_type] || 0) + 1;
      balanceByType[a.account_type] = (balanceByType[a.account_type] || 0) + (a.balance || 0);
    });
    return { countByType, balanceByType };
  }, [accounts]);

  // Toggle expand/collapse
  const toggleNode = (id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allIds = new Set(accounts.map((a) => a.id));
    setExpandedNodes(allIds);
  };

  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  // Get parent accounts for select dropdown
  const parentAccountOptions = useMemo(() => {
    return accounts
      .filter((a) => !editingAccount || a.id !== editingAccount.id)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [accounts, editingAccount]);

  // Dialog handlers
  const openCreateDialog = () => {
    setEditingAccount(null);
    setFormData({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEditDialog = (account: ChartOfAccount) => {
    setEditingAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      name_en: account.name_en || '',
      parent_id: account.parent_id || 'none',
      account_type: account.account_type,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code.trim()) {
      toast.error('يرجى إدخال كود الحساب');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('يرجى إدخال اسم الحساب');
      return;
    }
    if (!formData.account_type) {
      toast.error('يرجى اختيار نوع الحساب');
      return;
    }

    // Check duplicate code
    const duplicate = accounts.find(
      (a) => a.code === formData.code.trim() && a.id !== editingAccount?.id
    );
    if (duplicate) {
      toast.error('كود الحساب موجود بالفعل');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        name_en: formData.name_en.trim() || null,
        parent_id: formData.parent_id === 'none' ? null : formData.parent_id,
        account_type: formData.account_type,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (editingAccount) {
        // Update
        const { error } = await supabase
          .from('chart_of_accounts')
          .update(payload)
          .eq('id', editingAccount.id);

        if (error) throw error;
        toast.success('تم تعديل الحساب بنجاح');
      } else {
        // Create
        const { error } = await supabase
          .from('chart_of_accounts')
          .insert({
            ...payload,
            is_system: false,
            balance: 0,
          });

        if (error) throw error;
        toast.success('تم إضافة الحساب بنجاح');
      }

      setDialogOpen(false);
      loadAccounts();
    } catch {
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingAccount) return;

    // Check if account has children
    const hasChildren = accounts.some((a) => a.parent_id === deletingAccount.id);
    if (hasChildren) {
      toast.error('لا يمكن حذف حساب لديه حسابات فرعية');
      setDeleteDialogOpen(false);
      setDeletingAccount(null);
      return;
    }

    try {
      const { error } = await supabase
        .from('chart_of_accounts')
        .delete()
        .eq('id', deletingAccount.id);

      if (error) throw error;

      toast.success('تم حذف الحساب بنجاح');
      setDeleteDialogOpen(false);
      setDeletingAccount(null);
      loadAccounts();
    } catch {
      toast.error('حدث خطأ أثناء حذف الحساب');
    }
  };

  // Calculate child balance for a parent (recursive)
  const getTotalBalance = useCallback(
    (account: ChartOfAccount): number => {
      let total = account.balance || 0;
      if (account.children && account.children.length > 0) {
        account.children.forEach((child) => {
          total += getTotalBalance(child);
        });
      }
      return total;
    },
    []
  );

  // Render tree node
  const renderTreeNode = (account: ChartOfAccount, depth: number = 0): React.ReactNode => {
    const hasChildren = account.children && account.children.length > 0;
    const isExpanded = expandedNodes.has(account.id);
    const isSystem = account.is_system;

    return (
      <div key={account.id}>
        {/* Mobile Card Layout */}
        <div
          className="sm:hidden mb-2"
          style={{ marginRight: depth > 0 ? `${depth * 0.75}rem` : undefined }}
        >
          <div
            className="bg-card rounded-lg border shadow-sm overflow-hidden border-r-4"
            style={{ borderRightColor: ACCOUNT_TYPE_BORDER_COLORS[account.account_type] || '#6b7280' }}
          >
            {/* First row: Expand chevron + Colored dot + Code + Name */}
            <div className="flex items-center gap-2 p-3 pb-1.5" style={{ display: 'flex' }}>
              {hasChildren ? (
                <button
                  onClick={() => toggleNode(account.id)}
                  className="w-6 h-6 flex items-center justify-center rounded transition-colors shrink-0 hover:bg-muted cursor-pointer"
                  style={{ display: 'flex' }}
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
              ) : (
                <span className="w-6 shrink-0" />
              )}
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: ACCOUNT_TYPE_GRADIENTS[account.account_type] || '#6b7280' }}
              />
              <span
                className="font-mono text-sm font-bold"
                style={{ color: 'transparent', background: ACCOUNT_TYPE_GRADIENTS[account.account_type] || '#6b7280', backgroundClip: 'text', WebkitBackgroundClip: 'text' }}
              >
                {account.code}
              </span>
              <span className="font-medium text-sm flex-1 min-w-0 truncate">
                {account.name}
              </span>
            </div>

            {/* Second row: Account type badge + Balance */}
            <div className="flex items-center gap-2 px-3 pb-2 pl-11" style={{ display: 'flex' }}>
              <Badge
                variant="secondary"
                className="text-[10px] text-white border-0"
                style={{ background: ACCOUNT_TYPE_GRADIENTS[account.account_type] || '#6b7280', display: 'inline-flex' }}
              >
                {getAccountTypeLabel(account.account_type)}
              </Badge>
              <span
                className={cn(
                  'text-sm font-semibold tabular-nums',
                  account.balance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : account.balance < 0
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-muted-foreground'
                )}
              >
                {formatCurrency(account.balance)}
              </span>
            </div>

            {/* Third row: System badge + children count */}
            {(isSystem || hasChildren) && (
              <div className="flex items-center gap-2 px-3 pb-2 pl-11" style={{ display: 'flex' }}>
                {isSystem && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground" style={{ display: 'inline-flex' }}>
                    <Shield className="w-3 h-3" />
                    نظام
                  </span>
                )}
                {hasChildren && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground" style={{ display: 'inline-flex' }}>
                    {isExpanded ? (
                      <FolderOpen className="w-3 h-3 text-amber-500" />
                    ) : (
                      <FolderTree className="w-3 h-3 text-amber-500" />
                    )}
                    {account.children!.length} حساب
                  </span>
                )}
              </div>
            )}

            {/* Fourth row: Action buttons - always visible on mobile */}
            {(canEdit || (canDelete && !isSystem)) && (
              <div className="flex items-center gap-1 px-3 pb-3 pl-11" style={{ display: 'flex' }}>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => openEditDialog(account)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    تعديل
                  </Button>
                )}
                {canDelete && !isSystem && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                    onClick={() => {
                      setDeletingAccount(account);
                      setDeleteDialogOpen(true);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Desktop Row Layout */}
        <div
          className={cn(
            'hidden sm:flex items-center gap-2 py-2.5 px-3 rounded-lg hover:bg-muted/50 transition-colors group',
          )}
          style={{ marginRight: depth > 0 ? `${depth * 1.5}rem` : undefined }}
        >
          {/* Expand/Collapse button */}
          <button
            onClick={() => hasChildren && toggleNode(account.id)}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded transition-colors shrink-0',
              hasChildren
                ? 'hover:bg-muted cursor-pointer'
                : 'cursor-default'
            )}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              )
            ) : (
              <span className="w-4 h-4" />
            )}
          </button>

          {/* Folder icon with colored type indicator */}
          <div className="relative shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-amber-500" />
              ) : (
                <FolderTree className="w-4 h-4 text-amber-500" />
              )
            ) : (
              <div
                className="w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: ACCOUNT_TYPE_GRADIENTS[account.account_type] || '#6b7280' }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-white" />
              </div>
            )}
          </div>

          {/* Account code */}
          <span
            className="font-mono text-sm font-bold min-w-[60px] px-1.5 py-0.5 rounded"
            style={{ color: ACCOUNT_TYPE_GRADIENTS[account.account_type] ? 'inherit' : undefined }}
          >
            <span style={{ color: 'transparent', background: ACCOUNT_TYPE_GRADIENTS[account.account_type] || '#6b7280', backgroundClip: 'text', WebkitBackgroundClip: 'text' }}>
              {account.code}
            </span>
          </span>

          {/* Account name */}
          <span className="font-medium text-sm flex-1 min-w-0 truncate">
            {account.name}
          </span>

          {/* English name (hidden on small screens) */}
          {account.name_en && (
            <span className="text-xs text-muted-foreground hidden md:block max-w-[120px] truncate">
              {account.name_en}
            </span>
          )}

          {/* Account type badge with gradient */}
          <Badge
            variant="secondary"
            className={cn('text-[10px] hidden sm:inline-flex text-white border-0')}
            style={{ background: ACCOUNT_TYPE_GRADIENTS[account.account_type] || '#6b7280' }}
          >
            {getAccountTypeLabel(account.account_type)}
          </Badge>

          {/* Balance */}
          <span
            className={cn(
              'text-sm font-semibold min-w-[100px] text-left tabular-nums',
              account.balance > 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : account.balance < 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
            )}
          >
            {formatCurrency(account.balance)}
          </span>

          {/* System badge */}
          {isSystem && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
              <Shield className="w-3 h-3" />
              نظام
            </span>
          )}

          {/* Actions */}
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openEditDialog(account)}
                title="تعديل"
              >
                <Pencil className="w-3.5 h-3.5" />
              </Button>
            )}
            {canDelete && !isSystem && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => {
                  setDeletingAccount(account);
                  setDeleteDialogOpen(true);
                }}
                title="حذف"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {account.children!.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const clearFilters = () => {
    setSearch('');
    setTypeFilter('all');
  };

  const hasActiveFilters = search || typeFilter !== 'all';

  if (!canView) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <Network className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-xl font-bold">غير مسموح</h2>
          <p className="text-muted-foreground text-sm text-center max-w-xs">
            ليس لديك صلاحية لعرض شجرة الحسابات
          </p>
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
        transition={{ duration: 0.3 }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              <Network className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">شجرة الحسابات</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                إجمالي الحسابات: {accounts.length}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={expandAll} className="gap-1.5">
              <ChevronDown className="w-3.5 h-3.5" />
              توسيع الكل
            </Button>
            <Button variant="outline" size="sm" onClick={collapseAll} className="gap-1.5">
              <ChevronLeft className="w-3.5 h-3.5" />
              طي الكل
            </Button>
            {canCreate && (
              <Button onClick={openCreateDialog} className="gap-2 shadow-md" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                <Plus className="w-4 h-4" />
                إضافة حساب
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Stats Cards */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {ACCOUNT_TYPES.map((type) => (
            <Card key={type} className="border-0 shadow-md hover:shadow-lg transition-shadow cursor-default group">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white transition-transform group-hover:scale-110"
                    style={{ background: ACCOUNT_TYPE_GRADIENTS[type] }}
                  >
                    {ACCOUNT_TYPE_ICONS[type]}
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">
                    {getAccountTypeLabel(type)}
                  </span>
                </div>
                <div className="text-2xl font-bold">{stats.countByType[type]}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {formatCurrency(stats.balanceByType[type])}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #0ea5e9, #0284c7, #0369a1)' }} />
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو الكود..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
              <div>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="نوع الحساب" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الأنواع</SelectItem>
                    {ACCOUNT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {getAccountTypeLabel(type)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {hasActiveFilters && (
                <div className="flex items-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFilters}
                    className="gap-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                    مسح الفلاتر
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Accounts Tree */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-1" style={{ background: 'linear-gradient(90deg, #0ea5e9, #0284c7, #0369a1)' }} />
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderTree className="w-5 h-5" style={{ color: '#0ea5e9' }} />
              الحسابات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-5" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                  <Network className="w-12 h-12 text-white/80" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد حسابات</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إنشاء أي حسابات بعد. ابدأ بإنشاء أول حساب.
                </p>
                {canCreate && (
                  <Button onClick={openCreateDialog} className="gap-2 shadow-md" size="lg" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                    <Plus className="w-5 h-5" />
                    إنشاء حساب جديد
                  </Button>
                )}
              </div>
            ) : (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-0.5">
                  {treeData.map((account) => renderTreeNode(account))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                <Network className="w-4 h-4 text-white" />
              </div>
              {editingAccount ? 'تعديل حساب' : 'إضافة حساب جديد'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Account Code */}
            <div className="space-y-2">
              <Label>كود الحساب *</Label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="مثال: 1001"
                disabled={editingAccount?.is_system}
                className={editingAccount?.is_system ? 'bg-muted' : ''}
              />
            </div>

            {/* Account Name */}
            <div className="space-y-2">
              <Label>اسم الحساب *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="اسم الحساب بالعربية"
              />
            </div>

            {/* English Name */}
            <div className="space-y-2">
              <Label>الاسم بالإنجليزية</Label>
              <Input
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                placeholder="Account name in English (optional)"
                dir="ltr"
              />
            </div>

            {/* Parent Account */}
            <div className="space-y-2">
              <Label>الحساب الأب</Label>
              <Select
                value={formData.parent_id}
                onValueChange={(value) =>
                  setFormData({ ...formData, parent_id: value })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الحساب الأب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— بدون (حساب رئيسي) —</SelectItem>
                  {parentAccountOptions.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.code} - {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Account Type */}
            <div className="space-y-2">
              <Label>نوع الحساب *</Label>
              <Select
                value={formData.account_type}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    account_type: value as ChartOfAccount['account_type'],
                  })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر نوع الحساب" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded flex items-center justify-center text-white"
                          style={{ background: ACCOUNT_TYPE_GRADIENTS[type] }}
                        >
                          <span className="text-[8px]">{getAccountTypeLabel(type).charAt(0)}</span>
                        </div>
                        {getAccountTypeLabel(type)}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* System account notice */}
            {editingAccount?.is_system && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <Shield className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="text-xs text-amber-700 dark:text-amber-400">
                  حساب نظامي — لا يمكن تغيير الكود أو الحذف
                </span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
              {editingAccount ? 'تحديث الحساب' : 'إضافة الحساب'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف حساب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف الحساب &quot;{deletingAccount?.name}&quot; ({deletingAccount?.code})؟
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingAccount(null)}>
              تراجع
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
