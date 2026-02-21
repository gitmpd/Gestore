import { useState, useMemo, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Wallet, TrendingDown, Search, ArrowLeft, Download } from 'lucide-react';
import { db } from '@/db';
import type { Expense, ExpenseCategory } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO, formatCurrency, formatDate } from '@/lib/utils';
import { exportCSV } from '@/lib/export';
import { expenseSchema, validate } from '@/lib/validation';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { trackDeletion } from '@/services/syncService';

export const expenseCategoryLabels: Record<ExpenseCategory, string> = {
  loyer: 'Loyer',
  salaires: 'Salaires',
  transport: 'Transport',
  electricite: 'Électricité',
  eau: 'Eau',
  internet_telephone: 'Internet / Téléphone',
  equipement: 'Équipement',
  entretien: 'Entretien',
  marketing: 'Marketing',
  taxes: 'Taxes / Impôts',
  autre: 'Autre',
};

const categoryColors: Record<ExpenseCategory, string> = {
  loyer: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  salaires: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  transport: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
  electricite: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  eau: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400',
  internet_telephone: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  equipement: 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300',
  entretien: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  marketing: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
  taxes: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  autre: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
};

type FilterPeriod = 'this_month' | 'last_month' | '3_months' | 'all';

function getFilterDate(period: FilterPeriod): Date | null {
  if (period === 'all') return null;
  const d = new Date();
  if (period === 'this_month') {
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else if (period === 'last_month') {
    d.setMonth(d.getMonth() - 1);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
  } else {
    d.setMonth(d.getMonth() - 3);
    d.setHours(0, 0, 0, 0);
  }
  return d;
}

const emptyExpense = (): Partial<Expense> => ({
  category: 'autre',
  amount: 0,
  description: '',
  date: new Date().toISOString().slice(0, 10),
  recurring: false,
});

export function ExpensesPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const isGerant = currentUser?.role === 'gerant';
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [form, setForm] = useState<Partial<Expense>>(emptyExpense());
  const [period, setPeriod] = useState<FilterPeriod>('this_month');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expenseSearch, setExpenseSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const allExpenses = useLiveQuery(() => db.expenses.orderBy('date').reverse().toArray()) ?? [];
  const allUsers = useLiveQuery(async () => (await db.users.toArray()).filter((u) => !u.deleted)) ?? [];
  const userMap = new Map(allUsers.map((u) => [u.id, u.name]));

  const filterDate = useMemo(() => getFilterDate(period), [period]);

  const expenses = useMemo(() => {
    return allExpenses.filter((e) => {
      if (filterDate && new Date(e.date) < filterDate) return false;
      if (dateFrom && e.date < dateFrom) return false;
      if (dateTo && e.date > dateTo + 'T23:59:59') return false;
      if (categoryFilter && e.category !== categoryFilter) return false;
      if (expenseSearch) {
        const q = expenseSearch.toLowerCase();
        return (
          e.description.toLowerCase().includes(q) ||
          expenseCategoryLabels[e.category].toLowerCase().includes(q) ||
          (e.userId && (userMap.get(e.userId) ?? '').toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [allExpenses, filterDate, categoryFilter, expenseSearch, userMap, dateFrom, dateTo]);

  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const expensesByCategory = useMemo(() => {
    const map = new Map<ExpenseCategory, number>();
    for (const e of expenses) {
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([cat, amount]) => ({ category: cat, amount }));
  }, [expenses]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyExpense());
    setModalOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditing(expense);
    setForm({ ...expense, date: expense.date.slice(0, 10) });
    setModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const vResult = validate(expenseSchema, {
      category: form.category || '',
      amount: Number(form.amount),
      description: form.description || '',
      date: form.date || '',
      recurring: form.recurring ?? false,
    });
    if (!vResult.success) {
      toast.error(Object.values(vResult.errors)[0]);
      return;
    }
    const now = nowISO();
    const dateValue = new Date(form.date + 'T12:00:00').toISOString();

    if (editing) {
      const changes: string[] = [];
      if (form.category !== editing.category) changes.push(`Catégorie : ${expenseCategoryLabels[editing.category]} → ${expenseCategoryLabels[form.category as ExpenseCategory]}`);
      if (Number(form.amount) !== editing.amount) changes.push(`Montant : ${formatCurrency(editing.amount)} → ${formatCurrency(Number(form.amount))}`);
      if (form.description !== editing.description) changes.push(`Description : ${editing.description} → ${form.description}`);
      if (dateValue !== editing.date) changes.push(`Date : ${formatDate(editing.date)} → ${formatDate(dateValue)}`);
      if ((form.recurring ?? false) !== editing.recurring) changes.push(`Récurrent : ${editing.recurring ? 'Oui' : 'Non'} → ${form.recurring ? 'Oui' : 'Non'}`);

      await db.expenses.update(editing.id, {
        category: form.category,
        amount: Number(form.amount),
        description: form.description,
        date: dateValue,
        recurring: form.recurring ?? false,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({
        action: 'modification',
        entity: 'depense',
        entityId: editing.id,
        entityName: expenseCategoryLabels[form.category as ExpenseCategory],
        details: changes.length > 0 ? changes.join('\n') : 'Aucune modification',
      });
    } else {
      const id = generateId();
      await db.expenses.add({
        id,
        category: form.category as ExpenseCategory,
        amount: Number(form.amount),
        description: form.description!,
        date: dateValue,
        recurring: form.recurring ?? false,
        userId: currentUser?.id,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({
        action: 'depense',
        entity: 'depense',
        entityId: id,
        entityName: expenseCategoryLabels[form.category as ExpenseCategory],
        details: `${formatCurrency(Number(form.amount))} — ${form.description}`,
      });
    }
    setModalOpen(false);
    toast.success(editing ? 'Dépense modifiée' : 'Dépense enregistrée');
  };

  const handleDelete = async (expense: Expense) => {
    const ok = await confirmAction({
      title: 'Supprimer la dépense',
      message: `Supprimer cette dépense de ${formatCurrency(expense.amount)} ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    const now = nowISO();
    await db.expenses.update(expense.id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
    await trackDeletion('expenses', expense.id);
    await logAction({
      action: 'suppression',
      entity: 'depense',
      entityId: expense.id,
      entityName: expenseCategoryLabels[expense.category],
      details: formatCurrency(expense.amount),
    });
  };

  const periodLabels: Record<FilterPeriod, string> = {
    this_month: 'Ce mois',
    last_month: 'Mois dernier',
    '3_months': '3 mois',
    all: 'Tout',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <Wallet size={24} className="text-primary" />
          <h1 className="text-2xl font-bold text-text">Dépenses</h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const rows = expenses.map((exp) => [
                formatDate(exp.date),
                expenseCategoryLabels[exp.category],
                exp.description,
                formatCurrency(exp.amount),
                exp.recurring ? 'Oui' : 'Non',
              ]);
              exportCSV('depenses', ['Date', 'Catégorie', 'Description', 'Montant', 'Récurrent'], rows);
              toast.success('Export CSV téléchargé');
            }}
            disabled={expenses.length === 0}
          >
            <Download size={16} /> CSV
          </Button>
          <Button onClick={openAdd}>
            <Plus size={18} /> Nouvelle dépense
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Rechercher par description, catégorie..."
          value={expenseSearch}
          onChange={(e) => setExpenseSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-2 flex-wrap">
          {(Object.keys(periodLabels) as FilterPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                period === p
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>
        <select
          className="rounded-lg border border-border bg-surface text-text px-3 py-2 text-sm"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {Object.entries(expenseCategoryLabels).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-2">
            <TrendingDown size={18} className="text-red-500" />
            <p className="text-sm text-text-muted">Total dépenses</p>
          </div>
          <p className="text-2xl font-bold text-red-600 mt-1">{formatCurrency(totalExpenses)}</p>
          <p className="text-xs text-text-muted mt-1">{expenses.length} dépense(s)</p>
        </Card>

        {expensesByCategory.slice(0, 2).map(({ category, amount }) => (
          <Card key={category}>
            <p className="text-sm text-text-muted">{expenseCategoryLabels[category]}</p>
            <p className="text-2xl font-bold text-text mt-1">{formatCurrency(amount)}</p>
            <p className="text-xs text-text-muted mt-1">
              {totalExpenses > 0 ? ((amount / totalExpenses) * 100).toFixed(0) : 0}% du total
            </p>
          </Card>
        ))}
      </div>

      {expensesByCategory.length > 0 && (
        <Card>
          <CardTitle>Répartition par catégorie</CardTitle>
          <div className="space-y-2 mt-3">
            {expensesByCategory.map(({ category, amount }) => {
              const pct = totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0;
              return (
                <div key={category} className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColors[category]}`}>
                    {expenseCategoryLabels[category]}
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-text w-28 text-right">
                    {formatCurrency(amount)}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="bg-surface rounded-xl border border-border">
        <Table>
          <Thead>
            <Tr>
              <Th>Date</Th>
              <Th>Catégorie</Th>
              <Th>Description</Th>
              <Th>Montant</Th>
              {isGerant && <Th>Ajouté par</Th>}
              <Th>Récurrent</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {expenses.length === 0 ? (
              <Tr>
                <Td colSpan={isGerant ? 7 : 6} className="text-center text-text-muted py-8">
                  Aucune dépense enregistrée pour cette période
                </Td>
              </Tr>
            ) : (
              expenses.map((exp) => (
                <Tr key={exp.id}>
                  <Td className="text-text-muted whitespace-nowrap">{formatDate(exp.date)}</Td>
                  <Td>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${categoryColors[exp.category]}`}>
                      {expenseCategoryLabels[exp.category]}
                    </span>
                  </Td>
                  <Td className="max-w-[200px] truncate">{exp.description}</Td>
                  <Td className="font-semibold text-red-600">{formatCurrency(exp.amount)}</Td>
                  {isGerant && (
                    <Td className="text-sm">{exp.userId ? userMap.get(exp.userId) ?? '—' : '—'}</Td>
                  )}
                  <Td>
                    {exp.recurring ? (
                      <Badge variant="info">Oui</Badge>
                    ) : (
                      <span className="text-text-muted text-sm">Non</span>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(exp)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Pencil size={16} className="text-text-muted" />
                      </button>
                      <button onClick={() => handleDelete(exp)} className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
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
        title={editing ? 'Modifier la dépense' : 'Nouvelle dépense'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="expCategory" className="text-sm font-medium text-text">Catégorie</label>
            <select
              id="expCategory"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
              required
            >
              {Object.entries(expenseCategoryLabels).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Input
            id="expAmount"
            label="Montant (FCFA)"
            type="number"
            min={0}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            placeholder="Ex : 15000"
            required
          />
          <Input
            id="expDesc"
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Ex: Loyer boutique mois de février..."
            required
          />
          <Input
            id="expDate"
            label="Date"
            type="date"
            value={form.date?.slice(0, 10)}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            required
          />
          <div className="flex items-center gap-2">
            <input
              id="expRecurring"
              type="checkbox"
              checked={form.recurring ?? false}
              onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="expRecurring" className="text-sm text-text">
              Dépense récurrente (mensuelle)
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">{editing ? 'Modifier' : 'Enregistrer'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
