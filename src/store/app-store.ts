import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { hashPassword, verifyPassword } from '@/lib/auth';
import type { Settings, Permissions, DEFAULT_ADMIN_PERMISSIONS } from '@/lib/types';

interface AppUser {
  id: string;
  username: string;
  full_name: string;
  role_id: string | null;
  role_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  is_active: boolean;
  must_change_password: boolean;
}

interface AppState {
  // Auth
  isLoggedIn: boolean;
  user: AppUser | null;
  permissions: Permissions | null;
  isAdmin: boolean;
  forceChangePassword: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  autoLogout: (reason: string) => void;
  clearAutoLogoutReason: () => void;
  checkAuth: () => void;
  autoLogoutReason: string | null;
  hasPermission: (page: string, action: string) => boolean;
  canAccessPage: (pageId: string) => boolean;
  refreshPermissions: () => Promise<void>;
  dismissForceChangePassword: () => void;

  // Navigation
  currentPage: string;
  navigateTo: (page: string, params?: Record<string, string>) => void;
  pageParams: Record<string, string>;

  // Settings
  settings: Settings | null;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => Promise<void>;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Auth
  isLoggedIn: false,
  user: null,
  permissions: null,
  isAdmin: false,
  forceChangePassword: false,
  autoLogoutReason: null,

