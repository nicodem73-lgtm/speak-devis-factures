import { LineItemInput, DiscountType } from '@/types/document';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  errorMap: Record<string, string>;
}

export function validateAmount(value: number | string, fieldName: string = 'montant'): ValidationError | null {
  const numValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  
  if (isNaN(numValue)) {
    return { field: fieldName, message: `${fieldName} doit être un nombre valide` };
  }
  
  if (numValue < 0) {
    return { field: fieldName, message: `${fieldName} ne peut pas être négatif` };
  }
  
  if (!isFinite(numValue)) {
    return { field: fieldName, message: `${fieldName} invalide` };
  }
  
  return null;
}

export function validateTVARate(rate: number | string): ValidationError | null {
  const numRate = typeof rate === 'string' ? parseFloat(rate.replace(',', '.')) : rate;
  
  if (isNaN(numRate)) {
    return { field: 'tva_rate', message: 'Taux TVA doit être un nombre' };
  }
  
  if (numRate < 0) {
    return { field: 'tva_rate', message: 'Taux TVA ne peut pas être négatif' };
  }
  
  if (numRate > 100) {
    return { field: 'tva_rate', message: 'Taux TVA ne peut pas dépasser 100%' };
  }
  
  return null;
}

export function validateQuantity(quantity: number | string): ValidationError | null {
  const numQty = typeof quantity === 'string' ? parseFloat(quantity.replace(',', '.')) : quantity;
  
  if (isNaN(numQty)) {
    return { field: 'quantity', message: 'Quantité doit être un nombre' };
  }
  
  if (numQty <= 0) {
    return { field: 'quantity', message: 'Quantité doit être supérieure à 0' };
  }
  
  return null;
}

export function validateDiscount(
  type: DiscountType,
  value: number | string,
  maxAmount?: number
): ValidationError | null {
  const numValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
  
  if (isNaN(numValue) || numValue < 0) {
    return { field: 'discount', message: 'Remise invalide' };
  }
  
  if (type === 'percent' && numValue > 100) {
    return { field: 'discount', message: 'Remise en % ne peut pas dépasser 100%' };
  }
  
  if (type === 'fixed' && maxAmount !== undefined && numValue > maxAmount) {
    return { field: 'discount', message: 'Remise ne peut pas dépasser le montant total' };
  }
  
  return null;
}

export function validateLineItem(item: LineItemInput, index: number): ValidationError[] {
  const errors: ValidationError[] = [];
  const prefix = `line_${index}`;
  
  if (!item.label?.trim() && !item.description?.trim()) {
    errors.push({ field: `${prefix}_label`, message: `Ligne ${index + 1}: Libellé ou description requis` });
  }
  
  const qtyError = validateQuantity(item.quantity);
  if (qtyError) {
    errors.push({ field: `${prefix}_quantity`, message: `Ligne ${index + 1}: ${qtyError.message}` });
  }
  
  const priceError = validateAmount(item.unit_price, 'Prix unitaire');
  if (priceError) {
    errors.push({ field: `${prefix}_unit_price`, message: `Ligne ${index + 1}: ${priceError.message}` });
  }
  
  const tvaError = validateTVARate(item.tva_rate);
  if (tvaError) {
    errors.push({ field: `${prefix}_tva_rate`, message: `Ligne ${index + 1}: ${tvaError.message}` });
  }
  
  if (item.discount_value > 0) {
    const discountError = validateDiscount(
      item.discount_type,
      item.discount_value,
      item.quantity * item.unit_price
    );
    if (discountError) {
      errors.push({ field: `${prefix}_discount`, message: `Ligne ${index + 1}: ${discountError.message}` });
    }
  }
  
  return errors;
}

export function validateDate(dateString: string, fieldName: string = 'date'): ValidationError | null {
  if (!dateString) {
    return null;
  }
  
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateString)) {
    return { field: fieldName, message: `Format de date invalide (AAAA-MM-JJ)` };
  }
  
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return { field: fieldName, message: `Date invalide` };
  }
  
  return null;
}

export function validateDocumentForm(data: {
  number: string;
  client_id: number | null;
  date: string;
  due_date?: string;
  line_items: LineItemInput[];
  global_discount_type: DiscountType;
  global_discount_value: number;
}): ValidationResult {
  const errors: ValidationError[] = [];
  
  if (!data.number.trim()) {
    errors.push({ field: 'number', message: 'Numéro de document requis' });
  }
  
  if (!data.client_id) {
    errors.push({ field: 'client_id', message: 'Client requis' });
  }
  
  const dateError = validateDate(data.date, 'date');
  if (dateError) {
    errors.push(dateError);
  } else if (!data.date) {
    errors.push({ field: 'date', message: 'Date requise' });
  }
  
  if (data.due_date) {
    const dueDateError = validateDate(data.due_date, 'due_date');
    if (dueDateError) {
      errors.push(dueDateError);
    } else if (data.date && data.due_date < data.date) {
      errors.push({ field: 'due_date', message: "L'échéance ne peut pas être antérieure à la date" });
    }
  }
  
  if (data.line_items.length === 0) {
    errors.push({ field: 'line_items', message: 'Au moins une ligne est requise' });
  }
  
  data.line_items.forEach((item, index) => {
    const lineErrors = validateLineItem(item, index);
    errors.push(...lineErrors);
  });
  
  const totalHt = data.line_items.reduce((sum, item) => {
    const baseHt = item.quantity * item.unit_price;
    if (item.discount_type === 'percent') {
      return sum + baseHt * (1 - item.discount_value / 100);
    }
    return sum + baseHt - item.discount_value;
  }, 0);
  
  if (data.global_discount_value > 0) {
    const globalDiscountError = validateDiscount(
      data.global_discount_type,
      data.global_discount_value,
      totalHt
    );
    if (globalDiscountError) {
      errors.push({ field: 'global_discount', message: globalDiscountError.message });
    }
  }
  
  const errorMap: Record<string, string> = {};
  errors.forEach((error) => {
    if (!errorMap[error.field]) {
      errorMap[error.field] = error.message;
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    errorMap,
  };
}

export function validateEmail(email: string): boolean {
  if (!email) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePhone(phone: string): boolean {
  if (!phone) return true;
  const cleanPhone = phone.replace(/[\s\-.()]/g, '');
  return /^(\+?\d{1,3})?\d{9,14}$/.test(cleanPhone);
}

export function validateSIRET(siret: string): boolean {
  if (!siret) return true;
  const cleanSiret = siret.replace(/\s/g, '');
  return /^\d{14}$/.test(cleanSiret);
}

export function validateIBAN(iban: string): boolean {
  if (!iban) return true;
  const cleanIban = iban.replace(/\s/g, '').toUpperCase();
  return /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/.test(cleanIban);
}

export function validateTVANumber(tvaNumber: string): boolean {
  if (!tvaNumber) return true;
  const cleanTva = tvaNumber.replace(/\s/g, '').toUpperCase();
  return /^FR\d{11}$/.test(cleanTva);
}

export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) return '';
  if (errors.length === 1) return errors[0].message;
  return errors.map((e) => `• ${e.message}`).join('\n');
}

export function getFirstError(errors: ValidationError[]): string | null {
  return errors.length > 0 ? errors[0].message : null;
}
