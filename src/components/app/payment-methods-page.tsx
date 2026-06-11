'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { PaymentMethod } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
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
  CreditCard,
  Plus,
  Pencil,
  Trash2,
  Star,
  GripVertical,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function PaymentMethodsPage() {
  const { isAdmin } = useAppStore();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit/Add state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editIsDefault, setEditIsDefault] = useState(false);

  // Add new
  const [newName, setNewName] = useState('');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingMethod, setDeletingMethod] = useState<PaymentMethod | null>(null);

  useEffect(() => {
    loadMethods();
  }, []);

  const loadMethods = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('sort_order');

      if (error) throw error;

      if (data && data.length > 0) {
        setMethods(data as PaymentMethod[]);
      } else {
        // Seed default methods if none exist
        const defaults = [
          { name: 'نقداً', is_default: true, sort_order: 1 },
          { name: 'تحويل بنكي', is_default: false, sort_order: 2 },
          { name: 'شيك', is_default: false, sort_order: 3 },
        ];
        const { data: inserted, error: insertError } = await supabase
          .from('payment_methods')
          .insert(defaults)
          .select();

        if (!insertError && inserted) {
          setMethods(inserted as PaymentMethod[]);
        } else {
          // Fallback if table doesn't exist yet
          setMethods([
            { id: '1', name: 'نقداً', is_default: true, sort_order: 1, created_at: '' },
            { id: '2', name: 'تحويل بنكي', is_default: false, sort_order: 2, created_at: '' },
            { id: '3', name: 'شيك', is_default: false, sort_order: 3, created_at: '' },
          ]);
        }
      }
    } catch {
      // Fallback if table doesn't exist yet
      setMethods([
        { id: '1', name: 'نقداً', is_default: true, sort_order: 1, created_at: '' },
        { id: '2', name: 'تحويل بنكي', is_default: false, sort_order: 2, created_at: '' },
        { id: '3', name: 'شيك', is_default: false, sort_order: 3, created_at: '' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error('يرجى إدخال اسم طريقة الدفع');
      return;
    }
    if (methods.some(m => m.name === newName.trim())) {
      toast.error('طريقة الدفع موجودة بالفعل');
      return;
    }

    setSaving(true);
    try {
      const maxSort = methods.reduce((max, m) => Math.max(max, m.sort_order), 0);
      const newMethod = {
        name: newName.trim(),
        is_default: methods.length === 0,
        sort_order: maxSort + 1,
      };

      const { data, error } = await supabase
        .from('payment_methods')
        .insert(newMethod)
        .select()
        .single();

      if (error) throw error;

      setMethods(prev => [...prev, data as PaymentMethod]);
      setNewName('');
      toast.success('تم إضافة طريقة الدفع بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء إضافة طريقة الدفع');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editId || !editName.trim()) {
      toast.error('يرجى إدخال اسم طريقة الدفع');
      return;
    }
    if (methods.some(m => m.name === editName.trim() && m.id !== editId)) {
      toast.error('طريقة الدفع موجودة بالفعل');
      return;
    }

    setSaving(true);
    try {
      const updates = { name: editName.trim(), is_default: editIsDefault };

      if (editIsDefault) {
        const currentDefault = methods.find(m => m.is_default);
        if (currentDefault && currentDefault.id !== editId) {
          await supabase
            .from('payment_methods')
            .update({ is_default: false })
            .eq('id', currentDefault.id);
        }
      }

      const { error } = await supabase
        .from('payment_methods')
        .update(updates)
        .eq('id', editId);

      if (error) throw error;

      setMethods(prev => {
        return prev.map(m => {
          if (m.id === editId) return { ...m, ...updates };
          if (editIsDefault) return { ...m, is_default: false };
          return m;
        });
      });

      setEditId(null);
      setEditName('');
      setEditIsDefault(false);
      toast.success('تم تعديل طريقة الدفع بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تعديل طريقة الدفع');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingMethod) return;

    try {
      const { error } = await supabase
        .from('payment_methods')
        .delete()
        .eq('id', deletingMethod.id);

      if (error) throw error;

      const remaining = methods.filter(m => m.id !== deletingMethod.id);

      if (deletingMethod.is_default && remaining.length > 0) {
        await supabase
          .from('payment_methods')
          .update({ is_default: true })
          .eq('id', remaining[0].id);
        remaining[0].is_default = true;
      }

      setMethods(remaining);
      toast.success('تم حذف طريقة الدفع بنجاح');
      setDeleteDialogOpen(false);
      setDeletingMethod(null);
    } catch {
      toast.error('حدث خطأ أثناء حذف طريقة الدفع');
    }
  };

  const startEdit = (method: PaymentMethod) => {
    setEditId(method.id);
    setEditName(method.name);
    setEditIsDefault(method.is_default);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
    setEditIsDefault(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {!isAdmin ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-xl font-bold">غير مسموح</h2>
          <p className="text-muted-foreground text-sm text-center max-w-xs">
            فقط المدير يمكنه إدارة طرق الدفع
          </p>
        </div>
      ) : (<>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
          <CreditCard className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">طرق الدفع</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            إدارة طرق الدفع المتاحة في إيصالات القبض - إضافة أو تعديل أو حذف
          </p>
        </div>
      </div>

      {/* Add new */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #10b981, #34d399, #10b981)' }} />
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <Plus className="w-4 h-4 text-white" />
              </div>
              إضافة طريقة دفع جديدة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="اسم طريقة الدفع (مثال: فودافون كاش)"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <Button onClick={handleAdd} disabled={saving} className="gap-2" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                إضافة
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #10b981, #34d399, #10b981)' }} />
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                <CreditCard className="w-4 h-4 text-white" />
              </div>
              طرق الدفع الحالية
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
                  <p className="text-sm text-muted-foreground">جاري التحميل...</p>
                </div>
              </div>
            ) : methods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-md" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                  <CreditCard className="w-8 h-8 text-white" />
                </div>
                <p className="text-muted-foreground text-sm">لا توجد طرق دفع مسجلة</p>
              </div>
            ) : (
              <>
                {/* Desktop List */}
                <div className="hidden sm:block space-y-1">
                  {methods.map((method) => (
                    <div key={method.id}>
                      {editId === method.id ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800">
                          <div className="flex-1 space-y-2">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="اسم طريقة الدفع"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <Switch
                                id={`default-${method.id}`}
                                checked={editIsDefault}
                                onCheckedChange={(checked) => setEditIsDefault(checked)}
                              />
                              <Label htmlFor={`default-${method.id}`} className="text-xs cursor-pointer">
                                طريقة الدفع الافتراضية
                              </Label>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" onClick={handleEdit} disabled={saving} className="gap-1" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              حفظ
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group">
                          <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                            <CreditCard className="w-4 h-4 text-white" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{method.name}</span>
                              {method.is_default && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  <Star className="w-3 h-3" />
                                  افتراضي
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">ترتيب: {method.sort_order}</span>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                              onClick={() => startEdit(method)}
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4 text-emerald-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => {
                                setDeletingMethod(method);
                                setDeleteDialogOpen(true);
                              }}
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                      )}
                      <Separator className="mt-1 last:hidden" />
                    </div>
                  ))}
                </div>

                {/* Mobile Cards */}
                <div className="sm:hidden space-y-2">
                  {methods.map((method) => (
                    <div key={method.id}>
                      {editId === method.id ? (
                        <div className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 space-y-3">
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="اسم طريقة الدفع"
                            autoFocus
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`default-m-${method.id}`}
                              checked={editIsDefault}
                              onCheckedChange={(checked) => setEditIsDefault(checked)}
                            />
                            <Label htmlFor={`default-m-${method.id}`} className="text-xs cursor-pointer">
                              طريقة الدفع الافتراضية
                            </Label>
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleEdit} disabled={saving} className="flex-1 gap-1" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              حفظ
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit} className="flex-1">
                              إلغاء
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border-r-4 border-emerald-500 bg-card p-3 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5">
                          <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
                              <CreditCard className="w-4 h-4 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{method.name}</span>
                                {method.is_default && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                    <Star className="w-3 h-3" />
                                    افتراضي
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-muted-foreground">ترتيب: {method.sort_order}</span>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => startEdit(method)}
                                title="تعديل"
                              >
                                <Pencil className="w-4 h-4 text-emerald-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setDeletingMethod(method);
                                  setDeleteDialogOpen(true);
                                }}
                                title="حذف"
                              >
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[95vw] sm:w-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <Trash2 className="w-4 h-4 text-white" />
              </div>
              حذف طريقة الدفع
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف طريقة الدفع &quot;{deletingMethod?.name}&quot;؟
              {deletingMethod?.is_default && ' سيتم تعيين أول طريقة دفع أخرى كافتراضية.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingMethod(null)}>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </>)}
    </div>
  );
}
