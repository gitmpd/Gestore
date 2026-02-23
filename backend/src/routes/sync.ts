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

type MutatingTable =
  | 'categories'
  | 'products'
  | 'customers'
  | 'suppliers'
  | 'sales'
  | 'saleItems'
  | 'supplierOrders'
  | 'orderItems'
  | 'stockMovements'
  | 'creditTransactions'
  | 'auditLogs'
  | 'expenses'
  | 'customerOrders'
  | 'customerOrderItems'
  | 'priceHistory';

const tableMap: Record<MutatingTable, string> = {
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

const tablesWithoutUpdatedAt = new Set<MutatingTable>(['priceHistory']);

const managerOnlyMutationTables = new Set<MutatingTable>([
  'categories',
  'products',
  'suppliers',
  'supplierOrders',
  'orderItems',
  'expenses',
  'priceHistory',
]);

const ownerScopedTables: Partial<Record<MutatingTable, 'userId'>> = {
  sales: 'userId',
  customerOrders: 'userId',
  supplierOrders: 'userId',
  expenses: 'userId',
  auditLogs: 'userId',
};

function sanitizeRecordForTable(
  table: MutatingTable,
  record: Record<string, unknown>,
  reqUserId?: string
): Record<string, unknown> {
  const sanitized = { ...record };
  delete sanitized.syncStatus;
  delete sanitized.lastSyncedAt;

  const ownerField = ownerScopedTables[table];
  if (ownerField && reqUserId) {
    sanitized[ownerField] = reqUserId;
  }

  return sanitized;
}

async function canMutateRecord(
  model: any,
  table: MutatingTable,
  recordId: string,
  reqUserId?: string,
  reqUserRole?: string
): Promise<boolean> {
  if (reqUserRole === 'gerant') return true;

  const ownerField = ownerScopedTables[table];
  if (!ownerField || !reqUserId) return true;

  try {
    const existing = await model.findUnique({
      where: { id: recordId },
      select: { [ownerField]: true },
    });

    if (!existing) return true;

    const ownerValue = existing[ownerField] as string | null | undefined;
    return !ownerValue || ownerValue === reqUserId;
  } catch {
    return true;
  }
}

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { changes }: { changes: SyncPayload[] } = req.body;
    const results: Record<
      string,
      {
        pushed: number;
        deleted: number;
        pulled: Record<string, unknown>[];
        deletedIds?: string[];
        pushedIds?: string[];
        failedPushIds?: string[];
      }
    > = {};

    for (const { table, records, deletions, lastSyncedAt } of changes) {
      if (!(table in tableMap)) {
        results[table] = { pushed: 0, deleted: 0, pulled: [] };
        continue;
      }

      const tableName = table as MutatingTable;
      const modelName = tableMap[tableName];
      const model = (prisma as any)[modelName];

      const allowMutations = !managerOnlyMutationTables.has(tableName) || req.userRole === 'gerant';

      let pushed = 0;
      let deleted = 0;
      const deletedIds: string[] = [];
      const pushedIds: string[] = [];
      const failedPushIds: string[] = [];

      try {
        if (allowMutations && deletions && deletions.length > 0) {
          for (const recordId of deletions) {
            try {
              const allowed = await canMutateRecord(model, tableName, recordId, req.userId, req.userRole);
              if (!allowed) continue;

              await model.update({
                where: { id: recordId },
                data: { deleted: true, updatedAt: new Date(), syncStatus: 'pending' },
              });
              deleted++;
              deletedIds.push(recordId);
            } catch {
              try {
                await model.delete({ where: { id: recordId } });
                deleted++;
                deletedIds.push(recordId);
              } catch (err2) {
                console.error(`Sync delete error for ${tableName}/${recordId}:`, (err2 as Error).message);
              }
            }
          }
        }

        if (allowMutations) {
          for (const record of records) {
            const data = sanitizeRecordForTable(tableName, record as Record<string, unknown>, req.userId) as Record<
              string,
              unknown
            > & { id?: string };

            const recordId = typeof data.id === 'string' ? data.id : undefined;
            if (!recordId) {
              failedPushIds.push('(no-id)');
              continue;
            }

            const allowed = await canMutateRecord(model, tableName, recordId, req.userId, req.userRole);
            if (!allowed) {
              failedPushIds.push(recordId);
              continue;
            }

            try {
              await model.upsert({
                where: { id: recordId },
                update: { ...data, syncStatus: 'synced', lastSyncedAt: new Date() },
                create: { ...data, syncStatus: 'synced', lastSyncedAt: new Date() },
              });
              pushed++;
              pushedIds.push(recordId);
            } catch (err) {
              failedPushIds.push(recordId);
              console.error(`Sync push error for ${tableName}/${recordId}:`, (err as Error).message);
            }
          }
        }

        const pullWhere: Record<string, unknown> = {};
        if (lastSyncedAt) {
          const dateField = tablesWithoutUpdatedAt.has(tableName) ? 'createdAt' : 'updatedAt';
          pullWhere[dateField] = { gt: new Date(lastSyncedAt) };
        }

        let pulled: Record<string, unknown>[] = [];
        try {
          pulled = await model.findMany({ where: { ...pullWhere, deleted: false } });
          if (lastSyncedAt) {
            try {
              const delRecs = await model.findMany({
                where: { deleted: true, updatedAt: { gt: new Date(lastSyncedAt) } },
                select: { id: true },
              });
              for (const rec of delRecs) deletedIds.push(rec.id);
            } catch {
              // model without deleted support
            }
          }
        } catch {
          try {
            pulled = await model.findMany({ where: pullWhere });
          } catch {
            pulled = await model.findMany();
          }
        }

        results[tableName] = { pushed, deleted, pulled, deletedIds, pushedIds, failedPushIds };
      } catch (err) {
        console.error(`Sync error for table ${tableName}:`, (err as Error).message);
        results[tableName] = { pushed, deleted, pulled: [], pushedIds, failedPushIds };
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
