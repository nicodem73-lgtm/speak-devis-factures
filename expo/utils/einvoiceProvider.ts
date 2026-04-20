import * as SQLite from 'expo-sqlite';
import {
  EInvoiceProvider,
  EInvoiceEnvelope,
  EInvoiceStatus,
  EInvoiceSettings,
  generateUUID,
  nowISO,
} from '@/types/einvoice';
import {
  createEInvoiceEnvelope,
  getEInvoiceEnvelopeById,
  getEInvoiceEnvelopeByInvoiceId,
  updateEInvoiceEnvelopeStatus,
  updateEInvoiceEnvelope,
  getAllEInvoiceEnvelopes,
  createAuditLog,
  createStatusEvent,
  updateDocumentEInvoiceFields,
} from '@/db/einvoice';
import { generateFacturXML } from './facturx';

export class LocalEInvoiceProvider implements EInvoiceProvider {
  private db: SQLite.SQLiteDatabase;
  private settings: EInvoiceSettings;

  constructor(db: SQLite.SQLiteDatabase, settings: EInvoiceSettings) {
    this.db = db;
    this.settings = settings;
    console.log('[EInvoiceProvider] LocalProvider initialized');
  }

  isConnected(): boolean {
    return false;
  }

  getProviderName(): string {
    return 'Mode préparation (local)';
  }

  async prepareInvoice(invoiceId: number): Promise<EInvoiceEnvelope> {
    console.log('[EInvoiceProvider] Preparing invoice:', invoiceId);

    let envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);

    if (!envelope) {
      envelope = await createEInvoiceEnvelope(this.db, {
        invoice_id: invoiceId,
        format: this.settings.defaultFormat,
        direction: 'outbound',
        status: 'draft',
        provider: 'local',
      });
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelope.id, 'issued');

    await createAuditLog(this.db, {
      action: 'issue',
      entity_type: 'e_invoice_envelope',
      entity_id: envelope.id,
      metadata: { invoice_id: invoiceId },
    });

    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelope.id);
    return updatedEnvelope!;
  }

  async submitEnvelope(envelopeId: string): Promise<EInvoiceEnvelope> {
    console.log('[EInvoiceProvider] Submitting envelope (local mode):', envelopeId);

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      throw new Error('Envelope not found');
    }

    await updateEInvoiceEnvelopeStatus(
      this.db,
      envelopeId,
      'prepared',
      'PDP non connectée - facture préparée pour envoi ultérieur'
    );

    await createAuditLog(this.db, {
      action: 'prepare',
      entity_type: 'e_invoice_envelope',
      entity_id: envelopeId,
      metadata: { 
        message: 'Facture préparée en mode local, en attente de connexion PDP',
      },
    });

    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    return updatedEnvelope!;
  }

  async getStatus(envelopeId: string): Promise<EInvoiceStatus> {
    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    return envelope?.status || 'draft';
  }

  async receiveInbox(): Promise<EInvoiceEnvelope[]> {
    console.log('[EInvoiceProvider] Checking inbox (local mode - empty)');
    return [];
  }
}

export class MockPDPProvider implements EInvoiceProvider {
  private db: SQLite.SQLiteDatabase;
  private settings: EInvoiceSettings;
  private simulateRejection: boolean = false;
  private pendingSimulations: Map<string, ReturnType<typeof setTimeout>[]> = new Map();

  constructor(db: SQLite.SQLiteDatabase, settings: EInvoiceSettings) {
    this.db = db;
    this.settings = settings;
    console.log('[EInvoiceProvider] MockPDPProvider initialized');
  }

  isConnected(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'Mock PDP (simulation)';
  }

  setSimulateRejection(reject: boolean): void {
    this.simulateRejection = reject;
  }

  async prepareInvoice(invoiceId: number): Promise<EInvoiceEnvelope> {
    console.log('[MockPDP] Preparing invoice:', invoiceId);

    let envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);

    if (!envelope) {
      envelope = await createEInvoiceEnvelope(this.db, {
        invoice_id: invoiceId,
        format: this.settings.defaultFormat,
        direction: 'outbound',
        status: 'draft',
        provider: 'mock',
      });
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelope.id, 'issued');
    
