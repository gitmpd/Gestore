import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, UserRole } from '@/types';

interface AuthState {
  user: Omit<User, 'password'> | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  mustChangePassword: boolean;
  login: (user: Omit<User, 'password'>, token: string, refreshToken: string) => void;
  logout: () => void;
  hasRole: (role: UserRole) => boolean;
  clearMustChangePassword: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      mustChangePassword: false,

      login: (user, token, refreshToken) =>
        set({
          user,
          token,
          refreshToken,
          isAuthenticated: true,
          mustChangePassword: !!user.mustChangePassword,
        }),

      logout: () =>
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false, mustChangePassword: false }),

      hasRole: (role) => get().user?.role === role,

      clearMustChangePassword: () => {
        const user = get().user;
        if (user) {
          set({
            mustChangePassword: false,
            user: { ...user, mustChangePassword: false },
          });
        }
      },
    }),
    { name: 'auth-storage' }
  )
);
