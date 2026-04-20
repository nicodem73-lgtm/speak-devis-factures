import { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Alert, Switch, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { FlaskConical, ShieldCheck, Check, X, Building2, Hash, MapPin, Percent, Briefcase, FileSignature, AlertTriangle, ChevronRight, Clock } from 'lucide-react-native';
import { useAppMode } from '@/providers/AppModeProvider';
import { ActivityType, ACTIVITY_TYPE_LABELS } from '@/types/appMode';
import Colors from '@/constants/colors';

interface ChecklistItemProps {
  label: string;
  description: string;
  completed: boolean;
  icon: typeof Building2;
  iconColor: string;
}

function ChecklistItem({ label, description, completed, icon: Icon, iconColor }: ChecklistItemProps) {
  return (
    <View style={[styles.checklistItem, completed && styles.checklistItemCompleted]}>
      <View style={[styles.checklistIcon, { backgroundColor: (completed ? Colors.light.success : iconColor) + '15' }]}>
        {completed ? (
          <Check size={18} color={Colors.light.success} strokeWidth={3} />
        ) : (
          <Icon size={18} color={iconColor} />
        )}
      </View>
      <View style={styles.checklistContent}>
        <Text style={[styles.checklistLabel, completed && styles.checklistLabelDone]}>{label}</Text>
        <Text style={styles.checklistDesc}>{description}</Text>
      </View>
      {completed ? (
        <View style={styles.checkBadge}>
          <Check size={14} color="#FFFFFF" strokeWidth={3} />
        </View>
      ) : (
        <X size={18} color={Colors.light.error} />
      )}
    </View>
  );
}

export default function AppModeScreen() {
  const {
    mode, isTestMode, isRealMode, activationDate, activityType,
    termsAccepted, checklist, canActivateRealMode,
    refreshChecklist, setActivityType, acceptTerms, activateRealMode,
  } = useAppMode();
  const [isActivating, setIsActivating] = useState(false);
  const [showActivityPicker, setShowActivityPicker] = useState(false);

  useEffect(() => {
    refreshChecklist();
  }, [refreshChecklist]);

  const completedCount = Object.values(checklist).filter(Boolean).length;
  const totalCount = Object.values(checklist).length;

  const handleActivate = useCallback(async () => {
    if (!canActivateRealMode) {
      Alert.alert('Checklist incomplète', 'Veuillez compléter tous les éléments requis avant d\'activer le mode réel.');
      return;
    }

    Alert.alert(
      'Activer le MODE RÉEL',
      'Cette action est irréversible.\n\nJe comprends que l\'activation du mode réel rendra mes documents juridiquement valables et transmissibles aux autorités compétentes.\n\nLes documents créés en mode TEST ne seront pas migrés.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Activer le mode réel',
          style: 'destructive',
          onPress: async () => {
            setIsActivating(true);
            try {
              const success = await activateRealMode();
              if (success) {
                Alert.alert(
                  'Mode réel activé',
                  'Votre application est désormais en mode réel. Les documents créés auront une valeur légale.',
                );
              }
            } finally {
              setIsActivating(false);
            }
          },
        },
      ],
    );
  }, [canActivateRealMode, activateRealMode]);

  const handleTermsToggle = useCallback(async (value: boolean) => {
    if (value) {
      Alert.alert(
        'Conditions d\'utilisation',
        'En acceptant, vous reconnaissez que :\n\n• Le mode réel génère des documents à valeur légale\n• Les factures seront conformes à la réglementation française\n• Les données de facturation seront préparées pour transmission via PDP\n• Vous êtes responsable de la conformité de vos documents',
        [
          { text: 'Refuser', style: 'cancel' },
          { text: 'Accepter', onPress: () => acceptTerms() },
        ],
      );
    }
  }, [acceptTerms]);

  return (
    <>
      <Stack.Screen options={{ title: 'Mode application' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={[styles.currentModeCard, isTestMode ? styles.modeCardTest : styles.modeCardReal]}>
          <View style={styles.modeCardHeader}>
            {isTestMode ? (
              <FlaskConical size={32} color="#92400E" strokeWidth={2} />
            ) : (
              <ShieldCheck size={32} color="#065F46" strokeWidth={2} />
            )}
            <View style={styles.modeCardTitle}>
              <Text style={[styles.modeLabel, isTestMode ? styles.modeLabelTest : styles.modeLabelReal]}>
                MODE {mode}
              </Text>
              <Text style={[styles.modeSubtitle, isTestMode ? styles.modeSubtitleTest : styles.modeSubtitleReal]}>
                {isTestMode
                  ? 'Documents sans valeur légale'
                  : 'Documents juridiquement valables'}
              </Text>
            </View>
          </View>
          {isRealMode && activationDate && (
            <View style={styles.activationInfo}>
              <Clock size={14} color="#065F46" />
              <Text style={styles.activationDate}>
                Activé le {new Date(activationDate).toLocaleDateString('fr-FR', {
                  day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          )}
        </View>

        {isTestMode && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Checklist d&apos;activation</Text>
              <Text style={styles.sectionDesc}>
                Complétez ces éléments pour activer le mode réel ({completedCount}/{totalCount})
              </Text>

              <View style={styles.progressBarContainer}>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${(completedCount / totalCount) * 100}%` }]} />
                </View>
                <Text style={styles.progressText}>{Math.round((completedCount / totalCount) * 100)}%</Text>
              </View>

              <View style={styles.checklistContainer}>
                <ChecklistItem
                  icon={Building2}
                  iconColor={Colors.light.tint}
                  label="Raison sociale"
                  description="Nom de l'entreprise renseigné"
                  completed={checklist.companyName}
                />
                <ChecklistItem
                  icon={Hash}
                  iconColor="#8B5CF6"
                  label="SIREN / SIRET"
                  description="Numéro d'identification de l'entreprise"
                  completed={checklist.companySiren}
                />
                <ChecklistItem
                  icon={Percent}
                  iconColor="#F59E0B"
                  label="Numéro de TVA"
                  description="TVA intracommunautaire renseigné"
                  completed={checklist.companyTva}
                />
                <ChecklistItem
                  icon={MapPin}
                  iconColor="#EF4444"
                  label="Adresse complète"
                  description="Adresse, ville et code postal"
                  completed={checklist.companyAddress}
                />
                <ChecklistItem
                  icon={Percent}
                  iconColor="#10B981"
                  label="Paramètres fiscaux"
                  description="Taux de TVA configurés"
                  completed={checklist.taxSettingsValid}
                />
                <ChecklistItem
                  icon={Briefcase}
                  iconColor="#3B82F6"
                  label="Type d&apos;activité"
                  description="B2B France, B2C ou international"
                  completed={checklist.activityTypeChosen}
                />
                <ChecklistItem
                  icon={FileSignature}
                  iconColor="#EC4899"
                  label="Conditions d&apos;utilisation"
                  description="Acceptation des CGU"
                  completed={checklist.termsAccepted}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Type d&apos;activité</Text>
              <TouchableOpacity
                style={styles.activityPicker}
                onPress={() => setShowActivityPicker(!showActivityPicker)}
              >
                <Briefcase size={18} color={Colors.light.tint} />
                <Text style={styles.activityPickerText}>
                  {activityType ? ACTIVITY_TYPE_LABELS[activityType] : 'Choisir...'}
                </Text>
                <ChevronRight size={18} color={Colors.light.textMuted} style={{ transform: [{ rotate: showActivityPicker ? '90deg' : '0deg' }] }} />
              </TouchableOpacity>

              {showActivityPicker && (
                <View style={styles.activityOptions}>
                  {(Object.entries(ACTIVITY_TYPE_LABELS) as [ActivityType, string][]).map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.activityOption, activityType === key && styles.activityOptionActive]}
                      onPress={() => {
                        setActivityType(key);
                        setShowActivityPicker(false);
                      }}
                    >
                      <Text style={[styles.activityOptionText, activityType === key && styles.activityOptionTextActive]}>
                        {label}
                      </Text>
                      {activityType === key && <Check size={16} color={Colors.light.tint} />}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Conditions d&apos;utilisation</Text>
              <View style={styles.termsRow}>
                <View style={styles.termsContent}>
                  <Text style={styles.termsLabel}>J&apos;accepte les conditions</Text>
                  <Text style={styles.termsDesc}>Documents à valeur légale en mode réel</Text>
                </View>
                <Switch
                  value={termsAccepted}
                  onValueChange={handleTermsToggle}
                  trackColor={{ false: Colors.light.border, true: Colors.light.success + '60' }}
                  thumbColor={termsAccepted ? Colors.light.success : '#f4f3f4'}
                  disabled={termsAccepted}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.activateButton, !canActivateRealMode && styles.activateButtonDisabled]}
              onPress={handleActivate}
              disabled={!canActivateRealMode || isActivating}
              activeOpacity={0.8}
            >
              {isActivating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <ShieldCheck size={22} color="#FFFFFF" strokeWidth={2} />
                  <Text style={styles.activateButtonText}>Activer le MODE RÉEL</Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.warningBox}>
              <AlertTriangle size={18} color="#92400E" />
              <Text style={styles.warningText}>
                L&apos;activation du mode réel est irréversible. Les données du mode TEST ne seront pas migrées.
              </Text>
            </View>
          </>
        )}

        {isRealMode && (
          <View style={styles.section}>
            <View style={styles.realModeInfo}>
              <View style={styles.realModeInfoRow}>
                <Text style={styles.realModeInfoLabel}>Type d&apos;activité</Text>
                <Text style={styles.realModeInfoValue}>{ACTIVITY_TYPE_LABELS[activityType]}</Text>
              </View>
              <View style={styles.realModeInfoRow}>
                <Text style={styles.realModeInfoLabel}>Conformité</Text>
                <Text style={styles.realModeInfoValue}>Factur-X / e-Reporting</Text>
              </View>
              <View style={styles.realModeInfoRow}>
                <Text style={styles.realModeInfoLabel}>Statut</Text>
                <View style={styles.activeStatusBadge}>
                  <View style={styles.activeStatusDot} />
                  <Text style={styles.activeStatusText}>Actif</Text>
                </View>
              </View>
            </View>
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
    paddingBottom: 60,
  },
  currentModeCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  modeCardTest: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B40',
  },
  modeCardReal: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1.5,
    borderColor: '#10B98140',
  },
  modeCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  modeCardTitle: {
    flex: 1,
  },
  modeLabel: {
    fontSize: 20,
    fontWeight: '800' as const,
    letterSpacing: 1.5,
  },
  modeLabelTest: {
    color: '#92400E',
  },
  modeLabelReal: {
    color: '#065F46',
  },
  modeSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  modeSubtitleTest: {
    color: '#B45309',
  },
  modeSubtitleReal: {
    color: '#047857',
  },
  activationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#10B98130',
  },
  activationDate: {
    fontSize: 12,
    color: '#065F46',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  sectionDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  progressBar: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.light.border,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.success,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.light.success,
    minWidth: 40,
    textAlign: 'right',
  },
  checklistContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  checklistItemCompleted: {
    backgroundColor: Colors.light.success + '05',
  },
  checklistIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistContent: {
    flex: 1,
  },
  checklistLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  checklistLabelDone: {
    color: Colors.light.success,
  },
  checklistDesc: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  checkBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.light.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginTop: 8,
  },
  activityPickerText: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
  },
  activityOptions: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
  },
  activityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  activityOptionActive: {
    backgroundColor: Colors.light.tint + '10',
  },
  activityOptionText: {
    fontSize: 14,
    color: Colors.light.text,
  },
  activityOptionTextActive: {
    color: Colors.light.tint,
    fontWeight: '600' as const,
  },
  termsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
  },
  termsContent: {
    flex: 1,
  },
  termsLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  termsDesc: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  activateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.success,
    borderRadius: 14,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 16,
  },
  activateButtonDisabled: {
    backgroundColor: Colors.light.border,
  },
  activateButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#F59E0B30',
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  realModeInfo: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
  },
  realModeInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  realModeInfoLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  realModeInfoValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  activeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.success + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  activeStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.success,
  },
  activeStatusText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.success,
  },
});
