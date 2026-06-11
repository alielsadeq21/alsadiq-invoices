'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { InventoryTransfer, InventoryTransferItem, Branch, Product } from '@/lib/types';
import { formatCurrency, formatDate, formatDateTime, generateTransferNumber, generateJournalEntryNumber, getCurrentYear } from '@/lib/utils';
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
  ArrowRightLeft,
  Plus,
  Search,
  Loader2,
  Eye,
  CheckCircle2,
  XCircle,
  Package,
  Building2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Trash2,
  AlertTriangle,
  TrendingUp,
  HandCoins,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

// ─── Extended types ────────────────────────────────────────────────────────────
interface BranchWithFactory extends Branch {
  is_factory?: boolean;
}

interface TransferRow extends Omit<InventoryTransfer, 'from_branch' | 'to_branch' | 'items'> {
  from_branch?: { name: string } | null;
  to_branch?: { name: string } | null;
  items?: InventoryTransferItemRow[];
}

interface InventoryTransferItemRow extends Omit<InventoryTransferItem, 'products'> {
  products?: { name: string; unit_price: number; unit_count: number } | null;
}

interface TransferFormItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface BranchDebtRow {
  branch_id: string;
  branch_name: string;
  total_transferred: number;
  total_paid: number;
  remaining_debt: number;
}

type StatusFilter = 'all' | 'pending' | 'confirmed' | 'cancelled';
type ActiveView = 'list' | 'debts';

const PAGE_SIZE = 10;

// ─── Status helpers ────────────────────────────────────────────────────────────
const statusLabel: Record<string, string> = {
  pending: 'في الانتظار',
  confirmed: 'مؤكد',
  cancelled: 'ملغي',
};

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  confirmed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const statusIcon: Record<string, typeof CheckCircle2> = {
  pending: AlertTriangle,
  confirmed: CheckCircle2,
  cancelled: XCircle,
};

