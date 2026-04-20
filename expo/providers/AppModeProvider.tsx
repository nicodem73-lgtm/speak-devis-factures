import { useState, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { ApplicationMode, ActivationChecklist, ActivityType, ModeJournalEntry, isChecklistComplete } from '@/types/appMode';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getCompanyInfo } from '@/db/settings';

const MODE_KEY = 'application_mode';
const ACTIVATION_DATE_KEY = 'mode_reel_activation_date';
const ACTIVITY_TYPE_KEY = 'activity_type';
const JOURNAL_KEY = 'mode_journal';
const TERMS_ACCEPTED_KEY = 'terms_accepted';

export const [AppModeProvider, useAppMode] = createContextHook(() => {
  const [mode, setModeState] = useState<ApplicationMode>('TEST');
  const [isLoading, setIsLoading] = useState(true);
  const [activationDate, setActivationDate] = useState<string | null>(null);
  const [activityType, setActivityTypeState] = useState<ActivityType>('b2b_france');
  const [termsAccepted, setTermsAcceptedState] = useState(false);
  const [checklist, setChecklist] = useState<ActivationChecklist>({
    companyName: false,
    companySiren: false,
    companyTva: false,
    companyAddress: false,
    taxSettingsValid: false,
    activityTypeChosen: false,
    termsAccepted: false,
  });
  const { db } = useDatabase();

  useEffect(() => {
    const loadMode = async () => {
      try {
        console.log('[AppMode] Loading application mode...');
        const [storedMode, storedDate, storedActivity, storedTerms] = await Promise.all([
          AsyncStorage.getItem(MODE_KEY),
          AsyncStorage.getItem(ACTIVATION_DATE_KEY),
          AsyncStorage.getItem(ACTIVITY_TYPE_KEY),
          AsyncStorage.getItem(TERMS_ACCEPTED_KEY),
        ]);

        if (storedMode === 'REEL') {
          setModeState('REEL');
          console.log('[AppMode] Mode RÉEL loaded');
        } else {
          setModeState('TEST');
          console.log('[AppMode] Mode TEST loaded (default)');
        }

        if (storedDate) setActivationDate(storedDate);
        if (storedActivity) setActivityTypeState(storedActivity as ActivityType);
        if (storedTerms === 'true') setTermsAcceptedState(true);
      } catch (e) {
        console.error('[AppMode] Error loading mode:', e);
        setModeState('TEST');
      } finally {
        setIsLoading(false);
      }
    };
    loadMode();
  }, []);

  const refreshChecklist = useCallback(async () => {
    if (!db) return;
    try {
      console.log('[AppMode] Refreshing activation checklist...');
      const company = await getCompanyInfo(db);
      const storedActivity = await AsyncStorage.getItem(ACTIVITY_TYPE_KEY);
      const storedTerms = await AsyncStorage.getItem(TERMS_ACCEPTED_KEY);

      const newChecklist: ActivationChecklist = {
        companyName: !!(company.name && company.name.trim()),
        companySiren: !!(company.siret && company.siret.trim()),
        companyTva: !!(company.tvaNumber && company.tvaNumber.trim()),
        companyAddress: !!(company.address && company.city && company.postalCode),
        taxSettingsValid: true,
        activityTypeChosen: !!storedActivity,
        termsAccepted: storedTerms === 'true',
      };
      setChecklist(newChecklist);
      console.log('[AppMode] Checklist refreshed:', newChecklist);
    } catch (e) {
      console.error('[AppMode] Error refreshing checklist:', e);
    }
  }, [db]);

  useEffect(() => {
    if (db) {
      refreshChecklist();
    }
  }, [db, refreshChecklist]);

  const addJournalEntry = useCallback(async (entry: Omit<ModeJournalEntry, 'id' | 'timestamp'>) => {
    try {
      const stored = await AsyncStorage.getItem(JOURNAL_KEY);
      const journal: ModeJournalEntry[] = stored ? JSON.parse(stored) : [];
      const newEntry: ModeJournalEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        timestamp: new Date().toISOString(),
      };
      journal.push(newEntry);
      if (journal.length > 1000) {
        journal.splice(0, journal.length - 1000);
      }
      await AsyncStorage.setItem(JOURNAL_KEY, JSON.stringify(journal));
      console.log('[AppMode] Journal entry added:', newEntry.action, newEntry.entityType);
    } catch (e) {
      console.error('[AppMode] Error adding journal entry:', e);
    }
  }, []);

  const setActivityType = useCallback(async (type: ActivityType) => {
    await AsyncStorage.setItem(ACTIVITY_TYPE_KEY, type);
    setActivityTypeState(type);
    await refreshChecklist();
    console.log('[AppMode] Activity type set:', type);
  }, [refreshChecklist]);

  const acceptTerms = useCallback(async () => {
    await AsyncStorage.setItem(TERMS_ACCEPTED_KEY, 'true');
    setTermsAcceptedState(true);
    await refreshChecklist();
    console.log('[AppMode] Terms accepted');
  }, [refreshChecklist]);

  const activateRealMode = useCallback(async (): Promise<boolean> => {
    console.log('[AppMode] Attempting to activate REAL mode...');

    await refreshChecklist();

    const latestChecklist = { ...checklist };
    const storedActivity = await AsyncStorage.getItem(ACTIVITY_TYPE_KEY);
    const storedTerms = await AsyncStorage.getItem(TERMS_ACCEPTED_KEY);
    latestChecklist.activityTypeChosen = !!storedActivity;
    latestChecklist.termsAccepted = storedTerms === 'true';

    if (!isChecklistComplete(latestChecklist)) {
      console.log('[AppMode] Checklist incomplete, cannot activate:', latestChecklist);
      Alert.alert(
        'Activation impossible',
        'Veuillez compléter tous les éléments de la checklist avant d\'activer le mode réel.',
      );
      return false;
    }

    const now = new Date().toISOString();
    await AsyncStorage.setItem(MODE_KEY, 'REEL');
    await AsyncStorage.setItem(ACTIVATION_DATE_KEY, now);
    setModeState('REEL');
    setActivationDate(now);

    await addJournalEntry({
      mode: 'REEL',
      action: 'MODE_ACTIVATION',
      entityType: 'system',
      entityId: 'mode',
      details: 'Activation du mode réel',
    });

    console.log('[AppMode] REAL mode activated at:', now);
    return true;
  }, [checklist, refreshChecklist, addJournalEntry]);

  const logAction = useCallback(async (action: string, entityType: string, entityId: string, details?: string) => {
    await addJournalEntry({
      mode,
      action,
      entityType,
      entityId,
      details,
    });
  }, [mode, addJournalEntry]);

  const getJournal = useCallback(async (filterMode?: ApplicationMode): Promise<ModeJournalEntry[]> => {
    try {
      const stored = await AsyncStorage.getItem(JOURNAL_KEY);
      const journal: ModeJournalEntry[] = stored ? JSON.parse(stored) : [];
      if (filterMode) {
        return journal.filter(e => e.mode === filterMode);
      }
      return journal;
    } catch {
      return [];
    }
  }, []);

  const isTestMode = useMemo(() => mode === 'TEST', [mode]);
  const isRealMode = useMemo(() => mode === 'REEL', [mode]);
  const canActivateRealMode = useMemo(() => isChecklistComplete(checklist), [checklist]);

  return {
    mode,
    isLoading,
    isTestMode,
    isRealMode,
    activationDate,
    activityType,
    termsAccepted,
    checklist,
    canActivateRealMode,
    refreshChecklist,
    setActivityType,
    acceptTerms,
    activateRealMode,
    logAction,
    getJournal,
  };
});
