import * as SQLite from 'expo-sqlite';
import { getActiveYear, initYearDatabase } from './multiYearDatabase';

export interface CompanyInfo {
  name: string;
  address: string;
  city: string;
  postalCode: string;
  email: string;
  phone: string;
  siret: string;
  tvaNumber: string;
  iban: string;
  logo?: string;
  legalForm: string;
  capital: string;
  rcsNumber: string;
  rcsCity: string;
  rmNumber: string;
  rmDepartment: string;
  vatExempt: boolean;
  defaultConditions: string;
  defaultLegalMentions: string;
}

export interface NumberingSettings {
  devisPrefix: string;
  devisCounter: number;
  facturePrefix: string;
  factureCounter: number;
}

export interface TaxRate {
  id: string;
  name: string;
  rate: number;
  isDefault: boolean;
}

export type TemplateStyle = 'classic' | 'modern' | 'elegant' | 'professional' | 'minimal' | 'creative';

export interface TemplateSettings {
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  footerText: string;
  showLogo: boolean;
  templateStyle: TemplateStyle;
}

export interface AppSettings {
  currency: string;
  dateFormat: string;
  language: string;
}

interface SettingRow {
  key: string;
  value: string | null;
}

export async function getSetting(db: SQLite.SQLiteDatabase, key: string): Promise<string | null> {
  console.log('[DB-Settings] Getting setting:', key);
  const result = await db.getFirstAsync<SettingRow>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return result?.value || null;
}

export async function setSetting(db: SQLite.SQLiteDatabase, key: string, value: string): Promise<void> {
  console.log('[DB-Settings] Setting:', key, '=', value);
  await db.runAsync(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
    [key, value]
  );
}

export async function getAllSettings(db: SQLite.SQLiteDatabase): Promise<Record<string, string>> {
  console.log('[DB-Settings] Getting all settings');
  const results = await db.getAllAsync<SettingRow>('SELECT key, value FROM settings');
  const settings: Record<string, string> = {};
  for (const row of results) {
    if (row.value !== null) {
      settings[row.key] = row.value;
    }
  }
  return settings;
}

export async function getCompanyInfo(db: SQLite.SQLiteDatabase): Promise<CompanyInfo> {
  console.log('[DB-Settings] Getting company info');
  const settings = await getAllSettings(db);
  
  return {
    name: settings.company_name || '',
    address: settings.company_address || '',
    city: settings.company_city || '',
    postalCode: settings.company_postal_code || '',
    email: settings.company_email || '',
    phone: settings.company_phone || '',
    siret: settings.company_siret || '',
    tvaNumber: settings.company_tva_number || '',
    iban: settings.company_iban || '',
    logo: settings.company_logo || undefined,
    legalForm: settings.company_legal_form || '',
    capital: settings.company_capital || '',
    rcsNumber: settings.company_rcs_number || '',
    rcsCity: settings.company_rcs_city || '',
    rmNumber: settings.company_rm_number || '',
    rmDepartment: settings.company_rm_department || '',
    vatExempt: settings.company_vat_exempt === 'true',
    defaultConditions: settings.company_default_conditions || '',
    defaultLegalMentions: settings.company_default_legal_mentions || '',
  };
}

export async function saveCompanyInfo(db: SQLite.SQLiteDatabase, info: CompanyInfo): Promise<void> {
  console.log('[DB-Settings] Saving company info');
  await setSetting(db, 'company_name', info.name);
  await setSetting(db, 'company_address', info.address);
  await setSetting(db, 'company_city', info.city);
  await setSetting(db, 'company_postal_code', info.postalCode);
  await setSetting(db, 'company_email', info.email);
  await setSetting(db, 'company_phone', info.phone);
  await setSetting(db, 'company_siret', info.siret);
  await setSetting(db, 'company_tva_number', info.tvaNumber);
  await setSetting(db, 'company_iban', info.iban);
  if (info.logo) {
    await setSetting(db, 'company_logo', info.logo);
  }
  await setSetting(db, 'company_legal_form', info.legalForm);
  await setSetting(db, 'company_capital', info.capital);
  await setSetting(db, 'company_rcs_number', info.rcsNumber);
  await setSetting(db, 'company_rcs_city', info.rcsCity);
  await setSetting(db, 'company_rm_number', info.rmNumber);
  await setSetting(db, 'company_rm_department', info.rmDepartment);
  await setSetting(db, 'company_vat_exempt', info.vatExempt ? 'true' : 'false');
  await setSetting(db, 'company_default_conditions', info.defaultConditions);
  await setSetting(db, 'company_default_legal_mentions', info.defaultLegalMentions);
}

