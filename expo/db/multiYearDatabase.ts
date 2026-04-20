import * as SQLite from 'expo-sqlite';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CREATE_TABLES_SQL, DEFAULT_SETTINGS } from './schema';
import { DatabaseYearConfig, YearArchiveInfo } from '@/types/archive';
import { getDirectorySize } from '@/utils/fileStorage';

const DB_PREFIX = 'niko_db_';
const ACTIVE_YEAR_KEY = 'active_db_year';
const YEAR_CONFIGS_KEY = 'db_year_configs';

let databases: Map<number, SQLite.SQLiteDatabase> = new Map();
let activeYear: number = new Date().getFullYear();
let currentActiveDb: SQLite.SQLiteDatabase | null = null;

export function getCurrentDatabase(): SQLite.SQLiteDatabase | null {
  return currentActiveDb;
}

export function setCurrentDatabase(db: SQLite.SQLiteDatabase | null): void {
  currentActiveDb = db;
}

export async function getActiveYear(): Promise<number> {
  try {
    const stored = await AsyncStorage.getItem(ACTIVE_YEAR_KEY);
    if (stored) {
      activeYear = parseInt(stored, 10);
    }
  } catch (error) {
    console.error('[MultiYearDB] Error getting active year:', error);
  }
  return activeYear;
}

export async function setActiveYear(year: number): Promise<void> {
  activeYear = year;
  await AsyncStorage.setItem(ACTIVE_YEAR_KEY, String(year));
  console.log('[MultiYearDB] Active year set to:', year);
}

export function getDbNameForYear(year: number): string {
  return `${DB_PREFIX}${year}.db`;
}

