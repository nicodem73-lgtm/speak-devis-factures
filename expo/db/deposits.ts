import * as SQLite from 'expo-sqlite';
import {
  DepositConfig,
  DepositPlan,
  DepositInvoiceRef,
  InvoiceStage,
  DepositMode,
  DepositDistribution,
  calculateDepositTotal,
  calculateInstallments,
  calculateRatioForInstallment,
  calculateClientDepositAmount,
  distributeDepositRoundingError,
  generateBillingRef,
  calculateSolde,
  DEFAULT_DEPOSIT_CONFIG,
} from '@/types/deposit';
import { getSplitsByMasterId } from './splitBilling';
import { getDocumentById, createDocument, getLineItemsByDocumentId } from './documents';
import { LineItemInput } from '@/types/document';
import { getNumberingSettings, getCompanyInfo } from './settings';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function getDepositConfig(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<DepositConfig | null> {
  console.log('[Deposits] Getting deposit config for quote:', quoteId);
  
  const config = await db.getFirstAsync<{
    id: string;
    enabled: number;
    mode: DepositMode;
    value: number;
    installment_count: number;
    distribution: DepositDistribution;
    total_deposit_amount: number;
  }>(
    'SELECT * FROM deposit_configs WHERE quote_id = ?',
    [quoteId]
  );
  
  if (!config) return null;
  
  const installments = await db.getAllAsync<{
    id: string;
    installment_index: number;
    amount: number;
    percentage: number;
    due_date: string | null;
    is_generated: number;
    master_invoice_id: number | null;
  }>(
    'SELECT * FROM deposit_installments WHERE config_id = ? ORDER BY installment_index',
    [config.id]
  );
  
  return {
    enabled: config.enabled === 1,
    mode: config.mode,
    value: config.value,
    installmentCount: config.installment_count,
    distribution: config.distribution,
    installments: installments.map(i => ({
      index: i.installment_index,
      amount: i.amount,
      percentage: i.percentage,
      dueDate: i.due_date || undefined,
      isGenerated: i.is_generated === 1,
      masterInvoiceId: i.master_invoice_id || undefined,
    })),
  };
}

export async function saveDepositConfig(
  db: SQLite.SQLiteDatabase,
  quoteId: number,
  config: DepositConfig,
  quoteTotalTtc: number
): Promise<void> {
  console.log('[Deposits] Saving deposit config for quote:', quoteId, config);
  
  const existingConfig = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM deposit_configs WHERE quote_id = ?',
    [quoteId]
  );
  
  const totalDepositAmount = config.enabled 
    ? calculateDepositTotal(quoteTotalTtc, config.mode, config.value)
    : 0;
  
  let configId: string;
  
  if (existingConfig) {
    configId = existingConfig.id;
    await db.runAsync(
      `UPDATE deposit_configs SET 
        enabled = ?, mode = ?, value = ?, installment_count = ?, 
        distribution = ?, total_deposit_amount = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
      [
        config.enabled ? 1 : 0,
        config.mode,
        config.value,
        config.installmentCount,
        config.distribution,
        totalDepositAmount,
        configId,
      ]
    );
    
    await db.runAsync('DELETE FROM deposit_installments WHERE config_id = ?', [configId]);
  } else {
    configId = generateUUID();
    await db.runAsync(
      `INSERT INTO deposit_configs (id, quote_id, enabled, mode, value, installment_count, distribution, total_deposit_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        configId,
        quoteId,
        config.enabled ? 1 : 0,
        config.mode,
        config.value,
        config.installmentCount,
        config.distribution,
        totalDepositAmount,
      ]
    );
  }
  
  if (config.enabled) {
    const installments = config.installments.length > 0
      ? config.installments
      : calculateInstallments(totalDepositAmount, config.installmentCount, config.distribution);
    
    for (const installment of installments) {
      await db.runAsync(
        `INSERT INTO deposit_installments (id, config_id, installment_index, amount, percentage, due_date, is_generated)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generateUUID(),
          configId,
          installment.index,
          installment.amount,
          installment.percentage,
          installment.dueDate || null,
          installment.isGenerated ? 1 : 0,
        ]
      );
    }
  }
  
  console.log('[Deposits] Config saved with id:', configId);
}

export async function getDepositPlan(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<DepositPlan | null> {
  console.log('[Deposits] Getting deposit plan for quote:', quoteId);
  
  const quote = await getDocumentById(db, quoteId);
  if (!quote || quote.type !== 'devis') {
    console.log('[Deposits] Quote not found or not a devis');
    return null;
  }
  
  let config = await getDepositConfig(db, quoteId);
  if (!config) {
    config = { ...DEFAULT_DEPOSIT_CONFIG };
  }
  
  const generatedInvoices = await getDepositInvoices(db, quoteId);
  
  const totalDepositAmount = config.enabled
    ? calculateDepositTotal(quote.total_ttc, config.mode, config.value)
    : 0;
  
  return {
    quoteId,
    quoteNumber: quote.number,
    quoteTotalTtc: quote.total_ttc,
    quoteTotalHt: quote.total_ht,
    quoteTotalTva: quote.total_tva,
    config,
    totalDepositAmount,
    remainingBalance: quote.total_ttc - totalDepositAmount,
    generatedInvoices,
  };
}

export async function getDepositInvoices(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<DepositInvoiceRef[]> {
  const results = await db.getAllAsync<{
    id: string;
    invoice_id: number;
    billing_ref: string;
    stage: InvoiceStage;
    installment_index: number | null;
    is_master: number;
    amount: number;
    created_at: string;
  }>(
    `SELECT di.*, d.number as invoice_number 
     FROM deposit_invoices di
     JOIN documents d ON di.invoice_id = d.id
     WHERE di.quote_id = ?
     ORDER BY di.stage, di.installment_index, di.is_master DESC`,
    [quoteId]
  );
  
  return results.map(r => ({
    invoiceId: r.invoice_id,
    invoiceNumber: (r as any).invoice_number,
    billingRef: r.billing_ref,
    stage: r.stage,
    installmentIndex: r.installment_index || undefined,
    amount: r.amount,
    isMaster: r.is_master === 1,
    clientIndex: (r as any).client_index || undefined,
    createdAt: r.created_at,
  }));
}

export async function hasDepositInvoiceForInstallment(
  db: SQLite.SQLiteDatabase,
  quoteId: number,
  installmentIndex: number
): Promise<boolean> {
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM deposit_invoices 
     WHERE quote_id = ? AND stage = 'deposit' AND installment_index = ? AND is_master = 1`,
    [quoteId, installmentIndex]
  );
  return (result?.count || 0) > 0;
}

export async function hasFinalInvoice(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<boolean> {
  const result = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM deposit_invoices 
     WHERE quote_id = ? AND stage = 'final' AND is_master = 1`,
    [quoteId]
  );
  return (result?.count || 0) > 0;
}

export interface GenerateDepositInvoicesResult {
  success: boolean;
  masterInvoiceId?: number;
  splitInvoiceIds: number[];
  directSplitInvoiceIds: number[];
  billingRef: string;
  error?: string;
}

async function getNextDepositNumber(
  db: SQLite.SQLiteDatabase,
  stage: 'deposit' | 'final'
): Promise<string> {
  const numbering = await getNumberingSettings(db);
  const basePrefix = numbering.facturePrefix;
  const prefix = stage === 'deposit' ? `${basePrefix}AC-` : `${basePrefix}ACSOLDE-`;
  const year = new Date().getFullYear();

  const allInvoices = await db.getAllAsync<{ number: string }>(
    `SELECT number FROM documents WHERE type = 'facture' AND (number LIKE ? OR number LIKE ? OR number LIKE ?)`,
    [`${basePrefix}${year}-%`, `${basePrefix}AC-${year}-%`, `${basePrefix}ACSOLDE-${year}-%`]
  );

  let maxNum = 0;
  for (const doc of allInvoices) {
    const match = doc.number.match(new RegExp(`${year}-(\\d+)`));
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
      }
    }
  }

  const settingsCounter = numbering.factureCounter;
  const counter = Math.max(settingsCounter, maxNum + 1);

  if (counter !== settingsCounter) {
    console.log('[Deposits] Adjusting facture counter from', settingsCounter, 'to', counter);
    await db.runAsync(`UPDATE settings SET value = ? WHERE key = ?`, [counter.toString(), 'facture_counter']);
  }

  await db.runAsync(`UPDATE settings SET value = ? WHERE key = ?`, [(counter + 1).toString(), 'facture_counter']);
  console.log('[Deposits] getNextDepositNumber:', stage, 'prefix:', prefix, 'counter:', counter, '-> next will be', counter + 1);
  return `${prefix}${year}-${String(counter).padStart(4, '0')}`;
}

export async function generateDepositInvoices(
  db: SQLite.SQLiteDatabase,
  quoteId: number,
  installmentIndex: number
): Promise<GenerateDepositInvoicesResult> {
  console.log('[Deposits] Generating deposit invoices for quote:', quoteId, 'installment:', installmentIndex);
  
  try {
    const alreadyGenerated = await hasDepositInvoiceForInstallment(db, quoteId, installmentIndex);
    if (alreadyGenerated) {
      console.log('[Deposits] Deposit already generated for this installment');
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Facture d\'acompte déjà générée pour cette échéance',
      };
    }
    
    const quote = await getDocumentById(db, quoteId);
    if (!quote || quote.type !== 'devis') {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Devis non trouvé',
      };
    }
    
    if (quote.status !== 'accepted') {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Le devis doit être accepté pour générer les factures d\'acompte',
      };
    }
    
    const config = await getDepositConfig(db, quoteId);
    if (!config || !config.enabled) {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Configuration d\'acompte non trouvée ou désactivée',
      };
    }
    
    const installment = config.installments.find(i => i.index === installmentIndex);
    if (!installment) {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Échéance non trouvée',
      };
    }
    
    const splits = await getSplitsByMasterId(db, quoteId);
    const hasSplits = splits.length > 0;
    
    const ratio = calculateRatioForInstallment(installment.amount, quote.total_ttc);
    
    const masterBillingRef = generateBillingRef(quote.number, 'deposit', installmentIndex, true);
    
    const depositBaseNumber = await getNextDepositNumber(db, 'deposit');
    console.log('[Deposits] Deposit base number:', depositBaseNumber);
    
    const companyInfo = await getCompanyInfo(db);
    const noTva = quote.auto_liquidation === 1 || companyInfo.vatExempt;
    const defaultTvaRate = noTva ? 0 : 20;
    const tvaDivisor = noTva ? 1 : 1.2;

    const depositLineItem: LineItemInput = {
      description: `Acompte ${installmentIndex}/${config.installmentCount} - Réf. devis ${quote.number}`,
      quantity: 1,
      unit_price: Math.round(installment.amount / tvaDivisor * 100) / 100,
      tva_rate: defaultTvaRate,
      discount_type: 'percent',
      discount_value: 0,
      label: `Acompte ${installmentIndex}/${config.installmentCount}`,
    };
    
    const masterNumber = hasSplits ? depositBaseNumber : depositBaseNumber;
    
    const masterInvoiceId = await createDocument(db, {
      type: 'facture',
      number: masterNumber,
      client_id: quote.client_id,
      date: new Date().toISOString().split('T')[0],
      due_date: installment.dueDate,
      global_discount_type: 'percent',
      global_discount_value: 0,
      auto_liquidation: quote.auto_liquidation === 1,
      notes: `Facture d'acompte ${installmentIndex}/${config.installmentCount}\nRéférence devis: ${quote.number}\nRéférence: ${masterBillingRef}`,
      conditions: quote.conditions,
      legal_mentions: quote.legal_mentions,
      dossier: quote.dossier,
      objet: quote.objet ? `Acompte - ${quote.objet}` : undefined,
      line_items: [depositLineItem],
    });
    
    await db.runAsync(
      'UPDATE documents SET source_devis_id = ? WHERE id = ?',
      [quoteId, masterInvoiceId]
    );
    
    await db.runAsync(
      `INSERT INTO deposit_invoices (id, quote_id, invoice_id, billing_ref, stage, installment_index, is_master, amount)
       VALUES (?, ?, ?, ?, 'deposit', ?, 1, ?)`,
      [generateUUID(), quoteId, masterInvoiceId, masterBillingRef, installmentIndex, installment.amount]
    );
    
    const splitInvoiceIds: number[] = [];
    const directSplitInvoiceIds: number[] = [];
    
    if (hasSplits) {
      const clientAmounts = splits.map((split, idx) => ({
        clientId: split.client_id,
        amount: calculateClientDepositAmount(split.total_ttc, ratio),
        totalTtc: split.total_ttc,
        clientIndex: idx + 1,
      }));
      
      const adjustedAmounts = distributeDepositRoundingError(clientAmounts, installment.amount);
      
      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const clientIndex = i + 1;
        const adjustedAmount = adjustedAmounts.find(a => a.clientId === split.client_id)?.adjustedAmount || clientAmounts[i].amount;
        
        const splitBillingRef = generateBillingRef(quote.number, 'deposit', installmentIndex, false, clientIndex);
        
        const splitDepositLine: LineItemInput = {
          description: `Acompte ${installmentIndex}/${config.installmentCount} - Réf. devis ${quote.number} - Part ${split.client_name || `Client ${clientIndex}`}`,
          quantity: 1,
          unit_price: Math.round(adjustedAmount / tvaDivisor * 100) / 100,
          tva_rate: defaultTvaRate,
          discount_type: 'percent',
          discount_value: 0,
          label: `Acompte ${installmentIndex}/${config.installmentCount}`,
        };
        
        const suffixLetter = String.fromCharCode(64 + clientIndex);
        const splitNumber = `${depositBaseNumber}-${suffixLetter}`;
        
        const splitInvoiceId = await createDocument(db, {
          type: 'facture',
          number: splitNumber,
          client_id: split.client_id,
          date: new Date().toISOString().split('T')[0],
          due_date: installment.dueDate,
          global_discount_type: 'percent',
          global_discount_value: 0,
          auto_liquidation: quote.auto_liquidation === 1,
          notes: `Facture d'acompte ${installmentIndex}/${config.installmentCount}\nRéférence devis: ${quote.number}\nRéférence: ${splitBillingRef}`,
          conditions: quote.conditions,
          legal_mentions: quote.legal_mentions,
          dossier: quote.dossier,
          objet: quote.objet ? `Acompte - ${quote.objet}` : undefined,
          line_items: [splitDepositLine],
        });
        
        await db.runAsync(
          'UPDATE documents SET source_devis_id = ? WHERE id = ?',
          [quoteId, splitInvoiceId]
        );
        
        await db.runAsync(
          `INSERT INTO deposit_invoices (id, quote_id, invoice_id, billing_ref, stage, installment_index, is_master, master_invoice_id, client_index, amount)
           VALUES (?, ?, ?, ?, 'deposit', ?, 0, ?, ?, ?)`,
          [generateUUID(), quoteId, splitInvoiceId, splitBillingRef, installmentIndex, masterInvoiceId, clientIndex, adjustedAmount]
        );
        
        splitInvoiceIds.push(splitInvoiceId);
      }
    }
    
    await markInstallmentAsGenerated(db, quoteId, installmentIndex, masterInvoiceId);
    
    console.log('[Deposits] Generated deposit invoices - Master:', masterInvoiceId, 'Splits:', splitInvoiceIds);
    
    return {
      success: true,
      masterInvoiceId,
      splitInvoiceIds,
      directSplitInvoiceIds,
      billingRef: masterBillingRef,
    };
    
  } catch (error) {
    console.error('[Deposits] Error generating deposit invoices:', error);
    return {
      success: false,
      splitInvoiceIds: [],
      directSplitInvoiceIds: [],
      billingRef: '',
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

export async function generateFinalInvoices(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<GenerateDepositInvoicesResult> {
  console.log('[Deposits] Generating final invoices for quote:', quoteId);
  
  try {
    const alreadyGenerated = await hasFinalInvoice(db, quoteId);
    if (alreadyGenerated) {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Facture de solde déjà générée',
      };
    }
    
    const quote = await getDocumentById(db, quoteId);
    if (!quote || quote.type !== 'devis') {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Devis non trouvé',
      };
    }
    
    if (quote.status !== 'accepted') {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Le devis doit être accepté pour générer la facture de solde',
      };
    }
    
    const config = await getDepositConfig(db, quoteId);
    const lineItems = await getLineItemsByDocumentId(db, quoteId);
    const splits = await getSplitsByMasterId(db, quoteId);
    const hasSplits = splits.length > 0;
    const companyInfo = await getCompanyInfo(db);
    const noTva = quote.auto_liquidation === 1 || companyInfo.vatExempt;
    const tvaDivisor = noTva ? 1 : 1.2;
    const defaultTvaRate = noTva ? 0 : 20;
    
    const depositInvoices = await getDepositInvoices(db, quoteId);
    const masterDepositInvoices = depositInvoices.filter(inv => inv.stage === 'deposit' && inv.isMaster);
    
    const totalDepositsAmount = masterDepositInvoices.reduce((sum, inv) => sum + inv.amount, 0);
    const soldeAmount = Math.round((quote.total_ttc - totalDepositsAmount) * 100) / 100;
    
    if (soldeAmount < 0) {
      return {
        success: false,
        splitInvoiceIds: [],
        directSplitInvoiceIds: [],
        billingRef: '',
        error: 'Le solde ne peut pas être négatif',
      };
    }
    
    const masterBillingRef = generateBillingRef(quote.number, 'final', undefined, true);
    
    const soldeBaseNumber = config?.enabled 
      ? await getNextDepositNumber(db, 'final')
      : undefined;
    console.log('[Deposits] Solde base number:', soldeBaseNumber);
    
    const soldeLineItems: LineItemInput[] = lineItems.map(item => ({
      product_id: item.product_id,
      label: item.label,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      tva_rate: item.tva_rate,
      discount_type: item.discount_type || 'percent',
      discount_value: item.discount_value || 0,
      image_url: item.image_url,
    }));
    
    if (config?.enabled && masterDepositInvoices.length > 0) {
      for (const depositInv of masterDepositInvoices) {
        const depositAmount = depositInv.amount || 0;
        console.log('[Deposits] Adding deduction line for deposit:', depositInv.invoiceNumber, 'amount:', depositAmount);
        soldeLineItems.push({
          description: `Acompte déjà facturé - ${depositInv.invoiceNumber || depositInv.billingRef}`,
          quantity: 1,
          unit_price: -Math.abs(Math.round(depositAmount / tvaDivisor * 100) / 100),
          tva_rate: defaultTvaRate,
          discount_type: 'percent',
          discount_value: 0,
          label: `Déduction acompte ${depositInv.invoiceNumber || depositInv.billingRef}`,
        });
      }
    }
    
    const masterInvoiceId = await createDocument(db, {
      type: 'facture',
      number: soldeBaseNumber,
      client_id: quote.client_id,
      date: new Date().toISOString().split('T')[0],
      due_date: quote.due_date,
      global_discount_type: quote.global_discount_type || 'percent',
      global_discount_value: quote.global_discount_value || 0,
      auto_liquidation: quote.auto_liquidation === 1,
      notes: config?.enabled 
        ? `Facture de solde\nRéférence devis: ${quote.number}\nRéférence: ${masterBillingRef}`
        : `Facture\nRéférence devis: ${quote.number}`,
      conditions: quote.conditions,
      legal_mentions: quote.legal_mentions,
      dossier: quote.dossier,
      objet: config?.enabled ? `Solde - ${quote.objet || ''}` : quote.objet,
      line_items: soldeLineItems,
    });
    
    await db.runAsync(
      'UPDATE documents SET source_devis_id = ? WHERE id = ?',
      [quoteId, masterInvoiceId]
    );
    
    await db.runAsync(
      `INSERT INTO deposit_invoices (id, quote_id, invoice_id, billing_ref, stage, is_master, amount)
       VALUES (?, ?, ?, ?, 'final', 1, ?)`,
      [generateUUID(), quoteId, masterInvoiceId, masterBillingRef, soldeAmount]
    );
    
    const splitInvoiceIds: number[] = [];
    
    if (hasSplits) {
      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const clientIndex = i + 1;
        
        const clientDepositInvoices = depositInvoices.filter(
          inv => inv.stage === 'deposit' && !inv.isMaster && inv.clientIndex === clientIndex
        );
        const clientTotalDeposits = clientDepositInvoices.reduce((sum, inv) => sum + inv.amount, 0);
        const clientSolde = calculateSolde(split.total_ttc, [clientTotalDeposits]);
        
        if (clientSolde < 0) {
          console.warn('[Deposits] Negative solde for client:', split.client_id);
          continue;
        }
        
        const splitBillingRef = generateBillingRef(quote.number, 'final', undefined, false, clientIndex);
        
        const splitSoldeLines: LineItemInput[] = [];
        
        const splitLineAssignments = await db.getAllAsync<{
          description: string;
          quantity: number;
          unit_price: number;
          tva_rate: number;
          discount_type: string;
          discount_value: number;
          label: string | null;
        }>(
          'SELECT * FROM split_line_assignments WHERE split_id = ?',
          [split.id]
        );
        
        for (const assignment of splitLineAssignments) {
          splitSoldeLines.push({
            description: assignment.description,
            quantity: assignment.quantity,
            unit_price: assignment.unit_price,
            tva_rate: assignment.tva_rate,
            discount_type: (assignment.discount_type as 'percent' | 'fixed') || 'percent',
            discount_value: assignment.discount_value || 0,
            label: assignment.label || undefined,
          });
        }
        
        if (config?.enabled && clientDepositInvoices.length > 0) {
          for (const depositInv of clientDepositInvoices) {
            const depAmount = depositInv.amount || 0;
            console.log('[Deposits] Adding split deduction for client:', split.client_id, 'amount:', depAmount);
            splitSoldeLines.push({
              description: `Acompte déjà facturé - ${depositInv.invoiceNumber || depositInv.billingRef}`,
              quantity: 1,
              unit_price: -Math.abs(Math.round(depAmount / 1.2 * 100) / 100),
              tva_rate: 20,
              discount_type: 'percent',
              discount_value: 0,
              label: `Déduction acompte ${depositInv.invoiceNumber || depositInv.billingRef}`,
            });
          }
        }
        
        const suffixLetter = String.fromCharCode(64 + clientIndex);
        const splitSoldeNumber = soldeBaseNumber ? `${soldeBaseNumber}-${suffixLetter}` : undefined;
        
        const splitInvoiceId = await createDocument(db, {
          type: 'facture',
          number: splitSoldeNumber,
          client_id: split.client_id,
          date: new Date().toISOString().split('T')[0],
          due_date: quote.due_date,
          global_discount_type: 'percent',
          global_discount_value: 0,
          auto_liquidation: quote.auto_liquidation === 1,
          notes: config?.enabled
            ? `Facture de solde\nRéférence devis: ${quote.number}\nRéférence: ${splitBillingRef}`
            : `Facture\nRéférence devis: ${quote.number}`,
          conditions: quote.conditions,
          legal_mentions: quote.legal_mentions,
          dossier: quote.dossier,
          objet: config?.enabled ? `Solde - ${quote.objet || ''}` : quote.objet,
          line_items: splitSoldeLines,
        });
        
        await db.runAsync(
          'UPDATE documents SET source_devis_id = ? WHERE id = ?',
          [quoteId, splitInvoiceId]
        );
        
        await db.runAsync(
          `INSERT INTO deposit_invoices (id, quote_id, invoice_id, billing_ref, stage, is_master, master_invoice_id, client_index, amount)
           VALUES (?, ?, ?, ?, 'final', 0, ?, ?, ?)`,
          [generateUUID(), quoteId, splitInvoiceId, splitBillingRef, masterInvoiceId, clientIndex, clientSolde]
        );
        
        splitInvoiceIds.push(splitInvoiceId);
      }
    }
    
    console.log('[Deposits] Generated final invoices - Master:', masterInvoiceId, 'Splits:', splitInvoiceIds);
    
    return {
      success: true,
      masterInvoiceId,
      splitInvoiceIds,
      directSplitInvoiceIds: [],
      billingRef: masterBillingRef,
    };
    
  } catch (error) {
    console.error('[Deposits] Error generating final invoices:', error);
    return {
      success: false,
      splitInvoiceIds: [],
      directSplitInvoiceIds: [],
      billingRef: '',
      error: error instanceof Error ? error.message : 'Erreur inconnue',
    };
  }
}

