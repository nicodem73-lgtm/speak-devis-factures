import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { 
  ArchiveManifest, 
  FileManifestEntry, 
  ArchiveExportOptions, 
  ArchiveImportResult 
} from '@/types/archive';
import { 
  computeFileHash,
  listFilesInDirectory,
  ensureDirectoryExists
} from './fileStorage';
import { 
  getDbNameForYear, 
  closeDatabaseForYear,
  setDatabaseReadOnly,
  vacuumDatabase,
  deleteYearDatabase,
  prepareYearDatabaseForArchive,
  addYearConfig
} from '@/db/multiYearDatabase';

function getBaseDir(): string {
  if (typeof window !== 'undefined' && !FileSystemLegacy.documentDirectory) return '';
  return FileSystemLegacy.documentDirectory || '';
}

function getArchivesDirPath(): string {
  return `${getBaseDir()}archives`;
}
const VAULT_VERSION = '1.0.0';
const KDF_ITERATIONS = 100000;

export async function getArchivesDir(): Promise<string> {
  const dir = getArchivesDirPath();
  await ensureDirectoryExists(dir);
  return dir;
}

export function getVaultPath(year: number): string {
  return `${getArchivesDirPath()}/Archive_${year}.vault`;
}

async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<string> {
  const pinWithSalt = pin + Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  
  let key = pinWithSalt;
  for (let i = 0; i < Math.min(KDF_ITERATIONS, 1000); i++) {
    key = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      key
    );
  }
  
  return key;
}

function generateSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    salt[i] = Math.floor(Math.random() * 256);
  }
  return salt;
}

function generateIV(): Uint8Array {
  const iv = new Uint8Array(12);
  for (let i = 0; i < 12; i++) {
    iv[i] = Math.floor(Math.random() * 256);
  }
  return iv;
}

function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

