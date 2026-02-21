import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/db';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { generateId, nowISO } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { syncAll } from '@/services/syncService';
import { Logo } from '@/components/ui/Logo';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState('');
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const redirectAfterLogin = (user: { mustChangePassword?: boolean }) => {
    if (user.mustChangePassword) {
      navigate('/change-password');
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    setSyncStatus('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        login(data.user, data.token, data.refreshToken);
        await logAction({ action: 'connexion', entity: 'utilisateur', entityName: data.user.name });
        setSyncStatus('Synchronisation des données…');
        const syncResult = await syncAll({ force: true });
        if (syncResult.success) {
          toast.success(`Connecté en ligne — ${syncResult.pulled ?? 0} enregistrements synchronisés`);
        } else {
          toast.error(`Connexion en ligne mais sync échouée: ${syncResult.error}`);
        }
        redirectAfterLogin(data.user);
        return;
      }

      if (res.status === 401) {
        setError('Email ou mot de passe incorrect');
      } else {
        throw new Error(`Serveur a répondu ${res.status}`);
      }
    } catch (fetchErr) {
      const reason = (fetchErr as Error).message || 'Serveur injoignable';

      const localUser = await db.users.where('email').equals(email).first();

      if (localUser && localUser.deleted) {
        setError('Ce compte a été supprimé. Contactez le gérant.');
        return;
      }

      if (localUser && !localUser.active) {
        setError('Ce compte a été désactivé. Contactez le gérant.');
        return;
      }

      if (localUser && localUser.active) {
        let passwordMatch = false;
        const storedPwd = localUser.password ?? '';
        if (storedPwd.startsWith('$2')) {
          const { default: bcrypt } = await import('bcryptjs');
          passwordMatch = await bcrypt.compare(password, storedPwd);
        } else {
          passwordMatch = storedPwd === password;
        }
        if (passwordMatch) {
          login(localUser, 'offline-token', 'offline-refresh');
          await logAction({ action: 'connexion', entity: 'utilisateur', entityName: localUser.name, details: `Connexion hors-ligne: ${reason}` });
          toast.warning('Mode hors-ligne — les données ne seront pas synchronisées', { duration: 6000 });
          redirectAfterLogin(localUser);
          return;
        }
        setError('Mot de passe incorrect');
        return;
      }

      const isDefault = email === 'admin@store.com' && password === 'admin123';
      if (isDefault) {
        const now = nowISO();
        const existing = await db.users.where('email').equals(email).first();
        const userData = existing ?? {
          id: generateId(),
          name: 'Gérant',
          email,
          role: 'gerant' as const,
          active: true,
          mustChangePassword: true,
          createdAt: now,
          updatedAt: now,
          syncStatus: 'pending' as const,
        };
        if (!existing) await db.users.add(userData);
        login(userData, 'offline-token', 'offline-refresh');
        await logAction({ action: 'connexion', entity: 'utilisateur', entityName: 'Gérant', details: `Connexion hors-ligne (défaut): ${reason}` });
        toast.warning('Mode hors-ligne — les données ne seront pas synchronisées', { duration: 6000 });
        redirectAfterLogin(userData);
        return;
      }

      setError(`Impossible de joindre le serveur (${reason}). Aucun compte local trouvé pour cet email.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-dark to-primary p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" variant="dark" />
          <p className="text-text-muted mt-3">Connectez-vous à votre boutique</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="email"
            label="Email"
            type="email"
            placeholder="votre@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            id="password"
            label="Mot de passe"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-danger text-sm p-3 rounded-lg">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (syncStatus || 'Connexion...') : 'Se connecter'}
          </Button>
        </form>

        <p className="text-xs text-text-muted text-center mt-6">
          Fonctionne même hors connexion
        </p>
        <p className="text-[10px] text-text-muted/50 text-center mt-2">
          &copy; Djamatigui 2026
        </p>
      </div>
    </div>
  );
}
