import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticate, type AuthRequest } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(authenticate);

interface SyncPayload {
  table: string;
  records: Record<string, unknown>[];
  deletions?: string[];
  lastSyncedAt?: string;
}

function sanitizeRecordForTable(table: string, record: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...record };

  // Legacy clients may still send `deleted` for users, but User model has no deleted column.
  if (table === 'users') {
    delete sanitized.deleted;
  }

  return sanitized;
}

const tableMap: Record<string, any> = {
  users: 'user',
  categories: 'category',
  products: 'product',
  customers: 'customer',
  suppliers: 'supplier',
  sales: 'sale',
  saleItems: 'saleItem',
  supplierOrders: 'supplierOrder',
  orderItems: 'orderItem',
  stockMovements: 'stockMovement',
  creditTransactions: 'creditTransaction',
  auditLogs: 'auditLog',
  expenses: 'expense',
  customerOrders: 'customerOrder',
  customerOrderItems: 'customerOrderItem',
  priceHistory: 'priceHistory',
};

const tablesWithoutUpdatedAt = new Set(['priceHistory']);

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { changes }: { changes: SyncPayload[] } = req.body;
    const results: Record<string, {
      pushed: number;
      deleted: number;
      pulled: Record<string, unknown>[];
      deletedIds?: string[];
      pushedIds?: string[];
      failedPushIds?: string[];
    }> = {};

    for (const { table, records, deletions, lastSyncedAt } of changes) {
      const modelName = tableMap[table];
      if (!modelName) continue;

      const model = (prisma as any)[modelName];
      let pushed = 0;
      let deleted = 0;
      const deletedIds: string[] = [];
      const pushedIds: string[] = [];
      const failedPushIds: string[] = [];

      try {
        if (deletions && deletions.length > 0) {
          for (const recordId of deletions) {
            try {
              // Try to mark as deleted (soft-delete) on models that support it
              await model.update({ where: { id: recordId }, data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' } });
              deleted++;
              deletedIds.push(recordId);
            } catch (err) {
              try {
                // Fallback to physical delete if update fails (model has no deleted field)
                await model.delete({ where: { id: recordId } });
                deleted++;
                deletedIds.push(recordId);
              } catch (err2) {
                console.error(`Sync delete error for ${table}/${recordId}:`, (err2 as Error).message);
              }
            }
          }
        }

        for (const record of records) {
          const { syncStatus, lastSyncedAt: _, ...rawData } = record as any;
          const data = sanitizeRecordForTable(table, rawData as Record<string, unknown>) as Record<string, unknown> & { id?: string };
          const recordId = typeof data.id === 'string' ? data.id : undefined;
          try {
            await model.upsert({
              where: { id: data.id },
              update: { ...data, syncStatus: 'synced', lastSyncedAt: new Date() },
              create: { ...data, syncStatus: 'synced', lastSyncedAt: new Date() },
            });
            pushed++;
            if (recordId) pushedIds.push(recordId);
          } catch (err) {
            if (recordId) failedPushIds.push(recordId);
            console.error(`Sync push error for ${table}:`, (err as Error).message);
          }
        }

        const pullWhere: Record<string, unknown> = {};
        if (lastSyncedAt) {
          const dateField = tablesWithoutUpdatedAt.has(table) ? 'createdAt' : 'updatedAt';
          pullWhere[dateField] = { gt: new Date(lastSyncedAt) };
        }

        let pulled: Record<string, unknown>[] = [];
        try {
          // Pull active (non-deleted) records
          pulled = await model.findMany({ where: { ...pullWhere, deleted: false } });
          // Also collect recently-deleted ids since last sync so clients can remove them locally
          if (lastSyncedAt) {
            try {
              const delRecs = await model.findMany({ where: { deleted: true, updatedAt: { gt: new Date(lastSyncedAt) } }, select: { id: true } });
              for (const r of delRecs) deletedIds.push(r.id);
            } catch (_) {
              // ignore if model has no deleted field
            }
          }
        } catch (err) {
          // Fallback if model has no 'deleted' field: return all records
          try {
            pulled = await model.findMany({ where: pullWhere });
          } catch {
            // Final fallback for schema drift (missing updatedAt/createdAt/etc.)
            pulled = await model.findMany();
          }
        }
        results[table] = { pushed, deleted, pulled, deletedIds, pushedIds, failedPushIds };
      } catch (err) {
        console.error(`Sync error for table ${table}:`, (err as Error).message);
        results[table] = { pushed, deleted, pulled: [], pushedIds, failedPushIds };
      }
    }

    res.json({ success: true, results });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: 'Erreur de synchronisation' });
  }
});

router.get('/status', async (_req, res) => {
  const counts: Record<string, number> = {};
  for (const [tableName, modelName] of Object.entries(tableMap)) {
    try {
      try {
        // Prefer counting only non-deleted rows when possible
        counts[tableName] = await (prisma as any)[modelName].count({ where: { deleted: false } });
      } catch {
        counts[tableName] = await (prisma as any)[modelName].count();
      }
    } catch {
      counts[tableName] = 0;
    }
  }
  res.json(counts);
});

export { router as syncRouter };
