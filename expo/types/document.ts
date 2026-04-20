export type DocumentType = 'devis' | 'facture';

export type DocumentSubType = 'invoice' | 'credit_note';

export type DocumentStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'paid' | 'cancelled';

export type DiscountType = 'percent' | 'fixed';

export interface Document {
  id: number;
  type: DocumentType;
  document_subtype?: DocumentSubType;
  number: string;
  client_id: number;
  client_name?: string;
  client_company?: string;
  status: DocumentStatus;
  date: string;
  due_date?: string;
  sent_at?: string;
  paid_at?: string;
  payment_method?: string;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  global_discount_type: DiscountType;
  global_discount_value: number;
  auto_liquidation: number;
  notes?: string;
  conditions?: string;
  legal_mentions?: string;
  dossier?: string;
  objet?: string;
  source_devis_id?: number;
  original_invoice_id?: number;
  credit_note_reason?: string;
  is_einvoice?: number;
  einvoice_status?: string;
  split_count?: number;
  created_at: string;
  updated_at: string;
}

export interface LineItem {
  id: number;
  document_id: number;
  product_id?: number;
  label?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  discount_type: DiscountType;
  discount_value: number;
  total_ht: number;
  image_url?: string;
  created_at: string;
}

export interface LineItemInput {
  product_id?: number;
  label?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  discount_type: DiscountType;
  discount_value: number;
  image_url?: string;
}

export interface DocumentFormData {
  type: DocumentType;
  number: string;
  client_id: number | null;
  date: string;
  due_date: string;
  global_discount_type: DiscountType;
  global_discount_value: number;
  auto_liquidation: boolean;
  notes: string;
  conditions: string;
  legal_mentions: string;
  dossier: string;
  objet: string;
  line_items: LineItemInput[];
}

export const emptyDocumentForm: DocumentFormData = {
  type: 'devis',
  number: '',
  client_id: null,
  date: new Date().toISOString().split('T')[0],
  due_date: '',
  global_discount_type: 'percent',
  global_discount_value: 0,
  auto_liquidation: false,
  notes: '',
  conditions: '',
  legal_mentions: '',
  dossier: '',
  objet: '',
  line_items: [],
};

export function calculateLineTotal(item: LineItemInput): { ht: number; tva: number } {
  const baseHt = item.quantity * item.unit_price;
  let discountedHt = baseHt;
  
  if (item.discount_value > 0) {
    if (item.discount_type === 'percent') {
      discountedHt = baseHt * (1 - item.discount_value / 100);
    } else {
      discountedHt = baseHt - item.discount_value;
    }
  }
  
  const tva = discountedHt * (item.tva_rate / 100);
  return { ht: discountedHt, tva };
}

export function calculateDocumentTotals(
  lineItems: LineItemInput[],
  globalDiscountType: DiscountType,
  globalDiscountValue: number,
  autoLiquidation: boolean
): { totalHt: number; totalTva: number; totalTtc: number; discountAmount: number } {
  let subtotalHt = 0;
  let subtotalTva = 0;
  
  for (const item of lineItems) {
    const { ht, tva } = calculateLineTotal(item);
    subtotalHt += ht;
    subtotalTva += tva;
  }
  
  let discountAmount = 0;
  if (globalDiscountValue > 0) {
    if (globalDiscountType === 'percent') {
      discountAmount = subtotalHt * (globalDiscountValue / 100);
    } else {
      discountAmount = globalDiscountValue;
    }
  }
  
  const totalHt = Math.max(0, subtotalHt - discountAmount);
  const totalTva = autoLiquidation ? 0 : (subtotalTva * (1 - discountAmount / (subtotalHt || 1)));
  const totalTtc = totalHt + totalTva;
  
  return {
    totalHt,
    totalTva: Math.max(0, totalTva),
    totalTtc,
    discountAmount,
  };
}

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  accepted: 'Accepté',
  rejected: 'Refusé',
  paid: 'Payé',
  cancelled: 'Annulé',
};

export const TYPE_LABELS: Record<DocumentType, string> = {
  devis: 'Devis',
  facture: 'Facture',
};

export const SUBTYPE_LABELS: Record<DocumentSubType, string> = {
  invoice: 'Facture',
  credit_note: 'Avoir',
};

export function getDocumentDisplayType(doc: Document): string {
  if (doc.type === 'facture' && doc.document_subtype === 'credit_note') {
    return 'Avoir';
  }
  if (doc.type === 'facture' && (doc.split_count ?? 0) > 0) {
    return 'Factures multiples';
  }
  if (doc.type === 'facture' && doc.is_einvoice === 1) {
    return 'E-facture';
  }
  return TYPE_LABELS[doc.type];
}

export function isCreditNote(doc: Document): boolean {
  return doc.type === 'facture' && doc.document_subtype === 'credit_note';
}

export function isOverdue(document: Document): boolean {
  if (document.status === 'paid' || document.status === 'cancelled') return false;
  if (!document.due_date) return false;
  const dueDate = new Date(document.due_date);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return dueDate < today;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
