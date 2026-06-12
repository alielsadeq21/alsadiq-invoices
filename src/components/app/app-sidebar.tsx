'use client';

import { useEffect } from 'react';
import { useAppStore } from '@/store/app-store';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
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
  ChevronRight,
  Menu,
  Package,
  ClipboardList,
  Wallet,
  Banknote,
  CreditCard,
  Users,
  Shield,
  ScrollText,
  Warehouse,
  Receipt,
  BookOpen,
  Tags,
  ArrowRightLeft,
  ClipboardCheck,
  BookOpenCheck,
  TrendingUp,
  ShoppingCart,
  CalendarHeart,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Navigation groups with colored icons
const navGroups = [
  {
    title: 'الرئيسية',
    items: [
      { id: 'dashboard', label: 'لوحة التحكم', icon: LayoutDashboard, color: 'from-blue-500 to-blue-600' },
    ],
  },
  {
    title: 'إدارة البيانات',
    items: [
      { id: 'branches', label: 'الفروع', icon: Building2, color: 'from-violet-500 to-violet-600' },
      { id: 'products', label: 'المنتجات', icon: Package, color: 'from-amber-500 to-amber-600' },
      { id: 'customers', label: 'العملاء', icon: Users, color: 'from-teal-500 to-teal-600' },
    ],
  },
  {
    title: 'المبيعات والمالية',
    items: [
      { id: 'pos', label: 'نقطة البيع', icon: ShoppingCart, color: 'from-green-500 to-green-600' },
      { id: 'reservations', label: 'الحجوزات والمناسبات', icon: CalendarHeart, color: 'from-purple-500 to-purple-600' },
      { id: 'sales', label: 'المبيعات', icon: TrendingUp, color: 'from-emerald-400 to-emerald-600' },
      { id: 'invoices', label: 'الفواتير', icon: FileText, color: 'from-emerald-500 to-emerald-600' },
      { id: 'returns', label: 'المرتجعات', icon: RotateCcw, color: 'from-rose-500 to-rose-600' },
      { id: 'payments', label: 'القبض', icon: Banknote, color: 'from-green-500 to-green-600' },
      { id: 'expenses', label: 'المصروفات', icon: Receipt, color: 'from-orange-500 to-orange-600' },
    ],
  },
  {
    title: 'المخزون',
    items: [
      { id: 'inventory', label: 'المخزون', icon: Warehouse, color: 'from-cyan-500 to-cyan-600' },
      { id: 'inventory-transfers', label: 'التصبين والتحويلات', icon: ArrowRightLeft, color: 'from-indigo-500 to-indigo-600' },
      { id: 'inventory-counts', label: 'جرد المخزون', icon: ClipboardCheck, color: 'from-sky-500 to-sky-600' },
    ],
  },
  {
    title: 'الحسابات',
    items: [
      { id: 'branch-accounts', label: 'كشف الحسابات', icon: Wallet, color: 'from-lime-500 to-lime-600' },
      { id: 'account-statement', label: 'كشف حساب مفصل', icon: ScrollText, color: 'from-fuchsia-500 to-fuchsia-600' },
      { id: 'accounting', label: 'القيود المحاسبية', icon: BookOpen, color: 'from-purple-500 to-purple-600' },
      { id: 'chart-of-accounts', label: 'شجرة الحسابات', icon: BookOpenCheck, color: 'from-pink-500 to-pink-600' },
      { id: 'accounting-reports', label: 'التقارير المحاسبية', icon: BookOpen, color: 'from-red-500 to-red-600' },
    ],
  },
  {
    title: 'التقارير والإدارة',
    items: [
      { id: 'reports', label: 'التقارير', icon: BarChart3, color: 'from-yellow-500 to-yellow-600' },
      { id: 'activity-log', label: 'سجل النشاط', icon: ClipboardList, color: 'from-gray-500 to-gray-600' },
      { id: 'payment-methods', label: 'طرق الدفع', icon: CreditCard, color: 'from-emerald-500 to-emerald-600' },
      { id: 'expense-categories', label: 'تصنيفات المصروفات', icon: Tags, color: 'from-orange-500 to-orange-600' },
      { id: 'users', label: 'المستخدمين', icon: Users, color: 'from-blue-500 to-blue-600' },
      { id: 'roles', label: 'الأدوار', icon: Shield, color: 'from-red-500 to-red-600' },
      { id: 'settings', label: 'الإعدادات', icon: Settings, color: 'from-slate-500 to-slate-600' },
    ],
  },
];

// Role display names mapping
const roleDisplayNames: Record<string, string> = {
  admin: 'مدير النظام',
  branch_manager: 'مدير فرع',
  warehouse_keeper: 'أمين مخزن',
  accountant: 'محاسب',
  cashier: 'كاشير',
};

