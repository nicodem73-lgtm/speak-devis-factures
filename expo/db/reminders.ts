import * as SQLite from 'expo-sqlite';
import { 
  ReminderConfig, 
  ReminderTemplate, 
  ReminderHistory, 
  OverdueInvoice,
  DEFAULT_REMINDER_TEMPLATES,
} from '@/types/reminder';
import { getAllSettings, setSetting } from './settings';

interface ReminderHistoryRow {
  id: number;
  document_id: number;
  level: number;
  sent_at: string;
  recipient_email: string | null;
  subject: string | null;
  created_at: string;
}

interface OverdueInvoiceRow {
  id: number;
  number: string;
  client_id: number;
  client_name: string;
  client_email: string | null;
  due_date: string;
  total_ttc: number;
  days_overdue: number;
  last_reminder_level: number | null;
  last_reminder_date: string | null;
}

export async function getReminderConfig(db: SQLite.SQLiteDatabase): Promise<ReminderConfig> {
  console.log('[DB-Reminders] Getting reminder config');
  const settings = await getAllSettings(db);
  
  return {
    enabled: settings.reminders_enabled !== 'false',
    reminder1Days: parseInt(settings.reminder1_days || '3', 10),
    reminder2Days: parseInt(settings.reminder2_days || '10', 10),
    reminder3Days: parseInt(settings.reminder3_days || '21', 10),
    reminder1Enabled: settings.reminder1_enabled !== 'false',
    reminder2Enabled: settings.reminder2_enabled !== 'false',
    reminder3Enabled: settings.reminder3_enabled !== 'false',
    defaultPaymentDays: parseInt(settings.default_payment_days || '30', 10),
  };
}

export async function saveReminderConfig(db: SQLite.SQLiteDatabase, config: ReminderConfig): Promise<void> {
  console.log('[DB-Reminders] Saving reminder config');
  await setSetting(db, 'reminders_enabled', config.enabled.toString());
  await setSetting(db, 'reminder1_days', config.reminder1Days.toString());
  await setSetting(db, 'reminder2_days', config.reminder2Days.toString());
  await setSetting(db, 'reminder3_days', config.reminder3Days.toString());
  await setSetting(db, 'reminder1_enabled', config.reminder1Enabled.toString());
  await setSetting(db, 'reminder2_enabled', config.reminder2Enabled.toString());
  await setSetting(db, 'reminder3_enabled', config.reminder3Enabled.toString());
  await setSetting(db, 'default_payment_days', config.defaultPaymentDays.toString());
}

export async function getReminderTemplates(db: SQLite.SQLiteDatabase): Promise<ReminderTemplate[]> {
  console.log('[DB-Reminders] Getting reminder templates');
  const settings = await getAllSettings(db);
  const templatesJson = settings.reminder_templates;
  
  if (templatesJson) {
    try {
      return JSON.parse(templatesJson);
    } catch (e) {
      console.error('[DB-Reminders] Error parsing templates:', e);
    }
  }
  
  return DEFAULT_REMINDER_TEMPLATES;
}

export async function saveReminderTemplates(db: SQLite.SQLiteDatabase, templates: ReminderTemplate[]): Promise<void> {
  console.log('[DB-Reminders] Saving reminder templates');
  await setSetting(db, 'reminder_templates', JSON.stringify(templates));
}

export async function getReminderHistoryByDocumentId(
  db: SQLite.SQLiteDatabase, 
  documentId: number
): Promise<ReminderHistory[]> {
  console.log('[DB-Reminders] Getting reminder history for document:', documentId);
  
  const results = await db.getAllAsync<ReminderHistoryRow>(
    `SELECT * FROM reminder_history WHERE document_id = ? ORDER BY sent_at DESC`,
    [documentId]
  );
  
  return results.map(row => ({
    id: row.id,
    document_id: row.document_id,
    level: row.level,
    sent_at: row.sent_at,
    recipient_email: row.recipient_email || '',
    subject: row.subject || '',
    created_at: row.created_at,
  }));
}

