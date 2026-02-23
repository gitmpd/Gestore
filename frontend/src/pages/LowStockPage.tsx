import { useState, useMemo, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Package, ArrowLeft, Search, TrendingDown, CheckCircle, ArrowRightLeft } from 'lucide-react';
import { db } from '@/db';
import type { Product } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO } from '@/lib/utils';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

type StockFilter = 'all' | 'rupture' | 'low' | 'ok';

export function LowStockPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StockFilter>('all');
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [reorderModalOpen, setReorderModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [orderQty, setOrderQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [receiveNow, setReceiveNow] = useState(false);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'credit'>('cash');

  const categories = useLiveQuery(() => db.categories.toArray()) ?? [];
  const suppliers = useLiveQuery(async () => (await db.suppliers.toArray()).filter((s) => !s.deleted)) ?? [];
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

  const openMethodModal = (product: Product) => {
    setSelectedProduct(product);
    setMethodModalOpen(true);
  };

  const openReorderModal = (product: Product) => {
    setSelectedProduct(product);
    setSupplierId(suppliers[0]?.id ?? '');
    setOrderQty(Math.max(1, product.alertThreshold - product.quantity));
    setUnitPrice(product.buyPrice ?? 0);
    setReceiveNow(false);
    setPaymentMode('cash');
    setReorderModalOpen(true);
  };

  const handleChooseSupplierOrder = () => {
    if (!selectedProduct) return;
    setMethodModalOpen(false);
    openReorderModal(selectedProduct);
  };

  const handleChooseManualStockMovement = () => {
    if (!selectedProduct) return;
    setMethodModalOpen(false);
    navigate(`/stock?product=${selectedProduct.id}`);
  };

  const handleCreateSupplierOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedProduct || orderQty <= 0 || unitPrice < 0) {
      toast.error('Vérifie les données de la commande');
      return;
    }
    const now = nowISO();
    const total = orderQty * unitPrice;

    let finalSupplierId = supplierId;
    if (!finalSupplierId) {
      const unknown = suppliers.find((s) => s.name.toLowerCase() === 'fournisseur inconnu');
      if (unknown) {
        finalSupplierId = unknown.id;
      } else {
        finalSupplierId = generateId();
        await db.suppliers.add({
          id: finalSupplierId,
          name: 'Fournisseur inconnu',
          phone: '-',
          address: '-',
          creditBalance: 0,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }
    }

    const orderId = generateId();
    await db.supplierOrders.add({
      id: orderId,
      supplierId: finalSupplierId,
      date: now,
      total,
      status: receiveNow ? 'recue' : 'en_attente',
      isCredit: receiveNow ? paymentMode === 'credit' : false,
      userId: currentUser?.id,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    await db.orderItems.add({
      id: generateId(),
      orderId,
      productId: selectedProduct.id,
      productName: selectedProduct.name,
      quantity: orderQty,
      unitPrice,
      total,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    if (receiveNow) {
      await db.products.update(selectedProduct.id, {
        quantity: selectedProduct.quantity + orderQty,
        buyPrice: unitPrice,
        updatedAt: now,
        syncStatus: 'pending',
      });

      await db.stockMovements.add({
        id: generateId(),
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: 'entree',
        quantity: orderQty,
        date: now,
        reason: `Réception commande fournisseur #${orderId.slice(0, 8)}`,
        userId: currentUser?.id,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });

      await db.supplierCreditTransactions.add({
        id: generateId(),
        supplierId: finalSupplierId,
        orderId,
        amount: total,
        type: paymentMode === 'credit' ? 'credit' : 'payment',
        date: now,
        note: paymentMode === 'credit' ? 'Commande reçue à crédit' : 'Commande payée',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });

      if (paymentMode === 'credit') {
        const supplier = await db.suppliers.get(finalSupplierId);
        if (supplier) {
          await db.suppliers.update(finalSupplierId, {
            creditBalance: (supplier.creditBalance ?? 0) + total,
            updatedAt: now,
            syncStatus: 'pending',
          });
        }
      }
    }

    setReorderModalOpen(false);
    toast.success(receiveNow ? 'Commande enregistrée et stock mis à jour' : 'Commande fournisseur enregistrée');
  };

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
                onClick={() => openMethodModal(product)}
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

      <Modal
        open={methodModalOpen}
        onClose={() => setMethodModalOpen(false)}
        title={`Approvisionnement: ${selectedProduct?.name ?? ''}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            Choisissez la methode d'approvisionnement pour ce produit.
          </p>

          <button
            type="button"
            onClick={handleChooseSupplierOrder}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <p className="text-sm font-semibold text-text">Commande fournisseur</p>
            <p className="text-xs text-text-muted mt-0.5">
              Creer une commande d'achat (en attente ou recue immediatement).
            </p>
          </button>

          <button
            type="button"
            onClick={handleChooseManualStockMovement}
            className="w-full rounded-lg border border-border bg-surface px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <p className="text-sm font-semibold text-text">Retour client et ajustement</p>
            <p className="text-xs text-text-muted mt-0.5">
              Ouvrir le formulaire des mouvements de stock.
            </p>
          </button>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" type="button" onClick={() => setMethodModalOpen(false)}>
              Fermer
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={reorderModalOpen}
        onClose={() => setReorderModalOpen(false)}
        title={`Commander: ${selectedProduct?.name ?? ''}`}
      >
        <form onSubmit={handleCreateSupplierOrder} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Fournisseur</label>
            <select
              className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Fournisseur inconnu</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text">Quantité</label>
              <input
                type="number"
                min={1}
                className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
                value={orderQty}
                onChange={(e) => setOrderQty(Number(e.target.value) || 0)}
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text">Prix unitaire achat</label>
              <input
                type="number"
                min={0}
                className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value) || 0)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text">Traitement</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setReceiveNow(false)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  !receiveNow ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted'
                }`}
              >
                En attente
              </button>
              <button
                type="button"
                onClick={() => setReceiveNow(true)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                  receiveNow ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-muted'
                }`}
              >
                Reçue maintenant
              </button>
            </div>
          </div>

          {receiveNow && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-text">Paiement fournisseur</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    paymentMode === 'cash' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-border text-text-muted'
                  }`}
                >
                  Payée
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('credit')}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                    paymentMode === 'credit' ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-border text-text-muted'
                  }`}
                >
                  À crédit
                </button>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setReorderModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer commande</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
