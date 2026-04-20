import { VoiceIntent, ActionDraft, ExtractedField } from '@/types/voice';

interface IntentPattern {
  intent: VoiceIntent;
  patterns: RegExp[];
  keywords: string[];
  priority: number;
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'CREATE_CLIENT',
    patterns: [
      /(?:créer?|ajouter?|nouveau)\s+(?:un\s+)?client/i,
      /nouveau\s+client/i,
      /client\s+(?:appelé|nommé|nom)\s+(.+)/i,
    ],
    keywords: ['créer client', 'nouveau client', 'ajouter client'],
    priority: 10,
  },
  {
    intent: 'CREATE_QUOTE',
    patterns: [
      /(?:créer?|nouveau|faire)\s+(?:un\s+)?devis/i,
      /devis\s+(?:pour|client)/i,
      /établir\s+(?:un\s+)?devis/i,
    ],
    keywords: ['créer devis', 'nouveau devis', 'faire devis', 'établir devis'],
    priority: 10,
  },
  {
    intent: 'CREATE_INVOICE',
    patterns: [
      /(?:créer?|nouvelle?|faire)\s+(?:une?\s+)?facture/i,
      /facture\s+(?:pour|client)/i,
      /établir\s+(?:une?\s+)?facture/i,
      /facturer/i,
    ],
    keywords: ['créer facture', 'nouvelle facture', 'faire facture', 'établir facture', 'facturer'],
    priority: 10,
  },
  {
    intent: 'ADD_LINE',
    patterns: [
      /ajouter?\s+(?:une?\s+)?ligne/i,
      /nouvelle?\s+ligne/i,
      /ajouter?\s+(?:un\s+)?(?:produit|article|service)/i,
      /(\d+)\s*(?:x|fois)?\s*(.+?)\s+(?:à|a)\s+(\d+(?:[.,]\d+)?)\s*(?:€|euros?)?/i,
      /(.+?)\s+(?:quantité|qty)\s*:?\s*(\d+)\s+(?:prix|à|a)\s*:?\s*(\d+(?:[.,]\d+)?)/i,
    ],
    keywords: ['ajouter ligne', 'nouvelle ligne', 'ajouter produit', 'ajouter article', 'ajouter service'],
    priority: 9,
  },
  {
    intent: 'SET_FIELD',
    patterns: [
      /(?:mettre|définir|changer|modifier)\s+(.+?)\s+(?:à|en|sur|:)\s+(.+)/i,
      /(.+?)\s+(?:est|sera|=|:)\s+(.+)/i,
      /(?:le|la)\s+(.+?)\s+(?:c'est|est)\s+(.+)/i,
    ],
    keywords: ['mettre', 'définir', 'changer', 'modifier'],
    priority: 5,
  },
  {
    intent: 'CONVERT_TO_INVOICE',
    patterns: [
      /convertir?\s+(?:en|vers)\s+facture/i,
      /transformer?\s+(?:en|vers)\s+facture/i,
      /(?:ce\s+)?devis\s+(?:en|vers)\s+facture/i,
      /passer?\s+(?:en|vers)\s+facture/i,
    ],
    keywords: ['convertir facture', 'transformer facture', 'devis en facture', 'passer facture'],
    priority: 10,
  },
  {
    intent: 'MARK_PAID',
    patterns: [
      /(?:marquer?|mettre)\s+(?:comme\s+)?payé/i,
      /(?:c'est\s+)?payé/i,
      /paiement\s+(?:reçu|effectué|fait)/i,
      /(?:a\s+)?réglé/i,
    ],
    keywords: ['marquer payé', 'payé', 'paiement reçu', 'réglé'],
    priority: 10,
  },
  {
    intent: 'MARK_SENT',
    patterns: [
      /(?:marquer?|mettre)\s+(?:comme\s+)?envoyé/i,
      /(?:c'est\s+)?envoyé/i,
      /(?:a\s+été\s+)?envoyé/i,
    ],
    keywords: ['marquer envoyé', 'envoyé'],
    priority: 10,
  },
  {
    intent: 'SEARCH',
    patterns: [
      /(?:chercher?|rechercher?|trouver?)\s+(.+)/i,
      /(?:où\s+est|afficher?)\s+(.+)/i,
      /(?:montrer?|voir)\s+(.+)/i,
    ],
    keywords: ['chercher', 'rechercher', 'trouver', 'afficher', 'montrer'],
    priority: 3,
  },
];

const FIELD_MAPPINGS: Record<string, string> = {
  'nom': 'name',
  'prénom': 'firstName',
  'entreprise': 'company',
  'société': 'company',
  'email': 'email',
  'mail': 'email',
  'téléphone': 'phone',
  'tel': 'phone',
  'adresse': 'address',
  'ville': 'city',
  'code postal': 'postal_code',
  'pays': 'country',
  'prix': 'unit_price',
  'montant': 'amount',
  'quantité': 'quantity',
  'description': 'description',
  'notes': 'notes',
  'date': 'date',
  'échéance': 'due_date',
  'remise': 'discount',
  'tva': 'tva_rate',
};

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function extractDate(text: string): string | null {
  const datePatterns = [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,
    /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{2,4})/i,
    /aujourd'hui/i,
    /demain/i,
    /dans\s+(\d+)\s+jours?/i,
  ];

  const months: Record<string, string> = {
    'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
    'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
    'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12',
  };

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      if (pattern.source.includes('aujourd')) {
        return new Date().toISOString().split('T')[0];
      }
      if (pattern.source.includes('demain')) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
      }
      if (pattern.source.includes('dans')) {
        const days = parseInt(match[1]);
        const future = new Date();
        future.setDate(future.getDate() + days);
        return future.toISOString().split('T')[0];
      }
      if (match[2] && months[match[2].toLowerCase()]) {
        const day = match[1].padStart(2, '0');
        const month = months[match[2].toLowerCase()];
        let year = match[3];
        if (year.length === 2) year = '20' + year;
        return `${year}-${month}-${day}`;
      }
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      let year = match[3];
      if (year.length === 2) year = '20' + year;
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

function extractClientName(text: string): string | null {
  const patterns = [
    /client\s+(?:appelé|nommé|nom|:)?\s*(.+?)(?:\s+(?:avec|,|$))/i,
    /pour\s+(?:le\s+client\s+)?(.+?)(?:\s+(?:avec|,|$))/i,
    /(?:monsieur|madame|m\.|mme\.?)\s+(.+?)(?:\s+(?:avec|,|$))/i,
    /société\s+(.+?)(?:\s+(?:avec|,|$))/i,
    /entreprise\s+(.+?)(?:\s+(?:avec|,|$))/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 1 && name.length < 100) {
        return name;
      }
    }
  }
  return null;
}

