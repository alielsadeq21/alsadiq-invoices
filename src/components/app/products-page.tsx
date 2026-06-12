'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Product, Category, Branch } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Package, Plus, Search, Edit, Trash2, BarChart3,
  CheckCircle2, XCircle, Barcode, Tag, DollarSign,
  Layers, Hash, Loader2, FolderPlus, ChevronDown, ChevronUp,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import DataTablePagination from '@/components/ui/data-table-pagination';
import { toast } from 'sonner';

// ─── Unit type options ───────────────────────────────────────────────────
const UNIT_TYPES = [
  { value: 'piece', label: 'قطعة' },
  { value: 'kg', label: 'كيلو' },
  { value: 'box', label: 'كرتونة' },
  { value: 'carton', label: 'صندوق' },
  { value: 'ton', label: 'طن' },
  { value: 'pack', label: 'عبوة' },
  { value: 'bag', label: 'كيس' },
  { value: 'tray', label: 'صينية' },
  { value: 'dozen', label: 'دستة' },
];

// ─── Form interface ──────────────────────────────────────────────────────
interface ProductForm {
  name: string;
  code: string;
  barcode: string;
  description: string;
  unit_price: number;
  cost_price: number;
  unit_count: number;
  unit_type: string;
  category: string;
  subcategory: string;
  min_stock: number;
  is_active: boolean;
  initial_qty: number;
  initial_branch_id: string;
}

const EMPTY_FORM: ProductForm = {
  name: '',
  code: '',
  barcode: '',
  description: '',
  unit_price: 0,
  cost_price: 0,
  unit_count: 1,
  unit_type: 'piece',
  category: '',
  subcategory: '',
  min_stock: 0,
  is_active: true,
  initial_qty: 0,
  initial_branch_id: '',
};

