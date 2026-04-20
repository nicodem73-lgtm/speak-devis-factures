export type DepositMode = 'percent' | 'fixed';
export type DepositDistribution = 'equal' | 'custom';
export type InvoiceStage = 'deposit' | 'final';

export interface DepositInstallment {
  index: number;
  amount: number;
  percentage: number;
  dueDate?: string;
  isGenerated: boolean;
  invoiceId?: number;
  masterInvoiceId?: number;
}

export interface DepositConfig {
  enabled: boolean;
  mode: DepositMode;
  value: number;
  installmentCount: number;
  distribution: DepositDistribution;
  installments: DepositInstallment[];
}

export interface DepositPlan {
  quoteId: number;
  quoteNumber: string;
  quoteTotalTtc: number;
  quoteTotalHt: number;
  quoteTotalTva: number;
  config: DepositConfig;
  totalDepositAmount: number;
  remainingBalance: number;
  generatedInvoices: DepositInvoiceRef[];
}

export interface DepositInvoiceRef {
  invoiceId: number;
  invoiceNumber: string;
  billingRef: string;
  stage: InvoiceStage;
  installmentIndex?: number;
  amount: number;
  isMaster: boolean;
  splitInvoiceIds?: number[];
  clientIndex?: number;
  createdAt: string;
}

export interface DepositSplitAmount {
  clientId: number;
  clientIndex: number;
  totalClientTtc: number;
  depositAmount: number;
  soldeAmount: number;
}

export interface GenerateDepositResult {
  success: boolean;
  masterInvoiceId?: number;
  splitInvoiceIds: number[];
  directSplitInvoiceIds: number[];
  billingRef: string;
  error?: string;
}

export interface GenerateFinalResult {
  success: boolean;
  masterInvoiceId?: number;
  splitInvoiceIds: number[];
  directSplitInvoiceIds: number[];
  billingRef: string;
  deductions: DeductionLine[];
  error?: string;
}

export interface DeductionLine {
  description: string;
  invoiceNumber: string;
  invoiceId: number;
  amount: number;
}

export const DEPOSIT_MODE_LABELS: Record<DepositMode, string> = {
  percent: 'Pourcentage (%)',
  fixed: 'Montant fixe (€)',
};

export const DEPOSIT_DISTRIBUTION_LABELS: Record<DepositDistribution, string> = {
  equal: 'Répartition égale',
  custom: 'Répartition personnalisée',
};

export const DEFAULT_DEPOSIT_CONFIG: DepositConfig = {
  enabled: false,
  mode: 'percent',
  value: 30,
  installmentCount: 1,
  distribution: 'equal',
  installments: [],
};

export function calculateDepositTotal(
  totalTtc: number,
  mode: DepositMode,
  value: number
): number {
  if (mode === 'percent') {
    return Math.round(totalTtc * value / 100 * 100) / 100;
  }
  return Math.min(Math.round(value * 100) / 100, totalTtc);
}

export function calculateInstallments(
  totalDepositAmount: number,
  count: number,
  distribution: DepositDistribution,
  customAmounts?: number[]
): DepositInstallment[] {
  const installments: DepositInstallment[] = [];
  
  if (distribution === 'equal' || !customAmounts || customAmounts.length !== count) {
    const baseAmount = Math.floor(totalDepositAmount / count * 100) / 100;
    let remaining = Math.round((totalDepositAmount - baseAmount * count) * 100) / 100;
    
    for (let i = 0; i < count; i++) {
      let amount = baseAmount;
      if (remaining > 0 && i === 0) {
        amount = Math.round((baseAmount + remaining) * 100) / 100;
        remaining = 0;
      }
      
      installments.push({
        index: i + 1,
        amount,
        percentage: Math.round(amount / totalDepositAmount * 100 * 100) / 100,
        isGenerated: false,
      });
    }
  } else {
    for (let i = 0; i < count; i++) {
      installments.push({
        index: i + 1,
        amount: customAmounts[i],
        percentage: Math.round(customAmounts[i] / totalDepositAmount * 100 * 100) / 100,
        isGenerated: false,
      });
    }
  }
  
  return installments;
}

export function calculateRatioForInstallment(
  installmentAmount: number,
  totalDevis: number
): number {
  if (totalDevis === 0) return 0;
  return installmentAmount / totalDevis;
}

