import * as SQLite from 'expo-sqlite';
import { Document, DocumentType, DocumentStatus, LineItem, LineItemInput, DiscountType, calculateLineTotal, calculateDocumentTotals } from '@/types/document';
import { getSplitsByMasterId, getSplitLineAssignments, createDocumentSplits } from '@/db/splitBilling';
import { AllocationMode } from '@/types/splitBilling';
import { getNumberingSettings, incrementCounter } from '@/db/settings';

export async function getAllDocuments(db: SQLite.SQLiteDatabase, isTest?: number): Promise<Document[]> {
  console.log('[DB] Getting all documents with client info... isTest:', isTest);
  const filter = isTest !== undefined ? `WHERE d.is_test = ${isTest}` : '';
  const results = await db.getAllAsync<Document>(`
    SELECT 
      d.*,
      c.name as client_name,
      c.company as client_company,
      (SELECT COUNT(*) FROM document_splits WHERE master_id = d.id) as split_count
    FROM documents d
    LEFT JOIN clients c ON d.client_id = c.id
    ${filter}
    ORDER BY d.created_at DESC
  `);
  console.log('[DB] Found documents:', results.length);
  return results;
}

export async function getDocumentById(db: SQLite.SQLiteDatabase, id: number): Promise<Document | null> {
  console.log('[DB] Getting document by id:', id);
  const result = await db.getFirstAsync<Document>(`
    SELECT 
      d.*,
      c.name as client_name,
      c.company as client_company
    FROM documents d
    LEFT JOIN clients c ON d.client_id = c.id
    WHERE d.id = ?
  `, [id]);
  return result || null;
}

export async function getDocumentsByClientId(db: SQLite.SQLiteDatabase, clientId: number): Promise<Document[]> {
  console.log('[DB] Getting documents for client:', clientId);
  const results = await db.getAllAsync<Document>(`
    SELECT * FROM documents 
    WHERE client_id = ? 
    ORDER BY created_at DESC
  `, [clientId]);
  return results;
}

export async function getNextDocumentNumber(db: SQLite.SQLiteDatabase, type: DocumentType, isTest?: boolean): Promise<string> {
  const numbering = await getNumberingSettings(db);
  
  const basePrefix = type === 'devis' ? numbering.devisPrefix : numbering.facturePrefix;
  const settingsCounter = type === 'devis' ? numbering.devisCounter : numbering.factureCounter;
  const prefix = isTest ? `TEST-${basePrefix}` : basePrefix;
  const year = new Date().getFullYear();

  const searchPrefix = `${prefix}${year}-`;
  const existing = await db.getAllAsync<{ number: string }>(
    `SELECT number FROM documents WHERE number LIKE ? ORDER BY number DESC LIMIT 1`,
    [`${searchPrefix}%`]
  );

  let maxExisting = 0;
  if (existing.length > 0) {
    for (const doc of existing) {
      const suffix = doc.number.replace(searchPrefix, '').split('-')[0];
      const num = parseInt(suffix, 10);
      if (!isNaN(num) && num >= maxExisting) {
        maxExisting = num;
      }
    }
  }

  const counter = Math.max(settingsCounter, maxExisting + 1);

  if (counter !== settingsCounter) {
    console.log('[DB] Counter adjusted from', settingsCounter, 'to', counter, 'based on existing documents');
    const key = type === 'devis' ? 'devis_counter' : 'facture_counter';
    await db.runAsync(`UPDATE settings SET value = ? WHERE key = ?`, [counter.toString(), key]);
  }

  console.log('[DB] getNextDocumentNumber:', type, 'prefix:', prefix, 'year:', year, 'counter:', counter);
  return `${prefix}${year}-${String(counter).padStart(4, '0')}`;
}

export interface CreateDocumentData {
  type: DocumentType;
  number?: string;
  client_id: number;
  date: string;
  due_date?: string;
  global_discount_type: DiscountType;
  global_discount_value: number;
  auto_liquidation: boolean;
  notes?: string;
  conditions?: string;
  legal_mentions?: string;
  dossier?: string;
  objet?: string;
  line_items: LineItemInput[];
  is_test?: boolean;
  is_einvoice?: boolean;
}

