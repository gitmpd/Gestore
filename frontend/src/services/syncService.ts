import { db } from '@/db';
import { useAuthStore } from '@/stores/authStore';
import { v4 as uuidv4 } from 'uuid';

const TABLES = [
  'users',
  'categories',
  'products',
  'customers',
  'suppliers',
  'sales',
  'saleItems',
  'supplierOrders',
  'orderItems',
  'stockMovements',
  'creditTransactions',
  'auditLogs',
  'expenses',
  'customerOrders',
  'customerOrderItems',
  'priceHistory',
] as const;

type TableName = (typeof TABLES)[number];

function getTable(name: TableName) {
  return db[name];
}

function getServerUrl(): string {
  return localStorage.getItem('sync_server_url') || window.location.origin;
}

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function trackDeletion(table: string, recordId: string): Promise<void> {
  await db.syncDeletions.add({
    id: uuidv4(),
    table,
    recordId,
    deletedAt: new Date().toISOString(),
  });
}

export async function syncAll(options?: { force?: boolean }): Promise<{ success: boolean; error?: string; pulled?: number }> {
  const serverUrl = getServerUrl();
  if (!serverUrl) return { success: false, error: 'Serveur non configuré' };
  if (!navigator.onLine) return { success: false, error: 'Hors ligne' };

  const token = useAuthStore.getState().token;
  if (!token || token === 'offline-token') {
    return { success: false, error: 'Token hors-ligne — reconnectez-vous en ligne' };
  }

  if (options?.force) {
    for (const t of TABLES) localStorage.removeItem(`lastSync_${t}`);
  }

  try {
    const changes = [];
    const pendingDeletions = await db.syncDeletions.toArray();

    for (const tableName of TABLES) {
      const table = getTable(tableName);
      const pendingRecords = await table.where('syncStatus').equals('pending').toArray();
      const lastSync = localStorage.getItem(`lastSync_${tableName}`);

      const tableDeletions = pendingDeletions
        .filter((d) => d.table === tableName)
        .map((d) => d.recordId);

      changes.push({
        table: tableName,
        records: pendingRecords,
        deletions: tableDeletions,
        lastSyncedAt: lastSync || undefined,
      });
    }

    const res = await fetch(`${serverUrl}/api/sync`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ changes }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 100)}`);
    }
    const data = await res.json();

    // deletedIds will be provided by server per-table; used to remove local records

    let totalPulled = 0;
    const now = new Date().toISOString();
    for (const tableName of TABLES) {
      const result = data.results?.[tableName];
      if (!result) continue;

      const table = getTable(tableName);
      const pending = await table.where('syncStatus').equals('pending').toArray();
      for (const record of pending) {
        await table.update((record as { id: string }).id, {
          syncStatus: 'synced',
          lastSyncedAt: now,
        } as never);
      }

      let storedCount = 0;
      for (const remote of result.pulled) {
        const remoteId = (remote as { id: string }).id;
        try {
          await table.put(remote as never);
          storedCount++;
          totalPulled++;
        } catch (putErr) {
          console.error(`Sync put error for ${tableName}/${remoteId}:`, putErr);
        }
      }

      // Apply deletions instructed by server
      const serverDeletedIds: string[] = result.deletedIds || [];
      if (serverDeletedIds.length > 0) {
        try {
          await Promise.all(serverDeletedIds.map((id) => table.delete(id)));
          // Also remove any pending deletion markers for these ids
          const toRemove = (await db.syncDeletions.toArray()).filter((d) => serverDeletedIds.includes(d.recordId)).map((d) => d.id);
          if (toRemove.length > 0) await db.syncDeletions.bulkDelete(toRemove);
        } catch (delErr) {
          console.error(`Error applying server deletions for ${tableName}:`, delErr);
        }
      }

      if (storedCount > 0 || result.pulled.length === 0) {
        localStorage.setItem(`lastSync_${tableName}`, now);
      }
    }

    if (pendingDeletions.length > 0) {
      await db.syncDeletions.bulkDelete(pendingDeletions.map((d) => d.id));
    }

    return { success: true, pulled: totalPulled };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export async function getPendingCount(): Promise<number> {
  let count = 0;
  for (const tableName of TABLES) {
    count += await getTable(tableName).where('syncStatus').equals('pending').count();
  }
  return count;
}

let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoSync(intervalMs = 30000) {
  stopAutoSync();
  syncInterval = setInterval(() => {
    if (navigator.onLine && getServerUrl()) {
      syncAll().catch(console.error);
    }
  }, intervalMs);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