function xorEncrypt(data: string, key: string): string {
  let result = '';
  for (let i = 0; i < data.length; i++) {
    const charCode = data.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return btoa(result);
}

function xorDecrypt(encryptedBase64: string, key: string): string {
  const encrypted = atob(encryptedBase64);
  let result = '';
  for (let i = 0; i < encrypted.length; i++) {
    const charCode = encrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
}

export async function createArchiveVault(
  options: ArchiveExportOptions,
  onProgress?: (message: string, progress: number) => void
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Archive creation is not supported on web platform');
  }
  
  const { year, pin, includeAttachments, deleteAfterExport } = options;
  
  console.log('[ArchiveVault] Creating archive for year:', year);
  onProgress?.('Préparation de l\'archive...', 0);
  
  const baseDir = getBaseDir();
  const dbName = getDbNameForYear(year);
  const dbPath = `${baseDir}SQLite/${dbName}`;
  
  let dbInfo = await FileSystemLegacy.getInfoAsync(dbPath);
  if (!dbInfo.exists) {
    console.log('[ArchiveVault] Database not found, attempting to prepare year database...');
    onProgress?.('Préparation de la base de données...', 5);
    
    const prepared = await prepareYearDatabaseForArchive(year);
    if (!prepared) {
      throw new Error(`Aucune donnée trouvée pour l'année ${year}. Cette année n'a pas de données à archiver.`);
    }
    
    dbInfo = await FileSystemLegacy.getInfoAsync(dbPath);
    if (!dbInfo.exists) {
      throw new Error(`Impossible de créer la base de données pour l'année ${year}.`);
    }
  }
  
  await closeDatabaseForYear(year);
  await vacuumDatabase(year);
  
  const attachmentsDir = `${baseDir}attachments/${year}`;
  
  const archivesDir = await getArchivesDir();
  const tempDir = `${archivesDir}/temp_${year}_${Date.now()}`;
  await ensureDirectoryExists(tempDir);
  
  try {
    onProgress?.('Copie de la base de données...', 10);
    const tempDbPath = `${tempDir}/${dbName}`;
    await FileSystemLegacy.copyAsync({ from: dbPath, to: tempDbPath });
    
    const dbHash = await computeFileHash(tempDbPath);
    const dbInfo = await FileSystemLegacy.getInfoAsync(tempDbPath);
    const dbSize = (dbInfo as { size?: number }).size || 0;
    
    const files: FileManifestEntry[] = [];
    let totalSize = dbSize;
    
    if (includeAttachments) {
      onProgress?.('Copie des pièces jointes...', 30);
      const attachmentsInfo = await FileSystemLegacy.getInfoAsync(attachmentsDir);
      
      if (attachmentsInfo.exists) {
        const tempAttachmentsDir = `${tempDir}/attachments`;
        await ensureDirectoryExists(tempAttachmentsDir);
        
        const attachmentFiles = await listFilesInDirectory(attachmentsDir);
        let processedFiles = 0;
        
        for (const fileName of attachmentFiles) {
          const sourcePath = `${attachmentsDir}/${fileName}`;
          const destPath = `${tempAttachmentsDir}/${fileName}`;
          
          await FileSystemLegacy.copyAsync({ from: sourcePath, to: destPath });
          
          const fileHash = await computeFileHash(destPath);
          const fileInfo = await FileSystemLegacy.getInfoAsync(destPath);
          const fileSize = (fileInfo as { size?: number }).size || 0;
          
          files.push({
            path: `attachments/${fileName}`,
            hash: fileHash,
            size: fileSize,
            type: fileName.split('.').pop() || 'unknown',
          });
          
          totalSize += fileSize;
          processedFiles++;
          
          const progress = 30 + (processedFiles / attachmentFiles.length) * 30;
          onProgress?.(`Fichier ${processedFiles}/${attachmentFiles.length}...`, progress);
        }
      }
    }
    
    onProgress?.('Création du manifeste...', 70);
    const salt = generateSalt();
    const iv = generateIV();
    
    const manifest: ArchiveManifest = {
      version: VAULT_VERSION,
      year,
      createdAt: new Date().toISOString(),
      dbFileName: dbName,
      dbHash,
      filesCount: files.length,
      totalSize,
      files,
      encryptionInfo: {
        algorithm: 'XOR-SHA256',
        kdfAlgorithm: 'SHA256-PBKDF',
        kdfIterations: KDF_ITERATIONS,
        saltBase64: uint8ArrayToBase64(salt),
        ivBase64: uint8ArrayToBase64(iv),
      },
    };
    
    const manifestJson = JSON.stringify(manifest, null, 2);
    const manifestPath = `${tempDir}/manifest.json`;
    await FileSystemLegacy.writeAsStringAsync(manifestPath, manifestJson);
    
    onProgress?.('Chiffrement de l\'archive...', 80);
    const key = await deriveKeyFromPin(pin, salt);
    
    const vaultData = {
      salt: uint8ArrayToBase64(salt),
      iv: uint8ArrayToBase64(iv),
      manifest: xorEncrypt(manifestJson, key),
      dbContent: xorEncrypt(
        await FileSystemLegacy.readAsStringAsync(tempDbPath, { encoding: FileSystemLegacy.EncodingType.Base64 }),
        key
      ),
      files: [] as { path: string; content: string }[],
    };
    
    if (includeAttachments && files.length > 0) {
      for (const file of files) {
        const filePath = `${tempDir}/${file.path}`;
        const fileContent = await FileSystemLegacy.readAsStringAsync(filePath, { 
          encoding: FileSystemLegacy.EncodingType.Base64 
        });
        vaultData.files.push({
          path: file.path,
          content: xorEncrypt(fileContent, key),
        });
      }
    }
    
    onProgress?.('Écriture du vault...', 90);
    const vaultPath = getVaultPath(year);
    await FileSystemLegacy.writeAsStringAsync(vaultPath, JSON.stringify(vaultData));
    
    await FileSystemLegacy.deleteAsync(tempDir, { idempotent: true });
    
    await setDatabaseReadOnly(year);
    
    if (deleteAfterExport) {
      onProgress?.('Suppression des données locales...', 95);
      await deleteYearDatabase(year);
    }
    
    onProgress?.('Archive créée avec succès!', 100);
    console.log('[ArchiveVault] Archive created:', vaultPath);
    
    return vaultPath;
    
  } catch (error) {
    await FileSystemLegacy.deleteAsync(tempDir, { idempotent: true });
    console.error('[ArchiveVault] Error creating archive:', error);
    throw error;
  }
}

export async function exportArchive(
  vaultPath: string,
  destination: 'files' | 'share'
): Promise<void> {
  if (Platform.OS === 'web') {
    throw new Error('Archive export is not supported on web platform');
  }
  
  const fileInfo = await FileSystemLegacy.getInfoAsync(vaultPath);
  if (!fileInfo.exists) {
    throw new Error('Archive file not found');
  }
  
  if (destination === 'share') {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(vaultPath, {
        mimeType: 'application/octet-stream',
        dialogTitle: 'Exporter l\'archive',
      });
    } else {
      throw new Error('Sharing is not available on this device');
    }
  }
}