    await createStatusEvent(this.db, {
      envelope_id: envelope.id,
      status: 'issued',
      message: 'Facture émise (Mock PDP)',
    });

    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelope.id);
    return updatedEnvelope!;
  }

  async submitEnvelope(envelopeId: string): Promise<EInvoiceEnvelope> {
    console.log('[MockPDP] Submitting envelope:', envelopeId);

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      throw new Error('Envelope not found');
    }

    const providerMessageId = `MOCK-${generateUUID().substring(0, 8).toUpperCase()}`;
    const now = nowISO();

    await this.db.runAsync(
      `UPDATE e_invoice_envelopes SET 
        status = 'submitted', 
        submitted_at = ?, 
        provider_message_id = ?,
        provider = 'mock',
        updated_at = ?
       WHERE id = ?`,
      [now, providerMessageId, now, envelopeId]
    );

    await createStatusEvent(this.db, {
      envelope_id: envelopeId,
      status: 'submitted',
      message: 'Transmise via Mock PDP',
      payload: { provider_message_id: providerMessageId },
    });

    await updateDocumentEInvoiceFields(this.db, envelope.invoice_id, {
      einvoice_status: 'submitted',
      submitted_at: now,
      pdp_provider: 'mock',
      pdp_message_id: providerMessageId,
      locked: 1,
    });

    await createAuditLog(this.db, {
      action: 'submit',
      entity_type: 'e_invoice_envelope',
      entity_id: envelopeId,
      metadata: { provider: 'mock', provider_message_id: providerMessageId },
    });

    this.scheduleStatusSimulation(envelopeId, envelope.invoice_id);

    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    return updatedEnvelope!;
  }

  private scheduleStatusSimulation(envelopeId: string, invoiceId: number): void {
    console.log('[MockPDP] Scheduling status simulation for:', envelopeId);

    const timers: ReturnType<typeof setTimeout>[] = [];

    const deliveredTimer = setTimeout(async () => {
      console.log('[MockPDP] Simulating delivered status for:', envelopeId);
      try {
        await this.db.runAsync(
          `UPDATE e_invoice_envelopes SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?`,
          [nowISO(), nowISO(), envelopeId]
        );
        await createStatusEvent(this.db, {
          envelope_id: envelopeId,
          status: 'delivered',
          message: 'Facture délivrée à la PDP du destinataire (simulation)',
        });
        await updateDocumentEInvoiceFields(this.db, invoiceId, {
          einvoice_status: 'delivered',
        });
      } catch (e) {
        console.error('[MockPDP] Error simulating delivered:', e);
      }
    }, 2000);
    timers.push(deliveredTimer);

    const finalTimer = setTimeout(async () => {
      console.log('[MockPDP] Simulating final status for:', envelopeId);
      try {
        if (this.simulateRejection) {
          await updateEInvoiceEnvelopeStatus(
            this.db,
            envelopeId,
            'rejected',
            'Rejet simulé : informations manquantes (test)'
          );
          await createStatusEvent(this.db, {
            envelope_id: envelopeId,
            status: 'rejected',
            message: 'Facture rejetée par le destinataire (simulation)',
            payload: { rejection_reason: 'Informations manquantes (test)' },
          });
          await updateDocumentEInvoiceFields(this.db, invoiceId, {
            einvoice_status: 'rejected',
          });
        } else {
          await updateEInvoiceEnvelopeStatus(this.db, envelopeId, 'accepted');
          await createStatusEvent(this.db, {
            envelope_id: envelopeId,
            status: 'accepted',
            message: 'Facture acceptée par le destinataire (simulation)',
          });
          await updateDocumentEInvoiceFields(this.db, invoiceId, {
            einvoice_status: 'accepted',
          });
        }
      } catch (e) {
        console.error('[MockPDP] Error simulating final status:', e);
      }
      this.pendingSimulations.delete(envelopeId);
    }, 4000);
    timers.push(finalTimer);

    this.pendingSimulations.set(envelopeId, timers);
  }

  cancelSimulation(envelopeId: string): void {
    const timers = this.pendingSimulations.get(envelopeId);
    if (timers) {
      timers.forEach(t => clearTimeout(t));
      this.pendingSimulations.delete(envelopeId);
      console.log('[MockPDP] Cancelled simulation for:', envelopeId);
    }
  }

  async getStatus(envelopeId: string): Promise<EInvoiceStatus> {
    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    return envelope?.status || 'draft';
  }

  async receiveInbox(): Promise<EInvoiceEnvelope[]> {
    console.log('[MockPDP] Checking inbox (mock - returning empty)');
    return [];
  }

  async simulateInboundInvoice(): Promise<EInvoiceEnvelope> {
    console.log('[MockPDP] Simulating inbound invoice');
    
    const envelope = await createEInvoiceEnvelope(this.db, {
      invoice_id: 0,
      format: 'facturx',
      direction: 'inbound',
      status: 'delivered',
      provider: 'mock',
    });

    await createStatusEvent(this.db, {
      envelope_id: envelope.id,
      status: 'delivered',
      message: 'Facture reçue via Mock PDP (simulation)',
    });

    return envelope;
  }
}