// ─── Component ───────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { hasPermission, user } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);

  // New category dialog
  const [newCatDialog, setNewCatDialog] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);

  // Load data
  useEffect(() => {
    loadProducts();
    loadCategories();
    loadBranches();
  }, [page, pageSize, search]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%,code.ilike.%${search}%,barcode.ilike.%${search}%`);
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      query = query.range(from, to);

      const { data, count, error } = await query;
      if (!error && data) {
        setProducts(data as Product[]);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (!error && data) {
        setCategories(data as Category[]);
      }
    } catch {
      // Categories table may not exist yet - that's OK, fall back to text input
    }
  };

  const loadBranches = async () => {
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        setBranches(data as Branch[]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ─── Generate next product code ─────────────────────────────────────────
  const generateProductCode = async (): Promise<string> => {
    try {
      const { data } = await supabase
        .from('products')
        .select('code')
        .not('code', 'is', null)
        .like('code', 'PRD-%')
        .order('code', { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].code) {
        const lastNum = parseInt(data[0].code.replace('PRD-', ''));
        return `PRD-${(lastNum + 1).toString().padStart(4, '0')}`;
      }
      return 'PRD-0001';
    } catch {
      return 'PRD-0001';
    }
  };

  // ─── Open add dialog ───────────────────────────────────────────────────
  const openAddDialog = async () => {
    setEditingProduct(null);
    const nextCode = await generateProductCode();
    setForm({
      ...EMPTY_FORM,
      code: nextCode,
      initial_branch_id: user?.branch_id || (branches[0]?.id ?? ''),
    });
    setDialogOpen(true);
  };

  // ─── Open edit dialog ──────────────────────────────────────────────────
  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      code: product.code || '',
      barcode: product.barcode || '',
      description: product.description || '',
      unit_price: product.unit_price,
      cost_price: product.cost_price || 0,
      unit_count: product.unit_count || 1,
      unit_type: product.unit_type || 'piece',
      category: product.category || '',
      subcategory: product.subcategory || '',
      min_stock: product.min_stock || 0,
      is_active: product.is_active,
      initial_qty: 0,
      initial_branch_id: '',
    });
    setDialogOpen(true);
  };

  // ─── Save product ──────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('يرجى إدخال اسم الصنف');
      return;
    }
    if (form.unit_price <= 0) {
      toast.error('يرجى إدخال سعر البيع');
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        // ─── Update ─────────────────────────────────────────────────────
        const { error } = await supabase
          .from('products')
          .update({
            name: form.name.trim(),
            code: form.code.trim() || null,
            barcode: form.barcode.trim() || null,
            description: form.description.trim() || null,
            unit_price: form.unit_price,
            cost_price: form.cost_price,
            unit_count: form.unit_count,
            unit_type: form.unit_type,
            category: form.category || null,
            subcategory: form.subcategory || null,
            min_stock: form.min_stock,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id);

        if (error) throw error;

        await supabase.from('audit_log').insert({
          action: 'update_product',
          details: { product_id: editingProduct.id, product_name: form.name },
        });

        toast.success('تم تحديث الصنف بنجاح');
      } else {
        // ─── Create ─────────────────────────────────────────────────────
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert({
            name: form.name.trim(),
            code: form.code.trim() || null,
            barcode: form.barcode.trim() || null,
            description: form.description.trim() || null,
            unit_price: form.unit_price,
            cost_price: form.cost_price,
            unit_count: form.unit_count,
            unit_type: form.unit_type,
            category: form.category || null,
            subcategory: form.subcategory || null,
            min_stock: form.min_stock,
            is_active: form.is_active,
          })
          .select('id')
          .single();

        if (error) throw error;

        // ─── Add initial inventory if quantity specified ──────────────
        if (form.initial_qty > 0 && newProduct && branches.length > 0) {
          const branchIds = form.initial_branch_id
            ? [form.initial_branch_id]
            : branches.map((b) => b.id);

          for (const bid of branchIds) {
            const { data: existingInv } = await supabase
              .from('inventory')
              .select('id, quantity')
              .eq('product_id', newProduct.id)
              .eq('branch_id', bid)
              .single();

            if (existingInv) {
              await supabase
                .from('inventory')
                .update({ quantity: existingInv.quantity + form.initial_qty, last_updated: new Date().toISOString() })
                .eq('id', existingInv.id);
            } else {
              await supabase.from('inventory').insert({
                product_id: newProduct.id,
                branch_id: bid,
                quantity: form.initial_qty,
                min_quantity: form.min_stock,
              });
            }

            // Log inventory transaction
            await supabase.from('inventory_transactions').insert({
              product_id: newProduct.id,
              branch_id: bid,
              transaction_type: 'in',
              quantity: form.initial_qty,
              reference_type: 'product_creation',
              reference_id: newProduct.id,
              notes: `إضافة صنف جديد - كمية أولية: ${form.initial_qty}`,
              created_by: user?.id || null,
            });
          }
        }

        await supabase.from('audit_log').insert({
          action: 'create_product',
          details: { product_id: newProduct?.id, product_name: form.name, code: form.code, initial_qty: form.initial_qty },
        });

        toast.success('تم إضافة الصنف بنجاح');
      }

      setDialogOpen(false);
      loadProducts();
    } catch (err: unknown) {
      console.error(err);
      const msg = (err as { message?: string })?.message || '';
      if (msg.includes('products_code_key') || msg.includes('duplicate key')) {
        toast.error('كود الصنف موجود بالفعل، يرجى تغييره');
      } else if (msg.includes('products_barcode_key')) {
        toast.error('الباركود موجود بالفعل لصنف آخر');
      } else {
        toast.error('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete product ────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingProduct) return;
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', deletingProduct.id);

      if (error) throw error;

      await supabase.from('audit_log').insert({
        action: 'delete_product',
        details: { product_id: deletingProduct.id, product_name: deletingProduct.name },
      });

      toast.success('تم حذف الصنف بنجاح');
      setDeleteDialogOpen(false);
      setDeletingProduct(null);
      loadProducts();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  // ─── Toggle product status ─────────────────────────────────────────────
  const toggleProductStatus = async (product: Product) => {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          is_active: !product.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', product.id);

      if (error) throw error;
      toast.success(product.is_active ? 'تم تعطيل الصنف' : 'تم تفعيل الصنف');
      loadProducts();
    } catch {
      toast.error('حدث خطأ');
    }
  };

  // ─── Add new category ──────────────────────────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatName.trim()) {
      toast.error('يرجى إدخال اسم الفئة');
      return;
    }
    setSavingCategory(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: newCatName.trim() })
        .select('id, name')
        .single();

      if (error) throw error;

      setCategories((prev) => [...prev, data as Category]);
      setForm((prev) => ({ ...prev, category: data.name }));
      setNewCatName('');
      setNewCatDialog(false);
      toast.success('تم إضافة الفئة بنجاح');
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || '';
      if (msg.includes('duplicate') || msg.includes('unique')) {
        toast.error('هذه الفئة موجودة بالفعل');
      } else {
        toast.error('حدث خطأ أثناء إضافة الفئة');
      }
    } finally {
      setSavingCategory(false);
    }
  };

  // ─── Derived values ────────────────────────────────────────────────────
  const totalPages = Math.ceil(totalCount / pageSize);
  const activeCount = useMemo(() => products.filter((p) => p.is_active).length, [products]);

  // Get unit type label
  const getUnitLabel = (value: string) => UNIT_TYPES.find((u) => u.value === value)?.label || value;

  // Get categories for dropdown (existing + from DB)
  const categoryOptions = useMemo(() => {
    const dbNames = categories.map((c) => c.name);
    const productCats = products
      .map((p) => p.category)
      .filter((c): c is string => !!c && !dbNames.includes(c));
    const uniqueCats = [...new Set(productCats)];
    return [...categories.map((c) => c.name), ...uniqueCats].sort();
  }, [categories, products]);

  // ─── Form update helper ────────────────────────────────────────────────
  const updateForm = useCallback((field: keyof ProductForm, value: string | number | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  // ─── Loading ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground">جاري تحميل المنتجات...</p>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="sm:flex-row sm:items-center sm:justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' }}>
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">إدارة الأصناف</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }} className="flex-wrap">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="text-[11px] sm:text-sm text-muted-foreground">
                <BarChart3 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                الإجمالي: {totalCount}
              </span>
              <span className="text-border text-[11px]">|</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="text-[11px] sm:text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                نشطة: {activeCount}
              </span>
              <span className="text-border text-[11px]">|</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }} className="text-[11px] sm:text-sm text-red-500 dark:text-red-400">
                <XCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                معطلة: {totalCount - activeCount}
              </span>
            </div>
          </div>
        </div>
        {hasPermission('products', 'create') && (
          <Button
            onClick={openAddDialog}
            className="gap-2 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] shrink-0 w-full sm:w-auto"
            style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
          >
            <Plus className="w-4 h-4" />
            إضافة صنف
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="h-1" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.4), hsl(var(--primary)))' }} />
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث بالاسم، الكود، الباركود أو الفئة..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Products Content */}
      {products.length === 0 ? (
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="py-20 px-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center mb-5"
                style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
              >
                <Package className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">لا توجد أصناف</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                لم يتم إضافة أي أصناف بعد. أضف أصناف لتسهيل إنشاء الفواتير وتوفير الوقت.
              </p>
              {hasPermission('products', 'create') && (
                <Button
                  onClick={openAddDialog}
                  className="gap-2 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] text-primary-foreground"
                  size="lg"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
                >
                  <Plus className="w-5 h-5" />
                  إضافة صنف جديد
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ─── Mobile Card Layout ─── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }} className="sm:hidden">
            {products.map((product, index) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: index * 0.03 }}
              >
                <Card
                  className={cn(
                    "border-0 shadow-md overflow-hidden border-r-4 transition-all duration-200 hover:shadow-lg active:scale-[0.98]",
                    product.is_active ? "border-r-emerald-500" : "border-r-red-500"
                  )}
                >
                  <CardContent className="p-4">
                    {/* Product name + code + status */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }} className="mb-2">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
                        >
                          <Package className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm tracking-tight">{product.name}</h3>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="flex-wrap">
                            {product.code && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{product.code}</span>
                            )}
                            {product.barcode && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">{product.barcode}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px] font-medium shadow-sm border-0 px-2.5 py-0.5 shrink-0",
                          product.is_active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                        )}
                      >
                        {product.is_active ? 'نشط' : 'معطل'}
                      </Badge>
                    </div>

                    {/* Category + Subcategory */}
                    {(product.category || product.subcategory) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="mb-2 flex-wrap">
                        {product.category && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
                            <Tag className="w-2.5 h-2.5 ml-1" />
                            {product.category}
                          </Badge>
                        )}
                        {product.subcategory && (
                          <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
                            {product.subcategory}
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] px-2 py-0 h-5">
                          {getUnitLabel(product.unit_type || 'piece')}
                        </Badge>
                      </div>
                    )}

                    {/* Price row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="pt-2 border-t border-dashed">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <span className="text-xs text-muted-foreground">البيع:</span>
                          <span className="font-bold text-sm text-green-600">{formatCurrency(product.unit_price)}</span>
                        </div>
                        {(product.cost_price || 0) > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                            <span className="text-xs text-muted-foreground">التكلفة:</span>
                            <span className="text-xs text-muted-foreground">{formatCurrency(product.cost_price)}</span>
                          </div>
                        )}
                      </div>
                      {product.unit_count > 1 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <span className="text-xs text-muted-foreground">عدد/وحدة:</span>
                          <span className="font-semibold text-sm">{product.unit_count}</span>
                        </div>
                      )}
                    </div>

                    {/* Toggle + Action buttons */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} className="mt-3 pt-2 border-t">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Switch
                          checked={product.is_active}
                          onCheckedChange={() => toggleProductStatus(product)}
                        />
                        <span className="text-xs text-muted-foreground">
                          {product.is_active ? 'مفعّل' : 'معطّل'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        {hasPermission('products', 'edit') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px] gap-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary/20 transition-colors"
                            onClick={() => openEditDialog(product)}
                          >
                            <Edit className="w-3.5 h-3.5" />
                            تعديل
                          </Button>
                        )}
                        {hasPermission('products', 'delete') && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-[11px] gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 border-destructive/30 transition-colors"
                            onClick={() => {
                              setDeletingProduct(product);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            حذف
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* ─── Desktop Table Layout ─── */}
          <Card className="border-0 shadow-md overflow-hidden hidden sm:block">
            <div className="h-1" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.3), transparent)' }} />
            <CardContent className="p-0">
              <div style={{ overflowX: 'auto' }}>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="text-right font-semibold">الصنف</TableHead>
                      <TableHead className="text-right font-semibold hidden lg:table-cell">الكود</TableHead>
                      <TableHead className="text-right font-semibold hidden md:table-cell">الفئة</TableHead>
                      <TableHead className="text-right font-semibold hidden xl:table-cell">الوحدة</TableHead>
                      <TableHead className="text-right font-semibold">سعر البيع</TableHead>
                      <TableHead className="text-right font-semibold hidden md:table-cell">التكلفة</TableHead>
                      <TableHead className="text-center font-semibold">الحالة</TableHead>
                      <TableHead className="text-center font-semibold">تفعيل</TableHead>
                      <TableHead className="text-center font-semibold">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((product) => (
                      <TableRow key={product.id} className="transition-colors hover:bg-muted/50">
                        <TableCell>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
                            >
                              <Package className="w-4 h-4 text-primary" />
                            </div>
                            <div>
                              <span className="font-medium">{product.name}</span>
                              {product.barcode && (
                                <p className="text-[10px] text-muted-foreground font-mono">{product.barcode}</p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {product.code ? (
                            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{product.code}</code>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {product.category ? (
                            <Badge variant="secondary" className="text-xs font-medium">
                              {product.category}
                            </Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
                            <span className="text-xs">{getUnitLabel(product.unit_type || 'piece')}</span>
                            {product.unit_count > 1 && (
                              <span className="text-[10px] text-muted-foreground">عدد: {product.unit_count}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-bold text-sm text-green-600">{formatCurrency(product.unit_price)}</span>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {(product.cost_price || 0) > 0 ? (
                            <span className="text-sm text-muted-foreground">{formatCurrency(product.cost_price)}</span>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className={
                              product.is_active
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            }
                          >
                            {product.is_active ? 'نشط' : 'معطل'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={product.is_active}
                            onCheckedChange={() => toggleProductStatus(product)}
                          />
                        </TableCell>
                        <TableCell>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                            {hasPermission('products', 'edit') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(product)}
                                className="h-8 w-8 hover:bg-primary/10 hover:text-primary transition-colors"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                            )}
                            {hasPermission('products', 'delete') && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setDeletingProduct(product);
                                  setDeleteDialogOpen(true);
                                }}
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <DataTablePagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                label="صنف"
              />
            </CardContent>
          </Card>

          {/* ─── Mobile Pagination ─── */}
          <div className="sm:hidden">
            <Card className="border-0 shadow-md overflow-hidden">
              <div className="h-0.5" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.3), transparent)' }} />
              <DataTablePagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                label="صنف"
              />
            </Card>
          </div>
        </>
      )}

      {/* ─── Add/Edit Dialog ────────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package className="w-5 h-5 text-primary" />
              {editingProduct ? 'تعديل الصنف' : 'إضافة صنف جديد'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* ─── Section 1: Basic Info ────────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Hash className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">البيانات الأساسية</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="product-name">اسم الصنف *</Label>
                  <Input
                    id="product-name"
                    value={form.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="مثال: كنافة نابلسية"
                  />
                </div>

                {/* Code */}
                <div className="space-y-2">
                  <Label htmlFor="product-code">كود الصنف</Label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input
                      id="product-code"
                      value={form.code}
                      onChange={(e) => updateForm('code', e.target.value)}
                      placeholder="PRD-0001"
                      className="font-mono"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">يتولد تلقائياً - يمكنك تعديله</p>
                </div>

                {/* Barcode */}
                <div className="space-y-2">
                  <Label htmlFor="product-barcode">الباركود</Label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Input
                      id="product-barcode"
                      value={form.barcode}
                      onChange={(e) => updateForm('barcode', e.target.value)}
                      placeholder="امسح أو أدخل الباركود"
                      className="font-mono"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="product-desc">وصف الصنف</Label>
                  <Textarea
                    id="product-desc"
                    value={form.description}
                    onChange={(e) => updateForm('description', e.target.value)}
                    placeholder="وصف تفصيلي للصنف (اختياري)..."
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ─── Section 2: Classification ────────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <Tag className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">التصنيف</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Category */}
                <div className="space-y-2">
                  <Label>الفئة</Label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Select value={form.category} onValueChange={(v) => updateForm('category', v)}>
                      <SelectTrigger className="text-xs">
                        <SelectValue placeholder="اختر الفئة" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => setNewCatDialog(true)}
                      title="إضافة فئة جديدة"
                    >
                      <FolderPlus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Subcategory */}
                <div className="space-y-2">
                  <Label htmlFor="product-subcategory">القسم</Label>
                  <Input
                    id="product-subcategory"
                    value={form.subcategory}
                    onChange={(e) => updateForm('subcategory', e.target.value)}
                    placeholder="مثال: كنافة، بقلاوة..."
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* ─── Section 3: Pricing & Units ───────────────────────── */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <DollarSign className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold">التسعير والوحدات</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Selling price */}
                <div className="space-y-2">
                  <Label htmlFor="product-price">سعر البيع (ج.م) *</Label>
                  <Input
                    id="product-price"
                    type="number"
                    inputMode="decimal"
                    value={form.unit_price || ''}
                    onChange={(e) => updateForm('unit_price', Number(e.target.value) || 0)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="text-left font-bold"
                  />
                </div>

                {/* Cost price */}
                <div className="space-y-2">
                  <Label htmlFor="product-cost">سعر التكلفة (ج.م)</Label>
                  <Input
                    id="product-cost"
                    type="number"
                    inputMode="decimal"
                    value={form.cost_price || ''}
                    onChange={(e) => updateForm('cost_price', Number(e.target.value) || 0)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="text-left"
                  />
                </div>

                {/* Unit type */}
                <div className="space-y-2">
                  <Label>وحدة القياس</Label>
                  <Select value={form.unit_type} onValueChange={(v) => updateForm('unit_type', v)}>
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIT_TYPES.map((u) => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Unit count */}
                <div className="space-y-2">
                  <Label htmlFor="product-unit-count">عدد الوحدات في الكرتونة</Label>
                  <Input
                    id="product-unit-count"
                    type="number"
                    inputMode="numeric"
                    value={form.unit_count || ''}
                    onChange={(e) => updateForm('unit_count', Math.max(1, Number(e.target.value) || 1))}
                    placeholder="1"
                    min="1"
                    step="1"
                    className="text-center"
                  />
                  <p className="text-[10px] text-muted-foreground">مثلاً: الكرتونة فيها 24 قطعة</p>
                </div>

                {/* Min stock */}
                <div className="space-y-2">
                  <Label htmlFor="product-min-stock">الحد الأدنى للمخزون</Label>
                  <Input
                    id="product-min-stock"
                    type="number"
                    inputMode="numeric"
                    value={form.min_stock || ''}
                    onChange={(e) => updateForm('min_stock', Number(e.target.value) || 0)}
                    placeholder="0"
                    min="0"
                    step="1"
                    className="text-center"
                  />
                  <p className="text-[10px] text-muted-foreground">أقل كمية قبل التنبيه</p>
                </div>

                {/* Profit margin indicator */}
                <div className="space-y-2">
                  <Label>هامش الربح</Label>
                  <div className="h-9 rounded-md border bg-muted/30 flex items-center justify-center px-3">
                    {form.unit_price > 0 && form.cost_price > 0 ? (
                      <span className={cn(
                        "text-sm font-bold",
                        ((form.unit_price - form.cost_price) / form.cost_price * 100) >= 30
                          ? "text-green-600"
                          : ((form.unit_price - form.cost_price) / form.cost_price * 100) >= 10
                            ? "text-amber-600"
                            : "text-red-600"
                      )}>
                        {((form.unit_price - form.cost_price) / form.cost_price * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">أدخل السعر والتكلفة</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Section 4: Initial Inventory (only for new products) ── */}
            {!editingProduct && (
              <>
                <Separator />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <Layers className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold">المخزون الأولي</span>
                    <Badge variant="outline" className="text-[10px]">اختياري</Badge>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Initial quantity */}
                    <div className="space-y-2">
                      <Label htmlFor="product-initial-qty">الكمية الأولية</Label>
                      <Input
                        id="product-initial-qty"
                        type="number"
                        inputMode="numeric"
                        value={form.initial_qty || ''}
                        onChange={(e) => updateForm('initial_qty', Number(e.target.value) || 0)}
                        placeholder="0"
                        min="0"
                        step="1"
                        className="text-center"
                      />
                    </div>

                    {/* Branch */}
                    <div className="space-y-2">
                      <Label>الفرع</Label>
                      <Select
                        value={form.initial_branch_id || 'all'}
                        onValueChange={(v) => updateForm('initial_branch_id', v === 'all' ? '' : v)}
                      >
                        <SelectTrigger className="text-xs">
                          <SelectValue placeholder="اختر الفرع" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">كل الفروع</SelectItem>
                          {branches.map((b) => (
                            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* ─── Active toggle ────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Switch
                id="product-active"
                checked={form.is_active}
                onCheckedChange={(checked) => updateForm('is_active', checked)}
              />
              <Label htmlFor="product-active" className="cursor-pointer">صنف نشط</Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="text-primary-foreground"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  جاري الحفظ...
                </>
              ) : editingProduct ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── New Category Dialog ──────────────────────────────────────────── */}
      <Dialog open={newCatDialog} onOpenChange={setNewCatDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FolderPlus className="w-5 h-5 text-primary" />
              إضافة فئة جديدة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">اسم الفئة *</Label>
              <Input
                placeholder="مثال: حلويات شرقية"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewCatDialog(false)}>
              إلغاء
            </Button>
            <Button
              className="text-primary-foreground"
              onClick={handleAddCategory}
              disabled={savingCategory}
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
            >
              {savingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Delete Confirmation Dialog ───────────────────────────────────── */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الصنف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف صنف &quot;{deletingProduct?.name}&quot;؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
