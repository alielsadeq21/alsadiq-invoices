'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Role, Permissions, PagePermissions } from '@/lib/types';
import { DEFAULT_ADMIN_PERMISSIONS } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
import {
  Shield,
  Plus,
  Edit,
  Trash2,
  Users,
  Lock,
  Loader2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

// Permissions matrix definition
interface PermissionPage {
  key: keyof Permissions;
  label: string;
  actions: (keyof PagePermissions)[];
}

const PERMISSION_PAGES: PermissionPage[] = [
  { key: 'dashboard', label: 'لوحة التحكم', actions: ['view'] },
  { key: 'pos', label: 'نقطة البيع', actions: ['view', 'create', 'print'] },
  { key: 'sales', label: 'المبيعات', actions: ['view', 'export'] },
  { key: 'branches', label: 'الفروع', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'products', label: 'المنتجات', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'customers', label: 'العملاء', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'invoices', label: 'الفواتير', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'returns', label: 'المرتجعات', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'payments', label: 'القبض', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'expenses', label: 'المصروفات', actions: ['view', 'create', 'edit', 'delete', 'print', 'export'] },
  { key: 'branch_accounts', label: 'كشف الحسابات', actions: ['view', 'export'] },
  { key: 'account_statement', label: 'كشف حساب مفصل', actions: ['view', 'print', 'export'] },
  { key: 'inventory', label: 'المخزون', actions: ['view', 'create', 'edit', 'adjust', 'transfer'] },
  { key: 'inventory_transfers', label: 'التصبين والتحويلات', actions: ['view', 'create', 'edit'] },
  { key: 'inventory_counts', label: 'جرد المخزون', actions: ['view', 'create', 'edit'] },
  { key: 'chart_of_accounts', label: 'شجرة الحسابات', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'accounting', label: 'القيود المحاسبية', actions: ['view', 'create', 'edit', 'export'] },
  { key: 'accounting_reports', label: 'التقارير المحاسبية', actions: ['view', 'export'] },
  { key: 'reports', label: 'التقارير', actions: ['view', 'export'] },
  { key: 'users', label: 'المستخدمين', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'roles', label: 'الأدوار', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'settings', label: 'الإعدادات', actions: ['view', 'edit'] },
  { key: 'activity_log', label: 'سجل النشاط', actions: ['view'] },
  { key: 'payment_methods', label: 'طرق الدفع', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'expense_categories', label: 'تصنيفات المصروفات', actions: ['view', 'create', 'edit', 'delete'] },
];

const ACTION_LABELS: Record<string, string> = {
  view: 'عرض',
  create: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  print: 'طباعة',
  export: 'تصدير',
  adjust: 'تسوية',
  transfer: 'تحويل',
};

interface RoleWithCount extends Role {
  user_count?: number;
}

export default function RolesPage() {
  const { user: currentUser, isAdmin } = useAppStore();

  const [roles, setRoles] = useState<RoleWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithCount | null>(null);
  const [form, setForm] = useState({
    display_name: '',
    description: '',
  });
  const [editPermissions, setEditPermissions] = useState<Permissions>({});

  // Delete dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RoleWithCount | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadRoles();
  }, [isAdmin]);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('is_system', { ascending: false });

      if (error) throw error;

      // Get user counts per role
      const rolesWithCounts: RoleWithCount[] = [];
      if (data) {
        for (const role of data) {
          const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role_id', role.id);

          rolesWithCounts.push({
            ...role,
            user_count: count || 0,
          });
        }
      }

      setRoles(rolesWithCounts);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  const logAction = async (action: string, details: Record<string, unknown>) => {
    try {
      await supabase.from('audit_log').insert({ action, details });
    } catch {
      // Silent fail for audit logging
    }
  };

  const openAddDialog = () => {
    setEditingRole(null);
    setForm({ display_name: '', description: '' });
    // Initialize permissions with all pages having empty actions
    const perms: Permissions = {};
    PERMISSION_PAGES.forEach((page) => {
      const pagePerms: PagePermissions = {};
      page.actions.forEach((action) => {
        pagePerms[action] = false;
      });
      perms[page.key] = pagePerms;
    });
    setEditPermissions(perms);
    setDialogOpen(true);
  };

  const openEditDialog = (role: RoleWithCount) => {
    setEditingRole(role);
    setForm({
      display_name: role.display_name,
      description: role.description || '',
    });
    // Initialize permissions from role data, merging with all defined pages
    const perms: Permissions = {};
    PERMISSION_PAGES.forEach((page) => {
      const existingPerms = role.permissions?.[page.key] as PagePermissions | undefined;
      const pagePerms: PagePermissions = {};
      page.actions.forEach((action) => {
        pagePerms[action] = existingPerms?.[action] || false;
      });
      perms[page.key] = pagePerms;
    });
    setEditPermissions(perms);
    setDialogOpen(true);
  };

  const togglePermission = (pageKey: keyof Permissions, action: keyof PagePermissions) => {
    setEditPermissions((prev) => {
      const pagePerms = { ...(prev[pageKey] as PagePermissions || {}) };
      pagePerms[action] = !pagePerms[action];

      // If turning on view, ensure it's set. If turning off view, turn off all others
      if (action === 'view' && !pagePerms[action]) {
        // Turning off view -> turn off all actions for this page
        Object.keys(pagePerms).forEach((key) => {
          pagePerms[key as keyof PagePermissions] = false;
        });
      } else if (action !== 'view' && pagePerms[action]) {
        // Turning on a non-view action -> ensure view is on
        pagePerms.view = true;
      }

      return { ...prev, [pageKey]: pagePerms };
    });
  };

  const toggleAllForPage = (pageKey: keyof Permissions, pageDef: PermissionPage, value: boolean) => {
    setEditPermissions((prev) => {
      const pagePerms: PagePermissions = {};
      pageDef.actions.forEach((action) => {
        pagePerms[action] = value;
      });
      return { ...prev, [pageKey]: pagePerms };
    });
  };

  const handleSave = async () => {
    if (!form.display_name.trim()) {
      toast.error('يرجى إدخال اسم الدور');
      return;
    }

    const isAdminRole = editingRole?.name === 'admin';

    setSaving(true);
    try {
      // For admin role, always use full permissions
      const finalPermissions = isAdminRole ? DEFAULT_ADMIN_PERMISSIONS : editPermissions;

      if (editingRole) {
        const { error } = await supabase
          .from('roles')
          .update({
            display_name: form.display_name.trim(),
            description: form.description.trim() || null,
            permissions: finalPermissions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRole.id);

        if (error) throw error;

        await logAction('update_role', {
          role_id: editingRole.id,
          role_name: form.display_name.trim(),
          updated_by: currentUser?.id,
        });

        toast.success('تم تحديث الدور بنجاح');
      } else {
        // Check for duplicate display name
        const { data: existing } = await supabase
          .from('roles')
          .select('id')
          .eq('display_name', form.display_name.trim())
          .maybeSingle();

        if (existing) {
          toast.error('اسم الدور موجود بالفعل');
          setSaving(false);
          return;
        }

        // Generate a name key from display_name
        const nameKey = form.display_name.trim()
          .replace(/\s+/g, '_')
          .replace(/[أإآا]/g, 'a')
          .replace(/ب/g, 'b')
          .replace(/ت/g, 't')
          .replace(/ث/g, 'th')
          .replace(/ج/g, 'j')
          .replace(/ح/g, 'h')
          .replace(/خ/g, 'kh')
          .replace(/د/g, 'd')
          .replace(/ذ/g, 'dh')
          .replace(/ر/g, 'r')
          .replace(/ز/g, 'z')
          .replace(/س/g, 's')
          .replace(/ش/g, 'sh')
          .replace(/ص/g, 's')
          .replace(/ض/g, 'd')
          .replace(/ط/g, 't')
          .replace(/ظ/g, 'z')
          .replace(/ع/g, 'a')
          .replace(/غ/g, 'gh')
          .replace(/ف/g, 'f')
          .replace(/ق/g, 'q')
          .replace(/ك/g, 'k')
          .replace(/ل/g, 'l')
          .replace(/م/g, 'm')
          .replace(/ن/g, 'n')
          .replace(/ه/g, 'h')
          .replace(/و/g, 'w')
          .replace(/ي/g, 'y')
          .replace(/ء/g, '')
          .replace(/ة/g, 'a')
          .replace(/ى/g, 'a')
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '') + '_' + Date.now();

        const { error } = await supabase.from('roles').insert({
          name: nameKey,
          display_name: form.display_name.trim(),
          description: form.description.trim() || null,
          permissions: finalPermissions,
          is_system: false,
        });

        if (error) throw error;

        await logAction('create_role', {
          role_name: form.display_name.trim(),
          created_by: currentUser?.id,
        });

        toast.success('تم إضافة الدور بنجاح');
      }

      setDialogOpen(false);
      loadRoles();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingRole) return;

    if (deletingRole.is_system) {
      toast.error('لا يمكن حذف أدوار النظام');
      setDeleteDialogOpen(false);
      return;
    }

    if ((deletingRole.user_count || 0) > 0) {
      toast.error(`لا يمكن حذف هذا الدور لأنه مرتبط بـ ${deletingRole.user_count} مستخدم`);
      setDeleteDialogOpen(false);
      return;
    }

    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', deletingRole.id);

      if (error) throw error;

      await logAction('delete_role', {
        role_id: deletingRole.id,
        role_name: deletingRole.display_name,
        deleted_by: currentUser?.id,
      });

      toast.success('تم حذف الدور بنجاح');
      setDeleteDialogOpen(false);
      setDeletingRole(null);
      loadRoles();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const getEnabledCount = (role: Role): number => {
    if (!role.permissions) return 0;
    let count = 0;
    Object.values(role.permissions).forEach((pagePerms) => {
      if (pagePerms) {
        Object.values(pagePerms).forEach((val) => {
          if (val) count++;
        });
      }
    });
    return count;
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h3 className="text-xl font-bold mb-2">غير مصرح بالوصول</h3>
        <p className="text-muted-foreground text-sm text-center">
          هذه الصفحة متاحة للمدير فقط
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">إدارة الأدوار والصلاحيات</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                إجمالي الأدوار: <span className="font-semibold text-foreground">{roles.length}</span>
              </p>
            </div>
          </div>
          <Button onClick={openAddDialog} className="gap-2 shadow-lg" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <Plus className="w-4 h-4" />
            إضافة دور
          </Button>
        </div>
      </motion.div>

      {/* Roles Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
                <p className="text-muted-foreground text-sm">جاري تحميل الأدوار...</p>
              </div>
            ) : roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #fca5a5, #ef4444)' }}>
                  <Shield className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا توجد أدوار</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إضافة أي أدوار بعد. أضف دوراً لبدء إدارة الصلاحيات.
                </p>
                <Button onClick={openAddDialog} className="gap-2 shadow-lg" size="lg" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                  <Plus className="w-5 h-5" />
                  إضافة دور جديد
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #ef4444, #dc2626, #b91c1c)' }} />
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right">الدور</TableHead>
                          <TableHead className="text-right hidden md:table-cell">الوصف</TableHead>
                          <TableHead className="text-center">النوع</TableHead>
                          <TableHead className="text-center">عدد المستخدمين</TableHead>
                          <TableHead className="text-center">الصلاحيات المفعلة</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roles.map((role) => {
                          const isAdminRole = role.name === 'admin';
                          return (
                            <TableRow key={role.id} className="hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm`} style={isAdminRole ? { background: 'linear-gradient(135deg, #D4A843, #b8922e)' } : { background: 'linear-gradient(135deg, #fca5a5, #ef4444)' }}>
                                    <Shield className="w-4 h-4 text-white" />
                                  </div>
                                  <span className="font-medium">{role.display_name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                                {role.description || '—'}
                              </TableCell>
                              <TableCell className="text-center">
                                {role.is_system ? (
                                  <Badge variant="secondary" className="text-[11px] bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/20">
                                    <Lock className="w-3 h-3 ml-1" />
                                    نظام
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-[11px] bg-muted text-muted-foreground">
                                    مخصص
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <Users className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-sm">{role.user_count || 0}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  <span className="text-sm">{getEnabledCount(role)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-red-50 dark:hover:bg-red-900/20"
                                    onClick={() => openEditDialog(role)}
                                    title="تعديل"
                                  >
                                    <Edit className="w-4 h-4 text-red-600" />
                                  </Button>
                                  {!role.is_system && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20"
                                      onClick={() => {
                                        setDeletingRole(role);
                                        setDeleteDialogOpen(true);
                                      }}
                                      title="حذف"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
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
                  {roles.map((role) => {
                    const isAdminRole = role.name === 'admin';
                    return (
                      <motion.div
                        key={role.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 border-r-4 hover:bg-muted/30 transition-all"
                        style={{ borderRightColor: isAdminRole ? '#D4A843' : '#ef4444' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={isAdminRole ? { background: 'linear-gradient(135deg, #D4A843, #b8922e)' } : { background: 'linear-gradient(135deg, #fca5a5, #ef4444)' }}>
                              <Shield className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="font-medium text-sm">{role.display_name}</p>
                              {role.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                              )}
                            </div>
                          </div>
                          {role.is_system ? (
                            <Badge variant="secondary" className="text-[10px] bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/20">
                              <Lock className="w-3 h-3 ml-0.5" />
                              نظام
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground">
                              مخصص
                            </Badge>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {role.user_count || 0} مستخدم
                          </span>
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            {getEnabledCount(role)} صلاحية
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-red-50 dark:hover:bg-red-900/20"
                            onClick={() => openEditDialog(role)}
                          >
                            <Edit className="w-3.5 h-3.5 text-red-600" />
                          </Button>
                          {!role.is_system && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => {
                                setDeletingRole(role);
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Add/Edit Role Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <Shield className="w-4 h-4 text-white" />
              </div>
              {editingRole ? 'تعديل الدور' : 'إضافة دور جديد'}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(90vh-180px)] pl-1">
            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role-name">اسم الدور *</Label>
                    <Input
                      id="role-name"
                      value={form.display_name}
                      onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                      placeholder="مثال: محاسب"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role-description">الوصف</Label>
                    <Input
                      id="role-description"
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      placeholder="وصف مختصر للدور"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Permissions Matrix */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                      <Lock className="w-3.5 h-3.5 text-white" />
                    </div>
                    مصفوفة الصلاحيات
                  </h3>
                  {editingRole?.name === 'admin' && (
                    <Badge className="bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/20">
                      <Lock className="w-3 h-3 ml-1" />
                      المدير لديه جميع الصلاحيات دائماً
                    </Badge>
                  )}
                </div>

                {editingRole?.name === 'admin' ? (
                  <div className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="font-medium">جميع الصلاحيات مفعلة</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      دور المدير يحصل تلقائياً على جميع الصلاحيات ولا يمكن تعديلها.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    {/* Table Header */}
                    <div className="bg-muted/50">
                      <div className="grid grid-cols-[minmax(120px,1fr)_repeat(8,minmax(50px,60px))] gap-0 text-xs font-medium p-3">
                        <div className="text-right">الصفحة</div>
                        {['view', 'create', 'edit', 'delete', 'print', 'export', 'adjust', 'transfer'].map((action) => {
                          // Check if any page uses this action
                          const isUsed = PERMISSION_PAGES.some((p) => p.actions.includes(action as keyof PagePermissions));
                          if (!isUsed) return <div key={action} />;
                          return (
                            <div key={action} className="text-center">
                              {ACTION_LABELS[action]}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Table Body */}
                    <div className="divide-y">
                      {PERMISSION_PAGES.map((page) => {
                        const pagePerms = editPermissions[page.key] as PagePermissions | undefined;
                        const allEnabled = page.actions.every((a) => pagePerms?.[a]);
                        const someEnabled = page.actions.some((a) => pagePerms?.[a]);

                        return (
                          <div key={page.key} className="grid grid-cols-[minmax(120px,1fr)_repeat(8,minmax(50px,60px))] gap-0 p-2 items-center hover:bg-red-50/50 dark:hover:bg-red-900/5 transition-colors">
                            <div className="flex items-center gap-2 pr-2">
                              <input
                                type="checkbox"
                                checked={allEnabled}
                                ref={(el) => {
                                  if (el) el.indeterminate = someEnabled && !allEnabled;
                                }}
                                onChange={(e) => toggleAllForPage(page.key, page, e.target.checked)}
                                className="rounded border-muted-foreground/30"
                              />
                              <span className="text-sm font-medium truncate">{page.label}</span>
                            </div>
                            {['view', 'create', 'edit', 'delete', 'print', 'export', 'adjust', 'transfer'].map((action) => {
                              if (!page.actions.includes(action as keyof PagePermissions)) {
                                return <div key={action} />;
                              }
                              const isChecked = pagePerms?.[action as keyof PagePermissions] || false;
                              return (
                                <div key={action} className="flex justify-center">
                                  <Switch
                                    checked={isChecked}
                                    onCheckedChange={() => togglePermission(page.key, action as keyof PagePermissions)}
                                    className="scale-75"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
              {editingRole ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
                <Trash2 className="w-4 h-4 text-white" />
              </div>
              حذف الدور
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(deletingRole?.user_count || 0) > 0
                ? `لا يمكن حذف دور "${deletingRole?.display_name}" لأنه مرتبط بـ ${deletingRole?.user_count} مستخدم. قم بتغيير أدوار المستخدمين أولاً.`
                : `هل أنت متأكد من حذف دور "${deletingRole?.display_name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingRole(null)}>إلغاء</AlertDialogCancel>
            {(deletingRole?.user_count || 0) === 0 && (
              <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                حذف
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
