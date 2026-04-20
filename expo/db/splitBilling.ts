import * as SQLite from 'expo-sqlite';
import { 
  DocumentSplit, 
  SplitLineAssignment, 
  AllocationRuleSnapshot,
  SplitStatus,
  SplitClientInput,
  generateSplitNumber,
  distributeRoundingError,
} from '@/types/splitBilling';
import { calculateLineTotal } from '@/types/document';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function getSplitsByMasterId(
  db: SQLite.SQLiteDatabase,
  masterId: number
): Promise<DocumentSplit[]> {
  console.log('[DB] Getting splits for master document:', masterId);
  const results = await db.getAllAsync<DocumentSplit & { client_name: string; client_company: string; client_email: string }>(
    `SELECT ds.*, c.name as client_name, c.company as client_company, c.email as client_email
     FROM document_splits ds
     LEFT JOIN clients c ON ds.client_id = c.id
     WHERE ds.master_id = ?
     ORDER BY ds.suffix ASC`,
    [masterId]
  );
  return results;
}

export async function getSplitById(
  db: SQLite.SQLiteDatabase,
  splitId: string
): Promise<DocumentSplit | null> {
  console.log('[DB] Getting split by id:', splitId);
  const result = await db.getFirstAsync<DocumentSplit & { client_name: string; client_company: string; client_email: string }>(
    `SELECT ds.*, c.name as client_name, c.company as client_company, c.email as client_email
     FROM document_splits ds
     LEFT JOIN clients c ON ds.client_id = c.id
     WHERE ds.id = ?`,
    [splitId]
  );
  return result || null;
}

export async function getSplitLineAssignments(
  db: SQLite.SQLiteDatabase,
  splitId: string
): Promise<SplitLineAssignment[]> {
  console.log('[DB] Getting line assignments for split:', splitId);
  const results = await db.getAllAsync<SplitLineAssignment>(
    `SELECT * FROM split_line_assignments WHERE split_id = ? ORDER BY id`,
    [splitId]
  );
  return results;
}

export async function hasSplits(
  db: SQLite.SQLiteDatabase,
  masterId: number
): Promise<boolean> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM document_splits WHERE master_id = ?',
    [masterId]
  );
  return (result?.count || 0) > 0;
}

export interface CreateSplitsInput {
  masterId: number;
  masterNumber: string;
  masterTotalTtc: number;
  autoLiquidation: boolean;
  splits: SplitClientInput[];
  lineItems: {
    id: number;
    key: string;
    product_id?: number;
    label?: string;
    description: string;
    quantity: number;
    unit_price: number;
    tva_rate: number;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
    total_ht: number;
  }[];
}

