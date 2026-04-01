import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Download, Landmark, Plus, Search, Trash2, TrendingUp } from 'lucide-react';
import { db } from '@/db';
import type { CapitalEntry } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Card } from '@/components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { exportCSV } from '@/lib/export';
import { capitalSchema, validate } from '@/lib/validation';
import { formatCurrency, formatDate, generateId, normalizeForSearch, nowISO } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { trackDeletion } from '@/services/syncService';

const emptyCapitalForm = () => ({
  source: '',
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  note: '',
});

export function CapitalPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [form, setForm] = useState(emptyCapitalForm());

  const capitalEntries = useLiveQuery(
    async () => (await db.capitalEntries.orderBy('date').reverse().toArray()).filter((entry) => !entry.deleted),
    []
  ) ?? [];
  const users = useLiveQuery(async () => (await db.users.toArray()).filter((u) => !u.deleted)) ?? [];
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  const filteredEntries = useMemo(() => {
    return capitalEntries.filter((entry) => {
      if (dateFrom && entry.date < dateFrom) return false;
      if (dateTo && entry.date > dateTo + 'T23:59:59') return false;
      if (search) {
        const q = normalizeForSearch(search);
        return (
          normalizeForSearch(entry.source).includes(q) ||
          normalizeForSearch(entry.note ?? '').includes(q) ||
          (entry.userId ? normalizeForSearch(userMap.get(entry.userId) ?? '').includes(q) : false)
        );
      }
      return true;
    });
  }, [capitalEntries, dateFrom, dateTo, search, userMap]);

  const totalCapital = useMemo(
    () => capitalEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [capitalEntries]
  );

  const filteredCapital = useMemo(
    () => filteredEntries.reduce((sum, entry) => sum + entry.amount, 0),
    [filteredEntries]
  );

  const capitalThisMonth = useMemo(() => {
    const prefix = new Date().toISOString().slice(0, 7);
    return capitalEntries
      .filter((entry) => entry.date.startsWith(prefix))
      .reduce((sum, entry) => sum + entry.amount, 0);
  }, [capitalEntries]);

  const openAdd = () => {
    setForm(emptyCapitalForm());
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const vResult = validate(capitalSchema, {
      source: form.source.trim(),
      amount: Number(form.amount),
      date: form.date,
      note: form.note.trim(),
    });
    if (!vResult.success) {
      toast.error(Object.values(vResult.errors)[0]);
      return;
    }

    const now = nowISO();
    const dateValue = new Date(form.date + 'T12:00:00').toISOString();
    const id = generateId();

    await db.capitalEntries.add({
      id,
      source: form.source.trim(),
      amount: Number(form.amount),
      date: dateValue,
      note: form.note.trim() || undefined,
      userId: currentUser?.id,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    await logAction({
      action: 'creation',
      entity: 'capital',
      entityId: id,
      entityName: form.source.trim(),
      details: `${formatCurrency(Number(form.amount))}${form.note.trim() ? ` - ${form.note.trim()}` : ''}`,
    });

    setModalOpen(false);
    setForm(emptyCapitalForm());
    toast.success('Apport en capital enregistre');
  };

  const handleDelete = async (entry: CapitalEntry) => {
    const ok = await confirmAction({
      title: 'Supprimer l\'apport',
      message: `Supprimer cet apport de ${formatCurrency(entry.amount)} ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    const now = nowISO();
    await db.capitalEntries.update(entry.id, {
      deleted: true,
      updatedAt: now,
      syncStatus: 'pending',
    });
    await trackDeletion('capitalEntries', entry.id);
    await logAction({
      action: 'suppression',
      entity: 'capital',
      entityId: entry.id,
      entityName: entry.source,
      details: formatCurrency(entry.amount),
    });
    toast.success('Apport supprime');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <Landmark size={24} className="text-primary" />
          <h1 className="text-2xl font-bold text-text">Capital</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = filteredEntries.map((entry) => [
                formatDate(entry.date),
                entry.source,
                entry.note ?? '',
                formatCurrency(entry.amount),
                entry.userId ? userMap.get(entry.userId) ?? '' : '',
              ]);
              exportCSV('capital', ['Date', 'Source', 'Note', 'Montant', 'Ajoute par'], rows);
              toast.success('Export CSV telecharge');
            }}
            disabled={filteredEntries.length === 0}
          >
            <Download size={16} /> CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus size={18} /> Ajouter capital
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Rechercher par source, note ou utilisateur..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-2">
            <Landmark size={18} className="text-primary" />
            <p className="text-sm text-text-muted">Capital cumule</p>
          </div>
          <p className="text-2xl font-bold text-text mt-1">{formatCurrency(totalCapital)}</p>
          <p className="text-xs text-text-muted mt-1">{capitalEntries.length} apport(s)</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-600" />
            <p className="text-sm text-text-muted">Ajouts du mois</p>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(capitalThisMonth)}</p>
          <p className="text-xs text-text-muted mt-1">Mois en cours</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2">
            <Search size={18} className="text-amber-500" />
            <p className="text-sm text-text-muted">Total filtre</p>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-1">{formatCurrency(filteredCapital)}</p>
          <p className="text-xs text-text-muted mt-1">{filteredEntries.length} ligne(s)</p>
        </Card>
      </div>

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              <Th>Date</Th>
              <Th>Source</Th>
              <Th>Note</Th>
              <Th>Montant</Th>
              <Th>Ajoute par</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {filteredEntries.length === 0 ? (
              <Tr>
                <Td colSpan={6} className="text-center text-text-muted py-8">
                  Aucun apport en capital enregistre
                </Td>
              </Tr>
            ) : (
              filteredEntries.map((entry) => (
                <Tr key={entry.id}>
                  <Td className="text-text-muted whitespace-nowrap">{formatDate(entry.date)}</Td>
                  <Td className="font-medium">{entry.source}</Td>
                  <Td className="max-w-[260px] truncate">{entry.note?.trim() ? entry.note : '-'}</Td>
                  <Td className="font-semibold text-emerald-600">{formatCurrency(entry.amount)}</Td>
                  <Td>{entry.userId ? userMap.get(entry.userId) ?? '-' : '-'}</Td>
                  <Td>
                    <button onClick={() => handleDelete(entry)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
                      <Trash2 size={16} className="text-danger" />
                    </button>
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
        title="Ajouter un apport en capital"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="capitalSource"
            label="Source"
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
            placeholder="Ex : apport personnel, investisseur, caisse de depart"
            required
          />
          <Input
            id="capitalAmount"
            label="Montant (FCFA)"
            type="number"
            min={0}
            value={form.amount === 0 ? '' : form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })}
            placeholder="Ex : 500000"
            required
          />
          <Input
            id="capitalDate"
            label="Date"
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="capitalNote" className="text-sm font-medium text-text">Note</label>
            <textarea
              id="capitalNote"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              rows={3}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              placeholder="Ex : capital initial de la boutique"
            />
          </div>
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
