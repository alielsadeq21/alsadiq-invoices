'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/store/app-store';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Settings as SettingsIcon,
  Save,
  Upload,
  Lock,
  Factory,
  Loader2,
  Mail,
  FileText,
  MessageSquare,
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';

export default function SettingsPage() {
  const { settings, loadSettings, updateSettings, user } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    factory_name: '',
    address: '',
    phone: '',
    tax_number: '',
    commercial_register: '',
    email: '',
    default_tax_rate: 0,
    invoice_footer: '',
  });

  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });

  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({
        factory_name: settings.factory_name || '',
        address: settings.address || '',
        phone: settings.phone || '',
        tax_number: settings.tax_number || '',
        commercial_register: settings.commercial_register || '',
        email: settings.email || '',
        default_tax_rate: settings.default_tax_rate || 0,
        invoice_footer: settings.invoice_footer || '',
      });
      if (settings.logo_url) {
        setLogoPreview(settings.logo_url);
      }
    }
  }, [settings]);

  const handleSaveSettings = async () => {
    if (!form.factory_name.trim()) {
      toast.error('يرجى إدخال اسم المصنع');
      return;
    }

    setSaving(true);
    try {
      await updateSettings({
        factory_name: form.factory_name,
        address: form.address || null,
        phone: form.phone || null,
        tax_number: form.tax_number || null,
        commercial_register: form.commercial_register || null,
        email: form.email || null,
        default_tax_rate: form.default_tax_rate,
        invoice_footer: form.invoice_footer || null,
      });
      toast.success('تم حفظ الإعدادات بنجاح');
    } catch (err) {
      toast.error('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('حجم الملف يجب ألا يتجاوز 2 ميجابايت');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setLogoPreview(base64);

      try {
        await updateSettings({ logo_url: base64 });
        toast.success('تم تحديث الشعار');
      } catch (err) {
        toast.error('حدث خطأ أثناء تحديث الشعار');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = async () => {
    try {
      await updateSettings({ logo_url: null });
      setLogoPreview(null);
      toast.success('تم حذف الشعار');
    } catch (err) {
      toast.error('حدث خطأ أثناء حذف الشعار');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.current_password || !passwordForm.new_password || !passwordForm.confirm_password) {
      toast.error('يرجى ملء جميع الحقول');
      return;
    }

    if (passwordForm.new_password !== passwordForm.confirm_password) {
      toast.error('كلمة المرور الجديدة غير متطابقة');
      return;
    }

    if (passwordForm.new_password.length < 4) {
      toast.error('كلمة المرور يجب أن تكون 4 أحرف على الأقل');
      return;
    }

    try {
      // Verify current password with hashing support
      const { data: userData } = await supabase
        .from('users')
        .select('id, password_hash')
        .eq('id', user?.id || '')
        .single();

      if (!userData) {
        toast.error('كلمة المرور الحالية غير صحيحة');
        return;
      }

      const { verifyPassword, hashPassword } = await import('@/lib/auth');
      const { valid } = await verifyPassword(passwordForm.current_password, userData.password_hash);

      if (!valid) {
        toast.error('كلمة المرور الحالية غير صحيحة');
        return;
      }

      // Hash and update the new password
      const hashedNewPassword = await hashPassword(passwordForm.new_password);
      const { error } = await supabase
        .from('users')
        .update({ password_hash: hashedNewPassword, updated_at: new Date().toISOString() })
        .eq('id', user?.id);

      if (error) throw error;

      toast.success('تم تغيير كلمة المرور بنجاح');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      toast.error('حدث خطأ أثناء تغيير كلمة المرور');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="text-muted-foreground text-sm mt-1">إعدادات المصنع والنظام</p>
      </div>

      {/* Factory Info */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Factory className="w-5 h-5 text-primary" />
              بيانات المصنع
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="factory-name">اسم المصنع *</Label>
                <Input
                  id="factory-name"
                  value={form.factory_name}
                  onChange={(e) => setForm({ ...form, factory_name: e.target.value })}
                  placeholder="مصنع الصادق"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="factory-phone">الهاتف</Label>
                <Input
                  id="factory-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="01XXXXXXXXX"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="factory-address">العنوان</Label>
                <Input
                  id="factory-address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="العنوان الكامل للمصنع"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-number" className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  الرقم الضريبي
                </Label>
                <Input
                  id="tax-number"
                  value={form.tax_number}
                  onChange={(e) => setForm({ ...form, tax_number: e.target.value })}
                  placeholder="الرقم الضريبي"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="commercial-register" className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  السجل التجاري
                </Label>
                <Input
                  id="commercial-register"
                  value={form.commercial_register}
                  onChange={(e) => setForm({ ...form, commercial_register: e.target.value })}
                  placeholder="رقم السجل التجاري"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="factory-email" className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  البريد الإلكتروني
                </Label>
                <Input
                  id="factory-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="info@factory.com"
                  dir="ltr"
                  className="text-left"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tax-rate">نسبة الضريبة الافتراضية (%)</Label>
                <Input
                  id="tax-rate"
                  type="number"
                  value={form.default_tax_rate || ''}
                  onChange={(e) => setForm({ ...form, default_tax_rate: Number(e.target.value) || 0 })}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>
            </div>

            <Separator />

            {/* Invoice Footer */}
            <div className="space-y-2">
              <Label htmlFor="invoice-footer" className="flex items-center gap-1">
                <MessageSquare className="w-3.5 h-3.5" />
                نص تذييل الفاتورة
              </Label>
              <Textarea
                id="invoice-footer"
                value={form.invoice_footer}
                onChange={(e) => setForm({ ...form, invoice_footer: e.target.value })}
                placeholder="مثال: شكراً لتعاملكم معنا - البضاعة المباعة لا ترد ولا تستبدل"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">هذا النص سيظهر أسفل كل فاتورة مطبوعة</p>
            </div>

            <Button onClick={handleSaveSettings} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              حفظ الإعدادات
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logo Upload */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-primary" />
              شعار المصنع
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 border-2 border-dashed border-muted rounded-xl flex items-center justify-center overflow-hidden bg-muted/50">
                {logoPreview ? (
                  <img src={logoPreview} alt="الشعار" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-4xl font-extrabold text-[#D4A843]">ص</span>
                )}
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="logo-upload" className="cursor-pointer">
                    <Button variant="outline" className="gap-2" asChild>
                      <span>
                        <Upload className="w-4 h-4" />
                        رفع شعار جديد
                      </span>
                    </Button>
                  </Label>
                  {logoPreview && (
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={handleRemoveLogo}>
                      حذف
                    </Button>
                  )}
                </div>
                <input
                  id="logo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground">
                  PNG, JPG, SVG - حد أقصى 2 ميجابايت
                </p>
                <p className="text-xs text-muted-foreground">
                  إذا لم يتم رفع شعار، سيظهر حرف "ص" كشعار افتراضي
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Change Password */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="w-5 h-5 text-primary" />
              تغيير كلمة المرور
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">كلمة المرور الحالية</Label>
              <Input
                id="current-password"
                type="password"
                value={passwordForm.current_password}
                onChange={(e) => setPasswordForm({ ...passwordForm, current_password: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={passwordForm.new_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, new_password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={passwordForm.confirm_password}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirm_password: e.target.value })}
                />
              </div>
            </div>
            <Button onClick={handleChangePassword} variant="outline" className="gap-2">
              <Lock className="w-4 h-4" />
              تغيير كلمة المرور
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
