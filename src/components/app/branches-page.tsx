'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import type { Branch } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
  Building2, Plus, Search, Edit, Trash2, Phone, MapPin, CheckCircle2, XCircle,
  Mail, FileText, Hash, Image, User, MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';

export default function BranchesPage() {
  const { isAdmin } = useAppStore();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null);

  const [form, setForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    tax_number: '',
    commercial_register: '',
    logo_url: '',
    manager_name: '',
    invoice_footer: '',
    is_active: true,
  });

  useEffect(() => {
    loadBranches();
  }, []);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        setBranches(data as Branch[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setEditingBranch(null);
    setForm({
      name: '',
      address: '',
      phone: '',
      email: '',
      tax_number: '',
      commercial_register: '',
      logo_url: '',
      manager_name: '',
      invoice_footer: '',
      is_active: true,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (branch: Branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      tax_number: branch.tax_number || '',
      commercial_register: branch.commercial_register || '',
      logo_url: branch.logo_url || '',
      manager_name: branch.manager_name || '',
      invoice_footer: branch.invoice_footer || '',
      is_active: branch.is_active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('يرجى إدخال اسم الفرع');
      return;
    }

    try {
      const branchData = {
        name: form.name,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        tax_number: form.tax_number || null,
        commercial_register: form.commercial_register || null,
        logo_url: form.logo_url || null,
        manager_name: form.manager_name || null,
        invoice_footer: form.invoice_footer || null,
        is_active: form.is_active,
        updated_at: new Date().toISOString(),
      };

      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update(branchData)
          .eq('id', editingBranch.id);

        if (error) throw error;
        toast.success('تم تحديث الفرع بنجاح');
      } else {
        const { error } = await supabase.from('branches').insert(branchData);

        if (error) throw error;
        await supabase.from('audit_log').insert({
          action: 'create_branch',
          details: { branch_name: form.name },
        });
        toast.success('تم إضافة الفرع بنجاح');
      }

      setDialogOpen(false);
      loadBranches();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحفظ');
    }
  };

  const handleDelete = async () => {
    if (!deletingBranch) return;
    try {
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', deletingBranch.id);

      if (error) throw error;
      toast.success('تم حذف الفرع بنجاح');
      setDeleteDialogOpen(false);
      setDeletingBranch(null);
      loadBranches();
    } catch (err) {
      console.error(err);
      toast.error('حدث خطأ أثناء الحذف. قد يكون الفرع مرتبطاً بفواتير');
    }
  };

  const toggleBranchStatus = async (branch: Branch) => {
    try {
      const { error } = await supabase
        .from('branches')
        .update({
          is_active: !branch.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', branch.id);

      if (error) throw error;
      toast.success(branch.is_active ? 'تم تعطيل الفرع' : 'تم تفعيل الفرع');
      loadBranches();
    } catch (err) {
      toast.error('حدث خطأ');
    }
  };

  const filteredBranches = branches.filter(
    (b) =>
      b.name.includes(search) ||
      (b.address && b.address.includes(search)) ||
      (b.phone && b.phone.includes(search))
  );

  const activeCount = branches.filter((b) => b.is_active).length;
  const inactiveCount = branches.length - activeCount;

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))' }}>
          <Building2 className="w-12 h-12 text-red-500/70" />
        </div>
        <h2 className="text-xl font-bold">غير مسموح</h2>
        <p className="text-muted-foreground text-sm text-center max-w-xs">
          فقط المدير يمكنه إدارة الفروع
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">إدارة الفروع</h1>
            <div className="flex items-center gap-3 mt-1">
              <div className="flex items-center gap-1 text-xs">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-muted-foreground">نشطة: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{activeCount}</span></span>
              </div>
              <div className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1 text-xs">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-muted-foreground">معطلة: <span className="font-semibold text-red-600 dark:text-red-400">{inactiveCount}</span></span>
              </div>
              <div className="w-px h-3 bg-border" />
              <div className="flex items-center gap-1 text-xs">
                <Building2 className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">الإجمالي: <span className="font-semibold">{branches.length}</span></span>
              </div>
            </div>
          </div>
        </div>
        <Button
          onClick={openAddDialog}
          className="gap-2 shadow-lg w-full sm:w-auto text-white font-medium"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          <Plus className="w-4 h-4" />
          إضافة فرع
        </Button>
      </div>

      {/* Search */}
      <Card className="border-0 shadow-md overflow-hidden">
        <div className="h-1" style={{ background: 'linear-gradient(90deg, #10b981, #059669, #10b981)' }} />
        <CardContent className="p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="بحث في الفروع..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Branches List */}
      {loading ? (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="flex items-center justify-center py-12">
              <div className="animate-pulse text-muted-foreground">جاري التحميل...</div>
            </div>
          </CardContent>
        </Card>
      ) : filteredBranches.length === 0 ? (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="flex flex-col items-center justify-center py-20 px-4">
              <div className="w-24 h-24 rounded-full flex items-center justify-center mb-5 shadow-lg" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.08))' }}>
                <Building2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="text-xl font-bold mb-2 tracking-tight">لا توجد فروع</h3>
              <p className="text-muted-foreground text-sm mb-6 text-center max-w-xs leading-relaxed">
                لم يتم إضافة أي فروع بعد. أضف فرعاً لبدء إدارة الفواتير وتتبع الصرف لكل فرع.
              </p>
              <Button
                onClick={openAddDialog}
                className="gap-2 shadow-lg text-white font-medium"
                size="lg"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                <Plus className="w-5 h-5" />
                إضافة فرع جديد
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Mobile Card Layout */}
          <div className="flex flex-col gap-3 sm:hidden">
            {filteredBranches.map((branch) => (
              <Card
                key={branch.id}
                className="border-0 shadow-md hover:shadow-lg transition-all duration-200 overflow-hidden"
              >
                <div className="flex" style={{ display: 'flex' }}>
                  {/* Right accent border */}
                  <div
                    className="w-1 flex-shrink-0"
                    style={{ background: branch.is_active ? 'linear-gradient(180deg, #10b981, #059669)' : 'linear-gradient(180deg, #ef4444, #dc2626)' }}
                  />
                  <CardContent className="p-4 flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm"
                          style={{ background: branch.is_active ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                        >
                          {branch.logo_url ? (
                            <img src={branch.logo_url} alt={branch.name} className="w-6 h-6 object-contain rounded" />
                          ) : (
                            <Building2 className="w-5 h-5 text-white" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-bold text-sm leading-tight">{branch.name}</h3>
                          <div className="mt-1">
                            <Badge
                              variant="secondary"
                              className="border-0 font-medium text-[10px] px-2 py-0"
                              style={
                                branch.is_active
                                  ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))', color: '#059669' }
                                  : { background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))', color: '#dc2626' }
                              }
                            >
                              {branch.is_active ? (
                                <span className="flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> نشط</span>
                              ) : (
                                <span className="flex items-center gap-1"><XCircle className="w-2.5 h-2.5" /> معطل</span>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <Switch
                        checked={branch.is_active}
                        onCheckedChange={() => toggleBranchStatus(branch)}
                      />
                    </div>
                    {branch.address && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5 mr-1">
                        <MapPin className="w-3 h-3 flex-shrink-0 text-emerald-500" />
                        <span className="truncate">{branch.address}</span>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5 mr-1">
                        <Phone className="w-3 h-3 flex-shrink-0 text-emerald-500" />
                        <span dir="ltr">{branch.phone}</span>
                      </div>
                    )}
                    {branch.tax_number && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1.5 mr-1">
                        <Hash className="w-3 h-3 flex-shrink-0 text-emerald-500" />
                        <span>ضريبي: {branch.tax_number}</span>
                      </div>
                    )}
                    {branch.commercial_register && (
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-3 mr-1">
                        <FileText className="w-3 h-3 flex-shrink-0 text-emerald-500" />
                        <span>سجل: {branch.commercial_register}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 border-t pt-3 mt-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditDialog(branch)}
                        className="flex-1 gap-1.5 h-9 text-xs font-medium border-emerald-200 dark:border-emerald-800/50 text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 hover:border-emerald-300"
                        style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(5,150,105,0.03))' }}
                      >
                        <Edit className="w-3.5 h-3.5" />
                        تعديل
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDeletingBranch(branch);
                          setDeleteDialogOpen(true);
                        }}
                        className="flex-1 gap-1.5 h-9 text-xs font-medium border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400 hover:text-red-700 hover:border-red-300"
                        style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(220,38,38,0.03))' }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        حذف
                      </Button>
                    </div>
                  </CardContent>
                </div>
              </Card>
            ))}
          </div>

          {/* Desktop Table Layout */}
          <Card className="border-0 shadow-md overflow-hidden hidden sm:block">
            {/* Gradient accent bar */}
            <div className="h-1" style={{ background: 'linear-gradient(90deg, #10b981, #059669, #10b981)' }} />
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider py-3">الفرع</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider py-3 hidden lg:table-cell">العنوان</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider py-3 hidden md:table-cell">الهاتف</TableHead>
                      <TableHead className="text-right font-semibold text-xs uppercase tracking-wider py-3 hidden xl:table-cell">الرقم الضريبي</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider py-3">الحالة</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider py-3">تفعيل</TableHead>
                      <TableHead className="text-center font-semibold text-xs uppercase tracking-wider py-3">الإجراءات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBranches.map((branch) => (
                      <TableRow key={branch.id} className="transition-colors hover:bg-emerald-50/50 dark:hover:bg-emerald-950/10">
                        <TableCell>
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm overflow-hidden"
                              style={{ background: branch.is_active ? 'linear-gradient(135deg, #10b981, #059669)' : 'linear-gradient(135deg, #ef4444, #dc2626)' }}
                            >
                              {branch.logo_url ? (
                                <img src={branch.logo_url} alt={branch.name} className="w-6 h-6 object-contain" />
                              ) : (
                                <Building2 className="w-4 h-4 text-white" />
                              )}
                            </div>
                            <div>
                              <span className="font-semibold text-sm">{branch.name}</span>
                              {branch.manager_name && (
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <User className="w-2.5 h-2.5" />
                                  {branch.manager_name}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            {branch.address ? (
                              <>
                                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="max-w-[150px] truncate">{branch.address}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            {branch.phone ? (
                              <>
                                <Phone className="w-3.5 h-3.5 text-emerald-500" />
                                <span dir="ltr">{branch.phone}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-sm">
                            {branch.tax_number ? (
                              <>
                                <Hash className="w-3.5 h-3.5 text-emerald-500" />
                                <span>{branch.tax_number}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant="secondary"
                            className="border-0 font-medium px-3"
                            style={
                              branch.is_active
                                ? { background: 'linear-gradient(135deg, rgba(16,185,129,0.15), rgba(5,150,105,0.1))', color: '#059669' }
                                : { background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))', color: '#dc2626' }
                            }
                          >
                            {branch.is_active ? (
                              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> نشط</span>
                            ) : (
                              <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> معطل</span>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={branch.is_active}
                            onCheckedChange={() => toggleBranchStatus(branch)}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(branch)}
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setDeletingBranch(branch);
                                setDeleteDialogOpen(true);
                              }}
                              className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
              >
                {editingBranch ? <Edit className="w-4 h-4 text-white" /> : <Plus className="w-4 h-4 text-white" />}
              </div>
              {editingBranch ? 'تعديل الفرع' : 'إضافة فرع جديد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-4">
            {/* Basic Info Section */}
            <div>
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                البيانات الأساسية
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="branch-name">اسم الفرع *</Label>
                  <Input
                    id="branch-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="مثال: فرع المعادي"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-manager">مدير الفرع</Label>
                  <Input
                    id="branch-manager"
                    value={form.manager_name}
                    onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                    placeholder="مثال: أحمد محمد"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Contact Info Section */}
            <div>
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                بيانات الاتصال
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="branch-address">العنوان</Label>
                  <Input
                    id="branch-address"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="مثال: 15 شارع 9 المعادي"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-phone">الهاتف</Label>
                  <Input
                    id="branch-phone"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="مثال: 01012345678"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-email">البريد الإلكتروني</Label>
                  <Input
                    id="branch-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="مثال: branch@example.com"
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Invoice & Legal Section */}
            <div>
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                بيانات الفواتير والسجلات
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="branch-tax">الرقم الضريبي</Label>
                  <Input
                    id="branch-tax"
                    value={form.tax_number}
                    onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                    placeholder="مثال: 300123456789"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-commercial">السجل التجاري</Label>
                  <Input
                    id="branch-commercial"
                    value={form.commercial_register}
                    onChange={(e) => setForm({ ...form, commercial_register: e.target.value })}
                    placeholder="مثال: 12345"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                تظهر هذه البيانات على الفواتير المطبوعة لهذا الفرع. إذا لم يتم تحديدها، سيتم استخدام البيانات العامة من الإعدادات.
              </p>
            </div>

            <Separator />

            {/* Logo & Branding Section */}
            <div>
              <h4 className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mb-3 flex items-center gap-2">
                <Image className="w-4 h-4" />
                الشعار والتخصيص
              </h4>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="branch-logo">رابط شعار الفرع</Label>
                  <Input
                    id="branch-logo"
                    value={form.logo_url}
                    onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                    placeholder="https://example.com/logo.png"
                  />
                  <p className="text-[10px] text-muted-foreground">إذا لم يتم تحديد شعار للفرع، سيتم استخدام الشعار العام من الإعدادات</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="branch-footer">نص تذييل الفاتورة</Label>
                  <Input
                    id="branch-footer"
                    value={form.invoice_footer}
                    onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })}
                    placeholder="مثال: شكراً لتعاملكم معنا - فرع المعادي"
                  />
                  <p className="text-[10px] text-muted-foreground">نص يظهر في أسفل الفاتورة المطبوعة لهذا الفرع</p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Status */}
            <div className="flex items-center gap-2">
              <Switch
                id="branch-active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
              />
              <Label htmlFor="branch-active">فرع نشط</Label>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleSave}
              className="text-white font-medium"
              style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
            >
              {editingBranch ? 'تحديث' : 'إضافة'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="w-[95vw] sm:w-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
              >
                <Trash2 className="w-4 h-4 text-white" />
              </div>
              حذف الفرع
            </AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف فرع &quot;{deletingBranch?.name}&quot;؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="text-white font-medium"
              style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)' }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
