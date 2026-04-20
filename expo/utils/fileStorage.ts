import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { FileMetadata } from '@/types/archive';

function getBaseDir(): string {
  if (Platform.OS === 'web') return '';
  return FileSystemLegacy.documentDirectory || '';
}

function getAttachmentsBaseDir(): string {
  return `${getBaseDir()}attachments`;
}

function getThumbnailsBaseDir(): string {
  return `${getBaseDir()}thumbnails`;
}

export async function ensureDirectoryExists(dirPath: string): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[FileStorage] Web platform - skipping directory creation');
    return;
  }
  
  const info = await FileSystemLegacy.getInfoAsync(dirPath);
  if (!info.exists) {
    await FileSystemLegacy.makeDirectoryAsync(dirPath, { intermediates: true });
    console.log('[FileStorage] Created directory:', dirPath);
  }
}

export async function getAttachmentsDir(year: number): Promise<string> {
  const dir = `${getAttachmentsBaseDir()}/${year}`;
  await ensureDirectoryExists(dir);
  return dir;
}

export async function getThumbnailsDir(year: number): Promise<string> {
  const dir = `${getThumbnailsBaseDir()}/${year}`;
  await ensureDirectoryExists(dir);
  return dir;
}

export async function computeFileHash(filePath: string): Promise<string> {
  if (Platform.OS === 'web') {
    return `web-hash-${Date.now()}`;
  }
  
  try {
    const fileContent = await FileSystemLegacy.readAsStringAsync(filePath, {
      encoding: FileSystemLegacy.EncodingType.Base64,
    });
    
    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      fileContent
    );
    
    return hash;
  } catch (error) {
    console.error('[FileStorage] Error computing hash:', error);
    throw error;
  }
}

export async function computeStringHash(content: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    content
  );
  return hash;
}

