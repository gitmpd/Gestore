import { useState, useEffect, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Shield,
  ShieldCheck,
  Database,
  UserPlus,
  UserCheck,
  UserX,
  Pencil,
  Trash2,
  Wifi,
  Check,
  Smartphone,
  Copy,
  ArrowLeft,
  KeyRound,
  Download,
  Store,
  RefreshCw,
} from 'lucide-react';
import { db } from '@/db';
import { seedTestData } from '@/db/seed';
import { useAuthStore } from '@/stores/authStore';
import { userSchema, validate } from '@/lib/validation';
import type { User, UserRole } from '@/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { Card, CardTitle } from '@/components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '@/components/ui/Table';
import { generateId, nowISO } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { confirmAction } from '@/stores/confirmStore';
import { discoverServers, type DiscoveredServer } from '@/services/discoveryService';
import { syncAll } from '@/services/syncService';

export function SettingsPage() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const authToken = useAuthStore((s) => s.token);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [serverUrl, setServerUrl] = useState(
    localStorage.getItem('sync_server_url') || ''
  );

  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'vendeur' as UserRole });
  const [userError, setUserError] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '', role: 'vendeur' as UserRole });
  const [editError, setEditError] = useState('');

  const [shopName, setShopName] = useState(localStorage.getItem('shop_name') || '');
  const [shopSaved, setShopSaved] = useState(!!localStorage.getItem('shop_name'));

  const [syncing, setSyncing] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ scanned: 0, total: 0 });
  const [discoveredServers, setDiscoveredServers] = useState<DiscoveredServer[]>([]);
  const [copied, setCopied] = useState(false);
  const [networkAddresses, setNetworkAddresses] = useState<string[]>([]);

  useEffect(() => {
    const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');

    fetch('/api/discovery')
      .then((res) => res.json())
      .then((data) => {
        if (data.addresses?.length) {
          setNetworkAddresses(
            data.addresses.map((a: { ip: string }) => `http://${a.ip}:${port}`)
          );
        }
      })
      .catch(() => {
        const host = window.location.hostname;
        if (host && host !== 'localhost' && !host.startsWith('127.')) {
          setNetworkAddresses([`http://${host}:${port}`]);
        }
      });
  }, []);

  const users = useLiveQuery(async () => {
    const all = await db.users.orderBy('name').toArray();
    return all.filter((u) => !u.deleted);
  }) ?? [];

  const pendingCount = useLiveQuery(async () => {
    const tables = [
      db.users,
      db.categories,
      db.products,
      db.customers,
      db.suppliers,
      db.sales,
      db.saleItems,
      db.supplierOrders,
      db.orderItems,
      db.stockMovements,
      db.creditTransactions,
      db.auditLogs,
      db.expenses,
    ];
    let count = 0;
    for (const table of tables) {
      count += await table.where('syncStatus').equals('pending').count();
    }
    return count;
  }) ?? 0;

  const handleSaveServer = (e: FormEvent) => {
    e.preventDefault();
    localStorage.setItem('sync_server_url', serverUrl);
    setSyncModalOpen(false);
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setUserError('');

    const vResult = validate(userSchema, {
      name: newUser.name.trim(),
      email: newUser.email.trim(),
      password: newUser.password,
      role: newUser.role,
    });
    if (!vResult.success) {
      setUserError(Object.values(vResult.errors)[0]);
      return;
    }

    const existing = await db.users.where('email').equals(newUser.email.trim()).first();
    if (existing) {
      setUserError('Cet email existe déjà');
      return;
    }

    try {
      const syncUrl = localStorage.getItem('sync_server_url');
      const token = authToken || localStorage.getItem('auth_token');

      if (syncUrl && token) {
        const res = await fetch(`${syncUrl}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: newUser.name.trim(),
            email: newUser.email.trim(),
            password: newUser.password,
            role: newUser.role,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setUserError(data.error || 'Erreur lors de la création');
          return;
        }

        const created = await res.json();
        await db.users.put({
          id: created.id,
          name: created.name,
          email: created.email,
          password: '***',
          role: created.role,
          active: created.active ?? true,
          mustChangePassword: created.mustChangePassword ?? true,
          createdAt: created.createdAt ?? new Date().toISOString(),
          updatedAt: created.updatedAt ?? new Date().toISOString(),
          syncStatus: 'synced',
        });
      } else {
        const { default: bcrypt } = await import('bcryptjs');
        const hashedPassword = await bcrypt.hash(newUser.password, 10);
        const now = nowISO();
        await db.users.add({
          id: generateId(),
          name: newUser.name.trim(),
          email: newUser.email.trim(),
          password: hashedPassword,
          role: newUser.role,
          active: true,
          mustChangePassword: true,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending',
        });
      }

      await logAction({ action: 'creation', entity: 'utilisateur', entityName: newUser.name.trim(), details: `Rôle: ${newUser.role}` });
      setNewUser({ name: '', email: '', password: '', role: 'vendeur' });
      setUserModalOpen(false);
      toast.success('Utilisateur créé avec succès');
    } catch (err) {
      toast.error('Erreur lors de la création du vendeur');
      setUserError('Erreur lors de la création du vendeur');
    }
  };

  const toggleUserActive = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.warning('Vous ne pouvez pas désactiver votre propre compte');
      return;
    }
    const action = user.active ? 'désactiver' : 'réactiver';
    const ok = await confirmAction({
      title: `${user.active ? 'Désactiver' : 'Réactiver'} le compte`,
      message: `Voulez-vous ${action} le compte de ${user.name} ?`,
      confirmLabel: user.active ? 'Désactiver' : 'Réactiver',
      variant: user.active ? 'warning' : 'default',
    });
    if (!ok) return;

    await db.users.update(user.id, {
      active: !user.active,
      updatedAt: nowISO(),
      syncStatus: 'pending',
    });

    await logAction({
      action: user.active ? 'desactivation' : 'activation',
      entity: 'utilisateur',
      entityId: user.id,
      entityName: user.name,
    });
  };

  const openEditUser = (user: User) => {
    setEditingUser(user);
    setEditForm({ name: user.name, email: user.email, password: '', role: user.role });
    setEditError('');
    setEditModalOpen(true);
  };

  const handleEditUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError('');

    if (!editForm.name.trim() || !editForm.email.trim()) {
      setEditError('Le nom et l\'email sont obligatoires');
      return;
    }

    if (editForm.password && editForm.password.length < 6) {
      setEditError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    const duplicate = await db.users.where('email').equals(editForm.email.trim()).first();
    if (duplicate && duplicate.id !== editingUser.id) {
      setEditError('Cet email est déjà utilisé par un autre compte');
      return;
    }

    const now = nowISO();
    const updates: Record<string, unknown> = {
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      role: editForm.role,
      updatedAt: now,
      syncStatus: 'pending',
    };
    if (editForm.password) {
      const { default: bcrypt } = await import('bcryptjs');
      updates.password = await bcrypt.hash(editForm.password, 10);
    }

    await db.users.update(editingUser.id, updates);

    const roleLabels: Record<string, string> = { gerant: 'Gérant', vendeur: 'Vendeur' };
    const changes: string[] = [];
    if (editForm.name.trim() !== editingUser.name) changes.push(`Nom : ${editingUser.name} → ${editForm.name.trim()}`);
    if (editForm.email.trim() !== editingUser.email) changes.push(`Email : ${editingUser.email} → ${editForm.email.trim()}`);
    if (editForm.role !== editingUser.role) changes.push(`Rôle : ${roleLabels[editingUser.role]} → ${roleLabels[editForm.role]}`);
    if (editForm.password) changes.push('Mot de passe modifié');

    await logAction({
      action: 'modification',
      entity: 'utilisateur',
      entityId: editingUser.id,
      entityName: editForm.name.trim(),
      details: changes.length > 0 ? changes.join('\n') : 'Aucune modification',
    });

    if (editingUser.id === currentUser?.id) {
      const updatedUser = await db.users.get(editingUser.id);
      if (updatedUser) {
        useAuthStore.getState().login(updatedUser, useAuthStore.getState().token || 'offline-token', useAuthStore.getState().refreshToken || 'offline-refresh');
      }
    }

    setEditModalOpen(false);
    toast.success('Utilisateur modifié');
  };

  const handleDeleteUser = async (user: User) => {
    if (user.id === currentUser?.id) {
      toast.warning('Vous ne pouvez pas supprimer votre propre compte');
      return;
    }
    const ok = await confirmAction({
      title: 'Supprimer l\'utilisateur',
      message: `Voulez-vous vraiment supprimer l'utilisateur ${user.name} ?`,
      confirmLabel: 'Supprimer',
      variant: 'danger',
    });
    if (!ok) return;

    await db.users.update(user.id, {
      deleted: true,
      active: false,
      updatedAt: nowISO(),
      syncStatus: 'pending',
    });

    await logAction({
      action: 'suppression',
      entity: 'utilisateur',
      entityId: user.id,
      entityName: user.name,
      details: 'Suppression logique (conservé pour traçabilité)',
    });
  };

  const handleResetPassword = async (user: User) => {
    const ok = await confirmAction({
      title: 'Réinitialiser le mot de passe',
      message: `Le mot de passe de ${user.name} sera réinitialisé à "123456". L'utilisateur devra le changer à sa prochaine connexion.`,
      confirmLabel: 'Réinitialiser',
      variant: 'warning',
    });
    if (!ok) return;

    const defaultPassword = '123456';
    const syncUrl = localStorage.getItem('sync_server_url');
    const token = authToken || localStorage.getItem('auth_token');

    if (syncUrl && token) {
      try {
        const res = await fetch(`${syncUrl}/api/auth/users/${user.id}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ newPassword: defaultPassword }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error || 'Erreur lors de la réinitialisation');
          return;
        }
      } catch {
        toast.error('Impossible de contacter le serveur');
        return;
      }
    }

    const { default: bcrypt } = await import('bcryptjs');
    const hashed = await bcrypt.hash(defaultPassword, 10);
    await db.users.update(user.id, {
      password: hashed,
      mustChangePassword: true,
      updatedAt: nowISO(),
      syncStatus: 'pending',
    });

    await logAction({
      action: 'modification',
      entity: 'utilisateur',
      entityId: user.id,
      entityName: user.name,
      details: 'Réinitialisation du mot de passe',
    });

    toast.success(`Mot de passe de ${user.name} réinitialisé à "123456"`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted hover:text-text transition-colors" title="Retour">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-text">Paramètres</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardTitle>Accès depuis un autre appareil</CardTitle>
          <div className="space-y-3 mt-4">
            <p className="text-xs text-text-muted">
              Ouvrez cette adresse dans Chrome sur le téléphone (même réseau Wi-Fi) :
            </p>
            {networkAddresses.length > 0 ? (
              <div className="space-y-2">
                {networkAddresses.map((addr) => (
                  <div
                    key={addr}
                    className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg p-3 cursor-pointer hover:bg-primary/10 transition-colors"
                    onClick={() => {
                      navigator.clipboard.writeText(addr);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    title="Cliquer pour copier"
                  >
                    <Smartphone size={20} className="text-primary shrink-0" />
                    <span className="text-sm font-mono font-bold text-primary flex-1">
                      {addr}
                    </span>
                    <span className="text-xs text-primary shrink-0">
                      {copied ? <Check size={16} /> : <Copy size={16} />}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm p-3 rounded-lg">
                Vous accédez en local (localhost). Pour l'accès réseau, ouvrez l'application via l'adresse IP de cet ordinateur ou lancez le backend.
              </div>
            )}
            <div className="border-t border-border pt-3 mt-3 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Éléments en attente</span>
                <Badge variant={pendingCount > 0 ? 'warning' : 'success'}>
                  {pendingCount} en attente
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-text-muted">Serveur sync</span>
                <span className="text-xs text-text-muted truncate ml-2">
                  {localStorage.getItem('sync_server_url') || 'Automatique'}
                </span>
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={syncing}
                onClick={async () => {
                  setSyncing(true);
                  try {
                    const result = await syncAll({ force: true });
                    if (result.success) {
                      toast.success(`Synchronisation réussie `);
                    } else {
                      toast.error(result.error || 'Échec de la synchronisation');
                    }
                  } catch {
                    toast.error('Erreur lors de la synchronisation');
                  } finally {
                    setSyncing(false);
                  }
                }}
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Synchronisation…' : 'Synchroniser maintenant'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setSyncModalOpen(true)}
              >
                Configurer la synchronisation
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>
            <Store size={18} className="inline mr-2 -mt-0.5" />
            Boutique  {shopName ? shopName : 'Boutique'}
          </CardTitle>
          <div className="space-y-3 mt-4">
            <div className="flex gap-2 mt-1">
              <Input
                id="shopName"
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                placeholder="Ex : Boutique Diallo, Super Marché..."
              />
              <Button
                size="sm"
                onClick={() => {
                  const trimmed = shopName.trim();
                  if (trimmed) {
                    localStorage.setItem('shop_name', trimmed);
                    setShopSaved(true); // on passe en mode "modifier"
                    toast.success('Nom de la boutique enregistré');
                  } else {
                    localStorage.removeItem('shop_name');
                    setShopSaved(false); // pas de boutique enregistrée
                    toast.success('Nom de la boutique supprimé');
                  }
                }}
              >
                <Check size={16} />
                {shopSaved ? 'Modifier' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {currentUser?.role === 'gerant' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Gestion des utilisateurs</CardTitle>
            <Button size="sm" onClick={() => { setUserError(''); setUserModalOpen(true); }}>
              <UserPlus size={16} /> Nouveau
            </Button>
          </div>

          <div className="bg-surface-alt rounded-lg border border-border">
            <Table>
              <Thead>
                <Tr>
                  <Th>Nom</Th>
                  <Th>Email</Th>
                  <Th>Rôle</Th>
                  <Th>Statut</Th>
                  <Th />
                </Tr>
              </Thead>
              <Tbody>
                {users.length === 0 ? (
                  <Tr>
                    <Td colSpan={5} className="text-center text-text-muted py-6">
                      Aucun utilisateur enregistré localement
                    </Td>
                  </Tr>
                ) : (
                  users.map((u) => (
                    <Tr key={u.id}>
                      <Td className="font-medium">{u.name}</Td>
                      <Td className="text-text-muted">{u.email}</Td>
                      <Td>
                        <Badge variant={u.role === 'gerant' ? 'info' : 'default'}>
                          {u.role === 'gerant' ? 'Gérant' : 'Vendeur'}
                        </Badge>
                      </Td>
                      <Td>
                        <Badge variant={u.active ? 'success' : 'danger'}>
                          {u.active ? 'Actif' : 'Désactivé'}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEditUser(u)}
                            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-text-muted"
                            title="Modifier"
                          >
                            <Pencil size={16} />
                          </button>
                          {u.id !== currentUser?.id && (
                            <>
                              <button
                                onClick={() => handleResetPassword(u)}
                                className="p-1.5 rounded hover:bg-amber-50 dark:hover:bg-amber-900/30 text-amber-600 transition-colors"
                                title="Réinitialiser le mot de passe"
                              >
                                <KeyRound size={16} />
                              </button>
                              <button
                                onClick={() => toggleUserActive(u)}
                                className={`p-1.5 rounded transition-colors ${
                                  u.active
                                    ? 'hover:bg-red-50 dark:hover:bg-red-900/30 text-danger'
                                    : 'hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600'
                                }`}
                                title={u.active ? 'Désactiver' : 'Réactiver'}
                              >
                                {u.active ? <UserX size={16} /> : <UserCheck size={16} />}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u)}
                                className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-danger"
                                title="Supprimer"
                              >
                                <Trash2 size={16} />
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
        </Card>
      )}

      {currentUser?.role === 'gerant' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Gestion des données</CardTitle>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              size="sm"
              disabled={seeding}
              onClick={async () => {
                if (!currentUser) return;
                const okSeed = await confirmAction({
                  title: 'Données de test',
                  message: 'Charger les données de test ? Les données existantes seront conservées.',
                  confirmLabel: 'Charger',
                  variant: 'warning',
                });
                if (!okSeed) return;
                setSeeding(true);
                try {
                  await seedTestData(currentUser.id);
                  toast.success('Données de test chargées avec succès !');
                } catch (err) {
                  toast.error('Erreur : ' + (err as Error).message);
                } finally {
                  setSeeding(false);
                }
              }}
            >
              <Database size={16} />
              {seeding ? 'Chargement...' : 'Charger les données de test'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={async () => {
                const okReset = await confirmAction({
                  title: 'Réinitialiser les données',
                  message:
                    'Êtes-vous sûr de vouloir effacer toutes les données locales ET serveur ? Cette action est irréversible.',
                  confirmLabel: 'Réinitialiser',
                  variant: 'danger',
                });

                if (okReset) {
                  const token = authToken || localStorage.getItem('auth_token');
                  try {
                    const response = await fetch('/api/admin/reset-database', {
                      method: 'DELETE',
                      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
                    });

                    if (!response.ok) {
                      const data = await response.json().catch(() => ({}));
                      alert('Erreur lors du reset serveur: ' + (data.error || response.statusText));
                      return;
                    }

                    await db.delete();
                    window.location.reload();
                  } catch (err) {
                    alert('Erreur de communication avec le serveur: ' + (err as Error).message);
                  }
                }
              }}
            >
              Réinitialiser toutes les données
            </Button>
          </div>

          <div className="border-t border-border pt-4 mt-4">
            <p className="text-sm font-semibold text-text mb-3">Sauvegarde serveur (PostgreSQL)</p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const syncUrl = localStorage.getItem('sync_server_url');
                  const token = authToken || localStorage.getItem('auth_token');
                  if (!syncUrl || !token) {
                    toast.error('Connectez-vous d\'abord au serveur de synchronisation');
                    return;
                  }
                  try {
                    const res = await fetch(`${syncUrl}/api/backup/export`, {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    if (!res.ok) throw new Error('Erreur serveur');
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `gestionstore_backup_${new Date().toISOString().slice(0, 10)}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                    toast.success('Sauvegarde téléchargée');
                  } catch {
                    toast.error('Erreur lors de l\'export');
                  }
                }}
              >
                <Download size={16} /> Exporter la sauvegarde
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.json';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (!file) return;
                    const syncUrl = localStorage.getItem('sync_server_url');
                    const token = localStorage.getItem('auth_token');
                    if (!syncUrl || !token) {
                      toast.error('Connectez-vous d\'abord au serveur de synchronisation');
                      return;
                    }
                    const okRestore = await confirmAction({
                      title: 'Restaurer une sauvegarde',
                      message: 'Les données existantes seront mises à jour avec le contenu de la sauvegarde. Continuer ?',
                      confirmLabel: 'Restaurer',
                      variant: 'warning',
                    });
                    if (!okRestore) return;
                    try {
                      const text = await file.text();
                      const backup = JSON.parse(text);
                      const res = await fetch(`${syncUrl}/api/backup/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                        body: JSON.stringify(backup),
                      });
                      const result = await res.json();
                      if (!res.ok) throw new Error(result.error);
                      toast.success(result.message);
                    } catch (err) {
                      toast.error('Erreur : ' + (err as Error).message);
                    }
                  };
                  input.click();
                }}
              >
                <Database size={16} /> Restaurer une sauvegarde
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Modal
        open={syncModalOpen}
        onClose={() => { setSyncModalOpen(false); setDiscoveredServers([]); }}
        title="Configuration du serveur"
      >
        <div className="space-y-4">
          {(scanning || discoveredServers.length > 0) && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-text flex items-center gap-2">
                <Wifi size={16} className="text-primary" />
                Serveurs détectés sur le réseau
              </h4>

              {scanning && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-text-muted">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    Scan en cours... {scanProgress.scanned}/{scanProgress.total} IPs
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: scanProgress.total ? `${(scanProgress.scanned / scanProgress.total) * 100}%` : '0%' }}
                    />
                  </div>
                </div>
              )}

              {discoveredServers.length > 0 && (
                <div className="space-y-2">
                  {discoveredServers.map((server) => {
                    const isSelected = serverUrl === server.url;
                    return (
                      <button
                        key={server.ip}
                        type="button"
                        onClick={() => setServerUrl(server.url)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-slate-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-medium text-text">{server.app} v{server.version}</p>
                          <p className="text-xs text-text-muted">{server.url}</p>
                        </div>
                        {isSelected && <Check size={18} className="text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}

              {!scanning && discoveredServers.length === 0 && (
                <p className="text-sm text-text-muted bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
                  Aucun serveur GestionStore trouvé sur le réseau. Vérifiez que le backend est lancé.
                </p>
              )}

              <div className="border-t border-border pt-3">
                <p className="text-xs text-text-muted mb-2">Ou saisir l'URL manuellement :</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSaveServer} className="space-y-4">
            <Input
              id="serverUrl"
              label={discoveredServers.length === 0 && !scanning ? 'URL du serveur' : undefined}
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.X:3001"
            />
            <div className="flex justify-end gap-2">
              {!scanning && (
                <Button
                  variant="outline"
                  type="button"
                  onClick={async () => {
                    setScanning(true);
                    setDiscoveredServers([]);
                    setScanProgress({ scanned: 0, total: 0 });
                    try {
                      const servers = await discoverServers((scanned, total) => {
                        setScanProgress({ scanned, total });
                      });
                      setDiscoveredServers(servers);
                    } finally {
                      setScanning(false);
                    }
                  }}
                >
                  <Wifi size={16} /> Détecter
                </Button>
              )}
              <Button variant="secondary" type="button" onClick={() => { setSyncModalOpen(false); setDiscoveredServers([]); }}>
                Annuler
              </Button>
              <Button type="submit">Enregistrer</Button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Nouvel utilisateur"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            id="userName"
            label="Nom complet"
            value={newUser.name}
            onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
            placeholder="Ex : Moussa Traoré"
            required
          />
          <Input
            id="userEmail"
            label="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
            placeholder="moussa@store.com"
            required
          />
          <Input
            id="userPassword"
            label="Mot de passe"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
            placeholder="Minimum 6 caractères"
            required
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Rôle</label>
            <div className="flex gap-2">
              {([
                { value: 'vendeur' as const, label: 'Vendeur', icon: Shield },
                { value: 'gerant' as const, label: 'Gérant', icon: ShieldCheck },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setNewUser({ ...newUser, role: opt.value })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    newUser.role === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <opt.icon size={16} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {userError && (
            <div className="bg-red-50 dark:bg-red-900/30 text-danger text-sm p-3 rounded-lg">{userError}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setUserModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Créer le compte</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title={`Modifier — ${editingUser?.name}`}
      >
        <form onSubmit={handleEditUser} className="space-y-4">
          <Input
            id="editName"
            label="Nom complet"
            value={editForm.name}
            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
            placeholder="Ex : Moussa Traoré"
            required
          />
          <Input
            id="editEmail"
            label="Email"
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            placeholder="Ex : moussa@store.com"
            required
          />
          <Input
            id="editPassword"
            label="Nouveau mot de passe (laisser vide pour ne pas changer)"
            type="password"
            value={editForm.password}
            onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
            placeholder="Minimum 6 caractères"
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-text">Rôle</label>
            <div className="flex gap-2">
              {([
                { value: 'vendeur' as const, label: 'Vendeur', icon: Shield },
                { value: 'gerant' as const, label: 'Gérant', icon: ShieldCheck },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, role: opt.value })}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    editForm.role === opt.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-muted hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <opt.icon size={16} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {editError && (
            <div className="bg-red-50 dark:bg-red-900/30 text-danger text-sm p-3 rounded-lg">{editError}</div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditModalOpen(false)}>
              Annuler
            </Button>
            <Button type="submit">Enregistrer</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