export async function getNumberingSettings(db: SQLite.SQLiteDatabase): Promise<NumberingSettings> {
  console.log('[DB-Settings] Getting numbering settings');
  const settings = await getAllSettings(db);
  
  return {
    devisPrefix: settings.devis_prefix || 'DEV-',
    devisCounter: parseInt(settings.devis_counter || '1', 10),
    facturePrefix: settings.facture_prefix || 'FAC-',
    factureCounter: parseInt(settings.facture_counter || '1', 10),
  };
}

export async function saveNumberingSettings(db: SQLite.SQLiteDatabase, settings: NumberingSettings): Promise<void> {
  console.log('[DB-Settings] Saving numbering settings');
  await setSetting(db, 'devis_prefix', settings.devisPrefix);
  await setSetting(db, 'devis_counter', settings.devisCounter.toString());
  await setSetting(db, 'facture_prefix', settings.facturePrefix);
  await setSetting(db, 'facture_counter', settings.factureCounter.toString());
}

export async function incrementCounter(db: SQLite.SQLiteDatabase, type: 'devis' | 'facture'): Promise<void> {
  const key = `${type}_counter`;
  const current = await getSetting(db, key);
  const newValue = (parseInt(current || '1', 10) + 1).toString();
  await setSetting(db, key, newValue);
}

export async function getTaxRates(db: SQLite.SQLiteDatabase): Promise<TaxRate[]> {
  console.log('[DB-Settings] Getting tax rates');
  const settings = await getAllSettings(db);
  const taxRatesJson = settings.tax_rates;
  
  if (taxRatesJson) {
    try {
      return JSON.parse(taxRatesJson);
    } catch (e) {
      console.error('[DB-Settings] Error parsing tax rates:', e);
    }
  }
  
  return [
    { id: '1', name: 'TVA Standard', rate: 20, isDefault: true },
    { id: '2', name: 'TVA Intermédiaire', rate: 10, isDefault: false },
    { id: '3', name: 'TVA Réduite', rate: 5.5, isDefault: false },
    { id: '4', name: 'TVA Super Réduite', rate: 2.1, isDefault: false },
  ];
}

export async function saveTaxRates(db: SQLite.SQLiteDatabase, rates: TaxRate[]): Promise<void> {
  console.log('[DB-Settings] Saving tax rates');
  await setSetting(db, 'tax_rates', JSON.stringify(rates));
}

export async function getTemplateSettings(db: SQLite.SQLiteDatabase): Promise<TemplateSettings> {
  console.log('[DB-Settings] Getting template settings');
  const settings = await getAllSettings(db);
  
  return {
    primaryColor: settings.template_primary_color || '#3B82F6',
    accentColor: settings.template_accent_color || '#10B981',
    fontFamily: settings.template_font_family || 'System',
    footerText: settings.template_footer_text || '',
    showLogo: settings.template_show_logo !== 'false',
    templateStyle: (settings.template_style as TemplateStyle) || 'classic',
  };
}

export async function saveTemplateSettings(db: SQLite.SQLiteDatabase, template: TemplateSettings): Promise<void> {
  console.log('[DB-Settings] Saving template settings');
  await setSetting(db, 'template_primary_color', template.primaryColor);
  await setSetting(db, 'template_accent_color', template.accentColor);
  await setSetting(db, 'template_font_family', template.fontFamily);
  await setSetting(db, 'template_footer_text', template.footerText);
  await setSetting(db, 'template_show_logo', template.showLogo.toString());
  await setSetting(db, 'template_style', template.templateStyle);
}

export async function getAppSettings(db: SQLite.SQLiteDatabase): Promise<AppSettings> {
  console.log('[DB-Settings] Getting app settings');
  const settings = await getAllSettings(db);
  
  return {
    currency: settings.currency || 'EUR',
    dateFormat: settings.date_format || 'DD/MM/YYYY',
    language: settings.language || 'fr',
  };
}

export async function saveAppSettings(db: SQLite.SQLiteDatabase, appSettings: AppSettings): Promise<void> {
  console.log('[DB-Settings] Saving app settings');
  await setSetting(db, 'currency', appSettings.currency);
  await setSetting(db, 'date_format', appSettings.dateFormat);
  await setSetting(db, 'language', appSettings.language);
}

