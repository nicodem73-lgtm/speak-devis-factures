export interface FileMetadata {
  id: string;
  originalPath: string;
  storagePath: string;
  fileName: string;
  fileType: 'pdf' | 'photo' | 'xml' | 'other';
  mimeType: string;
  size: number;
  hash: string;
  thumbnailPath?: string;
  entityType: 'expense' | 'document' | 'delivery_note' | 'einvoice' | 'logo';
  entityId: string | number;
  year: number;
  createdAt: string;
}

export interface ArchiveManifest {
  version: string;
  year: number;
  createdAt: string;
  dbFileName: string;
  dbHash: string;
  filesCount: number;
  totalSize: number;
  files: FileManifestEntry[];
  encryptionInfo: {
    algorithm: string;
    kdfAlgorithm: string;
    kdfIterations: number;
    saltBase64: string;
    ivBase64: string;
  };
}

export interface FileManifestEntry {
  path: string;
  hash: string;
  size: number;
  type: string;
}

export interface YearArchiveInfo {
  year: number;
  status: 'active' | 'readonly' | 'archived' | 'not_present';
  dbPath?: string;
  attachmentsPath?: string;
  vaultPath?: string;
  documentsCount: number;
  expensesCount: number;
  clientsCount: number;
  productsCount: number;
  totalSize: number;
  lastModified?: string;
  archivedAt?: string;
}

export interface ArchiveExportOptions {
  year: number;
  pin: string;
  includeAttachments: boolean;
  deleteAfterExport: boolean;
  exportDestination: 'files' | 'share';
}

export interface ArchiveImportResult {
  success: boolean;
  year: number;
  filesRestored: number;
  errors: string[];
}

export interface DatabaseYearConfig {
  year: number;
  dbName: string;
  isActive: boolean;
  isReadOnly: boolean;
  createdAt: string;
  closedAt?: string;
}

export interface MigrationProgress {
  phase: 'extracting' | 'hashing' | 'thumbnails' | 'vacuum' | 'complete';
  current: number;
  total: number;
  currentFile?: string;
}

export interface StorageStats {
  totalDatabaseSize: number;
  totalAttachmentsSize: number;
  totalArchivesSize: number;
  yearBreakdown: {
    year: number;
    dbSize: number;
    attachmentsSize: number;
    archiveSize?: number;
  }[];
}