export async function getYearConfigs(): Promise<DatabaseYearConfig[]> {
  try {
    const stored = await AsyncStorage.getItem(YEAR_CONFIGS_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('[MultiYearDB] Error getting year configs:', error);
  }
  return [];
}

export async function saveYearConfigs(configs: DatabaseYearConfig[]): Promise<void> {
  await AsyncStorage.setItem(YEAR_CONFIGS_KEY, JSON.stringify(configs));
}

export async function addYearConfig(config: DatabaseYearConfig): Promise<void> {
  const configs = await getYearConfigs();
  const existingIndex = configs.findIndex(c => c.year === config.year);
  
  if (existingIndex >= 0) {
    configs[existingIndex] = config;
  } else {
    configs.push(config);
  }
  
  configs.sort((a, b) => b.year - a.year);
  await saveYearConfigs(configs);
}

export async function initYearDatabase(year: number): Promise<SQLite.SQLiteDatabase> {
  if (databases.has(year)) {
    console.log('[MultiYearDB] Returning cached database for year:', year);
    return databases.get(year)!;
  }
  
  if (Platform.OS === 'web') {
    console.log('[MultiYearDB] Web platform - using mock database');
    const mockDb = createWebMockDatabase(year);
    databases.set(year, mockDb);
    return mockDb;
  }
  
  const dbName = getDbNameForYear(year);
  console.log('[MultiYearDB] Initializing database:', dbName);
  
  try {
    const db = await SQLite.openDatabaseAsync(dbName);
    
    const cleanedSQL = CREATE_TABLES_SQL.replace(/--[^\n]*/g, '');
    const statements = cleanedSQL.split(';').map(s => s.trim()).filter(s => s.length > 2 && !s.match(/^\s*$/));
    for (const statement of statements) {
      try {
        await db.execAsync(statement + ';');
      } catch (error) {
        console.log('[MultiYearDB] Table may already exist:', error);
      }
    }
    
    const existingSettings = await db.getAllAsync('SELECT key FROM settings');
    if (existingSettings.length === 0) {
      for (const setting of DEFAULT_SETTINGS) {
        await db.runAsync(
          'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
          [setting.key, setting.value]
        );
      }
    }
    
    // Run migrations for existing databases
    await runYearDatabaseMigrations(db);
    
    await addYearConfig({
      year,
      dbName,
      isActive: true,
      isReadOnly: false,
      createdAt: new Date().toISOString(),
    });
    
    databases.set(year, db);
    console.log('[MultiYearDB] Database initialized for year:', year);
    
    return db;
  } catch (error) {
    console.error('[MultiYearDB] Error initializing database:', error);
    throw error;
  }
}

export async function getActiveDatabase(): Promise<SQLite.SQLiteDatabase> {
  const year = await getActiveYear();
  const db = await initYearDatabase(year);
  currentActiveDb = db;
  return db;
}

export async function getDatabaseForYear(year: number): Promise<SQLite.SQLiteDatabase | null> {
  const configs = await getYearConfigs();
  const config = configs.find(c => c.year === year);
  
  if (!config) {
    console.log('[MultiYearDB] No config found for year:', year);
    return null;
  }
  
  return initYearDatabase(year);
}

export async function closeDatabaseForYear(year: number): Promise<void> {
  const db = databases.get(year);
  if (db && Platform.OS !== 'web') {
    await db.closeAsync();
    databases.delete(year);
    console.log('[MultiYearDB] Database closed for year:', year);
  }
}

export async function closeAllDatabases(): Promise<void> {
  for (const [year, db] of databases) {
    if (Platform.OS !== 'web') {
      await db.closeAsync();
    }
    console.log('[MultiYearDB] Database closed for year:', year);
  }
  databases.clear();
}

export async function setDatabaseReadOnly(year: number): Promise<void> {
  const configs = await getYearConfigs();
  const config = configs.find(c => c.year === year);
  
  if (config) {
    config.isReadOnly = true;
    config.closedAt = new Date().toISOString();
    await saveYearConfigs(configs);
    console.log('[MultiYearDB] Database marked as read-only:', year);
  }
}

export async function isDatabaseReadOnly(year: number): Promise<boolean> {
  const configs = await getYearConfigs();
  const config = configs.find(c => c.year === year);
  return config?.isReadOnly || false;
}

export async function getAvailableYears(): Promise<number[]> {
  const configs = await getYearConfigs();
  const years = configs.map(c => c.year);
  
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) {
    years.unshift(currentYear);
  }
  
  return years.sort((a, b) => b - a);
}

export async function getYearArchiveInfo(year: number): Promise<YearArchiveInfo> {
  const configs = await getYearConfigs();
  const config = configs.find(c => c.year === year);
  
  const baseDir = FileSystemLegacy.documentDirectory || '';
  const dbPath = `${baseDir}SQLite/${getDbNameForYear(year)}`;
  const attachmentsPath = `${baseDir}attachments/${year}`;
  const vaultPath = `${baseDir}archives/Archive_${year}.vault`;
  
  let status: YearArchiveInfo['status'] = 'not_present';
  let documentsCount = 0;
  let expensesCount = 0;
  let clientsCount = 0;
  let productsCount = 0;
  let totalSize = 0;
  
  if (config) {
    if (config.isReadOnly) {
      const vaultExists = Platform.OS !== 'web' 
        ? (await FileSystemLegacy.getInfoAsync(vaultPath)).exists 
        : false;
      status = vaultExists ? 'archived' : 'readonly';
    } else {
      status = 'active';
    }
    
    try {
      const db = await getDatabaseForYear(year);
      if (db) {
        const docs = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM documents');
        const expenses = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expenses');
        const clients = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM clients');
        const products = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM products');
        
        documentsCount = docs?.count || 0;
        expensesCount = expenses?.count || 0;
        clientsCount = clients?.count || 0;
        productsCount = products?.count || 0;
      }
    } catch (error) {
      console.error('[MultiYearDB] Error getting counts:', error);
    }
    
    if (Platform.OS !== 'web') {
      const dbInfo = await FileSystemLegacy.getInfoAsync(dbPath);
      totalSize = (dbInfo as { size?: number }).size || 0;
      totalSize += await getDirectorySize(attachmentsPath);
    }
  }
  
  return {
    year,
    status,
    dbPath: config ? dbPath : undefined,
    attachmentsPath: config ? attachmentsPath : undefined,
    vaultPath: status === 'archived' ? vaultPath : undefined,
    documentsCount,
    expensesCount,
    clientsCount,
    productsCount,
    totalSize,
    lastModified: config?.closedAt || config?.createdAt,
    archivedAt: status === 'archived' ? config?.closedAt : undefined,
  };
}