// ─── Component ─────────────────────────────────────────────────────────────────
export default function InventoryTransfersPage() {
  const { user, isAdmin, hasPermission } = useAppStore();

  // Data
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [factoryBranches, setFactoryBranches] = useState<BranchWithFactory[]>([]);
  const [destinationBranches, setDestinationBranches] = useState<BranchWithFactory[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [branchDebts, setBranchDebts] = useState<BranchDebtRow[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<ActiveView>('list');
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
    from_branch_id: '',
    to_branch_id: '',
    transfer_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [formItems, setFormItems] = useState<TransferFormItem[]>([]);

  // Detail dialog
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [detailTransfer, setDetailTransfer] = useState<TransferRow | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Confirm dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmingTransfer, setConfirmingTransfer] = useState<TransferRow | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Cancel dialog
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancellingTransfer, setCancellingTransfer] = useState<TransferRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // ─── Data loading ──────────────────────────────────────────────────────────
  useEffect(() => {
    loadBranches();
    loadProducts();
  }, []);

  useEffect(() => {
    if (activeView === 'list') {
      loadTransfers();
    } else {
      loadBranchDebts();
    }
  }, [activeView, page, search, statusFilter, branchFilter, dateFrom, dateTo]);

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      if (data) {
        const branches = data as BranchWithFactory[];
        setFactoryBranches(branches.filter((b) => b.is_factory === true));
        setDestinationBranches(branches.filter((b) => b.is_factory !== true));
      }
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

  const loadTransfers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('inventory_transfers')
        .select('*, from_branch:branches!inventory_transfers_from_branch_id_fkey(name), to_branch:branches!inventory_transfers_to_branch_id_fkey(name), items:inventory_transfer_items(*, products(name, unit_price, unit_count))', { count: 'exact' })
        .order('created_at', { ascending: false });

      // Filters
      if (search) {
        query = query.or(`transfer_number.ilike.%${search}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (branchFilter !== 'all') {
        query = query.or(`from_branch_id.eq.${branchFilter},to_branch_id.eq.${branchFilter}`);
      }
      if (dateFrom) {
        query = query.gte('transfer_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('transfer_date', dateTo);
      }

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, count, error } = await query;
      if (!error && data) {
        setTransfers(data as unknown as TransferRow[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error('Error loading transfers:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBranchDebts = async () => {
    setLoading(true);
    try {
      // Get all confirmed transfers grouped by destination branch
      const { data: transfersData, error: tError } = await supabase
        .from('inventory_transfers')
        .select('to_branch_id, total_amount')
        .eq('status', 'confirmed');

      if (tError) throw tError;

      // Get all payments from branches
      const { data: paymentsData, error: pError } = await supabase
        .from('payments')
        .select('branch_id, amount');

      if (pError) throw pError;

      // Get branch names
      const { data: branchesData } = await supabase
        .from('branches')
        .select('id, name')
        .eq('is_active', true);

      const branchMap = new Map((branchesData || []).map((b: { id: string; name: string }) => [b.id, b.name]));

      // Calculate debts
      const debtMap = new Map<string, { transferred: number; paid: number }>();

      (transfersData || []).forEach((t: { to_branch_id: string; total_amount: number }) => {
        const existing = debtMap.get(t.to_branch_id) || { transferred: 0, paid: 0 };
        existing.transferred += Number(t.total_amount);
        debtMap.set(t.to_branch_id, existing);
      });

      (paymentsData || []).forEach((p: { branch_id: string; amount: number }) => {
        const existing = debtMap.get(p.branch_id) || { transferred: 0, paid: 0 };
        existing.paid += Number(p.amount);
        debtMap.set(p.branch_id, existing);
      });

      const debts: BranchDebtRow[] = [];
      debtMap.forEach((value, key) => {
        const branchName = branchMap.get(key) || 'فرع غير معروف';
        debts.push({
          branch_id: key,
          branch_name: branchName,
          total_transferred: value.transferred,
          total_paid: value.paid,
          remaining_debt: value.transferred - value.paid,
        });
      });

      // Sort by remaining debt descending
      debts.sort((a, b) => b.remaining_debt - a.remaining_debt);
      setBranchDebts(debts);
    } catch (err) {
      console.error('Error loading branch debts:', err);
    } finally {
      setLoading(false);
    }
  };

  // ─── Filtered transfers (client-side supplement) ──────────────────────────
  const hasActiveFilters = search || statusFilter !== 'all' || branchFilter !== 'all' || dateFrom || dateTo;

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setBranchFilter('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // ─── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = transfers.filter((t) => t.status === 'pending').length;
    const confirmed = transfers.filter((t) => t.status === 'confirmed').length;
    const totalAmount = transfers.reduce((sum, t) => sum + Number(t.total_amount), 0);
    return { pending, confirmed, totalAmount };
  }, [transfers]);

  const totalDebt = useMemo(() => {
    return branchDebts.reduce((sum, d) => sum + d.remaining_debt, 0);
  }, [branchDebts]);

  // ─── Create transfer ──────────────────────────────────────────────────────
  const openCreateDialog = async () => {
    const year = getCurrentYear();
    setCreating(false);

    // Pre-select first factory branch if available
    const defaultFactory = factoryBranches.length > 0 ? factoryBranches[0].id : '';

    setCreateForm({
      from_branch_id: defaultFactory,
      to_branch_id: '',
      transfer_date: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setFormItems([]);
    setCreateDialogOpen(true);
  };

  const addFormItem = () => {
    setFormItems([...formItems, { product_id: '', quantity: 1, unit_price: 0, total_price: 0 }]);
  };

  const removeFormItem = (index: number) => {
    setFormItems(formItems.filter((_, i) => i !== index));
  };

  const updateFormItem = (index: number, field: keyof TransferFormItem, value: string | number) => {
    const updated = [...formItems];
    const item = { ...updated[index] };

    if (field === 'product_id') {
      item.product_id = value as string;
      // Auto-fill unit price from product
      const product = products.find((p) => p.id === value);
      if (product) {
        item.unit_price = product.unit_price;
        item.total_price = item.quantity * item.unit_price;
      }
    } else if (field === 'quantity') {
      item.quantity = Math.max(1, Number(value) || 1);
      item.total_price = item.quantity * item.unit_price;
    } else if (field === 'unit_price') {
      item.unit_price = Math.max(0, Number(value) || 0);
      item.total_price = item.quantity * item.unit_price;
    }

    updated[index] = item;
    setFormItems(updated);
  };

  const formTotalAmount = useMemo(() => {
    return formItems.reduce((sum, item) => sum + item.total_price, 0);
  }, [formItems]);

  const handleCreateTransfer = async () => {
    // Validation
    if (!createForm.from_branch_id) {
      toast.error('يرجى اختيار الفرع المصدر (المصنع)');
      return;
    }
    if (!createForm.to_branch_id) {
      toast.error('يرجى اختيار الفرع الوجهة');
      return;
    }
    if (createForm.from_branch_id === createForm.to_branch_id) {
      toast.error('لا يمكن التحويل بين نفس الفرع');
      return;
    }
    if (formItems.length === 0) {
      toast.error('يرجى إضافة منتج واحد على الأقل');
      return;
    }
    for (let i = 0; i < formItems.length; i++) {
      if (!formItems[i].product_id) {
        toast.error(`يرجى اختيار المنتج في السطر ${i + 1}`);
        return;
      }
      if (formItems[i].quantity <= 0) {
        toast.error(`يرجى إدخال كمية صحيحة في السطر ${i + 1}`);
        return;
      }
      if (formItems[i].unit_price <= 0) {
        toast.error(`يرجى إدخال سعر الوحدة في السطر ${i + 1}`);
        return;
      }
    }

    setCreating(true);
    try {
      // Generate transfer number
      const year = getCurrentYear();
      const { data: lastTransfer } = await supabase
        .from('inventory_transfers')
        .select('transfer_number')
        .like('transfer_number', `TR-${year}-%`)
        .order('transfer_number', { ascending: false })
        .limit(1);

      let lastNum = 0;
      if (lastTransfer && lastTransfer.length > 0) {
        const parts = lastTransfer[0].transfer_number.split('-');
        lastNum = parseInt(parts[parts.length - 1]) || 0;
      }

      const transferNumber = generateTransferNumber(lastNum, year);

      // Create transfer header
      const { data: newTransfer, error: transferError } = await supabase
        .from('inventory_transfers')
        .insert({
          transfer_number: transferNumber,
          from_branch_id: createForm.from_branch_id,
          to_branch_id: createForm.to_branch_id,
          transfer_date: createForm.transfer_date,
          total_amount: formTotalAmount,
          status: 'pending',
          notes: createForm.notes.trim() || null,
          created_by: user?.id || null,
        })
        .select('id')
        .single();

      if (transferError) throw transferError;
      if (!newTransfer) throw new Error('Failed to create transfer');

      // Create transfer items
      const itemsPayload = formItems.map((item) => ({
        transfer_id: newTransfer.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
      }));

      const { error: itemsError } = await supabase
        .from('inventory_transfer_items')
        .insert(itemsPayload);

      if (itemsError) throw itemsError;

      // Audit log
      await supabase.from('audit_log').insert({
        action: 'create_inventory_transfer',
        details: {
          transfer_number: transferNumber,
          from_branch_id: createForm.from_branch_id,
          to_branch_id: createForm.to_branch_id,
          total_amount: formTotalAmount,
          items_count: formItems.length,
        },
      });

      toast.success('تم إنشاء التصبين بنجاح');
      setCreateDialogOpen(false);
      loadTransfers();
    } catch (err) {
      console.error('Error creating transfer:', err);
      toast.error('حدث خطأ أثناء إنشاء التصبين');
    } finally {
      setCreating(false);
    }
  };

  // ─── View transfer details ────────────────────────────────────────────────
  const openDetailDialog = async (transfer: TransferRow) => {
    setDetailTransfer(transfer);
    setDetailDialogOpen(true);

    if (!transfer.items || transfer.items.length === 0) {
      setLoadingDetail(true);
      try {
        const { data, error } = await supabase
          .from('inventory_transfer_items')
          .select('*, products(name, unit_price, unit_count)')
          .eq('transfer_id', transfer.id)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setDetailTransfer({ ...transfer, items: data as InventoryTransferItemRow[] });
        }
      } catch (err) {
        console.error('Error loading transfer items:', err);
      } finally {
        setLoadingDetail(false);
      }
    } else {
      setLoadingDetail(false);
    }
  };

  // ─── Confirm transfer ─────────────────────────────────────────────────────
  const openConfirmDialog = (transfer: TransferRow) => {
    setConfirmingTransfer(transfer);
    setConfirmDialogOpen(true);
  };

  const handleConfirmTransfer = async () => {
    if (!confirmingTransfer) return;
    setConfirming(true);

    try {
      const transfer = confirmingTransfer;

      // Load items if not loaded
      let items = transfer.items;
      if (!items || items.length === 0) {
        const { data, error } = await supabase
          .from('inventory_transfer_items')
          .select('*, products(name, unit_price, unit_count)')
          .eq('transfer_id', transfer.id);

        if (error) throw error;
        items = (data as InventoryTransferItemRow[]) || [];
      }

      if (items.length === 0) {
        toast.error('لا توجد عناصر في هذا التصبين');
        setConfirming(false);
        return;
      }

      // ─── Step 1: Verify source inventory for each item ───────────────────
      for (const item of items) {
        const { data: sourceInv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('branch_id', transfer.from_branch_id)
          .single();

        if (!sourceInv || sourceInv.quantity < item.quantity) {
          const productName = item.products?.name || 'منتج غير معروف';
          toast.error(`الكمية غير كافية في المصنع للمنتج: ${productName} (المتاح: ${sourceInv?.quantity || 0})`);
          setConfirming(false);
          return;
        }
      }

      // ─── Step 2: Update inventory for each item ──────────────────────────
      for (const item of items) {
        // Decrease from source (factory)
        const { data: sourceInv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('branch_id', transfer.from_branch_id)
          .single();

        if (sourceInv) {
          const { error: srcErr } = await supabase
            .from('inventory')
            .update({
              quantity: sourceInv.quantity - item.quantity,
              last_updated: new Date().toISOString(),
            })
            .eq('id', sourceInv.id);

          if (srcErr) throw srcErr;
        }

        // Increase at destination (branch)
        const { data: destInv } = await supabase
          .from('inventory')
          .select('id, quantity')
          .eq('product_id', item.product_id)
          .eq('branch_id', transfer.to_branch_id)
          .single();

        if (destInv) {
          const { error: destErr } = await supabase
            .from('inventory')
            .update({
              quantity: destInv.quantity + item.quantity,
              last_updated: new Date().toISOString(),
            })
            .eq('id', destInv.id);

          if (destErr) throw destErr;
        } else {
          const { error: destInsErr } = await supabase
            .from('inventory')
            .insert({
              product_id: item.product_id,
              branch_id: transfer.to_branch_id,
              quantity: item.quantity,
              min_quantity: 0,
              last_updated: new Date().toISOString(),
            });

          if (destInsErr) throw destInsErr;
        }
      }

      // ─── Step 3: Create inventory_transactions for each item ──────────────
      for (const item of items) {
        // Out transaction from factory
        const { error: outTxErr } = await supabase
          .from('inventory_transactions')
          .insert({
            product_id: item.product_id,
            branch_id: transfer.from_branch_id,
            transaction_type: 'tasbeen',
            quantity: -item.quantity,
            reference_type: 'tasbeen_out',
            reference_id: transfer.id,
            notes: `تصبين إلى فرع - تحويل رقم ${transfer.transfer_number}`,
            created_by: user?.id || null,
            transfer_id: transfer.id,
          });

        if (outTxErr) throw outTxErr;

        // In transaction at branch
        const { error: inTxErr } = await supabase
          .from('inventory_transactions')
          .insert({
            product_id: item.product_id,
            branch_id: transfer.to_branch_id,
            transaction_type: 'tasbeen',
            quantity: item.quantity,
            reference_type: 'tasbeen_in',
            reference_id: transfer.id,
            notes: `تصبين من المصنع - تحويل رقم ${transfer.transfer_number}`,
            created_by: user?.id || null,
            transfer_id: transfer.id,
          });

        if (inTxErr) throw inTxErr;
      }

      // ─── Step 4: Create journal entry ────────────────────────────────────
      const year = getCurrentYear();
      const { data: lastEntry } = await supabase
        .from('journal_entries')
        .select('entry_number')
        .like('entry_number', `JE-${year}-%`)
        .order('entry_number', { ascending: false })
        .limit(1);

      let lastNum = 0;
      if (lastEntry && lastEntry.length > 0) {
        const parts = lastEntry[0].entry_number.split('-');
        lastNum = parseInt(parts[parts.length - 1]) || 0;
      }

      const entryNumber = generateJournalEntryNumber(lastNum, year);
      const totalAmount = Number(transfer.total_amount);

      // Get account IDs
      const { data: branchAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '2102')
        .single();

      const { data: factoryInventoryAccount } = await supabase
        .from('chart_of_accounts')
        .select('id')
        .eq('code', '1104')
        .single();

      const { data: newEntry, error: jeError } = await supabase
        .from('journal_entries')
        .insert({
          entry_number: entryNumber,
          entry_date: transfer.transfer_date,
          description: `قيد تصبين - تحويل رقم ${transfer.transfer_number}`,
          total_debit: totalAmount,
          total_credit: totalAmount,
          is_posted: true,
          notes: `قيد تلقائي من تصبين مخزون رقم ${transfer.transfer_number}`,
          created_by: user?.id || null,
          source_type: 'inventory_transfer',
          source_id: transfer.id,
        })
        .select('id')
        .single();

      if (!jeError && newEntry) {
        // Create journal entry lines: debit branch accounts, credit factory inventory
        await supabase.from('journal_entry_lines').insert([
          {
            journal_entry_id: newEntry.id,
            account_id: branchAccount?.id || null,
            account_name: 'حسابات الفروع',
            debit: totalAmount,
            credit: 0,
            description: `مدين - تصبين إلى فرع - تحويل رقم ${transfer.transfer_number}`,
          },
          {
            journal_entry_id: newEntry.id,
            account_id: factoryInventoryAccount?.id || null,
            account_name: 'مخزون المصنع',
            debit: 0,
            credit: totalAmount,
            description: `دائن - تصبين من المصنع - تحويل رقم ${transfer.transfer_number}`,
          },
        ]);

        // Link journal entry to transfer
        await supabase
          .from('inventory_transfers')
          .update({ journal_entry_id: newEntry.id })
          .eq('id', transfer.id);
      }

      // ─── Step 5: Update transfer status to confirmed ─────────────────────
      const { error: statusError } = await supabase
        .from('inventory_transfers')
        .update({
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transfer.id);

      if (statusError) throw statusError;

      // Audit log
      await supabase.from('audit_log').insert({
        action: 'confirm_inventory_transfer',
        details: {
          transfer_number: transfer.transfer_number,
          total_amount: totalAmount,
          journal_entry: entryNumber,
        },
      });

      toast.success('تم تأكيد التصبين وتحديث المخزون وإنشاء القيد المحاسبي بنجاح');
      setConfirmDialogOpen(false);
      setConfirmingTransfer(null);
      loadTransfers();
    } catch (err) {
      console.error('Error confirming transfer:', err);
      toast.error('حدث خطأ أثناء تأكيد التصبين');
    } finally {
      setConfirming(false);
    }
  };

  // ─── Cancel transfer ──────────────────────────────────────────────────────
  const openCancelDialog = (transfer: TransferRow) => {
    setCancellingTransfer(transfer);
    setCancelDialogOpen(true);
  };

  const handleCancelTransfer = async () => {
    if (!cancellingTransfer) return;
    setCancelling(true);

    try {
      const { error } = await supabase
        .from('inventory_transfers')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', cancellingTransfer.id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        action: 'cancel_inventory_transfer',
        details: {
          transfer_number: cancellingTransfer.transfer_number,
        },
      });

      toast.success('تم إلغاء التصبين بنجاح');
      setCancelDialogOpen(false);
      setCancellingTransfer(null);
      loadTransfers();
    } catch (err) {
      console.error('Error cancelling transfer:', err);
      toast.error('حدث خطأ أثناء إلغاء التصبين');
    } finally {
      setCancelling(false);
    }
  };

  // ─── Pagination ───────────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // ─── Product lookup ───────────────────────────────────────────────────────
  const getProductName = useCallback((productId: string) => {
    return products.find((p) => p.id === productId)?.name || 'غير معروف';
  }, [products]);

  // ─── Render: Loading ──────────────────────────────────────────────────────
  if (loading && transfers.length === 0 && branchDebts.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">جاري تحميل التحويلات...</p>
        </div>
      </div>
    );
  }

  // ─── Stat cards data ──────────────────────────────────────────────────────
  const listStatCards = [
    {
      title: 'في الانتظار',
      value: stats.pending,
      icon: AlertTriangle,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      title: 'مؤكدة',
      value: stats.confirmed,
      icon: CheckCircle2,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    },
    {
      title: 'إجمالي المبلغ',
      value: formatCurrency(stats.totalAmount),
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
  ];

  const debtsStatCards = [
    {
      title: 'إجمالي الديون على الفروع',
      value: formatCurrency(totalDebt),
      icon: HandCoins,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20',
    },
    {
      title: 'عدد الفروع المدينة',
      value: branchDebts.filter((d) => d.remaining_debt > 0).length,
      icon: Building2,
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20',
    },
    {
      title: 'إجمالي التصبينات',
      value: formatCurrency(branchDebts.reduce((s, d) => s + d.total_transferred, 0)),
      icon: ArrowRightLeft,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
  ];

  const currentStatCards = activeView === 'list' ? listStatCards : debtsStatCards;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold">التصبين والتحويلات</h1>
          <p className="text-muted-foreground text-sm mt-1">
            تحويل المخزون من المصنع إلى الفروع وإدارة مديونيات الفروع
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasPermission('inventory_transfers', 'view') && (
            <Button
              variant={activeView === 'debts' ? 'default' : 'outline'}
              onClick={() => { setActiveView('debts'); setLoading(true); }}
              className="gap-2 shadow-sm"
            >
              <HandCoins className="w-4 h-4" />
              مديونيات الفروع
            </Button>
          )}
          {hasPermission('inventory_transfers', 'create') && (
            <Button
              onClick={openCreateDialog}
              className="gap-2 shadow-md"
            >
              <Plus className="w-4 h-4" />
              تصبين جديد
            </Button>
          )}
        </div>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {currentStatCards.map((card, index) => {
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

      {/* ─── LIST VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'list' && (
        <>
          {/* Filters */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card className="border-0 shadow-md">
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="relative">
                    <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="بحث برقم التحويل..."
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
                      <SelectItem value="pending">في الانتظار</SelectItem>
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
                      {[...factoryBranches, ...destinationBranches].map((b) => (
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

          {/* Transfers Table */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <Card className="border-0 shadow-md">
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    <span className="mr-2 text-muted-foreground">جاري التحميل...</span>
                  </div>
                ) : transfers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 px-4">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                      <ArrowRightLeft className="w-12 h-12 text-primary/60" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">لا توجد تحويلات</h3>
                    <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                      لم يتم إنشاء أي تصبين بعد. ابدأ بتحويل المخزون من المصنع إلى الفروع.
                    </p>
                    {hasPermission('inventory_transfers', 'create') && (
                      <Button onClick={openCreateDialog} className="gap-2 shadow-md" size="lg">
                        <Plus className="w-5 h-5" />
                        تصبين جديد
                      </Button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">رقم التحويل</TableHead>
                            <TableHead className="text-right hidden md:table-cell">المصنع (المصدر)</TableHead>
                            <TableHead className="text-right hidden md:table-cell">الفرع (الوجهة)</TableHead>
                            <TableHead className="text-right hidden sm:table-cell">التاريخ</TableHead>
                            <TableHead className="text-right">المبلغ الإجمالي</TableHead>
                            <TableHead className="text-center">الحالة</TableHead>
                            <TableHead className="text-center">الإجراءات</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transfers.map((transfer) => {
                            const StatusIcon = statusIcon[transfer.status] || AlertTriangle;
                            return (
                              <TableRow key={transfer.id}>
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                                      <FileText className="w-4 h-4 text-primary" />
                                    </div>
                                    {transfer.transfer_number}
                                  </div>
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground">
                                  {transfer.from_branch?.name || '—'}
                                </TableCell>
                                <TableCell className="hidden md:table-cell text-muted-foreground">
                                  {transfer.to_branch?.name || '—'}
                                </TableCell>
                                <TableCell className="hidden sm:table-cell text-muted-foreground">
                                  {formatDate(transfer.transfer_date)}
                                </TableCell>
                                <TableCell className="font-semibold text-primary">
                                  {formatCurrency(transfer.total_amount)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Badge variant="secondary" className={`gap-1 ${statusColor[transfer.status]}`}>
                                    <StatusIcon className="w-3 h-3" />
                                    {statusLabel[transfer.status]}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() => openDetailDialog(transfer)}
                                      title="عرض التفاصيل"
                                    >
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                    {transfer.status === 'pending' && hasPermission('inventory_transfers', 'edit') && (
                                      <>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700"
                                          onClick={() => openConfirmDialog(transfer)}
                                          title="تأكيد التصبين"
                                        >
                                          <CheckCircle2 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-red-600 hover:text-red-700"
                                          onClick={() => openCancelDialog(transfer)}
                                          title="إلغاء"
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

                    {totalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <p className="text-sm text-muted-foreground">
                          صفحة {page} من {totalPages} ({totalCount} تحويل)
                        </p>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPage(Math.max(1, page - 1))}
                            disabled={page <= 1}
                          >
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setPage(Math.min(totalPages, page + 1))}
                            disabled={page >= totalPages}
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </>
      )}

      {/* ─── DEBTS VIEW ─────────────────────────────────────────────────────── */}
      {activeView === 'debts' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <HandCoins className="w-5 h-5 text-red-500" />
                مديونيات الفروع - ديون على الفروع للمصنع
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <span className="mr-2 text-muted-foreground">جاري التحميل...</span>
                </div>
              ) : branchDebts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-4">
                  <div className="w-24 h-24 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-5">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">لا توجد مديونيات</h3>
                  <p className="text-muted-foreground text-sm text-center">
                    جميع الفروع مسددة أو لا توجد تصبينات مؤكدة بعد
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">الفرع</TableHead>
                        <TableHead className="text-right">إجمالي التصبينات</TableHead>
                        <TableHead className="text-right">إجمالي المدفوعات</TableHead>
                        <TableHead className="text-right">الرصيد المدين</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchDebts.map((debt) => (
                        <TableRow key={debt.branch_id} className={debt.remaining_debt > 0 ? 'bg-red-50/50 dark:bg-red-900/5' : ''}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                                <Building2 className="w-4 h-4 text-primary" />
                              </div>
                              <span className="font-medium">{debt.branch_name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatCurrency(debt.total_transferred)}
                          </TableCell>
                          <TableCell className="text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(debt.total_paid)}
                          </TableCell>
                          <TableCell>
                            <span className={`font-bold ${debt.remaining_debt > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {formatCurrency(debt.remaining_debt)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ─── CREATE TRANSFER DIALOG ─────────────────────────────────────────── */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-primary" />
              تصبين جديد - تحويل مخزون
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4 py-4">
              {/* Header fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>الفرع المصدر (المصنع) *</Label>
                  <Select
                    value={createForm.from_branch_id}
                    onValueChange={(v) => setCreateForm({ ...createForm, from_branch_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المصنع" />
                    </SelectTrigger>
                    <SelectContent>
                      {factoryBranches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>الفرع الوجهة *</Label>
                  <Select
                    value={createForm.to_branch_id}
                    onValueChange={(v) => setCreateForm({ ...createForm, to_branch_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر الفرع الوجهة" />
                    </SelectTrigger>
                    <SelectContent>
                      {destinationBranches.map((b) => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>تاريخ التحويل *</Label>
                  <Input
                    type="date"
                    value={createForm.transfer_date}
                    onChange={(e) => setCreateForm({ ...createForm, transfer_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>المبلغ الإجمالي</Label>
                  <Input
                    value={formatCurrency(formTotalAmount)}
                    disabled
                    className="bg-muted font-semibold"
                  />
                </div>
              </div>

              {/* Items section */}
              <Separator />
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">المنتجات</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFormItem}
                  className="gap-1"
                >
                  <Plus className="w-4 h-4" />
                  إضافة منتج
                </Button>
              </div>

              {formItems.length === 0 ? (
                <div className="text-center py-8 border-2 border-dashed rounded-lg border-muted-foreground/20">
                  <Package className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">لم يتم إضافة منتجات بعد</p>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={addFormItem}
                    className="mt-2"
                  >
                    إضافة منتج
                  </Button>
                </div>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {formItems.map((item, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-12 gap-2 items-end p-3 bg-muted/30 rounded-lg border"
                    >
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <Label className="text-xs">المنتج *</Label>
                        <Select
                          value={item.product_id}
                          onValueChange={(v) => updateFormItem(index, 'product_id', v)}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="اختر المنتج" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-4 sm:col-span-2 space-y-1">
                        <Label className="text-xs">الكمية *</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          value={item.quantity || ''}
                          onChange={(e) => updateFormItem(index, 'quantity', e.target.value)}
                          className="h-9 text-center"
                        />
                      </div>
                      <div className="col-span-4 sm:col-span-3 space-y-1">
                        <Label className="text-xs">سعر الوحدة *</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={item.unit_price || ''}
                          onChange={(e) => updateFormItem(index, 'unit_price', e.target.value)}
                          className="h-9 text-left"
                        />
                      </div>
                      <div className="col-span-3 sm:col-span-2 space-y-1">
                        <Label className="text-xs">الإجمالي</Label>
                        <Input
                          value={formatCurrency(item.total_price)}
                          disabled
                          className="h-9 bg-muted text-left"
                        />
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-destructive hover:text-destructive"
                          onClick={() => removeFormItem(index)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={createForm.notes}
                  onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  placeholder="ملاحظات إضافية..."
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="pt-2 border-t">
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleCreateTransfer} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري الإنشاء...
                </>
              ) : (
                'إنشاء التصبين'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── DETAIL DIALOG ──────────────────────────────────────────────────── */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              تفاصيل التحويل
            </DialogTitle>
          </DialogHeader>

          {detailTransfer ? (
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 py-4">
                {/* Transfer info */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">رقم التحويل</Label>
                    <p className="font-semibold">{detailTransfer.transfer_number}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">الحالة</Label>
                    <div>
                      <Badge variant="secondary" className={statusColor[detailTransfer.status]}>
                        {statusLabel[detailTransfer.status]}
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">المصنع (المصدر)</Label>
                    <p className="font-medium">{detailTransfer.from_branch?.name || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">الفرع (الوجهة)</Label>
                    <p className="font-medium">{detailTransfer.to_branch?.name || '—'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">تاريخ التحويل</Label>
                    <p>{formatDate(detailTransfer.transfer_date)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">المبلغ الإجمالي</Label>
                    <p className="font-bold text-primary text-lg">{formatCurrency(detailTransfer.total_amount)}</p>
                  </div>
                </div>

                {/* Notes */}
                {detailTransfer.notes && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">ملاحظات</Label>
                    <p className="text-sm bg-muted/50 p-3 rounded-lg">{detailTransfer.notes}</p>
                  </div>
                )}

                <Separator />

                {/* Items table */}
                <div className="space-y-2">
                  <Label className="text-base font-semibold">عناصر التحويل</Label>
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto border rounded-lg">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-right">المنتج</TableHead>
                            <TableHead className="text-center">الكمية</TableHead>
                            <TableHead className="text-left">سعر الوحدة</TableHead>
                            <TableHead className="text-left">الإجمالي</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailTransfer.items?.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="font-medium">
                                {item.products?.name || getProductName(item.product_id)}
                              </TableCell>
                              <TableCell className="text-center">{item.quantity}</TableCell>
                              <TableCell className="text-left">{formatCurrency(item.unit_price)}</TableCell>
                              <TableCell className="text-left font-semibold">{formatCurrency(item.total_price)}</TableCell>
                            </TableRow>
                          ))}
                          {(!detailTransfer.items || detailTransfer.items.length === 0) && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                                لا توجد عناصر
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Journal entry info */}
                {detailTransfer.journal_entry_id && (
                  <div className="bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-sm text-emerald-700 dark:text-emerald-300">
                      تم إنشاء قيد محاسبي لهذا التصبين
                    </span>
                  </div>
                )}

                {/* Date info */}
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>تاريخ الإنشاء: {formatDateTime(detailTransfer.created_at)}</span>
                  <span>آخر تحديث: {formatDateTime(detailTransfer.updated_at)}</span>
                </div>
              </div>
            </ScrollArea>
          ) : (
            <div className="py-12 text-center text-muted-foreground">لا توجد بيانات</div>
          )}

          <DialogFooter className="pt-2 border-t gap-2">
            <Button variant="outline" onClick={() => setDetailDialogOpen(false)}>
              إغلاق
            </Button>
            {detailTransfer?.status === 'pending' && hasPermission('inventory_transfers', 'edit') && (
              <>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDetailDialogOpen(false);
                    if (detailTransfer) openCancelDialog(detailTransfer);
                  }}
                  className="gap-2"
                >
                  <XCircle className="w-4 h-4" />
                  إلغاء التصبين
                </Button>
                <Button
                  onClick={() => {
                    setDetailDialogOpen(false);
                    if (detailTransfer) openConfirmDialog(detailTransfer);
                  }}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  تأكيد التصبين
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── CONFIRM DIALOG ─────────────────────────────────────────────────── */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              تأكيد التصبين
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من تأكيد التصبين رقم &quot;{confirmingTransfer?.transfer_number}&quot;؟
              <br />
              سيتم تحديث المخزون وإنشاء قيد محاسبي تلقائياً. لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirmingTransfer && (
            <div className="bg-muted/50 p-4 rounded-lg space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">المصنع:</span>
                <span className="font-medium">{confirmingTransfer.from_branch?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">الفرع:</span>
                <span className="font-medium">{confirmingTransfer.to_branch?.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ:</span>
                <span className="font-bold text-primary">{formatCurrency(confirmingTransfer.total_amount)}</span>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirming}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmTransfer}
              disabled={confirming}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري التأكيد...
                </>
              ) : (
                'تأكيد التصبين'
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
              <XCircle className="w-5 h-5 text-red-600" />
              إلغاء التصبين
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              هل أنت متأكد من إلغاء التصبين رقم &quot;{cancellingTransfer?.transfer_number}&quot;؟
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelTransfer}
              disabled={cancelling}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري الإلغاء...
                </>
              ) : (
                'إلغاء التصبين'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
