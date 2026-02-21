import type { ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronRight,
  ClipboardList,
  Package,
  ShoppingBag,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { db } from '@/db';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatCurrencyParts } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

function CurrencyValue({
  amount,
  className,
}: {
  amount: number;
  className?: string;
}) {
  const { numberPart, currencyPart } = formatCurrencyParts(amount);

  return (
    <span className={`inline-flex min-w-0 max-w-full flex-col items-start leading-tight ${className ?? ''}`}>
      <span className="max-w-full break-words leading-none tracking-tight">{numberPart.replace(/\u202F|\u00A0/g, ' ')}</span>
      <span className="leading-none tracking-tight">{currencyPart}</span>
    </span>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  hint,
  onClick,
}: {
  icon: typeof Package;
  label: string;
  value: ReactNode;
  color: string;
  hint?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full text-left rounded-xl border border-border bg-surface p-5 shadow-sm
        transition-all duration-200 ease-out
        hover:shadow-lg hover:-translate-y-1 hover:border-primary/30
        active:translate-y-0 active:shadow-md
        cursor-pointer group"
    >
      <div className={`p-3 rounded-xl ${color} transition-transform duration-200 group-hover:scale-110`}>
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
        <p className="text-xl sm:text-2xl font-bold text-text leading-tight whitespace-normal">{value}</p>
        {hint ? <p className="text-xs text-text-muted mt-1">{hint}</p> : null}
      </div>
      <ChevronRight
        size={18}
        className="text-text-muted opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0"
      />
    </button>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: typeof Package;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border border-border bg-surface p-4 text-left hover:shadow-md hover:border-primary/30 transition-all duration-200 group"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Icon size={18} />
        </div>
        <ChevronRight size={16} className="text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
      <p className="mt-3 text-sm font-semibold text-text">{title}</p>
      <p className="text-xs text-text-muted">{subtitle}</p>
    </button>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isGerant = currentUser?.role === 'gerant';

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const today = new Date().toISOString().slice(0, 10);

  const productCount = useLiveQuery(async () => (await db.products.toArray()).filter((p) => !p.deleted).length) ?? 0;

  const lowStockCount = useLiveQuery(async () => {
    const products = (await db.products.toArray()).filter((p) => !p.deleted);
    return products.filter((p) => p.quantity <= p.alertThreshold).length;
  }) ?? 0;

  const todaySales = useLiveQuery(async () => {
    const sales = (await db.sales.where('date').startsWithIgnoreCase(today).toArray()).filter(
      (s) => !s.deleted && s.status === 'completed'
    );
    return {
      total: sales.reduce((sum, s) => sum + s.total, 0),
      count: sales.length,
    };
  }, [today]) ?? { total: 0, count: 0 };

  const todayExpenses = useLiveQuery(async () => {
    const expenses = (await db.expenses.where('date').startsWithIgnoreCase(today).toArray()).filter((e) => !e.deleted);
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [today]) ?? 0;

  const pendingCustomerOrdersCount = useLiveQuery(async () => {
    const orders = await db.customerOrders.toArray();
    return orders.filter((o) => o.status === 'en_attente').length;
  }) ?? 0;

  const pendingSupplierOrdersCount = useLiveQuery(async () => {
    const orders = await db.supplierOrders.toArray();
    return orders.filter((o) => o.status === 'en_attente').length;
  }) ?? 0;

  const recentSales = useLiveQuery(async () => {
    return (await db.sales.orderBy('date').reverse().limit(8).toArray()).filter(
      (s) => !s.deleted && s.status === 'completed'
    );
  }) ?? [];

  const lowStockProducts = useLiveQuery(async () => {
    const products = (await db.products.toArray()).filter((p) => !p.deleted);
    return products
      .filter((p) => p.quantity <= p.alertThreshold)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5);
  }) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Tableau de bord</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {isGerant ? (
          <>
            <QuickActionCard
              icon={ShoppingBag}
              title="Nouvelle vente"
              subtitle="Encaisser rapidement"
              onClick={() => navigate('/sales')}
            />
            <QuickActionCard
              icon={Truck}
              title="Commande fournisseur"
              subtitle="Lancer un approvisionnement"
              onClick={() => navigate('/supplier-orders')}
            />
            <QuickActionCard
              icon={Wallet}
              title="Ajouter depense"
              subtitle="Saisir une sortie caisse"
              onClick={() => navigate('/expenses')}
            />
            <QuickActionCard
              icon={ArrowRightLeft}
              title="Mouvement stock"
              subtitle="Retour client / ajustement"
              onClick={() => navigate('/stock')}
            />
          </>
        ) : (
          <>
            <QuickActionCard
              icon={ShoppingBag}
              title="Nouvelle vente"
              subtitle="Encaisser rapidement"
              onClick={() => navigate('/sales')}
            />
            <QuickActionCard
              icon={ClipboardList}
              title="Commande client"
              subtitle="Ajouter une commande"
              onClick={() => navigate('/customer-orders')}
            />
            <QuickActionCard
              icon={Users}
              title="Clients"
              subtitle="Consulter les fiches clients"
              onClick={() => navigate('/customers')}
            />
            <QuickActionCard
              icon={ArrowRightLeft}
              title="Retour client"
              subtitle="Mouvement de stock"
              onClick={() => navigate('/stock')}
            />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Ventes du jour"
          value={<CurrencyValue amount={todaySales.total} />}
          color="bg-primary"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          icon={Package}
          label="Produits actifs"
          value={productCount}
          color="bg-emerald-500"
          onClick={() => navigate('/products')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Stock bas"
          value={lowStockCount}
          color={lowStockCount > 0 ? 'bg-amber-500' : 'bg-slate-400'}
          onClick={() => navigate('/low-stock')}
        />
        {isGerant ? (
          <StatCard
            icon={Wallet}
            label="Depenses du jour"
            value={<CurrencyValue amount={todayExpenses} />}
            color="bg-red-500"
            onClick={() => navigate('/expenses')}
          />
        ) : (
          <StatCard
            icon={ClipboardList}
            label="Cmd clients attente"
            value={pendingCustomerOrdersCount}
            color="bg-indigo-500"
            onClick={() => navigate('/customer-orders')}
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden transition-all duration-200 hover:shadow-lg hover:border-primary/20">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <CardTitle>Dernieres ventes</CardTitle>
            <button
              onClick={() => navigate('/sales')}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              Voir tout <ChevronRight size={14} />
            </button>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-text-muted text-sm">Aucune vente enregistree</p>
          ) : (
            <div className="space-y-1">
              {recentSales.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => navigate('/sales')}
                  className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 min-w-0 w-full py-2.5 px-2 rounded-lg border-b border-border last:border-0
                    hover:bg-primary/5 transition-colors duration-150 cursor-pointer text-left group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text group-hover:text-primary transition-colors break-words whitespace-normal">
                      Vente #{sale.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-text-muted break-words whitespace-normal">
                      {new Date(sale.date).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <span className="font-semibold text-text w-full sm:w-auto self-start sm:self-auto text-left sm:text-right sm:pl-3 whitespace-normal">
                    <CurrencyValue amount={sale.total} className="justify-start sm:justify-end" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

        {isGerant ? (
          <Card className="transition-all duration-200 hover:shadow-lg hover:border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <CardTitle>Points de controle</CardTitle>
            </div>
            <div className="space-y-2">
              <button
                onClick={() => navigate('/low-stock')}
                className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-amber-50/50 transition-colors text-left"
              >
                <span className="text-sm text-text">Produits en stock bas</span>
                <span className="text-sm font-semibold text-amber-600">{lowStockCount}</span>
              </button>
              <button
                onClick={() => navigate('/customer-orders')}
                className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-primary/5 transition-colors text-left"
              >
                <span className="text-sm text-text">Commandes clients en attente</span>
                <span className="text-sm font-semibold text-primary">{pendingCustomerOrdersCount}</span>
              </button>
              <button
                onClick={() => navigate('/supplier-orders')}
                className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-primary/5 transition-colors text-left"
              >
                <span className="text-sm text-text">Commandes fournisseurs en attente</span>
                <span className="text-sm font-semibold text-primary">{pendingSupplierOrdersCount}</span>
              </button>
              <button
                onClick={() => navigate('/expenses')}
                className="w-full flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-red-50/50 transition-colors text-left"
              >
                <span className="text-sm text-text">Depenses du jour</span>
                <span className="text-sm font-semibold text-red-600">
                  <CurrencyValue amount={todayExpenses} />
                </span>
              </button>
            </div>
          </Card>
        ) : (
          <Card className="transition-all duration-200 hover:shadow-lg hover:border-primary/20">
            <div className="flex items-center justify-between mb-3">
              <CardTitle>Alertes stock bas</CardTitle>
              <button
                onClick={() => navigate('/low-stock')}
                className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
              >
                Voir tout <ChevronRight size={14} />
              </button>
            </div>
            {lowStockProducts.length === 0 ? (
              <p className="text-text-muted text-sm">Tous les stocks sont suffisants</p>
            ) : (
              <div className="space-y-1">
                {lowStockProducts.map((product) => (
                  <button
                    key={product.id}
                    onClick={() => navigate('/low-stock')}
                    className="flex items-center justify-between w-full py-2.5 px-2 -mx-2 rounded-lg border-b border-border last:border-0
                      hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors duration-150 cursor-pointer text-left group"
                  >
                    <div>
                      <p className="text-sm font-medium text-text group-hover:text-amber-700 transition-colors">
                        {product.name}
                      </p>
                      <p className="text-xs text-text-muted">{categoryMap.get(product.categoryId) ?? '-'}</p>
                    </div>
                    <span className="text-sm font-semibold text-danger">
                      {product.quantity} / {product.alertThreshold}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
