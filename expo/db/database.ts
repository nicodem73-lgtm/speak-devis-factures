import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { DB_NAME, DB_VERSION, CREATE_TABLES_SQL, DEFAULT_SETTINGS } from './schema';
import { getCurrentDatabase } from './multiYearDatabase';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) {
    console.log('[DB] Database already initialized');
    return db;
  }

  console.log('[DB] Initializing database...');
  
  if (Platform.OS === 'web') {
    console.log('[DB] Web platform detected - using mock database');
    return createWebMockDatabase();
  }

  try {
    db = await SQLite.openDatabaseAsync(DB_NAME);
    console.log('[DB] Database opened successfully');

    await runMigrations(db);
    console.log('[DB] Migrations completed');

    return db;
  } catch (error) {
    console.error('[DB] Error initializing database:', error);
    throw error;
  }
}

async function runMigrations(database: SQLite.SQLiteDatabase): Promise<void> {
  console.log('[DB] Running migrations...');

  const cleanedSQL = CREATE_TABLES_SQL.replace(/--[^\n]*/g, '');
  const statements = cleanedSQL.split(';').map(s => s.trim()).filter(s => s.length > 0 && !s.match(/^\s*$/));
  
  for (const statement of statements) {
    if (statement.length > 2) {
      try {
        await database.execAsync(statement + ';');
      } catch (error) {
        console.error('[DB] Migration error for statement:', statement.substring(0, 80), error);
      }
    }
  }

  const versionResult = await database.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    ['db_version']
  );
  const currentVersion = versionResult ? parseInt(versionResult.value, 10) : 1;
  console.log('[DB] Current version:', currentVersion, '-> Target:', DB_VERSION);

  if (currentVersion < 2) {
    console.log('[DB] Migrating to version 2...');
    const alterStatements = [
      'ALTER TABLE documents ADD COLUMN sent_at TEXT',
      'ALTER TABLE documents ADD COLUMN paid_at TEXT',
      'ALTER TABLE documents ADD COLUMN payment_method TEXT',
    ];
    for (const stmt of alterStatements) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt);
      } catch {
        console.log('[DB] Column may already exist:', stmt);
      }
    }
  }

  if (currentVersion < 4) {
    console.log('[DB] Migrating to version 4...');
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN source_devis_id INTEGER');
      console.log('[DB] Added source_devis_id column');
    } catch {
      console.log('[DB] Column source_devis_id may already exist');
    }
  }

  if (currentVersion < 6) {
    console.log('[DB] Migrating to version 6...');
    const alterStatements = [
      'ALTER TABLE expenses ADD COLUMN amount_ttc_cents INTEGER DEFAULT 0',
      'ALTER TABLE expenses ADD COLUMN amount_tva_cents INTEGER DEFAULT 0',
      'ALTER TABLE expenses ADD COLUMN ocr_text TEXT',
    ];
    for (const stmt of alterStatements) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt);
      } catch {
        console.log('[DB] Column may already exist:', stmt);
      }
    }
    // Update existing records to have cents values
    try {
      await database.execAsync('UPDATE expenses SET amount_ttc_cents = CAST(amount_ttc * 100 AS INTEGER), amount_tva_cents = CAST(amount_tva * 100 AS INTEGER) WHERE amount_ttc_cents = 0');
      console.log('[DB] Updated existing expenses with cents values');
    } catch (e) {
      console.log('[DB] Error updating cents values:', e);
    }
  }

  if (currentVersion < 7) {
    console.log('[DB] Migrating to version 7...');
    const alterStatements = [
      'ALTER TABLE expenses ADD COLUMN is_recurring INTEGER DEFAULT 0',
      'ALTER TABLE expenses ADD COLUMN recurring_start_date TEXT',
      'ALTER TABLE expenses ADD COLUMN recurring_end_date TEXT',
      'ALTER TABLE expenses ADD COLUMN recurring_day INTEGER',
      'ALTER TABLE expenses ADD COLUMN recurring_parent_id INTEGER',
    ];
    for (const stmt of alterStatements) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt);
      } catch {
        console.log('[DB] Column may already exist:', stmt);
      }
    }
  }

  if (currentVersion < 8) {
    console.log('[DB] Migrating to version 8...');
    try {
      await database.execAsync('ALTER TABLE expenses ADD COLUMN is_archived INTEGER DEFAULT 0');
      console.log('[DB] Added is_archived column');
    } catch {
      console.log('[DB] Column is_archived may already exist');
    }
  }

  if (currentVersion < 9) {
    console.log('[DB] Migrating to version 9 - Adding e-invoicing tables...');
    
    const eInvoiceTables = [
      `CREATE TABLE IF NOT EXISTS e_invoice_envelopes (
        id TEXT PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        format TEXT NOT NULL DEFAULT 'facturx',
        direction TEXT NOT NULL DEFAULT 'outbound',
        status TEXT NOT NULL DEFAULT 'draft',
        file_path TEXT,
        xml_content TEXT,
        checksum TEXT,
        pdp_reference TEXT,
        error_message TEXT,
        submitted_at TEXT,
        delivered_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (invoice_id) REFERENCES documents(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        user_id TEXT,
        user_name TEXT,
        metadata TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS sync_outbox (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        last_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`,
      'CREATE INDEX IF NOT EXISTS idx_e_invoice_envelopes_invoice ON e_invoice_envelopes(invoice_id)',
      'CREATE INDEX IF NOT EXISTS idx_e_invoice_envelopes_status ON e_invoice_envelopes(status)',
      'CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id)',
      'CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status)',
    ];
    
    for (const stmt of eInvoiceTables) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt.substring(0, 50) + '...');
      } catch (e) {
        console.log('[DB] Table/index may already exist:', e);
      }
    }
    
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN is_einvoice INTEGER DEFAULT 0');
      console.log('[DB] Added is_einvoice column to documents');
    } catch {
      console.log('[DB] Column is_einvoice may already exist');
    }
    
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN einvoice_status TEXT');
      console.log('[DB] Added einvoice_status column to documents');
    } catch {
      console.log('[DB] Column einvoice_status may already exist');
    }
    
    try {
      await database.execAsync('ALTER TABLE clients ADD COLUMN siren TEXT');
      console.log('[DB] Added siren column to clients');
    } catch {
      console.log('[DB] Column siren may already exist');
    }
    
    try {
      await database.execAsync('ALTER TABLE clients ADD COLUMN siret TEXT');
      console.log('[DB] Added siret column to clients');
    } catch {
      console.log('[DB] Column siret may already exist');
    }
    
    const newSettings = [
      ['einvoice_enabled', 'false'],
      ['einvoice_default_format', 'facturx'],
      ['einvoice_auto_submit', 'false'],
      ['einvoice_pdp_provider', ''],
      ['einvoice_pdp_endpoint', ''],
      ['company_siren', ''],
    ];
    
    for (const [key, value] of newSettings) {
      try {
        await database.runAsync(
          'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
          [key, value]
        );
      } catch {
        console.log('[DB] Setting may already exist:', key);
      }
    }
    
    console.log('[DB] E-invoicing migration completed');
  }

  if (currentVersion < 10) {
    console.log('[DB] Migrating to version 10 - Enhanced e-invoicing PDP-ready...');
    
    // Add einvoice_status_events table
    try {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS einvoice_status_events (
          id TEXT PRIMARY KEY,
          envelope_id TEXT NOT NULL,
          status TEXT NOT NULL,
          message TEXT,
          payload_json TEXT,
          occurred_at TEXT NOT NULL,
          FOREIGN KEY (envelope_id) REFERENCES e_invoice_envelopes(id) ON DELETE CASCADE
        )
      `);
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_einvoice_status_events_envelope ON einvoice_status_events(envelope_id)');
      console.log('[DB] Created einvoice_status_events table');
    } catch (e) {
      console.log('[DB] einvoice_status_events table may already exist:', e);
    }
    
    // Add missing columns to documents for e-invoicing
    const documentColumns = [
      'ALTER TABLE documents ADD COLUMN issued_at TEXT',
      'ALTER TABLE documents ADD COLUMN submitted_at TEXT',
      'ALTER TABLE documents ADD COLUMN pdp_provider TEXT',
      'ALTER TABLE documents ADD COLUMN pdp_message_id TEXT',
      'ALTER TABLE documents ADD COLUMN einvoice_format TEXT',
      'ALTER TABLE documents ADD COLUMN einvoice_file_path TEXT',
      'ALTER TABLE documents ADD COLUMN einvoice_checksum TEXT',
      'ALTER TABLE documents ADD COLUMN locked INTEGER DEFAULT 0',
    ];
    
    for (const stmt of documentColumns) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt);
      } catch {
        console.log('[DB] Column may already exist:', stmt);
      }
    }
    
    // Add missing columns to e_invoice_envelopes
    const envelopeColumns = [
      'ALTER TABLE e_invoice_envelopes ADD COLUMN provider TEXT DEFAULT "local"',
      'ALTER TABLE e_invoice_envelopes ADD COLUMN provider_message_id TEXT',
    ];
    
    for (const stmt of envelopeColumns) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt);
      } catch {
        console.log('[DB] Column may already exist:', stmt);
      }
    }
    
    // Add new settings
    const newSettings = [
      ['einvoice_pdp_api_key', ''],
      ['einvoice_pdp_config_json', '{}'],
      ['einvoice_email_notify_enabled', 'true'],
    ];
    
    for (const [key, value] of newSettings) {
      try {
        await database.runAsync(
          'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
          [key, value]
        );
      } catch {
        console.log('[DB] Setting may already exist:', key);
      }
    }
    
    // Update default pdp_provider to 'mock'
    try {
      await database.runAsync(
        'UPDATE settings SET value = ? WHERE key = ? AND (value = "" OR value IS NULL)',
        ['mock', 'einvoice_pdp_provider']
      );
    } catch {
      console.log('[DB] Could not update pdp_provider default');
    }
    
    console.log('[DB] Version 10 migration completed - PDP-ready');
  }

  if (currentVersion < 11) {
    console.log('[DB] Migrating to version 11 - Delivery notes...');
    
    // Add unit_weight_kg to products
    try {
      await database.execAsync('ALTER TABLE products ADD COLUMN unit_weight_kg REAL');
      console.log('[DB] Added unit_weight_kg column to products');
    } catch {
      console.log('[DB] Column unit_weight_kg may already exist');
    }
    
    // Create delivery_notes table
    try {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS delivery_notes (
          id TEXT PRIMARY KEY,
          number TEXT NOT NULL,
          status TEXT DEFAULT 'Brouillon' CHECK(status IN ('Brouillon', 'Envoyé')),
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          sent_at TEXT,
          invoice_id INTEGER NOT NULL,
          total_weight_kg REAL DEFAULT 0,
          ship_to_name TEXT NOT NULL,
          ship_to_address TEXT NOT NULL,
          ship_to_phone TEXT,
          ship_from_name TEXT NOT NULL,
          ship_from_address TEXT NOT NULL,
          ship_from_phone TEXT,
          label_pdf_path TEXT,
          invoice_pdf_path TEXT,
          bundle_pdf_path TEXT,
          FOREIGN KEY (invoice_id) REFERENCES documents(id)
        )
      `);
      console.log('[DB] Created delivery_notes table');
    } catch (e) {
      console.log('[DB] delivery_notes table may already exist:', e);
    }
    
    // Create delivery_note_lines table
    try {
      await database.execAsync(`
        CREATE TABLE IF NOT EXISTS delivery_note_lines (
          id TEXT PRIMARY KEY,
          delivery_note_id TEXT NOT NULL,
          product_id INTEGER,
          label TEXT NOT NULL,
          qty REAL DEFAULT 1,
          unit TEXT DEFAULT 'unité',
          unit_weight_kg REAL,
          line_weight_kg REAL DEFAULT 0,
          FOREIGN KEY (delivery_note_id) REFERENCES delivery_notes(id) ON DELETE CASCADE,
          FOREIGN KEY (product_id) REFERENCES products(id)
        )
      `);
      console.log('[DB] Created delivery_note_lines table');
    } catch (e) {
      console.log('[DB] delivery_note_lines table may already exist:', e);
    }
    
    // Create indexes
    try {
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_delivery_notes_invoice ON delivery_notes(invoice_id)');
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status)');
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_note ON delivery_note_lines(delivery_note_id)');
      console.log('[DB] Created delivery notes indexes');
    } catch (e) {
      console.log('[DB] Indexes may already exist:', e);
    }
    
    // Add delivery note settings
    const newSettings = [
      ['delivery_note_prefix', 'BL-'],
      ['delivery_note_counter', '1'],
    ];
    
    for (const [key, value] of newSettings) {
      try {
        await database.runAsync(
          'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
          [key, value]
        );
      } catch {
        console.log('[DB] Setting may already exist:', key);
      }
    }
    
    console.log('[DB] Version 11 migration completed - Delivery notes');
  }

  if (currentVersion < 14) {
    console.log('[DB] Migrating to version 14 - Line item images...');
    
    try {
      await database.execAsync('ALTER TABLE line_items ADD COLUMN image_url TEXT');
      console.log('[DB] Added image_url column to line_items');
    } catch {
      console.log('[DB] Column image_url may already exist');
    }
    
    console.log('[DB] Version 14 migration completed - Line item images');
  }

  if (currentVersion < 15) {
    console.log('[DB] Migrating to version 15 - Dossier and Objet fields...');
    
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN dossier TEXT');
      console.log('[DB] Added dossier column to documents');
    } catch {
      console.log('[DB] Column dossier may already exist');
    }
    
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN objet TEXT');
      console.log('[DB] Added objet column to documents');
    } catch {
      console.log('[DB] Column objet may already exist');
    }
    
    console.log('[DB] Version 15 migration completed - Dossier and Objet fields');
  }

  if (currentVersion < 17) {
    console.log('[DB] Migrating to version 17 - Credit notes (Avoirs)...');
    
    try {
      await database.execAsync("ALTER TABLE documents ADD COLUMN document_subtype TEXT DEFAULT 'invoice'");
      console.log('[DB] Added document_subtype column to documents');
    } catch {
      console.log('[DB] Column document_subtype may already exist');
    }
    
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN original_invoice_id INTEGER');
      console.log('[DB] Added original_invoice_id column to documents');
    } catch {
      console.log('[DB] Column original_invoice_id may already exist');
    }
    
    try {
      await database.execAsync('ALTER TABLE documents ADD COLUMN credit_note_reason TEXT');
      console.log('[DB] Added credit_note_reason column to documents');
    } catch {
      console.log('[DB] Column credit_note_reason may already exist');
    }
    
    console.log('[DB] Version 17 migration completed - Credit notes');
  }

  if (currentVersion < 18) {
    console.log('[DB] Migrating to version 18 - Test/Real mode...');
    
    const testColumns = [
      'ALTER TABLE documents ADD COLUMN is_test INTEGER DEFAULT 0',
      'ALTER TABLE expenses ADD COLUMN is_test INTEGER DEFAULT 0',
      'ALTER TABLE delivery_notes ADD COLUMN is_test INTEGER DEFAULT 0',
      'ALTER TABLE clients ADD COLUMN is_test INTEGER DEFAULT 0',
      'ALTER TABLE products ADD COLUMN is_test INTEGER DEFAULT 0',
    ];
    
    for (const stmt of testColumns) {
      try {
        await database.execAsync(stmt);
        console.log('[DB] Migration applied:', stmt);
      } catch {
        console.log('[DB] Column may already exist:', stmt);
      }
    }
    
    try {
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_documents_is_test ON documents(is_test)');
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_expenses_is_test ON expenses(is_test)');
      await database.execAsync('CREATE INDEX IF NOT EXISTS idx_delivery_notes_is_test ON delivery_notes(is_test)');
      console.log('[DB] Created is_test indexes');
    } catch (e) {
      console.log('[DB] Indexes may already exist:', e);
    }
    
    console.log('[DB] Version 18 migration completed - Test/Real mode');
  }

  try {
    await database.execAsync('ALTER TABLE documents ADD COLUMN is_test INTEGER DEFAULT 0');
    console.log('[DB] Added missing is_test column to documents');
  } catch {
    // Column already exists
  }

  const existingSettings = await database.getAllAsync('SELECT key FROM settings');
  if (existingSettings.length === 0) {
    console.log('[DB] Inserting default settings...');
    for (const setting of DEFAULT_SETTINGS) {
      await database.runAsync(
        'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)',
        [setting.key, setting.value]
      );
    }
  }

  await database.runAsync(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['db_version', String(DB_VERSION)]
  );

  console.log('[DB] Database version:', DB_VERSION);
}

