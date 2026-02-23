import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, ArrowDownCircle, ArrowUpCircle, RefreshCw, Search, ArrowLeft, Download, RotateCcw } from 'lucide-react';
import { db } from '@/db';
import type { StockMovementType } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ComboBox } from '@/components/ui/ComboBox';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO, formatDateTime } from '@/lib/utils';
import { exportCSV } from '@/lib/export';
import { stockMovementSchema, validate } from '@/lib/validation';
import { logAction } from '@/services/auditService';

type ManualMovementType = 'ajustement' | 'retour';

const typeLabels: Record<StockMovementType, string> = {
  entree: 'Entrée',
  sortie: 'Sortie',
  ajustement: 'Ajustement',
  retour: 'Retour client',
};

const typeVariants: Record<StockMovementType, 'success' | 'danger' | 'info' | 'warning'> = {
  entree: 'success',
  sortie: 'danger',
  ajustement: 'info',
  retour: 'warning',
};

const typeIcons: Record<StockMovementType, typeof ArrowDownCircle> = {
  entree: ArrowDownCircle,
  sortie: ArrowUpCircle,
  ajustement: RefreshCw,
  retour: RotateCcw,
};

export function StockPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isGerant = currentUser?.role === 'gerant';
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);
  const [type, setType] = useState<ManualMovementType>('ajustement');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('');

  const [stockSearch, setStockSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<StockMovementType | 'all'>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    const preselect = searchParams.get('product');
    const preselectType = searchParams.get('type');
    if (preselect) {
      setProductId(preselect);
      if (preselectType === 'retour' || preselectType === 'ajustement') {
        setType(preselectType);
      }
      setModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const movements = useLiveQuery(async () => (await db.stockMovements.orderBy('date').reverse().limit(200).toArray()).filter((m) => !(m as any).deleted)) ?? [];

  const products = useLiveQuery(async () => (await db.products.orderBy('name').toArray()).filter((p) => !p.deleted)) ?? [];
  const users = useLiveQuery(async () => (await db.users.toArray()).filter((u) => !u.deleted)) ?? [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (typeFilter !== 'all' && m.type !== typeFilter) return false;
      if (dateFrom && m.date < dateFrom) return false;
      if (dateTo && m.date > dateTo + 'T23:59:59') return false;
      if (stockSearch) {
        const q = stockSearch.toLowerCase();
        return (
          m.productName.toLowerCase().includes(q) ||
          m.reason.toLowerCase().includes(q) ||
          (m.userId && (userMap.get(m.userId) ?? '').toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [movements, stockSearch, typeFilter, userMap, dateFrom, dateTo]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const vResult = validate(stockMovementSchema, { productId, type, quantity, reason });
    if (!vResult.success) {
      toast.error(Object.values(vResult.errors)[0]);
      return;
    }
    const product = await db.products.get(productId);
    if (!product) return;

    const now = nowISO();
    const previousQty = product.quantity;
    let newQty = product.quantity;
    if (type === 'retour') {
      newQty += quantity;
    } else {
      if (quantity > product.quantity && !isGerant) {
        toast.error(
          `Ajustement invalide: seul le gerant peut augmenter le stock (${product.quantity} -> ${quantity}).`
        );
        return;
      }
      newQty = quantity;
    }

    await db.products.update(productId, {
      quantity: newQty,
      updatedAt: now,
      syncStatus: 'pending',
    });

    await db.stockMovements.add({
      id: generateId(),
      productId,
      productName: product.name,
      type,
      quantity,
      date: now,
      reason,
      userId: currentUser?.id,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    const typeLabel = typeLabels[type];
    const delta = newQty - previousQty;
    const deltaLabel = delta > 0 ? `+${delta}` : `${delta}`;
    await logAction({
      action: 'mouvement_stock',
      entity: 'stock',
      entityId: productId,
      entityName: product.name,
      details:
        type === 'ajustement'
          ? `${typeLabel}: ${previousQty} -> ${newQty} (${deltaLabel}) - ${reason}`
          : `${typeLabel}: +${quantity} (${previousQty} -> ${newQty}) - ${reason}`,
    });

    setModalOpen(false);
    setProductId('');
    setQuantity(0);
    setReason('');
    toast.success(`Mouvement de stock enregistré`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Mouvements de stock</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = filteredMovements.map((m) => [
                m.productName,
                typeLabels[m.type],
                m.quantity,
                m.reason,
                new Date(m.date).toLocaleDateString('fr-FR'),
              ]);
              exportCSV('mouvements_stock', ['Produit', 'Type', 'Quantité', 'Raison', 'Date'], rows);
              toast.success('Export CSV téléchargé');
            }}
            disabled={filteredMovements.length === 0}
          >
            <Download size={16} /> CSV
          </Button>
          <Button onClick={() => setModalOpen(true)}>
            <Plus size={18} /> Nouveau mouvement
          </Button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Rechercher par produit ou raison..."
            value={stockSearch}
            onChange={(e) => setStockSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'entree', 'sortie', 'ajustement', 'retour'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                typeFilter === t
                  ? 'bg-primary text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-text-muted hover:bg-slate-200 dark:hover:bg-slate-600'
              }`}
            >
              {t === 'all' ? 'Tous' : typeLabels[t]}
            </button>
          ))}
        </div>
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
              <Th>Type</Th>
              <Th>Produit</Th>
              <Th>Quantité</Th>
              <Th>Raison</Th>
              {isGerant && <Th>Effectué par</Th>}
              <Th>Date</Th>
            </Tr>
          </Thead>
          <Tbody>
            {filteredMovements.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 6 : 5} className="text-center text-text-muted py-8">
                  {movements.length === 0 ? 'Aucun mouvement enregistré' : 'Aucun mouvement ne correspond aux filtres'}
                </Td>
              </Tr>
            ) : (
              filteredMovements.map((m) => {
                const Icon = typeIcons[m.type];
                return (
                  <Tr key={m.id}>
                    <Td>
                      <Badge variant={typeVariants[m.type]} className="flex items-center gap-1 w-fit">
                        <Icon size={14} /> {typeLabels[m.type]}
                      </Badge>
                    </Td>
                    <Td className="font-medium">{m.productName}</Td>
                    <Td className="font-semibold">{m.quantity}</Td>
                    <Td className="text-text-muted">{m.reason}</Td>
                    {isGerant && (
                      <Td className="text-sm">{m.userId ? userMap.get(m.userId) ?? '—' : '—'}</Td>
                    )}
                    <Td className="text-text-muted">{formatDateTime(m.date)}</Td>
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
        title="Nouveau mouvement de stock"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-text-muted">
            Entrée et sortie sont automatiques (réception commande fournisseur et ventes). Ici: retour client, ou ajustement manuel (hausse autorisee uniquement pour le gerant).
          </p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Type</label>
            <div className="flex gap-2">
              {(['ajustement', 'retour'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {typeLabels[t]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Produit</label>
            <ComboBox
              options={products.map((p) => ({
                value: p.id,
                label: p.name,
                sublabel: `Stock: ${p.quantity}`,
              }))}
              value={productId}
              onChange={setProductId}
              placeholder="Rechercher un produit..."
              required
            />
          </div>

          <Input
            id="qty"
            label={type === 'ajustement' ? 'Nouvelle quantite reelle' : 'Quantite'}
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value) || 0)}
            placeholder="Ex : 10"
            required
          />
          <Input
            id="reason"
            label="Raison"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ex: Retour client, correction inventaire..."
            required
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}



