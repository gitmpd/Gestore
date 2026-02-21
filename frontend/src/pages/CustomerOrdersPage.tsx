import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Trash2, PackageCheck, XCircle, Eye, ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import type { CustomerOrder, CustomerOrderStatus, PaymentMethod } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ComboBox } from '@/components/ui/ComboBox';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO, formatCurrency, formatDate } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';

const statusLabels: Record<CustomerOrderStatus, string> = {
  en_attente: 'En attente',
  livree: 'Livrée',
  annulee: 'Annulée',
};

const statusVariants: Record<CustomerOrderStatus, 'warning' | 'success' | 'danger'> = {
  en_attente: 'warning',
  livree: 'success',
  annulee: 'danger',
};

const paymentLabels: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  credit: 'Crédit',
  mobile: 'Mobile Money',
};

interface OrderLine {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export function CustomerOrdersPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<CustomerOrderStatus | 'all'>('all');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deliverModalOpen, setDeliverModalOpen] = useState(false);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const [customerId, setCustomerId] = useState('');
  const [deposit, setDeposit] = useState(0);
  const [note, setNote] = useState('');
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);

  const [deliverOrderId, setDeliverOrderId] = useState('');
  const [deliverPaymentMethod, setDeliverPaymentMethod] = useState<PaymentMethod>('cash');
  const [deliverOrder, setDeliverOrder] = useState<CustomerOrder | null>(null);

  const [detailOrder, setDetailOrder] = useState<CustomerOrder | null>(null);
  const [detailItems, setDetailItems] = useState<{ productName: string; quantity: number; unitPrice: number; total: number }[]>([]);

  const customers = useLiveQuery(() => db.customers.orderBy('name').toArray()) ?? [];
  const allProducts = useLiveQuery(async () => (await db.products.orderBy('name').toArray()).filter((p) => !p.deleted)) ?? [];
  const saleProducts = allProducts.filter(
    (p) => !p.usage || p.usage === 'vente' || p.usage === 'achat_vente'
  );

  const isGerant = user?.role === 'gerant';
  const allUsers = useLiveQuery(async () => (await db.users.toArray()).filter((u) => !u.deleted)) ?? [];
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const orders = useLiveQuery(async () => {
    const all = await db.customerOrders.orderBy('date').reverse().toArray();
    const customerMap = new Map((await db.customers.toArray()).map((c) => [c.id, c.name]));
    return all.map((o) => ({ ...o, customerName: customerMap.get(o.customerId) || '—' }));
  }) ?? [];

  const filteredOrders = orders.filter((o) => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        o.id.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const orderTotal = orderLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const openCreate = () => {
    setCustomerId('');
    setDeposit(0);
    setNote('');
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
        unitPrice: product?.sellPrice ?? 0,
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
    if (!customerId || orderLines.length === 0 || !user) return;
    const now = nowISO();
    const orderId = generateId();

    await db.customerOrders.add({
      id: orderId,
      customerId,
      date: now,
      total: orderTotal,
      deposit: deposit || 0,
      status: 'en_attente',
      note: note || undefined,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    for (const line of orderLines) {
      await db.customerOrderItems.add({
        id: generateId(),
        customerOrderId: orderId,
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

    const customer = customers.find((c) => c.id === customerId);
    await logAction({
      action: 'creation_commande',
      entity: 'commande_client',
      entityId: orderId,
      entityName: customer?.name,
      details: `${orderLines.length} article(s) — ${formatCurrency(orderTotal)}${deposit > 0 ? ` — Acompte: ${formatCurrency(deposit)}` : ''}`,
    });

    setCreateModalOpen(false);
    toast.success('Commande client créée');
  };

  const openDeliver = (order: CustomerOrder) => {
    setDeliverOrder(order);
    setDeliverOrderId(order.id);
    setDeliverPaymentMethod('cash');
    setDeliverModalOpen(true);
  };

  const handleDeliver = async (e: FormEvent) => {
    e.preventDefault();
    if (!deliverOrder || !user) return;

    const now = nowISO();
    const items = await db.customerOrderItems
      .where('customerOrderId')
      .equals(deliverOrder.id)
      .toArray();

    const saleId = generateId();
    const remaining = deliverOrder.total - deliverOrder.deposit;

    await db.sales.add({
      id: saleId,
      userId: user.id,
      customerId: deliverOrder.customerId,
      date: now,
      total: deliverOrder.total,
      paymentMethod: deliverPaymentMethod,
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    for (const item of items) {
      await db.saleItems.add({
        id: generateId(),
        saleId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
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
          reason: `Commande client #${deliverOrder.id.slice(0, 8)}`,
          userId: user.id,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }
    }

    if (deliverPaymentMethod === 'credit' && remaining > 0) {
      const customer = await db.customers.get(deliverOrder.customerId);
      if (customer) {
        await db.customers.update(deliverOrder.customerId, {
          creditBalance: customer.creditBalance + remaining,
          updatedAt: now,
          syncStatus: 'pending',
        });
        await db.creditTransactions.add({
          id: generateId(),
          customerId: deliverOrder.customerId,
          saleId,
          amount: remaining,
          type: 'credit',
          date: now,
          note: `Commande client #${deliverOrder.id.slice(0, 8)} (reste après acompte)`,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }
    }

    await db.customerOrders.update(deliverOrder.id, {
      status: 'livree',
      saleId,
      updatedAt: now,
      syncStatus: 'pending',
    });

    const customer = customers.find((c) => c.id === deliverOrder.customerId);
    await logAction({
      action: 'livraison_commande',
      entity: 'commande_client',
      entityId: deliverOrder.id,
      entityName: customer?.name,
      details: `Commande #${deliverOrder.id.slice(0, 8)} — ${formatCurrency(deliverOrder.total)} — ${paymentLabels[deliverPaymentMethod]}${deliverOrder.deposit > 0 ? ` — Acompte: ${formatCurrency(deliverOrder.deposit)}` : ''}`,
    });

    setDeliverModalOpen(false);
  };

  const handleCancel = async (order: CustomerOrder & { customerName: string }) => {
    const ok = await confirmAction({
      title: 'Annuler la commande',
      message: `Annuler la commande #${order.id.slice(0, 8)} de ${order.customerName} (${formatCurrency(order.total)}) ?${order.deposit > 0 ? `\n\nUn acompte de ${formatCurrency(order.deposit)} avait été versé.` : ''}`,
      confirmLabel: 'Annuler la commande',
      variant: 'danger',
    });
    if (!ok) return;

    const now = nowISO();
    await db.customerOrders.update(order.id, {
      status: 'annulee',
      updatedAt: now,
      syncStatus: 'pending',
    });

    await logAction({
      action: 'annulation_commande',
      entity: 'commande_client',
      entityId: order.id,
      entityName: order.customerName,
      details: `Commande #${order.id.slice(0, 8)} — ${formatCurrency(order.total)}${order.deposit > 0 ? ` — Acompte: ${formatCurrency(order.deposit)}` : ''}`,
    });
  };

  const openDetail = async (order: CustomerOrder & { customerName: string }) => {
    const items = await db.customerOrderItems
      .where('customerOrderId')
      .equals(order.id)
      .toArray();
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
          <h1 className="text-2xl font-bold text-text">Commandes clients</h1>
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
            placeholder="Rechercher par n° ou client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'en_attente', 'livree', 'annulee'] as const).map((s) => (
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
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              <Th>N°</Th>
              <Th>Client</Th>
              {isGerant && <Th>Créé par</Th>}
              <Th>Date</Th>
              <Th>Total</Th>
              <Th>Acompte</Th>
              <Th>Statut</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filteredOrders.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 8 : 7} className="text-center text-text-muted py-8">
                  Aucune commande trouvée
                </Td>
              </Tr>
            ) : (
              filteredOrders.map((o) => (
                <Tr key={o.id}>
                  <Td className="font-mono text-xs">#{o.id.slice(0, 8)}</Td>
                  <Td className="font-medium">{o.customerName}</Td>
                  {isGerant && (
                    <Td className="text-sm">{o.userId ? userMap.get(o.userId) ?? '—' : '—'}</Td>
                  )}
                  <Td className="text-text-muted">{formatDate(o.date)}</Td>
                  <Td className="font-semibold">{formatCurrency(o.total)}</Td>
                  <Td>
                    {o.deposit > 0 ? (
                      <span className="text-emerald-600 font-medium">{formatCurrency(o.deposit)}</span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </Td>
                  <Td>
                    <Badge variant={statusVariants[o.status]}>{statusLabels[o.status]}</Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openDetail(o)}
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                        title="Détails"
                      >
                        <Eye size={16} className="text-text-muted" />
                      </button>
                      {o.status === 'en_attente' && (
                        <>
                          <button
                            onClick={() => openDeliver(o)}
                            className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                            title="Livrer"
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

      {/* Modal creation */}
      <Modal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Nouvelle commande client"
        className="max-w-2xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <ComboBox
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              sublabel: c.phone,
            }))}
            value={customerId}
            onChange={setCustomerId}
            placeholder="Sélectionner un client..."
            required
          />

          <div>
            <label className="block text-sm font-medium text-text mb-2">Articles</label>
            {orderLines.length > 0 && (
              <div className="flex gap-2 items-end text-xs font-medium text-text-muted mb-1">
                <div className="flex-1">Produit</div>
                <div className="w-20 text-center">Quantité</div>
                <div className="w-28 text-center">Prix unitaire</div>
                <div className="w-7" />
              </div>
            )}
            <div className="space-y-2">
              {orderLines.map((line, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <ComboBox
                    className="flex-1"
                    options={saleProducts.map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: `${formatCurrency(p.sellPrice)} — Stock: ${p.quantity}`,
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
                    placeholder="Qté"
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
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Total</span>
                <span className="font-bold text-lg text-text">{formatCurrency(orderTotal)}</span>
              </div>
              <Input
                id="deposit"
                label="Acompte (optionnel)"
                type="number"
                min={0}
                max={orderTotal}
                value={deposit || ''}
                onChange={(e) => setDeposit(Number(e.target.value) || 0)}
                placeholder="Ex : 5000"
              />
              {deposit > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Reste à payer</span>
                  <span className="font-semibold text-text">{formatCurrency(orderTotal - deposit)}</span>
                </div>
              )}
              <Input
                id="note"
                label="Note (optionnel)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex : Livraison prévue vendredi"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!customerId || orderLines.length === 0 || orderLines.some((l) => !l.productId || l.quantity <= 0)}>
              Créer la commande
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal livraison */}
      <Modal
        open={deliverModalOpen}
        onClose={() => setDeliverModalOpen(false)}
        title={`Livrer la commande #${deliverOrderId.slice(0, 8)}`}
      >
        {deliverOrder && (
          <form onSubmit={handleDeliver} className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-text-muted">Total commande</span>
                <span className="font-bold text-text">{formatCurrency(deliverOrder.total)}</span>
              </div>
              {deliverOrder.deposit > 0 && (
                <>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Acompte versé</span>
                    <span className="text-emerald-600 font-medium">- {formatCurrency(deliverOrder.deposit)}</span>
                  </div>
                  <div className="border-t border-border pt-1 flex justify-between text-sm">
                    <span className="font-medium text-text">Reste à payer</span>
                    <span className="font-bold text-lg text-text">{formatCurrency(deliverOrder.total - deliverOrder.deposit)}</span>
                  </div>
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-text mb-2">Mode de paiement</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(paymentLabels) as PaymentMethod[]).map((pm) => (
                  <button
                    key={pm}
                    type="button"
                    onClick={() => setDeliverPaymentMethod(pm)}
                    className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                      deliverPaymentMethod === pm
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {paymentLabels[pm]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" type="button" onClick={() => setDeliverModalOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">Confirmer la livraison</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Modal détails */}
      <Modal
        open={detailModalOpen}
        onClose={() => setDetailModalOpen(false)}
        title={`Commande #${detailOrder?.id.slice(0, 8) ?? ''}`}
      >
        {detailOrder && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-text-muted">Client</span>
                <p className="font-medium text-text">{customers.find((c) => c.id === detailOrder.customerId)?.name ?? '—'}</p>
              </div>
              <div>
                <span className="text-text-muted">Date</span>
                <p className="font-medium text-text">{formatDate(detailOrder.date)}</p>
              </div>
              <div>
                <span className="text-text-muted">Statut</span>
                <p><Badge variant={statusVariants[detailOrder.status]}>{statusLabels[detailOrder.status]}</Badge></p>
              </div>
              <div>
                <span className="text-text-muted">Total</span>
                <p className="font-bold text-text">{formatCurrency(detailOrder.total)}</p>
              </div>
              {detailOrder.deposit > 0 && (
                <>
                  <div>
                    <span className="text-text-muted">Acompte</span>
                    <p className="font-medium text-emerald-600">{formatCurrency(detailOrder.deposit)}</p>
                  </div>
                  <div>
                    <span className="text-text-muted">Reste</span>
                    <p className="font-medium text-text">{formatCurrency(detailOrder.total - detailOrder.deposit)}</p>
                  </div>
                </>
              )}
              {detailOrder.note && (
                <div className="col-span-2">
                  <span className="text-text-muted">Note</span>
                  <p className="font-medium text-text">{detailOrder.note}</p>
                </div>
              )}
            </div>

            <div className="border-t border-border pt-3">
              <h4 className="text-sm font-semibold text-text mb-2">Articles</h4>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Produit</Th>
                    <Th>Qté</Th>
                    <Th>Prix unit.</Th>
                    <Th>Total</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {detailItems.map((item, i) => (
                    <Tr key={i}>
                      <Td>{item.productName}</Td>
                      <Td>{item.quantity}</Td>
                      <Td>{formatCurrency(item.unitPrice)}</Td>
                      <Td className="font-semibold">{formatCurrency(item.total)}</Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
