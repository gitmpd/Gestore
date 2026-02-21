import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { Menu, LogOut, Wifi, WifiOff, Moon, Sun, Bell, AlertTriangle, RefreshCw, Store } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { syncAll } from '@/services/syncService';
import { db } from '@/db';
import { getShopNameOrDefault } from '@/lib/shop';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const isOnline = useOnlineStatus();
  const { theme, toggle } = useThemeStore();
  const shopName = getShopNameOrDefault();
  const [notifOpen, setNotifOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const lowStockProducts = useLiveQuery(async () => {
    const all = (await db.products.toArray()).filter((p) => !p.deleted);
    return all.filter((p) => p.quantity <= p.alertThreshold);
  }) ?? [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-3 sm:px-4 bg-surface border-b border-border lg:px-6">
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 pr-2">
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 lg:hidden"
        >
          <Menu size={22} className="text-text" />
        </button>
        <div className="sm:hidden flex items-center gap-1.5 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store size={16} />
          </div>
          <p className="text-sm font-semibold text-text truncate max-w-[calc(100vw-250px)]">{shopName}</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 min-w-0 max-w-[56vw] sm:max-w-[360px] rounded-xl border border-border/80 bg-slate-50/70 dark:bg-slate-800/60 px-2.5 py-1.5 shadow-sm">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store size={16} />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-text-muted leading-none">Boutique</p>
            <p className="font-bold text-primary break-words">{shopName}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <div
          className={`flex items-center gap-1.5 px-2 py-1 sm:px-2.5 rounded-full text-xs font-medium ${
            isOnline
              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
          }`}
        >
          {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span className="hidden min-[421px]:inline">{isOnline ? 'En ligne' : 'Hors ligne'}</span>
        </div>

        {isOnline && (
          <button
            onClick={async () => {
              setSyncing(true);
              try {
                const result = await syncAll({ force: true });
                if (result.success) {
                  toast.success(`Synchronisation réussie `);
                } else {
                  toast.error(result.error || 'Échec de la synchronisation');
                }
              } catch {
                toast.error('Erreur de synchronisation');
              } finally {
                setSyncing(false);
              }
            }}
            disabled={syncing}
            className="p-2 rounded-lg text-text-muted hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-text transition-colors"
            title="Synchroniser les données"
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
          </button>
        )}

        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg text-text-muted hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-text transition-colors"
            title="Notifications"
          >
            <Bell size={18} />
            {lowStockProducts.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4.5 h-4.5 text-[10px] font-bold text-white bg-danger rounded-full">
                {lowStockProducts.length}
              </span>
            )}
          </button>

          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-surface border border-border rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-text">Alertes stock</h3>
                {lowStockProducts.length > 0 && (
                  <button
                    onClick={() => { setNotifOpen(false); navigate('/low-stock'); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Tout voir
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {lowStockProducts.length === 0 ? (
                  <p className="text-sm text-text-muted text-center py-6">Aucune alerte</p>
                ) : (
                  lowStockProducts.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => { setNotifOpen(false); navigate(`/stock?product=${p.id}`); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <AlertTriangle size={16} className={p.quantity === 0 ? 'text-danger' : 'text-warning'} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-text truncate">{p.name}</p>
                        <p className="text-xs text-text-muted">
                          Stock : <span className={p.quantity === 0 ? 'text-danger font-semibold' : 'text-warning font-semibold'}>{p.quantity}</span>
                          {' / seuil : '}{p.alertThreshold}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={toggle}
          className="p-2 rounded-lg text-text-muted hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-text transition-colors"
          title={theme === 'light' ? 'Mode sombre' : 'Mode clair'}
        >
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>

        <button
          onClick={logout}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-muted hover:text-danger rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
        >
          <LogOut size={18} />
          <span className="hidden sm:inline">Déconnexion</span>
        </button>
      </div>
    </header>
  );
}
