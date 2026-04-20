export type DeliveryNoteStatus = 'Brouillon' | 'Envoyé';

export interface DeliveryNote {
  id: string;
  number: string;
  status: DeliveryNoteStatus;
  created_at: string;
  sent_at?: string;
  invoice_id: number;
  invoice_number?: string;
  total_weight_kg: number;
  ship_to_name: string;
  ship_to_address: string;
  ship_to_phone?: string;
  ship_from_name: string;
  ship_from_address: string;
  ship_from_phone?: string;
  label_pdf_path?: string;
  invoice_pdf_path?: string;
  bundle_pdf_path?: string;
}

export interface DeliveryNoteLine {
  id: string;
  delivery_note_id: string;
  product_id?: number;
  label: string;
  qty: number;
  unit: string;
  unit_weight_kg?: number;
  line_weight_kg: number;
}

export interface DeliveryNoteLineInput {
  product_id?: number;
  label: string;
  qty: number;
  unit: string;
  unit_weight_kg?: number;
  line_weight_kg: number;
}

export interface DeliveryNoteFormData {
  invoice_id: number | null;
  ship_to_name: string;
  ship_to_address: string;
  ship_to_phone: string;
  ship_from_name: string;
  ship_from_address: string;
  ship_from_phone: string;
  lines: DeliveryNoteLineInput[];
}

export const emptyDeliveryNoteForm: DeliveryNoteFormData = {
  invoice_id: null,
  ship_to_name: '',
  ship_to_address: '',
  ship_to_phone: '',
  ship_from_name: '',
  ship_from_address: '',
  ship_from_phone: '',
  lines: [],
};

export const DELIVERY_NOTE_STATUS_LABELS: Record<DeliveryNoteStatus, string> = {
  'Brouillon': 'Brouillon',
  'Envoyé': 'Envoyé',
};

export function calculateTotalWeight(lines: DeliveryNoteLineInput[]): number {
  return lines.reduce((sum, line) => sum + (line.line_weight_kg || 0), 0);
}

export function calculateLineWeight(qty: number, unitWeight?: number): number {
  if (!unitWeight || unitWeight <= 0) return 0;
  return qty * unitWeight;
}

export function formatWeight(weightKg: number): string {
  if (weightKg >= 1000) {
    return `${(weightKg / 1000).toFixed(2)} t`;
  }
  if (weightKg >= 1) {
    return `${weightKg.toFixed(2)} kg`;
  }
  return `${(weightKg * 1000).toFixed(0)} g`;
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}
