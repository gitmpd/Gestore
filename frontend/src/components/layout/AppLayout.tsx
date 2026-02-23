import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { startAutoSync, stopAutoSync, syncAll } from '@/services/syncService';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/db';
import {
  getJwtExpiryMs,
  readSessionActivityAt,
  SESSION_ACTIVITY_THROTTLE_MS,
  SESSION_CHECK_INTERVAL_MS,
  SESSION_IDLE_TIMEOUT_MS,
  writeSessionActivityAt,
} from '@/lib/session';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const isOfflineToken = !token || token === 'offline-token';

  useEffect(() => {
    if (!isAuthenticated) return;

    let lastWrite = readSessionActivityAt() ?? Date.now();
    writeSessionActivityAt(lastWrite);

    const markActivity = () => {
      const now = Date.now();
      if (now - lastWrite < SESSION_ACTIVITY_THROTTLE_MS) return;
      lastWrite = now;
      writeSessionActivityAt(now);
    };

    const checkSession = () => {
      const state = useAuthStore.getState();
      if (!state.isAuthenticated) return;

      const tokenExpiry = getJwtExpiryMs(state.token);
      if (tokenExpiry && Date.now() >= tokenExpiry) {
        toast.error('Session expiree. Veuillez vous reconnecter.');
        state.logout();
        return;
      }

      const lastActivity = readSessionActivityAt();
      if (lastActivity && Date.now() - lastActivity >= SESSION_IDLE_TIMEOUT_MS) {
        toast.error('Session fermee apres inactivite.');
        state.logout();
      }
    };

    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, markActivity));
    const intervalId = window.setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    checkSession();

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, markActivity));
      window.clearInterval(intervalId);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (isOfflineToken) {
      stopAutoSync();
      return;
    }

    (async () => {
      const localCount = await db.products.count();
      const shouldForce = localCount === 0 || role === 'gerant';
      await syncAll(shouldForce ? { force: true } : undefined);
      startAutoSync();
    })();

    return () => stopAutoSync();
  }, [isOfflineToken, role]);

  return (
    <div className="flex h-screen bg-surface-alt">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        {isOfflineToken && (
          <div className="bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-sm px-4 py-2 flex items-center gap-2">
            <AlertTriangle size={16} />
            Mode hors-ligne - deconnectez-vous et reconnectez-vous avec le serveur accessible pour synchroniser les donnees.
          </div>
        )}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
