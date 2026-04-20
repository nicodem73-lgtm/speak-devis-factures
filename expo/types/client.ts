export interface Client {
  id: number;
  name: string;
  company?: string;
  siret?: string;
  tva_number?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  postal_code?: string;
  country?: string;
  delivery_address?: string;
  delivery_city?: string;
  delivery_postal_code?: string;
  delivery_country?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientFormData {
  name: string;
  company: string;
  siret: string;
  tva_number: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
  delivery_address: string;
  delivery_city: string;
  delivery_postal_code: string;
  delivery_country: string;
  notes: string;
}

export const emptyClientForm: ClientFormData = {
  name: '',
  company: '',
  siret: '',
  tva_number: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  postal_code: '',
  country: 'France',
  delivery_address: '',
  delivery_city: '',
  delivery_postal_code: '',
  delivery_country: '',
  notes: '',
};

export function validateEmail(email: string): boolean {
  if (!email) return true;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validateSiret(siret: string): boolean {
  if (!siret) return true;
  const cleanSiret = siret.replace(/\s/g, '');
  if (!/^\d{9,14}$/.test(cleanSiret)) return false;
  if (cleanSiret.length === 14) {
    let sum = 0;
    for (let i = 0; i < 14; i++) {
      let digit = parseInt(cleanSiret[i], 10);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }
  return cleanSiret.length === 9;
}

export function validateClientForm(data: ClientFormData): { isValid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  if (!data.name.trim()) {
    errors.name = 'Le nom est requis';
  }

  if (data.email && !validateEmail(data.email)) {
    errors.email = 'Email invalide';
  }

  if (data.company && data.company.trim() && !data.siret.trim()) {
    errors.siret = 'Le SIREN/SIRET est requis pour une entreprise';
  }

  if (data.siret && data.siret.trim() && !validateSiret(data.siret)) {
    errors.siret = 'SIREN (9 chiffres) ou SIRET (14 chiffres) invalide';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}
