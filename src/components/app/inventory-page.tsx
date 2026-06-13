'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Inventory, InventoryTransaction, Product, Branch } from '@/lib/types';
import { formatCurrency, formatDateTime, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Warehouse,
  Search,
  SlidersHorizontal,
  ArrowRightLeft,
  History,
  Package,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Plus,
  Minus,
  ArrowLeftRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface InventoryRow {
  id: string;
  product_id: string;
  branch_id: string;
  quantity: number;
  min_quantity: number;
  last_updated: string;
  products?: { name: string; unit_price: number; unit_count: number } | null;
  branches?: { name: string } | null;
}

interface TransactionRow {
  id: string;
  product_id: string;
  branch_id: string;
  transaction_type: 'in' | 'out' | 'adjust' | 'transfer' | 'tasbeen' | 'sale' | 'return' | 'count';
  quantity: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  transfer_id?: string | null;
  products?: { name: string } | null;
  branches?: { name: string } | null;
}

type StockStatus = 'all' | 'low' | 'out';

export default function InventoryPage() {
  const { user, isAdmin, hasPermission } = useAppStore();

  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [stockFilter, setStockFilter] = useState<StockStatus>('all');

  // Adjustment dialog
  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    product_id: '',
    branch_id: '',
    quantity: 0,
    notes: '',
  });

  // Transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [transferItem, setTransferItem] = useState<InventoryRow | null>(null);
  const [transferForm, setTransferForm] = useState({
    product_id: '',
    source_branch_id: '',
    destination_branch_id: '',
    quantity: 0,
    notes: '',
  });

  // Transaction history dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [historyItem, setHistoryItem] = useState<InventoryRow | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  // Confirm dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'adjust' | 'transfer' | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [inventoryRes, productsRes, branchesRes] = await Promise.all([
        supabase
          .from('inventory')
          .select('*, products(name, unit_price, unit_count), branches(name)')
          .order('last_updated', { ascending: false }),
        supabase
          .from('products')
          .select('*')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('branches')
          .select('*')
          .eq('is_active', true)
          .order('name'),
      ]);

      if (!inventoryRes.error && inventoryRes.data) {
        setInventory(inventoryRes.data as InventoryRow[]);
      }
      if (!productsRes.error && productsRes.data) {
        setProducts(productsRes.data as Product[]);
      }
      if (!branchesRes.error && branchesRes.data) {
        setBranches(branchesRes.data as Branch[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStockStatus = useCallback((item: InventoryRow): 'normal' | 'low' | 'out' => {
    if (item.quantity <= 0) return 'out';
    if (item.quantity <= item.min_quantity) return 'low';
    return 'normal';
  }, []);

  const filteredInventory = useMemo(() => {
    let result = inventory;

    // Branch filter for non-admin users
    if (!isAdmin && user?.branch_id) {
      result = result.filter((item) => item.branch_id === user.branch_id);
    }

    // Admin branch filter
    if (isAdmin && branchFilter !== 'all') {
      result = result.filter((item) => item.branch_id === branchFilter);
    }

    // Search filter
    if (search.trim()) {
      result = result.filter((item) => {
        const productName = item.products?.name || '';
        return productName.includes(search.trim());
      });
    }

    // Stock status filter
    if (stockFilter !== 'all') {
      result = result.filter((item) => {
        const status = getStockStatus(item);
        if (stockFilter === 'low') return status === 'low';
        if (stockFilter === 'out') return status === 'out';
        return true;
      });
    }

    return result;
  }, [inventory, isAdmin, user?.branch_id, branchFilter, search, stockFilter, getStockStatus]);

  const stats = useMemo(() => {
    const relevantInventory = !isAdmin && user?.branch_id
      ? inventory.filter((item) => item.branch_id === user.branch_id)
      : inventory;

    const totalProducts = relevantInventory.length;
    const lowStockCount = relevantInventory.filter((item) => getStockStatus(item) === 'low').length;
    const outOfStockCount = relevantInventory.filter((item) => getStockStatus(item) === 'out').length;
    const totalValue = relevantInventory.reduce((sum, item) => {
      const unitPrice = item.products?.unit_price || 0;
      return sum + (item.quantity * unitPrice);
    }, 0);

    return { totalProducts, lowStockCount, outOfStockCount, totalValue };
  }, [inventory, isAdmin, user?.branch_id, getStockStatus]);

  // Open adjust dialog for a specific item
  const openAdjustDialog = (item: InventoryRow) => {
    setAdjustItem(item);
    setAdjustForm({
      product_id: item.product_id,
      branch_id: item.branch_id,
      quantity: 0,
      notes: '',
    });
    setAdjustDialogOpen(true);
  };

  // Open adjust dialog fresh (no pre-selected item)
  const openNewAdjustDialog = () => {
    setAdjustItem(null);
    setAdjustForm({
      product_id: '',
      branch_id: user?.branch_id || '',
      quantity: 0,
      notes: '',
    });
    setAdjustDialogOpen(true);
  };

  // Open transfer dialog for a specific item
  const openTransferDialog = (item: InventoryRow) => {
    setTransferItem(item);
    setTransferForm({
      product_id: item.product_id,
      source_branch_id: item.branch_id,
      destination_branch_id: '',
      quantity: 0,
      notes: '',
    });
    setTransferDialogOpen(true);
  };

  // Open transfer dialog fresh
  const openNewTransferDialog = () => {
    setTransferItem(null);
    setTransferForm({
      product_id: '',
      source_branch_id: user?.branch_id || '',
      destination_branch_id: '',
      quantity: 0,
      notes: '',
    });
    setTransferDialogOpen(true);
  };

  // Open transaction history
  const openHistoryDialog = async (item: InventoryRow) => {
    setHistoryItem(item);
    setHistoryDialogOpen(true);
    setLoadingTransactions(true);
    try {
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*, products(name), branches(name)')
        .eq('product_id', item.product_id)
        .eq('branch_id', item.branch_id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setTransactions(data as TransactionRow[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // Handle stock adjustment
  const handleAdjust = async () => {
    if (!adjustForm.product_id || !adjustForm.branch_id) {
      toast.error('يرجى اختيار المنتج والفرع');
      return;
    }
    if (adjustForm.quantity === 0) {
      toast.error('يرجى إدخال الكمية');
      return;
    }

    setConfirmAction('adjust');
    setConfirmDialogOpen(true);
  };

  const executeAdjust = async () => {
    setAdjusting(true);
    try {
      // Find existing inventory record
      const { data: existingInv } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', adjustForm.product_id)
        .eq('branch_id', adjustForm.branch_id)
        .single();

      const transactionNumber = `IT-${Date.now()}`;
      const newQuantity = (existingInv?.quantity || 0) + adjustForm.quantity;

      if (newQuantity < 0) {
        toast.error('الكمية غير كافية في المخزون');
        setAdjusting(false);
        return;
      }

      // Update or create inventory record
      if (existingInv) {
        const { error: updateError } = await supabase
          .from('inventory')
          .update({
            quantity: newQuantity,
            last_updated: new Date().toISOString(),
          })
          .eq('id', existingInv.id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('inventory')
          .insert({
            product_id: adjustForm.product_id,
            branch_id: adjustForm.branch_id,
            quantity: adjustForm.quantity,
            min_quantity: 0,
            last_updated: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      // Insert transaction record
      const { error: txError } = await supabase
        .from('inventory_transactions')
        .insert({
          product_id: adjustForm.product_id,
          branch_id: adjustForm.branch_id,
          transaction_type: 'adjust',
          quantity: adjustForm.quantity,
          reference_type: 'manual_adjustment',
          reference_id: transactionNumber,
          notes: adjustForm.notes || null,
          created_by: user?.id || null,
        });

      if (txError) throw txError;

      // Log to audit_log
      await supabase.from('audit_log').insert({
        action: 'adjust_inventory',
        details: {
          product_id: adjustForm.product_id,
          branch_id: adjustForm.branch_id,
          quantity: adjustForm.quantity,
          new_quantity: newQuantity,
          reference: transactionNumber,
          notes: adjustForm.notes,
        },
      });

      toast.success('تم تسوية المخزون بنجاح');
      setAdjustDialogOpen(false);
      setConfirmDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تسوية المخزون');
    } finally {
      setAdjusting(false);
    }
  };

  // Handle stock transfer
  const handleTransfer = async () => {
    if (!transferForm.product_id || !transferForm.source_branch_id || !transferForm.destination_branch_id) {
      toast.error('يرجى اختيار المنتج والفرع المصدر والفرع الوجهة');
      return;
    }
    if (transferForm.source_branch_id === transferForm.destination_branch_id) {
      toast.error('لا يمكن التحويل بين نفس الفرع');
      return;
    }
    if (transferForm.quantity <= 0) {
      toast.error('يرجى إدخال كمية صحيحة');
      return;
    }

    setConfirmAction('transfer');
    setConfirmDialogOpen(true);
  };

  const executeTransfer = async () => {
    setTransferring(true);
    try {
      const transactionNumber = `IT-${Date.now()}`;

      // Check source inventory
      const { data: sourceInv } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', transferForm.product_id)
        .eq('branch_id', transferForm.source_branch_id)
        .single();

      if (!sourceInv || sourceInv.quantity < transferForm.quantity) {
        toast.error('الكمية غير كافية في الفرع المصدر');
        setTransferring(false);
        return;
      }

      // Decrease source inventory
      const sourceNewQty = sourceInv.quantity - transferForm.quantity;
      const { error: sourceUpdateError } = await supabase
        .from('inventory')
        .update({
          quantity: sourceNewQty,
          last_updated: new Date().toISOString(),
        })
        .eq('id', sourceInv.id);

      if (sourceUpdateError) throw sourceUpdateError;

      // Check destination inventory
      const { data: destInv } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', transferForm.product_id)
        .eq('branch_id', transferForm.destination_branch_id)
        .single();

      if (destInv) {
        // Update destination inventory
        const destNewQty = destInv.quantity + transferForm.quantity;
        const { error: destUpdateError } = await supabase
          .from('inventory')
          .update({
            quantity: destNewQty,
            last_updated: new Date().toISOString(),
          })
          .eq('id', destInv.id);

        if (destUpdateError) throw destUpdateError;
      } else {
        // Create destination inventory record
        const { error: destInsertError } = await supabase
          .from('inventory')
          .insert({
            product_id: transferForm.product_id,
            branch_id: transferForm.destination_branch_id,
            quantity: transferForm.quantity,
            min_quantity: 0,
            last_updated: new Date().toISOString(),
          });

        if (destInsertError) throw destInsertError;
      }

      // Create out transaction for source
      const { error: outTxError } = await supabase
        .from('inventory_transactions')
        .insert({
          product_id: transferForm.product_id,
          branch_id: transferForm.source_branch_id,
          transaction_type: 'transfer',
          quantity: -transferForm.quantity,
          reference_type: 'transfer_out',
          reference_id: transactionNumber,
          notes: transferForm.notes ? `تحويل إلى فرع آخر: ${transferForm.notes}` : 'تحويل إلى فرع آخر',
          created_by: user?.id || null,
        });

      if (outTxError) throw outTxError;

      // Create in transaction for destination
      const { error: inTxError } = await supabase
        .from('inventory_transactions')
        .insert({
          product_id: transferForm.product_id,
          branch_id: transferForm.destination_branch_id,
          transaction_type: 'transfer',
          quantity: transferForm.quantity,
          reference_type: 'transfer_in',
          reference_id: transactionNumber,
          notes: transferForm.notes ? `تحويل من فرع آخر: ${transferForm.notes}` : 'تحويل من فرع آخر',
          created_by: user?.id || null,
        });

      if (inTxError) throw inTxError;

      // Log to audit_log
      await supabase.from('audit_log').insert({
        action: 'transfer_inventory',
        details: {
          product_id: transferForm.product_id,
          source_branch_id: transferForm.source_branch_id,
          destination_branch_id: transferForm.destination_branch_id,
          quantity: transferForm.quantity,
          reference: transactionNumber,
          notes: transferForm.notes,
        },
      });

      toast.success('تم تحويل المخزون بنجاح');
      setTransferDialogOpen(false);
      setConfirmDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحويل المخزون');
    } finally {
      setTransferring(false);
    }
  };

  const getStatusBadge = (status: 'normal' | 'low' | 'out') => {
    switch (status) {
      case 'normal':
        return (
          <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
            متوفر
          </Badge>
        );
      case 'low':
        return (
          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
            منخفض
          </Badge>
        );
      case 'out':
        return (
          <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
            نفد
          </Badge>
        );
    }
  };

  const getTransactionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      in: 'إدخال',
      out: 'إخراج',
      adjust: 'تسوية',
      transfer: 'تحويل',
      tasbeen: 'تصبين',
      sale: 'بيع',
      return: 'مرتجع',
      count: 'جرد',
    };
    return labels[type] || type;
  };

  const getTransactionTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      in: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
      out: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      adjust: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
      transfer: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
      tasbeen: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      sale: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
      return: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
      count: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
    };
    return colors[type] || '';
  };

  const getProductName = (productId: string) => {
    return products.find((p) => p.id === productId)?.name || 'غير معروف';
  };

  const getBranchName = (branchId: string) => {
    return branches.find((b) => b.id === branchId)?.name || 'غير معروف';
  };

  // Get available branches for transfer destination (excluding source)
  const availableDestBranches = branches.filter(
    (b) => b.id !== transferForm.source_branch_id
  );

  // Stat cards
  const statCards = [
    {
      title: 'إجمالي الأصناف',
      value: stats.totalProducts,
      icon: Package,
      gradient: 'from-cyan-500 to-emerald-500',
      textColor: 'text-cyan-600 dark:text-cyan-400',
      bgLight: 'bg-cyan-50 dark:bg-cyan-900/20',
    },
    {
      title: 'مخزون منخفض',
      value: stats.lowStockCount,
      icon: AlertTriangle,
      gradient: 'from-amber-400 to-orange-500',
      textColor: 'text-amber-600 dark:text-amber-400',
      bgLight: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      title: 'نفد المخزون',
      value: stats.outOfStockCount,
      icon: AlertTriangle,
      gradient: 'from-red-400 to-rose-500',
      textColor: 'text-red-600 dark:text-red-400',
      bgLight: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      title: 'إجمالي القيمة',
      value: formatCurrency(stats.totalValue),
      icon: TrendingUp,
      gradient: 'from-emerald-500 to-teal-500',
      textColor: 'text-emerald-600 dark:text-emerald-400',
      bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-white" />
          </div>
          <p className="text-muted-foreground text-sm font-medium">جاري تحميل المخزون...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Warehouse className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">إدارة المخزون</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              تتبع وإدارة مخزون المنتجات في الفروع
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPermission('inventory', 'adjust') && (
            <Button onClick={openNewAdjustDialog} variant="outline" className="gap-2 shadow-sm border-dashed hover:border-solid transition-all">
              <SlidersHorizontal className="w-4 h-4" />
              تسوية مخزون
            </Button>
          )}
          {hasPermission('inventory', 'transfer') && (
            <Button onClick={openNewTransferDialog} className="gap-2 shadow-md bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-700 hover:to-emerald-700 text-white border-0">
              <ArrowLeftRight className="w-4 h-4" />
              تحويل مخزون
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.1 }}
            >
              <Card className="border-0 shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden group">
                <CardContent className="p-4 sm:p-5">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground">{card.title}</p>
                      <p className="text-xl sm:text-2xl font-bold mt-1">{card.value}</p>
                    </div>
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center bg-gradient-to-br ${card.gradient} shadow-lg transition-transform duration-300 group-hover:scale-110`}>
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
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
        transition={{ duration: 0.3, delay: 0.4 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-emerald-500 to-teal-500" />
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث باسم المنتج..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
              {isAdmin && (
                <Select value={branchFilter} onValueChange={setBranchFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="كل الفروع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as StockStatus)}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="حالة المخزون" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="low">منخفض</SelectItem>
                  <SelectItem value="out">نفد</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Inventory Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.5 }}
      >
        <Card className="border-0 shadow-md overflow-hidden">
          {/* Gradient accent bar at top */}
          <div className="h-1 bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500" />
          <CardContent className="p-0">
            {filteredInventory.length === 0 ? (
              /* Empty State */
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center mb-6 shadow-xl shadow-cyan-500/20">
                  <Warehouse className="w-12 h-12 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد بيانات مخزون</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم العثور على سجلات مخزون. يمكنك تسوية المخزون أو تحويله بين الفروع.
                </p>
                {hasPermission('inventory', 'adjust') && (
                  <Button onClick={openNewAdjustDialog} className="gap-2 shadow-md bg-gradient-to-r from-cyan-600 to-emerald-600 hover:from-cyan-700 hover:to-emerald-700 text-white border-0" size="lg">
                    <SlidersHorizontal className="w-5 h-5" />
                    تسوية مخزون
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile Card Layout */}
                <div className="sm:hidden p-3 space-y-3">
                  {filteredInventory.map((item, index) => {
                    const status = getStockStatus(item);
                    const borderColor = status === 'normal' ? 'border-r-cyan-500' : status === 'low' ? 'border-r-amber-500' : 'border-r-red-500';
                    const gradientClass = status === 'normal'
                      ? 'from-cyan-500 to-emerald-500'
                      : status === 'low'
                      ? 'from-amber-400 to-orange-500'
                      : 'from-red-400 to-rose-500';
                    const stockPercent = item.min_quantity > 0
                      ? Math.min(100, Math.round((item.quantity / (item.min_quantity * 2)) * 100))
                      : item.quantity > 0 ? 100 : 0;

                    return (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        className={cn(
                          "rounded-xl border-r-4 bg-card shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                          borderColor
                        )}
                      >
                        <div className="p-4">
                          {/* Card Header: Product name + icon + status badge */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradientClass} flex items-center justify-center shadow-md`}>
                                <Package className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm leading-tight">{item.products?.name || 'غير معروف'}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{item.branches?.name || 'غير معروف'}</p>
                              </div>
                            </div>
                            {getStatusBadge(status)}
                          </div>

                          {/* Quantity Display */}
                          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">الكمية الحالية</p>
                              <p className={cn(
                                "text-3xl font-bold leading-none",
                                status === 'out' && 'text-red-600 dark:text-red-400',
                                status === 'low' && 'text-amber-600 dark:text-amber-400',
                                status === 'normal' && 'text-emerald-600 dark:text-emerald-400',
                              )}>
                                {item.quantity}
                              </p>
                            </div>
                            <div className="text-left">
                              <p className="text-xs text-muted-foreground">الحد الأدنى</p>
                              <p className="text-sm font-medium text-muted-foreground">{item.min_quantity}</p>
                            </div>
                          </div>

                          {/* Stock Level Bar */}
                          <div className="h-2 rounded-full bg-muted/50 overflow-hidden mb-3">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                status === 'normal' && 'bg-gradient-to-l from-cyan-500 to-emerald-500',
                                status === 'low' && 'bg-gradient-to-l from-amber-400 to-orange-500',
                                status === 'out' && 'bg-gradient-to-l from-red-400 to-rose-500',
                              )}
                              style={{ width: `${stockPercent}%` }}
                            />
                          </div>

                          {/* Action Buttons */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {hasPermission('inventory', 'adjust') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openAdjustDialog(item)}
                                className="gap-1.5 text-xs flex-1 h-9"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5" />
                                تسوية
                              </Button>
                            )}
                            {hasPermission('inventory', 'transfer') && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => openTransferDialog(item)}
                                className="gap-1.5 text-xs flex-1 h-9"
                              >
                                <ArrowLeftRight className="w-3.5 h-3.5" />
                                تحويل
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openHistoryDialog(item)}
                              className="gap-1.5 text-xs flex-1 h-9"
                            >
                              <History className="w-3.5 h-3.5" />
                              السجل
                            </Button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30 hover:bg-muted/30">
                          <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">المنتج</TableHead>
                          <TableHead className="text-right font-semibold text-xs uppercase tracking-wider">الفرع</TableHead>
                          <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">الكمية الحالية</TableHead>
                          <TableHead className="text-center font-semibold text-xs uppercase tracking-wider hidden md:table-cell">الحد الأدنى</TableHead>
                          <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">الحالة</TableHead>
                          <TableHead className="text-right font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">آخر تحديث</TableHead>
                          <TableHead className="text-center font-semibold text-xs uppercase tracking-wider">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredInventory.map((item) => {
                          const status = getStockStatus(item);
                          const gradientClass = status === 'normal'
                            ? 'from-cyan-500 to-emerald-500'
                            : status === 'low'
                            ? 'from-amber-400 to-orange-500'
                            : 'from-red-400 to-rose-500';
                          const stockPercent = item.min_quantity > 0
                            ? Math.min(100, Math.round((item.quantity / (item.min_quantity * 2)) * 100))
                            : item.quantity > 0 ? 100 : 0;

                          return (
                            <TableRow
                              key={item.id}
                              className={cn(
                                "transition-colors duration-150 group",
                                status === 'out' && 'bg-red-50/50 dark:bg-red-900/5',
                                status === 'low' && 'bg-amber-50/50 dark:bg-amber-900/5',
                                "hover:bg-muted/50",
                              )}
                            >
                              <TableCell>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${gradientClass} flex items-center justify-center shadow-sm`}>
                                    <Package className="w-4 h-4 text-white" />
                                  </div>
                                  <span className="font-medium">{item.products?.name || 'غير معروف'}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-muted-foreground text-sm">
                                  {item.branches?.name || 'غير معروف'}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="text-center">
                                  <span className={cn(
                                    "font-bold text-lg",
                                    status === 'out' && 'text-red-600 dark:text-red-400',
                                    status === 'low' && 'text-amber-600 dark:text-amber-400',
                                    status === 'normal' && 'text-emerald-600 dark:text-emerald-400',
                                  )}>
                                    {item.quantity}
                                  </span>
                                  {/* Mini stock bar */}
                                  <div className="h-1 rounded-full bg-muted/50 overflow-hidden mt-1 w-16 mx-auto">
                                    <div
                                      className={cn(
                                        "h-full rounded-full",
                                        status === 'normal' && 'bg-gradient-to-l from-cyan-500 to-emerald-500',
                                        status === 'low' && 'bg-gradient-to-l from-amber-400 to-orange-500',
                                        status === 'out' && 'bg-gradient-to-l from-red-400 to-rose-500',
                                      )}
                                      style={{ width: `${stockPercent}%` }}
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-center hidden md:table-cell">
                                <span className="text-muted-foreground text-sm">
                                  {item.min_quantity}
                                </span>
                              </TableCell>
                              <TableCell className="text-center">
                                {getStatusBadge(status)}
                              </TableCell>
                              <TableCell className="text-right hidden lg:table-cell">
                                <span className="text-muted-foreground text-xs">
                                  {formatDateTime(item.last_updated)}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                  {hasPermission('inventory', 'adjust') && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openAdjustDialog(item)}
                                      className="h-8 w-8 hover:bg-cyan-50 hover:text-cyan-600 dark:hover:bg-cyan-900/20 dark:hover:text-cyan-400"
                                      title="تسوية"
                                    >
                                      <SlidersHorizontal className="w-4 h-4" />
                                    </Button>
                                  )}
                                  {hasPermission('inventory', 'transfer') && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => openTransferDialog(item)}
                                      className="h-8 w-8 hover:bg-purple-50 hover:text-purple-600 dark:hover:bg-purple-900/20 dark:hover:text-purple-400"
                                      title="تحويل"
                                    >
                                      <ArrowLeftRight className="w-4 h-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => openHistoryDialog(item)}
                                    className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400"
                                    title="السجل"
                                  >
                                    <History className="w-4 h-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Stock Adjustment Dialog */}
      <Dialog open={adjustDialogOpen} onOpenChange={setAdjustDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SlidersHorizontal className="w-5 h-5" />
              تسوية المخزون
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>المنتج *</Label>
              <Select
                value={adjustForm.product_id}
                onValueChange={(v) => setAdjustForm({ ...adjustForm, product_id: v })}
                disabled={!!adjustItem}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر المنتج" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفرع *</Label>
              <Select
                value={adjustForm.branch_id}
                onValueChange={(v) => setAdjustForm({ ...adjustForm, branch_id: v })}
                disabled={!!adjustItem || (!isAdmin && !!user?.branch_id)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الفرع" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => isAdmin || b.id === user?.branch_id)
                    .map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الكمية *</Label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setAdjustForm({ ...adjustForm, quantity: Math.abs(adjustForm.quantity) * -1 })}
                  className={cn(
                    adjustForm.quantity < 0 && 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                  )}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={adjustForm.quantity || ''}
                  onChange={(e) => setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) || 0 })}
                  placeholder="0"
                  className="text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setAdjustForm({ ...adjustForm, quantity: Math.abs(adjustForm.quantity) })}
                  className={cn(
                    adjustForm.quantity > 0 && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50'
                  )}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {adjustForm.quantity > 0 ? 'سيتم إضافة الكمية للمخزون' :
                 adjustForm.quantity < 0 ? 'سيتم خصم الكمية من المخزون' :
                 'أدخل الكمية (موجب للإضافة، سالب للخصم)'}
              </p>
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={adjustForm.notes}
                onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })}
                placeholder="سبب التسوية..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleAdjust} disabled={adjusting}>
              {adjusting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري التنفيذ...
                </>
              ) : (
                'تسوية'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="sm:max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowLeftRight className="w-5 h-5" />
              تحويل مخزون
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>المنتج *</Label>
              <Select
                value={transferForm.product_id}
                onValueChange={(v) => setTransferForm({ ...transferForm, product_id: v })}
                disabled={!!transferItem}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر المنتج" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفرع المصدر *</Label>
              <Select
                value={transferForm.source_branch_id}
                onValueChange={(v) => setTransferForm({ ...transferForm, source_branch_id: v, destination_branch_id: '' })}
                disabled={!!transferItem || (!isAdmin && !!user?.branch_id)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الفرع المصدر" />
                </SelectTrigger>
                <SelectContent>
                  {branches
                    .filter((b) => isAdmin || b.id === user?.branch_id)
                    .map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الفرع الوجهة *</Label>
              <Select
                value={transferForm.destination_branch_id}
                onValueChange={(v) => setTransferForm({ ...transferForm, destination_branch_id: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="اختر الفرع الوجهة" />
                </SelectTrigger>
                <SelectContent>
                  {availableDestBranches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الكمية *</Label>
              <Input
                type="number"
                inputMode="numeric"
                min="1"
                value={transferForm.quantity || ''}
                onChange={(e) => setTransferForm({ ...transferForm, quantity: Math.max(0, Number(e.target.value) || 0) })}
                placeholder="0"
                className="text-center"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={transferForm.notes}
                onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })}
                placeholder="سبب التحويل..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleTransfer} disabled={transferring}>
              {transferring ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري التنفيذ...
                </>
              ) : (
                'تحويل'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History Dialog */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              سجل الحركات
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }} className="p-3 bg-muted/50 rounded-lg">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 flex items-center justify-center">
                <Package className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-sm">{historyItem?.products?.name || 'غير معروف'}</p>
                <p className="text-xs text-muted-foreground">{historyItem?.branches?.name || 'غير معروف'}</p>
              </div>
              <div className="mr-auto text-left">
                <p className="font-bold text-sm">الكمية: {historyItem?.quantity || 0}</p>
              </div>
            </div>

            {loadingTransactions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                  <History className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-muted-foreground text-sm">لا توجد حركات سابقة</p>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="space-y-2">
                  {transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 transition-colors"
                    >
                      <div className={cn(
                        "w-9 h-9 rounded-lg flex items-center justify-center",
                        tx.transaction_type === 'in' || tx.transaction_type === 'transfer'
                          ? 'bg-emerald-100 dark:bg-emerald-900/30'
                          : tx.transaction_type === 'out'
                          ? 'bg-red-100 dark:bg-red-900/30'
                          : 'bg-amber-100 dark:bg-amber-900/30',
                      )}>
                        {tx.transaction_type === 'in' ? (
                          <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        ) : tx.transaction_type === 'out' ? (
                          <Minus className="w-4 h-4 text-red-600 dark:text-red-400" />
                        ) : tx.transaction_type === 'transfer' ? (
                          <ArrowLeftRight className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                        ) : (
                          <SlidersHorizontal className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Badge
                            variant="secondary"
                            className={cn("text-[10px] px-1.5 py-0", getTransactionTypeColor(tx.transaction_type))}
                          >
                            {getTransactionTypeLabel(tx.transaction_type)}
                          </Badge>
                          <span className={cn(
                            "font-bold text-sm",
                            tx.quantity > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
                          )}>
                            {tx.quantity > 0 ? '+' : ''}{tx.quantity}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {tx.notes || tx.reference_type || '—'}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(tx.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'adjust' ? 'تأكيد التسوية' : 'تأكيد التحويل'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'adjust' ? (
                <>
                  هل أنت متأكد من تسوية مخزون منتج &quot;{getProductName(adjustForm.product_id)}&quot;
                  في فرع &quot;{getBranchName(adjustForm.branch_id)}&quot;
                  {adjustForm.quantity > 0 ? ' بإضافة' : ' بخصم'} {Math.abs(adjustForm.quantity)} وحدة؟
                </>
              ) : (
                <>
                  هل أنت متأكد من تحويل {transferForm.quantity} وحدة من منتج &quot;{getProductName(transferForm.product_id)}&quot;
                  من فرع &quot;{getBranchName(transferForm.source_branch_id)}&quot;
                  إلى فرع &quot;{getBranchName(transferForm.destination_branch_id)}&quot;؟
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction === 'adjust' ? executeAdjust : executeTransfer}
              className="bg-primary hover:bg-primary/90"
            >
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
