import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, ShoppingCart, PackageCheck, ArrowLeft, CreditCard } from 'lucide-react';
import { db } from '@/db';
import type { Supplier, SupplierOrder, OrderStatus } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ComboBox } from '@/components/ui/ComboBox';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO, formatCurrency, formatDate, generateSupplierOrderRef } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { trackDeletion } from '@/services/syncService';

const statusLabels: Record<OrderStatus, string> = {
  en_attente: 'En attente',
  recue: 'Reçue',
  annulee: 'Annulée',
};

const statusVariants: Record<OrderStatus, 'warning' | 'success' | 'danger'> = {
  en_attente: 'warning',
  recue: 'success',
  annulee: 'danger',
};

const emptySupplier = (): Partial<Supplier> => ({
  name: '',
  phone: '',
  address: '',
  creditBalance: 0,
});

export function SuppliersPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isGerant = currentUser?.role === 'gerant';
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>(emptySupplier());
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditType, setCreditType] = useState<'credit' | 'payment'>('payment');
  const [creditNote, setCreditNote] = useState('');

  const [orderProducts, setOrderProducts] = useState<
    { productId: string; productName: string; quantity: number; unitPrice: number }[]
  >([]);

  const [receiveOrderData, setReceiveOrderData] = useState<SupplierOrder | null>(null);
  const [deposit, setDeposit] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'partial' | 'credit'>('cash');

  const suppliers = useLiveQuery(async () => {
    const all = await db.suppliers.toArray();
    return all
      .filter(
        (s) =>
          !search ||
          s.name.toLowerCase().includes(search.toLowerCase()) ||
          s.phone.includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search]) ?? [];

  const allProducts = useLiveQuery(async () => (await db.products.orderBy('name').toArray()).filter((p) => !p.deleted)) ?? [];
  const purchaseProducts = allProducts.filter((p) => !p.usage || p.usage === 'achat' || p.usage === 'achat_vente');
  const allUsers = useLiveQuery(async () => (await db.users.toArray()).filter((u) => !u.deleted)) ?? [];
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const supplierOrders = useLiveQuery(async () => {
    if (!selectedSupplier) return [];
    return db.supplierOrders
      .where('supplierId')
      .equals(selectedSupplier.id)
      .reverse()
      .sortBy('date');
  }, [selectedSupplier]) ?? [];

  const supplierTransactions = useLiveQuery(async () => {
    if (!selectedSupplier) return [];
    return db.supplierCreditTransactions
      .where('supplierId')
      .equals(selectedSupplier.id)
      .reverse()
      .sortBy('date');
  }, [selectedSupplier]) ?? [];

  const openAdd = () => {
    setEditing(null);
    setForm(emptySupplier());
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ ...s });
    setModalOpen(true);
  };

  const openOrders = (s: Supplier) => {
    setSelectedSupplier(s);
    setOrderProducts([]);
    setOrderModalOpen(true);
  };

  const openCredit = (s: Supplier) => {
    setSelectedSupplier(s);
    setCreditAmount(0);
    setCreditType('payment');
    setCreditNote('');
    setCreditModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!form.name || !form.phone) {
      toast.error('Nom et téléphone requis');
      return;
    }
    
    const now = nowISO();
    
    if (editing) {
      const changes: string[] = [];
      if (form.name !== editing.name) changes.push(`Nom : ${editing.name} → ${form.name}`);
      if (form.phone !== editing.phone) changes.push(`Téléphone : ${editing.phone} → ${form.phone}`);
      if (form.address !== editing.address) changes.push(`Adresse : ${editing.address || '—'} → ${form.address || '—'}`);

      await db.suppliers.update(editing.id, {
        name: form.name,
        phone: form.phone,
        address: form.address,
        creditBalance: editing.creditBalance ?? 0,
        updatedAt: now,
        syncStatus: 'pending',
      });
      
      await logAction({
        action: 'modification',
        entity: 'fournisseur',
        entityId: editing.id,
        entityName: form.name,
        details: changes.length > 0 ? changes.join('\n') : 'Aucune modification',
      });
    } else {
      const id = generateId();
      
      await db.suppliers.add({
        id,
        name: form.name,
        phone: form.phone,
        address: form.address || '',
        creditBalance: 0,
        deleted: false,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      
      await logAction({ 
        action: 'creation', 
        entity: 'fournisseur', 
        entityId: id, 
        entityName: form.name 
      });
    }
    
    setModalOpen(false);
    toast.success(editing ? 'Fournisseur modifié' : 'Fournisseur ajouté');
  };

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || orderProducts.length === 0) return;
    const now = nowISO();
    const orderId = generateSupplierOrderRef();
    const total = orderProducts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

    await db.supplierOrders.add({
      id: orderId,
      supplierId: selectedSupplier.id,
      date: now,
      total,
      deposit: 0,
      status: 'en_attente',
      userId: currentUser?.id,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    for (const item of orderProducts) {
      await db.orderItems.add({
        id: generateId(),
        orderId,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
    }

    await logAction({
      action: 'creation_commande',
      entity: 'commande',
      entityId: orderId,
      entityName: selectedSupplier.name,
      details: `${orderProducts.length} article(s) — ${formatCurrency(total)}`,
    });

    setOrderProducts([]);
  };

  const openReceive = (order: SupplierOrder) => {
    setReceiveOrderData(order);
    setDeposit(0);
    setPaymentMode('cash');
    setReceiveModalOpen(true);
  };

  const handleReceive = async (e: FormEvent) => {
    e.preventDefault();
    if (!receiveOrderData || !currentUser) return;
    
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
          userId: currentUser.id,
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
        userId: currentUser.id,
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

  const handleCreditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || creditAmount <= 0) return;
    const now = nowISO();

    const current = selectedSupplier.creditBalance ?? 0;
    const nextBalance = creditType === 'credit' ? current + creditAmount : Math.max(0, current - creditAmount);

    await db.suppliers.update(selectedSupplier.id, {
      creditBalance: nextBalance,
      updatedAt: now,
      syncStatus: 'pending',
    });

    await db.supplierCreditTransactions.add({
      id: generateId(),
      supplierId: selectedSupplier.id,
      amount: creditAmount,
      type: creditType,
      date: now,
      note: creditNote || undefined,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    await logAction({
      action: creditType === 'payment' ? 'paiement' : 'credit',
      entity: 'fournisseur',
      entityId: selectedSupplier.id,
      entityName: selectedSupplier.name,
      details: (creditType === 'payment' ? 'Paiement fournisseur: ' : 'Dette fournisseur: ') + formatCurrency(creditAmount) + (creditNote ? ' - ' + creditNote : ''),
    });

    setSelectedSupplier({ ...selectedSupplier, creditBalance: nextBalance });
    setCreditModalOpen(false);
    toast.success('Credit fournisseur mis a jour');
  };

  const handleDelete = async (id: string) => {
    const supplier = await db.suppliers.get(id);
    if (!supplier) return;
    
    const ok = await confirmAction({
      title: 'Supprimer le fournisseur',
      message: `Supprimer le fournisseur « ${supplier.name} » ?\n\nSes commandes associées seront conservées.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
  
    const loadingToast = toast.loading('Suppression en cours...');
    try {
      const now = nowISO();
      await db.suppliers.update(id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
      await trackDeletion('suppliers', id);
      await logAction({ action: 'suppression', entity: 'fournisseur', entityId: id, entityName: supplier.name });
  
      toast.dismiss(loadingToast);
      toast.success(`Fournisseur « ${supplier.name} » supprimé`);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Erreur lors de la suppression');
    }
  };

  const addOrderProduct = () => {
    setOrderProducts([...orderProducts, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  };

  const updateOrderProduct = (index: number, field: string, value: string | number) => {
    const updated = [...orderProducts];
    if (field === 'productId') {
      const product = allProducts.find((p) => p.id === value);
      updated[index] = {
        ...updated[index],
        productId: value as string,
        productName: product?.name ?? '',
        unitPrice: product?.buyPrice ?? 0,
      };
    } else {
      (updated[index] as Record<string, unknown>)[field] = value;
    }
    setOrderProducts(updated);
  };

  const removeOrderProduct = (index: number) => {
    setOrderProducts(orderProducts.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Fournisseurs</h1>
        </div>
        <Button onClick={openAdd}>
          <Plus size={18} /> Ajouter
        </Button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              <Th>Nom</Th>
              <Th>Téléphone</Th>
              <Th>Adresse</Th>
              <Th>Credit</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {suppliers.length === 0 ? (
              <Tr>
                <Td colSpan={5} className="text-center text-text-muted py-8">
                  Aucun fournisseur trouvé
                </Td>
              </Tr>
            ) : (
              suppliers.map((s) => (
                <Tr key={s.id}>
                  <Td className="font-medium">{s.name}</Td>
                  <Td>{s.phone}</Td>
                  <Td className="text-text-muted">{s.address}</Td>
                  <Td>
                    {(s.creditBalance ?? 0) > 0 ? (
                      <Badge variant="danger">{formatCurrency(s.creditBalance ?? 0)}</Badge>
                    ) : (
                      <Badge variant="success">Aucun</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openOrders(s)}
                        className="p-1.5 rounded hover:bg-blue-50"
                        title="Commandes"
                      >
                        <ShoppingCart size={16} className="text-primary" />
                      </button>
                      <button
                        onClick={() => openCredit(s)}
                        className="p-1.5 rounded hover:bg-amber-50"
                        title="Credit fournisseur"
                      >
                        <CreditCard size={16} className="text-amber-600" />
                      </button>
                      <button onClick={() => openEdit(s)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Pencil size={16} className="text-text-muted" />
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                        <Trash2 size={16} className="text-danger" />
                      </button>
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
        title={editing ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="sname" label="Nom" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex : Diallo Distribution" required />
          <Input id="sphone" label="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Ex : 66 78 90 12" required />
          <Input id="saddr" label="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Ex : Marché central, Bamako" />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>Annuler</Button>
            <Button type="submit">{editing ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={orderModalOpen}
        onClose={() => setOrderModalOpen(false)}
        title={`Commandes — ${selectedSupplier?.name}`}
        className="max-w-2xl"
      >
        <div className="space-y-6">
          <div>
            <h4 className="text-sm font-semibold text-text mb-3">Nouvelle commande</h4>
            <form onSubmit={handleCreateOrder} className="space-y-3">
              {orderProducts.length > 0 && (
                <div className="flex gap-2 items-end text-xs font-medium text-text-muted">
                  <div className="flex-1">Produit</div>
                  <div className="w-20 text-center">Quantité</div>
                  <div className="w-28 text-center">Prix unitaire</div>
                  <div className="w-7" />
                </div>
              )}
              {orderProducts.map((op, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <ComboBox
                    className="flex-1"
                    options={purchaseProducts.map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: formatCurrency(p.buyPrice),
                    }))}
                    value={op.productId}
                    onChange={(val) => updateOrderProduct(i, 'productId', val)}
                    placeholder="Rechercher un produit..."
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    className="w-20 rounded-lg border border-border bg-surface text-text px-2 py-1.5 text-sm text-center"
                    placeholder="Qté"
                    value={op.quantity}
                    onChange={(e) => updateOrderProduct(i, 'quantity', Number(e.target.value) || 0)}
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    className="w-28 rounded-lg border border-border bg-surface text-text px-2 py-1.5 text-sm text-right"
                    placeholder="Prix"
                    value={op.unitPrice}
                    onChange={(e) => updateOrderProduct(i, 'unitPrice', Number(e.target.value) || 0)}
                    required
                  />
                  <button type="button" onClick={() => removeOrderProduct(i)} className="p-1 text-danger">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addOrderProduct}>
                  <Plus size={16} /> Ajouter ligne
                </Button>
                {orderProducts.length > 0 && (
                  <Button type="submit" size="sm">Créer la commande</Button>
                )}
              </div>
            </form>
          </div>

          {supplierOrders.length > 0 && (
            <div className="border-t border-border pt-4">
              <h4 className="text-sm font-semibold text-text mb-3">Historique des commandes</h4>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {supplierOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-text">#{o.id.slice(0, 8)}</p>
                      <p className="text-xs text-text-muted">{formatDate(o.date)}</p>
                      {isGerant && o.userId && (
                        <p className="text-xs text-primary">{userMap.get(o.userId) ?? '—'}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm text-text">{formatCurrency(o.total)}</span>
                      <Badge variant={statusVariants[o.status]}>{statusLabels[o.status]}</Badge>
                      {o.status === 'en_attente' && (
                        <button
                          onClick={() => openReceive(o)}
                          className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                          title="Recevoir la commande"
                        >
                          <PackageCheck size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
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

      <Modal
        open={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        title={`Credit fournisseur - ${selectedSupplier?.name}`}
        className="max-w-xl"
      >
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <p className="text-sm text-text-muted">Solde credit fournisseur</p>
          <p className="text-xl font-bold text-text">
            {formatCurrency(selectedSupplier?.creditBalance ?? 0)}
          </p>
        </div>

        <form onSubmit={handleCreditSubmit} className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCreditType('payment')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                creditType === 'payment'
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'border-border text-text-muted'
              }`}
            >
              Paiement fournisseur
            </button>
            <button
              type="button"
              onClick={() => setCreditType('credit')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                creditType === 'credit'
                  ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                  : 'border-border text-text-muted'
              }`}
            >
              Nouveau credit
            </button>
          </div>

          <Input
            id="supplierCreditAmt"
            label="Montant"
            type="number"
            min={0}
            value={creditAmount}
            onChange={(e) => setCreditAmount(Number(e.target.value))}
            placeholder="Ex : 5000"
            required
          />

          <Input
            id="supplierCreditNote"
            label="Note (optionnel)"
            value={creditNote}
            onChange={(e) => setCreditNote(e.target.value)}
            placeholder="Ex : paiement partiel"
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreditModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>

        {supplierTransactions.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-text mb-2">Historique credit fournisseur</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {supplierTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                  <div>
                    <span className={t.type === 'payment' ? 'text-emerald-600' : 'text-red-600'}>
                      {t.type === 'payment' ? 'Paiement' : 'Credit'}
                    </span>
                    {t.note && <span className="text-text-muted ml-2">- {t.note}</span>}
                  </div>
                  <p className="font-medium text-text">{formatCurrency(t.amount)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}