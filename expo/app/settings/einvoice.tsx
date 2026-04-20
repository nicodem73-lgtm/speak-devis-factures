import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { 
  FileCheck, 
  Building2, 
  AlertCircle, 
  CheckCircle2,
  Info,
  ChevronDown,
  Calendar,
  Mail,
  Settings,
  Check,
  X,
  ChevronRight,
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getEInvoiceSettings, saveEInvoiceSettings } from '@/utils/einvoiceProvider';
import { getEInvoiceStats } from '@/db/einvoice';
import { getCompanyInfo } from '@/db/settings';
import { EInvoiceFormat, EINVOICE_FORMAT_LABELS } from '@/types/einvoice';

interface ConformityItem {
  key: string;
  label: string;
  isValid: boolean;
  description?: string;
}

export default function EInvoiceSettingsScreen() {
  const { db, isReady } = useDatabase();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [defaultFormat, setDefaultFormat] = useState<EInvoiceFormat>('facturx');
  const [autoSubmit, setAutoSubmit] = useState(false);
  const [sendEmailNotification, setSendEmailNotification] = useState(true);

  const [companySiren, setCompanySiren] = useState('');
  const [showFormatPicker, setShowFormatPicker] = useState(false);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['einvoiceSettings', db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceSettings(db);
    },
    enabled: isReady && !!db,
  });

  const { data: stats } = useQuery({
    queryKey: ['einvoiceStats', db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceStats(db);
    },
    enabled: isReady && !!db,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ['companyInfo', db],
    queryFn: async () => {
      if (!db) return null;
      return getCompanyInfo(db);
    },
    enabled: isReady && !!db,
  });

  useEffect(() => {
    if (settings) {
      setEnabled(settings.enabled);
      setDefaultFormat(settings.defaultFormat);
      setAutoSubmit(settings.autoSubmit);
      setSendEmailNotification(settings.sendEmailNotification);

      setCompanySiren(settings.companySiren || '');
    }
  }, [settings]);

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      await saveEInvoiceSettings(db, {
        enabled,
        defaultFormat,
        autoSubmit,
        sendEmailNotification,

        companySiren: companySiren || undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['einvoiceSettings'] });
      Alert.alert('Succès', 'Paramètres de facturation électronique enregistrés');
    },
    onError: (error) => {
      console.error('[EInvoiceSettings] Error:', error);
      Alert.alert('Erreur', 'Impossible d\'enregistrer les paramètres');
    },
  });

  const handleSave = useCallback(() => {
    save();
  }, [save]);

  const isPdpConnected = !!(settings?.pdpProvider) && !!(settings?.pdpEndpoint);

  const conformityItems: ConformityItem[] = [
    {
      key: 'siren',
      label: 'SIREN entreprise',
      isValid: !!(companyInfo?.siret && companyInfo.siret.length >= 9),
      description: 'Identifiant à 9 chiffres',
    },
    {
      key: 'siret',
      label: 'SIRET entreprise',
      isValid: !!(companyInfo?.siret && companyInfo.siret.length === 14),
      description: 'Identifiant à 14 chiffres',
    },
    {
      key: 'tva',
      label: 'Numéro de TVA',
      isValid: !!(companyInfo?.tvaNumber && companyInfo.tvaNumber.length > 0),
      description: 'Numéro intracommunautaire',
    },
    {
      key: 'address',
      label: 'Adresse entreprise',
      isValid: !!(companyInfo?.address && companyInfo?.city && companyInfo?.postalCode),
      description: 'Adresse complète',
    },
  ];

  const validCount = conformityItems.filter(item => item.isValid).length;
  const isFullyCompliant = validCount === conformityItems.length;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Facturation électronique',
          headerRight: () => (
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.statusBanner}>
          <View style={[
            styles.statusIconContainer,
            isPdpConnected ? styles.statusIconConnected : styles.statusIconLocal
          ]}>
            {isPdpConnected ? (
              <CheckCircle2 size={24} color="#10B981" />
            ) : (
              <AlertCircle size={24} color="#F59E0B" />
            )}
          </View>
          <View style={styles.statusContent}>
            <Text style={styles.statusTitle}>
              {isPdpConnected ? 'PDP connectée' : 'Non connectée (mode préparation)'}
            </Text>
            <Text style={styles.statusDescription}>
              {isPdpConnected 
                ? `Connecté à ${settings?.pdpProvider}`
                : 'Factures préparées localement, prêtes pour 2026'}
            </Text>
          </View>
          <TouchableOpacity 
            style={styles.configureButton}
            onPress={() => router.push('/settings/pdp-config')}
          >
            <Settings size={16} color="#8B5CF6" />
            <Text style={styles.configureButtonText}>Configurer ma PDP</Text>
            <ChevronRight size={18} color={Colors.light.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.readyBanner}>
          <Calendar size={20} color="#8B5CF6" />
          <View style={styles.readyContent}>
            <Text style={styles.readyTitle}>Prêt pour septembre 2026</Text>
            <Text style={styles.readyDescription}>
              Votre application est compatible avec la facturation électronique obligatoire
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activation</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <View style={styles.switchIconContainer}>
                  <FileCheck size={20} color="#8B5CF6" />
                </View>
                <View style={styles.switchContent}>
                  <Text style={styles.switchTitle}>Activer la facturation électronique</Text>
                  <Text style={styles.switchDescription}>
                    L&apos;action principale devient &quot;Transmettre via la PDP&quot;
                  </Text>
                </View>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: Colors.light.borderLight, true: '#8B5CF6' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>



        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchInfo}>
                <View style={[styles.switchIconContainer, { backgroundColor: '#10B98115' }]}>
                  <Mail size={20} color="#10B981" />
                </View>
                <View style={styles.switchContent}>
                  <Text style={styles.switchTitle}>Envoyer une notification email après transmission</Text>
                  <Text style={styles.switchDescription}>
                    Le client recevra un email de notification (optionnel)
                  </Text>
                </View>
              </View>
              <Switch
                value={sendEmailNotification}
                onValueChange={setSendEmailNotification}
                trackColor={{ false: Colors.light.borderLight, true: '#10B981' }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conformité</Text>
          <View style={styles.card}>
            <View style={styles.conformityHeader}>
              <View style={[
                styles.conformityBadge,
                isFullyCompliant ? styles.conformityBadgeValid : styles.conformityBadgeWarning
              ]}>
                {isFullyCompliant ? (
                  <CheckCircle2 size={16} color="#10B981" />
                ) : (
                  <AlertCircle size={16} color="#F59E0B" />
                )}
                <Text style={[
                  styles.conformityBadgeText,
                  isFullyCompliant ? styles.conformityBadgeTextValid : styles.conformityBadgeTextWarning
                ]}>
                  {validCount}/{conformityItems.length} éléments conformes
                </Text>
              </View>
            </View>
            
            {conformityItems.map((item, index) => (
              <View 
                key={item.key} 
                style={[
                  styles.conformityItem,
                  index === conformityItems.length - 1 && styles.conformityItemLast
                ]}
              >
                <View style={[
                  styles.conformityIcon,
                  item.isValid ? styles.conformityIconValid : styles.conformityIconInvalid
                ]}>
                  {item.isValid ? (
                    <Check size={14} color="#10B981" />
                  ) : (
                    <X size={14} color="#EF4444" />
                  )}
                </View>
                <View style={styles.conformityContent}>
                  <Text style={[
                    styles.conformityLabel,
                    !item.isValid && styles.conformityLabelInvalid
                  ]}>
                    {item.label}
                  </Text>
                  {item.description && (
                    <Text style={styles.conformityDescription}>{item.description}</Text>
                  )}
                </View>
              </View>
            ))}
            
            {!isFullyCompliant && (
              <TouchableOpacity 
                style={styles.fixConformityButton}
                onPress={() => router.push('/settings/company')}
              >
                <Text style={styles.fixConformityButtonText}>Compléter les informations</Text>
                <ChevronRight size={16} color="#8B5CF6" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Format par défaut</Text>
          <TouchableOpacity 
            style={styles.card}
            onPress={() => setShowFormatPicker(!showFormatPicker)}
          >
            <View style={styles.pickerRow}>
              <Text style={styles.pickerLabel}>Format</Text>
              <View style={styles.pickerValue}>
                <Text style={styles.pickerValueText}>
                  {EINVOICE_FORMAT_LABELS[defaultFormat]}
                </Text>
                <ChevronDown size={18} color={Colors.light.textMuted} />
              </View>
            </View>
          </TouchableOpacity>
          {showFormatPicker && (
            <View style={styles.pickerOptions}>
              {(Object.keys(EINVOICE_FORMAT_LABELS) as EInvoiceFormat[]).map((format) => (
                <TouchableOpacity
                  key={format}
                  style={[
                    styles.pickerOption,
                    defaultFormat === format && styles.pickerOptionActive
                  ]}
                  onPress={() => {
                    setDefaultFormat(format);
                    setShowFormatPicker(false);
                  }}
                >
                  <Text style={[
                    styles.pickerOptionText,
                    defaultFormat === format && styles.pickerOptionTextActive
                  ]}>
                    {EINVOICE_FORMAT_LABELS[format]}
                  </Text>
                  {format === 'facturx' && (
                    <Text style={styles.pickerOptionHint}>Recommandé</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identifiants entreprise</Text>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={styles.inputIconContainer}>
                <Building2 size={18} color={Colors.light.textSecondary} />
              </View>
              <View style={styles.inputContent}>
                <Text style={styles.inputLabel}>SIREN</Text>
                <TextInput
                  style={styles.input}
                  value={companySiren}
                  onChangeText={setCompanySiren}
                  placeholder="123456789"
                  placeholderTextColor={Colors.light.textMuted}
                  keyboardType="number-pad"
                  maxLength={9}
                />
              </View>
            </View>
            <View style={styles.inputHint}>
              <Info size={14} color={Colors.light.textMuted} />
              <Text style={styles.inputHintText}>
                Requis pour la facturation électronique B2B/B2G
              </Text>
            </View>
          </View>
        </View>

        {isPdpConnected && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Envoi automatique</Text>
            <View style={styles.card}>
              <View style={styles.switchRow}>
                <View style={styles.switchInfo}>
                  <View style={styles.switchContent}>
                    <Text style={styles.switchTitle}>Transmission automatique</Text>
                    <Text style={styles.switchDescription}>
                      Envoyer automatiquement les factures à la PDP
                    </Text>
                  </View>
                </View>
                <Switch
                  value={autoSubmit}
                  onValueChange={setAutoSubmit}
                  trackColor={{ false: Colors.light.borderLight, true: '#8B5CF6' }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </View>
        )}

        {stats && stats.total > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistiques</Text>
            <View style={styles.statsCard}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.total}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.pending}</Text>
                <Text style={styles.statLabel}>En attente</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: '#10B981' }]}>{stats.delivered}</Text>
                <Text style={styles.statLabel}>Délivrées</Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.infoSection}>
          <View style={styles.infoHeader}>
            <Info size={18} color="#8B5CF6" />
            <Text style={styles.infoTitle}>À propos de la e-facturation</Text>
          </View>
          <Text style={styles.infoText}>
            Quand la facturation électronique est activée, l&apos;envoi officiel ne se fait plus par email. La facture est transmise via une PDP, qui la route vers la PDP du client et met à jour les statuts.
          </Text>
          <Text style={styles.infoText}>
            L&apos;email devient une notification optionnelle pour informer le client de la transmission.
          </Text>
          <View style={styles.infoSeparator} />
          <Text style={styles.infoText}>
            À partir du 1er septembre 2026, la facturation électronique devient obligatoire pour toutes les entreprises en France.
          </Text>
          <Text style={styles.infoText}>
            Cette application génère des factures au format Factur-X (PDF/A-3 avec XML EN16931 intégré), conformes aux exigences légales.
          </Text>
        </View>
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
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  saveButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
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
  statusIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statusIconConnected: {
    backgroundColor: '#10B98115',
  },
  statusIconLocal: {
    backgroundColor: '#F59E0B15',
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 2,
  },
  statusDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF610',
    borderRadius: 12,
    padding: 14,
    marginBottom: 24,
    gap: 12,
    borderWidth: 1,
    borderColor: '#8B5CF620',
  },
  readyContent: {
    flex: 1,
  },
  readyTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  readyDescription: {
    fontSize: 12,
    color: '#8B5CF6',
    opacity: 0.8,
    marginTop: 2,
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
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  switchInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  switchIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#8B5CF615',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  switchContent: {
    flex: 1,
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  switchDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  pdpStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pdpStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pdpStatusIconConnected: {
    backgroundColor: '#10B98115',
  },
  pdpStatusIconDisconnected: {
    backgroundColor: '#F59E0B15',
  },
  pdpStatusContent: {
    flex: 1,
  },
  pdpStatusTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  pdpStatusDescription: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  configureButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 8,
  },
  configureButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#8B5CF6',
  },
  conformityHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  conformityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  conformityBadgeValid: {
    backgroundColor: '#10B98115',
  },
  conformityBadgeWarning: {
    backgroundColor: '#F59E0B15',
  },
  conformityBadgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  conformityBadgeTextValid: {
    color: '#10B981',
  },
  conformityBadgeTextWarning: {
    color: '#F59E0B',
  },
  conformityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  conformityItemLast: {
    borderBottomWidth: 0,
  },
  conformityIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  conformityIconValid: {
    backgroundColor: '#10B98115',
  },
  conformityIconInvalid: {
    backgroundColor: '#EF444415',
  },
  conformityContent: {
    flex: 1,
  },
  conformityLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  conformityLabelInvalid: {
    color: Colors.light.textSecondary,
  },
  conformityDescription: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  fixConformityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 4,
  },
  fixConformityButtonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#8B5CF6',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  pickerLabel: {
    fontSize: 15,
    color: Colors.light.text,
  },
  pickerValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pickerValueText: {
    fontSize: 15,
    color: Colors.light.tint,
    fontWeight: '500' as const,
  },
  pickerOptions: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pickerOptionActive: {
    backgroundColor: '#8B5CF610',
  },
  pickerOptionText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  pickerOptionTextActive: {
    color: '#8B5CF6',
    fontWeight: '500' as const,
  },
  pickerOptionHint: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500' as const,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  inputIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inputContent: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  input: {
    fontSize: 15,
    color: Colors.light.text,
    padding: 0,
  },
  inputHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    padding: 12,
    gap: 8,
  },
  inputHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 16,
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#8B5CF6',
  },
  statLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 8,
  },
  infoSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  infoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 20,
    marginBottom: 10,
  },
  infoSeparator: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginVertical: 12,
  },
});