export function getDatabase(): SQLite.SQLiteDatabase | null {
  if (Platform.OS !== 'web') {
    const multiYearDb = getCurrentDatabase();
    if (multiYearDb) {
      return multiYearDb;
    }
  }
  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    await db.closeAsync();
    db = null;
    console.log('[DB] Database closed');
  }
}

function createWebMockDatabase(): SQLite.SQLiteDatabase {
  const mockData: Record<string, unknown[]> = {
    clients: [],
    products: [],
    documents: [],
    line_items: [],
    settings: DEFAULT_SETTINGS.map(s => ({ ...s, updated_at: new Date().toISOString() })),
    reminder_history: [],
    expenses: [],
  };

  // Load persisted data from localStorage
  try {
    const persisted = localStorage.getItem('niko_db_mock');
    if (persisted) {
      const parsed = JSON.parse(persisted);
      Object.assign(mockData, parsed);
      console.log('[DB-Web] Loaded persisted data from localStorage');
    }
  } catch {
    console.log('[DB-Web] No persisted data found');
  }

  const persistData = () => {
    try {
      localStorage.setItem('niko_db_mock', JSON.stringify(mockData));
    } catch (e) {
      console.error('[DB-Web] Failed to persist data:', e);
    }
  };

  return {
    getAllAsync: async (query: string, params?: unknown[]) => {
      console.log('[DB-Web] getAllAsync:', query, params);
      const table = extractTableName(query);
      const data = mockData[table] || [];
      
      // Handle WHERE clause for settings
      if (table === 'settings' && query.includes('WHERE')) {
        return data;
      }
      
      return data;
    },
    getFirstAsync: async (query: string, params?: unknown[]) => {
      console.log('[DB-Web] getFirstAsync:', query, params);
      const table = extractTableName(query);
      const data = mockData[table] || [];
      
      // Handle WHERE key = ? for settings
      if (table === 'settings' && params && params.length > 0) {
        const key = params[0];
        const found = data.find((item: unknown) => (item as { key: string }).key === key);
        return found || null;
      }
      
      return data[0] || null;
    },
    runAsync: async (query: string, params?: unknown[]) => {
      console.log('[DB-Web] runAsync:', query, params);
      
      const upperQuery = query.toUpperCase();
      
      // Handle INSERT OR REPLACE for settings
      if (upperQuery.includes('INSERT') && upperQuery.includes('SETTINGS') && params) {
        const key = params[0] as string;
        const value = params[1] as string;
        const existingIndex = mockData.settings.findIndex(
          (s: unknown) => (s as { key: string }).key === key
        );
        const newSetting = { key, value, updated_at: new Date().toISOString() };
        
        if (existingIndex >= 0) {
          mockData.settings[existingIndex] = newSetting;
        } else {
          mockData.settings.push(newSetting);
        }
        persistData();
        console.log('[DB-Web] Setting saved:', key, '=', value);
        return { changes: 1, lastInsertRowId: mockData.settings.length };
      }
      
      // Handle INSERT for clients
      if (upperQuery.includes('INSERT') && upperQuery.includes('CLIENTS') && params) {
        const newId = mockData.clients.length + 1;
        const newClient = { id: newId, ...parseInsertParams(query, params) };
        mockData.clients.push(newClient);
        persistData();
        return { changes: 1, lastInsertRowId: newId };
      }
      
      // Handle INSERT for products
      if (upperQuery.includes('INSERT') && upperQuery.includes('PRODUCTS') && params) {
        const newId = mockData.products.length + 1;
        const newProduct = { id: newId, ...parseInsertParams(query, params) };
        mockData.products.push(newProduct);
        persistData();
        return { changes: 1, lastInsertRowId: newId };
      }
      
      // Handle INSERT for documents
      if (upperQuery.includes('INSERT') && upperQuery.includes('DOCUMENTS') && params) {
        const newId = mockData.documents.length + 1;
        const newDoc = { id: newId, ...parseInsertParams(query, params) };
        mockData.documents.push(newDoc);
        persistData();
        return { changes: 1, lastInsertRowId: newId };
      }
      
      // Handle INSERT for line_items
      if (upperQuery.includes('INSERT') && upperQuery.includes('LINE_ITEMS') && params) {
        const newId = mockData.line_items.length + 1;
        const newItem = { id: newId, ...parseInsertParams(query, params) };
        mockData.line_items.push(newItem);
        persistData();
        return { changes: 1, lastInsertRowId: newId };
      }
      
      // Handle INSERT for expenses
      if (upperQuery.includes('INSERT') && upperQuery.includes('EXPENSES') && params) {
        const newId = mockData.expenses.length + 1;
        const newExpense = { id: newId, ...parseInsertParams(query, params), created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
        mockData.expenses.push(newExpense);
        persistData();
        return { changes: 1, lastInsertRowId: newId };
      }
      
      // Handle UPDATE
      if (upperQuery.includes('UPDATE')) {
        const table = extractTableNameFromUpdate(query);
        if (table && mockData[table]) {
          persistData();
        }
        return { changes: 1, lastInsertRowId: 0 };
      }
      
      // Handle DELETE
      if (upperQuery.includes('DELETE')) {
        const table = extractTableName(query);
        if (table && mockData[table] && params && params.length > 0) {
          const id = params[0];
          mockData[table] = mockData[table].filter(
            (item: unknown) => (item as { id: number }).id !== id
          );
          persistData();
        }
        return { changes: 1, lastInsertRowId: 0 };
      }
      
      return { changes: 0, lastInsertRowId: 1 };
    },
    execAsync: async (query: string) => {
      console.log('[DB-Web] execAsync:', query);
    },
    closeAsync: async () => {
      console.log('[DB-Web] closeAsync');
    },
  } as SQLite.SQLiteDatabase;
}

function parseInsertParams(query: string, params: unknown[]): Record<string, unknown> {
  const match = query.match(/\(([^)]+)\)\s*VALUES/i);
  if (!match) return {};
  
  const columns = match[1].split(',').map(c => c.trim());
  const result: Record<string, unknown> = {};
  
  columns.forEach((col, index) => {
    if (params[index] !== undefined) {
      result[col] = params[index];
    }
  });
  
  return result;
}

function extractTableNameFromUpdate(query: string): string {
  const match = query.match(/UPDATE\s+(\w+)/i);
  return match ? match[1] : '';
}

function extractTableName(query: string): string {
  const match = query.match(/FROM\s+(\w+)/i);
  return match ? match[1] : '';
}
