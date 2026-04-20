import { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  View, 
  Text, 
  ScrollView, 
  TouchableOpacity, 
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  Keyboard,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Stack } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { 
  Archive, 
  Calendar, 
  Lock, 
  Unlock, 
  Download, 
  Upload, 
  Trash2,
  AlertCircle,
  HardDrive,
  FileArchive,
  Eye,
  X,
  Plus,
  ChevronDown
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { YearArchiveInfo } from '@/types/archive';
import { 
  getAvailableYears, 
  getYearArchiveInfo,
  setActiveYear,
  getActiveYear,
  initYearDatabase,
  setCurrentDatabase
} from '@/db/multiYearDatabase';
import { 
  createArchiveVault, 
  exportArchive, 
  importArchiveVault,
  deleteArchive,
  getVaultPath
} from '@/utils/archiveVault';
import { 
  closeYearAndCreateNew, 
  checkYearClosingEligibility,
  getYearSummary
} from '@/db/yearClosing';
import { formatFileSize } from '@/utils/fileStorage';

export default function ArchivesScreen() {
  const [years, setYears] = useState<YearArchiveInfo[]>([]);
  const [activeYear, setActiveYearState] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinAction, setPinAction] = useState<'archive' | 'import' | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [importUri, setImportUri] = useState<string | null>(null);
  
  const [yearPickerVisible, setYearPickerVisible] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const currentActive = await getActiveYear();
      setActiveYearState(currentActive);
      
      const availableYears = await getAvailableYears();
      const yearInfos: YearArchiveInfo[] = [];
      
      for (const year of availableYears) {
        const info = await getYearArchiveInfo(year);
        yearInfos.push(info);
      }
      
      setYears(yearInfos);
    } catch (error) {
      console.error('[Archives] Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSwitchYear = async (year: number) => {
    const yearInfo = years.find(y => y.year === year);
    if (yearInfo?.status === 'archived') {
      Alert.alert(
        'Année archivée',
        'Cette année est archivée. Voulez-vous la restaurer pour la consulter ?',
        [
          { text: 'Annuler', style: 'cancel' },
          { 
            text: 'Restaurer', 
            onPress: () => handleRestoreArchive(year)
          }
        ]
      );
      return;
    }
    
    try {
      // Initialize and switch to the year database
      console.log('[Archives] Switching to year:', year);
      const yearDb = await initYearDatabase(year);
      setCurrentDatabase(yearDb);
      await setActiveYear(year);
      setActiveYearState(year);
      Alert.alert('Succès', `Année ${year} activée`);
    } catch (err) {
      console.error('[Archives] Error switching year:', err);
      Alert.alert('Erreur', 'Impossible de changer d\'année');
    }
  };

  const handleCloseYear = async (year: number) => {
    const eligibility = await checkYearClosingEligibility(year);
    
    if (!eligibility.canClose) {
      Alert.alert('Impossible', eligibility.reason || 'Cette année ne peut pas être clôturée');
      return;
    }
    
    const summary = await getYearSummary(year);
    
    Alert.alert(
      `Clôturer ${year}`,
      `Récapitulatif:\n` +
      `• ${summary.documents.factures} factures (${summary.revenue.paid.toFixed(2)}€ encaissés)\n` +
      `• ${summary.documents.devis} devis\n` +
      `• ${summary.expenses.count} dépenses (${summary.expenses.total.toFixed(2)}€)\n` +
      `• ${summary.clients} clients, ${summary.products} produits\n\n` +
      `Les clients, produits et dépenses récurrentes seront copiés vers ${year + 1}.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Clôturer',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const result = await closeYearAndCreateNew(
                year,
                (msg, progress) => {
                  setProgressMessage(msg);
                  setProgressPercent(progress);
                }
              );
              
              if (result.success) {
                Alert.alert(
                  'Clôture réussie',
                  `Année ${year} clôturée.\n` +
                  `${result.clientsCopied} clients, ${result.productsCopied} produits, ` +
                  `${result.recurringExpensesCopied} dépenses récurrentes copiés vers ${result.newYear}.`
                );
                loadData();
              } else {
                Alert.alert('Erreurs', result.errors.join('\n'));
              }
            } catch {
              Alert.alert('Erreur', 'Échec de la clôture');
            } finally {
              setProcessing(false);
              setProgressMessage('');
              setProgressPercent(0);
            }
          }
        }
      ]
    );
  };

  const handleArchiveYear = (year: number) => {
    Alert.alert(
      `Archiver ${year}`,
      'Créer une archive chiffrée de cette année ?\n\n' +
      'Vous pourrez exporter l\'archive et optionnellement supprimer les données locales.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          onPress: () => {
            setSelectedYear(year);
            setPinAction('archive');
            setPinValue('');
            setPinModalVisible(true);
          }
        }
      ]
    );
  };

  const getArchivableYears = useCallback(() => {
    const currentYear = new Date().getFullYear();
    const archivableYears: number[] = [];
    
    for (let y = currentYear - 1; y >= currentYear - 10; y--) {
      const yearInfo = years.find(yi => yi.year === y);
      if (!yearInfo || (yearInfo.status !== 'archived')) {
        archivableYears.push(y);
      }
    }
    
    return archivableYears;
  }, [years]);

  const handleSelectYearToArchive = (year: number) => {
    setYearPickerVisible(false);
    handleArchiveYear(year);
  };

  const handleCreateArchive = async (deleteAfter: boolean) => {
    if (!selectedYear || pinValue.length < 4) {
      Alert.alert('Erreur', 'PIN de 4 caractères minimum requis');
      return;
    }
    
    setPinModalVisible(false);
    setProcessing(true);
    
    try {
      const vaultPath = await createArchiveVault(
        {
          year: selectedYear,
          pin: pinValue,
          includeAttachments: true,
          deleteAfterExport: deleteAfter,
          exportDestination: 'share'
        },
        (msg, progress) => {
          setProgressMessage(msg);
          setProgressPercent(progress);
        }
      );
      
      Alert.alert(
        'Archive créée',
        'Voulez-vous exporter l\'archive maintenant ?',
        [
          { text: 'Plus tard', style: 'cancel' },
          {
            text: 'Exporter',
            onPress: () => exportArchive(vaultPath, 'share')
          }
        ]
      );
      
      loadData();
    } catch (err) {
      Alert.alert('Erreur', `Échec: ${err instanceof Error ? err.message : 'Unknown'}`);
    } finally {
      setProcessing(false);
      setProgressMessage('');
      setProgressPercent(0);
      setPinValue('');
      setSelectedYear(null);
    }
  };

  const handleImportArchive = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true
      });
      
      if (result.canceled || !result.assets?.[0]) return;
      
      const uri = result.assets[0].uri;
      setImportUri(uri);
      setPinAction('import');
      setPinValue('');
      setPinModalVisible(true);
      
    } catch {
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  };

  const handleRestoreArchive = async (year: number) => {
    const vaultPath = getVaultPath(year);
    setImportUri(vaultPath);
    setPinAction('import');
    setPinValue('');
    setPinModalVisible(true);
  };

  const handleConfirmImport = async () => {
    if (!importUri || pinValue.length < 4) {
      Alert.alert('Erreur', 'PIN requis');
      return;
    }
    
    setPinModalVisible(false);
    setProcessing(true);
    
    try {
      const result = await importArchiveVault(
        importUri,
        pinValue,
        (msg, progress) => {
          setProgressMessage(msg);
          setProgressPercent(progress);
        }
      );
      
      if (result.success) {
        // Switch to the imported year so data is visible
        console.log('[Archives] Import successful, switching to year:', result.year);
        const importedDb = await initYearDatabase(result.year);
        setCurrentDatabase(importedDb);
        await setActiveYear(result.year);
        setActiveYearState(result.year);
        
        Alert.alert(
          'Import réussi',
          `Année ${result.year} restaurée.\n${result.filesRestored} fichiers récupérés.\n\nL'année ${result.year} est maintenant active.`
        );
        loadData();
      } else {
        Alert.alert('Erreurs', result.errors.join('\n'));
      }
    } catch (err) {
      console.error('[Archives] Import error:', err);
      Alert.alert('Erreur', 'Échec de l\'import');
    } finally {
      setProcessing(false);
      setProgressMessage('');
      setProgressPercent(0);
      setPinValue('');
      setImportUri(null);
    }
  };

  const handleDeleteArchive = async (year: number) => {
    Alert.alert(
      'Supprimer l\'archive',
      `Supprimer définitivement l'archive de ${year} ?\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteArchive(getVaultPath(year));
              Alert.alert('Succès', 'Archive supprimée');
              loadData();
            } catch {
              Alert.alert('Erreur', 'Échec de la suppression');
            }
          }
        }
      ]
    );
  };

  const getStatusIcon = (status: YearArchiveInfo['status']) => {
    switch (status) {
      case 'active':
        return <Unlock size={18} color={Colors.light.success} />;
      case 'readonly':
        return <Lock size={18} color={Colors.light.warning} />;
      case 'archived':
        return <FileArchive size={18} color={Colors.light.tint} />;
      case 'not_present':
        return <AlertCircle size={18} color={Colors.light.textMuted} />;
    }
  };

  const getStatusLabel = (status: YearArchiveInfo['status']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'readonly': return 'Lecture seule';
      case 'archived': return 'Archivée';
      case 'not_present': return 'Non présente';
    }
  };

  const renderYearCard = (yearInfo: YearArchiveInfo) => {
    const isActive = yearInfo.year === activeYear;
    
    return (
      <View 
        key={yearInfo.year} 
        style={[styles.yearCard, isActive && styles.yearCardActive]}
      >
        <TouchableOpacity 
          style={styles.yearHeader}
          onPress={() => handleSwitchYear(yearInfo.year)}
        >
          <View style={styles.yearTitleRow}>
            <Calendar size={20} color={isActive ? Colors.light.tint : Colors.light.text} />
            <Text style={[styles.yearTitle, isActive && styles.yearTitleActive]}>
              {yearInfo.year}
            </Text>
            {isActive && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Active</Text>
              </View>
            )}
          </View>
          
          <View style={styles.statusRow}>
            {getStatusIcon(yearInfo.status)}
            <Text style={styles.statusText}>{getStatusLabel(yearInfo.status)}</Text>
          </View>
        </TouchableOpacity>
        
        <View style={styles.yearStats}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{yearInfo.documentsCount}</Text>
            <Text style={styles.statLabel}>Documents</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{yearInfo.expensesCount}</Text>
            <Text style={styles.statLabel}>Dépenses</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatFileSize(yearInfo.totalSize)}</Text>
            <Text style={styles.statLabel}>Taille</Text>
          </View>
        </View>
        
        <View style={styles.yearActions}>
          {yearInfo.status === 'active' && !isActive && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleSwitchYear(yearInfo.year)}
            >
              <Eye size={16} color={Colors.light.tint} />
              <Text style={styles.actionText}>Activer</Text>
            </TouchableOpacity>
          )}
          
          {yearInfo.status === 'active' && yearInfo.year < new Date().getFullYear() && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleCloseYear(yearInfo.year)}
            >
              <Lock size={16} color={Colors.light.warning} />
              <Text style={styles.actionText}>Clôturer</Text>
            </TouchableOpacity>
          )}
          
          {(yearInfo.status === 'active' || yearInfo.status === 'readonly') && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleArchiveYear(yearInfo.year)}
            >
              <Archive size={16} color={Colors.light.tint} />
              <Text style={styles.actionText}>Archiver</Text>
            </TouchableOpacity>
          )}
          
          {yearInfo.status === 'archived' && (
            <>
              <TouchableOpacity 
                style={styles.actionButton}
                onPress={() => handleRestoreArchive(yearInfo.year)}
              >
                <Upload size={16} color={Colors.light.success} />
                <Text style={styles.actionText}>Restaurer</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.actionButton, styles.actionButtonDanger]}
                onPress={() => handleDeleteArchive(yearInfo.year)}
              >
                <Trash2 size={16} color={Colors.light.error} />
                <Text style={[styles.actionText, styles.actionTextDanger]}>Supprimer</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
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
      <Stack.Screen options={{ title: 'Archives annuelles' }} />
      
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Archive size={24} color={Colors.light.tint} />
          </View>
          <Text style={styles.headerTitle}>Gestion des archives</Text>
          <Text style={styles.headerDescription}>
            Une base de données par année pour optimiser l&apos;espace.
            Archivez les années passées pour libérer de la place.
          </Text>
        </View>
        
        <View style={styles.actionButtonsRow}>
          <TouchableOpacity 
            style={styles.importButton}
            onPress={handleImportArchive}
          >
            <Download size={20} color={Colors.light.surface} />
            <Text style={styles.importButtonText}>Importer</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.archiveNewButton}
            onPress={() => setYearPickerVisible(true)}
          >
            <Plus size={20} color={Colors.light.tint} />
            <Text style={styles.archiveNewButtonText}>Archiver une année</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.sectionTitle}>Années disponibles</Text>
        
        {years.map(renderYearCard)}
        
        {years.length === 0 && (
          <View style={styles.emptyState}>
            <HardDrive size={48} color={Colors.light.textMuted} />
            <Text style={styles.emptyText}>Aucune année enregistrée</Text>
          </View>
        )}
      </ScrollView>
      
      {processing && (
        <View style={styles.progressOverlay}>
          <View style={styles.progressCard}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.progressMessage}>{progressMessage}</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
            </View>
            <Text style={styles.progressPercent}>{progressPercent}%</Text>
          </View>
        </View>
      )}
      
      <Modal
        visible={pinModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPinModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingView}
            >
              <TouchableWithoutFeedback>
                <View style={styles.modalCard}>
            <TouchableOpacity 
              style={styles.modalClose}
              onPress={() => setPinModalVisible(false)}
            >
              <X size={24} color={Colors.light.textSecondary} />
            </TouchableOpacity>
            
            <Lock size={40} color={Colors.light.tint} />
            <Text style={styles.modalTitle}>
              {pinAction === 'archive' ? 'Chiffrer l\'archive' : 'Déchiffrer l\'archive'}
            </Text>
            <Text style={styles.modalDescription}>
              {pinAction === 'archive' 
                ? "Choisissez un code PIN pour protéger votre archive (4 caractères min.)"
                : "Entrez le code PIN utilisé lors de la création de l'archive"
              }
            </Text>
            
            <TextInput
              style={styles.pinInput}
              value={pinValue}
              onChangeText={setPinValue}
              placeholder="Code PIN"
              placeholderTextColor={Colors.light.textMuted}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={8}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
              blurOnSubmit={true}
            />
            
            {pinAction === 'archive' ? (
              <View style={styles.modalButtons}>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => {
                    Keyboard.dismiss();
                    handleCreateArchive(false);
                  }}
                >
                  <Text style={styles.modalButtonTextSecondary}>Archiver seulement</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => {
                    Keyboard.dismiss();
                    handleCreateArchive(true);
                  }}
                >
                  <Text style={styles.modalButtonTextPrimary}>Archiver & supprimer</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity 
                style={[styles.modalButton, styles.modalButtonPrimary, styles.modalButtonFull]}
                onPress={() => {
                  Keyboard.dismiss();
                  handleConfirmImport();
                }}
              >
                <Text style={styles.modalButtonTextPrimary}>Restaurer</Text>
              </TouchableOpacity>
            )}
                </View>
              </TouchableWithoutFeedback>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
      
      <Modal
        visible={yearPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setYearPickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.yearPickerCard}>
            <TouchableOpacity 
              style={styles.modalClose}
              onPress={() => setYearPickerVisible(false)}
            >
              <X size={24} color={Colors.light.textSecondary} />
            </TouchableOpacity>
            
            <Archive size={40} color={Colors.light.tint} />
            <Text style={styles.modalTitle}>Choisir une année à archiver</Text>
            <Text style={styles.modalDescription}>
              Sélectionnez l&apos;année que vous souhaitez archiver
            </Text>
            
            <ScrollView style={styles.yearPickerList} showsVerticalScrollIndicator={false}>
              {getArchivableYears().length === 0 ? (
                <Text style={styles.noYearsText}>Toutes les années sont déjà archivées</Text>
              ) : (
                getArchivableYears().map((year) => {
                  const yearInfo = years.find(yi => yi.year === year);
                  const hasData = yearInfo && (yearInfo.documentsCount > 0 || yearInfo.expensesCount > 0);
                  
                  return (
                    <TouchableOpacity
                      key={year}
                      style={styles.yearPickerItem}
                      onPress={() => handleSelectYearToArchive(year)}
                    >
                      <View style={styles.yearPickerItemLeft}>
                        <Calendar size={20} color={Colors.light.tint} />
                        <Text style={styles.yearPickerItemText}>{year}</Text>
                      </View>
                      <View style={styles.yearPickerItemRight}>
                        {hasData ? (
                          <Text style={styles.yearPickerItemInfo}>
                            {yearInfo.documentsCount} docs, {yearInfo.expensesCount} dép.
                          </Text>
                        ) : (
                          <Text style={styles.yearPickerItemInfoEmpty}>Pas de données</Text>
                        )}
                        <ChevronDown size={16} color={Colors.light.textMuted} style={{ transform: [{ rotate: '-90deg' }] }} />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  headerIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 8,
  },
  headerDescription: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  importButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  importButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.surface,
  },
  archiveNewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint + '15',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint + '30',
  },
  archiveNewButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  yearCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  yearCardActive: {
    borderWidth: 2,
    borderColor: Colors.light.tint,
  },
  yearHeader: {
    marginBottom: 12,
  },
  yearTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  yearTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  yearTitleActive: {
    color: Colors.light.tint,
  },
  activeBadge: {
    backgroundColor: Colors.light.tint + '20',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  yearStats: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 12,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  yearActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  actionButtonDanger: {
    backgroundColor: Colors.light.error + '10',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  actionTextDanger: {
    color: Colors.light.error,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textMuted,
    marginTop: 12,
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  progressMessage: {
    fontSize: 14,
    color: Colors.light.text,
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  progressBar: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.light.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.tint,
    borderRadius: 3,
  },
  progressPercent: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  keyboardAvoidingView: {
    width: '100%',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  modalClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    padding: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginTop: 16,
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  pinInput: {
    width: '100%',
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 8,
    color: Colors.light.text,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonFull: {
    flex: undefined,
    width: '100%',
  },
  modalButtonSecondary: {
    backgroundColor: Colors.light.background,
  },
  modalButtonPrimary: {
    backgroundColor: Colors.light.tint,
  },
  modalButtonTextSecondary: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  modalButtonTextPrimary: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.surface,
  },
  yearPickerCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    maxHeight: '80%',
  },
  yearPickerList: {
    width: '100%',
    maxHeight: 300,
  },
  yearPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    marginBottom: 8,
  },
  yearPickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  yearPickerItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  yearPickerItemText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  yearPickerItemInfo: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  yearPickerItemInfoEmpty: {
    fontSize: 12,
    color: Colors.light.textMuted,
    fontStyle: 'italic' as const,
  },
  noYearsText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center' as const,
    paddingVertical: 20,
  },
});
