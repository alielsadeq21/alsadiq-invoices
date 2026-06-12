'use client';

import { useEffect, useState, useCallback } from 'react';
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
  ChevronDown,
  ChevronUp,
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

// All possible action keys for the grid header
const ALL_ACTIONS: (keyof PagePermissions)[] = ['view', 'create', 'edit', 'delete', 'print', 'export', 'adjust', 'transfer'];

interface RoleWithCount extends Role {
  user_count?: number;
}

// Clean permissions object - remove undefined values and ensure proper structure for Supabase JSONB
function cleanPermissionsForSave(perms: Permissions): Record<string, Record<string, boolean>> {
  const cleaned: Record<string, Record<string, boolean>> = {};
  for (const [pageKey, pagePerms] of Object.entries(perms)) {
    if (!pagePerms || typeof pagePerms !== 'object') continue;
    const cleanPage: Record<string, boolean> = {};
    for (const [actionKey, value] of Object.entries(pagePerms)) {
      if (typeof value === 'boolean') {
        cleanPage[actionKey] = value;
      }
    }
    // Only include pages that have at least one permission set
    if (Object.keys(cleanPage).length > 0) {
      cleaned[pageKey] = cleanPage;
    }
  }
  return cleaned;
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

  // Mobile: track expanded permission sections
  const [expandedMobilePages, setExpandedMobilePages] = useState<Set<string>>(new Set());

  const toggleMobilePage = (pageKey: string) => {
    setExpandedMobilePages((prev) => {
      const next = new Set(prev);
      if (next.has(pageKey)) {
        next.delete(pageKey);
      } else {
        next.add(pageKey);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadRoles();
  }, [isAdmin]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('roles')
        .select('*')
        .order('is_system', { ascending: false });

      if (error) {
        console.error('Load roles error:', error);
        throw error;
      }

      // Get user counts per role
      const rolesWithCounts: RoleWithCount[] = [];
      if (data) {
        for (const role of data) {
          try {
            const { count } = await supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .eq('role_id', role.id);

            rolesWithCounts.push({
              ...role,
              user_count: count || 0,
            });
          } catch {
            rolesWithCounts.push({
              ...role,
              user_count: 0,
            });
          }
        }
      }

      setRoles(rolesWithCounts);
    } catch (err) {
      console.error('Failed to load roles:', err);
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

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
    // Initialize permissions with all pages having all actions set to false
    const perms: Permissions = {};
    PERMISSION_PAGES.forEach((page) => {
      const pagePerms: PagePermissions = {};
      page.actions.forEach((action) => {
        pagePerms[action] = false;
      });
      perms[page.key] = pagePerms;
    });
    setEditPermissions(perms);
    setExpandedMobilePages(new Set());
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
        pagePerms[action] = existingPerms?.[action] === true;
      });
      perms[page.key] = pagePerms;
    });
    setEditPermissions(perms);
    setExpandedMobilePages(new Set());
    setDialogOpen(true);
  };

  const togglePermission = (pageKey: keyof Permissions, action: keyof PagePermissions) => {
    setEditPermissions((prev) => {
      const currentPerms = prev[pageKey] as PagePermissions | undefined;
      const pagePerms = { ...(currentPerms || {}) };
      const newVal = !pagePerms[action];
      pagePerms[action] = newVal;

      // If turning off view, turn off all others
      if (action === 'view' && !newVal) {
        Object.keys(pagePerms).forEach((key) => {
          pagePerms[key as keyof PagePermissions] = false;
        });
      } else if (action !== 'view' && newVal) {
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
      const rawPermissions = isAdminRole ? DEFAULT_ADMIN_PERMISSIONS : editPermissions;
      // Clean permissions to remove undefined/null values that cause Supabase JSONB issues
      const finalPermissions = cleanPermissionsForSave(rawPermissions);

      if (editingRole) {
        // UPDATE existing role
        const updateData: Record<string, unknown> = {
          display_name: form.display_name.trim(),
          description: form.description.trim() || null,
          permissions: finalPermissions,
        };

        // Also update updated_at if the column exists
        updateData.updated_at = new Date().toISOString();

        console.log('Updating role:', editingRole.id, 'with data:', JSON.stringify(updateData, null, 2));

        const { data: updateResult, error } = await supabase
          .from('roles')
          .update(updateData)
          .eq('id', editingRole.id)
          .select();

        if (error) {
          console.error('Role update Supabase error:', JSON.stringify(error, null, 2));
          throw error;
        }

        console.log('Role updated successfully:', updateResult);

        await logAction('update_role', {
          role_id: editingRole.id,
          role_name: form.display_name.trim(),
          updated_by: currentUser?.id,
        });

        toast.success('تم تحديث الدور بنجاح');
      } else {
        // ADD new role

        // Check for duplicate display name
        const { data: existing, error: dupCheckError } = await supabase
          .from('roles')
          .select('id')
          .eq('display_name', form.display_name.trim())
          .maybeSingle();

        if (dupCheckError) {
          console.error('Duplicate check error:', dupCheckError);
        }

        if (existing) {
          toast.error('اسم الدور موجود بالفعل');
          setSaving(false);
          return;
        }

        // Generate a unique name key - use timestamp + random to avoid collisions
        // The 'name' column must be unique, so we generate a URL-safe identifier
        const nameKey = 'custom_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

        const insertData = {
          name: nameKey,
          display_name: form.display_name.trim(),
          description: form.description.trim() || null,
          permissions: finalPermissions,
          is_system: false,
        };

        console.log('Inserting new role:', JSON.stringify(insertData, null, 2));

        const { data: insertResult, error } = await supabase
          .from('roles')
          .insert(insertData)
          .select();

        if (error) {
          console.error('Role insert Supabase error:', JSON.stringify(error, null, 2));
          throw error;
        }

        console.log('Role inserted successfully:', insertResult);

        await logAction('create_role', {
          role_name: form.display_name.trim(),
          created_by: currentUser?.id,
        });

        toast.success('تم إضافة الدور بنجاح');
      }

      setDialogOpen(false);
      loadRoles();
    } catch (err: unknown) {
      console.error('Role save full error:', err);
      let message = 'حدث خطأ أثناء الحفظ';

      if (err && typeof err === 'object') {
        const supabaseErr = err as { message?: string; code?: string; details?: string };
        if (supabaseErr.message) {
          message = supabaseErr.message;
        }
        if (supabaseErr.code === '23505') {
          message = 'اسم الدور أو المعرف موجود بالفعل';
        }
        if (supabaseErr.message?.includes('row-level security') || supabaseErr.message?.includes('RLS') || supabaseErr.message?.includes('policy')) {
          message = 'ليس لديك صلاحية تعديل الأدوار. تأكد من صلاحيات المدير.';
        }
      } else if (err instanceof Error) {
        message = err.message;
      }

      toast.error(message);
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
      console.error('Delete role error:', err);
      toast.error('حدث خطأ أثناء الحذف');
    }
  };

  const getEnabledCount = (role: Role): number => {
    if (!role.permissions) return 0;
    let count = 0;
    Object.values(role.permissions).forEach((pagePerms) => {
      if (pagePerms && typeof pagePerms === 'object') {
        Object.values(pagePerms).forEach((val) => {
          if (val === true) count++;
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg sm:text-2xl font-bold">إدارة الأدوار والصلاحيات</h1>
              <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
                إجمالي الأدوار: <span className="font-semibold text-foreground">{roles.length}</span>
              </p>
            </div>
          </div>
          <Button onClick={openAddDialog} className="gap-2 shadow-lg w-full sm:w-auto" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
            <Plus className="w-4 h-4" />
            إضافة دور
          </Button>
        </div>
      </motion.div>

      {/* Roles List */}
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
                <div className="sm:hidden">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #ef4444, #dc2626, #b91c1c)' }} />
                  <div className="divide-y">
                    {roles.map((role) => {
                      const isAdminRole = role.name === 'admin';
                      return (
                        <motion.div
                          key={role.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="p-4 border-r-4 hover:bg-muted/30 transition-all"
                          style={{ borderRightColor: isAdminRole ? '#D4A843' : '#ef4444' }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-11 h-11 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={isAdminRole ? { background: 'linear-gradient(135deg, #D4A843, #b8922e)' } : { background: 'linear-gradient(135deg, #fca5a5, #ef4444)' }}>
                                <Shield className="w-5 h-5 text-white" />
                              </div>
                              <div>
                                <p className="font-semibold text-sm">{role.display_name}</p>
                                {role.description && (
                                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{role.description}</p>
                                )}
                              </div>
                            </div>
                            {role.is_system ? (
                              <Badge variant="secondary" className="text-[10px] bg-[#D4A843]/10 text-[#D4A843] border border-[#D4A843]/20 shrink-0">
                                <Lock className="w-3 h-3 ml-0.5" />
                                نظام
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] bg-muted text-muted-foreground shrink-0">
                                مخصص
                              </Badge>
                            )}
                          </div>
                          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Users className="w-3.5 h-3.5" />
                              {role.user_count || 0} مستخدم
                            </span>
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              {getEnabledCount(role)} صلاحية
                            </span>
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 gap-1.5 text-xs"
                              onClick={() => openEditDialog(role)}
                            >
                              <Edit className="w-3.5 h-3.5" />
                              تعديل
                            </Button>
                            {!role.is_system && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 gap-1.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={() => {
                                  setDeletingRole(role);
                                  setDeleteDialogOpen(true);
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                حذف
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
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
            <div className="space-y-6 py-4 px-1">
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      <span className="font-medium">جميع الصلاحيات مفعلة</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      دور المدير يحصل تلقائياً على جميع الصلاحيات ولا يمكن تعديلها.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Desktop: Table Grid Layout */}
                    <div className="hidden sm:block rounded-xl border overflow-hidden">
                      {/* Table Header */}
                      <div className="bg-muted/50">
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) repeat(8, minmax(50px, 60px))', gap: 0 }} className="text-xs font-medium p-3">
                          <div className="text-right">الصفحة</div>
                          {ALL_ACTIONS.map((action) => {
                            const isUsed = PERMISSION_PAGES.some((p) => p.actions.includes(action));
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
                          const allEnabled = page.actions.every((a) => pagePerms?.[a] === true);
                          const someEnabled = page.actions.some((a) => pagePerms?.[a] === true);

                          return (
                            <div key={page.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) repeat(8, minmax(50px, 60px))', gap: 0 }} className="p-2 items-center hover:bg-red-50/50 dark:hover:bg-red-900/5 transition-colors">
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingRight: '0.5rem' }}>
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
                              {ALL_ACTIONS.map((action) => {
                                if (!page.actions.includes(action)) {
                                  return <div key={action} />;
                                }
                                const isChecked = pagePerms?.[action] === true;
                                return (
                                  <div key={action} style={{ display: 'flex', justifyContent: 'center' }}>
                                    <Switch
                                      checked={isChecked}
                                      onCheckedChange={() => togglePermission(page.key, action)}
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

                    {/* Mobile: Card Layout for Permissions */}
                    <div className="sm:hidden space-y-2">
                      {PERMISSION_PAGES.map((page) => {
                        const pagePerms = editPermissions[page.key] as PagePermissions | undefined;
                        const allEnabled = page.actions.every((a) => pagePerms?.[a] === true);
                        const someEnabled = page.actions.some((a) => pagePerms?.[a] === true);
                        const enabledCount = page.actions.filter((a) => pagePerms?.[a] === true).length;
                        const isExpanded = expandedMobilePages.has(page.key);

                        return (
                          <div key={page.key} className="rounded-lg border bg-card overflow-hidden">
                            <button
                              type="button"
                              className="w-full p-3 text-right"
                              onClick={() => toggleMobilePage(page.key)}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <input
                                  type="checkbox"
                                  checked={allEnabled}
                                  ref={(el) => {
                                    if (el) el.indeterminate = someEnabled && !allEnabled;
                                  }}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleAllForPage(page.key, page, e.target.checked);
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="rounded border-muted-foreground/30 w-4 h-4"
                                />
                                <span className="text-sm font-semibold">{page.label}</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="text-[10px] text-muted-foreground">
                                  {enabledCount}/{page.actions.length}
                                </span>
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            </button>
                            {isExpanded && (
                              <div className="px-3 pb-3 border-t" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.5rem' }}>
                                {page.actions.map((action) => {
                                  const isChecked = pagePerms?.[action] === true;
                                  return (
                                    <div
                                      key={action}
                                      style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                                      className="cursor-pointer select-none"
                                      onClick={() => togglePermission(page.key, action)}
                                    >
                                      <Switch
                                        checked={isChecked}
                                        onCheckedChange={() => togglePermission(page.key, action)}
                                        className="scale-[0.7]"
                                      />
                                      <span className={`text-[12px] ${isChecked ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                                        {ACTION_LABELS[action]}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="flex-row gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="flex-1 sm:flex-none">
              إلغاء
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 sm:flex-none gap-1" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
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
