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
import { generateId, nowISO, formatCurrency, formatDateTime } from '@/lib/utils';
import { exportCSV } from '@/lib/export';
import { printReceipt } from '@/lib/receipt';
import { logAction } from '@/services/auditService';
import { trackDeletion } from '@/services/syncService';
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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [customerId, setCustomerId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedItems, setSelectedItems] = useState<SaleItemType[]>([]);
  const [selectedSaleIds, setSelectedSaleIds] = useState<string[]>([]);

  const [saleSearch, setSaleSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<PaymentMethod | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all');

  const allProducts = useLiveQuery(() => db.products.orderBy('name').toArray()) ?? [];
  const saleProducts = allProducts.filter((p) => !p.usage || p.usage === 'vente' || p.usage === 'achat_vente');
  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray()) ?? [];
  const users = useLiveQuery(() => db.users.toArray()) ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const recentSales = useLiveQuery(async () => {
    const all = await db.sales.orderBy('date').reverse().limit(200).toArray();
    return all.filter((s) => !s.deleted);
  }) ?? [];

  const filteredSales = useMemo(() => {
    return recentSales.filter((s) => {
      if (paymentFilter !== 'all' && s.paymentMethod !== paymentFilter) return false;
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (saleSearch) {
        const q = saleSearch.toLowerCase();
        const clientName = s.customerId ? customerMap.get(s.customerId)?.toLowerCase() ?? '' : '';
        const sellerName = userMap.get(s.userId)?.toLowerCase() ?? '';
        return (
          s.id.toLowerCase().includes(q) ||
          clientName.includes(q) ||
          sellerName.includes(q)
        );
      }
      return true;
    });
  }, [recentSales, saleSearch, paymentFilter, statusFilter, customerMap, userMap]);

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

  const removeFromCart = (productId: string) => {
    setCart(cart.filter((c) => c.productId !== productId));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (cart.length === 0 || !user) return;

    try {
      const now = nowISO();
      const saleId = generateId();

      await db.sales.add({
        id: saleId,
        userId: user.id,
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

        const product = await db.products.get(item.productId);
        if (product) {
          await db.products.update(item.productId, {
            quantity: Math.max(0, product.quantity - item.quantity),
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
            reason: `Vente #${saleId.slice(0, 8)}`,
            userId: user.id,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'pending',
          });
        }
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
            note: `Vente #${saleId.slice(0, 8)}`,
            createdAt: now,
            updatedAt: now,
            syncStatus: 'pending',
          });
        }
      }

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

  const handleDeleteSale = async (sale: Sale) => {
    const ok = await confirmAction({
      title: 'Supprimer la vente',
      message: `Voulez-vous vraiment supprimer la vente #${sale.id.slice(0, 8)} de ${formatCurrency(sale.total)} ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    const now = nowISO();
    await db.sales.update(sale.id, {
      deleted: true,
      status: 'cancelled',
      updatedAt: now,
      syncStatus: 'pending',
    });

    const items = (await db.saleItems.where('saleId').equals(sale.id).toArray()).filter((i) => !(i as any).deleted);
    const itemsSummary = items.map((i) => `${i.productName} x${i.quantity}`).join(', ');

    await logAction({
      action: 'suppression',
      entity: 'vente',
      entityId: sale.id,
      entityName: `#${sale.id.slice(0, 8)}`,
      details: `${formatCurrency(sale.total)} — ${paymentLabels[sale.paymentMethod]} — ${itemsSummary}`,
    });
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
                s.id.slice(0, 8),
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
          {isGerant && selectedSaleIds.length > 0 && (
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirmAction({
                  title: 'Supprimer les ventes sélectionnées',
                  message: `Voulez-vous annuler et supprimer ${selectedSaleIds.length} vente(s) sélectionnée(s) ? Cette action est logique (marque 'deleted').`,
                  confirmLabel: 'Supprimer',
                  variant: 'danger',
                });
                if (!ok) return;
                const now = nowISO();
                const ids: string[] = [];
                for (const id of selectedSaleIds) {
                  const s = await db.sales.get(id);
                  if (!s) continue;
                  ids.push(id);
                  await db.sales.update(id, { deleted: true, status: 'cancelled', updatedAt: now, syncStatus: 'pending' });
                  const itemIds = await db.saleItems.where('saleId').equals(id).primaryKeys();
                  for (const itemId of itemIds) {
                    await trackDeletion('saleItems', itemId as string);
                  }
                  await trackDeletion('sales', id);
                }
                await logAction({ action: 'suppression', entity: 'vente', details: `Suppression multiple: ${ids.join(', ')}` });
                setSelectedSaleIds([]);
                toast.success('Ventes supprimées');
              }}
            >
              <Trash2 size={16} /> Supprimer
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
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              {isGerant && (
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
              )}
              <Th>Réf.</Th>
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
                <Td colSpan={isGerant ? 9 : 7} className="text-center text-text-muted py-8">
                  {recentSales.length === 0 ? 'Aucune vente enregistrée' : 'Aucune vente ne correspond aux filtres'}
                </Td>
              </Tr>
            ) : (
              filteredSales.map((s) => (
                <Tr key={s.id}>
                  {isGerant && (
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
                  )}
                  <Td className="font-mono text-sm">#{s.id.slice(0, 8)}</Td>
                  <Td className="text-text-muted">{formatDateTime(s.date)}</Td>
                  {isGerant && (
                    <Td className="text-sm">{userMap.get(s.userId) ?? '—'}</Td>
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
                      {isGerant && s.status === 'completed' && (
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
                      <td className="px-3 py-2 text-right">{formatCurrency(item.unitPrice)}</td>
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
        title={`Vente #${selectedSale?.id.slice(0, 8) ?? ''}`}
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
                  <p className="font-medium text-text">{userMap.get(selectedSale.userId) ?? '—'}</p>
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
                    shopName: localStorage.getItem('shop_name') || undefined,
                  });
                }}
              >
                <Printer size={16} /> Imprimer le reçu
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
