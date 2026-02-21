import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, ShoppingCart, PackageCheck, ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import type { Supplier, SupplierOrder, OrderStatus } from '@/types';
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
});

export function SuppliersPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isGerant = currentUser?.role === 'gerant';
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>(emptySupplier());

  const [orderProducts, setOrderProducts] = useState<
    { productId: string; productName: string; quantity: number; unitPrice: number }[]
  >([]);

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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const now = nowISO();
    if (editing) {
      const changes: string[] = [];
      if (form.name !== editing.name) changes.push(`Nom : ${editing.name} → ${form.name}`);
      if (form.phone !== editing.phone) changes.push(`Téléphone : ${editing.phone} → ${form.phone}`);
      if (form.address !== editing.address) changes.push(`Adresse : ${editing.address || '—'} → ${form.address || '—'}`);

      await db.suppliers.update(editing.id, {
        ...form,
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
        name: form.name!,
        phone: form.phone!,
        address: form.address!,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({ action: 'creation', entity: 'fournisseur', entityId: id, entityName: form.name });
    }
    setModalOpen(false);
    toast.success(editing ? 'Fournisseur modifié' : 'Fournisseur ajouté');
  };

  const handleCreateOrder = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier || orderProducts.length === 0) return;
    const now = nowISO();
    const orderId = generateId();
    const total = orderProducts.reduce((s, p) => s + p.quantity * p.unitPrice, 0);

    await db.supplierOrders.add({
      id: orderId,
      supplierId: selectedSupplier.id,
      date: now,
      total,
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

  const receiveOrder = async (order: SupplierOrder) => {
    const now = nowISO();
    const items = await db.orderItems.where('orderId').equals(order.id).toArray();

    for (const item of items) {
      const product = await db.products.get(item.productId);
      if (product) {
        await db.products.update(item.productId, {
          quantity: product.quantity + item.quantity,
          updatedAt: now,
          syncStatus: 'pending',
        });
        await db.stockMovements.add({
          id: generateId(),
          productId: item.productId,
          productName: item.productName,
          type: 'entree',
          quantity: item.quantity,
          date: now,
          reason: `Réception commande fournisseur #${order.id.slice(0, 8)}`,
          userId: currentUser?.id,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }
    }

    await db.supplierOrders.update(order.id, {
      status: 'recue',
      updatedAt: now,
      syncStatus: 'pending',
    });

    await logAction({
      action: 'reception_commande',
      entity: 'commande',
      entityId: order.id,
      details: `Commande #${order.id.slice(0, 8)} — ${formatCurrency(order.total)}`,
    });
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
    const now = nowISO();
    await db.suppliers.update(id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
    await trackDeletion('suppliers', id);
    await logAction({ action: 'suppression', entity: 'fournisseur', entityId: id, entityName: supplier.name });
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
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {suppliers.length === 0 ? (
              <Tr>
                <Td colSpan={4} className="text-center text-text-muted py-8">
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
                    <div className="flex gap-1">
                      <button
                        onClick={() => openOrders(s)}
                        className="p-1.5 rounded hover:bg-blue-50"
                        title="Commandes"
                      >
                        <ShoppingCart size={16} className="text-primary" />
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
                          onClick={() => receiveOrder(o)}
                          className="p-1.5 rounded bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-200 dark:hover:bg-emerald-800/60 text-emerald-700 dark:text-emerald-400"
                          title="Marquer comme reçue"
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
    </div>
  );
}
