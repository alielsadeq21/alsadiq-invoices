'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { Lock, User, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const { login, settings, autoLogoutReason, clearAutoLogoutReason } = useAppStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [factoryName, setFactoryName] = useState('مصنع الصادق');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // First check if settings already loaded
    if (settings?.factory_name) setFactoryName(settings.factory_name);
    if (settings?.logo_url) setLogoUrl(settings.logo_url);

    // Also fetch directly for login page (store might not be loaded yet)
    supabase
      .from('settings')
      .select('factory_name, logo_url')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.factory_name) setFactoryName(data.factory_name);
        if (data?.logo_url) setLogoUrl(data.logo_url);
      });
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast.error('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    setLoading(true);
    try {
      const result = await login(username, password);
      if (!result.success) {
        toast.error(result.error || 'اسم المستخدم أو كلمة المرور غير صحيحة');
      } else {
        clearAutoLogoutReason();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-amber-50/30 to-emerald-50 dark:from-[#1A1D29] dark:via-[#1A1D29] dark:to-[#242838] p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-2xl border-0 dark:border dark:border-sidebar-border">
          <CardHeader className="text-center pb-2 pt-8">
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mx-auto mb-4 w-20 h-20 bg-primary rounded-2xl flex items-center justify-center shadow-lg overflow-hidden"
            >
              {logoUrl ? (
                <img src={logoUrl} alt="شعار" className="w-14 h-14 object-contain" />
              ) : (
                <span className="text-5xl font-extrabold text-[#D4A843] leading-none select-none">ص</span>
              )}
            </motion.div>
            <h1 className="text-2xl font-bold text-foreground">{factoryName}</h1>
            <p className="text-muted-foreground text-sm mt-1">نظام علي الصادق فقط</p>
          </CardHeader>
          <CardContent className="pt-4 pb-8 px-8">
            {autoLogoutReason && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-center">
                <p className="text-sm text-amber-700 dark:text-amber-400 font-medium">{autoLogoutReason}</p>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-medium">
                  اسم المستخدم
                </Label>
                <div className="relative">
                  <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="أدخل اسم المستخدم"
                    className="pr-10 h-11"
                    autoFocus
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-medium">
                  كلمة المرور
                </Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور"
                    className="pr-10 h-11"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin ml-2" />
                    جاري تسجيل الدخول...
                  </>
                ) : (
                  'تسجيل الدخول'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