export async function addReminderHistory(
  db: SQLite.SQLiteDatabase,
  documentId: number,
  level: number,
  recipientEmail: string,
  subject: string
): Promise<number> {
  console.log('[DB-Reminders] Adding reminder history:', { documentId, level });
  
  const result = await db.runAsync(
    `INSERT INTO reminder_history (document_id, level, sent_at, recipient_email, subject) 
     VALUES (?, ?, datetime('now'), ?, ?)`,
    [documentId, level, recipientEmail, subject]
  );
  
  return result.lastInsertRowId;
}

export async function getOverdueInvoices(db: SQLite.SQLiteDatabase): Promise<OverdueInvoice[]> {
  console.log('[DB-Reminders] Getting overdue invoices');
  
  const results = await db.getAllAsync<OverdueInvoiceRow>(`
    SELECT 
      d.id,
      d.number,
      d.client_id,
      c.name as client_name,
      c.email as client_email,
      d.due_date,
      d.total_ttc,
      CAST(julianday('now') - julianday(d.due_date) AS INTEGER) as days_overdue,
      (SELECT MAX(rh.level) FROM reminder_history rh WHERE rh.document_id = d.id) as last_reminder_level,
      (SELECT MAX(rh.sent_at) FROM reminder_history rh WHERE rh.document_id = d.id) as last_reminder_date
    FROM documents d
    JOIN clients c ON d.client_id = c.id
    WHERE d.type = 'facture'
      AND d.status NOT IN ('paid', 'cancelled')
      AND d.due_date IS NOT NULL
      AND date(d.due_date) < date('now')
    ORDER BY d.due_date ASC
  `);
  
  return results.map(row => ({
    id: row.id,
    number: row.number,
    client_id: row.client_id,
    client_name: row.client_name,
    client_email: row.client_email || undefined,
    due_date: row.due_date,
    total_ttc: row.total_ttc,
    days_overdue: row.days_overdue,
    last_reminder_level: row.last_reminder_level || 0,
    last_reminder_date: row.last_reminder_date || undefined,
  }));
}

export async function getInvoicesNeedingReminder(
  db: SQLite.SQLiteDatabase,
  config: ReminderConfig
): Promise<{ invoice: OverdueInvoice; suggestedLevel: number }[]> {
  console.log('[DB-Reminders] Getting invoices needing reminder');
  
  if (!config.enabled) {
    return [];
  }
  
  const overdueInvoices = await getOverdueInvoices(db);
  const result: { invoice: OverdueInvoice; suggestedLevel: number }[] = [];
  
  for (const invoice of overdueInvoices) {
    let suggestedLevel = 0;
    
    if (config.reminder3Enabled && invoice.days_overdue >= config.reminder3Days && invoice.last_reminder_level < 3) {
      suggestedLevel = 3;
    } else if (config.reminder2Enabled && invoice.days_overdue >= config.reminder2Days && invoice.last_reminder_level < 2) {
      suggestedLevel = 2;
    } else if (config.reminder1Enabled && invoice.days_overdue >= config.reminder1Days && invoice.last_reminder_level < 1) {
      suggestedLevel = 1;
    }
    
    if (suggestedLevel > 0) {
      result.push({ invoice, suggestedLevel });
    }
  }
  
  return result;
}

export async function getLastReminderLevel(db: SQLite.SQLiteDatabase, documentId: number): Promise<number> {
  console.log('[DB-Reminders] Getting last reminder level for document:', documentId);
  
  const result = await db.getFirstAsync<{ max_level: number | null }>(
    `SELECT MAX(level) as max_level FROM reminder_history WHERE document_id = ?`,
    [documentId]
  );
  
  return result?.max_level || 0;
}

export async function deleteReminderHistoryByDocumentId(
  db: SQLite.SQLiteDatabase, 
  documentId: number
): Promise<void> {
  console.log('[DB-Reminders] Deleting reminder history for document:', documentId);
  await db.runAsync('DELETE FROM reminder_history WHERE document_id = ?', [documentId]);
}
