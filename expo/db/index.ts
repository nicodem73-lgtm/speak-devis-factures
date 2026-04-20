export { initDatabase, getDatabase, closeDatabase } from './database';
export { DB_NAME, DB_VERSION } from './schema';

// Multi-year database exports
export { 
  initYearDatabase,
  getActiveDatabase,
  getDatabaseForYear,
  getActiveYear,
  setActiveYear,
  getAvailableYears,
  getYearArchiveInfo,
  vacuumDatabase,
  closeDatabaseForYear,
  closeAllDatabases,
  setDatabaseReadOnly,
  isDatabaseReadOnly,
  deleteYearDatabase,
  getDbNameForYear,
  getYearConfigs,
} from './multiYearDatabase';

// Year closing exports
export {
  closeYearAndCreateNew,
  checkYearClosingEligibility,
  getYearSummary,
} from './yearClosing';

// Migration exports
export {
  needsMigration,
  migrateFromLegacyDatabase,
  getMigrationStatus,
  migrateExpensePhotosToYearFolders,
  cleanupOrphanedPhotos,
} from './migration';
