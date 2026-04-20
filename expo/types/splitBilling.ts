export type AllocationMode = 'by_product' | 'percentage' | 'fixed' | 'equal';

export type SplitStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'cancelled';

export interface DocumentSplit {
  id: string;
  master_id: number;
  number_full: string;
  suffix: string;
  client_id: number;
  client_name?: string;
  client_company?: string;
  client_email?: string;
  allocation_mode: AllocationMode;
  allocation_value: number;
  total_ht: number;
  total_tva: number;
  total_ttc: number;
  status: SplitStatus;
  payment_ref?: string;
  payment_method?: string;
  paid_at?: string;
  sent_at?: string;
  pdf_path?: string;
  created_at: string;
  updated_at: string;
}

export interface SplitLineAssignment {
  id: string;
  split_id: string;
  line_item_id: number;
  product_id?: number;
  label?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  total_ht: number;
  allocation_percentage?: number;
}

export interface AllocationRuleSnapshot {
  id: string;
  master_id: number;
  mode: AllocationMode;
  parameters_json: string;
  computed_values_json: string;
  created_at: string;
}

export interface SplitClientInput {
  key: string;
  client_id: number | null;
  client?: {
    id: number;
    name: string;
    company?: string;
    email?: string;
  };
  allocation_mode: AllocationMode;
  allocation_value: string;
  assigned_line_keys: string[];
  computed_total_ht: number;
  computed_total_tva: number;
  computed_total_ttc: number;
}

export interface SplitBillingConfig {
  enabled: boolean;
  clients: SplitClientInput[];
}

export const ALLOCATION_MODE_LABELS: Record<AllocationMode, string> = {
  by_product: 'Par produit',
  percentage: 'Pourcentage (%)',
  fixed: 'Montant fixe (€)',
  equal: 'Parts égales',
};

export const SPLIT_STATUS_LABELS: Record<SplitStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  partial: 'Paiement partiel',
  paid: 'Payé',
  cancelled: 'Annulé',
};

export const SPLIT_STATUS_COLORS: Record<SplitStatus, string> = {
  draft: '#6B7280',
  sent: '#3B82F6',
  partial: '#F59E0B',
  paid: '#10B981',
  cancelled: '#EF4444',
};

export function generateSplitSuffix(index: number): string {
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  return String(index + 1).padStart(2, '0');
}

export function generateSplitNumber(masterNumber: string, index: number): string {
  const suffix = generateSplitSuffix(index);
  return `${masterNumber}-${suffix}`;
}

export function calculateSplitTotals(
  lineItems: {
    quantity: number;
    unit_price: number;
    tva_rate: number;
    discount_type: 'percent' | 'fixed';
    discount_value: number;
  }[],
  autoLiquidation: boolean
): { totalHt: number; totalTva: number; totalTtc: number } {
  let totalHt = 0;
  let totalTva = 0;

  for (const item of lineItems) {
    const baseHt = item.quantity * item.unit_price;
    let discountedHt = baseHt;

    if (item.discount_value > 0) {
      if (item.discount_type === 'percent') {
        discountedHt = baseHt * (1 - item.discount_value / 100);
      } else {
        discountedHt = baseHt - item.discount_value;
      }
    }

    const lineHt = Math.max(0, discountedHt);
    const lineTva = autoLiquidation ? 0 : lineHt * (item.tva_rate / 100);

    totalHt += lineHt;
    totalTva += lineTva;
  }

  return {
    totalHt: Math.round(totalHt * 100) / 100,
    totalTva: Math.round(totalTva * 100) / 100,
    totalTtc: Math.round((totalHt + totalTva) * 100) / 100,
  };
}

export function distributeRoundingError(
  splits: { total_ttc: number }[],
  masterTotal: number
): number[] {
  const splitTotals = splits.map(s => s.total_ttc);
  const sumOfSplits = splitTotals.reduce((sum, t) => sum + t, 0);
  const roundedSum = Math.round(sumOfSplits * 100) / 100;
  const roundedMaster = Math.round(masterTotal * 100) / 100;
  
  const difference = Math.round((roundedMaster - roundedSum) * 100) / 100;
  
  if (Math.abs(difference) < 0.01) {
    return splitTotals;
  }

  const maxIndex = splitTotals.reduce(
    (maxIdx, val, idx, arr) => (val > arr[maxIdx] ? idx : maxIdx),
    0
  );

  const adjustedTotals = [...splitTotals];
  adjustedTotals[maxIndex] = Math.round((adjustedTotals[maxIndex] + difference) * 100) / 100;

  return adjustedTotals;
}

export function validateSplitConfiguration(
  splits: SplitClientInput[],
  masterTotalTtc: number,
  lineItems: { key: string }[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (splits.length === 0) {
    errors.push('Au moins un client doit être associé');
    return { isValid: false, errors };
  }

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i];
    
    if (!split.client_id) {
      errors.push(`Client ${i + 1} : aucun client sélectionné`);
    }

    if (split.allocation_mode === 'by_product' && split.assigned_line_keys.length === 0) {
      errors.push(`Client ${i + 1} : aucun produit assigné`);
    }

    if (split.allocation_mode === 'percentage') {
      const pct = parseFloat(split.allocation_value) || 0;
      if (pct <= 0 || pct > 100) {
        errors.push(`Client ${i + 1} : pourcentage invalide (1-100)`);
      }
    }

    if (split.allocation_mode === 'fixed') {
      const amount = parseFloat(split.allocation_value) || 0;
      if (amount <= 0) {
        errors.push(`Client ${i + 1} : montant fixe invalide`);
      }
    }
  }

  if (splits.some(s => s.allocation_mode === 'by_product')) {
    const assignedKeys = new Set<string>();
    for (const split of splits) {
      if (split.allocation_mode === 'by_product') {
        for (const key of split.assigned_line_keys) {
          if (assignedKeys.has(key)) {
            errors.push('Un même produit ne peut pas être assigné à plusieurs clients en mode "Par produit"');
            break;
          }
          assignedKeys.add(key);
        }
      }
    }
  }

  const totalSplitTtc = splits.reduce((sum, s) => sum + s.computed_total_ttc, 0);
  const roundedTotal = Math.round(totalSplitTtc * 100) / 100;
  const roundedMaster = Math.round(masterTotalTtc * 100) / 100;
  
  if (Math.abs(roundedTotal - roundedMaster) > 0.01) {
    errors.push(`Le total réparti (${roundedTotal.toFixed(2)} €) diffère du total global (${roundedMaster.toFixed(2)} €)`);
  }

  return { isValid: errors.length === 0, errors };
}
