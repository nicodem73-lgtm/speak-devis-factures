import * as SQLite from 'expo-sqlite';
import {
  EInvoiceEnvelope,
  EInvoiceEnvelopeInput,
  EInvoiceStatus,
  EInvoiceStatusEvent,
  EInvoiceStatusEventInput,
  AuditLog,
  AuditLogInput,
  SyncOutboxItem,
  generateUUID,
  nowISO,
} from '@/types/einvoice';

export async function createEInvoiceEnvelope(
  db: SQLite.SQLiteDatabase,
  data: EInvoiceEnvelopeInput
): Promise<EInvoiceEnvelope> {
  console.log('[DB] Creating e-invoice envelope for invoice:', data.invoice_id);
  
  const id = generateUUID();
  const now = nowISO();
  const initialStatus = data.status || 'draft';
  const provider = data.provider || 'local';
  
  await db.runAsync(
    `INSERT INTO e_invoice_envelopes (id, invoice_id, format, direction, status, provider, file_path, xml_content, checksum, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.invoice_id,
      data.format,
      data.direction,
      initialStatus,
      provider,
      data.file_path || null,
      data.xml_content || null,
      data.checksum || null,
      now,
      now,
    ]
  );
  
  await createStatusEvent(db, {
    envelope_id: id,
    status: initialStatus,
    message: 'Enveloppe créée',
  });
  
  const envelope = await getEInvoiceEnvelopeById(db, id);
  if (!envelope) throw new Error('Failed to create e-invoice envelope');
  
  await createAuditLog(db, {
    action: 'create',
    entity_type: 'e_invoice_envelope',
    entity_id: id,
    new_value: JSON.stringify({ invoice_id: data.invoice_id, format: data.format }),
  });
  
  console.log('[DB] E-invoice envelope created:', id);
  return envelope;
}

export async function getEInvoiceEnvelopeById(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<EInvoiceEnvelope | null> {
  const result = await db.getFirstAsync<EInvoiceEnvelope>(
    'SELECT * FROM e_invoice_envelopes WHERE id = ?',
    [id]
  );
  return result || null;
}

export async function getEInvoiceEnvelopeByInvoiceId(
  db: SQLite.SQLiteDatabase,
  invoiceId: number
): Promise<EInvoiceEnvelope | null> {
  const result = await db.getFirstAsync<EInvoiceEnvelope>(
    'SELECT * FROM e_invoice_envelopes WHERE invoice_id = ? ORDER BY created_at DESC LIMIT 1',
    [invoiceId]
  );
  return result || null;
}

export async function getAllEInvoiceEnvelopes(
  db: SQLite.SQLiteDatabase,
  direction?: 'outbound' | 'inbound'
): Promise<EInvoiceEnvelope[]> {
  let query = 'SELECT * FROM e_invoice_envelopes';
  const params: string[] = [];
  
  if (direction) {
    query += ' WHERE direction = ?';
    params.push(direction);
  }
  
  query += ' ORDER BY created_at DESC';
  
  return db.getAllAsync<EInvoiceEnvelope>(query, params);
}

export async function updateEInvoiceEnvelopeStatus(
  db: SQLite.SQLiteDatabase,
  id: string,
  status: EInvoiceStatus,
  errorMessage?: string
): Promise<void> {
  console.log('[DB] Updating e-invoice envelope status:', id, status);
  
  const envelope = await getEInvoiceEnvelopeById(db, id);
  const oldStatus = envelope?.status;
  
  const now = new Date().toISOString();
  let additionalFields = '';
  const params: (string | null)[] = [status, now];
  
  if (status === 'submitted') {
    additionalFields = ', submitted_at = ?';
    params.push(now);
  } else if (status === 'delivered') {
    additionalFields = ', delivered_at = ?';
    params.push(now);
  }
  
  if (errorMessage) {
    additionalFields += ', error_message = ?';
    params.push(errorMessage);
  }
  
  params.push(id);
  
  await db.runAsync(
    `UPDATE e_invoice_envelopes SET status = ?, updated_at = ?${additionalFields} WHERE id = ?`,
    params
  );
  
  await createAuditLog(db, {
    action: 'status_change',
    entity_type: 'e_invoice_envelope',
    entity_id: id,
    old_value: oldStatus,
    new_value: status,
  });
}

export async function updateEInvoiceEnvelope(
  db: SQLite.SQLiteDatabase,
  id: string,
  data: Partial<EInvoiceEnvelopeInput> & { 
    checksum?: string; 
    file_path?: string; 
    xml_content?: string;
    pdp_reference?: string;
  }
): Promise<void> {
  console.log('[DB] Updating e-invoice envelope:', id);
  
  const fields: string[] = ['updated_at = ?'];
  const params: (string | number | null)[] = [new Date().toISOString()];
  
  if (data.format !== undefined) {
    fields.push('format = ?');
    params.push(data.format);
  }
  if (data.status !== undefined) {
    fields.push('status = ?');
    params.push(data.status);
  }
  if (data.file_path !== undefined) {
    fields.push('file_path = ?');
    params.push(data.file_path);
  }
  if (data.xml_content !== undefined) {
    fields.push('xml_content = ?');
    params.push(data.xml_content);
  }
  if (data.checksum !== undefined) {
    fields.push('checksum = ?');
    params.push(data.checksum);
  }
  if (data.pdp_reference !== undefined) {
    fields.push('pdp_reference = ?');
    params.push(data.pdp_reference);
  }
  
  params.push(id);
  
  await db.runAsync(
    `UPDATE e_invoice_envelopes SET ${fields.join(', ')} WHERE id = ?`,
    params
  );
}

export async function deleteEInvoiceEnvelope(
  db: SQLite.SQLiteDatabase,
  id: string
): Promise<void> {
  console.log('[DB] Deleting e-invoice envelope:', id);
  
  await createAuditLog(db, {
    action: 'delete',
    entity_type: 'e_invoice_envelope',
    entity_id: id,
  });
  
  await db.runAsync('DELETE FROM e_invoice_envelopes WHERE id = ?', [id]);
}

export async function createAuditLog(
  db: SQLite.SQLiteDatabase,
  data: AuditLogInput
): Promise<string> {
  const id = generateUUID();
  const now = new Date().toISOString();
  
  await db.runAsync(
    `INSERT INTO audit_log (id, action, entity_type, entity_id, old_value, new_value, user_id, user_name, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.action,
      data.entity_type,
      data.entity_id,
      data.old_value || null,
      data.new_value || null,
      data.user_id || null,
      data.user_name || null,
      data.metadata ? JSON.stringify(data.metadata) : null,
      now,
    ]
  );
  
  console.log('[DB] Audit log created:', id, data.action, data.entity_type);
  return id;
}