export async function exportAllData(db: SQLite.SQLiteDatabase): Promise<string> {
  console.log('[DB-Settings] Exporting all data');
  
  const clients = await db.getAllAsync('SELECT * FROM clients');
  const products = await db.getAllAsync('SELECT * FROM products');
  const documents = await db.getAllAsync('SELECT * FROM documents');
  const lineItems = await db.getAllAsync('SELECT * FROM line_items');
  const reminderHistory = await db.getAllAsync('SELECT * FROM reminder_history');
  const eInvoiceEnvelopes = await db.getAllAsync('SELECT * FROM e_invoice_envelopes');
  const einvoiceStatusEvents = await db.getAllAsync('SELECT * FROM einvoice_status_events');
  const auditLog = await db.getAllAsync('SELECT * FROM audit_log');
  const syncOutbox = await db.getAllAsync('SELECT * FROM sync_outbox');
  const deliveryNotes = await db.getAllAsync('SELECT * FROM delivery_notes');
  const deliveryNoteLines = await db.getAllAsync('SELECT * FROM delivery_note_lines');
  const fileMetadata = await db.getAllAsync('SELECT * FROM file_metadata');
  const documentSplits = await db.getAllAsync('SELECT * FROM document_splits');
  const splitLineAssignments = await db.getAllAsync('SELECT * FROM split_line_assignments');
  const allocationRuleSnapshots = await db.getAllAsync('SELECT * FROM allocation_rule_snapshots');
  const depositConfigs = await db.getAllAsync('SELECT * FROM deposit_configs');
  const depositInstallments = await db.getAllAsync('SELECT * FROM deposit_installments');
  const depositInvoices = await db.getAllAsync('SELECT * FROM deposit_invoices');
  const settings = await getAllSettings(db);
  
  // Get expenses from the active year's database explicitly
  // This ensures we export expenses even if they're in a year-specific database
  const activeYear = await getActiveYear();
  const yearDb = await initYearDatabase(activeYear);
  const expenses = await yearDb.getAllAsync('SELECT * FROM expenses');
  console.log('[DB-Settings] Fetched expenses from year database:', activeYear, 'count:', expenses.length);
  
  console.log('[DB-Settings] Export counts - clients:', clients.length, 'products:', products.length, 'documents:', documents.length, 'lineItems:', lineItems.length, 'expenses:', expenses.length, 'deliveryNotes:', deliveryNotes.length, 'deliveryNoteLines:', deliveryNoteLines.length, 'documentSplits:', documentSplits.length, 'fileMetadata:', fileMetadata.length, 'depositConfigs:', depositConfigs.length, 'depositInstallments:', depositInstallments.length, 'depositInvoices:', depositInvoices.length);
  
  const exportData = {
    version: 5,
    exportDate: new Date().toISOString(),
    activeYear,
    clients,
    products,
    documents,
    lineItems,
    expenses,
    reminderHistory,
    eInvoiceEnvelopes,
    einvoiceStatusEvents,
    auditLog,
    syncOutbox,
    deliveryNotes,
    deliveryNoteLines,
    fileMetadata,
    documentSplits,
    splitLineAssignments,
    allocationRuleSnapshots,
    depositConfigs,
    depositInstallments,
    depositInvoices,
    settings,
  };
  
  return JSON.stringify(exportData, null, 2);
}

export interface BackupData {
  version: number;
  exportDate: string;
  activeYear?: number;
  clients: Record<string, unknown>[];
  products: Record<string, unknown>[];
  documents: Record<string, unknown>[];
  lineItems: Record<string, unknown>[];
  expenses?: Record<string, unknown>[];
  reminderHistory?: Record<string, unknown>[];
  eInvoiceEnvelopes?: Record<string, unknown>[];
  einvoiceStatusEvents?: Record<string, unknown>[];
  auditLog?: Record<string, unknown>[];
  syncOutbox?: Record<string, unknown>[];
  deliveryNotes?: Record<string, unknown>[];
  deliveryNoteLines?: Record<string, unknown>[];
  fileMetadata?: Record<string, unknown>[];
  documentSplits?: Record<string, unknown>[];
  splitLineAssignments?: Record<string, unknown>[];
  allocationRuleSnapshots?: Record<string, unknown>[];
  depositConfigs?: Record<string, unknown>[];
  depositInstallments?: Record<string, unknown>[];
  depositInvoices?: Record<string, unknown>[];
  settings: Record<string, string>;
}

