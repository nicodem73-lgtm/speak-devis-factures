import * as SQLite from 'expo-sqlite';
import {
  EInvoiceEnvelope,
  EInvoiceStatus,
  EInvoiceFormat,
  EInvoiceSettings,
  generateUUID,
  nowISO,
  calculateSHA256,
} from '@/types/einvoice';
import {
  createEInvoiceEnvelope,
  getEInvoiceEnvelopeById,
  getEInvoiceEnvelopeByInvoiceId,
  updateEInvoiceEnvelopeStatus,
  updateEInvoiceEnvelope,
  createStatusEvent,
  createAuditLog,
  updateDocumentEInvoiceFields,
  lockDocument,
  isDocumentLocked,
  addToSyncOutbox,
} from '@/db/einvoice';
import { getDocumentById, getLineItemsByDocumentId } from '@/db/documents';
import { generateFacturXML } from './facturx';

export interface EInvoicingServiceConfig {
  db: SQLite.SQLiteDatabase;
  settings: EInvoiceSettings;
  companyInfo: {
    name: string;
    siret?: string;
    siren?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    email?: string;
    tvaNumber?: string;
  };
}

export class EInvoicingService {
  private db: SQLite.SQLiteDatabase;
  private settings: EInvoiceSettings;
  private companyInfo: EInvoicingServiceConfig['companyInfo'];

  constructor(config: EInvoicingServiceConfig) {
    this.db = config.db;
    this.settings = config.settings;
    this.companyInfo = config.companyInfo;
    console.log('[EInvoicingService] Initialized');
  }

  async issueInvoice(invoiceId: number): Promise<EInvoiceEnvelope | null> {
    console.log('[EInvoicingService] Issuing invoice:', invoiceId);

    const document = await getDocumentById(this.db, invoiceId);
    if (!document) {
      console.error('[EInvoicingService] Document not found:', invoiceId);
      return null;
    }

    if (document.type !== 'facture') {
      console.error('[EInvoicingService] Document is not a facture:', invoiceId);
      return null;
    }

    if (document.status !== 'draft') {
      console.log('[EInvoicingService] Document already issued, skipping:', invoiceId);
      const envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);
      return envelope;
    }

    const now = nowISO();