export class PDPLibreProvider implements EInvoiceProvider {
  private db: SQLite.SQLiteDatabase;
  private settings: EInvoiceSettings;
  private connected: boolean = false;

  constructor(db: SQLite.SQLiteDatabase, settings: EInvoiceSettings) {
    this.db = db;
    this.settings = settings;
    console.log('[EInvoiceProvider] PDPLibreProvider initialized (stub)');
  }

  isConnected(): boolean {
    return this.connected && !!this.settings.pdpEndpoint && !!this.settings.pdpApiKey;
  }

  getProviderName(): string {
    return 'PDP Libre';
  }

  async prepareInvoice(invoiceId: number): Promise<EInvoiceEnvelope> {
    console.log('[EInvoiceProvider] PDPLibre - Preparing invoice:', invoiceId);

    let envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);

    if (!envelope) {
      envelope = await createEInvoiceEnvelope(this.db, {
        invoice_id: invoiceId,
        format: this.settings.defaultFormat,
        direction: 'outbound',
        status: 'draft',
      });
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelope.id, 'issued');

    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelope.id);
    return updatedEnvelope!;
  }

  async submitEnvelope(envelopeId: string): Promise<EInvoiceEnvelope> {
    console.log('[EInvoiceProvider] PDPLibre - Submitting envelope:', envelopeId);

    if (!this.isConnected()) {
      throw new Error('PDP non connectée. Veuillez configurer les paramètres de connexion.');
    }

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      throw new Error('Envelope not found');
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelopeId, 'submitted');

    await updateEInvoiceEnvelope(this.db, envelopeId, {
      pdp_reference: `PDPLIBRE-${generateUUID().substring(0, 8).toUpperCase()}`,
    });

    await createAuditLog(this.db, {
      action: 'submit',
      entity_type: 'e_invoice_envelope',
      entity_id: envelopeId,
      metadata: { provider: 'pdp_libre' },
    });

    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    return updatedEnvelope!;
  }

  async getStatus(envelopeId: string): Promise<EInvoiceStatus> {
    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    return envelope?.status || 'draft';
  }

  async receiveInbox(): Promise<EInvoiceEnvelope[]> {
    console.log('[EInvoiceProvider] PDPLibre - Checking inbox');
    
    if (!this.isConnected()) {
      return [];
    }

    return getAllEInvoiceEnvelopes(this.db, 'inbound');
  }
}

export function createEInvoiceProvider(
  db: SQLite.SQLiteDatabase,
  settings: EInvoiceSettings
): EInvoiceProvider {
  if (settings.pdpProvider === 'pdp_libre' && settings.pdpEndpoint) {
    return new PDPLibreProvider(db, settings);
  }
  
  if (settings.pdpProvider === 'mock') {
    return new MockPDPProvider(db, settings);
  }
  
  return new LocalEInvoiceProvider(db, settings);
}

export async function processEInvoice(
  db: SQLite.SQLiteDatabase,
  provider: EInvoiceProvider,
  invoiceId: number,
  documentData: {
    number: string;
    date: string;
    due_date?: string;
    total_ht: number;
    total_tva: number;
    total_ttc: number;
    notes?: string;
    conditions?: string;
  },
  companyInfo: {
    name: string;
    siret?: string;
    siren?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    email?: string;
    tvaNumber?: string;
  },
  clientInfo: {
    name: string;
    company?: string;
    siret?: string;
    siren?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    email?: string;
  },
  lineItems: {
    description: string;
    quantity: number;
    unit_price: number;
    tva_rate: number;
    total_ht: number;
  }[]
): Promise<EInvoiceEnvelope> {
  console.log('[EInvoiceProvider] Processing e-invoice for:', invoiceId);

  const envelope = await provider.prepareInvoice(invoiceId);

  const xmlContent = generateFacturXML({
    invoiceNumber: documentData.number,
    issueDate: documentData.date,
    dueDate: documentData.due_date,
    seller: {
      name: companyInfo.name,
      siret: companyInfo.siret,
      siren: companyInfo.siren,
      address: companyInfo.address,
      city: companyInfo.city,
      postalCode: companyInfo.postalCode,
      country: 'FR',
      email: companyInfo.email,
      vatNumber: companyInfo.tvaNumber,
    },
    buyer: {
      name: clientInfo.company || clientInfo.name,
      siret: clientInfo.siret,
      siren: clientInfo.siren,
      address: clientInfo.address,
      city: clientInfo.city,
      postalCode: clientInfo.postalCode,
      country: 'FR',
      email: clientInfo.email,
    },
    lines: lineItems.map((item, index) => ({
      lineNumber: index + 1,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unit_price,
      vatRate: item.tva_rate,
      lineTotal: item.total_ht,
    })),
    totals: {
      totalHT: documentData.total_ht,
      totalVAT: documentData.total_tva,
      totalTTC: documentData.total_ttc,
    },
    paymentTerms: documentData.conditions,
    notes: documentData.notes,
  });

  const checksum = await calculateChecksum(xmlContent);

  await updateEInvoiceEnvelope(db, envelope.id, {
    xml_content: xmlContent,
    checksum,
  });

  await updateEInvoiceEnvelopeStatus(db, envelope.id, 'prepared');

  const updatedEnvelope = await getEInvoiceEnvelopeById(db, envelope.id);
  return updatedEnvelope!;
}

