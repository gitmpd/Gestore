import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { Package, ArrowLeft, Search, TrendingDown, CheckCircle, ArrowRightLeft } from 'lucide-react';
import { db } from '@/db';

type StockFilter = 'all' | 'rupture' | 'low' | 'ok';

export function LowStockPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const allProducts = useLiveQuery(async () => {
    const products = (await db.products.toArray()).filter((p) => !p.deleted);
    return products.sort((a, b) => {
      const ratioA = a.alertThreshold > 0 ? a.quantity / a.alertThreshold : a.quantity > 0 ? 999 : 0;
      const ratioB = b.alertThreshold > 0 ? b.quantity / b.alertThreshold : b.quantity > 0 ? 999 : 0;
      return ratioA - ratioB;
    });
  }) ?? [];

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (filter === 'rupture' && p.quantity !== 0) return false;
      if (filter === 'low' && (p.quantity === 0 || p.quantity > p.alertThreshold)) return false;
      if (filter === 'ok' && p.quantity <= p.alertThreshold) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (categoryMap.get(p.categoryId) ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allProducts, search, filter, categoryMap]);

  const ruptureCount = allProducts.filter((p) => p.quantity === 0).length;
  const lowCount = allProducts.filter((p) => p.quantity > 0 && p.quantity <= p.alertThreshold).length;
  const okCount = allProducts.filter((p) => p.quantity > p.alertThreshold).length;

  function getStockLevel(qty: number, threshold: number) {
    if (qty === 0)
      return { label: 'Rupture', color: 'bg-red-500', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', barColor: 'bg-red-500' };
    if (qty <= threshold * 0.5)
      return { label: 'Critique', color: 'bg-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', barColor: 'bg-orange-500' };
    if (qty <= threshold)
      return { label: 'Bas', color: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-400', barColor: 'bg-amber-500' };
    if (qty <= threshold * 2)
      return { label: 'Correct', color: 'bg-blue-500', bg: 'bg-surface border-border', text: 'text-blue-600', barColor: 'bg-blue-500' };
    return { label: 'Bon', color: 'bg-emerald-500', bg: 'bg-surface border-border', text: 'text-emerald-600', barColor: 'bg-emerald-500' };
  }

  const filterButtons: { key: StockFilter; label: string; count: number }[] = [
    { key: 'all', label: 'Tous', count: allProducts.length },
    { key: 'rupture', label: 'Rupture', count: ruptureCount },
    { key: 'low', label: 'Stock bas', count: lowCount },
    { key: 'ok', label: 'Suffisant', count: okCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft size={20} className="text-text-muted" />
          </button>
          <div className="flex items-center gap-2">
            <Package size={24} className="text-primary" />
            <h1 className="text-2xl font-bold text-text">État des stocks</h1>
          </div>
        </div>
        <div className="flex gap-2 text-sm flex-wrap">
          {ruptureCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {ruptureCount} en rupture
            </span>
          )}
          {lowCount > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {lowCount} stock bas
            </span>
          )}
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {okCount} suffisant(s)
          </span>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Rechercher par nom ou catégorie..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {filterButtons.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                filter === f.key
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-text-muted hover:bg-slate-200'
              }`}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>
      </div>

      {filteredProducts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package size={48} className="text-slate-300 mb-3" />
          <p className="text-text-muted text-sm">
            {allProducts.length === 0
              ? 'Aucun produit enregistré'
              : 'Aucun produit ne correspond aux filtres'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((product) => {
            const level = getStockLevel(product.quantity, product.alertThreshold);
            const isLow = product.quantity <= product.alertThreshold;
            const maxRef = Math.max(product.alertThreshold * 2, product.quantity, 1);
            const pct = Math.min(100, (product.quantity / maxRef) * 100);

            return (
              <button
                key={product.id}
                onClick={() => navigate(`/stock?product=${product.id}`)}
                className={`rounded-xl border p-5 ${level.bg} transition-all duration-200 hover:shadow-lg hover:-translate-y-1 cursor-pointer text-left group`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-text truncate group-hover:text-primary transition-colors">{product.name}</h3>
                    <p className="text-xs text-text-muted mt-0.5">
                      {categoryMap.get(product.categoryId) ?? '—'}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full text-white ${level.color} shrink-0 ml-2`}>
                    {level.label}
                  </span>
                </div>

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-xs text-text-muted">En stock</p>
                    <p className={`text-3xl font-bold ${level.text}`}>{product.quantity}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-muted">Seuil d'alerte</p>
                    <p className="text-lg font-semibold text-text">{product.alertThreshold}</p>
                  </div>
                </div>

                <div className="mb-3">
                  <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${level.barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-black/5">
                  {isLow ? (
                    <div className="flex items-center gap-1 text-xs text-text-muted">
                      <TrendingDown size={12} />
                      <span>Manque {product.alertThreshold - product.quantity} unité(s)</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle size={12} />
                      <span>+{product.quantity - product.alertThreshold} au-dessus du seuil</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRightLeft size={12} />
                    <span>Mettre à jour</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
