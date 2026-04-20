import { useState, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Platform, Modal, TextInput, Animated } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Download, Upload, Database, Calendar, FileJson, FolderOpen, CheckCircle, AlertTriangle, Lock, Eye, EyeOff, Shield, X } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { exportAllData, importAllData } from '@/db/settings';

const ENCRYPTION_PREFIX = 'NIKO_ENC_V2:';

const stringToBytes = (str: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return bytes;
};

const bytesToString = (bytes: number[]): string => {
  let str = '';
  let i = 0;
  while (i < bytes.length) {
    const byte = bytes[i];
    if (byte < 0x80) {
      str += String.fromCharCode(byte);
      i++;
    } else if ((byte & 0xe0) === 0xc0) {
      str += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[i + 1] & 0x3f));
      i += 2;
    } else if ((byte & 0xf0) === 0xe0) {
      str += String.fromCharCode(((byte & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f));
      i += 3;
    } else {
      const codePoint = ((byte & 0x07) << 18) | ((bytes[i + 1] & 0x3f) << 12) | ((bytes[i + 2] & 0x3f) << 6) | (bytes[i + 3] & 0x3f);
      str += String.fromCodePoint(codePoint);
      i += 4;
    }
  }
  return str;
};

const generateKey = async (password: string, salt: string): Promise<number[]> => {
  const combined = password + salt;
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
  const key: number[] = [];
  for (let i = 0; i < hash.length; i += 2) {
    key.push(parseInt(hash.substring(i, i + 2), 16));
  }
  return key;
};

const encryptDataAsync = async (data: string, password: string): Promise<string> => {
  const salt = Crypto.randomUUID().replace(/-/g, '');
  const key = await generateKey(password, salt);
  const dataBytes = stringToBytes(data);
  const encrypted: number[] = [];
  
  for (let i = 0; i < dataBytes.length; i++) {
    encrypted.push(dataBytes[i] ^ key[i % key.length]);
  }
  
  const encryptedBase64 = btoa(String.fromCharCode(...encrypted));
  return ENCRYPTION_PREFIX + salt + ':' + encryptedBase64;
};

const decryptDataAsync = async (encryptedData: string, password: string): Promise<string | null> => {
  try {
    if (!encryptedData.startsWith(ENCRYPTION_PREFIX)) {
      return encryptedData;
    }
    
    const withoutPrefix = encryptedData.substring(ENCRYPTION_PREFIX.length);
    const colonIndex = withoutPrefix.indexOf(':');
    if (colonIndex === -1) return null;
    
    const salt = withoutPrefix.substring(0, colonIndex);
    const encryptedBase64 = withoutPrefix.substring(colonIndex + 1);
    
    const key = await generateKey(password, salt);
    const encryptedBytes = atob(encryptedBase64).split('').map(c => c.charCodeAt(0));
    const decrypted: number[] = [];
    
    for (let i = 0; i < encryptedBytes.length; i++) {
      decrypted.push(encryptedBytes[i] ^ key[i % key.length]);
    }
    
    const result = bytesToString(decrypted);
    
    try {
      JSON.parse(result);
      return result;
    } catch {
      return null;
    }
  } catch (error) {
    console.error('[Backup] Decryption error:', error);
    return null;
  }
};

