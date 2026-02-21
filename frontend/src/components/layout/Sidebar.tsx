import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  Users,
  Truck,
  BarChart3,
  Settings,
  ArrowRightLeft,
  ShoppingBag,
  Tag,
  Wallet,
  ScrollText,
  ClipboardList,
  UserCircle,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Logo } from '@/components/ui/Logo';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Tableau de bord' },
  { to: '/sales', icon: ShoppingBag, label: 'Ventes' },
  { to: '/categories', icon: Tag, label: 'Catégories' },
  { to: '/products', icon: Package, label: 'Produits' },
  { to: '/stock', icon: ArrowRightLeft, label: 'Mouvements de stock' },
  { to: '/customers', icon: Users, label: 'Clients' },
  { to: '/customer-orders', icon: ClipboardList, label: 'Commandes clients' },
  { to: '/suppliers', icon: Truck, label: 'Fournisseurs', role: 'gerant' as const },
  { to: '/expenses', icon: Wallet, label: 'Dépenses', role: 'gerant' as const },
  { to: '/reports', icon: BarChart3, label: 'Rapports', role: 'gerant' as const },
  { to: '/audit', icon: ScrollText, label: 'Journal d\'activité', role: 'gerant' as const },
  { to: '/settings', icon: Settings, label: 'Paramètres', role: 'gerant' as const },
  { to: '/profile', icon: UserCircle, label: 'Mon profil' },
];

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const user = useAuthStore((s) => s.user);

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-full w-64 bg-primary-dark text-white flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <Logo size="sm" variant="light" />
          <button onClick={onClose} className="lg:hidden p-1 hover:bg-white/10 rounded">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems
            .filter((item) => !item.role || item.role === user?.role)
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/15 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'
                  )
                }
              >
                <item.icon size={20} />
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="px-4 py-4 border-t border-white/10">
          <p className="text-sm text-white/60">
            {user?.name} — {user?.role === 'gerant' ? 'Gérant' : 'Vendeur'}
          </p>
          <p className="text-[10px] text-white/30 mt-1">&copy; Djamatigui 2026</p>
        </div>
      </aside>
    </>
  );
}