export function generateFileId(): string {
  return `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function getFileExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function getMimeType(extension: string): string {
  const mimeTypes: Record<string, string> = {
    'pdf': 'application/pdf',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'xml': 'application/xml',
    'json': 'application/json',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

export function getFileType(extension: string): FileMetadata['fileType'] {
  if (extension === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(extension)) return 'photo';
  if (extension === 'xml') return 'xml';
  return 'other';
}

export async function storeFile(
  sourceUri: string,
  entityType: FileMetadata['entityType'],
  entityId: string | number,
  year: number,
  originalFileName?: string
): Promise<FileMetadata> {
  if (Platform.OS === 'web') {
    return createWebMockMetadata(sourceUri, entityType, entityId, year);
  }
  
  const attachmentsDir = await getAttachmentsDir(year);
  const fileId = generateFileId();
  const extension = getFileExtension(originalFileName || sourceUri);
  const fileName = `${entityType}_${entityId}_${fileId}.${extension}`;
  const storagePath = `${attachmentsDir}/${fileName}`;
  
  await FileSystemLegacy.copyAsync({
    from: sourceUri,
    to: storagePath,
  });
  
  const fileInfo = await FileSystemLegacy.getInfoAsync(storagePath);
  const hash = await computeFileHash(storagePath);
  
  let thumbnailPath: string | undefined;
  if (getFileType(extension) === 'photo') {
    thumbnailPath = await generateThumbnail(storagePath, year, fileId);
  }
  
  const metadata: FileMetadata = {
    id: fileId,
    originalPath: sourceUri,
    storagePath,
    fileName,
    fileType: getFileType(extension),
    mimeType: getMimeType(extension),
    size: (fileInfo as { size?: number }).size || 0,
    hash,
    thumbnailPath,
    entityType,
    entityId,
    year,
    createdAt: new Date().toISOString(),
  };
  
  console.log('[FileStorage] File stored:', metadata);
  return metadata;
}

function createWebMockMetadata(
  sourceUri: string,
  entityType: FileMetadata['entityType'],
  entityId: string | number,
  year: number
): FileMetadata {
  return {
    id: generateFileId(),
    originalPath: sourceUri,
    storagePath: sourceUri,
    fileName: sourceUri.split('/').pop() || 'unknown',
    fileType: 'photo',
    mimeType: 'image/jpeg',
    size: 0,
    hash: `web-hash-${Date.now()}`,
    entityType,
    entityId,
    year,
    createdAt: new Date().toISOString(),
  };
}

export async function generateThumbnail(
  imagePath: string,
  year: number,
  fileId: string
): Promise<string | undefined> {
  if (Platform.OS === 'web') {
    return undefined;
  }
  
  try {
    const thumbnailsDir = await getThumbnailsDir(year);
    const thumbnailPath = `${thumbnailsDir}/thumb_${fileId}.jpg`;
    
    await FileSystemLegacy.copyAsync({
      from: imagePath,
      to: thumbnailPath,
    });
    
    console.log('[FileStorage] Thumbnail created:', thumbnailPath);
    return thumbnailPath;
  } catch (error) {
    console.error('[FileStorage] Error generating thumbnail:', error);
    return undefined;
  }
}

export async function deleteFile(filePath: string): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[FileStorage] Web platform - skipping file deletion');
    return;
  }
  
  try {
    const info = await FileSystemLegacy.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystemLegacy.deleteAsync(filePath, { idempotent: true });
      console.log('[FileStorage] File deleted:', filePath);
    }
  } catch (error) {
    console.error('[FileStorage] Error deleting file:', error);
  }
}

export async function getFileSize(filePath: string): Promise<number> {
  if (Platform.OS === 'web') {
    return 0;
  }
  
  try {
    const info = await FileSystemLegacy.getInfoAsync(filePath);
    return (info as { size?: number }).size || 0;
  } catch {
    return 0;
  }
}

export async function getDirectorySize(dirPath: string): Promise<number> {
  if (Platform.OS === 'web') {
    return 0;
  }
  
  try {
    const info = await FileSystemLegacy.getInfoAsync(dirPath);
    if (!info.exists) return 0;
    
    const files = await FileSystemLegacy.readDirectoryAsync(dirPath);
    let totalSize = 0;
    
    for (const file of files) {
      const filePath = `${dirPath}/${file}`;
      const fileInfo = await FileSystemLegacy.getInfoAsync(filePath);
      
      if (fileInfo.isDirectory) {
        totalSize += await getDirectorySize(filePath);
      } else {
        totalSize += (fileInfo as { size?: number }).size || 0;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('[FileStorage] Error getting directory size:', error);
    return 0;
  }
}

export async function listFilesInDirectory(dirPath: string): Promise<string[]> {
  if (Platform.OS === 'web') {
    return [];
  }
  
  try {
    const info = await FileSystemLegacy.getInfoAsync(dirPath);
    if (!info.exists) return [];
    
    return await FileSystemLegacy.readDirectoryAsync(dirPath);
  } catch {
    return [];
  }
}

export async function copyDirectory(
  sourceDir: string,
  destDir: string
): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[FileStorage] Web platform - skipping directory copy');
    return;
  }
  
  await ensureDirectoryExists(destDir);
  
  const files = await listFilesInDirectory(sourceDir);
  
  for (const file of files) {
    const sourcePath = `${sourceDir}/${file}`;
    const destPath = `${destDir}/${file}`;
    const info = await FileSystemLegacy.getInfoAsync(sourcePath);
    
    if (info.isDirectory) {
      await copyDirectory(sourcePath, destPath);
    } else {
      await FileSystemLegacy.copyAsync({ from: sourcePath, to: destPath });
    }
  }
}

export async function verifyFileHash(
  filePath: string,
  expectedHash: string
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return true;
  }
  
  try {
    const actualHash = await computeFileHash(filePath);
    return actualHash === expectedHash;
  } catch {
    return false;
  }
}

export async function cleanupOrphanedFiles(
  year: number,
  validFileIds: Set<string>
): Promise<number> {
  if (Platform.OS === 'web') {
    return 0;
  }
  
  let deletedCount = 0;
  const attachmentsDir = await getAttachmentsDir(year);
  const files = await listFilesInDirectory(attachmentsDir);
  
  for (const file of files) {
    const fileIdMatch = file.match(/_([a-z0-9_]+)\./);
    if (fileIdMatch && !validFileIds.has(fileIdMatch[1])) {
      await deleteFile(`${attachmentsDir}/${file}`);
      deletedCount++;
    }
  }
  
  console.log('[FileStorage] Cleaned up orphaned files:', deletedCount);
  return deletedCount;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 o';
  
  const units = ['o', 'Ko', 'Mo', 'Go'];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${units[i]}`;
}
