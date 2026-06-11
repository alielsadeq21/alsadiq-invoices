'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { ExpenseCategory } from '@/lib/types';
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
  Tag,
  Plus,
  Pencil,
  Trash2,
  Star,
  GripVertical,
  Loader2,
  Tags,
  Power,
  PowerOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function ExpenseCategoriesPage() {
  const { isAdmin, hasPermission } = useAppStore();
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editIsActive, setEditIsActive] = useState(true);

  // Add new
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<ExpenseCategory | null>(null);

  const canView = isAdmin || hasPermission('expense_categories', 'view');
  const canCreate = isAdmin || hasPermission('expense_categories', 'create');
  const canEdit = isAdmin || hasPermission('expense_categories', 'edit');
  const canDelete = isAdmin || hasPermission('expense_categories', 'delete');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setCategories(data as ExpenseCategory[]);
      } else {
        // Seed default categories if none exist
        const defaults = [
          { name: 'رواتب', description: 'رواتب الموظفين', is_active: true },
          { name: 'إيجارات', description: 'إيجارات المحلات والمستودعات', is_active: true },
          { name: 'صيانة', description: 'مصاريف الصيانة والإصلاح', is_active: true },
          { name: 'نقل ومواصلات', description: 'مصاريف النقل والشحن', is_active: true },
          { name: 'مصاريف إدارية', description: 'مصاريف إدارية وقرطاسية', is_active: true },
        ];
        const { data: inserted, error: insertError } = await supabase
          .from('expense_categories')
          .insert(defaults)
          .select();

        if (!insertError && inserted) {
          setCategories(inserted as ExpenseCategory[]);
        } else {
          setCategories([
            { id: '1', name: 'رواتب', description: 'رواتب الموظفين', is_active: true, created_at: '', updated_at: '' },
            { id: '2', name: 'إيجارات', description: 'إيجارات المحلات والمستودعات', is_active: true, created_at: '', updated_at: '' },
            { id: '3', name: 'صيانة', description: 'مصاريف الصيانة والإصلاح', is_active: true, created_at: '', updated_at: '' },
            { id: '4', name: 'نقل ومواصلات', description: 'مصاريف النقل والشحن', is_active: true, created_at: '', updated_at: '' },
            { id: '5', name: 'مصاريف إدارية', description: 'مصاريف إدارية وقرطاسية', is_active: true, created_at: '', updated_at: '' },
          ]);
        }
      }
    } catch {
      setCategories([
        { id: '1', name: 'رواتب', description: 'رواتب الموظفين', is_active: true, created_at: '', updated_at: '' },
        { id: '2', name: 'إيجارات', description: 'إيجارات المحلات والمستودعات', is_active: true, created_at: '', updated_at: '' },
        { id: '3', name: 'صيانة', description: 'مصاريف الصيانة والإصلاح', is_active: true, created_at: '', updated_at: '' },
        { id: '4', name: 'نقل ومواصلات', description: 'مصاريف النقل والشحن', is_active: true, created_at: '', updated_at: '' },
        { id: '5', name: 'مصاريف إدارية', description: 'مصاريف إدارية وقرطاسية', is_active: true, created_at: '', updated_at: '' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error('يرجى إدخال اسم التصنيف');
      return;
    }
    if (categories.some(c => c.name === newName.trim())) {
      toast.error('هذا التصنيف موجود بالفعل');
      return;
    }

    setSaving(true);
    try {
      const newCategory = {
        name: newName.trim(),
        description: newDescription.trim() || null,
        is_active: true,
      };

      const { data, error } = await supabase
        .from('expense_categories')
        .insert(newCategory)
        .select()
        .single();

      if (error) throw error;

      setCategories(prev => [...prev, data as ExpenseCategory]);
      setNewName('');
      setNewDescription('');
      toast.success('تم إضافة تصنيف المصروفات بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء إضافة تصنيف المصروفات');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editId || !editName.trim()) {
      toast.error('يرجى إدخال اسم التصنيف');
      return;
    }
    if (categories.some(c => c.name === editName.trim() && c.id !== editId)) {
      toast.error('هذا التصنيف موجود بالفعل');
      return;
    }

    setSaving(true);
    try {
      const updates = {
        name: editName.trim(),
        description: editDescription.trim() || null,
        is_active: editIsActive,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('expense_categories')
        .update(updates)
        .eq('id', editId);

      if (error) throw error;

      setCategories(prev =>
        prev.map(c => (c.id === editId ? { ...c, ...updates } : c))
      );

      setEditId(null);
      setEditName('');
      setEditDescription('');
      setEditIsActive(true);
      toast.success('تم تعديل تصنيف المصروفات بنجاح');
    } catch {
      toast.error('حدث خطأ أثناء تعديل تصنيف المصروفات');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingCategory) return;

    try {
      const { error } = await supabase
        .from('expense_categories')
        .delete()
        .eq('id', deletingCategory.id);

      if (error) throw error;

      setCategories(prev => prev.filter(c => c.id !== deletingCategory.id));
      toast.success('تم حذف تصنيف المصروفات بنجاح');
      setDeleteDialogOpen(false);
      setDeletingCategory(null);
    } catch {
      toast.error('حدث خطأ أثناء حذف تصنيف المصروفات');
    }
  };

  const handleToggleActive = async (category: ExpenseCategory) => {
    if (!canEdit) return;
    const newIsActive = !category.is_active;

    try {
      const { error } = await supabase
        .from('expense_categories')
        .update({ is_active: newIsActive, updated_at: new Date().toISOString() })
        .eq('id', category.id);

      if (error) throw error;

      setCategories(prev =>
        prev.map(c => (c.id === category.id ? { ...c, is_active: newIsActive } : c))
      );

      toast.success(newIsActive ? 'تم تفعيل التصنيف' : 'تم تعطيل التصنيف');
    } catch {
      toast.error('حدث خطأ أثناء تحديث حالة التصنيف');
    }
  };

  const startEdit = (category: ExpenseCategory) => {
    setEditId(category.id);
    setEditName(category.name);
    setEditDescription(category.description || '');
    setEditIsActive(category.is_active);
  };

  const cancelEdit = () => {
    setEditId(null);
    setEditName('');
    setEditDescription('');
    setEditIsActive(true);
  };

  if (!canView) {
    return (
      <div className="space-y-6 max-w-2xl">
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <div className="w-24 h-24 rounded-full bg-destructive/10 flex items-center justify-center">
            <Tags className="w-12 h-12 text-destructive/60" />
          </div>
          <h2 className="text-xl font-bold">غير مسموح</h2>
          <p className="text-muted-foreground text-sm text-center max-w-xs">
            ليس لديك صلاحية لعرض تصنيفات المصروفات
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">تصنيفات المصروفات</h1>
        <p className="text-muted-foreground text-sm mt-1">
          إدارة تصنيفات المصروفات المتاحة - إضافة أو تعديل أو حذف أو تفعيل
        </p>
      </div>

      {/* Add new */}
      {canCreate && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Plus className="w-5 h-5 text-primary" />
                إضافة تصنيف جديد
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="اسم التصنيف (مثال: رواتب)"
                      onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    />
                  </div>
                  <Button onClick={handleAdd} disabled={saving} className="gap-2">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    إضافة
                  </Button>
                </div>
                <Input
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="وصف التصنيف (اختياري)"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* List */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Tags className="w-5 h-5 text-primary" />
              تصنيفات المصروفات الحالية
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
                <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                  <Tag className="w-8 h-8 text-muted-foreground/50" />
                </div>
                <p className="text-sm">لا توجد تصنيفات مصروفات مسجلة</p>
              </div>
            ) : (
              <div className="space-y-2">
                {categories.map((category) => (
                  <div key={category.id}>
                    {editId === category.id ? (
                      <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="اسم التصنيف"
                              autoFocus
                            />
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" onClick={handleEdit} disabled={saving} className="gap-1">
                              {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                              حفظ
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              إلغاء
                            </Button>
                          </div>
                        </div>
                        <Input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="وصف التصنيف (اختياري)"
                        />
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`active-${category.id}`}
                            checked={editIsActive}
                            onCheckedChange={(checked) => setEditIsActive(checked)}
                          />
                          <Label htmlFor={`active-${category.id}`} className="text-xs cursor-pointer">
                            تصنيف نشط
                          </Label>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/50 transition-colors group">
                        <GripVertical className="w-4 h-4 text-muted-foreground/50" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={cn("font-medium text-sm", !category.is_active && "text-muted-foreground line-through")}>
                              {category.name}
                            </span>
                            {category.is_active ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <Star className="w-3 h-3" />
                                نشط
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
                                <PowerOff className="w-3 h-3" />
                                معطل
                              </span>
                            )}
                          </div>
                          {category.description && (
                            <p className={cn("text-xs mt-0.5 truncate", !category.is_active ? "text-muted-foreground/60" : "text-muted-foreground")}>
                              {category.description}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => handleToggleActive(category)}
                              title={category.is_active ? 'تعطيل' : 'تفعيل'}
                            >
                              {category.is_active ? (
                                <PowerOff className="w-4 h-4 text-orange-500" />
                              ) : (
                                <Power className="w-4 h-4 text-emerald-500" />
                              )}
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => startEdit(category)}
                              title="تعديل"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => {
                                setDeletingCategory(category);
                                setDeleteDialogOpen(true);
                              }}
                              title="حذف"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                    <Separator className="mt-2 last:hidden" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف تصنيف المصروفات</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف تصنيف المصروفات &quot;{deletingCategory?.name}&quot;؟
              لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingCategory(null)}>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
