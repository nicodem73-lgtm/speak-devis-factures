import { useEffect, useState, useCallback } from 'react';
import createContextHook from '@nkzw/create-context-hook';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { initDatabase } from '@/db/database';
import { 
  getActiveDatabase, 
  getActiveYear, 
  setActiveYear,
  initYearDatabase 
} from '@/db/multiYearDatabase';
import { 
  needsMigration, 
  migrateFromLegacyDatabase,
  getMigrationStatus 
} from '@/db/migration';
import { MigrationProgress } from '@/types/archive';

export const [DatabaseProvider, useDatabase] = createContextHook(() => {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activeYear, setActiveYearState] = useState<number>(new Date().getFullYear());
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationProgress, setMigrationProgress] = useState<MigrationProgress | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        console.log('[DatabaseProvider] Initializing database...');
        
        if (Platform.OS === 'web') {
          const database = await initDatabase();
          setDb(database);
          setIsReady(true);
          console.log('[DatabaseProvider] Web database ready');
          return;
        }
        
        const migrationNeeded = await needsMigration();
        
        if (migrationNeeded) {
          console.log('[DatabaseProvider] Migration needed from legacy database');
          setIsMigrating(true);
          
          const result = await migrateFromLegacyDatabase((progress) => {
            setMigrationProgress(progress);
            console.log('[DatabaseProvider] Migration progress:', progress);
          });
          
          setIsMigrating(false);
          setMigrationProgress(null);
          
          if (!result.success) {
            console.error('[DatabaseProvider] Migration errors:', result.errors);
          }
        }
        
        const currentYear = await getActiveYear();
        setActiveYearState(currentYear);
        
        const database = await getActiveDatabase();
        setDb(database);
        setIsReady(true);
        
        console.log('[DatabaseProvider] Database ready for year:', currentYear);
        
      } catch (err) {
        console.error('[DatabaseProvider] Failed to initialize database:', err);
        setError(err instanceof Error ? err : new Error('Unknown error'));
        setIsReady(true);
      }
    };

    init();
  }, []);

  const switchYear = useCallback(async (year: number) => {
    try {
      console.log('[DatabaseProvider] Switching to year:', year);
      await setActiveYear(year);
      const database = await initYearDatabase(year);
      setDb(database);
      setActiveYearState(year);
      console.log('[DatabaseProvider] Switched to year:', year);
    } catch (err) {
      console.error('[DatabaseProvider] Failed to switch year:', err);
      throw err;
    }
  }, []);

  const refreshDatabase = useCallback(async () => {
    try {
      const database = await getActiveDatabase();
      setDb(database);
    } catch (err) {
      console.error('[DatabaseProvider] Failed to refresh database:', err);
    }
  }, []);

  return {
    db,
    isReady,
    error,
    activeYear,
    switchYear,
    refreshDatabase,
    isMigrating,
    migrationProgress,
  };
});
