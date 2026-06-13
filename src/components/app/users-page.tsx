'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { hashPassword } from '@/lib/auth';
import { formatDateTime } from '@/lib/utils';
import type { User, Role, Branch } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  Plus,
  Search,
  Edit,
  KeyRound,
  Shield,
  UserCheck,
  UserX,
  Filter,
  Loader2,
  Mail,
  Building2,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

interface UserRow {
  id: string;
  username: string;
  full_name: string;
  role_id: string | null;
  branch_id: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login: string | null;
  created_at: string;
  roles: { id: string; name: string; display_name: string } | null;
  branches: { id: string; name: string } | null;
}

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAppStore();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState({
    full_name: '',
    username: '',
    password: '',
    confirmPassword: '',
    role_id: '',
    branch_id: '',
    is_active: true,
    must_change_password: false,
  });

  // Toggle active confirmation
  const [toggleDialogOpen, setToggleDialogOpen] = useState(false);
  const [togglingUser, setTogglingUser] = useState<UserRow | null>(null);

  // Reset password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resettingUser, setResettingUser] = useState<UserRow | null>(null);
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' });

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [isAdmin]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [usersRes, rolesRes, branchesRes] = await Promise.all([
        supabase
          .from('users')
          .select('id, username, full_name, role_id, branch_id, is_active, must_change_password, last_login, created_at, roles(id, name, display_name), branches(id, name)')
          .order('created_at', { ascending: false }),
        supabase.from('roles').select('*').order('display_name'),
        supabase.from('branches').select('*').eq('is_active', true).order('name'),
      ]);

      if (usersRes.data) setUsers(usersRes.data as unknown as UserRow[]);
      if (rolesRes.data) setRoles(rolesRes.data as Role[]);
      if (branchesRes.data) setBranches(branchesRes.data as Branch[]);
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
    setEditingUser(null);
    setForm({
      full_name: '',
      username: '',
      password: '',
      confirmPassword: '',
      role_id: '',
      branch_id: '',
      is_active: true,
      must_change_password: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (user: UserRow) => {
    setEditingUser(user);
    const roleName = user.roles?.name;
    setForm({
      full_name: user.full_name,
      username: user.username,
      password: '',
      confirmPassword: '',
      role_id: user.role_id || '',
      branch_id: user.branch_id || '',
      is_active: user.is_active,
      must_change_password: user.must_change_password,
    });
    setDialogOpen(true);
  };

  const selectedRoleName = (): string | null => {
    if (!form.role_id) return null;
    const role = roles.find(r => r.id === form.role_id);
    return role?.name || null;
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error('يرجى إدخال الاسم الكامل');
      return;
    }
    if (!form.username.trim()) {
      toast.error('يرجى إدخال اسم المستخدم');
      return;
    }
    if (!editingUser) {
      if (!form.password) {
        toast.error('يرجى إدخال كلمة المرور');
        return;
      }
      if (form.password.length < 8) {
        toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
        return;
      }
      if (form.password !== form.confirmPassword) {
        toast.error('كلمة المرور وتأكيدها غير متطابقتين');
        return;
      }
    }

    setSaving(true);
    try {
      if (editingUser) {
        // Update user
        const updates: Record<string, unknown> = {
          full_name: form.full_name.trim(),
          role_id: form.role_id || null,
          branch_id: selectedRoleName() === 'admin' ? null : (form.branch_id || null),
          is_active: form.is_active,
          must_change_password: form.must_change_password,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('users')
          .update(updates)
          .eq('id', editingUser.id);

        if (error) throw error;

        await logAction('update_user', {
          user_id: editingUser.id,
          user_name: form.full_name.trim(),
          updated_by: currentUser?.id,
        });

        toast.success('تم تحديث المستخدم بنجاح');
      } else {
        // Check username uniqueness
        const { data: existing } = await supabase
          .from('users')
          .select('id')
          .eq('username', form.username.trim())
          .maybeSingle();

        if (existing) {
          toast.error('اسم المستخدم موجود بالفعل');
          setSaving(false);
          return;
        }

        const hashedPassword = await hashPassword(form.password);

        const { error } = await supabase.from('users').insert({
          full_name: form.full_name.trim(),
          username: form.username.trim(),
          password_hash: hashedPassword,
          role_id: form.role_id || null,
          branch_id: selectedRoleName() === 'admin' ? null : (form.branch_id || null),
          is_active: form.is_active,
          must_change_password: form.must_change_password,
          created_by: currentUser?.id,
        });

        if (error) throw error;

        await logAction('create_user', {
          user_name: form.full_name.trim(),
          username: form.username.trim(),
          created_by: currentUser?.id,
        });

        toast.success('تم إضافة المستخدم بنجاح');
      }

      setDialogOpen(false);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!togglingUser) return;

    // Prevent deactivating current admin
    if (togglingUser.id === currentUser?.id && togglingUser.is_active) {
      toast.error('لا يمكنك تعطيل حسابك الخاص');
      setToggleDialogOpen(false);
      setTogglingUser(null);
      return;
    }

    try {
      const newStatus = !togglingUser.is_active;
      const { error } = await supabase
        .from('users')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', togglingUser.id);

      if (error) throw error;

      await logAction(newStatus ? 'activate_user' : 'deactivate_user', {
        user_id: togglingUser.id,
        user_name: togglingUser.full_name,
        action_by: currentUser?.id,
      });

      toast.success(newStatus ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم');
      setToggleDialogOpen(false);
      setTogglingUser(null);
      loadData();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء تغيير الحالة');
    }
  };

  const openResetPasswordDialog = (user: UserRow) => {
    setResettingUser(user);
    setResetForm({ password: '', confirmPassword: '' });
    setResetDialogOpen(true);
  };

  const handleResetPassword = async () => {
    if (!resettingUser) return;
    if (!resetForm.password) {
      toast.error('يرجى إدخال كلمة المرور الجديدة');
      return;
    }
    if (resetForm.password.length < 8) {
      toast.error('كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      return;
    }
    if (resetForm.password !== resetForm.confirmPassword) {
      toast.error('كلمة المرور وتأكيدها غير متطابقتين');
      return;
    }

    setSaving(true);
    try {
      const hashedPassword = await hashPassword(resetForm.password);
      const { error } = await supabase
        .from('users')
        .update({
          password_hash: hashedPassword,
          must_change_password: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', resettingUser.id);

      if (error) throw error;

      await logAction('reset_password', {
        user_id: resettingUser.id,
        user_name: resettingUser.full_name,
        reset_by: currentUser?.id,
      });

      toast.success('تم إعادة تعيين كلمة المرور بنجاح');
      setResetDialogOpen(false);
      setResettingUser(null);
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء إعادة تعيين كلمة المرور');
    } finally {
      setSaving(false);
    }
  };

  // Filtering
  const filteredUsers = users.filter((u) => {
    const matchSearch =
      u.full_name.includes(search) ||
      u.username.includes(search);
    const matchRole = roleFilter === 'all' || u.role_id === roleFilter;
    const matchStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'inactive' && !u.is_active);
    return matchSearch && matchRole && matchStatus;
  });

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
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">إدارة المستخدمين</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                إجمالي المستخدمين: <span className="font-semibold text-foreground">{users.length}</span> | نشط: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{users.filter(u => u.is_active).length}</span>
              </p>
            </div>
          </div>
          <Button onClick={openAddDialog} className="gap-2 shadow-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
            <Plus className="w-4 h-4" />
            إضافة مستخدم
          </Button>
        </div>
      </motion.div>

      {/* Search & Filters */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3b82f6, #2563eb, #1d4ed8)' }} />
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="بحث بالاسم أو اسم المستخدم..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-full sm:w-[160px]">
                    <Filter className="w-4 h-4 ml-1" />
                    <SelectValue placeholder="الدور" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الأدوار</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={role.id}>
                        {role.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[130px]">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الحالات</SelectItem>
                    <SelectItem value="active">نشط</SelectItem>
                    <SelectItem value="inactive">معطل</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Users Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <Card className="border-0 shadow-md overflow-hidden">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="w-12 h-12 rounded-full flex items-center justify-center mb-4" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                </div>
                <p className="text-muted-foreground text-sm">جاري تحميل المستخدمين...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4">
                <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, #93c5fd, #3b82f6)' }}>
                  <Users className="w-10 h-10 text-white" />
                </div>
                <h3 className="text-xl font-bold mb-2">لا يوجد مستخدمون</h3>
                <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs">
                  لم يتم إضافة أي مستخدمين بعد. أضف مستخدماً لبدء إدارة الصلاحيات.
                </p>
                <Button onClick={openAddDialog} className="gap-2 shadow-lg" size="lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                  <Plus className="w-5 h-5" />
                  إضافة مستخدم جديد
                </Button>
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden sm:block">
                  <div className="h-[3px]" style={{ background: 'linear-gradient(90deg, #3b82f6, #2563eb, #1d4ed8)' }} />
                  <ScrollArea className="max-h-[calc(100vh-320px)]">
                    <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right">الاسم الكامل</TableHead>
                          <TableHead className="text-right">اسم المستخدم</TableHead>
                          <TableHead className="text-right hidden md:table-cell">الدور</TableHead>
                          <TableHead className="text-right hidden lg:table-cell">الفرع</TableHead>
                          <TableHead className="text-center">الحالة</TableHead>
                          <TableHead className="text-center hidden lg:table-cell">آخر دخول</TableHead>
                          <TableHead className="text-center">الإجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map((u) => {
                          const isCurrentUser = u.id === currentUser?.id;
                          const isAdminUser = u.roles?.name === 'admin';
                          return (
                            <TableRow key={u.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shadow-sm ${u.is_active ? '' : 'bg-muted'}`} style={u.is_active ? { background: 'linear-gradient(135deg, #93c5fd, #3b82f6)' } : {}}>
                                    <span className={`text-sm font-bold ${u.is_active ? 'text-white' : 'text-muted-foreground'}`}>
                                      {u.full_name.charAt(0)}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="font-medium text-sm">{u.full_name}</span>
                                    {isCurrentUser && (
                                      <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>(أنت)</span>
                                    )}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {u.username}
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                {u.roles?.display_name ? (
                                  <Badge variant="secondary" className="text-[11px] text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                                    {u.roles.display_name}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                              </TableCell>
                              <TableCell className="hidden lg:table-cell text-muted-foreground text-sm">
                                <div className="flex items-center gap-1">
                                  <Building2 className="w-3.5 h-3.5" />
                                  {isAdminUser ? 'الكل' : (u.branches?.name || '—')}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge
                                  variant="secondary"
                                  className={
                                    u.is_active
                                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  }
                                >
                                  {u.is_active ? 'نشط' : 'معطل'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center hidden lg:table-cell text-muted-foreground text-xs whitespace-nowrap">
                                {u.last_login ? formatDateTime(u.last_login) : '—'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                    onClick={() => openEditDialog(u)}
                                    title="تعديل"
                                  >
                                    <Edit className="w-4 h-4 text-blue-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                                    onClick={() => openResetPasswordDialog(u)}
                                    title="إعادة تعيين كلمة المرور"
                                  >
                                    <KeyRound className="w-4 h-4 text-amber-600" />
                                  </Button>
                                  {!(isCurrentUser && u.is_active) && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className={`h-8 w-8 ${u.is_active ? 'text-destructive hover:text-destructive hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                                      onClick={() => {
                                        setTogglingUser(u);
                                        setToggleDialogOpen(true);
                                      }}
                                      title={u.is_active ? 'تعطيل' : 'تفعيل'}
                                    >
                                      {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
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
                  </ScrollArea>
                </div>

                {/* Mobile Card Layout */}
                <div className="sm:hidden divide-y">
                  {filteredUsers.map((u) => {
                    const isCurrentUser = u.id === currentUser?.id;
                    const isAdminUser = u.roles?.name === 'admin';
                    return (
                      <motion.div
                        key={u.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-3 border-r-4 hover:bg-muted/30 transition-all"
                        style={{ borderRightColor: u.is_active ? '#3b82f6' : '#94a3b8' }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${u.is_active ? '' : 'bg-muted'}`} style={u.is_active ? { background: 'linear-gradient(135deg, #93c5fd, #3b82f6)' } : {}}>
                              <span className={`text-sm font-bold ${u.is_active ? 'text-white' : 'text-muted-foreground'}`}>
                                {u.full_name.charAt(0)}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium text-sm">
                                {u.full_name}
                                {isCurrentUser && (
                                  <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>(أنت)</span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{u.username}</p>
                            </div>
                          </div>
                          <Badge
                            variant="secondary"
                            className={
                              u.is_active
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]'
                                : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 text-[10px]'
                            }
                          >
                            {u.is_active ? 'نشط' : 'معطل'}
                          </Badge>
                        </div>
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          {u.roles?.display_name && (
                            <Badge variant="secondary" className="text-[10px] text-white" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                              {u.roles.display_name}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {isAdminUser ? 'الكل' : (u.branches?.name || '—')}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">
                            آخر دخول: {u.last_login ? formatDateTime(u.last_login) : '—'}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                              onClick={() => openEditDialog(u)}
                            >
                              <Edit className="w-3.5 h-3.5 text-blue-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              onClick={() => openResetPasswordDialog(u)}
                            >
                              <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                            </Button>
                            {!(isCurrentUser && u.is_active) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-7 w-7 ${u.is_active ? 'text-destructive hover:bg-red-50 dark:hover:bg-red-900/20' : 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'}`}
                                onClick={() => {
                                  setTogglingUser(u);
                                  setToggleDialogOpen(true);
                                }}
                              >
                                {u.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                          </div>
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

      {/* Add/Edit User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                  <Users className="w-4 h-4 text-white" />
                </div>
                {editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" style={{ minHeight: 0 }}>
            <div className="space-y-2">
              <Label htmlFor="user-fullname">الاسم الكامل *</Label>
              <Input
                id="user-fullname"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="مثال: أحمد محمد"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-username">اسم المستخدم *</Label>
              <Input
                id="user-username"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="مثال: ahmed"
                disabled={!!editingUser}
              />
            </div>
            {!editingUser && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="user-password">كلمة المرور *</Label>
                  <Input
                    id="user-password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="أدخل كلمة المرور"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="user-confirm-password">تأكيد كلمة المرور *</Label>
                  <Input
                    id="user-confirm-password"
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                    placeholder="أعد إدخال كلمة المرور"
                  />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="user-role">الدور</Label>
              <Select
                value={form.role_id}
                onValueChange={(value) => {
                  setForm({ ...form, role_id: value === '_none' ? '' : value });
                }}
              >
                <SelectTrigger id="user-role">
                  <SelectValue placeholder="اختر الدور" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">بدون دور</SelectItem>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedRoleName() !== 'admin' && (
              <div className="space-y-2">
                <Label htmlFor="user-branch">الفرع</Label>
                <Select
                  value={form.branch_id}
                  onValueChange={(value) => {
                    setForm({ ...form, branch_id: value === '_none' ? '' : value });
                  }}
                >
                  <SelectTrigger id="user-branch">
                    <SelectValue placeholder="اختر الفرع" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">بدون فرع</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch
                id="user-active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label htmlFor="user-active">مستخدم نشط</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="user-must-change"
                checked={form.must_change_password}
                onCheckedChange={(checked) => setForm({ ...form, must_change_password: !!checked })}
              />
              <Label htmlFor="user-must-change" className="text-sm cursor-pointer">
                تغيير كلمة المرور عند أول تسجيل دخول
              </Label>
            </div>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 shrink-0 border-t bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
                {editingUser ? 'تحديث' : 'إضافة'}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* Toggle Active Confirmation */}
      <AlertDialog open={toggleDialogOpen} onOpenChange={setToggleDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${togglingUser?.is_active ? '' : ''}`} style={{ background: togglingUser?.is_active ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #10b981, #059669)' }}>
                {togglingUser?.is_active ? <UserX className="w-4 h-4 text-white" /> : <UserCheck className="w-4 h-4 text-white" />}
              </div>
              {togglingUser?.is_active ? 'تعطيل المستخدم' : 'تفعيل المستخدم'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {togglingUser?.is_active
                ? `هل أنت متأكد من تعطيل المستخدم "${togglingUser?.full_name}"؟ لن يتمكن من تسجيل الدخول.`
                : `هل أنت متأكد من تفعيل المستخدم "${togglingUser?.full_name}"؟`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setTogglingUser(null)}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              className={togglingUser?.is_active ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {togglingUser?.is_active ? 'تعطيل' : 'تفعيل'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Password Dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90dvh] p-0 gap-0" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-3 shrink-0 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                  <KeyRound className="w-4 h-4 text-white" />
                </div>
                إعادة تعيين كلمة المرور - {resettingUser?.full_name}
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4" style={{ minHeight: 0 }}>
            <div className="space-y-2">
              <Label htmlFor="reset-password">كلمة المرور الجديدة *</Label>
              <Input
                id="reset-password"
                type="password"
                value={resetForm.password}
                onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                placeholder="أدخل كلمة المرور الجديدة"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reset-confirm-password">تأكيد كلمة المرور *</Label>
              <Input
                id="reset-confirm-password"
                type="password"
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                placeholder="أعد إدخال كلمة المرور"
              />
            </div>
          </div>
          <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-3 shrink-0 border-t bg-background">
            <DialogFooter>
              <Button variant="outline" onClick={() => setResetDialogOpen(false)}>
                إلغاء
              </Button>
              <Button onClick={handleResetPassword} disabled={saving} style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                {saving && <Loader2 className="w-4 h-4 animate-spin ml-1" />}
                إعادة تعيين
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