export async function importArchiveVault(
  vaultUri: string,
  pin: string,
  onProgress?: (message: string, progress: number) => void
): Promise<ArchiveImportResult> {
  if (Platform.OS === 'web') {
    return { success: false, year: 0, filesRestored: 0, errors: ['Import not supported on web'] };
  }
  
  const errors: string[] = [];
  let tempFilePath: string | null = null;
  let tempDbPath: string | null = null;
  
  try {
    onProgress?.('Lecture de l\'archive...', 10);
    
    let localUri = vaultUri;
    if (vaultUri.startsWith('content://') || vaultUri.includes('com.apple.filesystems') || !vaultUri.startsWith(getBaseDir())) {
      const archivesDir = await getArchivesDir();
      tempFilePath = `${archivesDir}/temp_import_${Date.now()}.vault`;
      await FileSystemLegacy.copyAsync({ from: vaultUri, to: tempFilePath });
      localUri = tempFilePath;
      console.log('[ArchiveVault] Copied import file to:', tempFilePath);
    }
    
    const vaultContent = await FileSystemLegacy.readAsStringAsync(localUri, {
      encoding: FileSystemLegacy.EncodingType.UTF8
    });
    
    let vaultData: { manifest: string; dbContent: string; files: { path: string; content: string }[]; salt?: string };
    try {
      vaultData = JSON.parse(vaultContent);
    } catch (parseError) {
      console.error('[ArchiveVault] JSON parse error:', parseError);
      throw new Error('Le fichier sélectionné n\'est pas une archive valide. Assurez-vous de sélectionner un fichier .vault.');
    }
    
    if (!vaultData.manifest || !vaultData.dbContent) {
      throw new Error('Le fichier archive est incomplet ou corrompu.');
    }
    
    let salt: Uint8Array;
    let key: string;
    let manifest: ArchiveManifest;
    
    if (vaultData.salt) {
      salt = base64ToUint8Array(vaultData.salt);
      key = await deriveKeyFromPin(pin, salt);
    } else {
      const saltMatch = vaultData.manifest.match(/saltBase64":"([^"]+)"/);
      if (saltMatch) {
        salt = base64ToUint8Array(saltMatch[1]);
        key = await deriveKeyFromPin(pin, salt);
      } else {
        salt = new Uint8Array(16);
        key = await deriveKeyFromPin(pin, salt);
      }
    }
    
    const decryptedManifestJson = xorDecrypt(vaultData.manifest, key);
    try {
      manifest = JSON.parse(decryptedManifestJson);
    } catch {
      throw new Error('Code PIN incorrect ou archive corrompue.');
    }
    
    const year = manifest.year;
    console.log('[ArchiveVault] Importing archive for year:', year);
    
    onProgress?.('Restauration de la base de données...', 30);
    const baseDir = getBaseDir();
    const dbDir = `${baseDir}SQLite`;
    await ensureDirectoryExists(dbDir);
    
    const dbContent = xorDecrypt(vaultData.dbContent, key);
    const dbPath = `${dbDir}/${manifest.dbFileName}`;
    
    const existingDbInfo = await FileSystemLegacy.getInfoAsync(dbPath);
    const shouldMerge = existingDbInfo.exists;
    
    if (shouldMerge) {
      console.log('[ArchiveVault] Existing database found, will merge data');
      onProgress?.('Fusion des données avec la base existante...', 35);
      
      tempDbPath = `${dbDir}/temp_import_${Date.now()}.db`;
      await FileSystemLegacy.writeAsStringAsync(tempDbPath, dbContent, { 
        encoding: FileSystemLegacy.EncodingType.Base64 
      });
      
      await mergeImportedDatabase(tempDbPath, dbPath, year, onProgress);
      
      try {
        await FileSystemLegacy.deleteAsync(tempDbPath, { idempotent: true });
      } catch (e) {
        console.log('[ArchiveVault] Could not delete temp db:', e);
      }
    } else {
      await FileSystemLegacy.writeAsStringAsync(dbPath, dbContent, { 
        encoding: FileSystemLegacy.EncodingType.Base64 
      });
      
      const dbHash = await computeFileHash(dbPath);
      if (dbHash !== manifest.dbHash) {
        errors.push('Database hash mismatch - file may be corrupted');
      }
    }
    
    await addYearConfig({
      year,
      dbName: manifest.dbFileName,
      isActive: true,
      isReadOnly: false,
      createdAt: manifest.createdAt,
    });
    console.log('[ArchiveVault] Year config added for imported year:', year);
    
    let filesRestored = 1; // Count the database as 1 restored file
    
    if (vaultData.files && vaultData.files.length > 0) {
      onProgress?.('Restauration des pièces jointes...', 50);
      const attachmentsDir = `${baseDir}attachments/${year}`;
      await ensureDirectoryExists(attachmentsDir);
      
      for (const file of vaultData.files) {
        try {
          const fileContent = xorDecrypt(file.content, key);
          const filePath = `${baseDir}${file.path}`;
          
          const fileDir = filePath.substring(0, filePath.lastIndexOf('/'));
          await ensureDirectoryExists(fileDir);
          
          await FileSystemLegacy.writeAsStringAsync(filePath, fileContent, {
            encoding: FileSystemLegacy.EncodingType.Base64,
          });
          
          const expectedFile = manifest.files.find(f => f.path === file.path);
          if (expectedFile) {
            const actualHash = await computeFileHash(filePath);
            if (actualHash !== expectedFile.hash) {
              errors.push(`Hash mismatch for file: ${file.path}`);
            }
          }
          
          filesRestored++;
          const progress = 50 + (filesRestored / vaultData.files.length) * 40;
          onProgress?.(`Fichier ${filesRestored}/${vaultData.files.length}...`, progress);
          
        } catch (error) {
          errors.push(`Failed to restore file: ${file.path}`);
          console.error('[ArchiveVault] Error restoring file:', error);
        }
      }
    }
    
    onProgress?.('Import terminé!', 100);
    
    if (tempFilePath) {
      try {
        await FileSystemLegacy.deleteAsync(tempFilePath, { idempotent: true });
      } catch (e) {
        console.log('[ArchiveVault] Could not delete temp file:', e);
      }
    }
    if (tempDbPath) {
      try {
        await FileSystemLegacy.deleteAsync(tempDbPath, { idempotent: true });
      } catch (e) {
        console.log('[ArchiveVault] Could not delete temp db:', e);
      }
    }
    
    return {
      success: errors.length === 0,
      year,
      filesRestored,
      errors,
    };
    
  } catch (error) {
    console.error('[ArchiveVault] Error importing archive:', error);
    
    if (tempFilePath) {
      try {
        await FileSystemLegacy.deleteAsync(tempFilePath, { idempotent: true });
      } catch (e) {
        console.log('[ArchiveVault] Could not delete temp file:', e);
      }
    }
    if (tempDbPath) {
      try {
        await FileSystemLegacy.deleteAsync(tempDbPath, { idempotent: true });
      } catch (e) {
        console.log('[ArchiveVault] Could not delete temp db:', e);
      }
    }
    
    return {
      success: false,
      year: 0,
      filesRestored: 0,
      errors: [`${error instanceof Error ? error.message : 'Erreur inconnue'}`],
    };
  }
}

async function mergeImportedDatabase(
  importedDbPath: string,
  targetDbPath: string,
  year: number,
  onProgress?: (message: string, progress: number) => void
): Promise<void> {
  const SQLite = await import('expo-sqlite');
  const { initYearDatabase } = await import('@/db/multiYearDatabase');
  
  const importedDbName = importedDbPath.split('/').pop() || `temp_import_${Date.now()}.db`;
  const importedDb = await SQLite.openDatabaseAsync(importedDbName);
  
  // Use initYearDatabase to get the cached database connection
  // This prevents closing the active database that the app is using
  const targetDb = await initYearDatabase(year);
  
  type BindValue = string | number | null | boolean | Uint8Array;
  
  try {
    onProgress?.('Fusion des dépenses...', 40);
    const importedExpenses = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM expenses');
    console.log('[ArchiveVault] Merging', importedExpenses.length, 'expenses');
    
    for (const e of importedExpenses) {
      const existing = await targetDb.getFirstAsync<{ id: number }>(
        'SELECT id FROM expenses WHERE id = ?',
        [e.id as number]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO expenses (id, establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents, tva_rate, date, category, photo_uri, ocr_text, notes, is_recurring, recurring_start_date, recurring_end_date, recurring_day, recurring_parent_id, is_archived, photo_hash, thumbnail_path, is_test, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [e.id, e.establishment, e.amount_ttc, e.amount_tva, e.amount_ttc_cents, e.amount_tva_cents, e.tva_rate, e.date, e.category, e.photo_uri, e.ocr_text, e.notes, e.is_recurring, e.recurring_start_date, e.recurring_end_date, e.recurring_day, e.recurring_parent_id, e.is_archived, e.photo_hash, e.thumbnail_path, e.is_test, e.created_at, e.updated_at]
        );
      }
    }
    
    onProgress?.('Fusion des documents...', 50);
    const importedDocs = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM documents');
    console.log('[ArchiveVault] Merging', importedDocs.length, 'documents');
    
    for (const d of importedDocs) {
      const existing = await targetDb.getFirstAsync<{ id: number }>(
        'SELECT id FROM documents WHERE id = ?',
        [d.id as number]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO documents (id, type, document_subtype, number, client_id, status, date, due_date, sent_at, paid_at, payment_method, total_ht, total_tva, total_ttc, global_discount_type, global_discount_value, auto_liquidation, notes, conditions, legal_mentions, dossier, objet, source_devis_id, original_invoice_id, credit_note_reason, is_test, is_einvoice, einvoice_status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [d.id, d.type, d.document_subtype, d.number, d.client_id, d.status, d.date, d.due_date, d.sent_at, d.paid_at, d.payment_method, d.total_ht, d.total_tva, d.total_ttc, d.global_discount_type, d.global_discount_value, d.auto_liquidation, d.notes, d.conditions, d.legal_mentions, d.dossier, d.objet, d.source_devis_id, d.original_invoice_id, d.credit_note_reason, d.is_test, d.is_einvoice, d.einvoice_status, d.created_at, d.updated_at]
        );
        
        const lineItems = await importedDb.getAllAsync<Record<string, BindValue>>(
          'SELECT * FROM line_items WHERE document_id = ?',
          [d.id as number]
        );
        
        for (const l of lineItems) {
          await targetDb.runAsync(
            `INSERT INTO line_items (id, document_id, product_id, label, description, quantity, unit_price, tva_rate, discount_type, discount_value, total_ht, image_url, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [l.id, l.document_id, l.product_id, l.label, l.description, l.quantity, l.unit_price, l.tva_rate, l.discount_type, l.discount_value, l.total_ht, l.image_url, l.created_at]
          );
        }
      }
    }
    
    onProgress?.('Fusion des clients...', 60);
    const importedClients = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM clients');
    console.log('[ArchiveVault] Merging', importedClients.length, 'clients');
    
    for (const c of importedClients) {
      const existing = await targetDb.getFirstAsync<{ id: number }>(
        'SELECT id FROM clients WHERE id = ?',
        [c.id as number]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO clients (id, name, company, siret, tva_number, email, phone, address, city, postal_code, country, delivery_address, delivery_city, delivery_postal_code, delivery_country, notes, siren, is_test, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.name, c.company, c.siret, c.tva_number, c.email, c.phone, c.address, c.city, c.postal_code, c.country, c.delivery_address, c.delivery_city, c.delivery_postal_code, c.delivery_country, c.notes, c.siren, c.is_test, c.created_at, c.updated_at]
        );
      }
    }
    
    onProgress?.('Fusion des produits...', 70);
    const importedProducts = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM products');
    console.log('[ArchiveVault] Merging', importedProducts.length, 'products');
    
    for (const p of importedProducts) {
      const existing = await targetDb.getFirstAsync<{ id: number }>(
        'SELECT id FROM products WHERE id = ?',
        [p.id as number]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO products (id, name, description, unit_price, unit, tva_rate, is_service, unit_weight_kg, is_test, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.id, p.name, p.description, p.unit_price, p.unit, p.tva_rate, p.is_service, p.unit_weight_kg, p.is_test, p.created_at, p.updated_at]
        );
      }
    }
    
    onProgress?.('Fusion des bons de livraison...', 80);
    const importedNotes = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM delivery_notes');
    console.log('[ArchiveVault] Merging', importedNotes.length, 'delivery notes');
    
    for (const n of importedNotes) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM delivery_notes WHERE id = ?',
        [n.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO delivery_notes (id, number, status, created_at, sent_at, invoice_id, total_weight_kg, ship_to_name, ship_to_address, ship_to_phone, ship_from_name, ship_from_address, ship_from_phone, label_pdf_path, invoice_pdf_path, bundle_pdf_path, is_test)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [n.id, n.number, n.status, n.created_at, n.sent_at, n.invoice_id, n.total_weight_kg, n.ship_to_name, n.ship_to_address, n.ship_to_phone, n.ship_from_name, n.ship_from_address, n.ship_from_phone, n.label_pdf_path, n.invoice_pdf_path, n.bundle_pdf_path, n.is_test]
        );
        
        const noteLines = await importedDb.getAllAsync<Record<string, BindValue>>(
          'SELECT * FROM delivery_note_lines WHERE delivery_note_id = ?',
          [n.id as string]
        );
        
        for (const line of noteLines) {
          await targetDb.runAsync(
            `INSERT INTO delivery_note_lines (id, delivery_note_id, product_id, label, qty, unit, unit_weight_kg, line_weight_kg)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [line.id, line.delivery_note_id, line.product_id, line.label, line.qty, line.unit, line.unit_weight_kg, line.line_weight_kg]
          );
        }
      }
    }
    
    onProgress?.('Fusion des facturations partagées...', 85);
    const importedSplits = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM document_splits');
    console.log('[ArchiveVault] Merging', importedSplits.length, 'document splits');
    
    for (const s of importedSplits) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM document_splits WHERE id = ?',
        [s.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO document_splits (id, master_id, number_full, suffix, client_id, allocation_mode, allocation_value, total_ht, total_tva, total_ttc, status, payment_ref, payment_method, paid_at, sent_at, pdf_path, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, s.master_id, s.number_full, s.suffix, s.client_id, s.allocation_mode, s.allocation_value, s.total_ht, s.total_tva, s.total_ttc, s.status, s.payment_ref, s.payment_method, s.paid_at, s.sent_at, s.pdf_path, s.created_at, s.updated_at]
        );
        
        const lineAssignments = await importedDb.getAllAsync<Record<string, BindValue>>(
          'SELECT * FROM split_line_assignments WHERE split_id = ?',
          [s.id as string]
        );
        
        for (const la of lineAssignments) {
          await targetDb.runAsync(
            `INSERT INTO split_line_assignments (id, split_id, line_item_id, product_id, label, description, quantity, unit_price, tva_rate, discount_type, discount_value, total_ht, allocation_percentage, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [la.id, la.split_id, la.line_item_id, la.product_id, la.label, la.description, la.quantity, la.unit_price, la.tva_rate, la.discount_type, la.discount_value, la.total_ht, la.allocation_percentage, la.created_at]
          );
        }
      }
    }
    
    onProgress?.('Fusion des règles d\'allocation...', 88);
    const importedSnapshots = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM allocation_rule_snapshots');
    console.log('[ArchiveVault] Merging', importedSnapshots.length, 'allocation rule snapshots');
    
    for (const snap of importedSnapshots) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM allocation_rule_snapshots WHERE id = ?',
        [snap.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO allocation_rule_snapshots (id, master_id, mode, parameters_json, computed_values_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [snap.id, snap.master_id, snap.mode, snap.parameters_json, snap.computed_values_json, snap.created_at]
        );
      }
    }
    
    onProgress?.('Fusion des rappels...', 90);
    const importedReminders = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM reminder_history');
    console.log('[ArchiveVault] Merging', importedReminders.length, 'reminder history records');
    
    for (const r of importedReminders) {
      const existing = await targetDb.getFirstAsync<{ id: number }>(
        'SELECT id FROM reminder_history WHERE id = ?',
        [r.id as number]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO reminder_history (id, document_id, level, sent_at, recipient_email, subject, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [r.id, r.document_id, r.level, r.sent_at, r.recipient_email, r.subject, r.created_at]
        );
      }
    }
    
    onProgress?.('Fusion des enveloppes e-facture...', 92);
    const importedEnvelopes = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM e_invoice_envelopes');
    console.log('[ArchiveVault] Merging', importedEnvelopes.length, 'e-invoice envelopes');
    
    for (const env of importedEnvelopes) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM e_invoice_envelopes WHERE id = ?',
        [env.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO e_invoice_envelopes (id, invoice_id, format, direction, status, provider, file_path, xml_content, checksum, pdp_reference, provider_message_id, error_message, submitted_at, delivered_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [env.id, env.invoice_id, env.format, env.direction, env.status, env.provider, env.file_path, env.xml_content, env.checksum, env.pdp_reference, env.provider_message_id, env.error_message, env.submitted_at, env.delivered_at, env.created_at, env.updated_at]
        );
        
        const statusEvents = await importedDb.getAllAsync<Record<string, BindValue>>(
          'SELECT * FROM einvoice_status_events WHERE envelope_id = ?',
          [env.id as string]
        );
        
        for (const evt of statusEvents) {
          await targetDb.runAsync(
            `INSERT INTO einvoice_status_events (id, envelope_id, status, message, payload_json, occurred_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [evt.id, evt.envelope_id, evt.status, evt.message, evt.payload_json, evt.occurred_at]
          );
        }
      }
    }
    
    onProgress?.('Fusion des logs d\'audit...', 94);
    const importedAuditLogs = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM audit_log');
    console.log('[ArchiveVault] Merging', importedAuditLogs.length, 'audit log records');
    
    for (const log of importedAuditLogs) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM audit_log WHERE id = ?',
        [log.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO audit_log (id, action, entity_type, entity_id, old_value, new_value, user_id, user_name, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [log.id, log.action, log.entity_type, log.entity_id, log.old_value, log.new_value, log.user_id, log.user_name, log.metadata, log.created_at]
        );
      }
    }
    
    onProgress?.('Fusion de la file de synchronisation...', 96);
    const importedSyncOutbox = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM sync_outbox');
    console.log('[ArchiveVault] Merging', importedSyncOutbox.length, 'sync outbox records');
    
    for (const sync of importedSyncOutbox) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM sync_outbox WHERE id = ?',
        [sync.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO sync_outbox (id, entity_type, entity_id, operation, payload, status, retry_count, last_error, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sync.id, sync.entity_type, sync.entity_id, sync.operation, sync.payload, sync.status, sync.retry_count, sync.last_error, sync.created_at, sync.updated_at]
        );
      }
    }
    
    onProgress?.('Fusion des métadonnées de fichiers...', 96);
    const importedFileMetadata = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM file_metadata');
    console.log('[ArchiveVault] Merging', importedFileMetadata.length, 'file metadata records');
    
    for (const fm of importedFileMetadata) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM file_metadata WHERE id = ?',
        [fm.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO file_metadata (id, original_path, storage_path, file_name, file_type, mime_type, size, hash, thumbnail_path, entity_type, entity_id, year, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [fm.id, fm.original_path, fm.storage_path, fm.file_name, fm.file_type, fm.mime_type, fm.size, fm.hash, fm.thumbnail_path, fm.entity_type, fm.entity_id, fm.year, fm.created_at]
        );
      }
    }
    
    onProgress?.('Fusion des configurations d\'acompte...', 97);
    const importedDepositConfigs = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM deposit_configs');
    console.log('[ArchiveVault] Merging', importedDepositConfigs.length, 'deposit configs');
    
    for (const dc of importedDepositConfigs) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM deposit_configs WHERE id = ?',
        [dc.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO deposit_configs (id, quote_id, enabled, mode, value, installment_count, distribution, total_deposit_amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [dc.id, dc.quote_id, dc.enabled, dc.mode, dc.value, dc.installment_count, dc.distribution, dc.total_deposit_amount, dc.created_at, dc.updated_at]
        );
        
        const installments = await importedDb.getAllAsync<Record<string, BindValue>>(
          'SELECT * FROM deposit_installments WHERE config_id = ?',
          [dc.id as string]
        );
        
        for (const inst of installments) {
          await targetDb.runAsync(
            `INSERT INTO deposit_installments (id, config_id, installment_index, amount, percentage, due_date, is_generated, master_invoice_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [inst.id, inst.config_id, inst.installment_index, inst.amount, inst.percentage, inst.due_date, inst.is_generated, inst.master_invoice_id, inst.created_at, inst.updated_at]
          );
        }
      }
    }
    
    onProgress?.('Fusion des factures d\'acompte...', 98);
    const importedDepositInvoices = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM deposit_invoices');
    console.log('[ArchiveVault] Merging', importedDepositInvoices.length, 'deposit invoices');
    
    for (const di of importedDepositInvoices) {
      const existing = await targetDb.getFirstAsync<{ id: string }>(
        'SELECT id FROM deposit_invoices WHERE id = ?',
        [di.id as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO deposit_invoices (id, quote_id, invoice_id, billing_ref, stage, installment_index, is_master, master_invoice_id, client_index, amount, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [di.id, di.quote_id, di.invoice_id, di.billing_ref, di.stage, di.installment_index, di.is_master, di.master_invoice_id, di.client_index, di.amount, di.created_at]
        );
      }
    }
    
    onProgress?.('Fusion des paramètres...', 99);
    const importedSettings = await importedDb.getAllAsync<Record<string, BindValue>>('SELECT * FROM settings');
    console.log('[ArchiveVault] Merging', importedSettings.length, 'settings');
    
    for (const s of importedSettings) {
      const existing = await targetDb.getFirstAsync<{ key: string }>(
        'SELECT key FROM settings WHERE key = ?',
        [s.key as string]
      );
      
      if (!existing) {
        await targetDb.runAsync(
          `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)`,
          [s.key, s.value, s.updated_at]
        );
      }
    }
    
    console.log('[ArchiveVault] Database merge completed for year:', year);
    
  } finally {
    // Only close the imported temp database, NOT the target database
    // The target database is managed by initYearDatabase and should stay open
    await importedDb.closeAsync();
  }
}

export async function verifyArchiveIntegrity(
  vaultPath: string,
  pin: string
): Promise<{ valid: boolean; errors: string[] }> {
  if (Platform.OS === 'web') {
    return { valid: false, errors: ['Verification not supported on web'] };
  }
  
  const errors: string[] = [];
  
  try {
    const vaultContent = await FileSystemLegacy.readAsStringAsync(vaultPath);
    const vaultData = JSON.parse(vaultContent);
    
    let salt: Uint8Array;
    if (vaultData.salt) {
      salt = base64ToUint8Array(vaultData.salt);
    } else {
      const saltMatch = vaultData.manifest.match(/saltBase64":"([^"]+)"/);
      if (!saltMatch) {
        return { valid: false, errors: ['Could not extract salt from manifest'] };
      }
      salt = base64ToUint8Array(saltMatch[1]);
    }
    
    const key = await deriveKeyFromPin(pin, salt);
    
    try {
      const manifestJson = xorDecrypt(vaultData.manifest, key);
      JSON.parse(manifestJson);
    } catch {
      return { valid: false, errors: ['Invalid PIN or corrupted archive'] };
    }
    
    return { valid: errors.length === 0, errors };
    
  } catch (error) {
    return { 
      valid: false, 
      errors: [`Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`] 
    };
  }
}

export async function getArchiveInfo(vaultPath: string): Promise<{
  year: number;
  createdAt: string;
  filesCount: number;
  totalSize: number;
} | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  
  try {
    const fileInfo = await FileSystemLegacy.getInfoAsync(vaultPath);
    if (!fileInfo.exists) return null;
    
    return {
      year: parseInt(vaultPath.match(/Archive_(\d+)/)?.[1] || '0', 10),
      createdAt: new Date().toISOString(),
      filesCount: 0,
      totalSize: (fileInfo as { size?: number }).size || 0,
    };
  } catch {
    return null;
  }
}

export async function listAvailableArchives(): Promise<string[]> {
  if (Platform.OS === 'web') {
    return [];
  }
  
  try {
    const archivesDir = await getArchivesDir();
    const files = await listFilesInDirectory(archivesDir);
    return files
      .filter(f => f.endsWith('.vault'))
      .map(f => `${archivesDir}/${f}`);
  } catch {
    return [];
  }
}

export async function deleteArchive(vaultPath: string): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  
  try {
    await FileSystemLegacy.deleteAsync(vaultPath, { idempotent: true });
    console.log('[ArchiveVault] Archive deleted:', vaultPath);
  } catch (error) {
    console.error('[ArchiveVault] Error deleting archive:', error);
    throw error;
  }
}