export async function importAllData(db: SQLite.SQLiteDatabase, jsonData: string): Promise<void> {
  console.log('[DB-Settings] Starting import...');
  
  let data: BackupData;
  try {
    data = JSON.parse(jsonData);
  } catch {
    throw new Error('Format de fichier invalide');
  }

  if (!data.version || !data.clients || !data.products || !data.documents || !data.lineItems || !data.settings) {
    throw new Error('Fichier de sauvegarde incomplet ou corrompu');
  }

  console.log('[DB-Settings] Clearing existing data...');
  await db.execAsync('DELETE FROM einvoice_status_events');
  await db.execAsync('DELETE FROM e_invoice_envelopes');
  await db.execAsync('DELETE FROM audit_log');
  await db.execAsync('DELETE FROM sync_outbox');
  await db.execAsync('DELETE FROM reminder_history');
  await db.execAsync('DELETE FROM delivery_note_lines');
  await db.execAsync('DELETE FROM delivery_notes');
  await db.execAsync('DELETE FROM deposit_invoices');
  await db.execAsync('DELETE FROM deposit_installments');
  await db.execAsync('DELETE FROM deposit_configs');
  await db.execAsync('DELETE FROM split_line_assignments');
  await db.execAsync('DELETE FROM allocation_rule_snapshots');
  await db.execAsync('DELETE FROM document_splits');
  await db.execAsync('DELETE FROM file_metadata');
  await db.execAsync('DELETE FROM line_items');
  await db.execAsync('DELETE FROM documents');
  await db.execAsync('DELETE FROM clients');
  await db.execAsync('DELETE FROM products');
  await db.execAsync("DELETE FROM settings WHERE key != 'db_version'");
  
  // Clear expenses from the active year's database
  const activeYear = await getActiveYear();
  const yearDb = await initYearDatabase(activeYear);
  await yearDb.execAsync('DELETE FROM expenses');
  console.log('[DB-Settings] Cleared expenses from year database:', activeYear);

  console.log('[DB-Settings] Importing clients:', data.clients.length);
  for (const client of data.clients) {
    const keys = Object.keys(client);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => client[k]);
    await db.runAsync(
      `INSERT INTO clients (${keys.join(', ')}) VALUES (${placeholders})`,
      values as (string | number | null)[]
    );
  }

  console.log('[DB-Settings] Importing products:', data.products.length);
  for (const product of data.products) {
    const keys = Object.keys(product);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => product[k]);
    await db.runAsync(
      `INSERT INTO products (${keys.join(', ')}) VALUES (${placeholders})`,
      values as (string | number | null)[]
    );
  }

  console.log('[DB-Settings] Importing documents:', data.documents.length);
  for (const doc of data.documents) {
    const keys = Object.keys(doc);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => doc[k]);
    await db.runAsync(
      `INSERT INTO documents (${keys.join(', ')}) VALUES (${placeholders})`,
      values as (string | number | null)[]
    );
  }

  console.log('[DB-Settings] Importing line items:', data.lineItems.length);
  for (const item of data.lineItems) {
    const keys = Object.keys(item);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => item[k]);
    await db.runAsync(
      `INSERT INTO line_items (${keys.join(', ')}) VALUES (${placeholders})`,
      values as (string | number | null)[]
    );
  }

  console.log('[DB-Settings] Importing settings...');
  for (const [key, value] of Object.entries(data.settings)) {
    if (key !== 'db_version') {
      await setSetting(db, key, value);
    }
  }

  if (data.expenses && data.expenses.length > 0) {
    console.log('[DB-Settings] Importing expenses:', data.expenses.length);
    // Import expenses into the year-specific database
    const importYear = data.activeYear || activeYear;
    const expenseYearDb = await initYearDatabase(importYear);
    for (const expense of data.expenses) {
      const keys = Object.keys(expense);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => expense[k]);
      await expenseYearDb.runAsync(
        `INSERT INTO expenses (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
    console.log('[DB-Settings] Imported expenses into year database:', importYear);
  } else {
    console.log('[DB-Settings] No expenses to import (old backup format)');
  }

  if (data.reminderHistory && data.reminderHistory.length > 0) {
    console.log('[DB-Settings] Importing reminder history:', data.reminderHistory.length);
    for (const reminder of data.reminderHistory) {
      const keys = Object.keys(reminder);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => reminder[k]);
      await db.runAsync(
        `INSERT INTO reminder_history (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.eInvoiceEnvelopes && data.eInvoiceEnvelopes.length > 0) {
    console.log('[DB-Settings] Importing e-invoice envelopes:', data.eInvoiceEnvelopes.length);
    for (const envelope of data.eInvoiceEnvelopes) {
      const keys = Object.keys(envelope);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => envelope[k]);
      await db.runAsync(
        `INSERT INTO e_invoice_envelopes (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.einvoiceStatusEvents && data.einvoiceStatusEvents.length > 0) {
    console.log('[DB-Settings] Importing e-invoice status events:', data.einvoiceStatusEvents.length);
    for (const event of data.einvoiceStatusEvents) {
      const keys = Object.keys(event);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => event[k]);
      await db.runAsync(
        `INSERT INTO einvoice_status_events (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.auditLog && data.auditLog.length > 0) {
    console.log('[DB-Settings] Importing audit log:', data.auditLog.length);
    for (const log of data.auditLog) {
      const keys = Object.keys(log);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => log[k]);
      await db.runAsync(
        `INSERT INTO audit_log (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.syncOutbox && data.syncOutbox.length > 0) {
    console.log('[DB-Settings] Importing sync outbox:', data.syncOutbox.length);
    for (const item of data.syncOutbox) {
      const keys = Object.keys(item);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => item[k]);
      await db.runAsync(
        `INSERT INTO sync_outbox (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.deliveryNotes && data.deliveryNotes.length > 0) {
    console.log('[DB-Settings] Importing delivery notes:', data.deliveryNotes.length);
    for (const note of data.deliveryNotes) {
      const keys = Object.keys(note);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => note[k]);
      await db.runAsync(
        `INSERT INTO delivery_notes (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.deliveryNoteLines && data.deliveryNoteLines.length > 0) {
    console.log('[DB-Settings] Importing delivery note lines:', data.deliveryNoteLines.length);
    for (const line of data.deliveryNoteLines) {
      const keys = Object.keys(line);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => line[k]);
      await db.runAsync(
        `INSERT INTO delivery_note_lines (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.fileMetadata && data.fileMetadata.length > 0) {
    console.log('[DB-Settings] Importing file metadata:', data.fileMetadata.length);
    for (const file of data.fileMetadata) {
      const keys = Object.keys(file);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => file[k]);
      await db.runAsync(
        `INSERT INTO file_metadata (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.documentSplits && data.documentSplits.length > 0) {
    console.log('[DB-Settings] Importing document splits:', data.documentSplits.length);
    for (const split of data.documentSplits) {
      const keys = Object.keys(split);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => split[k]);
      await db.runAsync(
        `INSERT INTO document_splits (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.splitLineAssignments && data.splitLineAssignments.length > 0) {
    console.log('[DB-Settings] Importing split line assignments:', data.splitLineAssignments.length);
    for (const assignment of data.splitLineAssignments) {
      const keys = Object.keys(assignment);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => assignment[k]);
      await db.runAsync(
        `INSERT INTO split_line_assignments (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.allocationRuleSnapshots && data.allocationRuleSnapshots.length > 0) {
    console.log('[DB-Settings] Importing allocation rule snapshots:', data.allocationRuleSnapshots.length);
    for (const snapshot of data.allocationRuleSnapshots) {
      const keys = Object.keys(snapshot);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => snapshot[k]);
      await db.runAsync(
        `INSERT INTO allocation_rule_snapshots (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.depositConfigs && data.depositConfigs.length > 0) {
    console.log('[DB-Settings] Importing deposit configs:', data.depositConfigs.length);
    for (const dc of data.depositConfigs) {
      const keys = Object.keys(dc);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => dc[k]);
      await db.runAsync(
        `INSERT INTO deposit_configs (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.depositInstallments && data.depositInstallments.length > 0) {
    console.log('[DB-Settings] Importing deposit installments:', data.depositInstallments.length);
    for (const inst of data.depositInstallments) {
      const keys = Object.keys(inst);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => inst[k]);
      await db.runAsync(
        `INSERT INTO deposit_installments (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  if (data.depositInvoices && data.depositInvoices.length > 0) {
    console.log('[DB-Settings] Importing deposit invoices:', data.depositInvoices.length);
    for (const di of data.depositInvoices) {
      const keys = Object.keys(di);
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map(k => di[k]);
      await db.runAsync(
        `INSERT INTO deposit_invoices (${keys.join(', ')}) VALUES (${placeholders})`,
        values as (string | number | null)[]
      );
    }
  }

  console.log('[DB-Settings] Import completed successfully');
}
