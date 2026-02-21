import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authenticate, type AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function generateTokens(userId: string, role: string) {
  const token = jwt.sign({ userId, role }, process.env.JWT_SECRET!, { expiresIn: '24h' });
  const refreshToken = jwt.sign({ userId, role }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  return { token, refreshToken };
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.active) {
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }

    const tokens = generateTokens(user.id, user.role);
    const { password: _, ...safeUser } = user;

    res.json({ ...tokens, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/change-password', async (req, res) => {
  try {
    const { newPassword, name, email } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
      return;
    }

    let user;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      // Mode normal avec token
      try {
        const token = req.headers.authorization.slice(7);
        const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; role: string };
        user = await prisma.user.findUnique({ where: { id: payload.userId } });
        if (!user) {
          res.status(404).json({ error: 'Utilisateur introuvable' });
          return;
        }
      } catch {
        res.status(401).json({ error: 'Token invalide' });
        return;
      }
    } else if (email) {
      // Première connexion avec email
      user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        res.status(404).json({ error: 'Utilisateur introuvable' });
        return;
      }
    } else {
      res.status(401).json({ error: 'Token manquant ou email requis' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const updateData: Record<string, unknown> = { password: hashedPassword, mustChangePassword: false };
    if (name && name.trim()) updateData.name = name.trim();

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
    });

    const { password: _, ...safeUser } = updatedUser;
    res.json(safeUser);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/register', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'gerant') {
      res.status(403).json({ error: 'Seul un gérant peut créer des comptes' });
      return;
    }

    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: role || 'vendeur', mustChangePassword: true },
    });

    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  } catch (err: any) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Cet email existe déjà' });
      return;
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET!) as {
      userId: string;
      role: string;
    };
    const tokens = generateTokens(payload.userId, payload.role);
    res.json(tokens);
  } catch {
    res.status(401).json({ error: 'Refresh token invalide' });
  }
});

router.get('/users', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'gerant') {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true, syncStatus: true, lastSyncedAt: true },
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/users/:id/toggle', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'gerant') {
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    const id = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    if (user.id === req.userId) {
      res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
      return;
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { active: !user.active },
      select: { id: true, name: true, email: true, role: true, active: true, createdAt: true, updatedAt: true, syncStatus: true, lastSyncedAt: true },
    });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/users/:id/reset-password', authenticate, async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'gerant') {
      res.status(403).json({ error: 'Seul un gérant peut réinitialiser les mots de passe' });
      return;
    }
    const id = req.params.id as string;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ error: 'Le mot de passe doit contenir au moins 6 caractères' });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword, mustChangePassword: true },
    });

    res.json({ message: 'Mot de passe réinitialisé. L\'utilisateur devra le changer à la prochaine connexion.' });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/me', authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export { router as authRouter };
