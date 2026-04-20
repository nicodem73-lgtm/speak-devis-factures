import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Bell, Mail, Edit3, ChevronRight, Info, X, Check, AlertTriangle, Calendar } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { 
  getReminderConfig, 
  saveReminderConfig, 
  getReminderTemplates, 
  saveReminderTemplates,
  getOverdueInvoices,
} from '@/db/reminders';
import { ReminderConfig, ReminderTemplate, TEMPLATE_VARIABLES } from '@/types/reminder';

const REMINDER_LABELS = {
  1: 'Relance 1',
  2: 'Relance 2',
  3: 'Relance 3 (finale)',
};

export default function RemindersSettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  
  const [editingTemplate, setEditingTemplate] = useState<ReminderTemplate | null>(null);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [showVariablesHelp, setShowVariablesHelp] = useState(false);

  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['reminderConfig', db],
    queryFn: async () => {
      if (!db) return null;
      return getReminderConfig(db);
    },
    enabled: isReady && !!db,
  });

  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ['reminderTemplates', db],
    queryFn: async () => {
      if (!db) return [];
      return getReminderTemplates(db);
    },
    enabled: isReady && !!db,
  });

  const { data: overdueInvoices = [] } = useQuery({
    queryKey: ['overdueInvoices', db],
    queryFn: async () => {
      if (!db) return [];
      return getOverdueInvoices(db);
    },
    enabled: isReady && !!db,
  });

  const { mutate: updateConfig } = useMutation({
    mutationFn: async (newConfig: ReminderConfig) => {
      if (!db) throw new Error('No database');
      return saveReminderConfig(db, newConfig);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderConfig'] });
    },
    onError: (error) => {
      console.error('[RemindersSettings] Error saving config:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder les paramètres');
    },
  });

  const { mutate: updateTemplates } = useMutation({
    mutationFn: async (newTemplates: ReminderTemplate[]) => {
      if (!db) throw new Error('No database');
      return saveReminderTemplates(db, newTemplates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderTemplates'] });
      setEditingTemplate(null);
      setTemplateSubject('');
      setTemplateBody('');
    },
    onError: (error) => {
      console.error('[RemindersSettings] Error saving templates:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder le modèle');
    },
  });

  const handleToggleEnabled = useCallback((value: boolean) => {
    if (!config) return;
    updateConfig({ ...config, enabled: value });
  }, [config, updateConfig]);

  const handleToggleReminderEnabled = useCallback((level: 1 | 2 | 3, value: boolean) => {
    if (!config) return;
    const key = `reminder${level}Enabled` as keyof ReminderConfig;
    updateConfig({ ...config, [key]: value });
  }, [config, updateConfig]);

  const handleDaysChange = useCallback((level: 1 | 2 | 3, value: string) => {
    if (!config) return;
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1) return;
    const key = `reminder${level}Days` as keyof ReminderConfig;
    updateConfig({ ...config, [key]: days });
  }, [config, updateConfig]);

  const handleDefaultPaymentDaysChange = useCallback((value: string) => {
    if (!config) return;
    const days = parseInt(value, 10);
    if (isNaN(days) || days < 1) return;
    updateConfig({ ...config, defaultPaymentDays: days });
  }, [config, updateConfig]);

  const handleEditTemplate = useCallback((template: ReminderTemplate) => {
    setEditingTemplate(template);
    setTemplateSubject(template.subject);
    setTemplateBody(template.body);
  }, []);

  const handleSaveTemplate = useCallback(() => {
    if (!editingTemplate) return;
    
    const updatedTemplates = templates.map(t => 
      t.id === editingTemplate.id 
        ? { ...t, subject: templateSubject, body: templateBody }
        : t
    );
    
    updateTemplates(updatedTemplates);
  }, [editingTemplate, templates, templateSubject, templateBody, updateTemplates]);

  const isLoading = !isReady || loadingConfig || loadingTemplates;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!config) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Impossible de charger les paramètres</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Relances impayés' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.headerIconContainer}>
            <Bell size={28} color={Colors.light.warning} />
          </View>
          <Text style={styles.headerTitle}>Relances automatiques</Text>
          <Text style={styles.headerSubtitle}>
            Configurez les rappels pour les factures impayées
          </Text>
        </View>

        {overdueInvoices.length > 0 && (
          <TouchableOpacity 
            style={styles.overdueAlert}
            onPress={() => router.push('/(tabs)')}
          >
            <AlertTriangle size={20} color={Colors.light.error} />
            <View style={styles.overdueAlertContent}>
              <Text style={styles.overdueAlertText}>
                {overdueInvoices.length} facture{overdueInvoices.length > 1 ? 's' : ''} en retard
              </Text>
              <Text style={styles.overdueAlertSubtext}>
                Appuyez pour voir les documents
              </Text>
            </View>
            <ChevronRight size={20} color={Colors.light.error} />
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Délai de paiement par défaut</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.paymentTermRow}>
              <View style={styles.paymentTermIcon}>
                <Calendar size={20} color={Colors.light.tint} />
              </View>
              <View style={styles.paymentTermContent}>
                <Text style={styles.paymentTermLabel}>Échéance automatique</Text>
                <Text style={styles.paymentTermDesc}>
                  Délai appliqué aux nouvelles factures
                </Text>
              </View>
              <View style={styles.paymentTermInputContainer}>
                <TextInput
                  style={styles.paymentTermInput}
                  value={config.defaultPaymentDays.toString()}
                  onChangeText={handleDefaultPaymentDaysChange}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Text style={styles.paymentTermUnit}>jours</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Activation</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={styles.switchContent}>
                <Text style={styles.switchLabel}>Activer les relances</Text>
                <Text style={styles.switchDescription}>
                  Recevoir des rappels pour envoyer des relances
                </Text>
              </View>
              <Switch
                value={config.enabled}
                onValueChange={handleToggleEnabled}
                trackColor={{ false: Colors.light.border, true: Colors.light.tint + '50' }}
                thumbColor={config.enabled ? Colors.light.tint : Colors.light.textMuted}
              />
            </View>
          </View>
        </View>

        <View style={[styles.section, !config.enabled && styles.sectionDisabled]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Calendrier des relances</Text>
            <Text style={styles.sectionSubtitle}>Nombre de jours après l&apos;échéance</Text>
          </View>
          <View style={styles.card}>
            {([1, 2, 3] as const).map((level) => {
              const isEnabled = config[`reminder${level}Enabled` as keyof ReminderConfig] as boolean;
              const days = config[`reminder${level}Days` as keyof ReminderConfig] as number;
              
              return (
                <View 
                  key={level} 
                  style={[
                    styles.reminderRow,
                    level < 3 && styles.reminderRowBorder,
                    !isEnabled && styles.reminderRowDisabled,
                  ]}
                >
                  <View style={styles.reminderInfo}>
                    <View style={[styles.levelBadge, { backgroundColor: getLevelColor(level) + '20' }]}>
                      <Text style={[styles.levelBadgeText, { color: getLevelColor(level) }]}>
                        {level}
                      </Text>
                    </View>
                    <View style={styles.reminderDetails}>
                      <Text style={[styles.reminderLabel, !isEnabled && styles.textDisabled]}>
                        {REMINDER_LABELS[level]}
                      </Text>
                      <Text style={[styles.reminderDaysLabel, !isEnabled && styles.textDisabled]}>
                        {days} jour{days > 1 ? 's' : ''} après échéance
                      </Text>
                    </View>
                  </View>
                  <View style={styles.reminderControls}>
                    <TextInput
                      style={[styles.daysInput, !isEnabled && styles.inputDisabled]}
                      value={days.toString()}
                      onChangeText={(v) => handleDaysChange(level, v)}
                      keyboardType="number-pad"
                      editable={config.enabled && isEnabled}
                      selectTextOnFocus
                    />
                    <Switch
                      value={isEnabled}
                      onValueChange={(v) => handleToggleReminderEnabled(level, v)}
                      disabled={!config.enabled}
                      trackColor={{ false: Colors.light.border, true: getLevelColor(level) + '50' }}
                      thumbColor={isEnabled ? getLevelColor(level) : Colors.light.textMuted}
                    />
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[styles.section, !config.enabled && styles.sectionDisabled]}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Modèles d&apos;email</Text>
            <TouchableOpacity 
              style={styles.helpButton}
              onPress={() => setShowVariablesHelp(true)}
            >
              <Info size={16} color={Colors.light.tint} />
              <Text style={styles.helpButtonText}>Variables</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.card}>
            {templates.map((template, index) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templateRow,
                  index < templates.length - 1 && styles.templateRowBorder,
                ]}
                onPress={() => config.enabled && handleEditTemplate(template)}
                disabled={!config.enabled}
              >
                <View style={[styles.levelBadge, { backgroundColor: getLevelColor(template.level) + '20' }]}>
                  <Mail size={14} color={getLevelColor(template.level)} />
                </View>
                <View style={styles.templateContent}>
                  <Text style={[styles.templateLabel, !config.enabled && styles.textDisabled]} numberOfLines={1}>
                    {REMINDER_LABELS[template.level]}
                  </Text>
                  <Text style={[styles.templateSubject, !config.enabled && styles.textDisabled]} numberOfLines={1}>
                    {template.subject}
                  </Text>
                </View>
                <Edit3 size={18} color={config.enabled ? Colors.light.tint : Colors.light.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.infoCard}>
          <Info size={18} color={Colors.light.info} />
          <Text style={styles.infoText}>
            Les emails ne sont pas envoyés automatiquement. Vous recevrez une notification et pourrez envoyer la relance manuellement depuis la fiche de la facture.
          </Text>
        </View>
      </ScrollView>

      <Modal
        visible={!!editingTemplate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingTemplate(null)}
      >
        <View style={modalStyles.container}>
          <View style={modalStyles.header}>
            <TouchableOpacity 
              style={modalStyles.closeButton}
              onPress={() => setEditingTemplate(null)}
            >
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            <Text style={modalStyles.title}>
              {editingTemplate ? REMINDER_LABELS[editingTemplate.level] : 'Modèle'}
            </Text>
            <TouchableOpacity 
              style={modalStyles.saveButton}
              onPress={handleSaveTemplate}
            >
              <Check size={24} color={Colors.light.tint} />
            </TouchableOpacity>
          </View>

          <ScrollView style={modalStyles.content}>
            <View style={modalStyles.field}>
              <Text style={modalStyles.label}>Objet de l&apos;email</Text>
              <TextInput
                style={modalStyles.input}
                value={templateSubject}
                onChangeText={setTemplateSubject}
                placeholder="Objet..."
                placeholderTextColor={Colors.light.textMuted}
              />
            </View>

            <View style={modalStyles.field}>
              <Text style={modalStyles.label}>Corps du message</Text>
              <TextInput
                style={modalStyles.textArea}
                value={templateBody}
                onChangeText={setTemplateBody}
                placeholder="Message..."
                placeholderTextColor={Colors.light.textMuted}
                multiline
                textAlignVertical="top"
              />
            </View>

            <View style={modalStyles.variablesSection}>
              <Text style={modalStyles.variablesTitle}>Variables disponibles</Text>
              <View style={modalStyles.variablesList}>
                {TEMPLATE_VARIABLES.map((variable) => (
                  <TouchableOpacity
                    key={variable.key}
                    style={modalStyles.variableChip}
                    onPress={() => {
                      setTemplateBody(prev => prev + variable.key);
                    }}
                  >
                    <Text style={modalStyles.variableKey}>{variable.key}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={showVariablesHelp}
        transparent
        animationType="fade"
        onRequestClose={() => setShowVariablesHelp(false)}
      >
        <Pressable 
          style={helpStyles.overlay}
          onPress={() => setShowVariablesHelp(false)}
        >
          <Pressable style={helpStyles.content} onPress={(e) => e.stopPropagation()}>
            <Text style={helpStyles.title}>Variables disponibles</Text>
            <Text style={helpStyles.subtitle}>
              Utilisez ces variables dans vos modèles pour personnaliser les emails
            </Text>
            {TEMPLATE_VARIABLES.map((variable) => (
              <View key={variable.key} style={helpStyles.variableRow}>
                <Text style={helpStyles.variableKey}>{variable.key}</Text>
                <Text style={helpStyles.variableDesc}>{variable.description}</Text>
              </View>
            ))}
            <TouchableOpacity 
              style={helpStyles.closeBtn}
              onPress={() => setShowVariablesHelp(false)}
            >
              <Text style={helpStyles.closeBtnText}>Compris</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function getLevelColor(level: number): string {
  switch (level) {
    case 1:
      return Colors.light.info;
    case 2:
      return Colors.light.warning;
    case 3:
      return Colors.light.error;
    default:
      return Colors.light.tint;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  errorText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  headerCard: {
    backgroundColor: Colors.light.warning + '10',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.warning + '30',
  },
  headerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.light.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  overdueAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.error + '10',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.error + '30',
    gap: 12,
  },
  overdueAlertContent: {
    flex: 1,
  },
  overdueAlertText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.error,
  },
  overdueAlertSubtext: {
    fontSize: 12,
    color: Colors.light.error + 'B0',
    marginTop: 2,
  },
  section: {
    marginBottom: 24,
  },
  sectionDisabled: {
    opacity: 0.5,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.light.textMuted,
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
  switchContent: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  switchDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  reminderRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  reminderRowDisabled: {
    opacity: 0.5,
  },
  reminderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  levelBadgeText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  reminderDetails: {
    flex: 1,
  },
  reminderLabel: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  reminderDaysLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  reminderControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  daysInput: {
    width: 50,
    height: 36,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  paymentTermRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  paymentTermIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentTermContent: {
    flex: 1,
  },
  paymentTermLabel: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  paymentTermDesc: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  paymentTermInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paymentTermInput: {
    width: 50,
    height: 36,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  paymentTermUnit: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  inputDisabled: {
    backgroundColor: Colors.light.surfaceSecondary,
    color: Colors.light.textMuted,
  },
  textDisabled: {
    color: Colors.light.textMuted,
  },
  helpButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.light.tint + '10',
    borderRadius: 12,
  },
  helpButtonText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  templateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  templateRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  templateContent: {
    flex: 1,
  },
  templateLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 2,
  },
  templateSubject: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  infoCard: {
    flexDirection: 'row',
    backgroundColor: Colors.light.info + '10',
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.info,
    lineHeight: 18,
  },
});

const modalStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    backgroundColor: Colors.light.surface,
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  saveButton: {
    padding: 4,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  textArea: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    minHeight: 200,
  },
  variablesSection: {
    marginTop: 8,
  },
  variablesTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  variablesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  variableChip: {
    backgroundColor: Colors.light.tint + '15',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  variableKey: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.light.tint,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

const helpStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  title: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  variableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  variableKey: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.tint,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  variableDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  closeBtn: {
    marginTop: 20,
    backgroundColor: Colors.light.tint,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});
