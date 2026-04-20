import * as SQLite from 'expo-sqlite';
import { Document, LineItemInput, DiscountType, calculateLineTotal, calculateDocumentTotals } from '@/types/document';
import { getNextDocumentNumber, getDocumentById, getLineItemsByDocumentId } from './documents';
import { getSplitsByMasterId, getSplitLineAssignments } from './splitBilling';

export interface CreditNoteInput {
  client_id: number;
  date: string;
  due_date?: string;
  original_invoice_id?: number;
  reason: string;
  notes?: string;
  conditions?: string;
  line_items: LineItemInput[];
  global_discount_type: DiscountType;
  global_discount_value: number;
  auto_liquidation: boolean;
}

export interface CreditNoteFromInvoiceInput {
  original_invoice_id: number;
  mode: 'full' | 'partial';
  reason: string;
  modified_lines?: LineItemInput[];
}

export async function createCreditNote(
  db: SQLite.SQLiteDatabase,
  data: CreditNoteInput
): Promise<number> {
  console.log('[DB] Creating credit note...');
  
  const number = await getNextDocumentNumber(db, 'facture');
  
  const totals = calculateDocumentTotals(
    data.line_items,
    data.global_discount_type,
    data.global_discount_value,
    data.auto_liquidation
  );

  const negativeHt = -Math.abs(totals.totalHt);
  const negativeTva = -Math.abs(totals.totalTva);
  const negativeTtc = -Math.abs(totals.totalTtc);

  const result = await db.runAsync(
    `INSERT INTO documents (
      type, document_subtype, number, client_id, status, date, due_date,
      total_ht, total_tva, total_ttc,
      global_discount_type, global_discount_value, auto_liquidation,
      notes, conditions, original_invoice_id, credit_note_reason
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'facture',
      'credit_note',
      number,
      data.client_id,
      data.date,
      data.due_date || null,
      negativeHt,
      negativeTva,
      negativeTtc,
      data.global_discount_type,
      data.global_discount_value,
      data.auto_liquidation ? 1 : 0,
      data.notes || null,
      data.conditions || null,
      data.original_invoice_id || null,
      data.reason,
    ]
  );

  const creditNoteId = result.lastInsertRowId;

  for (const item of data.line_items) {
    const { ht } = calculateLineTotal(item);
    const negativeLineHt = -Math.abs(ht);
    
    await db.runAsync(
      `INSERT INTO line_items (
        document_id, product_id, label, description, quantity, unit_price,
        tva_rate, discount_type, discount_value, total_ht, image_url
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        creditNoteId,
        item.product_id || null,
        item.label || null,
        item.description,
        -Math.abs(item.quantity),
        item.unit_price,
        item.tva_rate,
        item.discount_type,
        item.discount_value,
        negativeLineHt,
        item.image_url || null,
      ]
    );
  }

  console.log('[DB] Credit note created with id:', creditNoteId);
  return creditNoteId;
}

