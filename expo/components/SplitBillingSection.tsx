import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Switch,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import { 
  Users, Plus, Trash2, User, ChevronDown, Check, X,
  Percent, Euro, Equal, Package, AlertTriangle
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { Client } from '@/types/client';
import { 
  SplitClientInput, 
  AllocationMode, 
  ALLOCATION_MODE_LABELS,
  calculateSplitTotals,
  validateSplitConfiguration,
} from '@/types/splitBilling';
import { formatCurrency } from '@/types/document';

interface LineItemForSplit {
  key: string;
  label?: string;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
}

interface SplitBillingSectionProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  splits: SplitClientInput[];
  onSplitsChange: (splits: SplitClientInput[]) => void;
  clients: Client[];
  lineItems: LineItemForSplit[];
  masterTotalHt: number;
  masterTotalTva: number;
  masterTotalTtc: number;
  autoLiquidation: boolean;
}

export default function SplitBillingSection({
  enabled,
  onEnabledChange,
  splits,
  onSplitsChange,
  clients,
  lineItems,
  masterTotalHt,
  masterTotalTva,
  masterTotalTtc,
  autoLiquidation,
}: SplitBillingSectionProps) {
  const [showClientPicker, setShowClientPicker] = useState<string | null>(null);
  const [showLinePicker, setShowLinePicker] = useState<string | null>(null);
  const [showModePicker, setShowModePicker] = useState<string | null>(null);

  const handleAddSplit = useCallback(() => {
    const newSplit: SplitClientInput = {
      key: `split-${Date.now()}-${Math.random()}`,
      client_id: null,
      allocation_mode: 'by_product',
      allocation_value: '',
      assigned_line_keys: [],
      computed_total_ht: 0,
      computed_total_tva: 0,
      computed_total_ttc: 0,
    };
    onSplitsChange([...splits, newSplit]);
  }, [splits, onSplitsChange]);

  const handleRemoveSplit = useCallback((key: string) => {
    onSplitsChange(splits.filter(s => s.key !== key));
  }, [splits, onSplitsChange]);

  const handleSelectClient = useCallback((splitKey: string, client: Client) => {
    onSplitsChange(splits.map(s => 
      s.key === splitKey 
        ? { ...s, client_id: client.id, client: { id: client.id, name: client.name, company: client.company, email: client.email } }
        : s
    ));
    setShowClientPicker(null);
  }, [splits, onSplitsChange]);

  const handleModeChange = useCallback((splitKey: string, mode: AllocationMode) => {
    onSplitsChange(splits.map(s => {
      if (s.key !== splitKey) return s;
      
      let newValue = s.allocation_value;
      if (mode === 'equal') {
        newValue = '';
      } else if (mode === 'percentage' && !s.allocation_value) {
        newValue = String(Math.round(100 / Math.max(splits.length, 1)));
      }
      
      return { 
        ...s, 
        allocation_mode: mode,
        allocation_value: newValue,
        assigned_line_keys: mode === 'by_product' ? s.assigned_line_keys : [],
      };
    }));
    setShowModePicker(null);
  }, [splits, onSplitsChange]);

  const handleValueChange = useCallback((splitKey: string, value: string) => {
    onSplitsChange(splits.map(s => 
      s.key === splitKey ? { ...s, allocation_value: value } : s
    ));
  }, [splits, onSplitsChange]);

  const handleToggleLine = useCallback((splitKey: string, lineKey: string) => {
    onSplitsChange(splits.map(s => {
      if (s.key !== splitKey) return s;
      
      const hasLine = s.assigned_line_keys.includes(lineKey);
      return {
        ...s,
        assigned_line_keys: hasLine 
          ? s.assigned_line_keys.filter(k => k !== lineKey)
          : [...s.assigned_line_keys, lineKey],
      };
    }));
  }, [splits, onSplitsChange]);

  const computedSplits = useMemo(() => {
    return splits.map(split => {
      let totalHt = 0;
      let totalTva = 0;
      let totalTtc = 0;

      if (split.allocation_mode === 'by_product') {
        const assignedLines = lineItems.filter(l => split.assigned_line_keys.includes(l.key));
        const totals = calculateSplitTotals(assignedLines, autoLiquidation);
        totalHt = totals.totalHt;
        totalTva = totals.totalTva;
        totalTtc = totals.totalTtc;
      } else if (split.allocation_mode === 'percentage') {
        const pct = parseFloat(split.allocation_value) || 0;
        totalHt = Math.round(masterTotalHt * pct / 100 * 100) / 100;
        totalTva = Math.round(masterTotalTva * pct / 100 * 100) / 100;
        totalTtc = Math.round(masterTotalTtc * pct / 100 * 100) / 100;
      } else if (split.allocation_mode === 'fixed') {
        totalTtc = parseFloat(split.allocation_value) || 0;
        const ratio = masterTotalTtc > 0 ? totalTtc / masterTotalTtc : 0;
        totalHt = Math.round(masterTotalHt * ratio * 100) / 100;
        totalTva = Math.round(masterTotalTva * ratio * 100) / 100;
      } else if (split.allocation_mode === 'equal') {
        const count = splits.length || 1;
        totalHt = Math.round(masterTotalHt / count * 100) / 100;
        totalTva = Math.round(masterTotalTva / count * 100) / 100;
        totalTtc = Math.round(masterTotalTtc / count * 100) / 100;
      }

      return {
        ...split,
        computed_total_ht: totalHt,
        computed_total_tva: totalTva,
        computed_total_ttc: totalTtc,
      };
    });
  }, [splits, lineItems, masterTotalHt, masterTotalTva, masterTotalTtc, autoLiquidation]);

  React.useEffect(() => {
    const hasChanges = computedSplits.some((cs, i) => 
      cs.computed_total_ht !== splits[i]?.computed_total_ht ||
      cs.computed_total_tva !== splits[i]?.computed_total_tva ||
      cs.computed_total_ttc !== splits[i]?.computed_total_ttc
    );
    if (hasChanges) {
      onSplitsChange(computedSplits);
    }
  }, [computedSplits, splits, onSplitsChange]);

  const totalReparti = useMemo(() => 
    computedSplits.reduce((sum, s) => sum + s.computed_total_ttc, 0),
    [computedSplits]
  );

  const validation = useMemo(() => 
    validateSplitConfiguration(computedSplits, masterTotalTtc, lineItems),
    [computedSplits, masterTotalTtc, lineItems]
  );

  const ecart = Math.round((totalReparti - masterTotalTtc) * 100) / 100;

  const getModeIcon = (mode: AllocationMode) => {
    switch (mode) {
      case 'by_product': return <Package size={16} color={Colors.light.tint} />;
      case 'percentage': return <Percent size={16} color={Colors.light.tint} />;
      case 'fixed': return <Euro size={16} color={Colors.light.tint} />;
      case 'equal': return <Equal size={16} color={Colors.light.tint} />;
    }
  };

  const usedLineKeys = useMemo(() => {
    const keys = new Set<string>();
    splits.forEach(s => {
      if (s.allocation_mode === 'by_product') {
        s.assigned_line_keys.forEach(k => keys.add(k));
      }
    });
    return keys;
  }, [splits]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Users size={20} color={Colors.light.tint} />
          <View>
            <Text style={styles.headerTitle}>Répartition copropriétaires</Text>
            <Text style={styles.headerSubtitle}>
              Répartir le document entre plusieurs clients
            </Text>
          </View>
        </View>
        <Switch
          value={enabled}
          onValueChange={onEnabledChange}
          trackColor={{ false: Colors.light.borderLight, true: Colors.light.tint }}
          thumbColor="#fff"
        />
      </View>

      {enabled && (
        <View style={styles.content}>
          {computedSplits.map((split, index) => (
            <View key={split.key} style={styles.splitCard}>
              <View style={styles.splitHeader}>
                <Text style={styles.splitIndex}>Client {index + 1}</Text>
                <TouchableOpacity
                  onPress={() => handleRemoveSplit(split.key)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Trash2 size={18} color={Colors.light.error} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.clientSelector}
                onPress={() => setShowClientPicker(split.key)}
              >
                {split.client ? (
                  <View style={styles.selectedClient}>
                    <View style={styles.clientAvatar}>
                      <Text style={styles.avatarText}>
                        {split.client.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.clientInfo}>
                      <Text style={styles.clientName}>{split.client.name}</Text>
                      {split.client.company && (
                        <Text style={styles.clientCompany}>{split.client.company}</Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.placeholderClient}>
                    <User size={18} color={Colors.light.textMuted} />
                    <Text style={styles.placeholderText}>Sélectionner un client</Text>
                  </View>
                )}
                <ChevronDown size={18} color={Colors.light.textMuted} />
              </TouchableOpacity>

              <View style={styles.modeRow}>
                <Text style={styles.modeLabel}>Mode de calcul</Text>
                <TouchableOpacity
                  style={styles.modeSelector}
                  onPress={() => setShowModePicker(split.key)}
                >
                  {getModeIcon(split.allocation_mode)}
                  <Text style={styles.modeSelectorText}>
                    {ALLOCATION_MODE_LABELS[split.allocation_mode]}
                  </Text>
                  <ChevronDown size={16} color={Colors.light.textMuted} />
                </TouchableOpacity>
              </View>

              {split.allocation_mode === 'percentage' && (
                <View style={styles.valueRow}>
                  <Text style={styles.valueLabel}>Pourcentage</Text>
                  <View style={styles.valueInputContainer}>
                    <TextInput
                      style={styles.valueInput}
                      value={split.allocation_value}
                      onChangeText={(v) => handleValueChange(split.key, v.replace(',', '.'))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.light.textMuted}
                    />
                    <Text style={styles.valueUnit}>%</Text>
                  </View>
                </View>
              )}

              {split.allocation_mode === 'fixed' && (
                <View style={styles.valueRow}>
                  <Text style={styles.valueLabel}>Montant TTC</Text>
                  <View style={styles.valueInputContainer}>
                    <TextInput
                      style={styles.valueInput}
                      value={split.allocation_value}
                      onChangeText={(v) => handleValueChange(split.key, v.replace(',', '.'))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor={Colors.light.textMuted}
                    />
                    <Text style={styles.valueUnit}>€</Text>
                  </View>
                </View>
              )}

              {split.allocation_mode === 'by_product' && (
                <View style={styles.productsSection}>
                  <TouchableOpacity
                    style={styles.productsButton}
                    onPress={() => setShowLinePicker(split.key)}
                  >
                    <Package size={16} color={Colors.light.tint} />
                    <Text style={styles.productsButtonText}>
                      {split.assigned_line_keys.length > 0 
                        ? `${split.assigned_line_keys.length} produit(s) assigné(s)`
                        : 'Assigner des produits'
                      }
                    </Text>
                  </TouchableOpacity>
                  
                  {split.assigned_line_keys.length > 0 && (
                    <View style={styles.assignedLines}>
                      {split.assigned_line_keys.map(lineKey => {
                        const line = lineItems.find(l => l.key === lineKey);
                        if (!line) return null;
                        return (
                          <View key={lineKey} style={styles.assignedLine}>
                            <Text style={styles.assignedLineText} numberOfLines={1}>
                              {line.label || line.description}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleToggleLine(split.key, lineKey)}
                              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                            >
                              <X size={14} color={Colors.light.textMuted} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              <View style={styles.splitTotal}>
                <Text style={styles.splitTotalLabel}>Total pour ce client</Text>
                <Text style={styles.splitTotalValue}>
                  {formatCurrency(split.computed_total_ttc)}
                </Text>
              </View>

              <Modal
                visible={showClientPicker === split.key}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowClientPicker(null)}
              >
                <View style={styles.modalContainer}>
                  <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setShowClientPicker(null)}>
                      <X size={24} color={Colors.light.text} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Sélectionner un client</Text>
                    <View style={{ width: 24 }} />
                  </View>
                  <ScrollView style={styles.modalContent}>
                    {clients.map(client => (
                      <TouchableOpacity
                        key={client.id}
                        style={styles.modalItem}
                        onPress={() => handleSelectClient(split.key, client)}
                      >
                        <View style={styles.clientAvatar}>
                          <Text style={styles.avatarText}>
                            {client.name.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.clientInfo}>
                          <Text style={styles.clientName}>{client.name}</Text>
                          {client.company && (
                            <Text style={styles.clientCompany}>{client.company}</Text>
                          )}
                        </View>
                        {split.client_id === client.id && (
                          <Check size={20} color={Colors.light.tint} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              </Modal>

              <Modal
                visible={showModePicker === split.key}
                animationType="fade"
                transparent
                onRequestClose={() => setShowModePicker(null)}
              >
                <TouchableOpacity 
                  style={styles.modalOverlay}
                  activeOpacity={1}
                  onPress={() => setShowModePicker(null)}
                >
                  <View style={styles.modePickerModal}>
                    <Text style={styles.modePickerTitle}>Mode de calcul</Text>
                    {(Object.keys(ALLOCATION_MODE_LABELS) as AllocationMode[]).map(mode => (
                      <TouchableOpacity
                        key={mode}
                        style={[
                          styles.modePickerItem,
                          split.allocation_mode === mode && styles.modePickerItemActive,
                        ]}
                        onPress={() => handleModeChange(split.key, mode)}
                      >
                        {getModeIcon(mode)}
                        <Text style={[
                          styles.modePickerItemText,
                          split.allocation_mode === mode && styles.modePickerItemTextActive,
                        ]}>
                          {ALLOCATION_MODE_LABELS[mode]}
                        </Text>
                        {split.allocation_mode === mode && (
                          <Check size={18} color={Colors.light.tint} />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                </TouchableOpacity>
              </Modal>

              <Modal
                visible={showLinePicker === split.key}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowLinePicker(null)}
              >
                <View style={styles.modalContainer}>
                  <View style={styles.modalHeader}>
                    <TouchableOpacity onPress={() => setShowLinePicker(null)}>
                      <X size={24} color={Colors.light.text} />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>Assigner des produits</Text>
                    <TouchableOpacity onPress={() => setShowLinePicker(null)}>
                      <Check size={24} color={Colors.light.tint} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={styles.modalContent}>
                    {lineItems.map(line => {
                      const isAssigned = split.assigned_line_keys.includes(line.key);
                      const isUsedElsewhere = !isAssigned && usedLineKeys.has(line.key);
                      
                      return (
                        <TouchableOpacity
                          key={line.key}
                          style={[
                            styles.linePickerItem,
                            isAssigned && styles.linePickerItemSelected,
                            isUsedElsewhere && styles.linePickerItemDisabled,
                          ]}
                          onPress={() => !isUsedElsewhere && handleToggleLine(split.key, line.key)}
                          disabled={isUsedElsewhere}
                        >
                          <View style={styles.linePickerCheckbox}>
                            {isAssigned && <Check size={16} color="#fff" />}
                          </View>
                          <View style={styles.linePickerInfo}>
                            <Text style={[
                              styles.linePickerLabel,
                              isUsedElsewhere && styles.linePickerLabelDisabled,
                            ]}>
                              {line.label || line.description}
                            </Text>
                            <Text style={styles.linePickerDetail}>
                              {line.quantity} x {formatCurrency(line.unit_price)}
                            </Text>
                            {isUsedElsewhere && (
                              <Text style={styles.linePickerWarning}>
                                Déjà assigné à un autre client
                              </Text>
                            )}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </Modal>
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={handleAddSplit}>
            <Plus size={18} color={Colors.light.tint} />
            <Text style={styles.addButtonText}>Ajouter un client</Text>
          </TouchableOpacity>

          {computedSplits.length > 0 && (
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total global</Text>
                <Text style={styles.summaryValue}>{formatCurrency(masterTotalTtc)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total réparti</Text>
                <Text style={[
                  styles.summaryValue,
                  Math.abs(ecart) > 0.01 && { color: Colors.light.error },
                ]}>
                  {formatCurrency(totalReparti)}
                </Text>
              </View>
              {Math.abs(ecart) > 0.01 && (
                <View style={styles.errorBanner}>
                  <AlertTriangle size={16} color={Colors.light.error} />
                  <Text style={styles.errorText}>
                    Écart de {formatCurrency(Math.abs(ecart))} avec le total global
                  </Text>
                </View>
              )}
              {!validation.isValid && validation.errors.length > 0 && (
                <View style={styles.validationErrors}>
                  {validation.errors.map((error, i) => (
                    <Text key={i} style={styles.validationError}>• {error}</Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.light.tint + '20',
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
    gap: 12,
  },
  splitCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    gap: 10,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  splitIndex: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  clientSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  selectedClient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clientAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  clientCompany: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  placeholderClient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  placeholderText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modeLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  modeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.light.tint + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modeSelectorText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  valueLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  valueInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
    paddingHorizontal: 10,
  },
  valueInput: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    paddingVertical: 8,
    minWidth: 60,
    textAlign: 'right',
  },
  valueUnit: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginLeft: 4,
  },
  productsSection: {
    gap: 8,
  },
  productsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint + '10',
    padding: 10,
    borderRadius: 8,
  },
  productsButtonText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  assignedLines: {
    gap: 6,
  },
  assignedLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  assignedLineText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  splitTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 10,
    marginTop: 4,
  },
  splitTotalLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  splitTotalValue: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.light.tint + '10',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint + '30',
    borderStyle: 'dashed',
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
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
  summaryLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.error + '15',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.error,
  },
  validationErrors: {
    marginTop: 4,
  },
  validationError: {
    fontSize: 12,
    color: Colors.light.error,
    marginTop: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  modalContent: {
    flex: 1,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modePickerModal: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 8,
    width: '100%',
    maxWidth: 320,
  },
  modePickerTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  modePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
  },
  modePickerItemActive: {
    backgroundColor: Colors.light.tint + '10',
  },
  modePickerItemText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.text,
  },
  modePickerItemTextActive: {
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  linePickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  linePickerItemSelected: {
    backgroundColor: Colors.light.tint + '10',
  },
  linePickerItemDisabled: {
    opacity: 0.5,
  },
  linePickerCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint,
  },
  linePickerInfo: {
    flex: 1,
  },
  linePickerLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  linePickerLabelDisabled: {
    color: Colors.light.textMuted,
  },
  linePickerDetail: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  linePickerWarning: {
    fontSize: 11,
    color: Colors.light.warning,
    marginTop: 2,
  },
});
