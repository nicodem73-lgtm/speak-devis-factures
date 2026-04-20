export type ApplicationMode = 'TEST' | 'REEL';

export interface ActivationChecklist {
  companyName: boolean;
  companySiren: boolean;
  companyTva: boolean;
  companyAddress: boolean;
  taxSettingsValid: boolean;
  activityTypeChosen: boolean;
  termsAccepted: boolean;
}

export type ActivityType = 'b2b_france' | 'b2c' | 'international' | 'mixed';

export const ACTIVITY_TYPE_LABELS: Record<ActivityType, string> = {
  b2b_france: 'B2B France',
  b2c: 'B2C (Particuliers)',
  international: 'International',
  mixed: 'Mixte (B2B + B2C + International)',
};

export interface ModeJournalEntry {
  id: string;
  timestamp: string;
  mode: ApplicationMode;
  action: string;
  entityType: string;
  entityId: string;
  details?: string;
}

export function isChecklistComplete(checklist: ActivationChecklist): boolean {
  return Object.values(checklist).every(v => v === true);
}

export const TEST_DOC_WATERMARK = 'DOCUMENT DE TEST – SANS VALEUR LÉGALE';