export async function vacuumDatabase(year: number): Promise<void> {
  if (Platform.OS === 'web') return;
  
  const db = await getDatabaseForYear(year);
  if (db) {
    console.log('[MultiYearDB] Running VACUUM on database:', year);
    await db.execAsync('VACUUM');
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    console.log('[MultiYearDB] VACUUM completed for year:', year);
  }
}

export async function prepareYearDatabaseForArchive(year: number): Promise<boolean> {
  if (Platform.OS === 'web') {
    console.log('[MultiYearDB] Web platform - skipping year preparation');
    return false;
  }

  const dbName = getDbNameForYear(year);
  const baseDir = FileSystemLegacy.documentDirectory || '';
  const dbPath = `${baseDir}SQLite/${dbName}`;
  
  const dbInfo = await FileSystemLegacy.getInfoAsync(dbPath);
  if (dbInfo.exists) {
    console.log('[MultiYearDB] Database already exists for year:', year);
    return true;
  }
  
  console.log('[MultiYearDB] Database not found for year:', year, '- checking for data to migrate');
  
  const currentYear = await getActiveYear();
  const currentDb = await initYearDatabase(currentYear);
  
  const expensesForYear = await currentDb.getAllAsync<{ id: number }>(
    `SELECT id FROM expenses WHERE strftime('%Y', date) = ?`,
    [String(year)]
  );
  
  const documentsForYear = await currentDb.getAllAsync<{ id: number }>(
    `SELECT id FROM documents WHERE strftime('%Y', date) = ?`,
    [String(year)]
  );
  
  const deliveryNotesForYear = await currentDb.getAllAsync<{ id: number }>(
    `SELECT id FROM delivery_notes WHERE strftime('%Y', created_at) = ?`,
    [String(year)]
  );
  
  const totalRecords = expensesForYear.length + documentsForYear.length + deliveryNotesForYear.length;
  
  if (totalRecords === 0) {
    console.log('[MultiYearDB] No data found for year:', year);
    return false;
  }
  
  console.log('[MultiYearDB] Found', totalRecords, 'records for year:', year, '- creating year database');
  
  const yearDb = await initYearDatabase(year);
  
  const clients = await currentDb.getAllAsync('SELECT * FROM clients');
  for (const client of clients) {
    const c = client as Record<string, SQLite.SQLiteBindValue>;
    await yearDb.runAsync(
      `INSERT OR REPLACE INTO clients (id, name, company, siret, tva_number, email, phone, address, city, postal_code, country, delivery_address, delivery_city, delivery_postal_code, delivery_country, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.name, c.company, c.siret, c.tva_number, c.email, c.phone, c.address, c.city, c.postal_code, c.country, c.delivery_address, c.delivery_city, c.delivery_postal_code, c.delivery_country, c.notes, c.created_at, c.updated_at]
    );
  }
  
  const products = await currentDb.getAllAsync('SELECT * FROM products');
  for (const product of products) {
    const p = product as Record<string, SQLite.SQLiteBindValue>;
    await yearDb.runAsync(
      `INSERT OR REPLACE INTO products (id, name, description, unit_price, unit, tva_rate, is_service, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.name, p.description, p.unit_price, p.unit, p.tva_rate, p.is_service, p.created_at, p.updated_at]
    );
  }
  
  const settings = await currentDb.getAllAsync('SELECT * FROM settings');
  for (const setting of settings) {
    const s = setting as Record<string, SQLite.SQLiteBindValue>;
    await yearDb.runAsync(
      `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
      [s.key, s.value, s.updated_at]
    );
  }
  
  if (expensesForYear.length > 0) {
    const expenseIds = expensesForYear.map(e => e.id).join(',');
    const expenses = await currentDb.getAllAsync(`SELECT * FROM expenses WHERE id IN (${expenseIds})`);
    for (const expense of expenses) {
      const e = expense as Record<string, SQLite.SQLiteBindValue>;
      await yearDb.runAsync(
        `INSERT OR REPLACE INTO expenses (id, establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents, tva_rate, date, category, photo_uri, ocr_text, notes, is_recurring, recurring_start_date, recurring_end_date, recurring_day, recurring_parent_id, is_archived, photo_hash, thumbnail_path, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [e.id, e.establishment, e.amount_ttc, e.amount_tva, e.amount_ttc_cents, e.amount_tva_cents, e.tva_rate, e.date, e.category, e.photo_uri, e.ocr_text, e.notes, e.is_recurring, e.recurring_start_date, e.recurring_end_date, e.recurring_day, e.recurring_parent_id, e.is_archived, e.photo_hash, e.thumbnail_path, e.created_at, e.updated_at]
      );
    }
  }
  
  if (documentsForYear.length > 0) {
    const documentIds = documentsForYear.map(d => d.id).join(',');
    const documents = await currentDb.getAllAsync(`SELECT * FROM documents WHERE id IN (${documentIds})`);
    for (const document of documents) {
      const d = document as Record<string, SQLite.SQLiteBindValue>;
      await yearDb.runAsync(
        `INSERT OR REPLACE INTO documents (id, type, number, client_id, status, date, due_date, sent_at, paid_at, payment_method, total_ht, total_tva, total_ttc, global_discount_type, global_discount_value, auto_liquidation, notes, conditions, legal_mentions, source_devis_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [d.id, d.type, d.number, d.client_id, d.status, d.date, d.due_date, d.sent_at, d.paid_at, d.payment_method, d.total_ht, d.total_tva, d.total_ttc, d.global_discount_type, d.global_discount_value, d.auto_liquidation, d.notes, d.conditions, d.legal_mentions, d.source_devis_id, d.created_at, d.updated_at]
      );
    }
    
    const lineItems = await currentDb.getAllAsync(`SELECT * FROM line_items WHERE document_id IN (${documentIds})`);
    for (const item of lineItems) {
      const l = item as Record<string, SQLite.SQLiteBindValue>;
      await yearDb.runAsync(
        `INSERT OR REPLACE INTO line_items (id, document_id, product_id, label, description, quantity, unit_price, tva_rate, discount_type, discount_value, total_ht, image_url, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [l.id, l.document_id, l.product_id, l.label, l.description, l.quantity, l.unit_price, l.tva_rate, l.discount_type, l.discount_value, l.total_ht, l.image_url, l.created_at]
      );
    }
  }
  
  if (deliveryNotesForYear.length > 0) {
    const noteIds = deliveryNotesForYear.map(n => `'${n.id}'`).join(',');
    const notes = await currentDb.getAllAsync(`SELECT * FROM delivery_notes WHERE id IN (${noteIds})`);
    for (const note of notes) {
      const n = note as Record<string, SQLite.SQLiteBindValue>;
      await yearDb.runAsync(
        `INSERT OR REPLACE INTO delivery_notes (id, number, status, created_at, sent_at, invoice_id, total_weight_kg, ship_to_name, ship_to_address, ship_to_phone, ship_from_name, ship_from_address, ship_from_phone, label_pdf_path, invoice_pdf_path, bundle_pdf_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [n.id, n.number, n.status, n.created_at, n.sent_at, n.invoice_id, n.total_weight_kg, n.ship_to_name, n.ship_to_address, n.ship_to_phone, n.ship_from_name, n.ship_from_address, n.ship_from_phone, n.label_pdf_path, n.invoice_pdf_path, n.bundle_pdf_path]
      );
    }
    
    const noteLines = await currentDb.getAllAsync(`SELECT * FROM delivery_note_lines WHERE delivery_note_id IN (${noteIds})`);
    for (const line of noteLines) {
      const l = line as Record<string, SQLite.SQLiteBindValue>;
      await yearDb.runAsync(
        `INSERT OR REPLACE INTO delivery_note_lines (id, delivery_note_id, product_id, label, qty, unit, unit_weight_kg, line_weight_kg)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [l.id, l.delivery_note_id, l.product_id, l.label, l.qty, l.unit, l.unit_weight_kg, l.line_weight_kg]
      );
    }
  }
  
  console.log('[MultiYearDB] Year database prepared for archiving:', year);
  return true;
}

export async function deleteYearDatabase(year: number): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[MultiYearDB] Web platform - skipping database deletion');
    return;
  }
  
  await closeDatabaseForYear(year);
  
  const dbName = getDbNameForYear(year);
  const baseDir = FileSystemLegacy.documentDirectory || '';
  const dbPath = `${baseDir}SQLite/${dbName}`;
  const walPath = `${dbPath}-wal`;
  const shmPath = `${dbPath}-shm`;
  const attachmentsPath = `${baseDir}attachments/${year}`;
  const thumbnailsPath = `${baseDir}thumbnails/${year}`;
  
  const pathsToDelete = [dbPath, walPath, shmPath, attachmentsPath, thumbnailsPath];
  
  for (const path of pathsToDelete) {
    try {
      const info = await FileSystemLegacy.getInfoAsync(path);
      if (info.exists) {
        await FileSystemLegacy.deleteAsync(path, { idempotent: true });
        console.log('[MultiYearDB] Deleted:', path);
      }
    } catch (error) {
      console.error('[MultiYearDB] Error deleting:', path, error);
    }
  }
  
  const configs = await getYearConfigs();
  const filtered = configs.filter(c => c.year !== year);
  await saveYearConfigs(filtered);
  
  await deleteYearDataFromCurrentDatabase(year);
  
  console.log('[MultiYearDB] Year database deleted:', year);
}