function extractAmount(text: string): number | null {
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*(?:€|euros?)/i,
    /(?:prix|montant|total|à)\s*:?\s*(\d+(?:[.,]\d+)?)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return parseFloat(match[1].replace(',', '.'));
    }
  }
  return null;
}

function extractQuantity(text: string): number | null {
  const patterns = [
    /(\d+)\s*(?:x|fois|unités?|pièces?|heures?|jours?)/i,
    /quantité\s*:?\s*(\d+)/i,
    /^(\d+)\s+/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1]);
    }
  }
  return null;
}

function extractProductDescription(text: string): string | null {
  const cleanText = text
    .replace(/\d+(?:[.,]\d+)?\s*(?:€|euros?)/gi, '')
    .replace(/quantité\s*:?\s*\d+/gi, '')
    .replace(/prix\s*:?\s*\d+(?:[.,]\d+)?/gi, '')
    .replace(/tva\s*:?\s*\d+(?:[.,]\d+)?%?/gi, '')
    .replace(/ajouter\s+(?:une?\s+)?(?:ligne|produit|article|service)/gi, '')
    .replace(/\d+\s*(?:x|fois)/gi, '')
    .trim();

  if (cleanText.length > 2) {
    return cleanText.charAt(0).toUpperCase() + cleanText.slice(1);
  }
  return null;
}

