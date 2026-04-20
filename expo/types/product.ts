export interface Product {
  id: number;
  name: string;
  description?: string;
  unit_price: number;
  unit: string;
  tva_rate: number;
  is_service: number;
  created_at: string;
  updated_at: string;
}

export interface ProductFormData {
  name: string;
  description: string;
  unit_price: string;
  unit: string;
  tva_rate: string;
  is_service: boolean;
}

export const emptyProductForm: ProductFormData = {
  name: '',
  description: '',
  unit_price: '',
  unit: 'unité',
  tva_rate: '20',
  is_service: false,
};

export const UNIT_OPTIONS = [
  { label: 'Unité', value: 'unité' },
  { label: 'Heure', value: 'heure' },
  { label: 'Jour', value: 'jour' },
  { label: 'Mois', value: 'mois' },
  { label: 'Forfait', value: 'forfait' },
  { label: 'Kg', value: 'kg' },
  { label: 'M²', value: 'm²' },
  { label: 'Mètre', value: 'mètre' },
];

export const TVA_OPTIONS = [
  { label: '20%', value: '20' },
  { label: '10%', value: '10' },
  { label: '5.5%', value: '5.5' },
  { label: '2.1%', value: '2.1' },
  { label: '0%', value: '0' },
];

export function validateProductForm(data: ProductFormData): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.name.trim()) {
    errors.name = 'Le nom est requis';
  }

  if (!data.unit_price.trim()) {
    errors.unit_price = 'Le prix est requis';
  } else {
    const price = parseFloat(data.unit_price.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      errors.unit_price = 'Prix invalide';
    }
  }

  const tva = parseFloat(data.tva_rate);
  if (isNaN(tva) || tva < 0 || tva > 100) {
    errors.tva_rate = 'Taux TVA invalide';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function formatPrice(price: number, currency: string = '€'): string {
  return `${price.toFixed(2).replace('.', ',')} ${currency}`;
}

export function productToFormData(product: Product): ProductFormData {
  return {
    name: product.name,
    description: product.description || '',
    unit_price: product.unit_price.toString().replace('.', ','),
    unit: product.unit,
    tva_rate: product.tva_rate.toString(),
    is_service: product.is_service === 1,
  };
}