export default function AppSidebar() {
  const { currentPage, navigateTo, user, logout, settings, sidebarOpen, setSidebarOpen, canAccessPage } = useAppStore();
  const { theme, setTheme } = useTheme();

  // Filter nav items based on permissions
  const filteredGroups = navGroups.map(group => ({
    ...group,
    items: group.items.filter(item => canAccessPage(item.id)),
  })).filter(group => group.items.length > 0);

  // Lock body scroll when sidebar is open on mobile
  useEffect(() => {
    if (sidebarOpen && window.innerWidth < 1024) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [sidebarOpen]);

  return (
    <>
      {/* Mobile overlay with blur */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden transition-opacity duration-300"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 right-4 z-50 lg:hidden bg-card/80 backdrop-blur-md shadow-lg border border-border/50 h-11 w-11 rounded-xl hover:bg-card transition-all"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <ChevronRight className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </Button>

      {/* Sidebar */}
      <aside
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          height: '100dvh',
          width: '17.5rem',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          zIndex: 50,
          overscrollBehavior: 'contain',
        }}
        className={cn(
          'bg-sidebar text-sidebar-foreground shadow-2xl transition-transform duration-300',
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header with gradient accent */}
        <div style={{ flexShrink: 0 }} className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-primary via-emerald-400 to-primary" />
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0 overflow-hidden bg-gradient-to-br from-primary to-primary/80">
              {settings?.logo_url ? (
                <img
                  src={settings.logo_url}
                  alt="شعار المصنع"
                  className="w-7 h-7 object-contain"
                />
              ) : (
                <span className="text-xl font-extrabold text-primary-foreground leading-none select-none">ص</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-sm truncate">
                {settings?.factory_name || 'مصنع الصادق'}
              </h2>
              <p className="text-[11px] text-sidebar-foreground/50">نظام فواتير الصرف</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 h-7 w-7"
              onClick={() => setSidebarOpen(false)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <Separator className="bg-sidebar-border/50" />

        {/* Navigation - scrollable area */}
        <div
          style={{
            flex: '1 1 0%',
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            overscrollBehavior: 'contain',
            touchAction: 'pan-y',
          }}
          className="px-2.5 py-3"
        >
          {filteredGroups.map((group, groupIndex) => (
            <div key={group.title} className={cn(groupIndex > 0 && 'mt-4')}>
              {/* Group header */}
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                {group.title}
              </p>
              <nav className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = currentPage === item.id ||
                    (item.id === 'invoices' && (currentPage === 'invoice-form' || currentPage === 'invoice-detail')) ||
                    (item.id === 'returns' && currentPage === 'return-form');
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        navigateTo(item.id);
                        if (window.innerWidth < 1024) setSidebarOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-2.5 h-9 px-3 rounded-lg transition-all duration-200 text-right',
                        isActive
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-md shadow-sidebar-primary/20'
                          : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
                      )}
                    >
                      {/* Icon with colored circle when inactive, white when active */}
                      <div className={cn(
                        'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-all',
                        isActive
                          ? 'bg-white/20'
                          : `bg-gradient-to-br ${item.color} shadow-sm`
                      )}>
                        <Icon className={cn(
                          'w-3.5 h-3.5',
                          isActive ? 'text-sidebar-primary-foreground' : 'text-white'
                        )} />
                      </div>
                      <span className={cn(
                        'text-[13px] truncate',
                        isActive ? 'font-semibold' : 'font-medium'
                      )}>
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <Separator className="bg-sidebar-border/50" />

        {/* Footer - fixed at bottom */}
        <div style={{ flexShrink: 0 }} className="p-3 space-y-2.5">
          {/* Theme toggle */}
          <div className="flex items-center justify-between px-2 py-1">
            <div className="flex items-center gap-2">
              <div className={cn(
                'w-6 h-6 rounded-md flex items-center justify-center',
                theme === 'dark'
                  ? 'bg-indigo-500/20'
                  : 'bg-amber-500/20'
              )}>
                {theme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                ) : (
                  <Sun className="w-3.5 h-3.5 text-amber-500" />
                )}
              </div>
              <Label className="text-[11px] text-sidebar-foreground/50 cursor-pointer">
                الوضع الليلي
              </Label>
            </div>
            <Switch
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              className="data-[state=checked]:bg-sidebar-primary"
            />
          </div>

          <Separator className="bg-sidebar-border/30" />

          {/* User info */}
          <div className="flex items-center gap-2.5 px-2 py-1">
            <Avatar className="w-8 h-8 border-2 border-sidebar-primary/50">
              <AvatarFallback className="bg-gradient-to-br from-sidebar-primary to-sidebar-primary/80 text-sidebar-primary-foreground text-[11px] font-bold">
                {user?.full_name?.charAt(0) || 'ع'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium truncate">{user?.full_name || 'علي محمد الصادق'}</p>
              <p className="text-[10px] text-sidebar-foreground/40">
                {user?.role_name ? (roleDisplayNames[user.role_name] || user.role_name) : 'مدير النظام'}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={logout}
            className="w-full justify-start gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 text-[12px] rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>تسجيل الخروج</span>
          </Button>
        </div>
      </aside>
    </>
  );
}