    await this.db.runAsync(
      `UPDATE documents SET status = 'sent', einvoice_status = 'issued', issued_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [now, invoiceId]
    );

    let envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);

    if (!envelope) {
      envelope = await createEInvoiceEnvelope(this.db, {
        invoice_id: invoiceId,
        format: this.settings.defaultFormat,
        direction: 'outbound',
        status: 'issued',
        provider: this.settings.pdpProvider || 'mock',
      });
    } else {
      await updateEInvoiceEnvelopeStatus(this.db, envelope.id, 'issued');
      envelope = await getEInvoiceEnvelopeById(this.db, envelope.id);
    }

    await createStatusEvent(this.db, {
      envelope_id: envelope!.id,
      status: 'issued',
      message: 'Facture émise - numéro figé',
      payload: { invoice_number: document.number, issued_at: now },
    });

    await createAuditLog(this.db, {
      action: 'issue',
      entity_type: 'document',
      entity_id: String(invoiceId),
      new_value: JSON.stringify({ status: 'issued', issued_at: now }),
    });

    await addToSyncOutbox(this.db, 'document', String(invoiceId), 'update', {
      status: 'issued',
      issued_at: now,
    });

    console.log('[EInvoicingService] Invoice issued successfully:', invoiceId);
    return envelope;
  }

  async prepareEInvoice(
    invoiceId: number,
    format: EInvoiceFormat = 'facturx'
  ): Promise<EInvoiceEnvelope | null> {
    console.log('[EInvoicingService] Preparing e-invoice:', invoiceId, format);

    const document = await getDocumentById(this.db, invoiceId);
    if (!document) {
      console.error('[EInvoicingService] Document not found:', invoiceId);
      return null;
    }

    const lineItems = await getLineItemsByDocumentId(this.db, invoiceId);

    let envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);

    if (!envelope) {
      envelope = await createEInvoiceEnvelope(this.db, {
        invoice_id: invoiceId,
        format,
        direction: 'outbound',
        status: 'draft',
        provider: this.settings.pdpProvider || 'mock',
      });
    }

    const xmlContent = generateFacturXML({
      invoiceNumber: document.number,
      issueDate: document.date,
      dueDate: document.due_date,
      seller: {
        name: this.companyInfo.name,
        siret: this.companyInfo.siret,
        siren: this.companyInfo.siren,
        address: this.companyInfo.address,
        city: this.companyInfo.city,
        postalCode: this.companyInfo.postalCode,
        country: 'FR',
        email: this.companyInfo.email,
        vatNumber: this.companyInfo.tvaNumber,
      },
      buyer: {
        name: document.client_company || document.client_name || 'Client',
        address: '',
        city: '',
        postalCode: '',
        country: 'FR',
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
        totalHT: document.total_ht,
        totalVAT: document.total_tva,
        totalTTC: document.total_ttc,
      },
      paymentTerms: document.conditions,
      notes: document.notes,
    });

    const checksum = await calculateSHA256(xmlContent);

    const filePath = `einvoice_${invoiceId}_${Date.now()}.xml`;

    await updateEInvoiceEnvelope(this.db, envelope.id, {
      format,
      xml_content: xmlContent,
      checksum,
      file_path: filePath,
    });

    await updateEInvoiceEnvelopeStatus(this.db, envelope.id, 'prepared');

    await updateDocumentEInvoiceFields(this.db, invoiceId, {
      einvoice_format: format,
      einvoice_file_path: filePath,
      einvoice_checksum: checksum,
      einvoice_status: 'prepared',
    });

    await createStatusEvent(this.db, {
      envelope_id: envelope.id,
      status: 'prepared',
      message: `Factur-X généré (${format})`,
      payload: { format, checksum, file_path: filePath },
    });

    await addToSyncOutbox(this.db, 'e_invoice_envelope', envelope.id, 'update', {
      status: 'prepared',
      format,
      checksum,
    });

    console.log('[EInvoicingService] E-invoice prepared:', invoiceId, checksum);
    
    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelope.id);
    return updatedEnvelope;
  }

  async submitEInvoice(invoiceId: number): Promise<EInvoiceEnvelope | null> {
    console.log('[EInvoicingService] Submitting e-invoice:', invoiceId);

    const document = await getDocumentById(this.db, invoiceId);
    if (!document) {
      console.error('[EInvoicingService] Document not found:', invoiceId);
      return null;
    }

    let envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);

    if (!envelope || envelope.status === 'draft') {
      envelope = await this.prepareEInvoice(invoiceId);
      if (!envelope) {
        console.error('[EInvoicingService] Failed to prepare e-invoice');
        return null;
      }
    }

    const now = nowISO();
    const providerMessageId = `MSG-${generateUUID().substring(0, 12).toUpperCase()}`;
    const pdpProvider = this.settings.pdpProvider || 'mock';

    await this.db.runAsync(
      `UPDATE e_invoice_envelopes SET 
        status = 'submitted', 
        submitted_at = ?, 
        provider_message_id = ?,
        provider = ?,
        updated_at = ?
       WHERE id = ?`,
      [now, providerMessageId, pdpProvider, now, envelope.id]
    );

    await updateDocumentEInvoiceFields(this.db, invoiceId, {
      einvoice_status: 'submitted',
      submitted_at: now,
      pdp_provider: pdpProvider,
      pdp_message_id: providerMessageId,
      locked: 1,
    });

    await lockDocument(this.db, invoiceId);

    await createStatusEvent(this.db, {
      envelope_id: envelope.id,
      status: 'submitted',
      message: `Transmise via ${pdpProvider}`,
      payload: { 
        provider: pdpProvider, 
        provider_message_id: providerMessageId,
        submitted_at: now,
      },
    });

    await createAuditLog(this.db, {
      action: 'submit',
      entity_type: 'e_invoice_envelope',
      entity_id: envelope.id,
      new_value: JSON.stringify({ 
        status: 'submitted', 
        provider: pdpProvider,
        provider_message_id: providerMessageId,
      }),
    });

    await addToSyncOutbox(this.db, 'e_invoice_envelope', envelope.id, 'update', {
      status: 'submitted',
      submitted_at: now,
      provider: pdpProvider,
      provider_message_id: providerMessageId,
    });

    console.log('[EInvoicingService] E-invoice submitted:', invoiceId, providerMessageId);
    
    const updatedEnvelope = await getEInvoiceEnvelopeById(this.db, envelope.id);
    return updatedEnvelope;
  }

  async markDelivered(envelopeId: string, message?: string): Promise<void> {
    console.log('[EInvoicingService] Marking as delivered:', envelopeId);

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      console.error('[EInvoicingService] Envelope not found:', envelopeId);
      return;
    }

    const now = nowISO();

    await this.db.runAsync(
      `UPDATE e_invoice_envelopes SET status = 'delivered', delivered_at = ?, updated_at = ? WHERE id = ?`,
      [now, now, envelopeId]
    );

    await updateDocumentEInvoiceFields(this.db, envelope.invoice_id, {
      einvoice_status: 'delivered',
    });

    await createStatusEvent(this.db, {
      envelope_id: envelopeId,
      status: 'delivered',
      message: message || 'Facture délivrée à la PDP du destinataire',
      payload: { delivered_at: now },
    });
  }

  async markAccepted(envelopeId: string, message?: string): Promise<void> {
    console.log('[EInvoicingService] Marking as accepted:', envelopeId);

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      console.error('[EInvoicingService] Envelope not found:', envelopeId);
      return;
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelopeId, 'accepted');

    await updateDocumentEInvoiceFields(this.db, envelope.invoice_id, {
      einvoice_status: 'accepted',
    });

    await createStatusEvent(this.db, {
      envelope_id: envelopeId,
      status: 'accepted',
      message: message || 'Facture acceptée par le destinataire',
    });
  }

  async markRejected(envelopeId: string, reason: string): Promise<void> {
    console.log('[EInvoicingService] Marking as rejected:', envelopeId, reason);

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      console.error('[EInvoicingService] Envelope not found:', envelopeId);
      return;
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelopeId, 'rejected', reason);

    await updateDocumentEInvoiceFields(this.db, envelope.invoice_id, {
      einvoice_status: 'rejected',
    });

    await createStatusEvent(this.db, {
      envelope_id: envelopeId,
      status: 'rejected',
      message: reason,
      payload: { rejection_reason: reason },
    });
  }

  async markPaid(envelopeId: string, message?: string): Promise<void> {
    console.log('[EInvoicingService] Marking as paid:', envelopeId);

    const envelope = await getEInvoiceEnvelopeById(this.db, envelopeId);
    if (!envelope) {
      console.error('[EInvoicingService] Envelope not found:', envelopeId);
      return;
    }

    await updateEInvoiceEnvelopeStatus(this.db, envelopeId, 'paid');

    await this.db.runAsync(
      `UPDATE documents SET status = 'paid', einvoice_status = 'paid', paid_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [nowISO(), envelope.invoice_id]
    );

    await createStatusEvent(this.db, {
      envelope_id: envelopeId,
      status: 'paid',
      message: message || 'Facture payée',
    });
  }

  async canEditDocument(documentId: number): Promise<{ canEdit: boolean; reason?: string }> {
    const locked = await isDocumentLocked(this.db, documentId);
    
    if (locked) {
      return {
        canEdit: false,
        reason: 'Facture transmise via la PDP : modification impossible. Utilisez Annuler/Avoir.',
      };
    }

    return { canEdit: true };
  }

  async getEnvelopeStatus(invoiceId: number): Promise<EInvoiceStatus | null> {
    const envelope = await getEInvoiceEnvelopeByInvoiceId(this.db, invoiceId);
    return envelope?.status || null;
  }
}

export function createEInvoicingService(config: EInvoicingServiceConfig): EInvoicingService {
  return new EInvoicingService(config);
}