export async function createCreditNoteFromInvoice(
  db: SQLite.SQLiteDatabase,
  input: CreditNoteFromInvoiceInput
): Promise<number> {
  console.log('[DB] Creating credit note from invoice:', input.original_invoice_id);
  
  const existing = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM documents 
     WHERE original_invoice_id = ? AND document_subtype = 'credit_note'
     LIMIT 1`,
    [input.original_invoice_id]
  );
  
  if (existing && input.mode === 'full') {
    console.log('[DB] Full credit note already exists for this invoice');
    throw new Error('Un avoir total existe déjà pour cette facture');
  }

  const originalInvoice = await getDocumentById(db, input.original_invoice_id);
  if (!originalInvoice) {
    throw new Error('Facture originale non trouvée');
  }

  if (originalInvoice.type !== 'facture' || originalInvoice.document_subtype === 'credit_note') {
    throw new Error('Seules les factures peuvent faire l\'objet d\'un avoir');
  }

  const originalLines = await getLineItemsByDocumentId(db, input.original_invoice_id);

  let lineItems: LineItemInput[];
  
  if (input.mode === 'full') {
    lineItems = originalLines.map(line => ({
      product_id: line.product_id,
      label: line.label,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      tva_rate: line.tva_rate,
      discount_type: line.discount_type || 'percent',
      discount_value: line.discount_value || 0,
      image_url: line.image_url,
    }));
  } else {
    lineItems = input.modified_lines || originalLines.map(line => ({
      product_id: line.product_id,
      label: line.label,
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      tva_rate: line.tva_rate,
      discount_type: line.discount_type || 'percent',
      discount_value: line.discount_value || 0,
      image_url: line.image_url,
    }));
  }

  const creditNoteId = await createCreditNote(db, {
    client_id: originalInvoice.client_id,
    date: new Date().toISOString().split('T')[0],
    original_invoice_id: input.original_invoice_id,
    reason: input.reason,
    notes: `Avoir relatif à la facture ${originalInvoice.number}`,
    line_items: lineItems,
    global_discount_type: originalInvoice.global_discount_type || 'percent',
    global_discount_value: originalInvoice.global_discount_value || 0,
    auto_liquidation: originalInvoice.auto_liquidation === 1,
  });

  return creditNoteId;
}

export async function createCreditNoteFromMasterInvoice(
  db: SQLite.SQLiteDatabase,
  originalMasterInvoiceId: number,
  mode: 'full' | 'partial',
  reason: string,
  modifiedLines?: LineItemInput[]
): Promise<{ masterId: number; splitIds: string[] }> {
  console.log('[DB] Creating credit note from master invoice:', originalMasterInvoiceId);
  
  const masterCreditNoteId = await createCreditNoteFromInvoice(db, {
    original_invoice_id: originalMasterInvoiceId,
    mode,
    reason,
    modified_lines: modifiedLines,
  });

  const originalSplits = await getSplitsByMasterId(db, originalMasterInvoiceId);
  
  if (originalSplits.length === 0) {
    return { masterId: masterCreditNoteId, splitIds: [] };
  }

  const masterCreditNote = await getDocumentById(db, masterCreditNoteId);
  if (!masterCreditNote) {
    throw new Error('Avoir maître non trouvé');
  }

  const splitIds: string[] = [];

  for (let i = 0; i < originalSplits.length; i++) {
    const originalSplit = originalSplits[i];
    
    const ratio = originalSplit.total_ttc / (await getDocumentById(db, originalMasterInvoiceId))!.total_ttc;
    
    const splitCreditNoteTtc = Math.round(masterCreditNote.total_ttc * ratio * 100) / 100;
    const splitCreditNoteHt = Math.round(masterCreditNote.total_ht * ratio * 100) / 100;
    const splitCreditNoteTva = Math.round((splitCreditNoteTtc - splitCreditNoteHt) * 100) / 100;

    const splitId = generateUUID();
    const suffix = String.fromCharCode(65 + i);
    const numberFull = `${masterCreditNote.number}-${suffix}`;

    await db.runAsync(
      `INSERT INTO document_splits (
        id, master_id, number_full, suffix, client_id,
        allocation_mode, allocation_value,
        total_ht, total_tva, total_ttc,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        splitId,
        masterCreditNoteId,
        numberFull,
        suffix,
        originalSplit.client_id,
        originalSplit.allocation_mode,
        originalSplit.allocation_value,
        splitCreditNoteHt,
        splitCreditNoteTva,
        splitCreditNoteTtc,
      ]
    );

    const originalLineAssignments = await getSplitLineAssignments(db, originalSplit.id);
    
    for (const la of originalLineAssignments) {
      const assignmentId = generateUUID();
      const negativeHt = -Math.abs(la.total_ht * ratio);
      
      await db.runAsync(
        `INSERT INTO split_line_assignments (
          id, split_id, line_item_id, product_id, label, description,
          quantity, unit_price, tva_rate, discount_type, discount_value,
          total_ht, allocation_percentage, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          assignmentId,
          splitId,
          la.line_item_id,
          la.product_id || null,
          la.label || null,
          la.description,
          -Math.abs(la.quantity),
          la.unit_price,
          la.tva_rate,
          la.discount_type,
          la.discount_value,
          negativeHt,
          la.allocation_percentage || null,
        ]
      );
    }

    splitIds.push(splitId);
  }

  const totalSplitTtc = splitIds.length > 0 
    ? (await Promise.all(splitIds.map(async (id) => {
        const split = await db.getFirstAsync<{ total_ttc: number }>(
          'SELECT total_ttc FROM document_splits WHERE id = ?',
          [id]
        );
        return split?.total_ttc || 0;
      }))).reduce((sum, ttc) => sum + ttc, 0)
    : 0;

  const masterTtc = masterCreditNote.total_ttc;
  const diff = Math.round((masterTtc - totalSplitTtc) * 100) / 100;
  
  if (Math.abs(diff) > 0.01 && splitIds.length > 0) {
    await db.runAsync(
      `UPDATE document_splits SET total_ttc = total_ttc + ? WHERE id = ?`,
      [diff, splitIds[0]]
    );
  }

  console.log('[DB] Created master credit note and', splitIds.length, 'split credit notes');
  return { masterId: masterCreditNoteId, splitIds };
}

export async function getCreditNotesForInvoice(
  db: SQLite.SQLiteDatabase,
  invoiceId: number
): Promise<Document[]> {
  console.log('[DB] Getting credit notes for invoice:', invoiceId);
  const results = await db.getAllAsync<Document>(
    `SELECT d.*, c.name as client_name, c.company as client_company
     FROM documents d
     LEFT JOIN clients c ON d.client_id = c.id
     WHERE d.original_invoice_id = ? AND d.document_subtype = 'credit_note'
     ORDER BY d.created_at DESC`,
    [invoiceId]
  );
  return results;
}

export async function getTotalCreditedAmount(
  db: SQLite.SQLiteDatabase,
  invoiceId: number
): Promise<number> {
  console.log('[DB] Getting total credited amount for invoice:', invoiceId);
  const result = await db.getFirstAsync<{ total: number }>(
    `SELECT COALESCE(SUM(ABS(total_ttc)), 0) as total
     FROM documents
     WHERE original_invoice_id = ? AND document_subtype = 'credit_note'`,
    [invoiceId]
  );
  return result?.total || 0;
}

export async function getRemainingCreditableAmount(
  db: SQLite.SQLiteDatabase,
  invoiceId: number
): Promise<number> {
  const invoice = await getDocumentById(db, invoiceId);
  if (!invoice) return 0;
  
  const totalCredited = await getTotalCreditedAmount(db, invoiceId);
  return Math.max(0, invoice.total_ttc - totalCredited);
}

export async function validateCreditNoteAmount(
  db: SQLite.SQLiteDatabase,
  invoiceId: number,
  proposedAmount: number
): Promise<{ isValid: boolean; maxAllowed: number; message?: string }> {
  const remainingAmount = await getRemainingCreditableAmount(db, invoiceId);
  const absProposed = Math.abs(proposedAmount);
  
  if (absProposed > remainingAmount + 0.01) {
    return {
      isValid: false,
      maxAllowed: remainingAmount,
      message: `Le montant de l'avoir (${absProposed.toFixed(2)} €) dépasse le montant restant à avoir (${remainingAmount.toFixed(2)} €)`,
    };
  }
  
  return { isValid: true, maxAllowed: remainingAmount };
}