export async function createDocument(
  db: SQLite.SQLiteDatabase,
  data: CreateDocumentData
): Promise<number> {
  console.log('[DB] Creating document:', data.type);
  
  const number = data.number || await getNextDocumentNumber(db, data.type, data.is_test);
  
  const totals = calculateDocumentTotals(
    data.line_items,
    data.global_discount_type,
    data.global_discount_value,
    data.auto_liquidation
  );

  const result = await db.runAsync(
    `INSERT INTO documents (type, number, client_id, status, date, due_date, total_ht, total_tva, total_ttc, global_discount_type, global_discount_value, auto_liquidation, notes, conditions, legal_mentions, dossier, objet, is_test, is_einvoice)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.type,
      number,
      data.client_id,
      data.date,
      data.due_date || null,
      totals.totalHt,
      totals.totalTva,
      totals.totalTtc,
      data.global_discount_type,
      data.global_discount_value,
      data.auto_liquidation ? 1 : 0,
      data.notes || null,
      data.conditions || null,
      data.legal_mentions || null,
      data.dossier || null,
      data.objet || null,
      data.is_test ? 1 : 0,
      data.is_einvoice ? 1 : 0,
    ]
  );

  const documentId = result.lastInsertRowId;

  for (const item of data.line_items) {
    const { ht } = calculateLineTotal(item);
    await db.runAsync(
      `INSERT INTO line_items (document_id, product_id, label, description, quantity, unit_price, tva_rate, discount_type, discount_value, total_ht, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        documentId,
        item.product_id || null,
        item.label || null,
        item.description,
        item.quantity,
        item.unit_price,
        item.tva_rate,
        item.discount_type,
        item.discount_value,
        ht,
        item.image_url || null,
      ]
    );
  }

  if (!data.number) {
    await incrementCounter(db, data.type);
    console.log('[DB] Document created with id:', documentId, '- counter incremented for', data.type);
  } else {
    console.log('[DB] Document created with id:', documentId, '- custom number provided, counter not incremented');
  }
  return documentId;
}

