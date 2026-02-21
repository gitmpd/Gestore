import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, ArrowLeft, Download, History } from 'lucide-react';
import { db } from '@/db';
import type { Product, ProductUsage, PriceHistory } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { generateId, nowISO, formatCurrency } from '@/lib/utils';
import { exportCSV } from '@/lib/export';
import { productSchema, validate } from '@/lib/validation';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { trackDeletion } from '@/services/syncService';

const usageLabels: Record<ProductUsage, string> = {
  vente: 'Vente uniquement',
  achat: 'Achat uniquement',
  achat_vente: 'Achat & Vente',
};

const usageVariants: Record<ProductUsage, 'info' | 'warning' | 'success'> = {
  vente: 'info',
  achat: 'warning',
  achat_vente: 'success',
};

const emptyProduct = (): Partial<Product> => ({
  name: '',
  barcode: '',
  categoryId: '',
  buyPrice: 0,
  sellPrice: 0,
  quantity: 0,
  alertThreshold: 5,
  usage: 'achat_vente',
});

export function ProductsPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isGerant = currentUser?.role === 'gerant';
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Partial<Product>>(emptyProduct());
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [historyProductName, setHistoryProductName] = useState('');

  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray()) ?? [];

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const products = useLiveQuery(async () => {
    const all = await db.products.toArray();
    return all
      .filter((p) => !p.deleted)
      .filter((p) => {
        const matchSearch =
          !search ||
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.barcode && p.barcode.includes(search));
        const matchCategory = !categoryFilter || p.categoryId === categoryFilter;
        return matchSearch && matchCategory;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search, categoryFilter]) ?? [];

  const openAdd = () => {
    setEditing(null);
    setForm(emptyProduct());
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({ ...product });
    setModalOpen(true);
  };

  const openPriceHistory = async (product: Product) => {
    const history = await db.priceHistory
      .where('productId')
      .equals(product.id)
      .toArray();
    history.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setPriceHistory(history);
    setHistoryProductName(product.name);
    setHistoryModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = validate(productSchema, {
      name: form.name || '',
      barcode: form.barcode,
      categoryId: form.categoryId || '',
      buyPrice: Number(form.buyPrice),
      sellPrice: Number(form.sellPrice),
      quantity: Number(form.quantity),
      alertThreshold: Number(form.alertThreshold),
      usage: form.usage,
    });
    if (!result.success) {
      toast.error(Object.values(result.errors)[0]);
      return;
    }
    const now = nowISO();

    if (editing) {
      const changes: string[] = [];
      if (form.name !== editing.name) changes.push(`Nom : ${editing.name} → ${form.name}`);
      if (form.barcode !== editing.barcode) changes.push(`Code-barres : ${editing.barcode || '—'} → ${form.barcode || '—'}`);
      if (form.categoryId !== editing.categoryId) {
        const oldCat = categories.find(c => c.id === editing.categoryId)?.name ?? '—';
        const newCat = categories.find(c => c.id === form.categoryId)?.name ?? '—';
        changes.push(`Catégorie : ${oldCat} → ${newCat}`);
      }
      if (Number(form.buyPrice) !== editing.buyPrice) changes.push(`Prix achat : ${formatCurrency(editing.buyPrice)} → ${formatCurrency(Number(form.buyPrice))}`);
      if (Number(form.sellPrice) !== editing.sellPrice) changes.push(`Prix vente : ${formatCurrency(editing.sellPrice)} → ${formatCurrency(Number(form.sellPrice))}`);
      if (Number(form.quantity) !== editing.quantity) changes.push(`Stock : ${editing.quantity} → ${Number(form.quantity)}`);
      if (Number(form.alertThreshold) !== editing.alertThreshold) changes.push(`Seuil alerte : ${editing.alertThreshold} → ${Number(form.alertThreshold)}`);
      if ((form.usage || 'achat_vente') !== (editing.usage || 'achat_vente')) changes.push(`Usage : ${usageLabels[editing.usage || 'achat_vente']} → ${usageLabels[form.usage || 'achat_vente']}`);

      await db.products.update(editing.id, {
        ...form,
        updatedAt: now,
        syncStatus: 'pending',
      });

      const buyChanged = Number(form.buyPrice) !== editing.buyPrice;
      const sellChanged = Number(form.sellPrice) !== editing.sellPrice;
      if (buyChanged || sellChanged) {
        await db.priceHistory.add({
          id: generateId(),
          productId: editing.id,
          oldBuyPrice: editing.buyPrice,
          newBuyPrice: Number(form.buyPrice),
          oldSellPrice: editing.sellPrice,
          newSellPrice: Number(form.sellPrice),
          userId: currentUser?.id,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }

      await logAction({
        action: 'modification',
        entity: 'produit',
        entityId: editing.id,
        entityName: form.name,
        details: changes.length > 0 ? changes.join('\n') : 'Aucune modification',
      });
    } else {
      const id = generateId();
      await db.products.add({
        id,
        name: form.name!,
        barcode: form.barcode || '',
        categoryId: form.categoryId!,
        buyPrice: Number(form.buyPrice),
        sellPrice: Number(form.sellPrice),
        quantity: Number(form.quantity),
        alertThreshold: Number(form.alertThreshold),
        usage: form.usage || 'achat_vente',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({ action: 'creation', entity: 'produit', entityId: id, entityName: form.name });
    }
    setModalOpen(false);
    toast.success(editing ? 'Produit modifié' : 'Produit ajouté');
  };

  const handleDelete = async (id: string) => {
    const product = await db.products.get(id);
    if (!product) return;
    const ok = await confirmAction({
      title: 'Supprimer le produit',
      message: `Supprimer le produit « ${product.name} » ?\n\nCette action supprimera aussi ses mouvements de stock associés.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    const movementIds = await db.stockMovements.where('productId').equals(id).primaryKeys();
    const now = nowISO();
    await db.products.update(id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
    for (const mId of movementIds) {
      await db.stockMovements.update(mId as string, { deleted: true, updatedAt: now, syncStatus: 'pending' });
      await trackDeletion('stockMovements', mId as string);
    }
    await trackDeletion('products', id);
    await logAction({ action: 'suppression', entity: 'produit', entityId: id, entityName: product.name });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Produits</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = products.map((p) => [
                p.name,
                categories.find((c) => c.id === p.categoryId)?.name ?? '—',
                formatCurrency(p.buyPrice),
                formatCurrency(p.sellPrice),
                p.quantity,
                p.alertThreshold,
              ]);
              exportCSV('produits', ['Nom', 'Catégorie', 'Prix achat', 'Prix vente', 'Stock', 'Seuil alerte'], rows);
              toast.success('Export CSV téléchargé');
            }}
            disabled={products.length === 0}
          >
            <Download size={16} /> CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus size={18} /> Ajouter
          </Button>
          {isGerant && selectedIds.length > 0 && (
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirmAction({
                  title: 'Supprimer les produits sélectionnés',
                  message: `Voulez-vous supprimer ${selectedIds.length} produit(s) sélectionné(s) ? Cette action est logique (marque 'deleted').`,
                  confirmLabel: 'Supprimer',
                  variant: 'danger',
                });
                if (!ok) return;
                const now = nowISO();
                const names: string[] = [];
                for (const id of selectedIds) {
                  const p = await db.products.get(id);
                  if (!p) continue;
                  names.push(p.name);
                  await db.products.update(id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
                  const movementIds = await db.stockMovements.where('productId').equals(id).primaryKeys();
                  for (const mId of movementIds) {
                    await trackDeletion('stockMovements', mId as string);
                  }
                  await trackDeletion('products', id);
                }
                await logAction({ action: 'suppression', entity: 'produit', details: `Suppression multiple: ${names.join(', ')}` });
                setSelectedIds([]);
                toast.success('Produits supprimés');
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
            placeholder="Rechercher par nom ou code-barres..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
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
                    checked={products.length > 0 && selectedIds.length === products.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(products.map((p) => p.id));
                      else setSelectedIds([]);
                    }}
                  />
                </Th>
              )}
              <Th>Produit</Th>
              <Th>Catégorie</Th>
              <Th>Usage</Th>
              <Th>Prix achat</Th>
              <Th>Prix vente</Th>
              <Th>Stock</Th>
              <Th>Statut</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
              {products.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 9 : 8} className="text-center text-text-muted py-8">
                  Aucun produit trouvé
                </Td>
              </Tr>
            ) : (
              products.map((p) => (
                <Tr key={p.id}>
                  {isGerant && (
                    <Td>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds((s) => [...s, p.id]);
                          else setSelectedIds((s) => s.filter((id) => id !== p.id));
                        }}
                      />
                    </Td>
                  )}
                  <Td>
                    <div>
                      <p className="font-medium">{p.name}</p>
                      {p.barcode && <p className="text-xs text-text-muted">{p.barcode}</p>}
                    </div>
                  </Td>
                  <Td>{categoryMap.get(p.categoryId) ?? '—'}</Td>
                  <Td>
                    <Badge variant={usageVariants[p.usage || 'achat_vente']}>
                      {usageLabels[p.usage || 'achat_vente']}
                    </Badge>
                  </Td>
                  <Td>{formatCurrency(p.buyPrice)}</Td>
                  <Td>{formatCurrency(p.sellPrice)}</Td>
                  <Td className="font-semibold">{p.quantity}</Td>
                  <Td>
                    {p.quantity <= p.alertThreshold ? (
                      <Badge variant="danger">Stock bas</Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => openPriceHistory(p)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700" title="Historique des prix">
                        <History size={16} className="text-text-muted" />
                      </button>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Pencil size={16} className="text-text-muted" />
                      </button>
                      {isGerant && (
                        <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                          <Trash2 size={16} className="text-danger" />
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
        title={editing ? 'Modifier le produit' : 'Nouveau produit'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="name"
            label="Nom du produit"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex : Riz 5kg, Huile 1L..."
            required
          />
          <Input
            id="barcode"
            label="Code-barres (optionnel)"
            value={form.barcode}
            onChange={(e) => setForm({ ...form, barcode: e.target.value })}
            placeholder="Ex : 6001234567890"
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="categoryId" className="text-sm font-medium text-text">
              Catégorie
            </label>
            <select
              id="categoryId"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              <option value="">Sélectionner une catégorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {categories.length === 0 && (
              <p className="text-xs text-amber-600">
                Aucune catégorie. Créez-en d'abord dans Paramètres.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="usage" className="text-sm font-medium text-text">
              Usage du produit
            </label>
            <div className="flex gap-2">
              {([
                { value: 'achat_vente' as const, label: 'Achat & Vente' },
                { value: 'vente' as const, label: 'Vente uniquement' },
                { value: 'achat' as const, label: 'Achat uniquement' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm({ ...form, usage: opt.value })}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    (form.usage || 'achat_vente') === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="buyPrice"
              label="Prix d'achat"
              type="number"
              min={0}
              value={form.buyPrice}
              onChange={(e) => setForm({ ...form, buyPrice: Number(e.target.value) })}
              placeholder="Ex : 2500"
              required
            />
            <Input
              id="sellPrice"
              label="Prix de vente"
              type="number"
              min={0}
              value={form.sellPrice}
              onChange={(e) => setForm({ ...form, sellPrice: Number(e.target.value) })}
              placeholder="Ex : 3500"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="quantity"
              label="Quantité en stock"
              type="number"
              min={0}
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
              placeholder="Ex : 100"
              required
            />
            <Input
              id="alertThreshold"
              label="Seuil d'alerte"
              type="number"
              min={0}
              value={form.alertThreshold}
              onChange={(e) => setForm({ ...form, alertThreshold: Number(e.target.value) })}
              placeholder="Ex : 5"
              required
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">{editing ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title={`Historique des prix — ${historyProductName}`}
      >
        {priceHistory.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-6">Aucun changement de prix enregistré.</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {priceHistory.map((h) => (
              <div key={h.id} className="border border-border rounded-lg p-3 text-sm">
                <p className="text-xs text-text-muted mb-2">
                  {new Date(h.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-text-muted">Achat : </span>
                    <span className={h.oldBuyPrice !== h.newBuyPrice ? 'line-through text-text-muted' : 'text-text'}>{formatCurrency(h.oldBuyPrice)}</span>
                    {h.oldBuyPrice !== h.newBuyPrice && <span className="text-text font-medium"> → {formatCurrency(h.newBuyPrice)}</span>}
                  </div>
                  <div>
                    <span className="text-text-muted">Vente : </span>
                    <span className={h.oldSellPrice !== h.newSellPrice ? 'line-through text-text-muted' : 'text-text'}>{formatCurrency(h.oldSellPrice)}</span>
                    {h.oldSellPrice !== h.newSellPrice && <span className="text-text font-medium"> → {formatCurrency(h.newSellPrice)}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