async function calculateChecksum(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hashHex;
}

export async function manualStatusUpdate(
  db: SQLite.SQLiteDatabase,
  envelopeId: string,
  newStatus: EInvoiceStatus,
  message?: string
): Promise<void> {
  console.log('[EInvoiceProvider] Manual status update:', envelopeId, newStatus);
  
  const envelope = await getEInvoiceEnvelopeById(db, envelopeId);
  if (!envelope) {
    throw new Error('Envelope not found');
  }

  await updateEInvoiceEnvelopeStatus(db, envelopeId, newStatus, message);
  
  await createStatusEvent(db, {
    envelope_id: envelopeId,
    status: newStatus,
    message: message || `Statut mis à jour manuellement: ${newStatus}`,
  });

  await updateDocumentEInvoiceFields(db, envelope.invoice_id, {
    einvoice_status: newStatus,
  });
}

export async function getEInvoiceSettings(
  db: SQLite.SQLiteDatabase
): Promise<EInvoiceSettings> {
  const getSettingValue = async (key: string): Promise<string> => {
    const result = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return result?.value || '';
  };

  return {
    enabled: (await getSettingValue('einvoice_enabled')) === 'true',
    defaultFormat: (await getSettingValue('einvoice_default_format') || 'facturx') as 'facturx' | 'ubl' | 'cii',
    autoSubmit: (await getSettingValue('einvoice_auto_submit')) === 'true',
    sendEmailNotification: (await getSettingValue('einvoice_send_email_notification')) !== 'false',
    pdpProvider: await getSettingValue('einvoice_pdp_provider') || 'mock',
    pdpApiKey: await getSettingValue('einvoice_pdp_api_key'),
    pdpEndpoint: await getSettingValue('einvoice_pdp_endpoint'),
    pdpConfigJson: await getSettingValue('einvoice_pdp_config_json'),
    pdpEnvironment: (await getSettingValue('einvoice_pdp_environment') || 'test') as 'test' | 'production',
    pdpTestEndpoint: await getSettingValue('einvoice_pdp_test_endpoint'),
    pdpProductionEndpoint: await getSettingValue('einvoice_pdp_production_endpoint'),
    pdpLogin: await getSettingValue('einvoice_pdp_login'),
    companySiren: await getSettingValue('company_siren'),
    companySiret: await getSettingValue('company_siret'),
  };
}

export async function saveEInvoiceSettings(
  db: SQLite.SQLiteDatabase,
  settings: Partial<EInvoiceSettings>
): Promise<void> {
  const settingsMap: Record<string, string | undefined> = {
    einvoice_enabled: settings.enabled?.toString(),
    einvoice_default_format: settings.defaultFormat,
    einvoice_auto_submit: settings.autoSubmit?.toString(),
    einvoice_send_email_notification: settings.sendEmailNotification?.toString(),
    einvoice_pdp_provider: settings.pdpProvider,
    einvoice_pdp_endpoint: settings.pdpEndpoint,
    einvoice_pdp_environment: settings.pdpEnvironment,
    einvoice_pdp_test_endpoint: settings.pdpTestEndpoint,
    einvoice_pdp_production_endpoint: settings.pdpProductionEndpoint,
    einvoice_pdp_login: settings.pdpLogin,
    company_siren: settings.companySiren,
  };

  for (const [key, value] of Object.entries(settingsMap)) {
    if (value !== undefined) {
      await db.runAsync(
        'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [key, value]
      );
    }
  }

  console.log('[EInvoiceProvider] Settings saved');
}