function extractSearchQuery(text: string): string | null {
  const patterns = [
    /(?:chercher?|rechercher?|trouver?|afficher?|montrer?|voir)\s+(.+)/i,
    /(?:où\s+est)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function detectIntent(text: string): { intent: VoiceIntent; confidence: number } {
  const normalizedText = normalizeText(text);
  let bestMatch: { intent: VoiceIntent; confidence: number } = { intent: 'UNKNOWN', confidence: 0 };

  for (const intentPattern of INTENT_PATTERNS) {
    for (const pattern of intentPattern.patterns) {
      if (pattern.test(text)) {
        const confidence = 0.9 * (intentPattern.priority / 10);
        if (confidence > bestMatch.confidence) {
          bestMatch = { intent: intentPattern.intent, confidence };
        }
      }
    }

    for (const keyword of intentPattern.keywords) {
      if (normalizedText.includes(normalizeText(keyword))) {
        const confidence = 0.7 * (intentPattern.priority / 10);
        if (confidence > bestMatch.confidence) {
          bestMatch = { intent: intentPattern.intent, confidence };
        }
      }
    }
  }

  return bestMatch;
}

function extractFieldsForIntent(intent: VoiceIntent, text: string): ExtractedField[] {
  const fields: ExtractedField[] = [];

  switch (intent) {
    case 'CREATE_CLIENT': {
      const clientName = extractClientName(text);
      if (clientName) {
        fields.push({ key: 'name', value: clientName, label: 'Nom', editable: true });
      }
      const companyMatch = text.match(/(?:société|entreprise)\s+(.+?)(?:\s+(?:avec|,|$))/i);
      if (companyMatch) {
        fields.push({ key: 'company', value: companyMatch[1].trim(), label: 'Entreprise', editable: true });
      }
      const emailMatch = text.match(/[\w.-]+@[\w.-]+\.\w+/);
      if (emailMatch) {
        fields.push({ key: 'email', value: emailMatch[0], label: 'Email', editable: true });
      }
      const phoneMatch = text.match(/(?:0[1-9])(?:[\s.-]?\d{2}){4}/);
      if (phoneMatch) {
        fields.push({ key: 'phone', value: phoneMatch[0].replace(/[\s.-]/g, ''), label: 'Téléphone', editable: true });
      }
      break;
    }

    case 'CREATE_QUOTE':
    case 'CREATE_INVOICE': {
      const clientName = extractClientName(text);
      if (clientName) {
        fields.push({ key: 'client_name', value: clientName, label: 'Client', editable: true });
      }
      const date = extractDate(text);
      if (date) {
        fields.push({ key: 'date', value: date, label: 'Date', editable: true });
      }
      const dueDateMatch = text.match(/(?:échéance|valable?\s+jusqu'au|payable?\s+(?:avant|le))\s+(.+)/i);
      if (dueDateMatch) {
        const dueDate = extractDate(dueDateMatch[1]);
        if (dueDate) {
          fields.push({ key: 'due_date', value: dueDate, label: 'Échéance', editable: true });
        }
      }
      break;
    }

    case 'ADD_LINE': {
      const description = extractProductDescription(text);
      if (description) {
        fields.push({ key: 'description', value: description, label: 'Description', editable: true });
      }
      const quantity = extractQuantity(text);
      if (quantity) {
        fields.push({ key: 'quantity', value: quantity, label: 'Quantité', editable: true });
      }
      const amount = extractAmount(text);
      if (amount) {
        fields.push({ key: 'unit_price', value: amount, label: 'Prix unitaire', editable: true });
      }
      const tvaMatch = text.match(/tva\s*:?\s*(\d+(?:[.,]\d+)?)\s*%?/i);
      if (tvaMatch) {
        fields.push({ key: 'tva_rate', value: parseFloat(tvaMatch[1].replace(',', '.')), label: 'TVA %', editable: true });
      }
      break;
    }

    case 'SET_FIELD': {
      const setMatch = text.match(/(?:mettre|définir|changer|modifier)\s+(?:le\s+|la\s+)?(.+?)\s+(?:à|en|sur|:)\s+(.+)/i);
      if (setMatch) {
        const fieldName = normalizeText(setMatch[1]);
        const fieldKey = FIELD_MAPPINGS[fieldName] || fieldName;
        fields.push({ key: fieldKey, value: setMatch[2].trim(), label: setMatch[1], editable: true });
      }
      break;
    }

    case 'MARK_PAID': {
      const methodMatch = text.match(/(?:par|en|via)\s+(carte|espèces?|virement|chèque|cb|paypal)/i);
      if (methodMatch) {
        const methodMap: Record<string, string> = {
          'carte': 'Carte bancaire',
          'cb': 'Carte bancaire',
          'espèces': 'Espèces',
          'espèce': 'Espèces',
          'virement': 'Virement',
          'chèque': 'Chèque',
          'paypal': 'PayPal',
        };
        const method = methodMap[methodMatch[1].toLowerCase()] || methodMatch[1];
        fields.push({ key: 'payment_method', value: method, label: 'Mode de paiement', editable: true });
      }
      break;
    }

    case 'SEARCH': {
      const query = extractSearchQuery(text);
      if (query) {
        fields.push({ key: 'query', value: query, label: 'Recherche', editable: true });
      }
      break;
    }
  }

  return fields;
}

function generateSuggestedAction(intent: VoiceIntent, fields: ExtractedField[]): string {
  switch (intent) {
    case 'CREATE_CLIENT': {
      const name = fields.find(f => f.key === 'name')?.value;
      return name ? `Créer le client "${name}"` : 'Créer un nouveau client';
    }
    case 'CREATE_QUOTE': {
      const client = fields.find(f => f.key === 'client_name')?.value;
      return client ? `Créer un devis pour "${client}"` : 'Créer un nouveau devis';
    }
    case 'CREATE_INVOICE': {
      const client = fields.find(f => f.key === 'client_name')?.value;
      return client ? `Créer une facture pour "${client}"` : 'Créer une nouvelle facture';
    }
    case 'ADD_LINE': {
      const desc = fields.find(f => f.key === 'description')?.value;
      const qty = fields.find(f => f.key === 'quantity')?.value;
      const price = fields.find(f => f.key === 'unit_price')?.value;
      if (desc && qty && price) {
        return `Ajouter ${qty}x "${desc}" à ${price}€`;
      }
      return desc ? `Ajouter la ligne "${desc}"` : 'Ajouter une nouvelle ligne';
    }
    case 'SET_FIELD': {
      const field = fields[0];
      if (field) {
        return `Définir ${field.label} à "${field.value}"`;
      }
      return 'Modifier un champ';
    }
    case 'CONVERT_TO_INVOICE':
      return 'Convertir ce devis en facture';
    case 'MARK_PAID': {
      const method = fields.find(f => f.key === 'payment_method')?.value;
      return method ? `Marquer comme payé (${method})` : 'Marquer comme payé';
    }
    case 'MARK_SENT':
      return 'Marquer comme envoyé';
    case 'SEARCH': {
      const query = fields.find(f => f.key === 'query')?.value;
      return query ? `Rechercher "${query}"` : 'Effectuer une recherche';
    }
    default:
      return 'Action non reconnue';
  }
}

export function parseVoiceCommand(transcription: string): ActionDraft {
  console.log('[NLU] Parsing transcription:', transcription);

  const { intent, confidence } = detectIntent(transcription);
  console.log('[NLU] Detected intent:', intent, 'confidence:', confidence);

  const extractedFields = extractFieldsForIntent(intent, transcription);
  console.log('[NLU] Extracted fields:', extractedFields);

  const suggestedAction = generateSuggestedAction(intent, extractedFields);

  const actionDraft: ActionDraft = {
    intent,
    extractedFields,
    confidence,
    rawTranscription: transcription,
    suggestedAction,
  };

  console.log('[NLU] Action draft:', actionDraft);
  return actionDraft;
}

export function parseDictation(transcription: string, targetField?: string): ActionDraft {
  console.log('[NLU] Parsing dictation for field:', targetField);

  const cleanedText = transcription
    .replace(/point$/i, '.')
    .replace(/virgule$/i, ',')
    .replace(/deux points$/i, ':')
    .replace(/point virgule$/i, ';')
    .replace(/point d'interrogation$/i, '?')
    .replace(/point d'exclamation$/i, '!')
    .replace(/nouvelle ligne$/i, '\n')
    .replace(/à la ligne$/i, '\n')
    .trim();

  const finalText = cleanedText.charAt(0).toUpperCase() + cleanedText.slice(1);

  return {
    intent: 'SET_FIELD',
    extractedFields: [
      {
        key: targetField || 'text',
        value: finalText,
        label: 'Texte dicté',
        editable: true,
      },
    ],
    confidence: 1,
    rawTranscription: transcription,
    suggestedAction: `Insérer "${finalText.substring(0, 50)}${finalText.length > 50 ? '...' : ''}"`,
    targetField,
  };
}
