'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { Package, Plus, Search, Edit, Trash2, BarChart3, CheckCircle2, XCircle } from 'lucide-react';
import DataTablePagination from '@/components/ui/data-table-pagination';
import { toast } from 'sonner';

export default function ProductsPage() {
  const { hasPermission } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const [form, setForm] = useState({
    name: '',
    unit_price: 0,
    unit_count: 1,
    category: '',
    is_active: true,
  });

  useEffect(() => {
    loadProducts();
  }, [page, pageSize, search]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('products')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,category.ilike.%${search}%`);
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

  const openAddDialog = () => {
    setEditingProduct(null);
    setForm({ name: '', unit_price: 0, unit_count: 1, category: '', is_active: true });
    setDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setForm({
      name: product.name,
      unit_price: product.unit_price,
      unit_count: product.unit_count || 1,
      category: product.category || '',
      is_active: product.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('يرجى إدخال اسم المنتج');
      return;
    }
    if (form.unit_price <= 0) {
      toast.error('يرجى إدخال سعر الوحدة');
      return;
    }

    try {
      if (editingProduct) {
        const { error } = await supabase
          .from('products')
          .update({
            name: form.name,
            unit_price: form.unit_price,
            unit_count: form.unit_count,
            category: form.category || null,
            is_active: form.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingProduct.id);

        if (error) throw error;
        toast.success('تم تحديث المنتج بنجاح');
      } else {
        const { error } = await supabase.from('products').insert({
          name: form.name,
          unit_price: form.unit_price,
          unit_count: form.unit_count,
          category: form.category || null,
          is_active: form.is_active,
        });

        if (error) throw error;
        await supabase.from('audit_log').insert({
          action: 'create_product',
          details: { product_name: form.name },
        });
        toast.success('تم إضافة المنتج بنجاح');
      }

      setDialogOpen(false);
      loadProducts();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async () => {
    if (!deletingProduct) return;
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', deletingProduct.id);

      if (error) throw error;
      toast.success('تم حذف المنتج بنجاح');
      setDeleteDialogOpen(false);
      setDeletingProduct(null);
      loadProducts();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

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
      toast.success(product.is_active ? 'تم تعطيل المنتج' : 'تم تفعيل المنتج');
      loadProducts();
    } catch (err) {
      toast.error('حدث خطأ');
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  const activeCount = useMemo(() => products.filter((p) => p.is_active).length, [products]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="sm:flex-row sm:items-center sm:justify-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))' }}>
            <Package className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">إدارة المنتجات</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }} className="flex-wrap">
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="text-sm text-muted-foreground">
                <BarChart3 className="w-3.5 h-3.5" />
                الإجمالي: {totalCount}
              </span>
              <span className="text-border">|</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-3.5 h-3.5" />
                نشطة: {activeCount}
              </span>
              <span className="text-border">|</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }} className="text-sm text-red-500 dark:text-red-400">
                <XCircle className="w-3.5 h-3.5" />
                معطلة: {totalCount - activeCount}
              </span>
            </div>
          </div>
        </div>
        {hasPermission('products', 'create') && (
          <Button
            onClick={openAddDialog}
            className="gap-2 text-primary-foreground shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] shrink-0"
            style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
          >
            <Plus className="w-4 h-4" />
            إضافة منتج
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="h-1" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.4), hsl(var(--primary)))' }} />
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث في المنتجات..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Products Content */}
      <Card className="border-0 shadow-md overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }} className="py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : products.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} className="py-20 px-4">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center mb-5"
                style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
              >
                <Package className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">لا توجد منتجات</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                لم يتم إضافة أي منتجات بعد. أضف منتجات لتسهيل إنشاء الفواتير وتوفير الوقت.
              </p>
              {hasPermission('products', 'create') && (
                <Button
                  onClick={openAddDialog}
                  className="gap-2 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-[1.02] text-primary-foreground"
                  size="lg"
                  style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
                >
                  <Plus className="w-5 h-5" />
                  إضافة منتج جديد
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="sm:hidden p-3 space-y-3">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-xl border-r-4 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
                    style={{
                      borderRightColor: product.is_active ? '#10b981' : '#ef4444',
                      background: 'hsl(var(--card))',
                    }}
                  >
                    <div className="p-3 sm:p-4 space-y-3">
                      {/* Product name with icon */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                          style={{ background: 'linear-gradient(135deg, hsl(var(--primary) / 0.15), hsl(var(--primary) / 0.05))' }}
                        >
                          <Package className="w-5 h-5 text-primary" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 className="font-semibold text-sm truncate">{product.name}</h3>
                          {product.category && (
                            <span className="text-xs text-muted-foreground">{product.category}</span>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            product.is_active
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs shrink-0'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-xs shrink-0'
                          }
                        >
                          {product.is_active ? 'نشط' : 'معطل'}
                        </Badge>
                      </div>

                      {/* Price and unit row */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          className="rounded-lg px-3 py-1.5 text-center"
                          style={{ background: 'hsl(var(--muted))' }}
                        >
                          <span className="text-xs text-muted-foreground block">السعر</span>
                          <span className="font-bold text-sm">{formatCurrency(product.unit_price)}</span>
                        </div>
                        {product.unit_count > 1 && (
                          <div
                            className="rounded-lg px-3 py-1.5 text-center"
                            style={{ background: 'hsl(var(--muted))' }}
                          >
                            <span className="text-xs text-muted-foreground block">الوحدة</span>
                            <span className="font-semibold text-sm">{product.unit_count}</span>
                          </div>
                        )}
                      </div>

                      {/* Toggle + Actions */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(product)}
                              className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors"
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
                              className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block">
                <div className="h-1" style={{ background: 'linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.3), transparent)' }} />
                <div style={{ overflowX: 'auto' }}>
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="text-right font-semibold">المنتج</TableHead>
                        <TableHead className="text-right font-semibold hidden sm:table-cell">الفئة</TableHead>
                        <TableHead className="text-right font-semibold hidden md:table-cell">عدد/وحدة</TableHead>
                        <TableHead className="text-right font-semibold">سعر الوحدة</TableHead>
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
                              <span className="font-medium">{product.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell">
                            {product.category ? (
                              <Badge variant="secondary" className="text-xs font-medium">
                                {product.category}
                              </Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {product.unit_count > 1 ? product.unit_count : '—'}
                          </TableCell>
                          <TableCell>
                            <span className="font-bold text-sm">{formatCurrency(product.unit_price)}</span>
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
              </div>

              <DataTablePagination
                page={page}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
                label="منتج"
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:w-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? 'تعديل المنتج' : 'إضافة منتج جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="product-name">اسم المنتج *</Label>
              <Input
                id="product-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="مثال: كنافة نابلسية"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="product-price">سعر الوحدة (ج.م) *</Label>
                <Input
                  id="product-price"
                  type="number"
                  inputMode="decimal"
                  value={form.unit_price || ''}
                  onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) || 0 })}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-unit-count">عدد/وحدة</Label>
                <Input
                  id="product-unit-count"
                  type="number"
                  inputMode="numeric"
                  value={form.unit_count || ''}
                  onChange={(e) => setForm({ ...form, unit_count: Math.max(1, Number(e.target.value) || 1) })}
                  placeholder="1"
                  min="1"
                  step="1"
                  className="text-center"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="product-category">الفئة</Label>
              <Input
                id="product-category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="مثال: حلويات شرقية"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Switch
                id="product-active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label htmlFor="product-active">منتج نشط</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              className="text-primary-foreground"
              style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.8))' }}
            >
              {editingProduct ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المنتج</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف منتج &quot;{deletingProduct?.name}&quot;؟ لا يمكن التراجع عن هذا الإجراء.
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