export async function createDocumentSplits(
  db: SQLite.SQLiteDatabase,
  input: CreateSplitsInput
): Promise<string[]> {
  console.log('[DB] Creating document splits for master:', input.masterId, 'masterNumber:', input.masterNumber, 'splits count:', input.splits.length);
  
  const splitIds: string[] = [];
  
  const adjustedTotals = distributeRoundingError(
    input.splits.map(s => ({ total_ttc: s.computed_total_ttc })),
    input.masterTotalTtc
  );

  for (let i = 0; i < input.splits.length; i++) {
    const splitInput = input.splits[i];
    const splitId = generateUUID();
    const suffix = String.fromCharCode(65 + i);
    const numberFull = generateSplitNumber(input.masterNumber, i);
    console.log('[DB] Split', i, '=> suffix:', suffix, 'numberFull:', numberFull, 'clientId:', splitInput.client_id);
    
    const adjustedTtc = adjustedTotals[i];
    const ratio = splitInput.computed_total_ttc > 0 
      ? adjustedTtc / splitInput.computed_total_ttc 
      : 1;
    const adjustedHt = Math.round(splitInput.computed_total_ht * ratio * 100) / 100;
    const adjustedTva = Math.round((adjustedTtc - adjustedHt) * 100) / 100;

    await db.runAsync(
      `INSERT INTO document_splits (
        id, master_id, number_full, suffix, client_id,
        allocation_mode, allocation_value,
        total_ht, total_tva, total_ttc,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        splitId,
        input.masterId,
        numberFull,
        suffix,
        splitInput.client_id,
        splitInput.allocation_mode,
        parseFloat(splitInput.allocation_value) || 0,
        adjustedHt,
        adjustedTva,
        adjustedTtc,
      ]
    );

    if (splitInput.allocation_mode === 'by_product') {
      for (const lineKey of splitInput.assigned_line_keys) {
        const lineItem = input.lineItems.find(l => l.key === lineKey);
        if (lineItem && lineItem.id) {
          const assignmentId = generateUUID();
          const { ht } = calculateLineTotal({
            quantity: lineItem.quantity,
            unit_price: lineItem.unit_price,
            tva_rate: lineItem.tva_rate,
            discount_type: lineItem.discount_type,
            discount_value: lineItem.discount_value,
            description: lineItem.description,
          });
          
          await db.runAsync(
            `INSERT INTO split_line_assignments (
              id, split_id, line_item_id, product_id, label, description,
              quantity, unit_price, tva_rate, discount_type, discount_value,
              total_ht, allocation_percentage, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)`,
            [
              assignmentId,
              splitId,
              lineItem.id,
              lineItem.product_id || null,
              lineItem.label || null,
              lineItem.description,
              lineItem.quantity,
              lineItem.unit_price,
              lineItem.tva_rate,
              lineItem.discount_type,
              lineItem.discount_value,
              ht,
            ]
          );
        }
      }
    } else {
      const allocationPct = splitInput.computed_total_ttc / input.masterTotalTtc * 100;
      
      for (const lineItem of input.lineItems) {
        if (lineItem.id) {
          const assignmentId = generateUUID();
          const allocatedQty = lineItem.quantity * (allocationPct / 100);
          const { ht } = calculateLineTotal({
            quantity: allocatedQty,
            unit_price: lineItem.unit_price,
            tva_rate: lineItem.tva_rate,
            discount_type: lineItem.discount_type,
            discount_value: lineItem.discount_value * (allocationPct / 100),
            description: lineItem.description,
          });
          
          await db.runAsync(
            `INSERT INTO split_line_assignments (
              id, split_id, line_item_id, product_id, label, description,
              quantity, unit_price, tva_rate, discount_type, discount_value,
              total_ht, allocation_percentage, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
            [
              assignmentId,
              splitId,
              lineItem.id,
              lineItem.product_id || null,
              lineItem.label || null,
              lineItem.description,
              allocatedQty,
              lineItem.unit_price,
              lineItem.tva_rate,
              lineItem.discount_type,
              lineItem.discount_value * (allocationPct / 100),
              ht,
              allocationPct,
            ]
          );
        }
      }
    }

    splitIds.push(splitId);
  }

  const snapshotId = generateUUID();
  await db.runAsync(
    `INSERT INTO allocation_rule_snapshots (
      id, master_id, mode, parameters_json, computed_values_json, created_at
    ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      snapshotId,
      input.masterId,
      input.splits.length > 0 ? input.splits[0].allocation_mode : 'by_product',
      JSON.stringify(input.splits.map(s => ({
        client_id: s.client_id,
        allocation_mode: s.allocation_mode,
        allocation_value: s.allocation_value,
        assigned_line_keys: s.assigned_line_keys,
      }))),
      JSON.stringify(input.splits.map(s => ({
        client_id: s.client_id,
        total_ht: s.computed_total_ht,
        total_tva: s.computed_total_tva,
        total_ttc: s.computed_total_ttc,
      }))),
    ]
  );

  console.log('[DB] Created', splitIds.length, 'splits for master:', input.masterId);
  return splitIds;
}

export async function updateSplitStatus(
  db: SQLite.SQLiteDatabase,
  splitId: string,
  status: SplitStatus
): Promise<void> {
  console.log('[DB] Updating split status:', splitId, status);
  await db.runAsync(
    'UPDATE document_splits SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [status, splitId]
  );
}

export async function markSplitAsSent(
  db: SQLite.SQLiteDatabase,
  splitId: string
): Promise<void> {
  console.log('[DB] Marking split as sent:', splitId);
  const now = new Date().toISOString();
  await db.runAsync(
    'UPDATE document_splits SET status = ?, sent_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    ['sent', now, splitId]
  );
}

export async function markSplitAsPaid(
  db: SQLite.SQLiteDatabase,
  splitId: string,
  paymentMethod?: string,
  paymentRef?: string
): Promise<void> {
  console.log('[DB] Marking split as paid:', splitId);
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE document_splits SET 
      status = 'paid', 
      paid_at = ?, 
      payment_method = ?,
      payment_ref = ?,
      updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?`,
    [now, paymentMethod || null, paymentRef || null, splitId]
  );

  const split = await getSplitById(db, splitId);
  if (split) {
    await checkAndUpdateMasterStatus(db, split.master_id);
  }
}

