import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, requireRole, type AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

const tables = [
  'user', 'category', 'product', 'customer', 'supplier',
  'sale', 'saleItem', 'supplierOrder', 'orderItem',
  'stockMovement', 'creditTransaction', 'expense',
  'customerOrder', 'customerOrderItem', 'auditLog', 'priceHistory',
] as const;

router.get('/export', authenticate, requireRole('gerant'), async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'gerant') {
      res.status(403).json({ error: 'Seul un gérant peut exporter les données' });
      return;
    }

    const data: Record<string, unknown[]> = {};

    for (const table of tables) {
      data[table] = await (prisma[table] as any).findMany();
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=gestionstore_backup_${new Date().toISOString().slice(0, 10)}.json`);
    res.json({
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data,
    });
  } catch (err) {
    console.error('Backup export error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'export' });
  }
});

router.post('/import', authenticate, requireRole('gerant'), async (req: AuthRequest, res) => {
  try {
    if (req.userRole !== 'gerant') {
      res.status(403).json({ error: 'Seul un gérant peut importer les données' });
      return;
    }

    const { data } = req.body;
    if (!data || typeof data !== 'object') {
      res.status(400).json({ error: 'Format de sauvegarde invalide' });
      return;
    }

    const importOrder = [
      'user', 'category', 'supplier', 'customer',
      'product', 'priceHistory', 'sale', 'saleItem',
      'supplierOrder', 'orderItem',
      'stockMovement', 'creditTransaction', 'expense',
      'customerOrder', 'customerOrderItem', 'auditLog',
    ] as const;

    let imported = 0;

    await prisma.$transaction(async (tx) => {
      for (const table of importOrder) {
        const rows = data[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        for (const row of rows) {
          try {
            await (tx[table] as any).upsert({
              where: { id: row.id },
              update: row,
              create: row,
            });
            imported++;
          } catch {
            // skip individual row errors (constraint violations from existing data)
          }
        }
      }
    });

    res.json({ message: `Import terminé : ${imported} enregistrement(s) traités` });
  } catch (err) {
    console.error('Backup import error:', err);
    res.status(500).json({ error: 'Erreur lors de l\'import' });
  }
});

export { router as backupRouter };
