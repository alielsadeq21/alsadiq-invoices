import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import { hashPassword, verifyPassword } from '@/lib/auth';
import type { Settings, User } from '@/lib/types';

interface AppState {
  // Auth
  isLoggedIn: boolean;
  user: { id: string; username: string; full_name: string } | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => void;

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

  login: async (username: string, password: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (error || !data) {
        return false;
      }

      // Verify password with hashing support
      const { valid, needsUpgrade } = await verifyPassword(password, data.password_hash);

      if (!valid) {
        return false;
      }

      // Auto-upgrade plain text password to hashed format
      if (needsUpgrade) {
        const hashedPassword = await hashPassword(password);
        await supabase
          .from('users')
          .update({ password_hash: hashedPassword, updated_at: new Date().toISOString() })
          .eq('id', data.id);
      }

      set({
        isLoggedIn: true,
        user: {
          id: data.id,
          username: data.username,
          full_name: data.full_name,
        },
      });

      localStorage.setItem('alsadeq_user', JSON.stringify({
        id: data.id,
        username: data.username,
        full_name: data.full_name,
      }));

      return true;
    } catch {
      return false;
    }
  },

  logout: () => {
    set({ isLoggedIn: false, user: null, currentPage: 'login' });
    localStorage.removeItem('alsadeq_user');
  },

  checkAuth: () => {
    const stored = localStorage.getItem('alsadeq_user');
    if (stored) {
      try {
        const user = JSON.parse(stored);
        set({ isLoggedIn: true, user, currentPage: 'dashboard' });
      } catch {
        localStorage.removeItem('alsadeq_user');
      }
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