export async function updateDocumentStatus(
  db: SQLite.SQLiteDatabase,
  id: number,
  status: DocumentStatus
): Promise<void> {
  console.log('[DB] Updating document status:', id, status);
  await db.runAsync(
    `UPDATE documents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id]
  );
}

export async function markDocumentAsSent(
  db: SQLite.SQLiteDatabase,
  id: number
): Promise<void> {
  console.log('[DB] Marking document as sent:', id);
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE documents SET status = 'sent', sent_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [now, id]
  );
}

export async function markDocumentAsPaid(
  db: SQLite.SQLiteDatabase,
  id: number,
  paymentMethod?: string
): Promise<void> {
  console.log('[DB] Marking document as paid:', id, paymentMethod);
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE documents SET status = 'paid', paid_at = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [now, paymentMethod || null, id]
  );
}

export async function convertDevisToFacture(
  db: SQLite.SQLiteDatabase,
  devisId: number
): Promise<number> {
  console.log('[DB] Converting devis to facture:', devisId);
  
  const original = await getDocumentById(db, devisId);
  if (!original) throw new Error('Document not found');
  if (original.type !== 'devis') throw new Error('Document is not a devis');
  
  const lineItems = await getLineItemsByDocumentId(db, devisId);
  const devisSplits = await getSplitsByMasterId(db, devisId);
  const hasSplitBilling = devisSplits.length > 0;

  console.log('[DB] Devis has splits:', hasSplitBilling, 'count:', devisSplits.length);

  const newData: CreateDocumentData = {
    type: 'facture',
    client_id: original.client_id,
    date: new Date().toISOString().split('T')[0],
    due_date: original.due_date,
    global_discount_type: original.global_discount_type || 'percent',
    global_discount_value: original.global_discount_value || 0,
    auto_liquidation: original.auto_liquidation === 1,
    notes: original.notes,
    conditions: original.conditions,
    legal_mentions: original.legal_mentions,
    dossier: original.dossier,
    objet: original.objet,
    line_items: lineItems.map(item => ({
      product_id: item.product_id,
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      discount_type: item.discount_type || 'percent',
      discount_value: item.discount_value || 0,
    })),
  };
  
  const factureId = await createDocument(db, newData);
  
  await db.runAsync(
    'UPDATE documents SET source_devis_id = ? WHERE id = ?',
    [devisId, factureId]
  );

  if (hasSplitBilling) {
    const factureDoc = await getDocumentById(db, factureId);
    const factureNumber = factureDoc?.number || '';
    console.log('[DB] Creating invoice splits with base number:', factureNumber);

    const factureLineItems = await getLineItemsByDocumentId(db, factureId);

    const splitInputs = [];
    for (const split of devisSplits) {
      const assignments = await getSplitLineAssignments(db, split.id);
      const assignedKeys = assignments.map(a => {
        const matchingLine = lineItems.find(l => l.id === a.line_item_id);
        return matchingLine ? `line-${lineItems.indexOf(matchingLine)}` : '';
      }).filter(k => k !== '');

      splitInputs.push({
        key: `split-${split.id}`,
        client_id: split.client_id,
        allocation_mode: split.allocation_mode as AllocationMode,
        allocation_value: String(split.allocation_value || 0),
        assigned_line_keys: assignedKeys,
        computed_total_ht: split.total_ht,
        computed_total_tva: split.total_tva,
        computed_total_ttc: split.total_ttc,
      });
    }

    const lineItemsForSplit = factureLineItems.map((item, index) => ({
      id: item.id,
      key: `line-${index}`,
      product_id: item.product_id,
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      discount_type: (item.discount_type || 'percent') as 'percent' | 'fixed',
      discount_value: item.discount_value || 0,
      total_ht: item.total_ht,
    }));

    const totals = calculateDocumentTotals(
      newData.line_items,
      newData.global_discount_type,
      newData.global_discount_value,
      newData.auto_liquidation
    );

    await createDocumentSplits(db, {
      masterId: factureId,
      masterNumber: factureNumber,
      masterTotalTtc: totals.totalTtc,
      autoLiquidation: newData.auto_liquidation,
      splits: splitInputs,
      lineItems: lineItemsForSplit,
    });

    console.log('[DB] Invoice splits created with suffixes -A, -B, etc. for number:', factureNumber);
  }
  
  await db.runAsync(
    `UPDATE documents SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [devisId]
  );
  
  console.log('[DB] Created facture from devis:', factureId, 'with splits:', hasSplitBilling);
  return factureId;
}

export async function deleteDocument(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  console.log('[DB] Deleting document:', id);
  await db.runAsync('DELETE FROM documents WHERE id = ?', [id]);
}

export async function getLineItemsByDocumentId(db: SQLite.SQLiteDatabase, documentId: number): Promise<LineItem[]> {
  console.log('[DB] Getting line items for document:', documentId);
  const results = await db.getAllAsync<LineItem>(
    'SELECT * FROM line_items WHERE document_id = ? ORDER BY id',
    [documentId]
  );
  return results;
}

export async function getDocumentStats(db: SQLite.SQLiteDatabase): Promise<{
  totalDevis: number;
  totalFactures: number;
  totalUnpaid: number;
  totalPaid: number;
}> {
  const devisCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM documents WHERE type = ?', ['devis']);
  const facturesCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM documents WHERE type = ?', ['facture']);
  const unpaidSum = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(total_ttc), 0) as total FROM documents WHERE type = ? AND status != ?', ['facture', 'paid']);
  const paidSum = await db.getFirstAsync<{ total: number }>('SELECT COALESCE(SUM(total_ttc), 0) as total FROM documents WHERE type = ? AND status = ?', ['facture', 'paid']);

  return {
    totalDevis: devisCount?.count || 0,
    totalFactures: facturesCount?.count || 0,
    totalUnpaid: unpaidSum?.total || 0,
    totalPaid: paidSum?.total || 0,
  };
}

