import { useState, useMemo, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2, ShoppingBag, Eye, XCircle, Search, ArrowLeft, Download, Printer } from 'lucide-react';
import { db } from '@/db';
import type { PaymentMethod, Sale, SaleItem as SaleItemType, SaleStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, generateReference, nowISO, formatCurrency, formatDateTime } from '@/lib/utils';
import { exportCSV } from '@/lib/export';
import { printReceipt } from '@/lib/receipt';
import { getShopNameOrDefault } from '@/lib/shop';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';

interface CartItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  maxStock: number;
}

const paymentLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  credit: 'Crédit',
  mobile: 'Mobile Money',
};

export function SalesPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isGerant = user?.role === 'gerant';
  const [modalOpen, setModalOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerId, setCustomerId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedItems, setSelectedItems] = useState<SaleItemType[]>([]);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);
  const [salesToCancel, setSalesToCancel] = useState<Sale[]>([]);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelAmount, setCancelAmount] = useState(0);

  const [saleSearch, setSaleSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const allProducts = useLiveQuery(() => db.products.orderBy('name').toArray()) ?? [];
  const saleProducts = allProducts.filter((p) => !p.usage || p.usage === 'vente' || p.usage === 'achat_vente');
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray()) ?? [];
  const users = useLiveQuery(() => db.users.toArray()) ?? [];
  const saleAuditMap = useLiveQuery(async () => {
    const logs = await db.auditLogs.where('entity').equals('vente').toArray();
    const map = new Map<string, string>();
    logs.forEach((log) => {
      if (log.action === 'vente' && log.entityId && !map.has(log.entityId)) {
        map.set(log.entityId, log.userName);
      }
    });
    return map;
  }) ?? new Map<string, string>();
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));
  const getSellerName = (sale: Sale) => {
    if (sale.userName?.trim()) return sale.userName;
    if (userMap.has(sale.userId)) return userMap.get(sale.userId) ?? '-';
    if (saleAuditMap.has(sale.id)) return saleAuditMap.get(sale.id) ?? '-';
    if (user?.id === sale.userId) return user.name;
    return '-';
  };

  const recentSales = useLiveQuery(async () => {
    const all = await db.sales.orderBy('date').reverse().limit(200).toArray();
    return all.filter((s) => !s.deleted);
  }) ?? [];

  const saleItemsMap = useLiveQuery(async () => {
  const items = await db.saleItems.toArray();
  const map = new Map<string, SaleItemType[]>();

  items.forEach((item) => {
    if (!map.has(item.saleId)) {
      map.set(item.saleId, []);
    }
    map.get(item.saleId)!.push(item);
  });

  return map;
}, []) ?? new Map();
  const filteredSales = useMemo(() => {
    return recentSales.filter((s) => {
      if (paymentFilter !== 'all' && s.paymentMethod !== paymentFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (dateFrom && s.date < dateFrom) return false;
      if (dateTo && s.date > dateTo + 'T23:59:59') return false;
      if (saleSearch) {
        const q = saleSearch.toLowerCase();
        const clientName = s.customerId ? customerMap.get(s.customerId)?.toLowerCase() ?? '' : '';
        const sellerName = getSellerName(s).toLowerCase();
        const productText = (saleItemsMap.get(s.id) ?? [])
          .map((item) => item.productName.toLowerCase())
          .join(' ');
        return (
          s.id.toLowerCase().includes(q) ||
          clientName.includes(q) ||
          sellerName.includes(q) ||
          productText.includes(q)
        );
      }
      return true;
    });
  }, [recentSales, saleSearch, paymentFilter, statusFilter, customerMap, userMap, saleItemsMap, dateFrom, dateTo]);

  const filteredProducts = saleProducts.filter(
    (p) =>
      p.quantity > 0 &&
      (p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
        (p.barcode && p.barcode.includes(productSearch)))
  );

  const total = cart.reduce((s, item) => s + item.quantity * item.unitPrice, 0);

  const addToCart = (productId: string) => {
    const product = saleProducts.find((p) => p.id === productId);
    if (!product) return;

    const existing = cart.find((c) => c.productId === productId);
    if (existing) {
      if (existing.quantity < product.quantity) {
        setCart(
          cart.map((c) =>
            c.productId === productId ? { ...c, quantity: c.quantity + 1 } : c
          )
        );
      }
    } else {
      setCart([
        ...cart,
        {
          productId: product.id,
          productName: product.name,
          quantity: 1,
          unitPrice: product.sellPrice,
          maxStock: product.quantity,
        },
      ]);
    }
  };

  const updateCartQuantity = (productId: string, qty: number) => {
    setCart(
      cart.map((c) =>
        c.productId === productId
          ? { ...c, quantity: Math.min(Math.max(0, qty), c.maxStock) }
          : c
      )
    );
  };

  const updateCartUnitPrice = (productId: string, unitPrice: number) => {
    setCart(
      cart.map((c) =>
        c.productId === productId
          ? { ...c, unitPrice: Math.max(0, unitPrice) }
          : c
      )
    );
  };

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !user) return;

    try {
      const now = nowISO();
      const saleId = generateReference();
      await db.transaction(
        'rw',
        [db.sales, db.saleItems, db.products, db.stockMovements, db.customers, db.creditTransactions],
        async () => {
          const productRecords = await Promise.all(cart.map((item) => db.products.get(item.productId)));
          const productMap = new Map(
            productRecords
              .filter((product): product is NonNullable<typeof product> => Boolean(product))
              .map((product) => [product.id, product])
          );

          for (const item of cart) {
            const product = productMap.get(item.productId);
            if (!product || product.deleted) {
              throw new Error(`Le produit "${item.productName}" est introuvable. Rechargez la liste puis recommencez.`);
            }
            if (item.quantity > product.quantity) {
              throw new Error(`Stock insuffisant pour "${product.name}" (${product.quantity} disponible(s)).`);
            }
          }

          await db.sales.add({
            id: saleId,
            userId: user.id,
            userName: user.name,
            customerId: customerId || undefined,
            date: now,
            total,
            paymentMethod,
            status: 'completed',
            createdAt: now,
            updatedAt: now,
            syncStatus: 'pending',
          });

          for (const item of cart) {
            const product = productMap.get(item.productId)!;

            await db.saleItems.add({
              id: generateId(),
              saleId,
              productId: item.productId,
              productName: item.productName,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              total: item.quantity * item.unitPrice,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            });

            await db.products.update(item.productId, {
              quantity: product.quantity - item.quantity,
              updatedAt: now,
              syncStatus: 'pending',
            });

            await db.stockMovements.add({
              id: generateId(),
              productId: item.productId,
              productName: item.productName,
              type: 'sortie',
              quantity: item.quantity,
              date: now,
              reason: `Vente #${saleId}`,
              userId: user.id,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            });
          }

          if (paymentMethod === 'credit' && customerId) {
            const customer = await db.customers.get(customerId);
            if (customer) {
              await db.customers.update(customerId, {
                creditBalance: customer.creditBalance + total,
                updatedAt: now,
                syncStatus: 'pending',
              });

              await db.creditTransactions.add({
                id: generateId(),
                customerId,
                saleId,
                amount: total,
                type: 'credit',
                date: now,
                note: `Vente #${saleId}`,
                createdAt: now,
                updatedAt: now,
                syncStatus: 'pending',
              });
            }
          }
        }
      );

      const itemsSummary = cart.map((i) => `${i.productName} x${i.quantity}`).join(', ');
      await logAction({
        action: 'vente',
        entity: 'vente',
        entityId: saleId,
        details: `${formatCurrency(total)} — ${paymentLabels[paymentMethod]} — ${itemsSummary}`,
      });

      setCart([]);
      setCustomerId('');
      setPaymentMethod('cash');
      setModalOpen(false);
      toast.success('Vente enregistrée avec succès');
    } catch (err) {
      toast.error('Erreur lors de l\'enregistrement : ' + (err as Error).message);
    }
  };

  const viewSaleDetails = async (sale: Sale) => {
    const items = (await db.saleItems.where('saleId').equals(sale.id).toArray()).filter((i) => !(i as any).deleted);
    setSelectedSale(sale);
    setSelectedItems(items);
    setDetailModalOpen(true);
  };

  const handleDeleteSale = (sale: Sale) => {
    openCancelSalesModal([sale]);
  };

  const openCancelSalesModal = (sales: Sale[]) => {
    const filtered = sales.filter((sale) => sale.status !== 'cancelled');
    setSalesToCancel(filtered);
    setCancelReason('');
    setCancelAmount(filtered.length === 1 ? filtered[0].total : filtered.reduce((sum, sale) => sum + sale.total, 0));
    setCancelModalOpen(true);
  };

  const cancelSales = async (sales: Sale[], reason: string, amountOverride?: number) => {
    if (!user || sales.length === 0) return;

    const now = nowISO();
    const normalizedReason = reason.trim();

    await db.transaction(
      'rw',
      [db.sales, db.saleItems, db.products, db.stockMovements, db.customers, db.creditTransactions],
      async () => {
        for (const sale of sales) {
          const effectiveAmount = sales.length === 1 && typeof amountOverride === 'number' ? Math.max(0, amountOverride) : sale.total;
          const items = (await db.saleItems.where('saleId').equals(sale.id).toArray()).filter((i) => !(i as any).deleted);

          for (const item of items) {
            const product = await db.products.get(item.productId);
            if (!product || product.deleted) continue;

            await db.products.update(item.productId, {
              quantity: product.quantity + item.quantity,
              updatedAt: now,
              syncStatus: 'pending',
            });

            await db.stockMovements.add({
              id: generateId(),
              productId: item.productId,
              productName: item.productName,
              type: 'retour',
              quantity: item.quantity,
              date: now,
              reason: normalizedReason ? `Annulation vente #${sale.id} - ${normalizedReason}` : `Annulation vente #${sale.id}`,
              userId: user.id,
              createdAt: now,
              updatedAt: now,
              syncStatus: 'pending',
            });
          }

          if (sale.paymentMethod === 'credit' && sale.customerId) {
            const customer = await db.customers.get(sale.customerId);
            const creditTxs = (await db.creditTransactions.where('saleId').equals(sale.id).toArray()).filter(
              (tx) => !tx.deleted && tx.type === 'credit'
            );

            for (const tx of creditTxs) {
              await db.creditTransactions.update(tx.id, {
                deleted: true,
                updatedAt: now,
                syncStatus: 'pending',
              });
            }

            if (customer) {
              await db.customers.update(sale.customerId, {
                creditBalance: Math.max(0, customer.creditBalance - effectiveAmount),
                updatedAt: now,
                syncStatus: 'pending',
              });
            }
          }

          await db.sales.update(sale.id, {
            total: effectiveAmount,
            status: 'cancelled',
            updatedAt: now,
            syncStatus: 'pending',
          });

          const itemsSummary = items.map((i) => `${i.productName} x${i.quantity}`).join(', ');
          await logAction({
            action: 'suppression',
            entity: 'vente',
            entityId: sale.id,
            entityName: `#${sale.id}`,
            details: `${formatCurrency(effectiveAmount)} - ${paymentLabels[sale.paymentMethod]} - ${itemsSummary}${normalizedReason ? ` - Motif: ${normalizedReason}` : ''}`,
          });
        }
      }
    );
  };

  const handleConfirmCancelSales = async () => {
    if (salesToCancel.length === 0) {
      setCancelModalOpen(false);
      return;
    }
    if (salesToCancel.length === 1 && cancelAmount < 0) {
      toast.error("Le montant d'annulation ne peut pas etre negatif");
      return;
    }

    const ok = await confirmAction({
      title: salesToCancel.length === 1 ? 'Annuler la vente' : 'Annuler les ventes',
      message:
        salesToCancel.length === 1
          ? `Voulez-vous vraiment annuler la vente #${salesToCancel[0].id} ? Le stock sera remis en place.`
          : `Voulez-vous vraiment annuler ${salesToCancel.length} vente(s) ? Le stock sera remis en place.`,
      confirmLabel: 'Confirmer',
      variant: 'danger',
    });
    if (!ok) return;

    const loadingToast = toast.loading('Annulation en cours...');
    try {
      await cancelSales(salesToCancel, cancelReason, cancelAmount);
      setCancelModalOpen(false);
      setCancelReason('');
      setCancelAmount(0);
      setSalesToCancel([]);
      setSelectedSaleIds([]);
      toast.dismiss(loadingToast);
      toast.success(salesToCancel.length === 1 ? 'Vente annulée' : 'Ventes annulées');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Erreur lors de l\'annulation : ' + (error as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Ventes</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = filteredSales.map((s) => [
                s.id,
                new Date(s.date).toLocaleDateString('fr-FR'),
                formatCurrency(s.total),
                s.paymentMethod,
                s.status === 'completed' ? 'Terminée' : 'Annulée',
              ]);
              exportCSV('ventes', ['Réf.', 'Date', 'Total', 'Paiement', 'Statut'], rows);
              toast.success('Export CSV téléchargé');
            }}
            disabled={filteredSales.length === 0}
          >
            <Download size={16} /> CSV
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <ShoppingBag size={18} /> Nouvelle vente
          </Button>
          {selectedSaleIds.length > 0 && (
            <Button
              variant="danger"
              onClick={() => openCancelSalesModal(filteredSales.filter((s) => selectedSaleIds.includes(s.id)))}
            >
              <Trash2 size={16} /> Annuler
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Rechercher par réf., client ou vendeur..."
            value={saleSearch}
            onChange={(e) => setSaleSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value as PaymentMethod | 'all')}
        >
          <option value="all">Tous les paiements</option>
          <option value="cash">Espèces</option>
          <option value="mobile">Mobile Money</option>
          <option value="credit">Crédit</option>
        </select>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SaleStatus | 'all')}
        >
          <option value="all">Tous les statuts</option>
          <option value="completed">Terminée</option>
          <option value="cancelled">Annulée</option>
        </select>
        <input
          type="date"
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="Date debut"
        />
        <input
          type="date"
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="Date fin"
        />
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              <Th>
                <input
                  type="checkbox"
                  checked={filteredSales.length > 0 && selectedSaleIds.length === filteredSales.length}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedSaleIds(filteredSales.map((s) => s.id));
                    else setSelectedSaleIds([]);
                  }}
                />
              </Th>
              <Th>Produits</Th>
              <Th>Date</Th>
              {isGerant && <Th>Vendeur</Th>}
              <Th>Client</Th>
              <Th>Montant</Th>
              <Th>Paiement</Th>
              <Th>Statut</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filteredSales.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 8 : 7} className="text-center text-text-muted py-8">
                  {recentSales.length === 0 ? 'Aucune vente enregistrée' : 'Aucune vente ne correspond aux filtres'}
                </Td>
              </Tr>
            ) : (
              filteredSales.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selectedSaleIds.includes(s.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSaleIds((r) => [...r, s.id]);
                        else setSelectedSaleIds((r) => r.filter((id) => id !== s.id));
                      }}
                    />
                  </Td>
                  <Td className="text-sm">
                    <div className="space-y-1">
                      {(() => {
                        const items = saleItemsMap.get(s.id) ?? [];
                        if (items.length === 0) {
                          return <span className="text-text-muted">-</span>;
                        }
                        return items.slice(0, 3).map((i: SaleItemType) => (
                          <div key={i.id} className="leading-tight">
                            <span className="font-medium">{i.productName}</span>
                            <span className="text-text-muted"> x{i.quantity}</span>
                          </div>
                        ));
                      })()}
                      {(() => {
                        const items = saleItemsMap.get(s.id) ?? [];
                        return items.length > 3 ? <div className="text-xs text-text-muted">+{items.length - 3} autre(s)</div> : null;
                      })()}
                    </div>
                  </Td>

                  <Td className="text-text-muted">{formatDateTime(s.date)}</Td>
                  {isGerant && (
                    <Td className="text-sm">{getSellerName(s)}</Td>
                  )}
                  <Td>{s.customerId ? customerMap.get(s.customerId) ?? '—' : '—'}</Td>
                  <Td className="font-semibold">{formatCurrency(s.total)}</Td>
                  <Td>
                    <Badge variant={s.paymentMethod === 'credit' ? 'warning' : 'default'}>
                      {paymentLabels[s.paymentMethod]}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge variant={s.status === 'completed' ? 'success' : 'danger'}>
                      {s.status === 'completed' ? 'Terminée' : 'Annulée'}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => viewSaleDetails(s)}
                        className="p-1.5 rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 text-primary"
                        title="Voir le détail"
                      >
                        <Eye size={16} />
                      </button>
                      {s.status === 'completed' && (
                        <button
                          onClick={() => handleDeleteSale(s)}
                          className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-danger"
                          title="Annuler"
                        >
                          <XCircle size={16} />
                        </button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouvelle vente"
        className="max-w-2xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label className="text-sm font-medium text-text mb-1 block">Ajouter un produit</label>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm focus-within:ring-2 focus-within:ring-primary/30 focus-within:border-primary transition-colors">
              <Search size={14} className="text-text-muted shrink-0" />
              <input
                type="text"
                className="flex-1 bg-transparent outline-none text-text placeholder:text-text-muted min-w-0"
                placeholder="Rechercher par nom ou code-barres..."
                value={productSearch}
                onChange={(e) => { setProductSearch(e.target.value); setProductDropdownOpen(true); }}
                onFocus={() => setProductDropdownOpen(true)}
                onBlur={() => setTimeout(() => setProductDropdownOpen(false), 150)}
              />
            </div>
            {productDropdownOpen && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg divide-y divide-border/50">
                {filteredProducts.length > 0 ? (
                  filteredProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        addToCart(p.id);
                        setProductSearch('');
                        setProductDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 hover:bg-primary/10 text-sm text-text text-left transition-colors"
                    >
                      <span>{p.name}</span>
                      <span className="text-xs text-text-muted">
                        {formatCurrency(p.sellPrice)} · Stock: {p.quantity}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-sm text-text-muted">Aucun produit trouvé</p>
                )}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-text">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left">Produit</th>
                    <th className="px-3 py-2 text-center w-24">Qté</th>
                    <th className="px-3 py-2 text-right">Prix</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cart.map((item) => (
                    <tr key={item.productId}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="number"
                          min={0}
                          max={item.maxStock}
                          value={item.quantity}
                          onChange={(e) =>
                            updateCartQuantity(item.productId, Number(e.target.value) || 0)
                          }
                          className="w-16 text-center rounded border border-border bg-surface text-text px-1 py-0.5"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateCartUnitPrice(item.productId, Number(e.target.value) || 0) } className="w-24 text-right rounded border border-border bg-surface text-text px-1 py-0.5"/>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {formatCurrency(item.quantity * item.unitPrice)}
                      </td>
                      <td className="px-1">
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.productId)}
                          className="p-1 text-danger hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold">
                      Total
                    </td>
                    <td className="px-3 py-2 text-right text-lg font-bold text-primary">
                      {formatCurrency(total)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text">Mode de paiement</label>
              <select
                className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">Espèces</option>
                <option value="mobile">Mobile Money</option>
                <option value="credit">Crédit</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-text">Client (optionnel)</label>
              <select
                className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">— Aucun —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={cart.length === 0 || cart.some((c) => c.quantity <= 0)}>
              Valider la vente ({formatCurrency(total)})
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Vente #${selectedSale?.id ?? ''}`}
        className="max-w-lg"
      >
        {selectedSale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-text-muted">Date</p>
                <p className="font-medium text-text">{formatDateTime(selectedSale.date)}</p>
              </div>
              <div>
                <p className="text-text-muted">Paiement</p>
                <p className="font-medium text-text">{paymentLabels[selectedSale.paymentMethod]}</p>
              </div>
              <div>
                <p className="text-text-muted">Client</p>
                <p className="font-medium text-text">
                  {selectedSale.customerId ? customerMap.get(selectedSale.customerId) ?? '—' : 'Anonyme'}
                </p>
              </div>
              <div>
                <p className="text-text-muted">Statut</p>
                <Badge variant={selectedSale.status === 'completed' ? 'success' : 'danger'}>
                  {selectedSale.status === 'completed' ? 'Terminée' : 'Annulée'}
                </Badge>
              </div>
              {isGerant && (
                <div>
                  <p className="text-text-muted">Vendeur</p>
                  <p className="font-medium text-text">{getSellerName(selectedSale)}</p>
                </div>
              )}
            </div>

            <div className="border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm text-text">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left">Produit</th>
                    <th className="px-3 py-2 text-center">Qté</th>
                    <th className="px-3 py-2 text-right">Prix unit.</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {selectedItems.map((item) => (
                    <tr key={item.id}>
                      <td className="px-3 py-2">{item.productName}</td>
                      <td className="px-3 py-2 text-center">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-slate-50 dark:bg-slate-800">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-semibold">Total</td>
                    <td className="px-3 py-2 text-right text-lg font-bold text-primary">
                      {formatCurrency(selectedSale.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  printReceipt({
                    saleId: selectedSale.id,
                    date: selectedSale.date,
                    items: selectedItems,
                    total: selectedSale.total,
                    paymentMethod: paymentLabels[selectedSale.paymentMethod],
                    customerName: selectedSale.customerId
                      ? customerMap.get(selectedSale.customerId)
                      : undefined,
                    vendorName: userMap.get(selectedSale.userId),
                    shopName: getShopNameOrDefault(),
                  });
                }}
              >
                <Printer size={16} /> Imprimer le reçu
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title={salesToCancel.length > 1 ? 'Annuler les ventes' : `Annuler la vente #${salesToCancel[0]?.id ?? ''}`}
        className="max-w-lg"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-muted">
            L'annulation remettra le stock en place et corrigera le crédit client si la vente était à crédit.
          </p>

          <div className="rounded-lg border border-border bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-text">
            <p className="font-medium mb-1">Produits concernes</p>
            <div className="space-y-1 text-text-muted">
              {salesToCancel.length === 0 ? (
                <p>-</p>
              ) : salesToCancel.length === 1 ? (
                (saleItemsMap.get(salesToCancel[0].id) ?? []).length > 0 ? (
                  (saleItemsMap.get(salesToCancel[0].id) ?? []).map((item) => (
                    <p key={item.id}>
                      {item.productName} x{item.quantity}
                    </p>
                  ))
                ) : (
                  <p>-</p>
                )
              ) : (
                salesToCancel.map((sale) => {
                  const items = saleItemsMap.get(sale.id) ?? [];
                  const names = items.map((item) => item.productName).slice(0, 2).join(', ');
                  return (
                    <p key={sale.id}>
                      #{sale.id}: {names || '-'}{items.length > 2 ? '...' : ''}
                    </p>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cancelAmount" className="text-sm font-medium text-text">
              Montant a annuler
            </label>
            <input
              id="cancelAmount"
              type="number"
              min={0}
              step="0.01"
              value={cancelAmount}
              onChange={(e) => setCancelAmount(Number(e.target.value) || 0)}
              disabled={salesToCancel.length > 1}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-60"
            />
            {salesToCancel.length > 1 && (
              <p className="text-xs text-text-muted">
                La modification du montant est disponible pour une annulation unitaire.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="cancelReason" className="text-sm font-medium text-text">
              Motif d'annulation (optionnel)
            </label>
            <textarea
              id="cancelReason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Ex : erreur de saisie, vente doublonnée..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCancelModalOpen(false)}>
              Fermer
            </Button>
            <Button variant="danger" type="button" onClick={handleConfirmCancelSales}>
              Confirmer l'annulation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
