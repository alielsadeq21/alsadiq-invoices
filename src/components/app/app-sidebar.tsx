'use client';

import { useAppStore } from '@/store/app-store';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  LayoutDashboard,
  Building2,
  FileText,
  RotateCcw,
  BarChart3,
  Settings,
  LogOut,
  Moon,
  Sun,
  Factory,
  ChevronRight,
  Menu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard },
  { id: 'branches', label: 'الفروع', icon: Building2 },
  { id: 'invoices', label: 'الفواتير', icon: FileText },
  { id: 'returns', label: 'المرتجعات', icon: RotateCcw },
  { id: 'reports', label: 'التقارير', icon: BarChart3 },
  { id: 'settings', label: 'الإعدادات', icon: Settings },
];

export default function AppSidebar() {
  const { currentPage, navigateTo, user, logout, settings, sidebarOpen, setSidebarOpen } = useAppStore();
  const { theme, setTheme } = useTheme();

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 right-4 z-50 lg:hidden bg-card shadow-md h-10 w-10"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <ChevronRight className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed right-0 top-0 h-full w-72 bg-sidebar text-sidebar-foreground z-50 shadow-2xl flex flex-col transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="p-5 flex items-center gap-3">
          <div className="w-11 h-11 bg-sidebar-primary rounded-xl flex items-center justify-center shadow-md flex-shrink-0 overflow-hidden">
            {settings?.logo_url ? (
              <img
                src={settings.logo_url}
                alt="شعار المصنع"
                className="w-8 h-8 object-contain"
              />
            ) : (
              <span className="text-2xl font-extrabold text-[#D4A843] leading-none select-none">ص</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-sm truncate">
              {settings?.factory_name || 'مصنع الصادق'}
            </h2>
            <p className="text-xs text-sidebar-foreground/60">نظام فواتير الصرف</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent h-8 w-8"
            onClick={() => setSidebarOpen(false)}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Separator className="bg-sidebar-border" />

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const isActive = currentPage === item.id ||
                (item.id === 'invoices' && (currentPage === 'invoice-form' || currentPage === 'invoice-detail')) ||
                (item.id === 'returns' && currentPage === 'return-form');
              const Icon = item.icon;
              return (
                <Button
                  key={item.id}
                  variant="ghost"
                  onClick={() => {
                    navigateTo(item.id);
                    if (window.innerWidth < 1024) setSidebarOpen(false);
                  }}
                  className={cn(
                    'w-full justify-start gap-3 h-11 px-4 rounded-xl transition-all',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 hover:text-sidebar-primary-foreground shadow-md'
                      : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </Button>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Footer */}
        <div className="p-4 space-y-3">
          {/* Theme toggle */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              {theme === 'dark' ? (
                <Moon className="w-4 h-4 text-sidebar-foreground/60" />
              ) : (
                <Sun className="w-4 h-4 text-sidebar-foreground/60" />
              )}
              <Label className="text-xs text-sidebar-foreground/60 cursor-pointer">
                الوضع الليلي
              </Label>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              className="data-[state=checked]:bg-sidebar-primary"
            />
          </div>

          <Separator className="bg-sidebar-border" />

          {/* User info */}
          <div className="flex items-center gap-3 px-2">
            <Avatar className="w-9 h-9 border-2 border-sidebar-primary">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                {user?.full_name?.charAt(0) || 'ع'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.full_name || 'علي محمد الصادق'}</p>
              <p className="text-xs text-sidebar-foreground/50">محاسب</p>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={logout}
            className="w-full justify-start gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-10"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">تسجيل الخروج</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
