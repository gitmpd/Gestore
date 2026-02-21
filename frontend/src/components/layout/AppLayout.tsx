import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { startAutoSync, stopAutoSync, syncAll } from '@/services/syncService';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/db';

export function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const isOfflineToken = !token || token === 'offline-token';

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
