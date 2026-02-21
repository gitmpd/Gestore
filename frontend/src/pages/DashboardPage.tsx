import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Package, Users, AlertTriangle, TrendingUp, ChevronRight } from 'lucide-react';
import { db } from '@/db';
import { Card, CardTitle } from '@/components/ui/Card';
import { formatCurrency } from '@/lib/utils';

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  onClick,
}: {
  icon: typeof Package;
  label: string;
  value: string | number;
  color: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 w-full text-left rounded-xl border border-border bg-surface p-6 shadow-sm
        transition-all duration-200 ease-out
        hover:shadow-lg hover:-translate-y-1 hover:border-primary/30
        active:translate-y-0 active:shadow-md
        cursor-pointer group"
    >
      <div className={`p-3 rounded-xl ${color} transition-transform duration-200 group-hover:scale-110`}>
        <Icon size={24} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-text-muted">{label}</p>
        <p className="text-2xl font-bold text-text">{value}</p>
      </div>
      <ChevronRight size={18} className="text-text-muted opacity-0 -translate-x-2 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0" />
    </button>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const productCount = useLiveQuery(async () => (await db.products.toArray()).filter((p) => !p.deleted).length) ?? 0;
  const customerCount = useLiveQuery(() => db.customers.count()) ?? 0;
  const lowStockCount = useLiveQuery(async () => {
    const products = (await db.products.toArray()).filter((p) => !p.deleted);
    return products.filter((p) => p.quantity <= p.alertThreshold).length;
  }) ?? 0;

  const todaySales = useLiveQuery(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const sales = (await db.sales
      .where('date')
      .startsWithIgnoreCase(today)
      .toArray()).filter((s) => !s.deleted);
    return sales.reduce((sum, s) => sum + s.total, 0);
  }) ?? 0;

  const recentSales = useLiveQuery(async () => {
    return (await db.sales.orderBy('date').reverse().limit(10).toArray()).filter((s) => !s.deleted);
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
      <h1 className="text-2xl font-bold text-text">Tableau de bord</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          label="Ventes du jour"
          value={formatCurrency(todaySales)}
          color="bg-primary"
          onClick={() => navigate('/sales')}
        />
        <StatCard
          icon={Package}
          label="Produits"
          value={productCount}
          color="bg-emerald-500"
          onClick={() => navigate('/products')}
        />
        <StatCard
          icon={Users}
          label="Clients"
          value={customerCount}
          color="bg-blue-500"
          onClick={() => navigate('/customers')}
        />
        <StatCard
          icon={AlertTriangle}
          label="Stock bas"
          value={lowStockCount}
          color={lowStockCount > 0 ? 'bg-amber-500' : 'bg-slate-400'}
          onClick={() => navigate('/low-stock')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="transition-all duration-200 hover:shadow-lg hover:border-primary/20">
          <div className="flex items-center justify-between mb-3">
            <CardTitle>Dernières ventes</CardTitle>
            <button
              onClick={() => navigate('/sales')}
              className="text-xs text-primary font-medium hover:underline flex items-center gap-0.5"
            >
              Voir tout <ChevronRight size={14} />
            </button>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-text-muted text-sm">Aucune vente enregistrée</p>
          ) : (
            <div className="space-y-1">
              {recentSales.map((sale) => (
                <button
                  key={sale.id}
                  onClick={() => navigate('/sales')}
                  className="flex items-center justify-between w-full py-2.5 px-2 -mx-2 rounded-lg border-b border-border last:border-0
                    hover:bg-primary/5 transition-colors duration-150 cursor-pointer text-left group"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text group-hover:text-primary transition-colors truncate">
                      Vente #{sale.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-text-muted truncate">
                      {new Date(sale.date).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <span className="font-semibold text-text shrink-0 whitespace-nowrap pl-3">
                    {formatCurrency(sale.total)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>

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
                    <p className="text-xs text-text-muted">{categoryMap.get(product.categoryId) ?? '—'}</p>
                  </div>
                  <span className="text-sm font-semibold text-danger">
                    {product.quantity} / {product.alertThreshold}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
