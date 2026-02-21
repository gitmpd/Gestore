import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Tag, Search, ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import type { Category } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { generateId, nowISO } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { trackDeletion } from '@/services/syncService';

export function CategoriesPage() {
  const navigate = useNavigate();
  const isGerant = useAuthStore((s) => s.user?.role) === 'gerant';
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');

  const allCategories = useLiveQuery(() => db.categories.orderBy('name').toArray()) ?? [];
  const categories = allCategories.filter(
    (c) => !c.deleted && (!search || c.name.toLowerCase().includes(search.toLowerCase()))
  );

  const productCounts = useLiveQuery(async () => {
    const products = (await db.products.toArray()).filter((p) => !p.deleted);
    const counts = new Map<string, number>();
    products.forEach((p) => {
      counts.set(p.categoryId, (counts.get(p.categoryId) ?? 0) + 1);
    });
    return counts;
  }) ?? new Map<string, number>();

  const openAdd = () => {
    setEditing(null);
    setName('');
    setModalOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name);
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const existing = allCategories.find(
      (c) => c.name.toLowerCase() === trimmed.toLowerCase() && c.id !== editing?.id
    );
    if (existing) {
      toast.warning('Cette catégorie existe déjà');
      return;
    }

    const now = nowISO();

    if (editing) {
      const details = editing.name !== trimmed
        ? `Nom : ${editing.name} → ${trimmed}`
        : 'Aucune modification';

      await db.categories.update(editing.id, {
        name: trimmed,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({
        action: 'modification',
        entity: 'categorie',
        entityId: editing.id,
        entityName: trimmed,
        details,
      });
    } else {
      const id = generateId();
      await db.categories.add({
        id,
        name: trimmed,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({ action: 'creation', entity: 'categorie', entityId: id, entityName: trimmed });
    }
    setModalOpen(false);
    toast.success(editing ? 'Catégorie modifiée' : 'Catégorie ajoutée');
  };

  const handleDelete = async (cat: Category) => {
    const count = productCounts.get(cat.id) ?? 0;
    if (count > 0) {
      toast.error(
        `Impossible de supprimer « ${cat.name} » : ${count} produit(s) utilisent cette catégorie.`
      );
      return;
    }
    const ok = await confirmAction({
      title: 'Supprimer la catégorie',
      message: `Supprimer la catégorie « ${cat.name} » ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (ok) {
      const now = nowISO();
      await db.categories.update(cat.id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
      await trackDeletion('categories', cat.id);
      await logAction({ action: 'suppression', entity: 'categorie', entityId: cat.id, entityName: cat.name });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Catégories</h1>
        </div>
        <Button onClick={openAdd}>
          <Plus size={18} /> Ajouter
        </Button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Rechercher une catégorie..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              <Th>Catégorie</Th>
              <Th>Produits</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {categories.length === 0 ? (
              <Tr>
                <Td colSpan={3} className="text-center text-text-muted py-8">
                  {allCategories.length === 0
                    ? 'Aucune catégorie. Cliquez sur « Ajouter » pour en créer une.'
                    : 'Aucune catégorie ne correspond à la recherche'}
                </Td>
              </Tr>
            ) : (
              categories.map((cat) => {
                const count = productCounts.get(cat.id) ?? 0;
                return (
                  <Tr key={cat.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Tag size={16} className="text-primary" />
                        <span className="font-medium">{cat.name}</span>
                      </div>
                    </Td>
                    <Td>
                      <Badge variant={count > 0 ? 'info' : 'default'}>
                        {count} produit{count !== 1 ? 's' : ''}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(cat)}
                          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
                        >
                          <Pencil size={16} className="text-text-muted" />
                        </button>
                        {isGerant && (
                          <button
                            onClick={() => handleDelete(cat)}
                            className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30"
                          >
                            <Trash2 size={16} className="text-danger" />
                          </button>
                        )}
                      </div>
                    </Td>
                  </Tr>
                );
              })
            )}
          </Tbody>
        </Table>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="catName"
            label="Nom de la catégorie"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex : Alimentation, Boissons, Hygiène..."
            required
          />
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
