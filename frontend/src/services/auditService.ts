import { db } from '@/db';
import { useAuthStore } from '@/stores/authStore';
import { generateId, nowISO } from '@/lib/utils';
import type { AuditAction, AuditEntity } from '@/types';

interface LogActionParams {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string;
  entityName?: string;
  details?: string;
}

export async function logAction(params: LogActionParams): Promise<void> {
  try {
    const user = useAuthStore.getState().user;
    if (!user) return;

    await db.auditLogs.add({
      id: generateId(),
      userId: user.id,
      userName: user.name,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      entityName: params.entityName,
      details: params.details,
      date: nowISO(),
      syncStatus: 'pending',
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
