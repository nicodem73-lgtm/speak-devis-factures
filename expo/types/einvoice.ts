export type EInvoiceStatus = 
  | 'draft'
  | 'issued'
  | 'prepared'
  | 'submitted'
  | 'delivered'
  | 'accepted'
  | 'rejected'
  | 'paid';

export type EInvoiceFormat = 'facturx' | 'ubl' | 'cii';

export type EInvoiceDirection = 'outbound' | 'inbound';

export type AuditAction = 
  | 'create'
  | 'issue'
  | 'prepare'
  | 'submit'
  | 'status_change'
  | 'update'
  | 'delete';

export interface EInvoiceEnvelope {
  id: string;
  invoice_id: number;
  format: EInvoiceFormat;
  direction: EInvoiceDirection;
  status: EInvoiceStatus;
  provider: string;
  file_path?: string;
  xml_content?: string;
  checksum?: string;
  pdp_reference?: string;
  provider_message_id?: string;
  error_message?: string;
  submitted_at?: string;
  delivered_at?: string;
  created_at: string;
  updated_at: string;
}

export interface EInvoiceEnvelopeInput {
  invoice_id: number;
  format: EInvoiceFormat;
  direction: EInvoiceDirection;
  status?: EInvoiceStatus;
  provider?: string;
  file_path?: string;
  xml_content?: string;
  checksum?: string;
}

export interface EInvoiceStatusEvent {
  id: string;
  envelope_id: string;
  status: EInvoiceStatus;
  message?: string;
  payload_json?: string;
  occurred_at: string;
}

export interface EInvoiceStatusEventInput {
  envelope_id: string;
  status: EInvoiceStatus;
  message?: string;
  payload?: Record<string, unknown>;
}

export interface AuditLog {
  id: string;
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_value?: string;
  new_value?: string;
  user_id?: string;
  user_name?: string;
  metadata?: string;
  created_at: string;
}

export interface AuditLogInput {
  action: AuditAction;
  entity_type: string;
  entity_id: string;
  old_value?: string;
  new_value?: string;
  user_id?: string;
  user_name?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncOutboxItem {
  id: string;
  entity_type: string;
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retry_count: number;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface EInvoiceProvider {
  prepareInvoice(invoiceId: number): Promise<EInvoiceEnvelope>;
  submitEnvelope(envelopeId: string): Promise<EInvoiceEnvelope>;
  getStatus(envelopeId: string): Promise<EInvoiceStatus>;
  receiveInbox(): Promise<EInvoiceEnvelope[]>;
  isConnected(): boolean;
  getProviderName(): string;
}

export type PdpEnvironment = 'test' | 'production';

export interface PdpCredentials {
  login?: string;
  apiKey?: string;
  certificate?: string;
  certificateExpiry?: string;
}

export interface PdpEndpoints {
  testEndpoint?: string;
  productionEndpoint?: string;
}

export interface EInvoiceSettings {
  enabled: boolean;
  defaultFormat: EInvoiceFormat;
  autoSubmit: boolean;
  sendEmailNotification: boolean;
  pdpProvider?: string;
  pdpApiKey?: string;
  pdpEndpoint?: string;
  pdpConfigJson?: string;
  pdpEnvironment?: PdpEnvironment;
  pdpTestEndpoint?: string;
  pdpProductionEndpoint?: string;
  pdpLogin?: string;
  companySiren?: string;
  companySiret?: string;
}

export interface DocumentEInvoiceFields {
  is_einvoice?: number;
  einvoice_status?: EInvoiceStatus;
  issued_at?: string;
  submitted_at?: string;
  pdp_provider?: string;
  pdp_message_id?: string;
  einvoice_format?: EInvoiceFormat;
  einvoice_file_path?: string;
  einvoice_checksum?: string;
  locked?: number;
}

export const EINVOICE_STATUS_LABELS: Record<EInvoiceStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  prepared: 'Préparée',
  submitted: 'Transmise',
  delivered: 'Délivrée',
  accepted: 'Acceptée',
  rejected: 'Rejetée',
  paid: 'Payée',
};

export const EINVOICE_STATUS_COLORS: Record<EInvoiceStatus, string> = {
  draft: '#6B7280',
  issued: '#3B82F6',
  prepared: '#8B5CF6',
  submitted: '#F59E0B',
  delivered: '#10B981',
  accepted: '#059669',
  rejected: '#EF4444',
  paid: '#14B8A6',
};

export const EINVOICE_FORMAT_LABELS: Record<EInvoiceFormat, string> = {
  facturx: 'Factur-X',
  ubl: 'UBL',
  cii: 'CII',
};

export function getStatusOrder(status: EInvoiceStatus): number {
  const order: Record<EInvoiceStatus, number> = {
    draft: 0,
    issued: 1,
    prepared: 2,
    submitted: 3,
    delivered: 4,
    accepted: 5,
    rejected: 5,
    paid: 6,
  };
  return order[status];
}

export function canTransitionTo(from: EInvoiceStatus, to: EInvoiceStatus): boolean {
  const transitions: Record<EInvoiceStatus, EInvoiceStatus[]> = {
    draft: ['issued'],
    issued: ['prepared'],
    prepared: ['submitted'],
    submitted: ['delivered', 'rejected'],
    delivered: ['accepted', 'rejected'],
    accepted: ['paid'],
    rejected: ['draft'],
    paid: [],
  };
  return transitions[from]?.includes(to) ?? false;
}

export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function nowISO(): string {
  return new Date().toISOString();
}

export async function calculateSHA256(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
