import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import bcrypt from 'bcryptjs';
import { useAuthStore } from '@/stores/authStore';
import { db } from '@/db';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { nowISO } from '@/lib/utils';
import { logAction } from '@/services/auditService';
import { getServerUrl } from '@/services/syncService';

export function ChangePasswordPage() {
  const [displayName, setDisplayName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const loginFn = useAuthStore((s) => s.login);
  const clearMustChangePassword = useAuthStore((s) => s.clearMustChangePassword);
  const navigate = useNavigate();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caracteres');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    const trimmedName = displayName.trim();

    try {
      const body: Record<string, unknown> = { newPassword };
      if (trimmedName) body.name = trimmedName;

      if (token) {
        const res = await fetch(`${getServerUrl()}/api/auth/change-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          const updatedUser = await res.json();
          loginFn(
            { ...user, ...updatedUser, mustChangePassword: false },
            token,
            useAuthStore.getState().refreshToken || 'offline-refresh'
          );
          clearMustChangePassword();
          await logAction({
            action: 'modification',
            entity: 'utilisateur',
            entityName: trimmedName || user?.name,
            details: 'Mot de passe modifie',
          });
          navigate('/');
          return;
        }

        const data = await res.json();
        setError(data.error || 'Erreur lors du changement de mot de passe');
        return;
      }

      // Sans token serveur, on bascule uniquement en mise a jour locale (hors-ligne).
      throw new Error('AUTH_TOKEN_REQUIRED');
    } catch {
      if (user) {
        const updates: Record<string, unknown> = {
          password: await bcrypt.hash(newPassword, 10),
          mustChangePassword: false,
          updatedAt: nowISO(),
          syncStatus: 'pending',
        };
        if (trimmedName) updates.name = trimmedName;

        await db.users.update(user.id, updates);

        loginFn(
          { ...user, name: trimmedName || user.name, mustChangePassword: false },
          'offline-token',
          'offline-refresh'
        );
        clearMustChangePassword();
        await logAction({
          action: 'modification',
          entity: 'utilisateur',
          entityName: trimmedName || user.name,
          details: 'Premiere connexion (hors-ligne)',
        });
        navigate('/');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-dark to-primary p-4">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-dark">GestionStore</h1>
          <p className="text-text-muted mt-2">Configurez votre compte</p>
          <p className="text-sm text-text-muted mt-1">
            Definissez votre nom d'affichage et un nouveau mot de passe.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            id="displayName"
            label="Votre nom (facultatif)"
            placeholder={user?.name || 'Ex : Moussa Diarra'}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Input
            id="newPassword"
            label="Nouveau mot de passe"
            type="password"
            placeholder="Minimum 6 caracteres"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Input
            id="confirmPassword"
            label="Confirmer le mot de passe"
            type="password"
            placeholder="Retapez votre mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          {error && (
            <div className="bg-red-50 dark:bg-red-900/30 text-danger text-sm p-3 rounded-lg">{error}</div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Enregistrement...' : 'Valider'}
          </Button>
        </form>

        <p className="text-xs text-text-muted text-center mt-6">
          Vous ne pourrez pas acceder a l'application sans changer votre mot de passe.
        </p>
      </div>
    </div>
  );
}
