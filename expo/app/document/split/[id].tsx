import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { 
  Download, Mail, Printer, CreditCard, Send, Check,
  Users, ArrowLeft
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getSplitById, getSplitLineAssignments, markSplitAsPaid, markSplitAsSent } from '@/db/splitBilling';
import { getDocumentById } from '@/db/documents';
import { getClientById } from '@/db/clients';
import { getCompanyInfo } from '@/db/settings';
import { formatCurrency, formatDate } from '@/types/document';
import { SPLIT_STATUS_LABELS, SPLIT_STATUS_COLORS } from '@/types/splitBilling';
import { 
  generateSplitPDF, 
  sharePDF, 
  sendSplitEmailWithPDF,
  printDocument,
} from '@/utils/pdfGenerator';

const PAYMENT_METHODS = [
  { key: 'virement', label: 'Virement bancaire' },
  { key: 'carte', label: 'Carte bancaire' },
  { key: 'cheque', label: 'Chèque' },
  { key: 'especes', label: 'Espèces' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'autre', label: 'Autre' },
];

export default function SplitDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const splitId = id || '';
  
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  const { data: split, isLoading: loadingSplit } = useQuery({
    queryKey: ['split', splitId, db],
    queryFn: async () => {
      if (!db) return null;
      return getSplitById(db, splitId);
    },
    enabled: isReady && !!db && !!splitId,
  });

  const { data: lineAssignments = [] } = useQuery({
    queryKey: ['splitLineAssignments', splitId, db],
    queryFn: async () => {
      if (!db) return [];
      return getSplitLineAssignments(db, splitId);
    },
    enabled: isReady && !!db && !!splitId,
  });

  const { data: masterDocument } = useQuery({
    queryKey: ['document', split?.master_id, db],
    queryFn: async () => {
      if (!db || !split?.master_id) return null;
      return getDocumentById(db, split.master_id);
    },
    enabled: isReady && !!db && !!split?.master_id,
  });

  const { data: client } = useQuery({
    queryKey: ['client', split?.client_id, db],
    queryFn: async () => {
      if (!db || !split?.client_id) return null;
      return getClientById(db, split.client_id);
    },
    enabled: isReady && !!db && !!split?.client_id,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ['companyInfo', db],
    queryFn: async () => {
      if (!db) return null;
      return getCompanyInfo(db);
    },
    enabled: isReady && !!db,
  });

  const { mutate: markPaid, isPending: isMarkingPaid } = useMutation({
    mutationFn: async ({ method, ref }: { method: string; ref: string }) => {
      if (!db) throw new Error('No database');
      return markSplitAsPaid(db, splitId, method, ref);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['split', splitId] });
      queryClient.invalidateQueries({ queryKey: ['documentSplits'] });
      queryClient.invalidateQueries({ queryKey: ['splitStats'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowPaymentModal(false);
      setSelectedPaymentMethod('');
      setPaymentRef('');
      Alert.alert('Succès', 'Split marqué comme payé');
    },
    onError: (error) => {
      console.error('[MarkSplitPaid] Error:', error);
      Alert.alert('Erreur', 'Impossible de marquer le split comme payé');
    },
  });

  const { mutate: markSent, isPending: isMarkingSent } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      return markSplitAsSent(db, splitId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['split', splitId] });
      queryClient.invalidateQueries({ queryKey: ['documentSplits'] });
      Alert.alert('Succès', 'Split marqué comme envoyé');
    },
    onError: (error) => {
      console.error('[MarkSplitSent] Error:', error);
      Alert.alert('Erreur', 'Impossible de marquer le split comme envoyé');
    },
  });

  const handleExportPDF = useCallback(async () => {
    if (!split || !masterDocument || !companyInfo) {
      Alert.alert('Erreur', 'Données manquantes pour générer le PDF');
      return;
    }

    try {
      const result = await generateSplitPDF(
        split, 
        masterDocument, 
        lineAssignments, 
        client || null, 
        companyInfo
      );
      await sharePDF(result.uri);
    } catch (error) {
      console.error('[SplitPDF] Export error:', error);
      Alert.alert('Erreur', 'Impossible d\'exporter le PDF');
    }
  }, [split, masterDocument, lineAssignments, client, companyInfo]);

  const handleSendEmail = useCallback(async () => {
    if (!split || !masterDocument || !companyInfo) {
      Alert.alert('Erreur', 'Données manquantes');
      return;
    }

    try {
      const sent = await sendSplitEmailWithPDF(
        split,
        masterDocument,
        lineAssignments,
        client || null,
        companyInfo
      );
      
      if (sent && split.status === 'draft') {
        markSent();
      }
    } catch (error) {
      console.error('[SplitEmail] Error:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application email');
    }
  }, [split, masterDocument, lineAssignments, client, companyInfo, markSent]);

  const handlePrint = useCallback(async () => {
    if (!split || !masterDocument || !companyInfo) return;
    
    try {
      await generateSplitPDF(
        split,
        masterDocument,
        lineAssignments,
        client || null,
        companyInfo
      );
      
      const splitDocument = {
        ...masterDocument,
        number: split.number_full,
        total_ht: split.total_ht,
        total_tva: split.total_tva,
        total_ttc: split.total_ttc,
      };
      
      await printDocument(splitDocument, [], client || null, companyInfo);
    } catch (error) {
      console.error('[SplitPrint] Error:', error);
      Alert.alert('Erreur', 'Impossible d\'imprimer');
    }
  }, [split, masterDocument, lineAssignments, client, companyInfo]);

  const handleMarkSent = useCallback(() => {
    Alert.alert(
      'Marquer comme envoyé',
      'Voulez-vous marquer ce split comme envoyé ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => markSent() },
      ]
    );
  }, [markSent]);

  const handleMarkPaid = useCallback(() => {
    setShowPaymentModal(true);
  }, []);

  const confirmMarkPaid = useCallback(() => {
    markPaid({ method: selectedPaymentMethod, ref: paymentRef });
  }, [markPaid, selectedPaymentMethod, paymentRef]);

  const isLoading = !isReady || loadingSplit;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!split) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Split introuvable</Text>
      </View>
    );
  }

  const statusColor = SPLIT_STATUS_COLORS[split.status];

  return (
    <>
      <Stack.Screen
        options={{
          title: split.number_full,
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ArrowLeft size={24} color={Colors.light.text} />
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.statusHeader}>
          <View style={[styles.statusTag, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {SPLIT_STATUS_LABELS[split.status]}
            </Text>
          </View>
          <Text style={styles.amountBig}>{formatCurrency(split.total_ttc)}</Text>
        </View>

        <View style={styles.masterRefCard}>
          <Users size={18} color={Colors.light.tint} />
          <View style={styles.masterRefInfo}>
            <Text style={styles.masterRefLabel}>Document maître</Text>
            <TouchableOpacity onPress={() => router.push(`/document/${split.master_id}`)}>
              <Text style={styles.masterRefNumber}>{masterDocument?.number || 'N/A'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleExportPDF}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.tint + '15' }]}>
              <Download size={20} color={Colors.light.tint} />
            </View>
            <Text style={styles.quickActionText}>Export PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handlePrint}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.textSecondary + '15' }]}>
              <Printer size={20} color={Colors.light.textSecondary} />
            </View>
            <Text style={styles.quickActionText}>Imprimer</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleSendEmail}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.success + '15' }]}>
              <Mail size={20} color={Colors.light.success} />
            </View>
            <Text style={styles.quickActionText}>Email</Text>
          </TouchableOpacity>
          {split.status !== 'paid' && split.status !== 'cancelled' && (
            <TouchableOpacity style={styles.quickActionBtn} onPress={handleMarkPaid}>
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.success + '15' }]}>
                <CreditCard size={20} color={Colors.light.success} />
              </View>
              <Text style={styles.quickActionText}>Payé</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Client</Text>
          <View style={styles.clientCard}>
            <View style={styles.clientAvatar}>
              <Text style={styles.avatarText}>
                {(split.client_name || 'C').charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.clientInfo}>
              <Text style={styles.clientName}>{split.client_name || 'Client'}</Text>
              {split.client_company && (
                <Text style={styles.clientCompany}>{split.client_company}</Text>
              )}
              {split.client_email && (
                <Text style={styles.clientEmail}>{split.client_email}</Text>
              )}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lignes ({lineAssignments.length})</Text>
          <View style={styles.linesCard}>
            {lineAssignments.map((line, index) => (
              <View 
                key={line.id} 
                style={[
                  styles.lineItem,
                  index < lineAssignments.length - 1 && styles.lineItemBorder,
                ]}
              >
                <View style={styles.lineInfo}>
                  <Text style={styles.lineLabel}>{line.label || line.description}</Text>
                  <Text style={styles.lineDetail}>
                    {line.quantity} x {formatCurrency(line.unit_price)} • TVA {line.tva_rate}%
                  </Text>
                </View>
                <Text style={styles.lineTotal}>{formatCurrency(line.total_ht)}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Totaux</Text>
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{formatCurrency(split.total_ht)}</Text>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>TVA</Text>
              <Text style={styles.totalValue}>{formatCurrency(split.total_tva)}</Text>
            </View>
            <View style={[styles.totalRow, styles.totalRowMain]}>
              <Text style={styles.totalLabelMain}>Total TTC</Text>
              <Text style={styles.totalValueMain}>{formatCurrency(split.total_ttc)}</Text>
            </View>
          </View>
        </View>

        {split.payment_ref && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paiement</Text>
            <View style={styles.paymentCard}>
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Référence</Text>
                <Text style={styles.paymentValue}>{split.payment_ref}</Text>
              </View>
              {split.payment_method && (
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Mode</Text>
                  <Text style={styles.paymentValue}>
                    {PAYMENT_METHODS.find(m => m.key === split.payment_method)?.label || split.payment_method}
                  </Text>
                </View>
              )}
              {split.paid_at && (
                <View style={styles.paymentRow}>
                  <Text style={styles.paymentLabel}>Date</Text>
                  <Text style={styles.paymentValue}>{formatDate(split.paid_at)}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {split.status === 'draft' && (
          <View style={styles.actionsSection}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: Colors.light.info + '15' }]}
              onPress={handleMarkSent}
              disabled={isMarkingSent}
            >
              <Send size={16} color={Colors.light.info} />
              <Text style={[styles.actionButtonText, { color: Colors.light.info }]}>
                {isMarkingSent ? 'Envoi...' : 'Marquer envoyé'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showPaymentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPaymentModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Enregistrer le paiement</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Référence de paiement</Text>
              <TextInput
                style={styles.textInput}
                value={paymentRef}
                onChangeText={setPaymentRef}
                placeholder="Ex: VIR-2026-001, CHQ-123..."
                placeholderTextColor={Colors.light.textMuted}
              />
            </View>

            <Text style={styles.inputLabel}>Mode de paiement</Text>
            <View style={styles.paymentOptions}>
              {PAYMENT_METHODS.map((method) => (
                <TouchableOpacity
                  key={method.key}
                  style={[
                    styles.paymentOption,
                    selectedPaymentMethod === method.key && styles.paymentOptionSelected,
                  ]}
                  onPress={() => setSelectedPaymentMethod(
                    selectedPaymentMethod === method.key ? '' : method.key
                  )}
                >
                  <Text
                    style={[
                      styles.paymentOptionText,
                      selectedPaymentMethod === method.key && styles.paymentOptionTextSelected,
                    ]}
                  >
                    {method.label}
                  </Text>
                  {selectedPaymentMethod === method.key && (
                    <Check size={16} color={Colors.light.tint} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => {
                  setShowPaymentModal(false);
                  setSelectedPaymentMethod('');
                  setPaymentRef('');
                }}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmButton}
                onPress={confirmMarkPaid}
                disabled={isMarkingPaid}
              >
                <Text style={styles.modalConfirmText}>
                  {isMarkingPaid ? 'Traitement...' : 'Confirmer'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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
  backButton: {
    padding: 8,
    marginLeft: -8,
  },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500' as const,
  },
  amountBig: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  masterRefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint + '10',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.light.tint + '20',
  },
  masterRefInfo: {
    flex: 1,
  },
  masterRefLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  masterRefNumber: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.tint,
    marginTop: 2,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
  },
  quickActionBtn: {
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  clientAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  clientCompany: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  clientEmail: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  linesCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  lineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
  },
  lineItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  lineInfo: {
    flex: 1,
    marginRight: 12,
  },
  lineLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  lineDetail: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  lineTotal: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  totalsCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalRowMain: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 12,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  totalLabelMain: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  totalValueMain: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  paymentCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  paymentValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  actionsSection: {
    marginTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    textAlign: 'center',
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  paymentOptions: {
    gap: 8,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint + '10',
  },
  paymentOptionText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  paymentOptionTextSelected: {
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalCancelButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  modalConfirmButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.light.success,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});