export async function updateDocument(
  db: SQLite.SQLiteDatabase,
  id: number,
  data: CreateDocumentData
): Promise<void> {
  console.log('[DB] Updating document:', id);
  
  const totals = calculateDocumentTotals(
    data.line_items,
    data.global_discount_type,
    data.global_discount_value,
    data.auto_liquidation
  );

  await db.runAsync(
    `UPDATE documents SET 
      type = ?, number = ?, client_id = ?, date = ?, due_date = ?,
      total_ht = ?, total_tva = ?, total_ttc = ?,
      global_discount_type = ?, global_discount_value = ?, auto_liquidation = ?,
      notes = ?, conditions = ?, legal_mentions = ?, dossier = ?, objet = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`,
    [
      data.type,
      data.number || '',
      data.client_id,
      data.date,
      data.due_date || null,
      totals.totalHt,
      totals.totalTva,
      totals.totalTtc,
      data.global_discount_type,
      data.global_discount_value,
      data.auto_liquidation ? 1 : 0,
      data.notes || null,
      data.conditions || null,
      data.legal_mentions || null,
      data.dossier || null,
      data.objet || null,
      id,
    ]
  );

  await db.runAsync('DELETE FROM line_items WHERE document_id = ?', [id]);

  for (const item of data.line_items) {
    const { ht } = calculateLineTotal(item);
    await db.runAsync(
      `INSERT INTO line_items (document_id, product_id, label, description, quantity, unit_price, tva_rate, discount_type, discount_value, total_ht, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.product_id || null,
        item.label || null,
        item.description,
        item.quantity,
        item.unit_price,
        item.tva_rate,
        item.discount_type,
        item.discount_value,
        ht,
        item.image_url || null,
      ]
    );
  }

  console.log('[DB] Document updated:', id);
}

export async function duplicateDocument(
  db: SQLite.SQLiteDatabase,
  id: number
): Promise<number> {
  console.log('[DB] Duplicating document:', id);
  
  const original = await getDocumentById(db, id);
  if (!original) throw new Error('Document not found');
  
  const lineItems = await getLineItemsByDocumentId(db, id);
  
  const newData: CreateDocumentData = {
    type: original.type,
    client_id: original.client_id,
    date: new Date().toISOString().split('T')[0],
    due_date: original.due_date,
    global_discount_type: original.global_discount_type || 'percent',
    global_discount_value: original.global_discount_value || 0,
    auto_liquidation: original.auto_liquidation === 1,
    notes: original.notes,
    conditions: original.conditions,
    legal_mentions: original.legal_mentions,
    dossier: original.dossier,
    objet: original.objet,
    line_items: lineItems.map(item => ({
      product_id: item.product_id,
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      discount_type: item.discount_type || 'percent',
      discount_value: item.discount_value || 0,
    })),
  };
  
  return createDocument(db, newData);
}

export interface MonthlyStats {
  month: string;
  year: number;
  monthNum: number;
  revenue: number;
  paidCount: number;
  unpaidCount: number;
  paidAmount: number;
  unpaidAmount: number;
}

export interface PeriodStats {
  totalRevenue: number;
  paidInvoices: number;
  unpaidInvoices: number;
  paidAmount: number;
  unpaidAmount: number;
  acceptedQuotes: number;
  rejectedQuotes: number;
  pendingQuotes: number;
  totalQuotes: number;
  acceptedQuotesAmount: number;
  monthlyData: MonthlyStats[];
}

export async function getStatsByPeriod(
  db: SQLite.SQLiteDatabase,
  year: number,
  month?: number,
  isTest?: number
): Promise<PeriodStats> {
  console.log('[DB] Getting stats for period:', year, month, 'isTest:', isTest);
  
  let dateFilter: string;
  let params: (string | number)[];
  
  const testFilter = isTest !== undefined ? ` AND is_test = ${isTest}` : '';

  if (month !== undefined) {
    const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endMonth = month + 2;
    const endYear = endMonth > 12 ? year + 1 : year;
    const endMonthAdjusted = endMonth > 12 ? endMonth - 12 : endMonth;
    const endDate = `${endYear}-${String(endMonthAdjusted).padStart(2, '0')}-01`;
    dateFilter = `date >= ? AND date < ?${testFilter}`;
    params = [startDate, endDate];
  } else {
    dateFilter = `strftime('%Y', date) = ?${testFilter}`;
    params = [String(year)];
  }

  const paidInvoices = await db.getFirstAsync<{ count: number; total: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_ttc), 0) as total 
     FROM documents WHERE type = 'facture' AND status = 'paid' AND ${dateFilter}`,
    params
  );

  const unpaidInvoices = await db.getFirstAsync<{ count: number; total: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_ttc), 0) as total 
     FROM documents WHERE type = 'facture' AND status != 'paid' AND status != 'cancelled' AND ${dateFilter}`,
    params
  );

  const acceptedQuotes = await db.getFirstAsync<{ count: number; total: number }>(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_ttc), 0) as total 
     FROM documents WHERE type = 'devis' AND status = 'accepted' AND ${dateFilter}`,
    params
  );

  const rejectedQuotes = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents WHERE type = 'devis' AND status = 'rejected' AND ${dateFilter}`,
    params
  );

  const pendingQuotes = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents WHERE type = 'devis' AND status IN ('draft', 'sent') AND ${dateFilter}`,
    params
  );

  const totalQuotes = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM documents WHERE type = 'devis' AND ${dateFilter}`,
    params
  );

  let monthlyData: MonthlyStats[] = [];
  
  if (month === undefined) {
    const monthlyResults = await db.getAllAsync<{ month: string; total: number; paid_count: number; unpaid_count: number; paid_amount: number; unpaid_amount: number }>(
      `SELECT 
        strftime('%m', date) as month,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_ttc ELSE 0 END), 0) as total,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paid_count,
        COUNT(CASE WHEN status != 'paid' AND status != 'cancelled' THEN 1 END) as unpaid_count,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total_ttc ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status != 'paid' AND status != 'cancelled' THEN total_ttc ELSE 0 END), 0) as unpaid_amount
      FROM documents 
      WHERE type = 'facture' AND strftime('%Y', date) = ?${testFilter}
      GROUP BY strftime('%m', date)
      ORDER BY month`,
      [String(year)]
    );

    const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    
    for (let i = 0; i < 12; i++) {
      const monthStr = String(i + 1).padStart(2, '0');
      const found = monthlyResults.find(r => r.month === monthStr);
      monthlyData.push({
        month: monthNames[i],
        year,
        monthNum: i,
        revenue: found?.total || 0,
        paidCount: found?.paid_count || 0,
        unpaidCount: found?.unpaid_count || 0,
        paidAmount: found?.paid_amount || 0,
        unpaidAmount: found?.unpaid_amount || 0,
      });
    }
  }

  return {
    totalRevenue: paidInvoices?.total || 0,
    paidInvoices: paidInvoices?.count || 0,
    unpaidInvoices: unpaidInvoices?.count || 0,
    paidAmount: paidInvoices?.total || 0,
    unpaidAmount: unpaidInvoices?.total || 0,
    acceptedQuotes: acceptedQuotes?.count || 0,
    rejectedQuotes: rejectedQuotes?.count || 0,
    pendingQuotes: pendingQuotes?.count || 0,
    totalQuotes: totalQuotes?.count || 0,
    acceptedQuotesAmount: acceptedQuotes?.total || 0,
    monthlyData,
  };
}

export async function getAvailableYears(db: SQLite.SQLiteDatabase): Promise<number[]> {
  const results = await db.getAllAsync<{ year: string }>(
    `SELECT DISTINCT strftime('%Y', date) as year FROM documents ORDER BY year DESC`
  );
  const years = results.map(r => parseInt(r.year, 10)).filter(y => !isNaN(y));
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) {
    years.unshift(currentYear);
  }
  return years.sort((a, b) => b - a);
}

export async function getLinkedPaidFacture(
  db: SQLite.SQLiteDatabase,
  devisId: number
): Promise<{ id: number; number: string } | null> {
  console.log('[DB] Checking for linked paid facture for devis:', devisId);
  const result = await db.getFirstAsync<{ id: number; number: string }>(
    `SELECT id, number FROM documents WHERE source_devis_id = ? AND status = 'paid' LIMIT 1`,
    [devisId]
  );
  return result || null;
}
