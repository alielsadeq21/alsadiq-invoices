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
import { Package, Plus, Search, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ProductsPage() {
  const { hasPermission } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
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
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setProducts(data as Product[]);
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

  const filteredProducts = useMemo(() => {
    return products.filter(
      (p) =>
        p.name.includes(search) ||
        (p.category && p.category.includes(search))
    );
  }, [products, search]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">إدارة المنتجات</h1>
          <p className="text-muted-foreground text-sm mt-1">
            إجمالي المنتجات: {products.length} | نشطة: {products.filter((p) => p.is_active).length}
          </p>
        </div>
        {hasPermission('products', 'create') && (
          <Button onClick={openAddDialog} className="gap-2 shadow-md">
            <Plus className="w-4 h-4" />
            إضافة منتج
          </Button>
        )}
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث في المنتجات..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <Package className="w-12 h-12 text-primary/60" />
              </div>
              <h3 className="text-xl font-bold mb-2">لا توجد منتجات</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                لم يتم إضافة أي منتجات بعد. أضف منتجات لتسهيل إنشاء الفواتير وتوفير الوقت.
              </p>
              {hasPermission('products', 'create') && (
                <Button onClick={openAddDialog} className="gap-2 shadow-md" size="lg">
                  <Plus className="w-5 h-5" />
                  إضافة منتج جديد
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">المنتج</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">الفئة</TableHead>
                    <TableHead className="text-right hidden md:table-cell">عدد/وحدة</TableHead>
                    <TableHead className="text-right">سعر الوحدة</TableHead>
                    <TableHead className="text-center">الحالة</TableHead>
                    <TableHead className="text-center">تفعيل</TableHead>
                    <TableHead className="text-center">الإجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Package className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {product.category ? (
                          <Badge variant="secondary" className="text-xs">
                            {product.category}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {product.unit_count > 1 ? product.unit_count : '—'}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {formatCurrency(product.unit_price)}
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
                        <div className="flex items-center justify-center gap-1">
                          {hasPermission('products', 'edit') && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(product)}
                              className="h-8 w-8"
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
                              className="h-8 w-8 text-destructive hover:text-destructive"
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
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
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
            <div className="flex items-center gap-2">
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
            <Button onClick={handleSave}>
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