export async function deleteYearDataFromCurrentDatabase(year: number): Promise<void> {
  // With the new architecture, expenses are stored in their own year databases.
  // This function is kept for backwards compatibility but only cleans up
  // any legacy data that might still be in other databases.
  if (Platform.OS === 'web') {
    console.log('[MultiYearDB] Web platform - skipping data deletion from current database');
    return;
  }
  
  const currentYear = await getActiveYear();
  if (year === currentYear) {
    console.log('[MultiYearDB] Cannot delete current year data from current database');
    return;
  }
  
  console.log('[MultiYearDB] Year', year, 'data is stored in its own database - no cleanup needed from current database');
  console.log('[MultiYearDB] Year data deletion completed for year:', year);
}

function createWebMockDatabase(year: number): SQLite.SQLiteDatabase {
  const storageKey = `niko_db_mock_${year}`;
  const mockData: Record<string, unknown[]> = {
    clients: [],
    products: [],
    documents: [],
    line_items: [],
    settings: DEFAULT_SETTINGS.map(s => ({ ...s, updated_at: new Date().toISOString() })),
    reminder_history: [],
    expenses: [],
    delivery_notes: [],
    delivery_note_lines: [],
    e_invoice_envelopes: [],
    einvoice_status_events: [],
    audit_log: [],
    sync_outbox: [],
  };

  try {
    const persisted = localStorage.getItem(storageKey);
    if (persisted) {
      Object.assign(mockData, JSON.parse(persisted));
    }
  } catch {
    console.log('[MultiYearDB-Web] No persisted data found for year:', year);
  }

  const persistData = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(mockData));
    } catch (e) {
      console.error('[MultiYearDB-Web] Failed to persist data:', e);
    }
  };

  return {
    getAllAsync: async (query: string, params?: unknown[]) => {
      const table = extractTableName(query);
      return mockData[table] || [];
    },
    getFirstAsync: async (query: string, params?: unknown[]) => {
      const table = extractTableName(query);
      const data = mockData[table] || [];
      
      if (table === 'settings' && params && params.length > 0) {
        return data.find((item: any) => item.key === params[0]) || null;
      }
      
      return data[0] || null;
    },
    runAsync: async (query: string, params?: unknown[]) => {
      const upperQuery = query.toUpperCase();
      
      if (upperQuery.includes('INSERT')) {
        const table = extractInsertTable(query);
        if (table && mockData[table]) {
          const newId = mockData[table].length + 1;
          mockData[table].push({ id: newId });
          persistData();
          return { changes: 1, lastInsertRowId: newId };
        }
      }
      
      if (upperQuery.includes('UPDATE') || upperQuery.includes('DELETE')) {
        persistData();
        return { changes: 1, lastInsertRowId: 0 };
      }
      
      return { changes: 0, lastInsertRowId: 1 };
    },
    execAsync: async () => {},
    closeAsync: async () => {},
  } as unknown as SQLite.SQLiteDatabase;
}