async function checkAndUpdateMasterStatus(
  db: SQLite.SQLiteDatabase,
  masterId: number
): Promise<void> {
  const splits = await getSplitsByMasterId(db, masterId);
  const allPaid = splits.every(s => s.status === 'paid');
  const somePaid = splits.some(s => s.status === 'paid');
  
  if (allPaid && splits.length > 0) {
    await db.runAsync(
      `UPDATE documents SET status = 'paid', paid_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [masterId]
    );
    console.log('[DB] All splits paid, master document marked as paid:', masterId);
  } else if (somePaid) {
    console.log('[DB] Some splits paid for master:', masterId);
  }
}

export async function updateSplitPdfPath(
  db: SQLite.SQLiteDatabase,
  splitId: string,
  pdfPath: string
): Promise<void> {
  await db.runAsync(
    'UPDATE document_splits SET pdf_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [pdfPath, splitId]
  );
}

export async function deleteSplitsByMasterId(
  db: SQLite.SQLiteDatabase,
  masterId: number
): Promise<void> {
  console.log('[DB] Deleting all splits for master:', masterId);
  
  await db.runAsync(
    'DELETE FROM allocation_rule_snapshots WHERE master_id = ?',
    [masterId]
  );
  
  await db.runAsync(
    'DELETE FROM document_splits WHERE master_id = ?',
    [masterId]
  );
}

export async function getAllocationRuleSnapshot(
  db: SQLite.SQLiteDatabase,
  masterId: number
): Promise<AllocationRuleSnapshot | null> {
  const result = await db.getFirstAsync<AllocationRuleSnapshot>(
    'SELECT * FROM allocation_rule_snapshots WHERE master_id = ? ORDER BY created_at DESC LIMIT 1',
    [masterId]
  );
  return result || null;
}

export async function getSplitStats(
  db: SQLite.SQLiteDatabase,
  masterId: number
): Promise<{
  totalSplits: number;
  paidSplits: number;
  sentSplits: number;
  paidAmount: number;
  pendingAmount: number;
}> {
  const splits = await getSplitsByMasterId(db, masterId);
  
  const paidSplits = splits.filter(s => s.status === 'paid');
  const sentSplits = splits.filter(s => s.status === 'sent');
  
  return {
    totalSplits: splits.length,
    paidSplits: paidSplits.length,
    sentSplits: sentSplits.length,
    paidAmount: paidSplits.reduce((sum, s) => sum + s.total_ttc, 0),
    pendingAmount: splits.filter(s => s.status !== 'paid' && s.status !== 'cancelled')
      .reduce((sum, s) => sum + s.total_ttc, 0),
  };
}

export async function getSplitsByClientId(
  db: SQLite.SQLiteDatabase,
  clientId: number
): Promise<DocumentSplit[]> {
  console.log('[DB] Getting splits for client:', clientId);
  const results = await db.getAllAsync<DocumentSplit>(
    `SELECT ds.*, d.number as master_number, d.type as document_type
     FROM document_splits ds
     JOIN documents d ON ds.master_id = d.id
     WHERE ds.client_id = ?
     ORDER BY ds.created_at DESC`,
    [clientId]
  );
  return results;
}

export async function getUnpaidSplits(
  db: SQLite.SQLiteDatabase
): Promise<DocumentSplit[]> {
  console.log('[DB] Getting all unpaid splits');
  const results = await db.getAllAsync<DocumentSplit & { client_name: string; master_number: string }>(
    `SELECT ds.*, c.name as client_name, d.number as master_number
     FROM document_splits ds
     LEFT JOIN clients c ON ds.client_id = c.id
     JOIN documents d ON ds.master_id = d.id
     WHERE ds.status NOT IN ('paid', 'cancelled')
     ORDER BY ds.created_at DESC`
  );
  return results;
}