export async function getClientCreditBalance(
  db: SQLite.SQLiteDatabase,
  clientId: number
): Promise<number> {
  console.log('[DB] Getting credit balance for client:', clientId);
  
  const creditNotes = await db.getAllAsync<{ total_ttc: number; original_invoice_id: number | null }>(
    `SELECT total_ttc, original_invoice_id FROM documents
     WHERE client_id = ? AND document_subtype = 'credit_note' AND status != 'cancelled'`,
    [clientId]
  );

  let unusedCredit = 0;

  for (const cn of creditNotes) {
    if (cn.original_invoice_id) {
      const invoice = await getDocumentById(db, cn.original_invoice_id);
      if (invoice && invoice.status === 'paid') {
        unusedCredit += Math.abs(cn.total_ttc);
      }
    } else {
      unusedCredit += Math.abs(cn.total_ttc);
    }
  }

  return unusedCredit;
}

export async function getAllCreditNotes(
  db: SQLite.SQLiteDatabase
): Promise<Document[]> {
  console.log('[DB] Getting all credit notes...');
  const results = await db.getAllAsync<Document>(
    `SELECT d.*, c.name as client_name, c.company as client_company
     FROM documents d
     LEFT JOIN clients c ON d.client_id = c.id
     WHERE d.document_subtype = 'credit_note'
     ORDER BY d.created_at DESC`
  );
  return results;
}

export async function getInvoicesForCreditNote(
  db: SQLite.SQLiteDatabase,
  clientId?: number
): Promise<Document[]> {
  console.log('[DB] Getting invoices available for credit note, clientId:', clientId);
  
  let query = `
    SELECT d.*, c.name as client_name, c.company as client_company
    FROM documents d
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.type = 'facture' 
      AND d.document_subtype IS NULL OR d.document_subtype = 'invoice'
      AND d.status != 'cancelled'
  `;
  
  const params: (string | number)[] = [];
  
  if (clientId) {
    query += ' AND d.client_id = ?';
    params.push(clientId);
  }
  
  query += ' ORDER BY d.created_at DESC';
  
  const results = await db.getAllAsync<Document>(query, params);
  return results;
}

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export interface CreditNoteStats {
  totalCount: number;
  totalAmount: number;
  draftCount: number;
  sentCount: number;
  paidCount: number;
}

export async function getCreditNoteStatsByPeriod(
  db: SQLite.SQLiteDatabase,
  year: number,
  month?: number
): Promise<CreditNoteStats> {
  console.log('[CreditNotes] Getting stats for year:', year, 'month:', month);
  
  let dateCondition: string;
  let params: (string | number)[] = [];
  
  if (month !== undefined) {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
    dateCondition = "date >= ? AND date <= ?";
    params = [startDate, endDate];
  } else {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;
    dateCondition = "date >= ? AND date <= ?";
    params = [startDate, endDate];
  }
  
  const totalResult = await db.getFirstAsync<{ count: number; total: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(ABS(total_ttc)), 0) as total
     FROM documents
     WHERE document_subtype = 'credit_note' AND ${dateCondition}`,
    params
  );
  
  const draftResult = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents
     WHERE document_subtype = 'credit_note' AND status = 'draft' AND ${dateCondition}`,
    params
  );
  
  const sentResult = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents
     WHERE document_subtype = 'credit_note' AND status = 'sent' AND ${dateCondition}`,
    params
  );
  
  const paidResult = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents
     WHERE document_subtype = 'credit_note' AND status = 'paid' AND ${dateCondition}`,
    params
  );
  
  return {
    totalCount: totalResult?.count || 0,
    totalAmount: totalResult?.total || 0,
    draftCount: draftResult?.count || 0,
    sentCount: sentResult?.count || 0,
    paidCount: paidResult?.count || 0,
  };
}
