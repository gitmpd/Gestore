import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Trash2, PackageCheck, XCircle, Eye, ArrowLeft, CreditCard } from 'lucide-react';
import { db } from '@/db';
import type { OrderStatus, SupplierOrder } from '@/types';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ComboBox } from '@/components/ui/ComboBox';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO, formatCurrency, formatDate } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';

const statusLabels: Record<OrderStatus, string> = {
  en_attente: 'En attente',
  recue: 'Recue',
  annulee: 'Annulee',
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

  const [supplierId, setSupplierId] = useState('');
  const [orderLines, setOrderLines] = useState<SupplierOrderLine[]>([]);

  const [detailOrder, setDetailOrder] = useState<(SupplierOrder & { supplierName: string }) | null>(null);
  const [detailItems, setDetailItems] = useState<{ productName: string; quantity: number; unitPrice: number; total: number }[]>([]);

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
    const orderId = generateId();
    const total = orderLines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);

    await db.supplierOrders.add({
      id: orderId,
      supplierId,
      date: now,
      total,
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
    toast.success('Commande fournisseur creee');
  };

  const receiveOrder = async (order: SupplierOrder & { supplierName: string }, paymentMode: 'cash' | 'credit') => {
    if (!user) return;
    const now = nowISO();
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();

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
      isCredit: paymentMode === 'credit',
      updatedAt: now,
      syncStatus: 'pending',
    });

    if (paymentMode === 'credit') {
      const supplier = await db.suppliers.get(order.supplierId);
      if (supplier) {
        await db.suppliers.update(order.supplierId, {
          creditBalance: (supplier.creditBalance ?? 0) + order.total,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }

      await db.supplierCreditTransactions.add({
        id: generateId(),
        supplierId: order.supplierId,
        orderId: order.id,
        amount: order.total,
        type: 'credit',
        date: now,
        note: `Commande #${order.id.slice(0, 8)} recue a credit`,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
    } else {
      await db.supplierCreditTransactions.add({
        id: generateId(),
        supplierId: order.supplierId,
        orderId: order.id,
        amount: order.total,
        type: 'payment',
        date: now,
        note: `Commande #${order.id.slice(0, 8)} payee`,
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
      details: `Commande #${order.id.slice(0, 8)} - ${formatCurrency(order.total)} - ${paymentMode === 'credit' ? 'Credit fournisseur' : 'Payee'}`,
    });

    toast.success(paymentMode === 'credit' ? 'Commande recue a credit' : 'Commande recue et payee');
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
              <Th>Cree par</Th>
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
                  Aucune commande trouvee
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
                      ? (o.isCredit ? 'Credit' : 'Payee')
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
                            onClick={() => receiveOrder(o, 'cash')}
                            className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                            title="Marquer recue et payee"
                          >
                            <PackageCheck size={16} />
                          </button>
                          <button
                            onClick={() => receiveOrder(o, 'credit')}
                            className="p-1.5 rounded bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/60 text-amber-700 dark:text-amber-400"
                            title="Marquer recue a credit"
                          >
                            <CreditCard size={16} />
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
              Creer la commande
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
    </div>
  );
}
