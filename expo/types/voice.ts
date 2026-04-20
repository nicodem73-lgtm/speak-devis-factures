export type VoiceIntent =
  | 'CREATE_CLIENT'
  | 'CREATE_QUOTE'
  | 'CREATE_INVOICE'
  | 'ADD_LINE'
  | 'SET_FIELD'
  | 'CONVERT_TO_INVOICE'
  | 'MARK_PAID'
  | 'MARK_SENT'
  | 'SEARCH'
  | 'UNKNOWN';

export type VoiceMode = 'command' | 'dictation';

export interface ExtractedField {
  key: string;
  value: string | number | boolean;
  label: string;
  editable: boolean;
}

export interface ActionDraft {
  intent: VoiceIntent;
  extractedFields: ExtractedField[];
  confidence: number;
  rawTranscription: string;
  suggestedAction: string;
  targetField?: string;
}

export interface VoiceCommandState {
  isRecording: boolean;
  isProcessing: boolean;
  transcription: string;
  actionDraft: ActionDraft | null;
  error: string | null;
  mode: VoiceMode;
}

export const INTENT_LABELS: Record<VoiceIntent, string> = {
  CREATE_CLIENT: 'Créer un client',
  CREATE_QUOTE: 'Créer un devis',
  CREATE_INVOICE: 'Créer une facture',
  ADD_LINE: 'Ajouter une ligne',
  SET_FIELD: 'Modifier un champ',
  CONVERT_TO_INVOICE: 'Convertir en facture',
  MARK_PAID: 'Marquer comme payé',
  MARK_SENT: 'Marquer comme envoyé',
  SEARCH: 'Rechercher',
  UNKNOWN: 'Action non reconnue',
};

export const INTENT_ICONS: Record<VoiceIntent, string> = {
  CREATE_CLIENT: 'user-plus',
  CREATE_QUOTE: 'file-plus',
  CREATE_INVOICE: 'receipt',
  ADD_LINE: 'plus-circle',
  SET_FIELD: 'edit-3',
  CONVERT_TO_INVOICE: 'file-output',
  MARK_PAID: 'check-circle',
  MARK_SENT: 'send',
  SEARCH: 'search',
  UNKNOWN: 'help-circle',
};
