import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Search, Pencil, Trash2, CreditCard, ArrowLeft } from 'lucide-react';
import { db } from '@/db';
import type { Customer } from '@/types';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { generateId, nowISO, formatCurrency, formatDateTime } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { trackDeletion } from '@/services/syncService';

const emptyCustomer = (): Partial<Customer> => ({
  name: '',
  phone: '',
  creditBalance: 0,
});

export function CustomersPage() {
  const navigate = useNavigate();
  const isGerant = useAuthStore((s) => s.user?.role) === 'gerant';
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Partial<Customer>>(emptyCustomer());
  const [creditAmount, setCreditAmount] = useState(0);
  const [creditType, setCreditType] = useState<'credit' | 'payment'>('payment');
  const [creditNote, setCreditNote] = useState('');

  const customers = useLiveQuery(async () => {
    const all = await db.customers.toArray();
    return all
      .filter(
        (c) =>
          !search ||
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          c.phone.includes(search)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [search]) ?? [];

  const customerTransactions = useLiveQuery(async () => {
    if (!selectedCustomer) return [];
    return db.creditTransactions
      .where('customerId')
      .equals(selectedCustomer.id)
      .reverse()
      .sortBy('date');
  }, [selectedCustomer]) ?? [];

  const openAdd = () => {
    setEditing(null);
    setForm(emptyCustomer());
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setForm({ ...c });
    setModalOpen(true);
  };

  const openCredit = (c: Customer) => {
    setSelectedCustomer(c);
    setCreditAmount(0);
    setCreditNote('');
    setCreditType('payment');
    setCreditModalOpen(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const now = nowISO();
    if (editing) {
      const changes: string[] = [];
      if (form.name !== editing.name) changes.push(`Nom : ${editing.name} → ${form.name}`);
      if (form.phone !== editing.phone) changes.push(`Téléphone : ${editing.phone} → ${form.phone}`);

      await db.customers.update(editing.id, {
        name: form.name,
        phone: form.phone,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({
        action: 'modification',
        entity: 'client',
        entityId: editing.id,
        entityName: form.name,
        details: changes.length > 0 ? changes.join('\n') : 'Aucune modification',
      });
    } else {
      const id = generateId();
      await db.customers.add({
        id,
        name: form.name!,
        phone: form.phone!,
        creditBalance: 0,
        createdAt: now,
        updatedAt: now,
        syncStatus: 'pending',
      });
      await logAction({ action: 'creation', entity: 'client', entityId: id, entityName: form.name });
    }
    setModalOpen(false);
    toast.success(editing ? 'Client modifié' : 'Client ajouté');
  };

  const handleCreditSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const now = nowISO();

    const newBalance =
      creditType === 'credit'
        ? selectedCustomer.creditBalance + creditAmount
        : selectedCustomer.creditBalance - creditAmount;

    await db.customers.update(selectedCustomer.id, {
      creditBalance: Math.max(0, newBalance),
      updatedAt: now,
      syncStatus: 'pending',
    });

    await db.creditTransactions.add({
      id: generateId(),
      customerId: selectedCustomer.id,
      amount: creditAmount,
      type: creditType,
      date: now,
      note: creditNote,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    });

    await logAction({
      action: creditType === 'payment' ? 'paiement' : 'credit',
      entity: 'credit',
      entityId: selectedCustomer.id,
      entityName: selectedCustomer.name,
      details: `${formatCurrency(creditAmount)} — ${creditNote || 'Aucune note'}`,
    });

    setCreditModalOpen(false);
  };

  const handleDelete = async (id: string) => {
    const customer = await db.customers.get(id);
    if (!customer) return;
    const ok = await confirmAction({
      title: 'Supprimer le client',
      message: `Supprimer le client « ${customer.name} » ?\n\nSon historique de crédit sera aussi supprimé.`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;
    const loadingToast = toast.loading('Suppression en cours...');
    try {
      const txIds = await db.creditTransactions.where('customerId').equals(id).primaryKeys();
      const now = nowISO();
      await db.transaction('rw', [db.customers, db.creditTransactions], async () => {
        await db.customers.update(id, { deleted: true, updatedAt: now, syncStatus: 'pending' });
        for (const txId of txIds) {
          await db.creditTransactions.update(txId as string, { deleted: true, updatedAt: now, syncStatus: 'pending' });
          await trackDeletion('creditTransactions', txId as string);
        }
      });
      await trackDeletion('customers', id);
      await logAction({ action: 'suppression', entity: 'client', entityId: id, entityName: customer.name });
      toast.dismiss(loadingToast);
      toast.success(`Client « ${customer.name} » supprimé`);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Erreur lors de la suppression');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-text">Clients</h1>
        </div>
        <Button onClick={openAdd}>
          <Plus size={18} /> Ajouter
        </Button>
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          className="w-full pl-10 pr-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Rechercher par nom ou téléphone..."
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
              <Th>Crédit</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody>
            {customers.length === 0 ? (
              <Tr>
                <Td colSpan={4} className="text-center text-text-muted py-8">
                  Aucun client trouvé
                </Td>
              </Tr>
            ) : (
              customers.map((c) => (
                <Tr key={c.id}>
                  <Td className="font-medium">{c.name}</Td>
                  <Td>{c.phone}</Td>
                  <Td>
                    {c.creditBalance > 0 ? (
                      <Badge variant="danger">{formatCurrency(c.creditBalance)}</Badge>
                    ) : (
                      <Badge variant="success">Aucun</Badge>
                    )}
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openCredit(c)}
                        className="p-1.5 rounded hover:bg-blue-50"
                        title="Gérer le crédit"
                      >
                        <CreditCard size={16} className="text-primary" />
                      </button>
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700">
                        <Pencil size={16} className="text-text-muted" />
                      </button>
                      {isGerant && (
                        <button onClick={() => handleDelete(c.id)}                       className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30">
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
        title={editing ? 'Modifier le client' : 'Nouveau client'}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="cname"
            label="Nom"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex : Mamadou Traoré"
            required
          />
          <Input
            id="cphone"
            label="Téléphone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="Ex : 76 12 34 56"
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

      <Modal
        open={creditModalOpen}
        onClose={() => setCreditModalOpen(false)}
        title={`Crédit — ${selectedCustomer?.name}`}
        className="max-w-xl"
      >
        <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <p className="text-sm text-text-muted">Solde crédit actuel</p>
          <p className="text-xl font-bold text-text">
            {formatCurrency(selectedCustomer?.creditBalance ?? 0)}
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
              Paiement reçu
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
              Nouveau crédit
            </button>
          </div>

          <Input
            id="creditAmt"
            label="Montant"
            type="number"
            min={0}
            value={creditAmount}
            onChange={(e) => setCreditAmount(Number(e.target.value))}
            placeholder="Ex : 5000"
            required
          />
          <Input
            id="creditNote"
            label="Note (optionnel)"
            value={creditNote}
            onChange={(e) => setCreditNote(e.target.value)}
            placeholder="Ex : Paiement partiel, Achat à crédit..."
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreditModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>

        {customerTransactions.length > 0 && (
          <div className="mt-6 border-t border-border pt-4">
            <h4 className="text-sm font-semibold text-text mb-2">Historique des transactions</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {customerTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between text-sm py-1.5 border-b border-border/50">
                  <div>
                    <span className={t.type === 'payment' ? 'text-emerald-600' : 'text-red-600'}>
                      {t.type === 'payment' ? 'Paiement' : 'Crédit'}
                    </span>
                    {t.note && <span className="text-text-muted ml-2">— {t.note}</span>}
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-text">{formatCurrency(t.amount)}</p>
                    <p className="text-xs text-text-muted">{formatDateTime(t.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
