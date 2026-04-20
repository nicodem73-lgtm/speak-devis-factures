import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { X, Check, AlertTriangle, Users, Package, Percent, Euro, Equal } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { 
  SplitClientInput, 
  AllocationMode,
  generateSplitNumber,
  validateSplitConfiguration,
} from '@/types/splitBilling';
import { formatCurrency } from '@/types/document';

interface LineItemForSummary {
  key: string;
  label?: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface SplitSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  splits: SplitClientInput[];
  lineItems: LineItemForSummary[];
  masterNumber: string;
  masterTotalHt: number;
  masterTotalTva: number;
  masterTotalTtc: number;
  isCreating?: boolean;
}

export default function SplitSummaryModal({
  visible,
  onClose,
  onConfirm,
  splits,
  lineItems,
  masterNumber,
  masterTotalHt,
  masterTotalTva,
  masterTotalTtc,
  isCreating,
}: SplitSummaryModalProps) {
  const validation = validateSplitConfiguration(splits, masterTotalTtc, lineItems);
  const totalReparti = splits.reduce((sum, s) => sum + s.computed_total_ttc, 0);
  const ecart = Math.round((totalReparti - masterTotalTtc) * 100) / 100;

  const getModeIcon = (mode: AllocationMode) => {
    switch (mode) {
      case 'by_product': return <Package size={14} color={Colors.light.textSecondary} />;
      case 'percentage': return <Percent size={14} color={Colors.light.textSecondary} />;
      case 'fixed': return <Euro size={14} color={Colors.light.textSecondary} />;
      case 'equal': return <Equal size={14} color={Colors.light.textSecondary} />;
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <X size={24} color={Colors.light.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Récapitulatif de répartition</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          <View style={styles.masterCard}>
            <View style={styles.masterHeader}>
              <Users size={20} color={Colors.light.tint} />
              <Text style={styles.masterTitle}>Document maître</Text>
            </View>
            <Text style={styles.masterNumber}>{masterNumber}</Text>
            <View style={styles.masterTotals}>
              <View style={styles.masterTotalRow}>
                <Text style={styles.masterTotalLabel}>Total HT</Text>
                <Text style={styles.masterTotalValue}>{formatCurrency(masterTotalHt)}</Text>
              </View>
              <View style={styles.masterTotalRow}>
                <Text style={styles.masterTotalLabel}>TVA</Text>
                <Text style={styles.masterTotalValue}>{formatCurrency(masterTotalTva)}</Text>
              </View>
              <View style={[styles.masterTotalRow, styles.masterTotalRowMain]}>
                <Text style={styles.masterTotalLabelMain}>Total TTC</Text>
                <Text style={styles.masterTotalValueMain}>{formatCurrency(masterTotalTtc)}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Répartition ({splits.length} client{splits.length > 1 ? 's' : ''})</Text>

          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Client</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Produits</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Mode</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'right' }]}>Montant</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1.2, textAlign: 'right' }]}>N° split</Text>
            </View>

            {splits.map((split, index) => {
              const splitNumber = generateSplitNumber(masterNumber, index);
              const assignedLines = split.allocation_mode === 'by_product'
                ? lineItems.filter(l => split.assigned_line_keys.includes(l.key))
                : lineItems;
              
              return (
                <View key={split.key} style={styles.tableRow}>
                  <View style={[styles.tableCell, { flex: 2 }]}>
                    <Text style={styles.tableCellText} numberOfLines={1}>
                      {split.client?.name || 'Non défini'}
                    </Text>
                    {split.client?.company && (
                      <Text style={styles.tableCellSubtext} numberOfLines={1}>
                        {split.client.company}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.tableCell, { flex: 1.5 }]}>
                    {split.allocation_mode === 'by_product' ? (
                      <Text style={styles.tableCellText} numberOfLines={2}>
                        {assignedLines.map(l => l.label || l.description).join(', ') || '-'}
                      </Text>
                    ) : (
                      <Text style={styles.tableCellSubtext}>Tous (quote-part)</Text>
                    )}
                  </View>
                  <View style={[styles.tableCell, { flex: 1 }]}>
                    <View style={styles.modeTag}>
                      {getModeIcon(split.allocation_mode)}
                      <Text style={styles.modeTagText}>
                        {split.allocation_mode === 'by_product' && 'Produit'}
                        {split.allocation_mode === 'percentage' && `${split.allocation_value}%`}
                        {split.allocation_mode === 'fixed' && `${split.allocation_value}€`}
                        {split.allocation_mode === 'equal' && 'Égal'}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tableCell, { flex: 1, alignItems: 'flex-end' }]}>
                    <Text style={styles.tableCellAmount}>
                      {formatCurrency(split.computed_total_ttc)}
                    </Text>
                  </View>
                  <View style={[styles.tableCell, { flex: 1.2, alignItems: 'flex-end' }]}>
                    <Text style={styles.splitNumberText}>{splitNumber}</Text>
                  </View>
                </View>
              );
            })}

            <View style={styles.tableFooter}>
              <Text style={styles.tableFooterLabel}>Total réparti</Text>
              <Text style={[
                styles.tableFooterValue,
                Math.abs(ecart) > 0.01 && { color: Colors.light.error },
              ]}>
                {formatCurrency(totalReparti)}
              </Text>
            </View>
          </View>

          {Math.abs(ecart) > 0.01 && (
            <View style={styles.warningBanner}>
              <AlertTriangle size={18} color={Colors.light.error} />
              <View style={styles.warningContent}>
                <Text style={styles.warningTitle}>Écart détecté</Text>
                <Text style={styles.warningText}>
                  Le total réparti ({formatCurrency(totalReparti)}) diffère du total global ({formatCurrency(masterTotalTtc)}).
                  Écart : {formatCurrency(Math.abs(ecart))}
                </Text>
              </View>
            </View>
          )}

          {!validation.isValid && validation.errors.length > 0 && (
            <View style={styles.errorList}>
              <Text style={styles.errorListTitle}>Corrections requises :</Text>
              {validation.errors.map((error, i) => (
                <Text key={i} style={styles.errorItem}>• {error}</Text>
              ))}
            </View>
          )}

          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>Lors de la validation :</Text>
            <Text style={styles.infoText}>• Le document maître sera créé</Text>
            <Text style={styles.infoText}>• {splits.length} split(s) seront générés</Text>
            <Text style={styles.infoText}>• Chaque split pourra être envoyé et suivi séparément</Text>
            <Text style={styles.infoText}>• L&apos;arrondi sera appliqué au split le plus élevé</Text>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
            <Text style={styles.cancelButtonText}>Modifier</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.confirmButton,
              !validation.isValid && styles.confirmButtonDisabled,
            ]}
            onPress={onConfirm}
            disabled={!validation.isValid || isCreating}
          >
            <Check size={18} color="#fff" />
            <Text style={styles.confirmButtonText}>
              {isCreating ? 'Création...' : 'Valider et créer'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 16,
  },
  masterCard: {
    backgroundColor: Colors.light.tint + '10',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.light.tint + '30',
  },
  masterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  masterTitle: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  masterNumber: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  masterTotals: {
    gap: 6,
  },
  masterTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  masterTotalRowMain: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.tint + '30',
    paddingTop: 8,
    marginTop: 4,
  },
  masterTotalLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  masterTotalValue: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  masterTotalLabelMain: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  masterTotalValueMain: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  table: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.light.background,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.light.textMuted,
    textTransform: 'uppercase' as const,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  tableCell: {
    justifyContent: 'center',
    paddingRight: 8,
  },
  tableCellText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  tableCellSubtext: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 1,
  },
  modeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.background,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  modeTagText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  tableCellAmount: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  splitNumberText: {
    fontSize: 11,
    fontWeight: '500' as const,
    color: Colors.light.tint,
    fontFamily: 'monospace',
  },
  tableFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: Colors.light.background,
  },
  tableFooterLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  tableFooterValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.light.error + '15',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.error + '30',
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.error,
    marginBottom: 4,
  },
  warningText: {
    fontSize: 13,
    color: Colors.light.error,
    lineHeight: 18,
  },
  errorList: {
    backgroundColor: Colors.light.error + '10',
    padding: 12,
    borderRadius: 10,
  },
  errorListTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.error,
    marginBottom: 6,
  },
  errorItem: {
    fontSize: 12,
    color: Colors.light.error,
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: Colors.light.info + '10',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.info + '30',
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.info,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    backgroundColor: Colors.light.surface,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  confirmButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#fff',
  },
});
