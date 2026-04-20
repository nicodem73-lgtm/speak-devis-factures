import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Switch,
  TextInput,
  Modal,
} from 'react-native';
import {
  Wallet,
  Percent,
  Euro,
  ChevronDown,
  Plus,
  Minus,
  Check,
  Info,
  AlertTriangle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  DepositConfig,
  DepositMode,
  DepositDistribution,
  DEPOSIT_MODE_LABELS,
  DEPOSIT_DISTRIBUTION_LABELS,
  calculateDepositTotal,
  calculateInstallments,
  validateDepositConfig,
} from '@/types/deposit';
import { formatCurrency } from '@/types/document';

interface DepositConfigSectionProps {
  config: DepositConfig;
  onConfigChange: (config: DepositConfig) => void;
  totalTtc: number;
  totalHt: number;
  isQuoteAccepted?: boolean;
  hasGeneratedInvoices?: boolean;
}

export default function DepositConfigSection({
  config,
  onConfigChange,
  totalTtc,
  totalHt,
  isQuoteAccepted = false,
  hasGeneratedInvoices = false,
}: DepositConfigSectionProps) {
  const [showModePicker, setShowModePicker] = useState(false);
  const [showDistributionPicker, setShowDistributionPicker] = useState(false);

  const isDisabled = hasGeneratedInvoices;

  const depositTotal = useMemo(() => {
    if (!config.enabled) return 0;
    return calculateDepositTotal(totalTtc, config.mode, config.value);
  }, [config.enabled, config.mode, config.value, totalTtc]);

  const remainingBalance = useMemo(() => {
    return Math.round((totalTtc - depositTotal) * 100) / 100;
  }, [totalTtc, depositTotal]);

  const computedInstallments = useMemo(() => {
    if (!config.enabled || config.installmentCount < 1) return [];
    
    if (config.distribution === 'custom' && config.installments.length === config.installmentCount) {
      return config.installments;
    }
    
    const calculated = calculateInstallments(depositTotal, config.installmentCount, 'equal');
    
    return calculated.map((inst, idx) => ({
      ...inst,
      dueDate: config.installments[idx]?.dueDate || inst.dueDate,
    }));
  }, [config.enabled, config.installmentCount, config.distribution, config.installments, depositTotal]);

  const validation = useMemo(() => {
    return validateDepositConfig(config, totalTtc);
  }, [config, totalTtc]);

  const handleEnabledChange = useCallback((enabled: boolean) => {
    const newConfig = { ...config, enabled };
    if (enabled && config.installments.length === 0) {
      const total = calculateDepositTotal(totalTtc, config.mode, config.value);
      newConfig.installments = calculateInstallments(total, config.installmentCount, config.distribution);
    }
    onConfigChange(newConfig);
  }, [config, onConfigChange, totalTtc]);

  const handleModeChange = useCallback((mode: DepositMode) => {
    const newValue = mode === 'percent' ? 30 : Math.round(totalTtc * 0.3 * 100) / 100;
    const total = calculateDepositTotal(totalTtc, mode, newValue);
    const newInstallments = calculateInstallments(total, config.installmentCount, config.distribution);
    
    onConfigChange({
      ...config,
      mode,
      value: newValue,
      installments: newInstallments,
    });
    setShowModePicker(false);
  }, [config, onConfigChange, totalTtc]);

  const handleValueChange = useCallback((text: string) => {
    const value = parseFloat(text.replace(',', '.')) || 0;
    const total = calculateDepositTotal(totalTtc, config.mode, value);
    const newInstallments = calculateInstallments(total, config.installmentCount, config.distribution);
    
    onConfigChange({
      ...config,
      value,
      installments: newInstallments,
    });
  }, [config, onConfigChange, totalTtc]);

  const handleInstallmentCountChange = useCallback((delta: number) => {
    const newCount = Math.max(1, Math.min(12, config.installmentCount + delta));
    const total = calculateDepositTotal(totalTtc, config.mode, config.value);
    const newInstallments = calculateInstallments(total, newCount, 'equal');
    
    onConfigChange({
      ...config,
      installmentCount: newCount,
      distribution: 'equal',
      installments: newInstallments,
    });
  }, [config, onConfigChange, totalTtc]);

  const handleDistributionChange = useCallback((distribution: DepositDistribution) => {
    const total = calculateDepositTotal(totalTtc, config.mode, config.value);
    const newInstallments = distribution === 'equal'
      ? calculateInstallments(total, config.installmentCount, 'equal')
      : config.installments.length === config.installmentCount
        ? config.installments
        : calculateInstallments(total, config.installmentCount, 'equal');
    
    onConfigChange({
      ...config,
      distribution,
      installments: newInstallments,
    });
    setShowDistributionPicker(false);
  }, [config, onConfigChange, totalTtc]);

  const handleInstallmentAmountChange = useCallback((index: number, text: string) => {
    const amount = parseFloat(text.replace(',', '.')) || 0;
    const newInstallments = [...config.installments];
    
    if (newInstallments[index]) {
      newInstallments[index] = {
        ...newInstallments[index],
        amount,
        percentage: depositTotal > 0 ? Math.round(amount / depositTotal * 100 * 100) / 100 : 0,
      };
    }
    
    onConfigChange({
      ...config,
      distribution: 'custom',
      installments: newInstallments,
    });
  }, [config, onConfigChange, depositTotal]);

  const normalizeDateToISO = useCallback((input: string): string => {
    if (!input) return '';
    
    const cleaned = input.replace(/[^0-9]/g, '');
    
    if (cleaned.length === 8) {
      const first4 = parseInt(cleaned.substring(0, 4), 10);
      const last4 = parseInt(cleaned.substring(4, 8), 10);
      
      if (first4 >= 1900 && first4 <= 2100) {
        const year = cleaned.substring(0, 4);
        const month = cleaned.substring(4, 6);
        const day = cleaned.substring(6, 8);
        const m = parseInt(month, 10);
        const d = parseInt(day, 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${year}-${month}-${day}`;
        }
      }
      
      if (last4 >= 1900 && last4 <= 2100) {
        const day = cleaned.substring(0, 2);
        const month = cleaned.substring(2, 4);
        const year = cleaned.substring(4, 8);
        const m = parseInt(month, 10);
        const d = parseInt(day, 10);
        if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
          return `${year}-${month}-${day}`;
        }
      }
    }
    
    const separatorMatch = input.match(/^(\d{1,4})[\-\/\.](\d{1,2})[\-\/\.](\d{1,4})$/);
    if (separatorMatch) {
      const [, part1, part2, part3] = separatorMatch;
      
      if (part1.length === 4 && parseInt(part1, 10) >= 1900) {
        const year = part1;
        const month = part2.padStart(2, '0');
        const day = part3.padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
      
      if (part3.length === 4 && parseInt(part3, 10) >= 1900) {
        const day = part1.padStart(2, '0');
        const month = part2.padStart(2, '0');
        const year = part3;
        return `${year}-${month}-${day}`;
      }
    }
    
    return input;
  }, []);

  const handleInstallmentDateChange = useCallback((index: number, date: string) => {
    const newInstallments = [...config.installments];
    
    if (newInstallments[index]) {
      newInstallments[index] = {
        ...newInstallments[index],
        dueDate: date || undefined,
      };
    }
    
    onConfigChange({
      ...config,
      installments: newInstallments,
    });
  }, [config, onConfigChange]);

  const handleInstallmentDateBlur = useCallback((index: number, date: string) => {
    const normalized = normalizeDateToISO(date);
    if (normalized !== date) {
      handleInstallmentDateChange(index, normalized);
    }
  }, [normalizeDateToISO, handleInstallmentDateChange]);

  const getModeIcon = (mode: DepositMode) => {
    return mode === 'percent' 
      ? <Percent size={16} color={Colors.light.tint} />
      : <Euro size={16} color={Colors.light.tint} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Wallet size={20} color={Colors.light.tint} />
          <View>
            <Text style={styles.headerTitle}>Acompte</Text>
            <Text style={styles.headerSubtitle}>
              Configurer les échéances d&apos;acompte
            </Text>
          </View>
        </View>
        <Switch
          value={config.enabled}
          onValueChange={handleEnabledChange}
          trackColor={{ false: Colors.light.borderLight, true: Colors.light.tint }}
          thumbColor="#fff"
          disabled={isDisabled}
        />
      </View>

      {config.enabled && (
        <View style={styles.content}>
          {isDisabled && (
            <View style={styles.disabledBanner}>
              <Info size={16} color={Colors.light.warning} />
              <Text style={styles.disabledText}>
                Configuration verrouillée car des factures ont été générées
              </Text>
            </View>
          )}

          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Mode</Text>
            <TouchableOpacity
              style={styles.modeSelector}
              onPress={() => !isDisabled && setShowModePicker(true)}
              disabled={isDisabled}
            >
              {getModeIcon(config.mode)}
              <Text style={styles.modeSelectorText}>
                {DEPOSIT_MODE_LABELS[config.mode]}
              </Text>
              <ChevronDown size={16} color={Colors.light.textMuted} />
            </TouchableOpacity>
          </View>

          <View style={styles.configRow}>
            <Text style={styles.configLabel}>
              {config.mode === 'percent' ? 'Pourcentage' : 'Montant'}
            </Text>
            <View style={styles.valueInputContainer}>
              <TextInput
                style={styles.valueInput}
                value={String(config.value)}
                onChangeText={handleValueChange}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.light.textMuted}
                editable={!isDisabled}
              />
              <Text style={styles.valueUnit}>
                {config.mode === 'percent' ? '%' : '€'}
              </Text>
            </View>
          </View>

          <View style={styles.configRow}>
            <Text style={styles.configLabel}>Échéances</Text>
            <View style={styles.countSelector}>
              <TouchableOpacity
                style={styles.countButton}
                onPress={() => handleInstallmentCountChange(-1)}
                disabled={config.installmentCount <= 1 || isDisabled}
              >
                <Minus size={16} color={config.installmentCount <= 1 ? Colors.light.textMuted : Colors.light.tint} />
              </TouchableOpacity>
              <Text style={styles.countValue}>{config.installmentCount}</Text>
              <TouchableOpacity
                style={styles.countButton}
                onPress={() => handleInstallmentCountChange(1)}
                disabled={config.installmentCount >= 12 || isDisabled}
              >
                <Plus size={16} color={config.installmentCount >= 12 ? Colors.light.textMuted : Colors.light.tint} />
              </TouchableOpacity>
            </View>
          </View>

          {config.installmentCount > 1 && (
            <View style={styles.configRow}>
              <Text style={styles.configLabel}>Répartition</Text>
              <TouchableOpacity
                style={styles.modeSelector}
                onPress={() => !isDisabled && setShowDistributionPicker(true)}
                disabled={isDisabled}
              >
                <Text style={styles.modeSelectorText}>
                  {DEPOSIT_DISTRIBUTION_LABELS[config.distribution]}
                </Text>
                <ChevronDown size={16} color={Colors.light.textMuted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.installmentsSection}>
            <Text style={styles.installmentsTitle}>Détail des échéances</Text>
            {computedInstallments.map((installment, index) => (
              <View key={index} style={styles.installmentCard}>
                <View style={styles.installmentHeader}>
                  <Text style={styles.installmentIndex}>
                    Échéance {installment.index}/{config.installmentCount}
                  </Text>
                  {installment.isGenerated && (
                    <View style={styles.generatedBadge}>
                      <Check size={12} color="#fff" />
                      <Text style={styles.generatedBadgeText}>Générée</Text>
                    </View>
                  )}
                </View>
                
                <View style={styles.installmentRow}>
                  <Text style={styles.installmentLabel}>Montant</Text>
                  {config.distribution === 'custom' && !isDisabled ? (
                    <View style={styles.installmentInputContainer}>
                      <TextInput
                        style={styles.installmentInput}
                        value={String(installment.amount)}
                        onChangeText={(text) => handleInstallmentAmountChange(index, text)}
                        keyboardType="decimal-pad"
                        editable={!installment.isGenerated}
                      />
                      <Text style={styles.installmentUnit}>€</Text>
                    </View>
                  ) : (
                    <Text style={styles.installmentValue}>
                      {formatCurrency(installment.amount)}
                    </Text>
                  )}
                </View>

                <View style={styles.installmentRow}>
                  <Text style={styles.installmentLabel}>Date (optionnel)</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={installment.dueDate || ''}
                    onChangeText={(text) => handleInstallmentDateChange(index, text)}
                    onBlur={() => handleInstallmentDateBlur(index, installment.dueDate || '')}
                    placeholder="AAAA-MM-JJ"
                    placeholderTextColor={Colors.light.textMuted}
                    editable={!isDisabled && !installment.isGenerated}
                  />
                </View>
              </View>
            ))}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total devis</Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalTtc)}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Total acomptes</Text>
              <Text style={[styles.summaryValue, styles.summaryHighlight]}>
                {formatCurrency(depositTotal)}
              </Text>
            </View>
            <View style={[styles.summaryRow, styles.summaryRowLast]}>
              <Text style={styles.summaryLabel}>Solde estimé</Text>
              <Text style={styles.summaryValue}>{formatCurrency(remainingBalance)}</Text>
            </View>
          </View>

          {!validation.isValid && (
            <View style={styles.validationErrors}>
              {validation.errors.map((error, i) => (
                <View key={i} style={styles.errorRow}>
                  <AlertTriangle size={14} color={Colors.light.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      <Modal
        visible={showModePicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowModePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowModePicker(false)}
        >
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Mode de calcul</Text>
            {(Object.keys(DEPOSIT_MODE_LABELS) as DepositMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[
                  styles.pickerItem,
                  config.mode === mode && styles.pickerItemActive,
                ]}
                onPress={() => handleModeChange(mode)}
              >
                {getModeIcon(mode)}
                <Text style={[
                  styles.pickerItemText,
                  config.mode === mode && styles.pickerItemTextActive,
                ]}>
                  {DEPOSIT_MODE_LABELS[mode]}
                </Text>
                {config.mode === mode && (
                  <Check size={18} color={Colors.light.tint} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={showDistributionPicker}
        animationType="fade"
        transparent
        onRequestClose={() => setShowDistributionPicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowDistributionPicker(false)}
        >
          <View style={styles.pickerModal}>
            <Text style={styles.pickerTitle}>Répartition</Text>
            {(Object.keys(DEPOSIT_DISTRIBUTION_LABELS) as DepositDistribution[]).map(dist => (
              <TouchableOpacity
                key={dist}
                style={[
                  styles.pickerItem,
                  config.distribution === dist && styles.pickerItemActive,
                ]}
                onPress={() => handleDistributionChange(dist)}
              >
                <Text style={[
                  styles.pickerItemText,
                  config.distribution === dist && styles.pickerItemTextActive,
                ]}>
                  {DEPOSIT_DISTRIBUTION_LABELS[dist]}
                </Text>
                {config.distribution === dist && (
                  <Check size={18} color={Colors.light.tint} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F59E0B20',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  headerSubtitle: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  content: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    padding: 14,
    gap: 14,
  },
  disabledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.warning + '15',
    padding: 10,
    borderRadius: 8,
  },
  disabledText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.warning,
  },
  configRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  configLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  modeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.tint + '10',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  modeSelectorText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  valueInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 12,
  },
  valueInput: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
    paddingVertical: 8,
    minWidth: 60,
    textAlign: 'right',
  },
  valueUnit: {
    fontSize: 14,
    color: Colors.light.textMuted,
    marginLeft: 4,
  },
  countSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  countButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tint + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    minWidth: 24,
    textAlign: 'center',
  },
  installmentsSection: {
    gap: 10,
  },
  installmentsTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  installmentCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  installmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  installmentIndex: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  generatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.success,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  generatedBadgeText: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: '#fff',
  },
  installmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  installmentLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  installmentValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  installmentInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 10,
  },
  installmentInput: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    paddingVertical: 6,
    minWidth: 50,
    textAlign: 'right',
  },
  installmentUnit: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginLeft: 4,
  },
  dateInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: Colors.light.text,
    minWidth: 110,
    textAlign: 'center',
  },
  summary: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryRowLast: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 8,
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  summaryHighlight: {
    color: Colors.light.tint,
  },
  validationErrors: {
    gap: 6,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.error,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  pickerModal: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 8,
    width: '100%',
    maxWidth: 320,
  },
  pickerTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
  },
  pickerItemActive: {
    backgroundColor: Colors.light.tint + '10',
  },
  pickerItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  pickerItemTextActive: {
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
});
