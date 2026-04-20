export const DB_NAME = 'niko_devis_factures.db';
export const DB_VERSION = 19;

export const CREATE_TABLES_SQL = `
-- Clients table
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT,
  siret TEXT,
  tva_number TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'France',
  delivery_address TEXT,
  delivery_city TEXT,
  delivery_postal_code TEXT,
  delivery_country TEXT,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Products/Services table
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'unité',
  tva_rate REAL DEFAULT 20,
  is_service INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Documents table (devis & factures)
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK(type IN ('devis', 'facture')),
  document_subtype TEXT DEFAULT 'invoice' CHECK(document_subtype IN ('invoice', 'credit_note')),
  number TEXT NOT NULL,
  client_id INTEGER NOT NULL,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'accepted', 'rejected', 'paid', 'cancelled')),
  date TEXT DEFAULT CURRENT_TIMESTAMP,
  due_date TEXT,
  sent_at TEXT,
  paid_at TEXT,
  payment_method TEXT,
  total_ht REAL DEFAULT 0,
  total_tva REAL DEFAULT 0,
  total_ttc REAL DEFAULT 0,
  global_discount_type TEXT DEFAULT 'percent' CHECK(global_discount_type IN ('percent', 'fixed')),
  global_discount_value REAL DEFAULT 0,
  auto_liquidation INTEGER DEFAULT 0,
  notes TEXT,
  conditions TEXT,
  legal_mentions TEXT,
  dossier TEXT,
  objet TEXT,
  source_devis_id INTEGER,
  original_invoice_id INTEGER,
  credit_note_reason TEXT,
  is_test INTEGER DEFAULT 0,
  is_einvoice INTEGER DEFAULT 0,
  einvoice_status TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (source_devis_id) REFERENCES documents(id),
  FOREIGN KEY (original_invoice_id) REFERENCES documents(id)
);

-- Line items table
CREATE TABLE IF NOT EXISTS line_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  product_id INTEGER,
  label TEXT,
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  tva_rate REAL DEFAULT 20,
  discount_type TEXT DEFAULT 'percent' CHECK(discount_type IN ('percent', 'fixed')),
  discount_value REAL DEFAULT 0,
  total_ht REAL NOT NULL,
  image_url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Reminder history table
CREATE TABLE IF NOT EXISTS reminder_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  level INTEGER NOT NULL DEFAULT 1,
  sent_at TEXT NOT NULL,
  recipient_email TEXT,
  subject TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  establishment TEXT NOT NULL,
  amount_ttc REAL NOT NULL DEFAULT 0,
  amount_tva REAL NOT NULL DEFAULT 0,
  amount_ttc_cents INTEGER NOT NULL DEFAULT 0,
  amount_tva_cents INTEGER NOT NULL DEFAULT 0,
  tva_rate REAL DEFAULT 20,
  date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'divers',
  photo_uri TEXT,
  ocr_text TEXT,
  notes TEXT,
  is_recurring INTEGER DEFAULT 0,
  recurring_start_date TEXT,
  recurring_end_date TEXT,
  recurring_day INTEGER,
  recurring_parent_id INTEGER,
  is_archived INTEGER DEFAULT 0,
  photo_hash TEXT,
  thumbnail_path TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recurring_parent_id) REFERENCES expenses(id)
);

-- E-Invoice envelopes table
CREATE TABLE IF NOT EXISTS e_invoice_envelopes (
  id TEXT PRIMARY KEY,
  invoice_id INTEGER NOT NULL,
  format TEXT NOT NULL DEFAULT 'facturx' CHECK(format IN ('facturx', 'ubl', 'cii')),
  direction TEXT NOT NULL DEFAULT 'outbound' CHECK(direction IN ('outbound', 'inbound')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'issued', 'prepared', 'submitted', 'delivered', 'accepted', 'rejected', 'paid')),
  provider TEXT NOT NULL DEFAULT 'local',
  file_path TEXT,
  xml_content TEXT,
  checksum TEXT,
  pdp_reference TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  submitted_at TEXT,
  delivered_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- E-Invoice status events table (append-only timeline)
CREATE TABLE IF NOT EXISTS einvoice_status_events (
  id TEXT PRIMARY KEY,
  envelope_id TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  payload_json TEXT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (envelope_id) REFERENCES e_invoice_envelopes(id) ON DELETE CASCADE
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK(action IN ('create', 'issue', 'prepare', 'submit', 'status_change', 'update', 'delete')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  user_id TEXT,
  user_name TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Sync outbox table for future server synchronization
CREATE TABLE IF NOT EXISTS sync_outbox (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'failed')),
  retry_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
CREATE INDEX IF NOT EXISTS idx_line_items_document ON line_items(document_id);
CREATE INDEX IF NOT EXISTS idx_reminder_history_document ON reminder_history(document_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
CREATE INDEX IF NOT EXISTS idx_e_invoice_envelopes_invoice ON e_invoice_envelopes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_e_invoice_envelopes_status ON e_invoice_envelopes(status);
CREATE INDEX IF NOT EXISTS idx_einvoice_status_events_envelope ON einvoice_status_events(envelope_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_outbox_status ON sync_outbox(status);

-- Delivery notes table
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
);

-- Delivery note lines table
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
);

CREATE INDEX IF NOT EXISTS idx_delivery_notes_invoice ON delivery_notes(invoice_id);
CREATE INDEX IF NOT EXISTS idx_delivery_notes_status ON delivery_notes(status);
CREATE INDEX IF NOT EXISTS idx_delivery_note_lines_note ON delivery_note_lines(delivery_note_id);

-- File metadata table for tracking attachments
CREATE TABLE IF NOT EXISTS file_metadata (
  id TEXT PRIMARY KEY,
  original_path TEXT,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'photo', 'xml', 'other')),
  mime_type TEXT,
  size INTEGER DEFAULT 0,
  hash TEXT NOT NULL,
  thumbnail_path TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_entity ON file_metadata(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_year ON file_metadata(year);

-- Document splits table (for shared/split billing)
CREATE TABLE IF NOT EXISTS document_splits (
  id TEXT PRIMARY KEY,
  master_id INTEGER NOT NULL,
  number_full TEXT NOT NULL,
  suffix TEXT NOT NULL,
  client_id INTEGER NOT NULL,
  allocation_mode TEXT NOT NULL DEFAULT 'by_product' CHECK(allocation_mode IN ('by_product', 'percentage', 'fixed', 'equal')),
  allocation_value REAL DEFAULT 0,
  total_ht REAL DEFAULT 0,
  total_tva REAL DEFAULT 0,
  total_ttc REAL DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'partial', 'paid', 'cancelled')),
  payment_ref TEXT,
  payment_method TEXT,
  paid_at TEXT,
  sent_at TEXT,
  pdf_path TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (master_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id)
);

-- Split line assignments table
CREATE TABLE IF NOT EXISTS split_line_assignments (
  id TEXT PRIMARY KEY,
  split_id TEXT NOT NULL,
  line_item_id INTEGER NOT NULL,
  product_id INTEGER,
  label TEXT,
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL NOT NULL,
  tva_rate REAL DEFAULT 20,
  discount_type TEXT DEFAULT 'percent' CHECK(discount_type IN ('percent', 'fixed')),
  discount_value REAL DEFAULT 0,
  total_ht REAL NOT NULL,
  allocation_percentage REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (split_id) REFERENCES document_splits(id) ON DELETE CASCADE,
  FOREIGN KEY (line_item_id) REFERENCES line_items(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Allocation rule snapshots table
CREATE TABLE IF NOT EXISTS allocation_rule_snapshots (
  id TEXT PRIMARY KEY,
  master_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  parameters_json TEXT,
  computed_values_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (master_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_document_splits_master ON document_splits(master_id);
CREATE INDEX IF NOT EXISTS idx_document_splits_client ON document_splits(client_id);
CREATE INDEX IF NOT EXISTS idx_document_splits_status ON document_splits(status);
CREATE INDEX IF NOT EXISTS idx_split_line_assignments_split ON split_line_assignments(split_id);
CREATE INDEX IF NOT EXISTS idx_allocation_rule_snapshots_master ON allocation_rule_snapshots(master_id);

-- Deposit configurations table (acomptes)
CREATE TABLE IF NOT EXISTS deposit_configs (
  id TEXT PRIMARY KEY,
  quote_id INTEGER NOT NULL UNIQUE,
  enabled INTEGER DEFAULT 0,
  mode TEXT DEFAULT 'percent' CHECK(mode IN ('percent', 'fixed')),
  value REAL DEFAULT 30,
  installment_count INTEGER DEFAULT 1,
  distribution TEXT DEFAULT 'equal' CHECK(distribution IN ('equal', 'custom')),
  total_deposit_amount REAL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Deposit installments table
CREATE TABLE IF NOT EXISTS deposit_installments (
  id TEXT PRIMARY KEY,
  config_id TEXT NOT NULL,
  installment_index INTEGER NOT NULL,
  amount REAL NOT NULL,
  percentage REAL NOT NULL,
  due_date TEXT,
  is_generated INTEGER DEFAULT 0,
  master_invoice_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (config_id) REFERENCES deposit_configs(id) ON DELETE CASCADE,
  FOREIGN KEY (master_invoice_id) REFERENCES documents(id)
);

-- Deposit invoices tracking table (links invoices to deposits)
CREATE TABLE IF NOT EXISTS deposit_invoices (
  id TEXT PRIMARY KEY,
  quote_id INTEGER NOT NULL,
  invoice_id INTEGER NOT NULL,
  billing_ref TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('deposit', 'final')),
  installment_index INTEGER,
  is_master INTEGER DEFAULT 0,
  master_invoice_id INTEGER,
  client_index INTEGER,
  amount REAL NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (quote_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (invoice_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (master_invoice_id) REFERENCES documents(id)
);

CREATE INDEX IF NOT EXISTS idx_deposit_configs_quote ON deposit_configs(quote_id);
CREATE INDEX IF NOT EXISTS idx_deposit_installments_config ON deposit_installments(config_id);
CREATE INDEX IF NOT EXISTS idx_deposit_invoices_quote ON deposit_invoices(quote_id);
CREATE INDEX IF NOT EXISTS idx_deposit_invoices_invoice ON deposit_invoices(invoice_id);
CREATE INDEX IF NOT EXISTS idx_deposit_invoices_stage ON deposit_invoices(stage);
`;