async function markInstallmentAsGenerated(
  db: SQLite.SQLiteDatabase,
  quoteId: number,
  installmentIndex: number,
  masterInvoiceId: number
): Promise<void> {
  const config = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM deposit_configs WHERE quote_id = ?',
    [quoteId]
  );
  
  if (config) {
    await db.runAsync(
      `UPDATE deposit_installments 
       SET is_generated = 1, master_invoice_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE config_id = ? AND installment_index = ?`,
      [masterInvoiceId, config.id, installmentIndex]
    );
  }
}

export async function getLinkedInvoicesForQuote(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<{
  depositInvoices: DepositInvoiceRef[];
  finalInvoices: DepositInvoiceRef[];
  allInvoices: Document[];
}> {
  const depositInvoiceRefs = await getDepositInvoices(db, quoteId);
  
  const allInvoices = await db.getAllAsync<Document>(
    `SELECT d.*, c.name as client_name, c.company as client_company
     FROM documents d
     LEFT JOIN clients c ON d.client_id = c.id
     WHERE d.source_devis_id = ? AND d.type = 'facture'
     ORDER BY d.created_at DESC`,
    [quoteId]
  );
  
  return {
    depositInvoices: depositInvoiceRefs.filter(inv => inv.stage === 'deposit'),
    finalInvoices: depositInvoiceRefs.filter(inv => inv.stage === 'final'),
    allInvoices,
  };
}

export async function deleteDepositConfig(
  db: SQLite.SQLiteDatabase,
  quoteId: number
): Promise<void> {
  console.log('[Deposits] Deleting deposit config for quote:', quoteId);
  await db.runAsync('DELETE FROM deposit_configs WHERE quote_id = ?', [quoteId]);
}