  login: async (username: string, password: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*, roles(id, name, display_name, permissions)')
        .eq('username', username)
        .single();

      if (error || !data) {
        return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      // Check if active
      if (data.is_active === false) {
        return { success: false, error: 'هذا الحساب معطل، تواصل مع المدير' };
      }

      // Verify password with hashing support
      const { valid, needsUpgrade } = await verifyPassword(password, data.password_hash);

      if (!valid) {
        return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      // Auto-upgrade plain text password to hashed format
      if (needsUpgrade) {
        const hashedPassword = await hashPassword(password);
        await supabase
          .from('users')
          .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
          .eq('id', data.id);
      }

      // Update last_login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id);

      // Get branch name if applicable
      let branchName: string | null = null;
      if (data.branch_id) {
        const { data: branchData } = await supabase
          .from('branches')
          .select('name')
          .eq('id', data.branch_id)
          .single();
        branchName = branchData?.name || null;
      }

      const roleName = (data.roles as { name: string; display_name: string; permissions: Permissions } | null)?.name || null;
      const rolePermissions = (data.roles as { name: string; display_name: string; permissions: Permissions } | null)?.permissions || null;
      const isAdminUser = roleName === 'admin';

      // If no role assigned, give admin permissions (for backwards compatibility with existing admin user)
      const effectivePermissions: Permissions = rolePermissions || (await import('@/lib/types')).DEFAULT_ADMIN_PERMISSIONS;

      const appUser: AppUser = {
        id: data.id,
        username: data.username,
        full_name: data.full_name,
        role_id: data.role_id,
        role_name: roleName,
        branch_id: data.branch_id,
        branch_name: branchName,
        is_active: data.is_active !== false,
        must_change_password: data.must_change_password || false,
      };

      // Check if must change password
      const mustChange = data.must_change_password || false;

      set({
        isLoggedIn: true,
        user: appUser,
        permissions: effectivePermissions,
        isAdmin: isAdminUser,
        forceChangePassword: mustChange,
      });

      localStorage.setItem('alsadeq_user', JSON.stringify({
        ...appUser,
        permissions: effectivePermissions,
        isAdmin: isAdminUser,
        forceChangePassword: mustChange,
      }));

      return { success: true };
    } catch {
      return { success: false, error: 'حدث خطأ أثناء تسجيل الدخول' };
    }
  },

  logout: () => {
    set({ isLoggedIn: false, user: null, permissions: null, isAdmin: false, forceChangePassword: false, currentPage: 'login' });
    localStorage.removeItem('alsadeq_user');
  },

  autoLogout: (reason: string) => {
    set({ isLoggedIn: false, user: null, permissions: null, isAdmin: false, forceChangePassword: false, currentPage: 'login', autoLogoutReason: reason });
    localStorage.removeItem('alsadeq_user');
  },

  clearAutoLogoutReason: () => {
    set({ autoLogoutReason: null });
  },

  checkAuth: () => {
    const stored = localStorage.getItem('alsadeq_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const appUser: AppUser = {
          id: parsed.id,
          username: parsed.username,
          full_name: parsed.full_name,
          role_id: parsed.role_id || null,
          role_name: parsed.role_name || null,
          branch_id: parsed.branch_id || null,
          branch_name: parsed.branch_name || null,
          is_active: parsed.is_active !== false,
          must_change_password: parsed.must_change_password || false,
        };
        set({
          isLoggedIn: true,
          user: appUser,
          permissions: parsed.permissions || null,
          isAdmin: parsed.isAdmin || false,
          forceChangePassword: parsed.forceChangePassword || parsed.must_change_password || false,
          currentPage: 'dashboard',
        });
      } catch {
        localStorage.removeItem('alsadeq_user');
      }
    }
  },

  hasPermission: (page: string, action: string): boolean => {
    const { permissions, isAdmin } = get();
    // Admin always has all permissions
    if (isAdmin) return true;
    if (!permissions) return false;

    const pagePerms = permissions[page as keyof Permissions];
    if (!pagePerms) return false;

    return (pagePerms as Record<string, boolean | undefined>)[action] === true;
  },

  canAccessPage: (pageId: string): boolean => {
    const { permissions, isAdmin } = get();
    // Admin always can access
    if (isAdmin) return true;
    if (!permissions) return false;

    // Map page IDs to permission keys
    const pagePermissionMap: Record<string, string> = {
      'dashboard': 'dashboard',
      'branches': 'branches',
      'products': 'products',
      'invoices': 'invoices',
      'invoice-form': 'invoices',
      'invoice-detail': 'invoices',
      'returns': 'returns',
      'return-form': 'returns',
      'payments': 'payments',
      'branch-accounts': 'branch_accounts',
      'account-statement': 'account_statement',
      'inventory': 'inventory',
      'expenses': 'expenses',
      'reports': 'reports',
      'accounting': 'accounting',
      'users': 'users',
      'roles': 'roles',
      'settings': 'settings',
      'activity-log': 'activity_log',
      'payment-methods': 'payment_methods',
      'expense-categories': 'expense_categories',
      'customers': 'customers',
      'chart-of-accounts': 'chart_of_accounts',
      'inventory-transfers': 'inventory_transfers',
      'inventory-counts': 'inventory_counts',
      'accounting-reports': 'accounting_reports',
      'sales': 'sales',
    };

    const permKey = pagePermissionMap[pageId];
    if (!permKey) return true; // Allow unknown pages by default

    const pagePerms = permissions[permKey as keyof Permissions];
    if (!pagePerms) return false;

    return (pagePerms as Record<string, boolean | undefined>).view === true;
  },

  dismissForceChangePassword: () => {
    set({ forceChangePassword: false });
    // Update localStorage too
    const stored = localStorage.getItem('alsadeq_user');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        parsed.forceChangePassword = false;
        parsed.must_change_password = false;
        localStorage.setItem('alsadeq_user', JSON.stringify(parsed));
      } catch {}
    }
  },

  refreshPermissions: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const { data } = await supabase
        .from('users')
        .select('roles(id, name, permissions)')
        .eq('id', user.id)
        .single();

      if (data?.roles) {
        const roleData = data.roles as unknown as { name: string; permissions: Permissions };
        const isAdminUser = roleData.name === 'admin';
        set({
          permissions: roleData.permissions,
          isAdmin: isAdminUser,
        });
        // Update localStorage too
        const stored = localStorage.getItem('alsadeq_user');
        if (stored) {
          const parsed = JSON.parse(stored);
          parsed.permissions = roleData.permissions;
          parsed.isAdmin = isAdminUser;
          localStorage.setItem('alsadeq_user', JSON.stringify(parsed));
        }
      }
    } catch (err) {
      console.error('Error refreshing permissions:', err);
    }
  },

  // Navigation
  currentPage: 'login',
  pageParams: {},

  navigateTo: (page: string, params?: Record<string, string>) => {
    set({ currentPage: page, pageParams: params || {} });
  },

  // Settings
  settings: null,

  loadSettings: async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('*')
        .limit(1)
        .single();

      if (error || !data) {
        const { data: newData, error: insertError } = await supabase
          .from('settings')
          .insert({
            factory_name: 'مصنع الصادق',
            default_tax_rate: 0,
          })
          .select()
          .single();

        if (!insertError && newData) {
          set({ settings: newData });
        }
        return;
      }

      set({ settings: data });
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  },

  updateSettings: async (updates: Partial<Settings>) => {
    const { settings } = get();
    if (!settings) return;

    try {
      const { data, error } = await supabase
        .from('settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', settings.id)
        .select()
        .single();

      if (!error && data) {
        set({ settings: data });
      }
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  },

  // Sidebar
  sidebarOpen: true,
  setSidebarOpen: (open: boolean) => set({ sidebarOpen: open }),
}));