export function calculateClientDepositAmount(
  clientTotalTtc: number,
  ratio: number
): number {
  return Math.round(clientTotalTtc * ratio * 100) / 100;
}

export function distributeDepositRoundingError(
  clientAmounts: { clientId: number; amount: number; totalTtc: number }[],
  targetTotal: number
): { clientId: number; adjustedAmount: number }[] {
  const currentSum = clientAmounts.reduce((sum, c) => sum + c.amount, 0);
  const roundedSum = Math.round(currentSum * 100) / 100;
  const roundedTarget = Math.round(targetTotal * 100) / 100;
  const difference = Math.round((roundedTarget - roundedSum) * 100) / 100;
  
  if (Math.abs(difference) < 0.01) {
    return clientAmounts.map(c => ({ clientId: c.clientId, adjustedAmount: c.amount }));
  }
  
  const sorted = [...clientAmounts].sort((a, b) => {
    if (b.totalTtc !== a.totalTtc) return b.totalTtc - a.totalTtc;
    return a.clientId - b.clientId;
  });
  
  return clientAmounts.map(c => {
    if (c.clientId === sorted[0].clientId) {
      return { clientId: c.clientId, adjustedAmount: Math.round((c.amount + difference) * 100) / 100 };
    }
    return { clientId: c.clientId, adjustedAmount: c.amount };
  });
}

export function generateBillingRef(
  quoteNumber: string,
  stage: InvoiceStage,
  installmentIndex?: number,
  isMaster?: boolean,
  clientIndex?: number,
  isDirect?: boolean
): string {
  const stageCode = stage === 'deposit' 
    ? `AC${String(installmentIndex || 1).padStart(2, '0')}`
    : 'SOLDE';
  
  if (isMaster) {
    return `${quoteNumber}-${stageCode}-M`;
  }
  
  if (isDirect) {
    return `${quoteNumber}-${stageCode}-D-C${String(clientIndex || 1).padStart(3, '0')}`;
  }
  
  return `${quoteNumber}-${stageCode}-C${String(clientIndex || 1).padStart(3, '0')}`;
}

export function validateDepositConfig(
  config: DepositConfig,
  totalTtc: number
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!config.enabled) {
    return { isValid: true, errors: [] };
  }
  
  if (config.value <= 0) {
    errors.push('Le montant de l\'acompte doit être supérieur à 0');
  }
  
  if (config.mode === 'percent' && config.value > 100) {
    errors.push('Le pourcentage ne peut pas dépasser 100%');
  }
  
  if (config.mode === 'fixed' && config.value > totalTtc) {
    errors.push('Le montant de l\'acompte ne peut pas dépasser le total du devis');
  }
  
  if (config.installmentCount < 1 || config.installmentCount > 12) {
    errors.push('Le nombre d\'échéances doit être entre 1 et 12');
  }
  
  if (config.distribution === 'custom' && config.installments.length > 0) {
    const totalInstallments = config.installments.reduce((sum, i) => sum + i.amount, 0);
    const expectedTotal = calculateDepositTotal(totalTtc, config.mode, config.value);
    
    if (Math.abs(totalInstallments - expectedTotal) > 0.01) {
      errors.push(`La somme des échéances (${totalInstallments.toFixed(2)} €) doit égaler le total de l'acompte (${expectedTotal.toFixed(2)} €)`);
    }
  }
  
  return { isValid: errors.length === 0, errors };
}

export function canGenerateDeposit(
  quoteStatus: string,
  installment: DepositInstallment
): boolean {
  return quoteStatus === 'accepted' && !installment.isGenerated;
}

export function canGenerateFinal(
  quoteStatus: string,
  depositPlan: DepositPlan
): boolean {
  if (quoteStatus !== 'accepted') return false;
  
  const hasDeposits = depositPlan.config.enabled && depositPlan.config.installmentCount > 0;
  if (!hasDeposits) return true;
  
  const allDepositsGenerated = depositPlan.config.installments.every(i => i.isGenerated);
  const finalNotGenerated = !depositPlan.generatedInvoices.some(inv => inv.stage === 'final');
  
  return allDepositsGenerated && finalNotGenerated;
}

export function calculateSolde(
  clientTotalTtc: number,
  generatedDepositAmounts: number[]
): number {
  const totalDeposits = generatedDepositAmounts.reduce((sum, a) => sum + a, 0);
  const solde = Math.round((clientTotalTtc - totalDeposits) * 100) / 100;
  return Math.max(0, solde);
}
