import { db } from '@/db';
import { useAuthStore } from '@/stores/authStore';
import { v4 as uuidv4 } from 'uuid';

const SYNC_PENDING_EVENT = 'gestionstore:pending-change';
const DEFAULT_AUTO_SYNC_INTERVAL_MS = 5000;
const QUICK_SYNC_DELAY_MS = 1200;
const MAX_LAST_SYNC_AHEAD_MS = 5 * 60 * 1000;

const TABLES = [
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
  'capitalEntries',
  'customerOrders',
  'customerOrderItems',
  'priceHistory',
  'supplierCreditTransactions',
] as const;

type TableName = (typeof TABLES)[number];

function getTable(name: TableName) {
  return db[name] as any;
}

function getServerCandidates(): string[] {
  const configured = (localStorage.getItem('sync_server_url') || '').trim();
  const current = window.location.origin;
  return Array.from(new Set([configured, current].filter(Boolean)));
}

export function getServerUrl(): string {
  return getServerCandidates()[0] || window.location.origin;
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function getSafeLastSync(tableName: TableName): string | undefined {
  const key = `lastSync_${tableName}`;
  const raw = localStorage.getItem(key);
  if (!raw) return undefined;
  if (!isValidIsoDate(raw)) {
    localStorage.removeItem(key);
    return undefined;
  }

  const ts = Date.parse(raw);
  if (ts > Date.now() + MAX_LAST_SYNC_AHEAD_MS) {
    // Device clock drift can lock pulls for hours/days if lastSync is in the future.
    localStorage.removeItem(key);
    return undefined;
  }

  return raw;
}

export function resetSyncCursors() {
  for (const t of TABLES) localStorage.removeItem(`lastSync_${t}`);
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
  notifyPendingChange();
}

export async function syncAll(options?: { force?: boolean }): Promise<{ success: boolean; error?: string; pulled?: number }> {
  const serverCandidates = getServerCandidates();
  if (serverCandidates.length === 0) return { success: false, error: 'Serveur non configure' };
  if (!navigator.onLine) return { success: false, error: 'Hors ligne' };

  const token = useAuthStore.getState().token;
  if (!token || token === 'offline-token') {
    return { success: false, error: 'Token hors-ligne - reconnectez-vous en ligne' };
  }

  if (options?.force) {
    resetSyncCursors();
  }

  try {
    const changes = [];
    const pendingDeletions = await db.syncDeletions.toArray();
    const requestedDeletionIdsByTable = new Map<TableName, string[]>();

    for (const tableName of TABLES) {
      const table = getTable(tableName);
      const pendingRecordsRaw = options?.force
        ? await table.toArray()
        : await table.where('syncStatus').equals('pending').toArray();
      const pendingRecords = pendingRecordsRaw.filter(
        (record: unknown) => !(record as { deleted?: boolean }).deleted
      );
      const lastSync = getSafeLastSync(tableName);

      const tableDeletions = pendingDeletions.filter((d) => d.table === tableName);
      const tableDeletionIds = tableDeletions.map((d) => d.recordId);
      requestedDeletionIdsByTable.set(tableName, tableDeletionIds);

      changes.push({
        table: tableName,
        records: pendingRecords,
        deletions: tableDeletionIds,
        lastSyncedAt: lastSync || undefined,
      });
    }

    let data: any = null;
    let usedServerUrl = '';
    let syncError = '';

    for (const candidate of serverCandidates) {
      try {
        const res = await fetch(`${candidate}/api/sync`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ changes }),
        });

        if (!res.ok) {
          const body = await res.text().catch(() => '');
          syncError = `${candidate} -> HTTP ${res.status}: ${body.slice(0, 100)}`;
          continue;
        }

        data = await res.json();
        usedServerUrl = candidate;
        break;
      } catch (err) {
        syncError = `${candidate} -> ${(err as Error).message}`;
      }
    }

    if (!data) {
      return { success: false, error: syncError || 'Erreur de synchronisation' };
    }

    if (usedServerUrl) {
      localStorage.setItem('sync_server_url', usedServerUrl);
    }

    const serverNow =
      typeof data.serverTime === 'string' && isValidIsoDate(data.serverTime)
        ? data.serverTime
        : new Date().toISOString();

    let totalPulled = 0;
    for (const tableName of TABLES) {
      const result = data.results?.[tableName];
      if (!result) continue;

      const table = getTable(tableName);
      const pending = await table.where('syncStatus').equals('pending').toArray();
      const pendingIds = new Set<string>(
        pending
          .map((record: unknown) => (record as { id?: string }).id)
          .filter((id: string | undefined): id is string => typeof id === 'string')
      );
      const serverPushedIds: string[] = Array.isArray(result.pushedIds)
        ? (result.pushedIds as string[])
        : [];
      const serverFailedPushIds: string[] = Array.isArray(result.failedPushIds)
        ? (result.failedPushIds as string[])
        : [];

      let confirmedPushedIds = serverPushedIds.filter((id) => pendingIds.has(id));
      if (
        confirmedPushedIds.length === 0
        && pendingIds.size > 0
        && serverPushedIds.length === 0
        && serverFailedPushIds.length === 0
        && typeof result.pushed === 'number'
        && result.pushed === pendingIds.size
      ) {
        // Backward compatibility for old servers that only return count.
        confirmedPushedIds = Array.from(pendingIds);
      }

      for (const recordId of confirmedPushedIds) {
        await table.update(recordId, {
          syncStatus: 'synced',
          lastSyncedAt: serverNow,
        } as never);
      }

      let storedCount = 0;
      const pulledRows: unknown[] = Array.isArray(result.pulled) ? result.pulled : [];
      for (const remote of pulledRows) {
        const remoteId = (remote as { id: string }).id;
        try {
          await table.put(remote as never);
          storedCount++;
          totalPulled++;
        } catch (putErr) {
          console.error(`Sync put error for ${tableName}/${remoteId}:`, putErr);
        }
      }

      const serverDeletedIds: string[] = Array.isArray(result.deletedIds) ? result.deletedIds : [];
      if (serverDeletedIds.length > 0) {
        try {
          await Promise.all(serverDeletedIds.map((id) => table.delete(id)));
          const toRemove = pendingDeletions
            .filter((d) => d.table === tableName && serverDeletedIds.includes(d.recordId))
            .map((d) => d.id);
          if (toRemove.length > 0) await db.syncDeletions.bulkDelete(toRemove);
        } catch (delErr) {
          console.error(`Error applying server deletions for ${tableName}:`, delErr);
        }
      } else if (typeof result.deleted === 'number' && result.deleted > 0) {
        const requestedDeletionIds = requestedDeletionIdsByTable.get(tableName) ?? [];
        if (requestedDeletionIds.length > 0 && result.deleted === requestedDeletionIds.length) {
          const toRemove = pendingDeletions
            .filter((d) => d.table === tableName && requestedDeletionIds.includes(d.recordId))
            .map((d) => d.id);
          if (toRemove.length > 0) await db.syncDeletions.bulkDelete(toRemove);
        }
      }

      if (storedCount > 0 || pulledRows.length === 0) {
        localStorage.setItem(`lastSync_${tableName}`, serverNow);
      }
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
let quickSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let autoSyncRunning = false;
let autoSyncQueued = false;
let autoSyncEnabled = false;
let pendingChangeHandler: (() => void) | null = null;
let onlineHandler: (() => void) | null = null;
let visibilityHandler: (() => void) | null = null;

function canAutoSyncNow(): boolean {
  const token = useAuthStore.getState().token;
  return !!token && token !== 'offline-token' && navigator.onLine && getServerCandidates().length > 0;
}

async function runAutoSyncOnce() {
  if (!autoSyncEnabled || !canAutoSyncNow()) return;

  if (autoSyncRunning) {
    autoSyncQueued = true;
    return;
  }

  autoSyncRunning = true;
  try {
    await syncAll();
  } catch (err) {
    console.error('Auto sync error:', err);
  } finally {
    autoSyncRunning = false;
    if (autoSyncQueued) {
      autoSyncQueued = false;
      void runAutoSyncOnce();
    }
  }
}

function scheduleQuickSync(delayMs = QUICK_SYNC_DELAY_MS) {
  if (!autoSyncEnabled) return;
  if (quickSyncTimeout) clearTimeout(quickSyncTimeout);
  quickSyncTimeout = setTimeout(() => {
    quickSyncTimeout = null;
    void runAutoSyncOnce();
  }, delayMs);
}

export function notifyPendingChange() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SYNC_PENDING_EVENT));
}

