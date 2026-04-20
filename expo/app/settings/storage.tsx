import { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { Stack } from 'expo-router';
import { 
  HardDrive, 
  Database, 
  Image, 
  FileText, 
  Trash2, 
  RefreshCw,
  AlertTriangle
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { formatFileSize, getDirectorySize } from '@/utils/fileStorage';
import { getAvailableYears, vacuumDatabase } from '@/db/multiYearDatabase';
import { cleanupOrphanedPhotos } from '@/db/migration';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { Paths } from 'expo-file-system';

interface StorageBreakdown {
  databases: number;
  attachments: number;
  thumbnails: number;
  archives: number;
  cache: number;
  total: number;
}

export default function StorageScreen() {
  const [loading, setLoading] = useState(true);
  const [storage, setStorage] = useState<StorageBreakdown>({
    databases: 0,
    attachments: 0,
    thumbnails: 0,
    archives: 0,
    cache: 0,
    total: 0,
  });
  const [cleaning, setCleaning] = useState(false);

  const loadStorageInfo = useCallback(async () => {
    setLoading(true);
    
    if (Platform.OS === 'web') {
      setStorage({
        databases: 0,
        attachments: 0,
        thumbnails: 0,
        archives: 0,
        cache: 0,
        total: 0,
      });
      setLoading(false);
      return;
    }
    
    try {
      const baseDir = Paths.document.uri;
      
      const dbDir = `${baseDir}SQLite`;
      const attachmentsDir = `${baseDir}attachments`;
      const thumbnailsDir = `${baseDir}thumbnails`;
      const archivesDir = `${baseDir}archives`;
      const cacheDirPath = Paths.cache.uri;
      
      const [databases, attachments, thumbnails, archives, cache] = await Promise.all([
        getDirectorySize(dbDir),
        getDirectorySize(attachmentsDir),
        getDirectorySize(thumbnailsDir),
        getDirectorySize(archivesDir),
        getDirectorySize(cacheDirPath),
      ]);
      
      setStorage({
        databases,
        attachments,
        thumbnails,
        archives,
        cache,
        total: databases + attachments + thumbnails + archives + cache,
      });
    } catch (err) {
      console.error('[Storage] Error loading storage info:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStorageInfo();
  }, [loadStorageInfo]);

  const handleCleanCache = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Non disponible', 'Cette fonction n\'est pas disponible sur le web');
      return;
    }
    
    Alert.alert(
      'Nettoyer le cache',
      'Supprimer tous les fichiers temporaires ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Nettoyer',
          style: 'destructive',
          onPress: async () => {
            setCleaning(true);
            try {
              const cacheDirPath = Paths.cache.uri;
              const files = await FileSystemLegacy.readDirectoryAsync(cacheDirPath);
              
              for (const file of files) {
                await FileSystemLegacy.deleteAsync(`${cacheDirPath}${file}`, { idempotent: true });
              }
              
              Alert.alert('Succès', 'Cache nettoyé');
              loadStorageInfo();
            } catch (err) {
              console.error('[Storage] Clean cache error:', err);
              Alert.alert('Erreur', 'Impossible de nettoyer le cache');
            } finally {
              setCleaning(false);
            }
          }
        }
      ]
    );
  };

  const handleCleanOrphans = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Non disponible', 'Cette fonction n\'est pas disponible sur le web');
      return;
    }
    
    Alert.alert(
      'Nettoyer les fichiers orphelins',
      'Supprimer les photos et fichiers non référencés dans la base de données ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Nettoyer',
          style: 'destructive',
          onPress: async () => {
            setCleaning(true);
            try {
              const years = await getAvailableYears();
              let totalDeleted = 0;
              
              for (const year of years) {
                const deleted = await cleanupOrphanedPhotos(year);
                totalDeleted += deleted;
              }
              
              Alert.alert('Succès', `${totalDeleted} fichiers orphelins supprimés`);
              loadStorageInfo();
            } catch (err) {
              console.error('[Storage] Clean orphans error:', err);
              Alert.alert('Erreur', 'Impossible de nettoyer les fichiers');
            } finally {
              setCleaning(false);
            }
          }
        }
      ]
    );
  };

  const handleOptimizeDatabases = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Non disponible', 'Cette fonction n\'est pas disponible sur le web');
      return;
    }
    
    Alert.alert(
      'Optimiser les bases de données',
      'Exécuter VACUUM sur toutes les bases pour réduire leur taille ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Optimiser',
          onPress: async () => {
            setCleaning(true);
            try {
              const years = await getAvailableYears();
              
              for (const year of years) {
                await vacuumDatabase(year);
              }
              
              Alert.alert('Succès', 'Bases de données optimisées');
              loadStorageInfo();
            } catch (err) {
              console.error('[Storage] Optimize error:', err);
              Alert.alert('Erreur', 'Impossible d\'optimiser les bases');
            } finally {
              setCleaning(false);
            }
          }
        }
      ]
    );
  };

  const handleCleanThumbnails = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Non disponible', 'Cette fonction n\'est pas disponible sur le web');
      return;
    }
    
    Alert.alert(
      'Supprimer les miniatures',
      'Les miniatures seront régénérées automatiquement. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setCleaning(true);
            try {
              const baseDir = Paths.document.uri;
              const thumbnailsDir = `${baseDir}thumbnails`;
              
              await FileSystemLegacy.deleteAsync(thumbnailsDir, { idempotent: true });
              
              Alert.alert('Succès', 'Miniatures supprimées');
              loadStorageInfo();
            } catch (err) {
              console.error('[Storage] Clean thumbnails error:', err);
              Alert.alert('Erreur', 'Impossible de supprimer les miniatures');
            } finally {
              setCleaning(false);
            }
          }
        }
      ]
    );
  };

  const getPercentage = (value: number) => {
    if (storage.total === 0) return 0;
    return Math.round((value / storage.total) * 100);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Stockage' }} />
      
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.totalCard}>
          <HardDrive size={32} color={Colors.light.tint} />
          <Text style={styles.totalLabel}>Espace utilisé</Text>
          <Text style={styles.totalValue}>{formatFileSize(storage.total)}</Text>
          
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={loadStorageInfo}
          >
            <RefreshCw size={16} color={Colors.light.tint} />
            <Text style={styles.refreshText}>Actualiser</Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.breakdownCard}>
          <Text style={styles.sectionTitle}>Répartition</Text>
          
          <View style={styles.breakdownBar}>
            <View 
              style={[
                styles.breakdownSegment, 
                { flex: getPercentage(storage.databases) || 1, backgroundColor: '#3B82F6' }
              ]} 
            />
            <View 
              style={[
                styles.breakdownSegment, 
                { flex: getPercentage(storage.attachments) || 1, backgroundColor: '#10B981' }
              ]} 
            />
            <View 
              style={[
                styles.breakdownSegment, 
                { flex: getPercentage(storage.thumbnails) || 1, backgroundColor: '#F59E0B' }
              ]} 
            />
            <View 
              style={[
                styles.breakdownSegment, 
                { flex: getPercentage(storage.archives) || 1, backgroundColor: '#8B5CF6' }
              ]} 
            />
            <View 
              style={[
                styles.breakdownSegment, 
                { flex: getPercentage(storage.cache) || 1, backgroundColor: '#EF4444' }
              ]} 
            />
          </View>
          
          <View style={styles.breakdownList}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#3B82F6' }]} />
              <Database size={16} color="#3B82F6" />
              <Text style={styles.breakdownLabel}>Bases de données</Text>
              <Text style={styles.breakdownValue}>{formatFileSize(storage.databases)}</Text>
            </View>
            
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#10B981' }]} />
              <Image size={16} color="#10B981" />
              <Text style={styles.breakdownLabel}>Pièces jointes</Text>
              <Text style={styles.breakdownValue}>{formatFileSize(storage.attachments)}</Text>
            </View>
            
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#F59E0B' }]} />
              <Image size={16} color="#F59E0B" />
              <Text style={styles.breakdownLabel}>Miniatures</Text>
              <Text style={styles.breakdownValue}>{formatFileSize(storage.thumbnails)}</Text>
            </View>
            
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#8B5CF6' }]} />
              <FileText size={16} color="#8B5CF6" />
              <Text style={styles.breakdownLabel}>Archives</Text>
              <Text style={styles.breakdownValue}>{formatFileSize(storage.archives)}</Text>
            </View>
            
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: '#EF4444' }]} />
              <Trash2 size={16} color="#EF4444" />
              <Text style={styles.breakdownLabel}>Cache</Text>
              <Text style={styles.breakdownValue}>{formatFileSize(storage.cache)}</Text>
            </View>
          </View>
        </View>
        
        <Text style={styles.sectionTitle}>Nettoyage</Text>
        
        <View style={styles.actionsCard}>
          <TouchableOpacity 
            style={styles.actionItem}
            onPress={handleCleanCache}
            disabled={cleaning}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EF444420' }]}>
              <Trash2 size={20} color="#EF4444" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Vider le cache</Text>
              <Text style={styles.actionDescription}>
                Libérer {formatFileSize(storage.cache)}
              </Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionItem}
            onPress={handleCleanOrphans}
            disabled={cleaning}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F59E0B20' }]}>
              <AlertTriangle size={20} color="#F59E0B" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Fichiers orphelins</Text>
              <Text style={styles.actionDescription}>
                Supprimer les fichiers non référencés
              </Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionItem}
            onPress={handleCleanThumbnails}
            disabled={cleaning}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#10B98120' }]}>
              <Image size={20} color="#10B981" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Supprimer miniatures</Text>
              <Text style={styles.actionDescription}>
                Libérer {formatFileSize(storage.thumbnails)} (régénérées auto.)
              </Text>
            </View>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionItem, styles.actionItemLast]}
            onPress={handleOptimizeDatabases}
            disabled={cleaning}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#3B82F620' }]}>
              <Database size={20} color="#3B82F6" />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionLabel}>Optimiser les bases</Text>
              <Text style={styles.actionDescription}>
                Compacter et réduire la taille
              </Text>
            </View>
          </TouchableOpacity>
        </View>
        
        {cleaning && (
          <View style={styles.cleaningOverlay}>
            <ActivityIndicator size="small" color={Colors.light.tint} />
            <Text style={styles.cleaningText}>Nettoyage en cours...</Text>
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  totalCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  totalLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 12,
  },
  totalValue: {
    fontSize: 32,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginTop: 4,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.tint + '15',
    borderRadius: 20,
    gap: 6,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  breakdownCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  breakdownBar: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 16,
  },
  breakdownSegment: {
    height: '100%',
  },
  breakdownList: {
    gap: 12,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  actionsCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  actionItemLast: {
    borderBottomWidth: 0,
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  actionDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  cleaningOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint + '15',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  cleaningText: {
    fontSize: 14,
    color: Colors.light.tint,
    fontWeight: '500' as const,
  },
});
