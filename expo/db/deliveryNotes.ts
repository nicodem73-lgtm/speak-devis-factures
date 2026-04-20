import * as SQLite from 'expo-sqlite';
import { DeliveryNote, DeliveryNoteLine, DeliveryNoteLineInput, DeliveryNoteStatus, calculateTotalWeight } from '@/types/deliveryNote';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function getAllDeliveryNotes(db: SQLite.SQLiteDatabase): Promise<DeliveryNote[]> {
  console.log('[DB-DeliveryNotes] Fetching all delivery notes...');
  const results = await db.getAllAsync<DeliveryNote & { invoice_number?: string }>(`
    SELECT 
      dn.*,
      d.number as invoice_number
    FROM delivery_notes dn
    LEFT JOIN documents d ON dn.invoice_id = d.id
    ORDER BY dn.created_at DESC
  `);
  console.log('[DB-DeliveryNotes] Found:', results.length, 'delivery notes');
  return results;
}

export async function getDeliveryNoteById(db: SQLite.SQLiteDatabase, id: string): Promise<DeliveryNote | null> {
  console.log('[DB-DeliveryNotes] Fetching delivery note by id:', id);
  const result = await db.getFirstAsync<DeliveryNote & { invoice_number?: string }>(`
    SELECT 
      dn.*,
      d.number as invoice_number
    FROM delivery_notes dn
    LEFT JOIN documents d ON dn.invoice_id = d.id
    WHERE dn.id = ?
  `, [id]);
  return result || null;
}

export async function getDeliveryNotesByInvoiceId(db: SQLite.SQLiteDatabase, invoiceId: number): Promise<DeliveryNote[]> {
  console.log('[DB-DeliveryNotes] Fetching delivery notes for invoice:', invoiceId);
  const results = await db.getAllAsync<DeliveryNote>(`
    SELECT * FROM delivery_notes 
    WHERE invoice_id = ? 
    ORDER BY created_at DESC
  `, [invoiceId]);
  return results;
}

export async function getNextDeliveryNoteNumber(db: SQLite.SQLiteDatabase): Promise<string> {
  const prefixResult = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['delivery_note_prefix']
  );
  const counterResult = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['delivery_note_counter']
  );
  
  const prefix = prefixResult?.value || 'BL-';
  const counter = parseInt(counterResult?.value || '1', 10);
  const year = new Date().getFullYear();
  
  const number = `${prefix}${year}-${String(counter).padStart(4, '0')}`;
  
  await db.runAsync(
    'UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = ?',
    [String(counter + 1), 'delivery_note_counter']
  );
  
  return number;
}

export interface CreateDeliveryNoteData {
  invoice_id: number;
  ship_to_name: string;
  ship_to_address: string;
  ship_to_phone?: string;
  ship_from_name: string;
  ship_from_address: string;
  ship_from_phone?: string;
  lines: DeliveryNoteLineInput[];
}

export async function createDeliveryNote(
  db: SQLite.SQLiteDatabase,
  data: CreateDeliveryNoteData
): Promise<string> {
  console.log('[DB-DeliveryNotes] Creating delivery note for invoice:', data.invoice_id);
  
  const id = generateUUID();
  const number = await getNextDeliveryNoteNumber(db);
  const totalWeight = calculateTotalWeight(data.lines);
  
  await db.runAsync(
    `INSERT INTO delivery_notes (id, number, status, invoice_id, total_weight_kg, ship_to_name, ship_to_address, ship_to_phone, ship_from_name, ship_from_address, ship_from_phone)
     VALUES (?, ?, 'Brouillon', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      number,
      data.invoice_id,
      totalWeight,
      data.ship_to_name,
      data.ship_to_address,
      data.ship_to_phone || null,
      data.ship_from_name,
      data.ship_from_address,
      data.ship_from_phone || null,
    ]
  );
  
  for (const line of data.lines) {
    const lineId = generateUUID();
    await db.runAsync(
      `INSERT INTO delivery_note_lines (id, delivery_note_id, product_id, label, qty, unit, unit_weight_kg, line_weight_kg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        id,
        line.product_id || null,
        line.label,
        line.qty,
        line.unit,
        line.unit_weight_kg || null,
        line.line_weight_kg,
      ]
    );
  }
  
  console.log('[DB-DeliveryNotes] Delivery note created with id:', id);
  return id;
}

