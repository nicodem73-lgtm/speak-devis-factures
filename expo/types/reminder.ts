export interface ReminderConfig {
  enabled: boolean;
  reminder1Days: number;
  reminder2Days: number;
  reminder3Days: number;
  reminder1Enabled: boolean;
  reminder2Enabled: boolean;
  reminder3Enabled: boolean;
  defaultPaymentDays: number;
}

export interface ReminderTemplate {
  id: string;
  level: 1 | 2 | 3;
  subject: string;
  body: string;
}

export interface ReminderHistory {
  id: number;
  document_id: number;
  level: number;
  sent_at: string;
  recipient_email: string;
  subject: string;
  created_at: string;
}

export interface OverdueInvoice {
  id: number;
  number: string;
  client_id: number;
  client_name: string;
  client_email?: string;
  due_date: string;
  total_ttc: number;
  days_overdue: number;
  last_reminder_level: number;
  last_reminder_date?: string;
}

export const DEFAULT_REMINDER_CONFIG: ReminderConfig = {
  enabled: true,
  reminder1Days: 3,
  reminder2Days: 10,
  reminder3Days: 21,
  reminder1Enabled: true,
  reminder2Enabled: true,
  reminder3Enabled: true,
  defaultPaymentDays: 30,
};

export const DEFAULT_REMINDER_TEMPLATES: ReminderTemplate[] = [
  {
    id: '1',
    level: 1,
    subject: 'Rappel : Facture {NUMERO_FACTURE} - Échéance dépassée',
    body: `Bonjour {NOM_CLIENT},

Nous vous informons que la facture n°{NUMERO_FACTURE} d'un montant de {MONTANT_TOTAL} arrivée à échéance le {DATE_ECHEANCE} reste impayée.

Nous vous remercions de bien vouloir procéder au règlement dans les meilleurs délais.

Cordialement,
{ENTREPRISE_NOM}`,
  },
  {
    id: '2',
    level: 2,
    subject: 'Second rappel : Facture {NUMERO_FACTURE} - Règlement en attente',
    body: `Bonjour {NOM_CLIENT},

Sauf erreur de notre part, nous n'avons pas reçu le règlement de la facture n°{NUMERO_FACTURE} d'un montant de {MONTANT_TOTAL}, échue depuis le {DATE_ECHEANCE}.

Nous vous prions de bien vouloir régulariser cette situation dans les plus brefs délais.

Si le paiement a été effectué entre-temps, veuillez ne pas tenir compte de ce message.

Cordialement,
{ENTREPRISE_NOM}`,
  },
  {
    id: '3',
    level: 3,
    subject: 'Dernier rappel avant relance : Facture {NUMERO_FACTURE}',
    body: `Bonjour {NOM_CLIENT},

Malgré nos précédents rappels, la facture n°{NUMERO_FACTURE} d'un montant de {MONTANT_TOTAL}, échue depuis le {DATE_ECHEANCE}, demeure impayée.

Sans règlement de votre part sous 8 jours, nous serons contraints d'engager une procédure de recouvrement.

Nous vous invitons à nous contacter si vous rencontrez des difficultés de paiement afin de trouver une solution amiable.

Cordialement,
{ENTREPRISE_NOM}`,
  },
];

export const TEMPLATE_VARIABLES = [
  { key: '{NOM_CLIENT}', description: 'Nom du client' },
  { key: '{NUMERO_FACTURE}', description: 'Numéro de la facture' },
  { key: '{DATE_ECHEANCE}', description: "Date d'échéance" },
  { key: '{MONTANT_TOTAL}', description: 'Montant TTC' },
  { key: '{ENTREPRISE_NOM}', description: "Nom de l'entreprise" },
];

export function replaceTemplateVariables(
  template: string,
  variables: {
    clientName: string;
    invoiceNumber: string;
    dueDate: string;
    totalAmount: string;
    companyName: string;
  }
): string {
  return template
    .replace(/{NOM_CLIENT}/g, variables.clientName)
    .replace(/{NUMERO_FACTURE}/g, variables.invoiceNumber)
    .replace(/{DATE_ECHEANCE}/g, variables.dueDate)
    .replace(/{MONTANT_TOTAL}/g, variables.totalAmount)
    .replace(/{ENTREPRISE_NOM}/g, variables.companyName);
}
