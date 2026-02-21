import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

function getManagedUserIds(
  users: Array<{ id: string; createdByUserId: string | null }>,
  rootUserId: string
): Set<string> {
  const scoped = new Set<string>([rootUserId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const user of users) {
      if (user.createdByUserId && scoped.has(user.createdByUserId) && !scoped.has(user.id)) {
        scoped.add(user.id);
        changed = true;
      }
    }
  }

  return scoped;
}

router.use(authenticate);

router.get('/', requireRole('gerant'), async (req: AuthRequest, res) => {
  try {
    const { userId, action, entity, from, to, limit = '100', offset = '0' } = req.query;

    if (!req.userId) {
      res.status(401).json({ error: 'Utilisateur non authentifie' });
      return;
    }

    const take = Math.min(Number(limit) || 100, 500);
    const skip = Math.max(Number(offset) || 0, 0);

    const where: Record<string, unknown> = {};
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entity) where.entity = entity;
    if (from || to) {
      where.date = {};
      if (from) (where.date as Record<string, unknown>).gte = new Date(from as string);
      if (to) (where.date as Record<string, unknown>).lte = new Date(to as string);
    }

    const users = await prisma.user.findMany({
      select: { id: true, role: true, createdByUserId: true },
    });
    const userRoleMap = new Map(users.map((u) => [u.id, u.role]));
    const scopedManagerIds = getManagedUserIds(
      users
        .filter((u) => u.role === 'gerant')
        .map((u) => ({ id: u.id, createdByUserId: u.createdByUserId })),
      req.userId
    );

    const baseLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 5000,
    });

    const filteredLogs = baseLogs.filter((log) => {
      const actorRole = userRoleMap.get(log.userId);
      if (actorRole === 'gerant' && !scopedManagerIds.has(log.userId)) {
        return false;
      }
      return true;
    });

    const total = filteredLogs.length;
    const logs = filteredLogs.slice(skip, skip + take);

    res.json({ logs, total });
  } catch (err) {
    console.error('Audit error:', err);
    res.status(500).json({ error: 'Erreur lors de la recuperation du journal' });
  }
});

export { router as auditRouter };