export async function updateDeliveryNote(
  db: SQLite.SQLiteDatabase,
  id: string,
  data: CreateDeliveryNoteData
): Promise<void> {
  console.log('[DB-DeliveryNotes] Updating delivery note:', id);
  
  const existing = await getDeliveryNoteById(db, id);
  if (!existing) {
    throw new Error('Bon de livraison non trouvé');
  }
  if (existing.status === 'Envoyé') {
    throw new Error('Impossible de modifier un bon de livraison envoyé');
  }
  
  const totalWeight = calculateTotalWeight(data.lines);
  
  await db.runAsync(
    `UPDATE delivery_notes SET 
      invoice_id = ?, total_weight_kg = ?, ship_to_name = ?, ship_to_address = ?, 
      ship_to_phone = ?, ship_from_name = ?, ship_from_address = ?, ship_from_phone = ?
    WHERE id = ?`,
    [
      data.invoice_id,
      totalWeight,
      data.ship_to_name,
      data.ship_to_address,
      data.ship_to_phone || null,
      data.ship_from_name,
      data.ship_from_address,
      data.ship_from_phone || null,
      id,
    ]
  );
  
  await db.runAsync('DELETE FROM delivery_note_lines WHERE delivery_note_id = ?', [id]);
  
  for (const line of data.lines) {
    const lineId = generateUUID();
    await db.runAsync(
      `INSERT INTO delivery_note_lines (id, delivery_note_id, product_id, label, qty, unit, unit_weight_kg, line_weight_kg)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        lineId,
        id,
        line.product_id || null,
        line.label,
        line.qty,
        line.unit,
        line.unit_weight_kg || null,
        line.line_weight_kg,
      ]
    );
  }
  
  console.log('[DB-DeliveryNotes] Delivery note updated:', id);
}

export async function markDeliveryNoteAsSent(
  db: SQLite.SQLiteDatabase,
  id: string,
  labelPdfPath?: string,
  invoicePdfPath?: string,
  bundlePdfPath?: string
): Promise<void> {
  console.log('[DB-DeliveryNotes] Marking delivery note as sent:', id);
  const now = new Date().toISOString();
  
  await db.runAsync(
    `UPDATE delivery_notes SET 
      status = 'Envoyé', sent_at = ?, label_pdf_path = ?, invoice_pdf_path = ?, bundle_pdf_path = ?
    WHERE id = ?`,
    [now, labelPdfPath || null, invoicePdfPath || null, bundlePdfPath || null, id]
  );
  
  const note = await getDeliveryNoteById(db, id);
  if (note?.invoice_id) {
    await db.runAsync(
      `UPDATE documents SET status = 'sent', sent_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'draft'`,
      [now, note.invoice_id]
    );
    console.log('[DB-DeliveryNotes] Associated invoice marked as sent:', note.invoice_id);
  }
  
  console.log('[DB-DeliveryNotes] Delivery note marked as sent');
}

export async function deleteDeliveryNote(db: SQLite.SQLiteDatabase, id: string): Promise<void> {
  console.log('[DB-DeliveryNotes] Deleting delivery note:', id);
  
  const existing = await getDeliveryNoteById(db, id);
  if (existing?.status === 'Envoyé') {
    throw new Error('Impossible de supprimer un bon de livraison envoyé');
  }
  
  await db.runAsync('DELETE FROM delivery_note_lines WHERE delivery_note_id = ?', [id]);
  await db.runAsync('DELETE FROM delivery_notes WHERE id = ?', [id]);
  
  console.log('[DB-DeliveryNotes] Delivery note deleted');
}

export async function getDeliveryNoteLines(db: SQLite.SQLiteDatabase, deliveryNoteId: string): Promise<DeliveryNoteLine[]> {
  console.log('[DB-DeliveryNotes] Getting lines for delivery note:', deliveryNoteId);
  const results = await db.getAllAsync<DeliveryNoteLine>(
    'SELECT * FROM delivery_note_lines WHERE delivery_note_id = ? ORDER BY id',
    [deliveryNoteId]
  );
  return results;
}

export async function getDeliveryNoteStats(db: SQLite.SQLiteDatabase): Promise<{
  total: number;
  draft: number;
  sent: number;
}> {
  const total = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM delivery_notes');
  const draft = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM delivery_notes WHERE status = ?', ['Brouillon']);
  const sent = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM delivery_notes WHERE status = ?', ['Envoyé']);
  
  return {
    total: total?.count || 0,
    draft: draft?.count || 0,
    sent: sent?.count || 0,
  };
}

export interface DeliveryNoteStatsByPeriod {
  totalCount: number;
  draftCount: number;
  sentCount: number;
  totalWeight: number;
}

export async function getDeliveryNoteStatsByPeriod(
  db: SQLite.SQLiteDatabase,
  year: number,
  month?: number
): Promise<DeliveryNoteStatsByPeriod> {
  console.log('[DeliveryNotes] Getting stats for year:', year, 'month:', month);
  
  let dateCondition: string;
  let params: (string | number)[] = [];
  
  if (month !== undefined) {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    dateCondition = "DATE(created_at) >= ? AND DATE(created_at) <= ?";
    params = [startDate, endDate];
  } else {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    dateCondition = "DATE(created_at) >= ? AND DATE(created_at) <= ?";
    params = [startDate, endDate];
  }
  
  const totalResult = await db.getFirstAsync<{ count: number; weight: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_weight_kg), 0) as weight
     FROM delivery_notes
     WHERE ${dateCondition}`,
    params
  );
  
  const draftResult = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM delivery_notes
     WHERE status = 'Brouillon' AND ${dateCondition}`,
    params
  );
  
  const sentResult = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM delivery_notes
     WHERE status = 'Envoyé' AND ${dateCondition}`,
    params
  );
  
  return {
    totalCount: totalResult?.count || 0,
    draftCount: draftResult?.count || 0,
    sentCount: sentResult?.count || 0,
    totalWeight: totalResult?.weight || 0,
  };
}