export default function BackupSettingsScreen() {
  const { db } = useDatabase();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showImportPasswordModal, setShowImportPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<string | null>(null);
  const [pendingImportFileName, setPendingImportFileName] = useState<string | null>(null);
  const modalAnimation = useRef(new Animated.Value(0)).current;

  const openModal = (isImport: boolean) => {
    if (isImport) {
      setShowImportPasswordModal(true);
    } else {
      setShowPasswordModal(true);
    }
    setPassword('');
    setConfirmPassword('');
    Animated.spring(modalAnimation, {
      toValue: 1,
      useNativeDriver: true,
      tension: 65,
      friction: 10,
    }).start();
  };

  const closeModal = () => {
    Animated.timing(modalAnimation, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowPasswordModal(false);
      setShowImportPasswordModal(false);
      setPassword('');
      setConfirmPassword('');
      setPendingImportData(null);
      setPendingImportFileName(null);
    });
  };

  const isEncrypted = (data: string): boolean => {
    return data.startsWith(ENCRYPTION_PREFIX) || data.startsWith('NIKO_ENC_V1:');
  };

  const isV1Encrypted = (data: string): boolean => {
    return data.startsWith('NIKO_ENC_V1:');
  };

  const exportMutation = useMutation({
    mutationFn: async (encryptionPassword: string) => {
      if (!db) throw new Error('Database not ready');
      console.log('[Backup] Starting export...');
      const rawData = await exportAllData(db);
      
      console.log('[Backup] Encrypting data...');
      const data = await encryptDataAsync(rawData, encryptionPassword);
      
      console.log('[Backup] Export successful, preparing file...');
      console.log('[Backup] Platform:', Platform.OS);
      
      if (Platform.OS === 'web') {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `niko_backup_${new Date().toISOString().split('T')[0]}.niko`;
        a.click();
        URL.revokeObjectURL(url);
        return { success: true, platform: 'web' };
      } else {
        const fileName = `niko_backup_${new Date().toISOString().split('T')[0]}_${Date.now()}.niko`;
        const file = new File(Paths.cache, fileName);
        
        console.log('[Backup] Writing file to:', file.uri);
        
        file.create({ overwrite: true });
        file.write(data);
        
        console.log('[Backup] File created:', file.exists);
        
        if (!file.exists) {
          throw new Error('Le fichier n\'a pas pu être créé');
        }
        
        const fileUri = file.uri;
        
        const isAvailable = await Sharing.isAvailableAsync();
        console.log('[Backup] Sharing available:', isAvailable);
        
        if (!isAvailable) {
          throw new Error('Le partage n\'est pas disponible sur cet appareil');
        }
        
        console.log('[Backup] Opening share dialog with file:', fileUri);
        
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/octet-stream',
          dialogTitle: 'Enregistrer la sauvegarde chiffrée',
          UTI: 'public.data',
        });
        
        console.log('[Backup] Share dialog closed');
        
        try {
          file.delete();
        } catch (e) {
          console.log('[Backup] Could not delete temp file:', e);
        }
        
        return { success: true, platform: 'native' };
      }
    },
    onSuccess: (result) => {
      console.log('[Backup] Export completed:', result);
      setLastExport(new Date().toISOString());
      closeModal();
      if (result.platform === 'web') {
        Alert.alert('Succès', 'Sauvegarde chiffrée téléchargée');
      }
    },
    onError: (error) => {
      console.error('[Backup] Export error:', error);
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible d\'exporter les données');
    },
  });

  const importMutation = useMutation({
    mutationFn: async ({ encryptedData, decryptionPassword }: { encryptedData: string; decryptionPassword: string }) => {
      if (!db) throw new Error('Database not ready');
      console.log('[Backup] Starting import...');
      
      let jsonData = encryptedData;
      
      if (isEncrypted(encryptedData)) {
        console.log('[Backup] Data is encrypted, decrypting...');
        if (isV1Encrypted(encryptedData)) {
          throw new Error('Ce fichier utilise un ancien format de chiffrement (V1). Veuillez créer une nouvelle sauvegarde.');
        }
        const decrypted = await decryptDataAsync(encryptedData, decryptionPassword);
        if (!decrypted) {
          throw new Error('Mot de passe incorrect ou fichier corrompu');
        }
        jsonData = decrypted;
      }
      
      await importAllData(db, jsonData);
    },
    onSuccess: () => {
      console.log('[Backup] Import successful');
      setLastImport(new Date().toISOString());
      closeModal();
      queryClient.invalidateQueries();
      Alert.alert(
        'Succès',
        'Les données ont été restaurées avec succès. L\'application va être actualisée.',
        [
          {
            text: 'OK',
            onPress: () => {
              router.replace('/');
            },
          },
        ]
      );
    },
    onError: (error) => {
      console.error('[Backup] Import error:', error);
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible d\'importer les données');
    },
  });

  const handleImport = async () => {
    try {
      console.log('[Backup] Opening document picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        console.log('[Backup] Document picker cancelled');
        return;
      }

      const asset = result.assets[0];
      console.log('[Backup] File selected:', asset.name);

      try {
        let fileData: string;
        
        if (Platform.OS === 'web' && asset.file) {
          fileData = await asset.file.text();
        } else {
          console.log('[Backup] Reading file from:', asset.uri);
          const importFile = new File(asset.uri);
          fileData = await importFile.text();
          console.log('[Backup] File content length:', fileData.length);
        }
        
        if (isEncrypted(fileData)) {
          setPendingImportData(fileData);
          setPendingImportFileName(asset.name);
          openModal(true);
        } else {
          Alert.alert(
            'Confirmer la restauration',
            `Voulez-vous vraiment restaurer la sauvegarde "${asset.name}" ?\n\nAttention : Toutes vos données actuelles seront remplacées par celles de la sauvegarde. Cette action est irréversible.`,
            [
              {
                text: 'Annuler',
                style: 'cancel',
              },
              {
                text: 'Restaurer',
                style: 'destructive',
                onPress: () => {
                  importMutation.mutate({ encryptedData: fileData, decryptionPassword: '' });
                },
              },
            ]
          );
        }
      } catch (error) {
        console.error('[Backup] Error reading file:', error);
        Alert.alert('Erreur', 'Impossible de lire le fichier');
      }
    } catch (error) {
      console.error('[Backup] Document picker error:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir le sélecteur de fichiers');
    }
  };

  const handleExportWithPassword = () => {
    if (password.length < 4) {
      Alert.alert('Erreur', 'Le mot de passe doit contenir au moins 4 caractères');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }
    exportMutation.mutate(password);
  };

  const handleImportWithPassword = () => {
    if (!pendingImportData) return;
    if (password.length < 1) {
      Alert.alert('Erreur', 'Veuillez entrer le mot de passe');
      return;
    }
    
    Alert.alert(
      'Confirmer la restauration',
      `Voulez-vous vraiment restaurer la sauvegarde "${pendingImportFileName}" ?\n\nAttention : Toutes vos données actuelles seront remplacées.`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Restaurer',
          style: 'destructive',
          onPress: () => {
            importMutation.mutate({ encryptedData: pendingImportData, decryptionPassword: password });
          },
        },
      ]
    );
  };

  const formatDate = (dateString: string) => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateString));
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Sauvegarde' }} />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.infoCard}>
          <Database size={32} color={Colors.light.tint} />
          <Text style={styles.infoTitle}>Sauvegarde locale</Text>
          <Text style={styles.infoText}>
            Exportez toutes vos données (clients, produits, documents, paramètres) dans un fichier JSON que vous pouvez conserver en sécurité.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exporter</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => openModal(false)}
              disabled={exportMutation.isPending}
              testID="export-button"
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.tint + '15' }]}>
                {exportMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.light.tint} />
                ) : (
                  <Download size={22} color={Colors.light.tint} />
                )}
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>Exporter les données</Text>
                <Text style={styles.actionDescription}>
                  Sauvegarde chiffrée vers Fichiers, iCloud...
                </Text>
              </View>
              <FolderOpen size={20} color={Colors.light.textMuted} />
            </TouchableOpacity>
            
            {lastExport && (
              <View style={styles.lastAction}>
                <Calendar size={14} color={Colors.light.textSecondary} />
                <Text style={styles.lastActionText}>
                  Dernière export : {formatDate(lastExport)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Importer</Text>
          <View style={styles.card}>
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={handleImport}
              disabled={importMutation.isPending}
              testID="import-button"
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.success + '15' }]}>
                {importMutation.isPending ? (
                  <ActivityIndicator size="small" color={Colors.light.success} />
                ) : (
                  <Upload size={22} color={Colors.light.success} />
                )}
              </View>
              <View style={styles.actionContent}>
                <Text style={styles.actionTitle}>
                  Importer une sauvegarde
                </Text>
                <Text style={styles.actionDescription}>
                  Restaurer les données depuis un fichier JSON
                </Text>
              </View>
              <FileJson size={20} color={Colors.light.textMuted} />
            </TouchableOpacity>
            
            {lastImport && (
              <View style={[styles.lastAction, styles.lastActionSuccess]}>
                <CheckCircle size={14} color={Colors.light.success} />
                <Text style={[styles.lastActionText, { color: Colors.light.success }]}>
                  Dernière import : {formatDate(lastImport)}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.warningBox}>
          <AlertTriangle size={18} color={Colors.light.warning} />
          <View style={styles.warningContent}>
            <Text style={styles.warningTitle}>Important</Text>
            <Text style={styles.warningText}>
              L&apos;importation remplacera toutes vos données actuelles. Assurez-vous d&apos;avoir une sauvegarde récente avant de restaurer.
            </Text>
          </View>
        </View>

        <View style={styles.tipBox}>
          <Shield size={18} color={Colors.light.tint} />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Sécurité</Text>
            <Text style={styles.tipText}>
              Vos sauvegardes sont chiffrées avec un mot de passe. Conservez-le en lieu sûr, il est indispensable pour restaurer vos données.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showPasswordModal}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalContent,
              {
                opacity: modalAnimation,
                transform: [
                  {
                    scale: modalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <View style={styles.modalIconContainer}>
                <Lock size={24} color={Colors.light.tint} />
              </View>
              <Text style={styles.modalTitle}>Chiffrer la sauvegarde</Text>
              <Text style={styles.modalSubtitle}>
                Définissez un mot de passe pour protéger vos données
              </Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Mot de passe</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Entrez un mot de passe"
                  placeholderTextColor={Colors.light.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={Colors.light.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.light.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Confirmer le mot de passe</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirmez le mot de passe"
                  placeholderTextColor={Colors.light.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  exportMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleExportWithPassword}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Exporter</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>

      <Modal
        visible={showImportPasswordModal}
        transparent
        animationType="none"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <Animated.View
            style={[
              styles.modalContent,
              {
                opacity: modalAnimation,
                transform: [
                  {
                    scale: modalAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            <TouchableOpacity style={styles.closeButton} onPress={closeModal}>
              <X size={20} color={Colors.light.textMuted} />
            </TouchableOpacity>

            <View style={styles.modalHeader}>
              <View style={[styles.modalIconContainer, { backgroundColor: Colors.light.success + '15' }]}>
                <Lock size={24} color={Colors.light.success} />
              </View>
              <Text style={styles.modalTitle}>Déchiffrer la sauvegarde</Text>
              <Text style={styles.modalSubtitle}>
                Entrez le mot de passe utilisé lors de l&apos;export
              </Text>
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>Mot de passe</Text>
              <View style={styles.passwordInputWrapper}>
                <TextInput
                  style={styles.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Entrez le mot de passe"
                  placeholderTextColor={Colors.light.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.eyeButton}
                  onPress={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff size={20} color={Colors.light.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.light.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={closeModal}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.confirmButton,
                  { backgroundColor: Colors.light.success },
                  importMutation.isPending && styles.buttonDisabled,
                ]}
                onPress={handleImportWithPassword}
                disabled={importMutation.isPending}
              >
                {importMutation.isPending ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.confirmButtonText}>Déchiffrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  infoCard: {
    backgroundColor: Colors.light.tint + '10',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  lastAction: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.light.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 8,
  },
  lastActionSuccess: {
    backgroundColor: Colors.light.success + '10',
  },
  lastActionText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: Colors.light.warning + '15',
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 16,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.warning,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  tipBox: {
    flexDirection: 'row',
    backgroundColor: Colors.light.tint + '10',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.tint,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  closeButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    padding: 4,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  passwordInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  passwordInput: {
    flex: 1,
    padding: 14,
    fontSize: 16,
    color: Colors.light.text,
  },
  eyeButton: {
    padding: 14,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.surfaceSecondary,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
  },
  confirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
