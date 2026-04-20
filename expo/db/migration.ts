import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MigrationProgress } from '@/types/archive';
import { 
  computeFileHash, 
  generateThumbnail,
  getAttachmentsDir
} from '@/utils/fileStorage';
import { 
  initYearDatabase, 
  addYearConfig,
  getDbNameForYear,
  setActiveYear
} from './multiYearDatabase';
import { DB_NAME } from './schema';

const MIGRATION_STATUS_KEY = 'db_migration_status';
const MIGRATION_VERSION = 2;

interface MigrationStatus {
  version: number;
  completedAt?: string;
  migratedFromLegacy: boolean;
}

export async function getMigrationStatus(): Promise<MigrationStatus | null> {
  try {
    const stored = await AsyncStorage.getItem(MIGRATION_STATUS_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

async function saveMigrationStatus(status: MigrationStatus): Promise<void> {
  await AsyncStorage.setItem(MIGRATION_STATUS_KEY, JSON.stringify(status));
}

export async function needsMigration(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  
  const status = await getMigrationStatus();
  if (status && status.version >= MIGRATION_VERSION) return false;
  
  const legacyDbPath = `${FileSystemLegacy.documentDirectory}SQLite/${DB_NAME}`;
  const legacyInfo = await FileSystemLegacy.getInfoAsync(legacyDbPath);
  
  return legacyInfo.exists;
}

export async function migrateFromLegacyDatabase(
  onProgress?: (progress: MigrationProgress) => void
): Promise<{ success: boolean; errors: string[] }> {
  if (Platform.OS === 'web') {
    return { success: true, errors: [] };
  }
  
  const errors: string[] = [];
  const currentYear = new Date().getFullYear();
  
  console.log('[Migration] Starting migration from legacy database');
  
  try {
    onProgress?.({ phase: 'extracting', current: 0, total: 100 });
    
    const legacyDbPath = `${FileSystemLegacy.documentDirectory}SQLite/${DB_NAME}`;
    const legacyInfo = await FileSystemLegacy.getInfoAsync(legacyDbPath);
    
    if (!legacyInfo.exists) {
      console.log('[Migration] No legacy database found, creating fresh start');
      await initYearDatabase(currentYear);
      await setActiveYear(currentYear);
      await saveMigrationStatus({
        version: MIGRATION_VERSION,
        completedAt: new Date().toISOString(),
        migratedFromLegacy: false
      });
      return { success: true, errors: [] };
    }
    
    const newDbName = getDbNameForYear(currentYear);
    const newDbPath = `${FileSystemLegacy.documentDirectory}SQLite/${newDbName}`;
    
    onProgress?.({ phase: 'extracting', current: 10, total: 100, currentFile: 'Copie de la base...' });
    
    await FileSystemLegacy.copyAsync({
      from: legacyDbPath,
      to: newDbPath
    });
    
    const walPath = `${legacyDbPath}-wal`;
    const shmPath = `${legacyDbPath}-shm`;
    const walInfo = await FileSystemLegacy.getInfoAsync(walPath);
    const shmInfo = await FileSystemLegacy.getInfoAsync(shmPath);
    
    if (walInfo.exists) {
      await FileSystemLegacy.copyAsync({ from: walPath, to: `${newDbPath}-wal` });
    }
    if (shmInfo.exists) {
      await FileSystemLegacy.copyAsync({ from: shmPath, to: `${newDbPath}-shm` });
    }
    
    await addYearConfig({
      year: currentYear,
      dbName: newDbName,
      isActive: true,
      isReadOnly: false,
      createdAt: new Date().toISOString()
    });
    
    const db = await initYearDatabase(currentYear);
    
    onProgress?.({ phase: 'extracting', current: 30, total: 100, currentFile: 'Analyse des fichiers...' });
    
    const expenses = await db.getAllAsync<{ id: number; photo_uri: string; date: string }>(
      'SELECT id, photo_uri, date FROM expenses WHERE photo_uri IS NOT NULL'
    );
    
    let processed = 0;
    const total = expenses.length;
    
    for (const expense of expenses) {
      try {
        if (!expense.photo_uri) continue;
        
        const fileInfo = await FileSystemLegacy.getInfoAsync(expense.photo_uri);
        if (!fileInfo.exists) {
          console.log('[Migration] File not found:', expense.photo_uri);
          continue;
        }
        
        const expenseYear = parseInt(expense.date.split('-')[0], 10) || currentYear;
        
        onProgress?.({ 
          phase: 'hashing', 
          current: 30 + Math.floor((processed / total) * 30), 
          total: 100,
          currentFile: `Fichier ${processed + 1}/${total}`
        });
        
        await computeFileHash(expense.photo_uri);
        
        const attachmentsDir = await getAttachmentsDir(expenseYear);
        const fileName = `expense_${expense.id}_${Date.now()}.jpg`;
        const newPath = `${attachmentsDir}/${fileName}`;
        
        await FileSystemLegacy.copyAsync({
          from: expense.photo_uri,
          to: newPath
        });
        
        onProgress?.({ 
          phase: 'thumbnails', 
          current: 60 + Math.floor((processed / total) * 20), 
          total: 100,
          currentFile: `Miniature ${processed + 1}/${total}`
        });
        
        await generateThumbnail(newPath, expenseYear, `expense_${expense.id}`);
        
        await db.runAsync(
          'UPDATE expenses SET photo_uri = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPath, expense.id]
        );
        
        processed++;
        
      } catch (error) {
        console.error('[Migration] Error processing expense:', expense.id, error);
        errors.push(`Erreur dépense #${expense.id}: ${error}`);
      }
    }
    
    onProgress?.({ phase: 'vacuum', current: 85, total: 100, currentFile: 'Optimisation...' });
    
    await db.execAsync('VACUUM');
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
    
    onProgress?.({ phase: 'vacuum', current: 95, total: 100, currentFile: 'Nettoyage...' });
    
    await FileSystemLegacy.deleteAsync(legacyDbPath, { idempotent: true });
    if (walInfo.exists) {
      await FileSystemLegacy.deleteAsync(walPath, { idempotent: true });
    }
    if (shmInfo.exists) {
      await FileSystemLegacy.deleteAsync(shmPath, { idempotent: true });
    }
    
    await setActiveYear(currentYear);
    
    await saveMigrationStatus({
      version: MIGRATION_VERSION,
      completedAt: new Date().toISOString(),
      migratedFromLegacy: true
    });
    
    onProgress?.({ phase: 'complete', current: 100, total: 100 });
    
    console.log('[Migration] Migration completed successfully');
    return { success: errors.length === 0, errors };
    
  } catch (error) {
    console.error('[Migration] Migration failed:', error);
    return { 
      success: false, 
      errors: [`Migration échouée: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}

export async function migrateExpensePhotosToYearFolders(
  year: number,
  onProgress?: (current: number, total: number) => void
): Promise<{ migrated: number; errors: string[] }> {
  if (Platform.OS === 'web') {
    return { migrated: 0, errors: [] };
  }
  
  const errors: string[] = [];
  let migrated = 0;
  
  try {
    const db = await initYearDatabase(year);
    
    const expenses = await db.getAllAsync<{ id: number; photo_uri: string; date: string }>(
      `SELECT id, photo_uri, date FROM expenses 
       WHERE photo_uri IS NOT NULL 
       AND strftime('%Y', date) = ?`,
      [String(year)]
    );
    
    const attachmentsDir = await getAttachmentsDir(year);
    
    for (let i = 0; i < expenses.length; i++) {
      const expense = expenses[i];
      
      try {
        if (!expense.photo_uri) continue;
        
        if (expense.photo_uri.includes(`/attachments/${year}/`)) {
          continue;
        }
        
        const fileInfo = await FileSystemLegacy.getInfoAsync(expense.photo_uri);
        if (!fileInfo.exists) continue;
        
        const fileName = `expense_${expense.id}_${Date.now()}.jpg`;
        const newPath = `${attachmentsDir}/${fileName}`;
        
        await FileSystemLegacy.copyAsync({
          from: expense.photo_uri,
          to: newPath
        });
        
        await generateThumbnail(newPath, year, `expense_${expense.id}`);
        
        await db.runAsync(
          'UPDATE expenses SET photo_uri = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [newPath, expense.id]
        );
        
        await FileSystemLegacy.deleteAsync(expense.photo_uri, { idempotent: true });
        
        migrated++;
        onProgress?.(i + 1, expenses.length);
        
      } catch (error) {
        errors.push(`Erreur dépense #${expense.id}: ${error}`);
      }
    }
    
    return { migrated, errors };
    
  } catch (error) {
    return { migrated, errors: [`Erreur: ${error}`] };
  }
}

export async function cleanupOrphanedPhotos(year: number): Promise<number> {
  if (Platform.OS === 'web') return 0;
  
  try {
    const db = await initYearDatabase(year);
    const attachmentsDir = await getAttachmentsDir(year);
    
    const validPhotos = await db.getAllAsync<{ photo_uri: string }>(
      'SELECT photo_uri FROM expenses WHERE photo_uri IS NOT NULL'
    );
    
    const validPaths = new Set(validPhotos.map(p => p.photo_uri));
    
    const files = await FileSystemLegacy.readDirectoryAsync(attachmentsDir);
    let deleted = 0;
    
    for (const file of files) {
      const filePath = `${attachmentsDir}/${file}`;
      if (!validPaths.has(filePath) && file.startsWith('expense_')) {
        await FileSystemLegacy.deleteAsync(filePath, { idempotent: true });
        deleted++;
      }
    }
    
    console.log('[Migration] Cleaned up orphaned photos:', deleted);
    return deleted;
    
  } catch (error) {
    console.error('[Migration] Error cleaning up orphans:', error);
    return 0;
  }
}