async function runYearDatabaseMigrations(db: SQLite.SQLiteDatabase): Promise<void> {
  console.log('[MultiYearDB] Running migrations...');
  
  // Migration: Add image_url column to line_items if it doesn't exist
  try {
    await db.execAsync('ALTER TABLE line_items ADD COLUMN image_url TEXT');
    console.log('[MultiYearDB] Added image_url column to line_items');
  } catch {
    // Column already exists
  }
  
  // Migration: Add is_split_enabled column to documents if it doesn't exist
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN is_split_enabled INTEGER DEFAULT 0');
    console.log('[MultiYearDB] Added is_split_enabled column to documents');
  } catch {
    // Column already exists
  }

  // Migration: Add is_test column to all relevant tables
  const isTestTables = ['documents', 'expenses', 'delivery_notes', 'clients', 'products'];
  for (const table of isTestTables) {
    try {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN is_test INTEGER DEFAULT 0`);
      console.log(`[MultiYearDB] Added is_test column to ${table}`);
    } catch {
      // Column already exists
    }
  }

  // Migration: Add dossier and objet columns to documents
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN dossier TEXT');
    console.log('[MultiYearDB] Added dossier column to documents');
  } catch {
    // Column already exists
  }
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN objet TEXT');
    console.log('[MultiYearDB] Added objet column to documents');
  } catch {
    // Column already exists
  }

  // Migration: Add credit note columns
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN original_invoice_id INTEGER');
    console.log('[MultiYearDB] Added original_invoice_id column to documents');
  } catch {
    // Column already exists
  }
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN credit_note_reason TEXT');
    console.log('[MultiYearDB] Added credit_note_reason column to documents');
  } catch {
    // Column already exists
  }

  // Migration: Add e-invoicing columns to documents
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN is_einvoice INTEGER DEFAULT 0');
    console.log('[MultiYearDB] Added is_einvoice column to documents');
  } catch {
    // Column already exists
  }
  try {
    await db.execAsync('ALTER TABLE documents ADD COLUMN einvoice_status TEXT');
    console.log('[MultiYearDB] Added einvoice_status column to documents');
  } catch {
    // Column already exists
  }

  console.log('[MultiYearDB] Migrations completed');
}

function extractTableName(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match ? match[1] : '';
}

function extractInsertTable(query: string): string {
  const match = query.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i);
  return match ? match[1] : '';
}