export const DEFAULT_SETTINGS = [
  { key: 'company_name', value: '' },
  { key: 'company_address', value: '' },
  { key: 'company_city', value: '' },
  { key: 'company_postal_code', value: '' },
  { key: 'company_email', value: '' },
  { key: 'company_phone', value: '' },
  { key: 'company_siret', value: '' },
  { key: 'company_tva_number', value: '' },
  { key: 'company_iban', value: '' },
  { key: 'company_logo', value: '' },
  { key: 'company_legal_form', value: '' },
  { key: 'company_capital', value: '' },
  { key: 'company_rcs_number', value: '' },
  { key: 'company_rcs_city', value: '' },
  { key: 'company_rm_number', value: '' },
  { key: 'company_rm_department', value: '' },
  { key: 'company_vat_exempt', value: 'false' },
  { key: 'devis_prefix', value: 'DEV-' },
  { key: 'devis_counter', value: '1' },
  { key: 'facture_prefix', value: 'FAC-' },
  { key: 'facture_counter', value: '1' },
  { key: 'default_tva_rate', value: '20' },
  { key: 'currency', value: 'EUR' },
  { key: 'date_format', value: 'DD/MM/YYYY' },
  { key: 'language', value: 'fr' },
  { key: 'template_primary_color', value: '#3B82F6' },
  { key: 'template_accent_color', value: '#10B981' },
  { key: 'template_font_family', value: 'System' },
  { key: 'template_footer_text', value: '' },
  { key: 'template_show_logo', value: 'true' },
  { key: 'reminders_enabled', value: 'true' },
  { key: 'reminder1_days', value: '3' },
  { key: 'reminder2_days', value: '10' },
  { key: 'reminder3_days', value: '21' },
  { key: 'reminder1_enabled', value: 'true' },
  { key: 'reminder2_enabled', value: 'true' },
  { key: 'reminder3_enabled', value: 'true' },
  { key: 'reminder_templates', value: '' },
  { key: 'einvoice_enabled', value: 'false' },
  { key: 'einvoice_default_format', value: 'facturx' },
  { key: 'einvoice_auto_submit', value: 'false' },
  { key: 'einvoice_pdp_provider', value: 'mock' },
  { key: 'einvoice_pdp_endpoint', value: '' },
  { key: 'einvoice_pdp_api_key', value: '' },
  { key: 'einvoice_pdp_config_json', value: '{}' },
  { key: 'einvoice_email_notify_enabled', value: 'true' },
  { key: 'company_siren', value: '' },
  { key: 'company_default_conditions', value: '' },
  { key: 'company_default_legal_mentions', value: '' },
  { key: 'delivery_note_prefix', value: 'BL-' },
  { key: 'delivery_note_counter', value: '1' },
];