export async function getAuditLogsByEntity(
  db: SQLite.SQLiteDatabase,
  entityType: string,
  entityId: string
): Promise<AuditLog[]> {
  return db.getAllAsync<AuditLog>(
    'SELECT * FROM audit_log WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
    [entityType, entityId]
  );
}

export async function getRecentAuditLogs(
  db: SQLite.SQLiteDatabase,
  limit: number = 50
): Promise<AuditLog[]> {
  return db.getAllAsync<AuditLog>(
    'SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
}

export async function addToSyncOutbox(
  db: SQLite.SQLiteDatabase,
  entityType: string,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload: Record<string, unknown>
): Promise<string> {
  const id = generateUUID();
  const now = new Date().toISOString();
  
  await db.runAsync(
    `INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [id, entityType, entityId, operation, JSON.stringify(payload), now, now]
  );
  
  console.log('[DB] Added to sync outbox:', id, entityType, operation);
  return id;
}

export async function getPendingSyncItems(
  db: SQLite.SQLiteDatabase
): Promise<SyncOutboxItem[]> {
  return db.getAllAsync<SyncOutboxItem>(
    "SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY created_at ASC"
  );
}

export async function updateSyncOutboxStatus(
  db: SQLite.SQLiteDatabase,
  id: string,
  status: 'pending' | 'syncing' | 'synced' | 'failed',
  error?: string
): Promise<void> {
  const now = new Date().toISOString();
  
  if (error) {
    await db.runAsync(
      `UPDATE sync_outbox SET status = ?, last_error = ?, retry_count = retry_count + 1, updated_at = ? WHERE id = ?`,
      [status, error, now, id]
    );
  } else {
    await db.runAsync(
      `UPDATE sync_outbox SET status = ?, updated_at = ? WHERE id = ?`,
      [status, now, id]
    );
  }
}

export async function cleanupSyncedItems(
  db: SQLite.SQLiteDatabase,
  olderThanDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
  
  const result = await db.runAsync(
    "DELETE FROM sync_outbox WHERE status = 'synced' AND updated_at < ?",
    [cutoffDate.toISOString()]
  );
  
  console.log('[DB] Cleaned up synced items:', result.changes);
  return result.changes;
}

export async function markDocumentAsEInvoice(
  db: SQLite.SQLiteDatabase,
  documentId: number,
  isEInvoice: boolean
): Promise<void> {
  console.log('[DB] Marking document as e-invoice:', documentId, isEInvoice);
  
  await db.runAsync(
    'UPDATE documents SET is_einvoice = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [isEInvoice ? 1 : 0, documentId]
  );
}

export async function updateDocumentEInvoiceStatus(
  db: SQLite.SQLiteDatabase,
  documentId: number,
  status: EInvoiceStatus
): Promise<void> {
  console.log('[DB] Updating document e-invoice status:', documentId, status);
  
  await db.runAsync(
    'UPDATE documents SET einvoice_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, documentId]
  );
}

export async function getEInvoiceStats(
  db: SQLite.SQLiteDatabase
): Promise<{
  total: number;
  byStatus: Record<EInvoiceStatus, number>;
  pending: number;
  delivered: number;
}> {
  const total = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM e_invoice_envelopes'
  );
  
  const statusCounts = await db.getAllAsync<{ status: EInvoiceStatus; count: number }>(
    'SELECT status, COUNT(*) as count FROM e_invoice_envelopes GROUP BY status'
  );
  
  const byStatus: Record<EInvoiceStatus, number> = {
    draft: 0,
    issued: 0,
    prepared: 0,
    submitted: 0,
    delivered: 0,
    accepted: 0,
    rejected: 0,
    paid: 0,
  };
  
  for (const row of statusCounts) {
    byStatus[row.status] = row.count;
  }
  
  return {
    total: total?.count || 0,
    byStatus,
    pending: byStatus.draft + byStatus.issued + byStatus.prepared + byStatus.submitted,
    delivered: byStatus.delivered + byStatus.accepted + byStatus.paid,
  };
}

export async function createStatusEvent(
  db: SQLite.SQLiteDatabase,
  data: EInvoiceStatusEventInput
): Promise<string> {
  const id = generateUUID();
  const now = nowISO();
  
  await db.runAsync(
    `INSERT INTO einvoice_status_events (id, envelope_id, status, message, payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      id,
      data.envelope_id,
      data.status,
      data.message || null,
      data.payload ? JSON.stringify(data.payload) : null,
      now,
    ]
  );
  
  console.log('[DB] Status event created:', id, data.status);
  return id;
}

export async function getStatusEventsByEnvelope(
  db: SQLite.SQLiteDatabase,
  envelopeId: string
): Promise<EInvoiceStatusEvent[]> {
  return db.getAllAsync<EInvoiceStatusEvent>(
    'SELECT * FROM einvoice_status_events WHERE envelope_id = ? ORDER BY occurred_at ASC',
    [envelopeId]
  );
}

export async function getStatusEventsByInvoice(
  db: SQLite.SQLiteDatabase,
  invoiceId: number
): Promise<EInvoiceStatusEvent[]> {
  return db.getAllAsync<EInvoiceStatusEvent>(
    `SELECT e.* FROM einvoice_status_events e
     JOIN e_invoice_envelopes env ON e.envelope_id = env.id
     WHERE env.invoice_id = ?
     ORDER BY e.occurred_at ASC`,
    [invoiceId]
  );
}

export async function updateDocumentEInvoiceFields(
  db: SQLite.SQLiteDatabase,
  documentId: number,
  fields: {
    einvoice_status?: EInvoiceStatus;
    issued_at?: string;
    submitted_at?: string;
    pdp_provider?: string;
    pdp_message_id?: string;
    einvoice_format?: string;
    einvoice_file_path?: string;
    einvoice_checksum?: string;
    locked?: number;
  }
): Promise<void> {
  console.log('[DB] Updating document e-invoice fields:', documentId, fields);
  
  const updates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
  const params: (string | number | null)[] = [];
  
  if (fields.einvoice_status !== undefined) {
    updates.push('einvoice_status = ?');
    params.push(fields.einvoice_status);
  }
  if (fields.issued_at !== undefined) {
    updates.push('issued_at = ?');
    params.push(fields.issued_at);
  }
  if (fields.submitted_at !== undefined) {
    updates.push('submitted_at = ?');
    params.push(fields.submitted_at);
  }
  if (fields.pdp_provider !== undefined) {
    updates.push('pdp_provider = ?');
    params.push(fields.pdp_provider);
  }
  if (fields.pdp_message_id !== undefined) {
    updates.push('pdp_message_id = ?');
    params.push(fields.pdp_message_id);
  }
  if (fields.einvoice_format !== undefined) {
    updates.push('einvoice_format = ?');
    params.push(fields.einvoice_format);
  }
  if (fields.einvoice_file_path !== undefined) {
    updates.push('einvoice_file_path = ?');
    params.push(fields.einvoice_file_path);
  }
  if (fields.einvoice_checksum !== undefined) {
    updates.push('einvoice_checksum = ?');
    params.push(fields.einvoice_checksum);
  }
  if (fields.locked !== undefined) {
    updates.push('locked = ?');
    params.push(fields.locked);
  }
  
  params.push(documentId);
  
  await db.runAsync(
    `UPDATE documents SET ${updates.join(', ')} WHERE id = ?`,
    params
  );
}

export async function isDocumentLocked(
  db: SQLite.SQLiteDatabase,
  documentId: number
): Promise<boolean> {
  const result = await db.getFirstAsync<{ locked: number }>(
    'SELECT locked FROM documents WHERE id = ?',
    [documentId]
  );
  return result?.locked === 1;
}

export async function lockDocument(
  db: SQLite.SQLiteDatabase,
  documentId: number
): Promise<void> {
  console.log('[DB] Locking document:', documentId);
  await db.runAsync(
    'UPDATE documents SET locked = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [documentId]
  );
}

export async function getInboundEnvelopes(
  db: SQLite.SQLiteDatabase
): Promise<EInvoiceEnvelope[]> {
  return db.getAllAsync<EInvoiceEnvelope>(
    "SELECT * FROM e_invoice_envelopes WHERE direction = 'inbound' ORDER BY created_at DESC"
  );
}
