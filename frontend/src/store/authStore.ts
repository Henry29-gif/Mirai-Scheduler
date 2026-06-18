/**
 * AUTH STORE (Zustand)
 * Manages authentication state across the app.
 * Persists tokens in SecureStore (native) or localStorage (web).
 */

import { create } from 'zustand';
import api, { storage, TOKEN_KEYS } from '../services/api';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  facilityId: string;
  position?: string;
  expoPushToken?: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  loadStoredAuth: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const { accessToken, refreshToken, user } = data.data;

      await storage.set(TOKEN_KEYS.ACCESS, accessToken);
      await storage.set(TOKEN_KEYS.REFRESH, refreshToken);

      set({ user, isAuthenticated: true, isLoading: false });
    } catch (err: any) {
      const message = err.response?.data?.error || 'Login failed. Please try again.';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    const refreshToken = await storage.get(TOKEN_KEYS.REFRESH);
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      // Best-effort logout; always clear local state
    }
    await storage.delete(TOKEN_KEYS.ACCESS);
    await storage.delete(TOKEN_KEYS.REFRESH);
    set({ user: null, isAuthenticated: false });
  },

  loadStoredAuth: async () => {
    set({ isLoading: true });
    try {
      const token = await storage.get(TOKEN_KEYS.ACCESS);
      if (!token) {
        set({ isLoading: false });
        return;
      }
      // Validate token by fetching current user
      // The interceptor will auto-refresh if expired
      const { data } = await api.get('/users/me').catch(() => ({ data: null }));
      if (data?.data) {
        set({ user: data.data, isAuthenticated: true });
      }
    } finally {
      set({ isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));
