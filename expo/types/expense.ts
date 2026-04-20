export type ExpenseCategory = 
  | 'restaurant'
  | 'carburant'
  | 'fourniture'
  | 'loyer'
  | 'peages'
  | 'parkings'
  | 'assurance'
  | 'entretien'
  | 'deplacement'
  | 'internet'
  | 'mobile'
  | 'foire'
  | 'formations'
  | 'divers';

export interface ExpenseCategoryInfo {
  id: ExpenseCategory;
  label: string;
  icon: string;
  color: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryInfo[] = [
  { id: 'restaurant', label: 'Restaurant', icon: 'UtensilsCrossed', color: '#F97316' },
  { id: 'carburant', label: 'Carburant', icon: 'Fuel', color: '#EF4444' },
  { id: 'fourniture', label: 'Fourniture', icon: 'Package', color: '#8B5CF6' },
  { id: 'loyer', label: 'Loyer', icon: 'Home', color: '#06B6D4' },
  { id: 'peages', label: 'Péages', icon: 'Route', color: '#64748B' },
  { id: 'parkings', label: 'Parkings', icon: 'ParkingCircle', color: '#3B82F6' },
  { id: 'assurance', label: 'Assurance', icon: 'Shield', color: '#10B981' },
  { id: 'entretien', label: 'Entretien', icon: 'Wrench', color: '#F59E0B' },
  { id: 'deplacement', label: 'Frais de déplacement', icon: 'Car', color: '#EC4899' },
  { id: 'internet', label: 'Internet', icon: 'Wifi', color: '#6366F1' },
  { id: 'mobile', label: 'Forfait mobile', icon: 'Smartphone', color: '#14B8A6' },
  { id: 'foire', label: 'Foire', icon: 'Store', color: '#A855F7' },
  { id: 'formations', label: 'Formations', icon: 'GraduationCap', color: '#0EA5E9' },
  { id: 'divers', label: 'Divers', icon: 'MoreHorizontal', color: '#78716C' },
];

export interface Expense {
  id: number;
  establishment: string;
  amount_ttc: number;
  amount_tva: number;
  amount_ttc_cents: number;
  amount_tva_cents: number;
  tva_rate: number;
  date: string;
  category: ExpenseCategory;
  photo_uri?: string;
  ocr_text?: string;
  notes?: string;
  is_recurring: number;
  recurring_start_date?: string;
  recurring_end_date?: string;
  recurring_day?: number;
  recurring_parent_id?: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface ExpenseFormData {
  establishment: string;
  amount_ttc: number;
  amount_tva: number;
  tva_rate: number;
  date: string;
  category: ExpenseCategory;
  photo_uri?: string;
  ocr_text?: string;
  notes?: string;
  is_recurring?: boolean;
  recurring_start_date?: string;
  recurring_end_date?: string;
}

export interface ExpenseFilter {
  startDate: string;
  endDate: string;
}

export interface ExpenseTotals {
  totalTTC: number;
  totalTVA: number;
}
