import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, ArrowLeft, Download } from 'lucide-react';
import { db } from '@/db';
import type { Product, ProductUsage } from '@/types';
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
    setForm({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      categoryId: product.categoryId,
      sellPrice: product.sellPrice,
      alertThreshold: product.alertThreshold,
      usage: product.usage,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const result = validate(productSchema, {
      name: form.name || '',
      barcode: form.barcode,
      categoryId: form.categoryId || '',
      buyPrice: editing?.buyPrice ?? 0,
      sellPrice: Number(form.sellPrice),
      quantity: editing?.quantity ?? 0,
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
      if (form.name !== editing.name) changes.push(`Nom : ${editing.name} -> ${form.name}`);
      if (form.barcode !== editing.barcode) changes.push(`Code-barres : ${editing.barcode || '-'} -> ${form.barcode || '-'}`);
      if (form.categoryId !== editing.categoryId) {
        const oldCat = categories.find((c) => c.id === editing.categoryId)?.name ?? '-';
        const newCat = categories.find((c) => c.id === form.categoryId)?.name ?? '-';
        changes.push(`Categorie : ${oldCat} -> ${newCat}`);
      }
      if (Number(form.sellPrice) !== editing.sellPrice) {
        changes.push(`Prix vente : ${formatCurrency(editing.sellPrice)} -> ${formatCurrency(Number(form.sellPrice))}`);
      }
      if (Number(form.alertThreshold) !== editing.alertThreshold) {
        changes.push(`Seuil alerte : ${editing.alertThreshold} -> ${Number(form.alertThreshold)}`);
      }
      if ((form.usage || 'achat_vente') !== (editing.usage || 'achat_vente')) {
        changes.push(`Usage : ${usageLabels[editing.usage || 'achat_vente']} -> ${usageLabels[form.usage || 'achat_vente']}`);
      }

      await db.products.update(editing.id, {
        name: form.name!,
        barcode: form.barcode || '',
        categoryId: form.categoryId!,
        sellPrice: Number(form.sellPrice),
        alertThreshold: Number(form.alertThreshold),
        usage: form.usage || 'achat_vente',
        updatedAt: now,
        syncStatus: 'pending',
      });

      const sellChanged = Number(form.sellPrice) !== editing.sellPrice;
      if (sellChanged) {
        await db.priceHistory.add({
          id: generateId(),
          productId: editing.id,
          oldBuyPrice: editing.buyPrice,
          newBuyPrice: editing.buyPrice,
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
        buyPrice: 0,
        sellPrice: Number(form.sellPrice),
        quantity: 0,
        alertThreshold: Number(form.alertThreshold),
        usage: form.usage || 'achat_vente',
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({ action: 'creation', entity: 'produit', entityId: id, entityName: form.name });
    }

    setModalOpen(false);
    toast.success(editing ? 'Produit modifie' : 'Produit ajoute');
  };

  const handleDelete = async (id: string) => {
    const product = await db.products.get(id);
    if (!product) return;
  
    const ok = await confirmAction({
      title: 'Supprimer le produit',
      message: `Supprimer le produit "${product.name}" ?\n\nCette action supprimera aussi ses mouvements de stock associés.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
  
    // Afficher un toast de chargement
    const loadingToast = toast.loading('Suppression en cours...');
  
    try {
      const movementIds = await db.stockMovements.where('productId').equals(id).primaryKeys();
      const now = nowISO();
  
      // Utiliser une transaction pour optimiser
      await db.transaction('rw', [db.products, db.stockMovements], async () => {
        await db.products.update(id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
        
        for (const mId of movementIds) {
          await db.stockMovements.update(mId as string, { deleted: true, updatedAt: now, syncStatus: 'pending' });
          await trackDeletion('stockMovements', mId as string);
        }
      });
  
      await trackDeletion('products', id);
      await logAction({ action: 'suppression', entity: 'produit', entityId: id, entityName: product.name });
  
      // Fermer le toast de chargement et afficher le succès
      toast.dismiss(loadingToast);
      toast.success('Produit supprimé');
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors"
            title="Retour"
          >
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
                categories.find((c) => c.id === p.categoryId)?.name ?? '-',
                formatCurrency(p.sellPrice),
                p.quantity,
                p.alertThreshold,
              ]);
              exportCSV('produits', ['Nom', 'Categorie', 'Prix vente', 'Stock', 'Seuil alerte'], rows);
              toast.success('Export CSV telecharge');
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
                  title: 'Supprimer les produits selectionnes',
                  message: `Voulez-vous supprimer ${selectedIds.length} produit(s) selectionne(s) ?`,
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
                toast.success('Produits supprimes');
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
          <option value="">Toutes les categories</option>
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
              <Th>Categorie</Th>
              <Th>Usage</Th>
              <Th>Prix vente</Th>
              <Th>Stock</Th>
              <Th>Statut</Th>
              <Th />
            </Tr>
          </Thead>

          <Tbody>
            {products.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 8 : 7} className="text-center text-text-muted py-8">
                  Aucun produit trouve
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

                  <Td>{categoryMap.get(p.categoryId) ?? '-'}</Td>

                  <Td>
                    <Badge variant={usageVariants[p.usage || 'achat_vente']}>
                      {usageLabels[p.usage || 'achat_vente']}
                    </Badge>
                  </Td>

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
              Categorie
            </label>
            <select
              id="categoryId"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              required
            >
              <option value="">Selectionner une categorie</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
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

          <div className="grid grid-cols-1 gap-3">
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

          <div className="grid grid-cols-1 gap-3">
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
          <p className="text-xs text-text-muted">
            Le stock initial est a 0. Les entrees de stock se font uniquement via reception de commande fournisseur ou retour client.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">{editing ? 'Modifier' : 'Ajouter'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
