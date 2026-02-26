import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Trash2, PackageCheck, XCircle, Eye, ArrowLeft, CreditCard } from 'lucide-react';
import { db } from '@/db';
import type { OrderStatus, SupplierOrder } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input'; // pour le depot
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ComboBox } from '@/components/ui/ComboBox';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO, formatCurrency, formatDate, generateSupplierOrderRef } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';

const statusLabels: Record<OrderStatus, string> = {
  en_attente: 'En attente',
  recue: 'Recue',
  annulee: 'Annulée',
};

const statusVariants: Record<OrderStatus, 'warning' | 'success' | 'danger'> = {
  en_attente: 'warning',
  recue: 'success',
  annulee: 'danger',
};

interface SupplierOrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export function SupplierOrdersPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [creditFilter, setCreditFilter] = useState<'all' | 'credit' | 'paid'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);

  const [supplierId, setSupplierId] = useState('');
  const [orderLines, setOrderLines] = useState<SupplierOrderLine[]>([]);

  const [detailOrder, setDetailOrder] = useState<(SupplierOrder & { supplierName: string }) | null>(null);
  const [detailItems, setDetailItems] = useState<{ productName: string; quantity: number; unitPrice: number; total: number }[]>([]);

  const [receiveOrderData, setReceiveOrderData] = useState<(SupplierOrder & { supplierName: string }) | null>(null);
  const [deposit, setDeposit] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'partial' | 'credit'>('cash');

  const suppliers = useLiveQuery(async () => (await db.suppliers.orderBy('name').toArray()).filter((s) => !s.deleted)) ?? [];
  const allProducts = useLiveQuery(async () => (await db.products.orderBy('name').toArray()).filter((p) => !p.deleted)) ?? [];
  const purchaseProducts = allProducts.filter((p) => !p.usage || p.usage === 'achat' || p.usage === 'achat_vente');
  const allUsers = useLiveQuery(async () => (await db.users.toArray()).filter((u) => !u.deleted)) ?? [];
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const orders = useLiveQuery(async () => {
    const all = await db.supplierOrders.orderBy('date').reverse().toArray();
    const supplierMap = new Map((await db.suppliers.toArray()).map((s) => [s.id, s.name]));
    return all.map((o) => ({ ...o, supplierName: supplierMap.get(o.supplierId) || '—' }));
  }) ?? [];

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (creditFilter === 'credit' && !(o.status === 'recue' && o.isCredit)) return false;
    if (creditFilter === 'paid' && !(o.status === 'recue' && !o.isCredit)) return false;
    if (dateFrom && o.date < dateFrom) return false;
    if (dateTo && o.date > dateTo + 'T23:59:59') return false;
    if (search) {
      const q = search.toLowerCase();
      return o.id.toLowerCase().includes(q) || o.supplierName.toLowerCase().includes(q);
    }
    return true;
  });

  const orderTotal = orderLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

  const openCreate = () => {
    setSupplierId('');
    setOrderLines([]);
    setCreateModalOpen(true);
  };

  const addLine = () => {
    setOrderLines([...orderLines, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  };

  const updateLine = (index: number, field: string, value: string | number) => {
    const updated = [...orderLines];
    if (field === 'productId') {
      const product = allProducts.find((p) => p.id === value);
      updated[index] = {
        ...updated[index],
        productId: value as string,
        productName: product?.name ?? '',
        unitPrice: product?.buyPrice ?? 0,
      };
    } else {
      (updated[index] as unknown as Record<string, unknown>)[field] = value;
    }
    setOrderLines(updated);
  };

  const removeLine = (index: number) => {
    setOrderLines(orderLines.filter((_, i) => i !== index));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!supplierId || orderLines.length === 0 || !user) return;

    const now = nowISO();
    const orderId = generateSupplierOrderRef();
    const total = orderLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

    await db.supplierOrders.add({
      id: orderId,
      supplierId,
      date: now,
      total,
      deposit: 0,
      status: 'en_attente',
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    for (const line of orderLines) {
      await db.orderItems.add({
        id: generateId(),
        orderId,
        productId: line.productId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        total: line.quantity * line.unitPrice,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
    }

    const supplier = suppliers.find((s) => s.id === supplierId);
    await logAction({
      action: 'creation_commande',
      entity: 'commande',
      entityId: orderId,
      entityName: supplier?.name,
      details: `${orderLines.length} article(s) - ${formatCurrency(total)}`,
    });

    setCreateModalOpen(false);
    toast.success('Commande fournisseur créée');
  };

  const openReceive = (order: SupplierOrder & { supplierName: string }) => {
    setReceiveOrderData(order);
    setDeposit(0);
    setPaymentMode('cash');
    setReceiveModalOpen(true);
  };

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!receiveOrderData || !user) return;
    
    const order = receiveOrderData;
    const now = nowISO();
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();

    // Calculer le montant payé et le reste
    const amountPaid = paymentMode === 'credit' ? 0 : (paymentMode === 'partial' ? deposit : order.total);
    const remaining = order.total - amountPaid;

    for (const item of items) {
      const product = await db.products.get(item.productId);
      if (!product) continue;

      const buyPriceChanged = product.buyPrice !== item.unitPrice;
      await db.products.update(item.productId, {
        quantity: product.quantity + item.quantity,
        buyPrice: item.unitPrice,
        updatedAt: now,
        syncStatus: 'pending',
      });

      if (buyPriceChanged) {
        await db.priceHistory.add({
          id: generateId(),
          productId: item.productId,
          oldBuyPrice: product.buyPrice,
          newBuyPrice: item.unitPrice,
          oldSellPrice: product.sellPrice,
          newSellPrice: product.sellPrice,
          userId: user.id,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }

      await db.stockMovements.add({
        id: generateId(),
        productId: item.productId,
        productName: item.productName,
        type: 'entree',
        quantity: item.quantity,
        date: now,
        reason: `Reception commande fournisseur #${order.id.slice(0, 8)}`,
        userId: user.id,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
    }

    await db.supplierOrders.update(order.id, {
      status: 'recue',
      deposit: amountPaid,
      updatedAt: now,
      syncStatus: 'pending',
    });

    // Créer les transactions appropriées
    if (amountPaid > 0) {
      // Transaction de paiement pour le montant payé
      await db.supplierCreditTransactions.add({
        id: generateId(),
        supplierId: order.supplierId,
        orderId: order.id,
        amount: amountPaid,
        type: 'payment',
        date: now,
        note: `Commande #${order.id.slice(0, 8)} - Paiement${paymentMode === 'partial' ? ' partiel' : ''}`,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
    }

    if (remaining > 0) {
      // Transaction de crédit pour le reste
      const supplier = await db.suppliers.get(order.supplierId);
      if (supplier) {
        await db.suppliers.update(order.supplierId, {
          creditBalance: (supplier.creditBalance ?? 0) + remaining,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }

      await db.supplierCreditTransactions.add({
        id: generateId(),
        supplierId: order.supplierId,
        orderId: order.id,
        amount: remaining,
        type: 'credit',
        date: now,
        note: `Commande #${order.id.slice(0, 8)} - ${paymentMode === 'partial' ? 'Reste après acompte' : 'Credit fournisseur'}`,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
    }

    await logAction({
      action: 'reception_commande',
      entity: 'commande',
      entityId: order.id,
      entityName: order.supplierName,
      details: `Commande #${order.id.slice(0, 8)} - ${formatCurrency(order.total)}${amountPaid > 0 ? ` - Payé: ${formatCurrency(amountPaid)}` : ''}${remaining > 0 ? ` - Reste: ${formatCurrency(remaining)}` : ''}`,
    });

    setReceiveModalOpen(false);
    toast.success(
      remaining === 0 
        ? 'Commande recue et payée' 
        : amountPaid > 0 
        ? 'Commande recue avec paiement partiel' 
        : 'Commande recue a credit'
    );
  };

  const handleCancel = async (order: SupplierOrder & { supplierName: string }) => {
    const ok = await confirmAction({
      title: 'Annuler la commande',
      message: `Annuler la commande #${order.id.slice(0, 8)} ?`,
      confirmLabel: 'Annuler la commande',
      variant: 'danger',
    });
    if (!ok) return;

    const now = nowISO();
    await db.supplierOrders.update(order.id, {
      status: 'annulee',
      updatedAt: now,
      syncStatus: 'pending',
    });

    await logAction({
      action: 'annulation_commande',
      entity: 'commande',
      entityId: order.id,
      entityName: order.supplierName,
      details: `Commande #${order.id.slice(0, 8)} - ${formatCurrency(order.total)}`,
    });
  };

  const openDetail = async (order: SupplierOrder & { supplierName: string }) => {
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();
    setDetailOrder(order);
    setDetailItems(items.map((i) => ({
      productName: i.productName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      total: i.total,
    })));
    setDetailModalOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Commandes fournisseurs</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus size={18} /> Nouvelle commande
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Rechercher par n° ou fournisseur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'en_attente', 'recue', 'annulee'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 text-text-muted hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'Toutes' : statusLabels[s]}
            </button>
          ))}
        </div>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={creditFilter}
          onChange={(e) => setCreditFilter(e.target.value as 'all' | 'credit' | 'paid')}
          title="Filtre credit"
        >
          <option value="all">Tous paiements</option>
          <option value="credit">Crédit</option>
          <option value="paid">Payées</option>
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
              <Th>N°</Th>
              <Th>Fournisseur</Th>
              <Th>Crée par</Th>
              <Th>Date</Th>
              <Th>Total</Th>
              <Th>Statut</Th>
              <Th>Paiement</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filteredOrders.length === 0 ? (
              <Tr>
                <Td colSpan={8} className="text-center text-text-muted py-8">
                  Aucune commande trouvée
                </Td>
              </Tr>
            ) : (
              filteredOrders.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-mono text-xs">#{o.id.slice(0, 8)}</Td>
                  <Td className="font-medium">{o.supplierName}</Td>
                  <Td className="text-sm">{o.userId ? userMap.get(o.userId) ?? '—' : '—'}</Td>
                  <Td className="text-text-muted">{formatDate(o.date)}</Td>
                  <Td className="font-semibold">{formatCurrency(o.total)}</Td>
                  <Td>
                    <Badge variant={statusVariants[o.status]}>{statusLabels[o.status]}</Badge>
                  </Td>
                  <Td>
                    {o.status === 'recue'
                      ? (o.isCredit ? 'Credit' : 'Payée')
                      : '—'}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openDetail(o)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                        title="Details"
                      >
                        <Eye size={16} className="text-text-muted" />
                      </button>
                      {o.status === 'en_attente' && (
                        <>
                          <button
                            onClick={() => openReceive(o)}
                            className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                            title="Recevoir la commande"
                          >
                            <PackageCheck size={16} />
                          </button>
                          <button
                            onClick={() => handleCancel(o)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                            title="Annuler"
                          >
                            <XCircle size={16} className="text-danger" />
                          </button>
                        </>
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
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Nouvelle commande fournisseur"
        className="max-w-2xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <ComboBox
            options={suppliers.map((s) => ({
              value: s.id,
              label: s.name,
              sublabel: s.phone,
            }))}
            value={supplierId}
            onChange={setSupplierId}
            placeholder="Selectionner un fournisseur..."
            required
          />

          <div>
            <label className="block text-sm font-medium text-text mb-2">Articles</label>
            {orderLines.length > 0 && (
              <div className="flex gap-2 items-end text-xs font-medium text-text-muted mb-1">
                <div className="flex-1">Produit</div>
                <div className="w-20 text-center">Quantite</div>
                <div className="w-28 text-center">Prix unitaire</div>
                <div className="w-7" />
              </div>
            )}
            <div className="space-y-2">
              {orderLines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <ComboBox
                    className="flex-1"
                    options={purchaseProducts.map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: `${formatCurrency(p.buyPrice)} - Stock: ${p.quantity}`,
                    }))}
                    value={line.productId}
                    onChange={(val) => updateLine(i, 'productId', val)}
                    placeholder="Rechercher un produit..."
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded-lg border border-border bg-surface text-text px-2 py-1.5 text-sm text-center"
                    placeholder="Qte"
                    value={line.quantity}
                    onChange={(e) => updateLine(i, 'quantity', Number(e.target.value) || 0)}
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    className="w-28 rounded-lg border border-border bg-surface text-text px-2 py-1.5 text-sm text-right"
                    placeholder="Prix"
                    value={line.unitPrice}
                    onChange={(e) => updateLine(i, 'unitPrice', Number(e.target.value) || 0)}
                    required
                  />
                  <button type="button" onClick={() => removeLine(i)} className="p-1 text-danger">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addLine} className="mt-2">
              <Plus size={16} /> Ajouter ligne
            </Button>
          </div>

          {orderLines.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Total</span>
                <span className="font-bold text-lg text-text">{formatCurrency(orderTotal)}</span>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!supplierId || orderLines.length === 0}>
              Créer la commande
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title="Details de la commande"
        className="max-w-2xl"
      >
        {detailOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-text-muted mb-1">Commande</p>
                <p className="text-sm font-mono text-text">#{detailOrder.id.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Fournisseur</p>
                <p className="text-sm font-medium text-text">{detailOrder.supplierName}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Date</p>
                <p className="text-sm text-text">{formatDate(detailOrder.date)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-1">Statut</p>
                <Badge variant={statusVariants[detailOrder.status]}>{statusLabels[detailOrder.status]}</Badge>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <Table>
                <Thead>
                  <Tr>
                    <Th>Produit</Th>
                    <Th>Qte</Th>
                    <Th>Prix unit.</Th>
                    <Th>Total</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {detailItems.map((item, i) => (
                    <Tr key={`${item.productName}-${i}`}>
                      <Td>{item.productName}</Td>
                      <Td>{item.quantity}</Td>
                      <Td>{formatCurrency(item.unitPrice)}</Td>
                      <Td className="font-semibold">{formatCurrency(item.total)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>

            <div className="flex justify-between items-center border-t border-border pt-3">
              <span className="text-sm text-text-muted">Total commande</span>
              <span className="text-lg font-bold text-text">{formatCurrency(detailOrder.total)}</span>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={receiveModalOpen}
        onClose={() => setReceiveModalOpen(false)}
        title={`Recevoir la commande #${receiveOrderData?.id.slice(0, 8) ?? ''}`}
        className="max-w-xl"
      >
        {receiveOrderData && (
          <form onSubmit={handleReceive} className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Fournisseur</span>
                <span className="font-medium text-text">{receiveOrderData.supplierName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Total commande</span>
                <span className="font-bold text-lg text-text">{formatCurrency(receiveOrderData.total)}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-2">Mode de paiement</label>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('cash');
                    setDeposit(receiveOrderData.total);
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                    paymentMode === 'cash'
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  💵 Payer comptant ({formatCurrency(receiveOrderData.total)})
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('partial');
                    setDeposit(0);
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                    paymentMode === 'partial'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  💳 Paiement partiel
                </button>
                
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMode('credit');
                    setDeposit(0);
                  }}
                  className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors text-left ${
                    paymentMode === 'credit'
                      ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  📋 Tout à crédit
                </button>
              </div>
            </div>

            {paymentMode === 'partial' && (
              <Input
                id="deposit"
                label="Montant payé (acompte)"
                type="number"
                min={0}
                max={receiveOrderData.total}
                value={deposit || ''}
                onChange={(e) => setDeposit(Number(e.target.value) || 0)}
                placeholder="Ex : 50000"
                required
              />
            )}

            {paymentMode === 'partial' && deposit > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700 dark:text-blue-400">Montant payé</span>
                  <span className="font-semibold text-blue-800 dark:text-blue-300">{formatCurrency(deposit)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-blue-200 dark:border-blue-800 pt-1">
                  <span className="font-medium text-blue-700 dark:text-blue-400">Reste à payer (crédit)</span>
                  <span className="font-bold text-blue-800 dark:text-blue-300">{formatCurrency(receiveOrderData.total - deposit)}</span>
                </div>
              </div>
            )}

            {paymentMode === 'credit' && (
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  ⚠️ Le montant total de <span className="font-bold">{formatCurrency(receiveOrderData.total)}</span> sera ajouté au crédit fournisseur.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setReceiveModalOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">
                Confirmer la réception
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