export function startAutoSync(intervalMs = DEFAULT_AUTO_SYNC_INTERVAL_MS) {
  stopAutoSync();

  autoSyncEnabled = true;

  if (typeof window !== 'undefined') {
    pendingChangeHandler = () => scheduleQuickSync();
    onlineHandler = () => scheduleQuickSync(300);
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        scheduleQuickSync(300);
      }
    };

    window.addEventListener(SYNC_PENDING_EVENT, pendingChangeHandler);
    window.addEventListener('online', onlineHandler);
    document.addEventListener('visibilitychange', visibilityHandler);
  }

  syncInterval = setInterval(() => {
    void runAutoSyncOnce();
  }, intervalMs);

  scheduleQuickSync(250);
}

export function stopAutoSync() {
  autoSyncEnabled = false;
  autoSyncQueued = false;

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (quickSyncTimeout) {
    clearTimeout(quickSyncTimeout);
    quickSyncTimeout = null;
  }

  if (typeof window !== 'undefined') {
    if (pendingChangeHandler) {
      window.removeEventListener(SYNC_PENDING_EVENT, pendingChangeHandler);
      pendingChangeHandler = null;
    }
    if (onlineHandler) {
      window.removeEventListener('online', onlineHandler);
      onlineHandler = null;
    }
    if (visibilityHandler) {
      document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }
  }
}
