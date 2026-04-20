import React, { useState, useCallback, useMemo, useRef } from 'react';
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
  Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { 
  Trash2, Copy, Edit3, AlertTriangle, 
  Send, CreditCard, ArrowRightLeft, X, Check, Download, 
  Mail, CheckCircle2, CircleDot, Printer, Bell, Clock,
  FileCheck, Upload, History, Lock, FileText, Truck, Users, ChevronRight, RotateCcw, Zap
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getDocumentById, getLineItemsByDocumentId, updateDocumentStatus, deleteDocument, duplicateDocument, markDocumentAsSent, markDocumentAsPaid, convertDevisToFacture } from '@/db/documents';
import { getClientById } from '@/db/clients';
import { getCompanyInfo } from '@/db/settings';
import { Document, DocumentStatus, STATUS_LABELS, formatCurrency, formatDate, isOverdue, LineItem, isCreditNote, getDocumentDisplayType } from '@/types/document';
import { generatePDF, sharePDF, sendEmailWithPDF, printDocument, generateFacturXFiles, shareEInvoiceFiles, sendEmailWithEInvoice, PDFDepositInfo } from '@/utils/pdfGenerator';
import { getReminderHistoryByDocumentId, addReminderHistory, getReminderTemplates, getLastReminderLevel } from '@/db/reminders';
import { ReminderTemplate, replaceTemplateVariables } from '@/types/reminder';
import { getEInvoiceSettings } from '@/utils/einvoiceProvider';
import { getEInvoiceEnvelopeByInvoiceId, getStatusEventsByInvoice, isDocumentLocked } from '@/db/einvoice';
import { createEInvoicingService } from '@/utils/einvoicingService';
import { EInvoiceStatus, EINVOICE_STATUS_LABELS, EINVOICE_STATUS_COLORS } from '@/types/einvoice';
import EInvoiceTimeline from '@/components/EInvoiceTimeline';
import * as MailComposer from 'expo-mail-composer';
import { getSplitsByMasterId, getSplitStats } from '@/db/splitBilling';
import { DocumentSplit, SPLIT_STATUS_LABELS, SPLIT_STATUS_COLORS } from '@/types/splitBilling';
import { getDepositPlan, generateDepositInvoices, generateFinalInvoices } from '@/db/deposits';
import { calculateInstallments } from '@/types/deposit';
import DepositManagementSection from '@/components/DepositManagementSection';
import { getCreditNotesForInvoice, getTotalCreditedAmount } from '@/db/creditNotes';

const PAYMENT_METHODS = [
  { key: 'virement', label: 'Virement bancaire' },
  { key: 'carte', label: 'Carte bancaire' },
  { key: 'cheque', label: 'Chèque' },
  { key: 'especes', label: 'Espèces' },
  { key: 'paypal', label: 'PayPal' },
  { key: 'autre', label: 'Autre' },
];

interface ActionHistoryItem {
  type: 'created' | 'sent' | 'paid';
  date: string;
  label: string;
  detail?: string;
}

const REMINDER_LEVEL_LABELS: Record<number, string> = {
  1: 'Relance 1',
  2: 'Relance 2',
  3: 'Relance 3 (finale)',
};

function getActionHistory(document: Document): ActionHistoryItem[] {
  const history: ActionHistoryItem[] = [];
  
  if (document.created_at) {
    history.push({
      type: 'created',
      date: document.created_at,
      label: 'Document créé',
    });
  }
  
  if (document.sent_at) {
    history.push({
      type: 'sent',
      date: document.sent_at,
      label: 'Document envoyé',
    });
  }
  
  if (document.paid_at) {
    const methodLabel = document.payment_method 
      ? PAYMENT_METHODS.find(m => m.key === document.payment_method)?.label 
      : undefined;
    history.push({
      type: 'paid',
      date: document.paid_at,
      label: 'Paiement reçu',
      detail: methodLabel,
    });
  }
  
  return history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function PDFPreview({ document, lineItems }: { document: Document; lineItems: LineItem[] }) {
  const isCreditNoteDoc = isCreditNote(document);
  const badgeColor = isCreditNoteDoc ? Colors.light.error : document.type === 'devis' ? Colors.light.info : Colors.light.success;
  const displayType = getDocumentDisplayType(document).toUpperCase();
  
  return (
    <View style={pdfStyles.container}>
      <View style={pdfStyles.paper}>
        <View style={pdfStyles.header}>
          <View style={pdfStyles.headerLeft}>
            <View style={[pdfStyles.typeBadge, { backgroundColor: badgeColor }]}>
              <Text style={pdfStyles.typeBadgeText}>{displayType}</Text>
            </View>
            <Text style={pdfStyles.documentNumber}>{document.number}</Text>
          </View>
          <View style={pdfStyles.headerRight}>
            <Text style={pdfStyles.dateLabel}>Date</Text>
            <Text style={pdfStyles.dateValue}>{formatDate(document.date)}</Text>
            {document.due_date && (
              <>
                <Text style={[pdfStyles.dateLabel, { marginTop: 6 }]}>Échéance</Text>
                <Text style={[pdfStyles.dateValue, isOverdue(document) && { color: Colors.light.error }]}>
                  {formatDate(document.due_date)}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={pdfStyles.divider} />

        <View style={pdfStyles.clientSection}>
          <Text style={pdfStyles.clientLabel}>DESTINATAIRE</Text>
          <Text style={pdfStyles.clientName}>{document.client_name || 'Client'}</Text>
          {document.client_company && (
            <Text style={pdfStyles.clientCompany}>{document.client_company}</Text>
          )}
        </View>

        <View style={pdfStyles.tableHeader}>
          <Text style={[pdfStyles.tableHeaderText, { flex: 2 }]}>Description</Text>
          <Text style={[pdfStyles.tableHeaderText, { width: 40, textAlign: 'center' }]}>Qté</Text>
          <Text style={[pdfStyles.tableHeaderText, { width: 70, textAlign: 'right' }]}>P.U. HT</Text>
          <Text style={[pdfStyles.tableHeaderText, { width: 50, textAlign: 'center' }]}>TVA</Text>
          <Text style={[pdfStyles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Total HT</Text>
        </View>

        {lineItems.map((item, index) => (
          <View key={item.id} style={[pdfStyles.tableRow, index % 2 === 0 && pdfStyles.tableRowAlt]}>
            <View style={{ flex: 2 }}>
              <Text style={pdfStyles.itemDesc} numberOfLines={2}>{item.description}</Text>
            </View>
            <Text style={[pdfStyles.itemText, { width: 40, textAlign: 'center' }]}>{item.quantity}</Text>
            <Text style={[pdfStyles.itemText, { width: 70, textAlign: 'right' }]}>{formatCurrency(item.unit_price)}</Text>
            <Text style={[pdfStyles.itemText, { width: 50, textAlign: 'center' }]}>{item.tva_rate}%</Text>
            <Text style={[pdfStyles.itemText, { width: 80, textAlign: 'right' }]}>{formatCurrency(item.total_ht)}</Text>
          </View>
        ))}

        {lineItems.length === 0 && (
          <View style={pdfStyles.emptyLines}>
            <Text style={pdfStyles.emptyText}>Aucune ligne</Text>
          </View>
        )}

        <View style={pdfStyles.totalsContainer}>
          {document.auto_liquidation === 1 && (
            <View style={pdfStyles.autoLiquidationNote}>
              <AlertTriangle size={12} color={Colors.light.warning} />
              <Text style={pdfStyles.autoLiquidationText}>Auto-liquidation de TVA applicable</Text>
            </View>
          )}
          <View style={pdfStyles.totalsBox}>
            <View style={pdfStyles.totalRow}>
              <Text style={pdfStyles.totalLabel}>Total HT</Text>
              <Text style={pdfStyles.totalValue}>{formatCurrency(document.total_ht)}</Text>
            </View>
            {document.auto_liquidation !== 1 && (
              <View style={pdfStyles.totalRow}>
                <Text style={pdfStyles.totalLabel}>TVA</Text>
                <Text style={pdfStyles.totalValue}>{formatCurrency(document.total_tva)}</Text>
              </View>
            )}
            <View style={pdfStyles.totalDivider} />
            <View style={pdfStyles.totalRow}>
              <Text style={pdfStyles.totalLabelMain}>{document.auto_liquidation === 1 ? 'Total HT net' : 'Total TTC'}</Text>
              <Text style={pdfStyles.totalValueMain}>{formatCurrency(document.auto_liquidation === 1 ? document.total_ht : document.total_ttc)}</Text>
            </View>
          </View>
        </View>

        {(document.notes || document.conditions) && (
          <View style={pdfStyles.notesSection}>
            {document.notes && (
              <View style={pdfStyles.noteBlock}>
                <Text style={pdfStyles.noteTitle}>Notes</Text>
                <Text style={pdfStyles.noteText}>{document.notes}</Text>
              </View>
            )}
            {document.conditions && (
              <View style={pdfStyles.noteBlock}>
                <Text style={pdfStyles.noteTitle}>Conditions</Text>
                <Text style={pdfStyles.noteText}>{document.conditions}</Text>
              </View>
            )}
          </View>
        )}

        {document.legal_mentions && (
          <View style={pdfStyles.legalSection}>
            <Text style={pdfStyles.legalText}>{document.legal_mentions}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function ActionHistory({ history }: { history: ActionHistoryItem[] }) {
  if (history.length === 0) return null;

  const getIcon = (type: ActionHistoryItem['type']) => {
    switch (type) {
      case 'created':
        return <CircleDot size={16} color={Colors.light.textMuted} />;
      case 'sent':
        return <Send size={16} color={Colors.light.info} />;
      case 'paid':
        return <CheckCircle2 size={16} color={Colors.light.success} />;
    }
  };

  const getColor = (type: ActionHistoryItem['type']) => {
    switch (type) {
      case 'created':
        return Colors.light.textMuted;
      case 'sent':
        return Colors.light.info;
      case 'paid':
        return Colors.light.success;
    }
  };

  return (
    <View style={historyStyles.container}>
      <Text style={historyStyles.title}>Historique</Text>
      <View style={historyStyles.timeline}>
        {history.map((item, index) => (
          <View key={`${item.type}-${item.date}`} style={historyStyles.item}>
            <View style={historyStyles.iconContainer}>
              {getIcon(item.type)}
              {index < history.length - 1 && (
                <View style={[historyStyles.line, { backgroundColor: getColor(history[index + 1].type) + '40' }]} />
              )}
            </View>
            <View style={historyStyles.content}>
              <Text style={[historyStyles.label, { color: getColor(item.type) }]}>{item.label}</Text>
              <Text style={historyStyles.date}>{formatDate(item.date)}</Text>
              {item.detail && <Text style={historyStyles.detail}>{item.detail}</Text>}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function DocumentDetailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = parseInt(id || '0', 10);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [selectedReminderLevel, setSelectedReminderLevel] = useState(1);
  const [generatingDepositIndex, setGeneratingDepositIndex] = useState<number | 'final' | null>(null);

  const { data: document, isLoading: loadingDoc } = useQuery({
    queryKey: ['document', documentId, db],
    queryFn: async () => {
      if (!db) return null;
      return getDocumentById(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: lineItems = [], isLoading: loadingLines } = useQuery({
    queryKey: ['lineItems', documentId, db],
    queryFn: async () => {
      if (!db) return [];
      return getLineItemsByDocumentId(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: client } = useQuery({
    queryKey: ['client', document?.client_id, db],
    queryFn: async () => {
      if (!db || !document?.client_id) return null;
      return getClientById(db, document.client_id);
    },
    enabled: isReady && !!db && !!document?.client_id,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ['companyInfo', db],
    queryFn: async () => {
      if (!db) return null;
      return getCompanyInfo(db);
    },
    enabled: isReady && !!db,
  });

  const { data: reminderHistory = [] } = useQuery({
    queryKey: ['reminderHistory', documentId, db],
    queryFn: async () => {
      if (!db) return [];
      return getReminderHistoryByDocumentId(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: reminderTemplates = [] } = useQuery({
    queryKey: ['reminderTemplates', db],
    queryFn: async () => {
      if (!db) return [];
      return getReminderTemplates(db);
    },
    enabled: isReady && !!db,
  });

  const { data: lastReminderLevel = 0 } = useQuery({
    queryKey: ['lastReminderLevel', documentId, db],
    queryFn: async () => {
      if (!db) return 0;
      return getLastReminderLevel(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  

  const { data: einvoiceSettings } = useQuery({
    queryKey: ['einvoiceSettings', db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceSettings(db);
    },
    enabled: isReady && !!db,
  });

  const { data: einvoiceEnvelope } = useQuery({
    queryKey: ['einvoiceEnvelope', documentId, db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceEnvelopeByInvoiceId(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: einvoiceEvents = [] } = useQuery({
    queryKey: ['einvoiceEvents', documentId, db],
    queryFn: async () => {
      if (!db) return [];
      return getStatusEventsByInvoice(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: documentLocked = false } = useQuery({
    queryKey: ['documentLocked', documentId, db],
    queryFn: async () => {
      if (!db) return false;
      return isDocumentLocked(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: splits = [] } = useQuery({
    queryKey: ['documentSplits', documentId, db],
    queryFn: async () => {
      if (!db) return [];
      return getSplitsByMasterId(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: splitStats } = useQuery({
    queryKey: ['splitStats', documentId, db],
    queryFn: async () => {
      if (!db) return null;
      return getSplitStats(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0 && splits.length > 0,
  });

  const { data: depositPlan } = useQuery({
    queryKey: ['depositPlan', documentId, db],
    queryFn: async () => {
      if (!db) return null;
      return getDepositPlan(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0 && document?.type === 'devis',
  });

  const { data: linkedCreditNotes = [] } = useQuery({
    queryKey: ['linkedCreditNotes', documentId, db],
    queryFn: async () => {
      if (!db) return [];
      return getCreditNotesForInvoice(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0 && document?.type === 'facture' && !isCreditNote(document || {} as Document),
  });

  const { data: totalCreditedAmount = 0 } = useQuery({
    queryKey: ['totalCreditedAmount', documentId, db],
    queryFn: async () => {
      if (!db) return 0;
      return getTotalCreditedAmount(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0 && document?.type === 'facture' && !isCreditNote(document || {} as Document),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: async (status: DocumentStatus) => {
      if (!db) throw new Error('No database');
      return updateDocumentStatus(db, documentId, status);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });

  const { mutate: markSent, isPending: isMarkingSent } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      return markDocumentAsSent(db, documentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      Alert.alert('Succès', 'Document marqué comme envoyé');
    },
    onError: (error) => {
      console.error('[MarkSent] Error:', error);
      Alert.alert('Erreur', 'Impossible de marquer le document comme envoyé');
    },
  });

  const { mutate: markPaid, isPending: isMarkingPaid } = useMutation({
    mutationFn: async (paymentMethod: string) => {
      if (!db) throw new Error('No database');
      return markDocumentAsPaid(db, documentId, paymentMethod);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      setShowPaymentModal(false);
      setSelectedPaymentMethod('');
      Alert.alert('Succès', 'Document marqué comme payé');
    },
    onError: (error) => {
      console.error('[MarkPaid] Error:', error);
      Alert.alert('Erreur', 'Impossible de marquer le document comme payé');
    },
  });

  const { mutate: convertToFacture, isPending: isConverting } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      return convertDevisToFacture(db, documentId);
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      Alert.alert('Succès', 'Devis converti en facture', [
        { text: 'Voir la facture', onPress: () => router.replace(`/document/${newId}`) },
        { text: 'OK' },
      ]);
    },
    onError: (error) => {
      console.error('[ConvertToFacture] Error:', error);
      Alert.alert('Erreur', 'Impossible de convertir le devis en facture');
    },
  });

  const { mutate: deleteDoc } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      return deleteDocument(db, documentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.back();
    },
  });

  const { mutate: duplicateDoc, isPending: isDuplicating } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      return duplicateDocument(db, documentId);
    },
    onSuccess: (newId) => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      Alert.alert('Succès', 'Document dupliqué avec succès', [
        { text: 'Voir', onPress: () => router.replace(`/document/${newId}`) },
        { text: 'OK' },
      ]);
    },
    onError: (error) => {
      console.error('[DuplicateDocument] Error:', error);
      Alert.alert('Erreur', 'Impossible de dupliquer le document');
    },
  });

  const { mutate: generateDeposit } = useMutation({
    mutationFn: async (installmentIndex: number) => {
      if (!db) throw new Error('No database');
      setGeneratingDepositIndex(installmentIndex);
      return generateDepositInvoices(db, documentId, installmentIndex);
    },
    onSuccess: (result) => {
      setGeneratingDepositIndex(null);
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['depositPlan', documentId] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        Alert.alert(
          'Succès',
          `Facture d'acompte générée: ${result.billingRef}`,
          result.masterInvoiceId
            ? [{ text: 'Voir', onPress: () => router.push(`/document/${result.masterInvoiceId}`) }, { text: 'OK' }]
            : [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Erreur', result.error || 'Impossible de générer la facture d\'acompte');
      }
    },
    onError: (error) => {
      setGeneratingDepositIndex(null);
      console.error('[GenerateDeposit] Error:', error);
      Alert.alert('Erreur', 'Impossible de générer la facture d\'acompte');
    },
  });

  const { mutate: generateFinal } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      setGeneratingDepositIndex('final');
      return generateFinalInvoices(db, documentId);
    },
    onSuccess: (result) => {
      setGeneratingDepositIndex(null);
      if (result.success) {
        queryClient.invalidateQueries({ queryKey: ['depositPlan', documentId] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        Alert.alert(
          'Succès',
          `Facture de solde générée: ${result.billingRef}`,
          result.masterInvoiceId
            ? [{ text: 'Voir', onPress: () => router.push(`/document/${result.masterInvoiceId}`) }, { text: 'OK' }]
            : [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Erreur', result.error || 'Impossible de générer la facture de solde');
      }
    },
    onError: (error) => {
      setGeneratingDepositIndex(null);
      console.error('[GenerateFinal] Error:', error);
      Alert.alert('Erreur', 'Impossible de générer la facture de solde');
    },
  });

  const { mutate: issueInvoice, isPending: isIssuing } = useMutation({
    mutationFn: async () => {
      if (!db || !companyInfo || !einvoiceSettings) throw new Error('No database or settings');
      const service = createEInvoicingService({
        db,
        settings: einvoiceSettings,
        companyInfo: {
          name: companyInfo.name,
          siret: companyInfo.siret,
          address: companyInfo.address,
          city: companyInfo.city,
          postalCode: companyInfo.postalCode,
          email: companyInfo.email,
          tvaNumber: companyInfo.tvaNumber,
        },
      });
      return service.issueInvoice(documentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['einvoiceEnvelope', documentId] });
      queryClient.invalidateQueries({ queryKey: ['einvoiceEvents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      
      const isPdpConfigured = einvoiceSettings?.pdpProvider && einvoiceSettings.pdpProvider !== 'mock';
      
      if (isPdpConfigured) {
        Alert.alert('Succès', 'Facture émise avec succès. Elle est maintenant prête à être transmise via la PDP.');
      } else {
        Alert.alert(
          'Facture émise (mode préparation)',
          'La facture a été émise localement. Cependant, aucune PDP n\'est configurée actuellement.\n\nPour transmettre vos factures électroniques, configurez votre connexion PDP dans Paramètres > Facturation électronique.',
          [
            { text: 'Configurer', onPress: () => router.push('/settings/einvoice') },
            { text: 'OK' },
          ]
        );
      }
    },
    onError: (error: Error) => {
      console.error('[IssueInvoice] Error:', error);
      const errorMessage = error.message || 'Une erreur est survenue';
      Alert.alert(
        'Erreur d\'émission',
        `Impossible d'émettre la facture électronique.\n\nDétail : ${errorMessage}\n\nVérifiez que toutes les informations obligatoires sont remplies (SIRET, TVA, etc.).`,
        [
          { text: 'Voir les paramètres', onPress: () => router.push('/settings/einvoice') },
          { text: 'OK' },
        ]
      );
    },
  });

  const { mutate: submitEInvoice, isPending: isSubmitting } = useMutation({
    mutationFn: async () => {
      if (!db || !companyInfo || !einvoiceSettings) throw new Error('No database or settings');
      const service = createEInvoicingService({
        db,
        settings: einvoiceSettings,
        companyInfo: {
          name: companyInfo.name,
          siret: companyInfo.siret,
          address: companyInfo.address,
          city: companyInfo.city,
          postalCode: companyInfo.postalCode,
          email: companyInfo.email,
          tvaNumber: companyInfo.tvaNumber,
        },
      });
      return service.submitEInvoice(documentId);
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['einvoiceEnvelope', documentId] });
      queryClient.invalidateQueries({ queryKey: ['einvoiceEvents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documentLocked', documentId] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      
      const isPdpConfigured = einvoiceSettings?.pdpProvider && einvoiceSettings.pdpProvider !== 'mock';
      const modeLabel = isPdpConfigured ? 'via la PDP' : 'en mode simulation';
      
      if (einvoiceSettings?.sendEmailNotification && client?.email && document && companyInfo) {
        try {
          console.log('[SubmitEInvoice] Sending email notification to:', client.email);
          const { pdfUri, xmlUri } = await generateFacturXFiles(document, lineItems, client, companyInfo);
          const sent = await sendEmailWithEInvoice(document, client, pdfUri, xmlUri);
          if (sent) {
            console.log('[SubmitEInvoice] Email notification sent successfully');
            Alert.alert(
              'Succès',
              `Facture transmise ${modeLabel} et notification email envoyée.${!isPdpConfigured ? '\n\nPour une transmission réelle, configurez votre connexion PDP dans les paramètres.' : ''}`,
              isPdpConfigured ? [{ text: 'OK' }] : [
                { text: 'Configurer', onPress: () => router.push('/settings/einvoice') },
                { text: 'OK' },
              ]
            );
          } else {
            Alert.alert(
              isPdpConfigured ? 'Succès' : 'Transmission simulée',
              `Facture transmise ${modeLabel}.${!isPdpConfigured ? '\n\nPour une transmission réelle, configurez votre connexion PDP dans les paramètres.' : ''}`,
              isPdpConfigured ? [{ text: 'OK' }] : [
                { text: 'Configurer', onPress: () => router.push('/settings/einvoice') },
                { text: 'OK' },
              ]
            );
          }
        } catch (emailError) {
          console.error('[SubmitEInvoice] Email notification error:', emailError);
          Alert.alert(
            isPdpConfigured ? 'Succès' : 'Transmission simulée',
            `Facture transmise ${modeLabel}. La notification email n'a pas pu être envoyée.${!isPdpConfigured ? '\n\nPour une transmission réelle, configurez votre connexion PDP dans les paramètres.' : ''}`,
            isPdpConfigured ? [{ text: 'OK' }] : [
              { text: 'Configurer', onPress: () => router.push('/settings/einvoice') },
              { text: 'OK' },
            ]
          );
        }
      } else {
        if (!isPdpConfigured) {
          Alert.alert(
            'Transmission simulée (mode préparation)',
            'Aucune PDP n\'est connectée. La facture a été enregistrée localement avec un identifiant de simulation.\n\nPour une transmission réelle, configurez votre connexion PDP dans les paramètres.',
            [
              { text: 'Configurer', onPress: () => router.push('/settings/einvoice') },
              { text: 'OK' },
            ]
          );
        } else {
          Alert.alert('Succès', 'Facture transmise via la PDP avec succès.');
        }
      }
    },
    onError: (error) => {
      console.error('[SubmitEInvoice] Error:', error);
      Alert.alert('Erreur', 'Impossible de transmettre la facture via la PDP');
    },
  });

  const handleIssueInvoice = useCallback(() => {
    Alert.alert(
      'Émettre la facture',
      'Cette action va figer le numéro et les totaux de la facture. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Émettre', onPress: () => issueInvoice() },
      ]
    );
  }, [issueInvoice]);

  const handleSubmitEInvoice = useCallback(() => {
    Alert.alert(
      'Transmettre via la PDP',
      'La facture sera transmise à la PDP pour envoi au client. Après transmission, la facture ne pourra plus être modifiée. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Transmettre', onPress: () => submitEInvoice() },
      ]
    );
  }, [submitEInvoice]);

  const handleDownloadFacturX = useCallback(async () => {
    if (!document || !companyInfo) {
      Alert.alert('Erreur', 'Données manquantes pour générer le Factur-X');
      return;
    }
    try {
      const { pdfUri, xmlUri } = await generateFacturXFiles(document, lineItems, client || null, companyInfo);
      await shareEInvoiceFiles(pdfUri, xmlUri);
      Alert.alert('Succès', 'Factur-X généré et partagé (PDF + XML)');
    } catch (error) {
      console.error('[FacturX] Error:', error);
      Alert.alert('Erreur', 'Impossible de générer le Factur-X');
    }
  }, [document, lineItems, client, companyInfo]);

  const handleViewTimeline = useCallback(() => {
    router.push(`/settings/einvoice`);
  }, [router]);

  const handleStatusChange = useCallback((status: DocumentStatus) => {
    Alert.alert(
      'Changer le statut',
      `Voulez-vous marquer ce document comme "${STATUS_LABELS[status]}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Confirmer', onPress: () => updateStatus(status) },
      ]
    );
  }, [updateStatus]);

  const handleMarkSent = useCallback(() => {
    Alert.alert(
      'Marquer comme envoyé',
      'Voulez-vous marquer ce document comme envoyé ?',
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
    markPaid(selectedPaymentMethod);
  }, [markPaid, selectedPaymentMethod]);

  const hasDepositEnabled = depositPlan?.config?.enabled === true;

  const handleConvertToFacture = useCallback(() => {
    if (hasDepositEnabled) {
      Alert.alert(
        'Acompte configuré',
        'Ce devis a un acompte configuré. Acceptez d\'abord le devis, puis utilisez la section "Acomptes" pour générer les factures d\'acompte et la facture de solde.',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Accepter le devis',
            onPress: () => updateStatus('accepted'),
          },
        ]
      );
      return;
    }
    Alert.alert(
      'Convertir en facture',
      'Une nouvelle facture sera créée à partir de ce devis. Le devis original sera conservé.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Convertir', onPress: () => convertToFacture() },
      ]
    );
  }, [convertToFacture, hasDepositEnabled, updateStatus]);

  const handleGenerateDeposit = useCallback((installmentIndex: number) => {
    Alert.alert(
      'Générer facture d\'acompte',
      `Voulez-vous générer la facture d'acompte pour l'échéance ${installmentIndex} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Générer', onPress: () => generateDeposit(installmentIndex) },
      ]
    );
  }, [generateDeposit]);

  const handleGenerateFinal = useCallback(() => {
    const message = depositPlan?.config.enabled
      ? 'Voulez-vous générer la facture de solde ? Les acomptes déjà facturés seront déduits.'
      : 'Voulez-vous générer la facture à partir de ce devis ?';
    
    Alert.alert(
      depositPlan?.config.enabled ? 'Générer facture de solde' : 'Générer facture',
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Générer', onPress: () => generateFinal() },
      ]
    );
  }, [generateFinal, depositPlan]);

  const handleViewDepositInvoice = useCallback((invoiceId: number) => {
    router.push(`/document/${invoiceId}`);
  }, [router]);

  const canDelete = useMemo(() => {
    // Factures, avoirs and devis cannot be deleted
    return false;
  }, []);

  const handleDelete = useCallback(() => {
    if (!document || !canDelete) return;

    Alert.alert(
      'Supprimer le document',
      'Cette action est irréversible. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteDoc() },
      ]
    );
  }, [deleteDoc, document, canDelete]);

  const handleDuplicate = useCallback(() => {
    Alert.alert(
      'Dupliquer le document',
      'Un nouveau document sera créé avec les mêmes informations.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Dupliquer', onPress: () => duplicateDoc() },
      ]
    );
  }, [duplicateDoc]);

  const isEInvoice = document?.is_einvoice === 1 && document?.type === 'facture';

  const { mutate: saveReminderHistory, isPending: isSendingReminder } = useMutation({
    mutationFn: async ({ level, email, subject }: { level: number; email: string; subject: string }) => {
      if (!db) throw new Error('No database');
      return addReminderHistory(db, documentId, level, email, subject);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderHistory', documentId] });
      queryClient.invalidateQueries({ queryKey: ['lastReminderLevel', documentId] });
      setShowReminderModal(false);
    },
    onError: (error) => {
      console.error('[SaveReminderHistory] Error:', error);
    },
  });

  const handleSendReminder = useCallback(async () => {
    if (!document || !companyInfo || !client) {
      Alert.alert('Erreur', 'Données manquantes pour envoyer la relance');
      return;
    }

    const template = reminderTemplates.find((t: ReminderTemplate) => t.level === selectedReminderLevel);
    if (!template) {
      Alert.alert('Erreur', 'Modèle de relance non trouvé');
      return;
    }

    const variables = {
      clientName: client.name,
      invoiceNumber: document.number,
      dueDate: document.due_date ? formatDate(document.due_date) : '',
      totalAmount: formatCurrency(document.total_ttc),
      companyName: companyInfo.name || 'Notre entreprise',
    };

    const subject = replaceTemplateVariables(template.subject, variables);
    const body = replaceTemplateVariables(template.body, variables);

    const isAvailable = await MailComposer.isAvailableAsync();
    if (!isAvailable) {
      Alert.alert('Erreur', 'Application email non disponible');
      return;
    }

    if (emailInProgressRef.current) {
      console.log('[SendReminder] Already composing an email, skipping');
      return;
    }
    emailInProgressRef.current = true;
    try {
      let attachments: string[] = [];
      if (Platform.OS !== 'web') {
        if (isEInvoice) {
          const { pdfUri, xmlUri } = await generateFacturXFiles(document, lineItems, client, companyInfo);
          attachments = [pdfUri];
          if (xmlUri) attachments.push(xmlUri);
        } else {
          const pdfResult = await generatePDF(document, lineItems, client, companyInfo);
          attachments = [pdfResult.uri];
        }
      }

      const result = await MailComposer.composeAsync({
        recipients: client.email ? [client.email] : [],
        subject,
        body,
        attachments,
      });

      if (result.status !== MailComposer.MailComposerStatus.CANCELLED) {
        saveReminderHistory({
          level: selectedReminderLevel,
          email: client.email || '',
          subject,
        });
      }
    } catch (error) {
      console.error('[SendReminder] Error:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer la relance');
    } finally {
      emailInProgressRef.current = false;
    }
  }, [document, companyInfo, client, reminderTemplates, selectedReminderLevel, lineItems, saveReminderHistory, isEInvoice]);

  const openReminderModal = useCallback(() => {
    const nextLevel = Math.min(lastReminderLevel + 1, 3);
    setSelectedReminderLevel(nextLevel);
    setShowReminderModal(true);
  }, [lastReminderLevel]);

  const handleEdit = useCallback(() => {
    if (documentLocked) {
      Alert.alert(
        'Modification impossible',
        'Facture transmise via la PDP : modification impossible. Utilisez Annuler/Avoir.',
        [{ text: 'OK' }]
      );
      return;
    }
    router.push(`/document/edit/${documentId}`);
  }, [documentId, router, documentLocked]);

  const pdfDepositInfo = useMemo((): PDFDepositInfo | undefined => {
    if (!depositPlan || !depositPlan.config.enabled || document?.type !== 'devis') return undefined;
    const config = depositPlan.config;
    const installments = config.installments.length > 0
      ? config.installments
      : calculateInstallments(depositPlan.totalDepositAmount, config.installmentCount, config.distribution);
    return {
      enabled: true,
      mode: config.mode,
      value: config.value,
      installmentCount: config.installmentCount,
      totalDepositAmount: depositPlan.totalDepositAmount,
      remainingBalance: depositPlan.remainingBalance,
      installments: installments.map(i => ({
        index: i.index,
        amount: i.amount,
        percentage: i.percentage,
        dueDate: i.dueDate,
      })),
    };
  }, [depositPlan, document?.type]);

  const handleExportPDF = useCallback(async () => {
    if (!document || !companyInfo) {
      Alert.alert('Erreur', 'Données manquantes pour générer le PDF');
      return;
    }

    try {
      if (isEInvoice) {
        const { pdfUri, xmlUri } = await generateFacturXFiles(document, lineItems, client || null, companyInfo);
        await shareEInvoiceFiles(pdfUri, xmlUri);
      } else {
        const result = await generatePDF(document, lineItems, client || null, companyInfo, undefined, undefined, pdfDepositInfo);
        await sharePDF(result.uri);
      }
    } catch (error) {
      console.error('[PDF] Export error:', error);
      if (Platform.OS === 'web') {
        Alert.alert('Information', 'Le partage de PDF n\'est pas disponible sur le web. Utilisez la fonction Imprimer.');
      } else {
        Alert.alert('Erreur', 'Impossible d\'exporter le PDF');
      }
    }
  }, [document, lineItems, client, companyInfo, isEInvoice, pdfDepositInfo]);

  const emailInProgressRef = useRef(false);

  const handleSendEmail = useCallback(async () => {
    if (!document || !companyInfo) return;
    if (emailInProgressRef.current) {
      console.log('[SendEmail] Already composing an email, skipping');
      return;
    }
    emailInProgressRef.current = true;
    try {
      if (isEInvoice) {
        const { pdfUri, xmlUri } = await generateFacturXFiles(document, lineItems, client || null, companyInfo);
        const sent = await sendEmailWithEInvoice(document, client || null, pdfUri, xmlUri);
        if (sent) {
          console.log('[Email] E-invoice email composed successfully (PDF + XML)');
        }
      } else {
        const result = await generatePDF(document, lineItems, client || null, companyInfo, undefined, undefined, pdfDepositInfo);
        const sent = await sendEmailWithPDF(document, client || null, result.uri);
        if (sent) {
          console.log('[Email] Email composed successfully');
        }
      }
    } catch (error) {
      console.error('[SendEmail] Error:', error);
      Alert.alert('Erreur', 'Impossible d\'ouvrir l\'application email');
    } finally {
      emailInProgressRef.current = false;
    }
  }, [document, lineItems, client, companyInfo, isEInvoice, pdfDepositInfo]);

  const handlePrint = useCallback(async () => {
    if (!document || !companyInfo) return;
    
    try {
      await printDocument(document, lineItems, client || null, companyInfo, undefined, undefined, pdfDepositInfo);
    } catch (error) {
      console.error('[Print] Error:', error);
      Alert.alert('Erreur', 'Impossible d\'imprimer le document');
    }
  }, [document, lineItems, client, companyInfo, pdfDepositInfo]);

  const getStatusColor = useCallback((doc: Document): string => {
    if (isOverdue(doc)) return Colors.light.error;
    return Colors.status[doc.status] || Colors.status.draft;
  }, []);

  const getStatusLabel = useCallback((doc: Document): string => {
    if (isOverdue(doc)) return 'En retard';
    return STATUS_LABELS[doc.status];
  }, []);

  const isLoading = !isReady || loadingDoc || loadingLines;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!document) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Document introuvable</Text>
      </View>
    );
  }

  const statusColor = getStatusColor(document);
  const statusLabel = getStatusLabel(document);
  const actionHistory = getActionHistory(document);
  const isFacture = document.type === 'facture';
  const isCreditNoteDoc = isCreditNote(document);
  const isDevisAccepted = document.type === 'devis' && document.status === 'accepted';
  const isReadOnly = isFacture || isDevisAccepted || documentLocked;

  const isEInvoiceEnabled = document.is_einvoice === 1 && isFacture;
  const einvoiceStatus = einvoiceEnvelope?.status || (document.status === 'draft' ? 'draft' : undefined);

  const getEInvoiceStatusBanner = () => {
    if (!isEInvoiceEnabled || !einvoiceStatus) return null;

    const bannerConfig: Record<EInvoiceStatus, { message: string; color: string; icon: typeof FileCheck }> = {
      draft: { message: 'Brouillon — non transmise.', color: '#6B7280', icon: FileText },
      issued: { message: 'Émise — prête à être transmise via la PDP.', color: '#3B82F6', icon: FileCheck },
      prepared: { message: 'Préparée — en attente de transmission.', color: '#8B5CF6', icon: FileCheck },
      submitted: { 
        message: `Transmise via la PDP le ${einvoiceEnvelope?.submitted_at ? formatDate(einvoiceEnvelope.submitted_at) : ''} — identifiant: ${einvoiceEnvelope?.provider_message_id || 'N/A'}.`, 
        color: '#F59E0B', 
        icon: Upload 
      },
      delivered: { message: 'Délivrée à la PDP du destinataire.', color: '#10B981', icon: CheckCircle2 },
      accepted: { message: 'Acceptée par le destinataire.', color: '#059669', icon: CheckCircle2 },
      rejected: { 
        message: `Rejetée${einvoiceEnvelope?.error_message ? ` — Motif : ${einvoiceEnvelope.error_message}` : ''}.`, 
        color: '#EF4444', 
        icon: X 
      },
      paid: { message: 'Payée.', color: '#14B8A6', icon: CreditCard },
    };

    const config = bannerConfig[einvoiceStatus];
    if (!config) return null;

    const Icon = config.icon;

    return (
      <View style={[einvoiceStyles.statusBanner, { backgroundColor: config.color + '15', borderColor: config.color + '30' }]}>
        <Icon size={18} color={config.color} />
        <Text style={[einvoiceStyles.statusBannerText, { color: config.color }]}>
          {config.message}
        </Text>
        {documentLocked && (
          <Lock size={14} color={config.color} style={{ marginLeft: 'auto' }} />
        )}
      </View>
    );
  };
  const showReminderSection = document.type === 'facture' && 
    document.status !== 'paid' && 
    document.status !== 'cancelled' && 
    isOverdue(document);

  return (
    <>
      <Stack.Screen
        options={{
          title: document.number,
          headerRight: () => {
            const showEditButton = !isReadOnly;
            const showDeleteButton = canDelete;
            
            if (!showEditButton && !showDeleteButton) {
              return null;
            }
            
            return (
              <View style={styles.headerActions}>
                {showEditButton && (
                  <TouchableOpacity onPress={handleEdit} style={styles.headerButton}>
                    <Edit3 size={20} color={Colors.light.tint} />
                  </TouchableOpacity>
                )}
                {showDeleteButton && (
                  <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
                    <Trash2 size={20} color={Colors.light.error} />
                  </TouchableOpacity>
                )}
              </View>
            );
          },
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {isEInvoiceEnabled && getEInvoiceStatusBanner()}

        <View style={styles.statusHeader}>
          <View style={styles.statusHeaderLeft}>
            <View style={[styles.statusTag, { backgroundColor: statusColor + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
            {document.type === 'devis' && document.status === 'cancelled' && (
              <View style={styles.cancelledBadge}>
                <Text style={styles.cancelledBadgeText}>Annulé</Text>
              </View>
            )}
            {isEInvoiceEnabled && (
              <View style={[einvoiceStyles.statusHeaderBadge, { backgroundColor: '#8B5CF6' + '15' }]}>
                <Zap size={12} color="#8B5CF6" />
                <Text style={[einvoiceStyles.statusHeaderText, { color: '#8B5CF6' }]}>
                  E-facture{einvoiceStatus ? ` : ${EINVOICE_STATUS_LABELS[einvoiceStatus] || einvoiceStatus}` : ''}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.amountBig}>{formatCurrency(document.total_ttc)}</Text>
        </View>

        {isEInvoiceEnabled && isFacture && (document.status === 'draft' || einvoiceStatus === 'draft') && (
          <TouchableOpacity
            style={einvoiceStyles.primaryActionButton}
            onPress={handleIssueInvoice}
            disabled={isIssuing}
          >
            <FileCheck size={20} color="#FFFFFF" />
            <Text style={einvoiceStyles.primaryActionButtonText}>
              {isIssuing ? 'Émission...' : 'Émettre'}
            </Text>
          </TouchableOpacity>
        )}

        {isEInvoiceEnabled && isFacture && (einvoiceStatus === 'issued' || einvoiceStatus === 'prepared') && (
          <TouchableOpacity
            style={[einvoiceStyles.primaryActionButton, { backgroundColor: '#8B5CF6' }]}
            onPress={handleSubmitEInvoice}
            disabled={isSubmitting}
          >
            <Upload size={20} color="#FFFFFF" />
            <Text style={einvoiceStyles.primaryActionButtonText}>
              {isSubmitting ? 'Transmission...' : 'Transmettre via la PDP'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={handleExportPDF}>
            <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.tint + '15' }]}>
              <Download size={20} color={Colors.light.tint} />
            </View>
            <Text style={styles.quickActionText}>Export PDF</Text>
          </TouchableOpacity>
          {isEInvoiceEnabled && (
            <TouchableOpacity style={styles.quickActionBtn} onPress={handleDownloadFacturX}>
              <View style={[styles.quickActionIcon, { backgroundColor: '#8B5CF615' }]}>
                <FileText size={20} color="#8B5CF6" />
              </View>
              <Text style={styles.quickActionText}>Factur-X</Text>
            </TouchableOpacity>
          )}
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
            <Text style={styles.quickActionText}>{isEInvoiceEnabled ? 'Notifier' : 'Email'}</Text>
          </TouchableOpacity>
          {document.type === 'facture' && !isCreditNoteDoc && (
            <TouchableOpacity 
              style={styles.quickActionBtn} 
              onPress={() => router.push(`/delivery-notes/new?invoiceId=${documentId}`)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#F97316' + '15' }]}>
                <Truck size={20} color="#F97316" />
              </View>
              <Text style={styles.quickActionText}>BL</Text>
            </TouchableOpacity>
          )}
          {document.type === 'facture' && document.status !== 'paid' && document.status !== 'cancelled' && !isCreditNoteDoc && (
            <TouchableOpacity style={styles.quickActionBtn} onPress={handleMarkPaid}>
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.success + '15' }]}>
                <CreditCard size={20} color={Colors.light.success} />
              </View>
              <Text style={styles.quickActionText}>Payé</Text>
            </TouchableOpacity>
          )}
          {document.type === 'facture' && !isCreditNoteDoc && document.status !== 'cancelled' && (
            <TouchableOpacity 
              style={styles.quickActionBtn} 
              onPress={() => router.push(`/document/credit-note?invoiceId=${documentId}`)}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: Colors.light.error + '15' }]}>
                <RotateCcw size={20} color={Colors.light.error} />
              </View>
              <Text style={styles.quickActionText}>Avoir</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionTitle}>Aperçu du document</Text>
        <PDFPreview document={document} lineItems={lineItems} />

        <ActionHistory history={actionHistory} />

        {document.type === 'devis' && document.status === 'accepted' && depositPlan && (
          <View style={{ marginBottom: 20 }}>
            <DepositManagementSection
              depositPlan={depositPlan}
              quoteStatus={document.status}
              onGenerateDeposit={handleGenerateDeposit}
              onGenerateFinal={handleGenerateFinal}
              onViewInvoice={handleViewDepositInvoice}
              isGenerating={generatingDepositIndex !== null}
              generatingIndex={generatingDepositIndex ?? undefined}
            />
          </View>
        )}

        {splits.length > 0 && (
          <View style={splitStyles.container}>
            <View style={splitStyles.header}>
              <View style={splitStyles.headerLeft}>
                <Users size={20} color={Colors.light.tint} />
                <Text style={splitStyles.title}>Répartition copropriétaires</Text>
              </View>
              {splitStats && (
                <View style={splitStyles.statsRow}>
                  <Text style={splitStyles.statsText}>
                    {splitStats.paidSplits}/{splitStats.totalSplits} payé(s)
                  </Text>
                </View>
              )}
            </View>
            
            {splitStats && (
              <View style={splitStyles.progressSection}>
                <View style={splitStyles.progressBar}>
                  <View 
                    style={[
                      splitStyles.progressFill, 
                      { width: `${(splitStats.paidAmount / (splitStats.paidAmount + splitStats.pendingAmount) || 0) * 100}%` }
                    ]} 
                  />
                </View>
                <View style={splitStyles.progressLabels}>
                  <Text style={splitStyles.progressPaid}>
                    Payé: {formatCurrency(splitStats.paidAmount)}
                  </Text>
                  <Text style={splitStyles.progressPending}>
                    En attente: {formatCurrency(splitStats.pendingAmount)}
                  </Text>
                </View>
              </View>
            )}

            <View style={splitStyles.list}>
              {splits.map((split: DocumentSplit) => (
                <TouchableOpacity
                  key={split.id}
                  style={splitStyles.splitItem}
                  onPress={() => router.push(`/document/split/${split.id}`)}
                >
                  <View style={splitStyles.splitLeft}>
                    <View style={splitStyles.splitAvatar}>
                      <Text style={splitStyles.splitAvatarText}>
                        {split.suffix}
                      </Text>
                    </View>
                    <View style={splitStyles.splitInfo}>
                      <Text style={splitStyles.splitNumber}>{split.number_full}</Text>
                      <Text style={splitStyles.splitClient}>
                        {split.client_name || 'Client'}
                        {split.client_company && ` • ${split.client_company}`}
                      </Text>
                    </View>
                  </View>
                  <View style={splitStyles.splitRight}>
                    <Text style={splitStyles.splitAmount}>{formatCurrency(split.total_ttc)}</Text>
                    <View style={[
                      splitStyles.splitStatusBadge,
                      { backgroundColor: SPLIT_STATUS_COLORS[split.status] + '20' }
                    ]}>
                      <Text style={[
                        splitStyles.splitStatusText,
                        { color: SPLIT_STATUS_COLORS[split.status] }
                      ]}>
                        {SPLIT_STATUS_LABELS[split.status]}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={18} color={Colors.light.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {linkedCreditNotes.length > 0 && (
          <View style={creditNoteStyles.container}>
            <View style={creditNoteStyles.header}>
              <View style={creditNoteStyles.headerLeft}>
                <RotateCcw size={20} color={Colors.light.error} />
                <Text style={creditNoteStyles.title}>Avoirs liés</Text>
              </View>
              {totalCreditedAmount > 0 && (
                <View style={creditNoteStyles.totalBadge}>
                  <Text style={creditNoteStyles.totalBadgeText}>
                    -{formatCurrency(totalCreditedAmount)}
                  </Text>
                </View>
              )}
            </View>
            <View style={creditNoteStyles.list}>
              {linkedCreditNotes.map((cn: Document) => (
                <TouchableOpacity
                  key={cn.id}
                  style={creditNoteStyles.item}
                  onPress={() => router.push(`/document/${cn.id}`)}
                >
                  <View style={creditNoteStyles.itemLeft}>
                    <View style={creditNoteStyles.itemIcon}>
                      <RotateCcw size={16} color={Colors.light.error} />
                    </View>
                    <View style={creditNoteStyles.itemInfo}>
                      <Text style={creditNoteStyles.itemNumber}>{cn.number}</Text>
                      <Text style={creditNoteStyles.itemDate}>{formatDate(cn.date)}</Text>
                      {cn.credit_note_reason && (
                        <Text style={creditNoteStyles.itemReason} numberOfLines={1}>
                          {cn.credit_note_reason}
                        </Text>
                      )}
                    </View>
                  </View>
                  <View style={creditNoteStyles.itemRight}>
                    <Text style={creditNoteStyles.itemAmount}>
                      {formatCurrency(cn.total_ttc)}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={Colors.light.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {isCreditNoteDoc && document.original_invoice_id && (
          <View style={creditNoteStyles.linkedInvoiceCard}>
            <View style={creditNoteStyles.linkedInvoiceHeader}>
              <FileText size={18} color={Colors.light.info} />
              <Text style={creditNoteStyles.linkedInvoiceTitle}>Facture d&apos;origine</Text>
            </View>
            <TouchableOpacity
              style={creditNoteStyles.linkedInvoiceButton}
              onPress={() => router.push(`/document/${document.original_invoice_id}`)}
            >
              <Text style={creditNoteStyles.linkedInvoiceButtonText}>Voir la facture</Text>
              <ChevronRight size={16} color={Colors.light.tint} />
            </TouchableOpacity>
          </View>
        )}

        {isEInvoiceEnabled && einvoiceEnvelope && (
          <View style={einvoiceStyles.timelineSection}>
            <View style={einvoiceStyles.timelineHeader}>
              <Text style={einvoiceStyles.timelineTitle}>Timeline e-facture</Text>
              <TouchableOpacity onPress={handleViewTimeline}>
                <History size={18} color="#8B5CF6" />
              </TouchableOpacity>
            </View>
            <EInvoiceTimeline
              currentStatus={einvoiceStatus as EInvoiceStatus}
              isRejected={einvoiceStatus === 'rejected'}
              isPaid={einvoiceStatus === 'paid'}
            />
            {einvoiceEvents.length > 0 && (
              <View style={einvoiceStyles.eventsContainer}>
                {einvoiceEvents.slice(-3).map((event) => (
                  <View key={event.id} style={einvoiceStyles.eventItem}>
                    <View style={[einvoiceStyles.eventDot, { backgroundColor: EINVOICE_STATUS_COLORS[event.status] }]} />
                    <View style={einvoiceStyles.eventContent}>
                      <Text style={einvoiceStyles.eventStatus}>{EINVOICE_STATUS_LABELS[event.status]}</Text>
                      <Text style={einvoiceStyles.eventDate}>{formatDate(event.occurred_at)}</Text>
                      {event.message && <Text style={einvoiceStyles.eventMessage}>{event.message}</Text>}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {reminderHistory.length > 0 && (
          <View style={reminderStyles.container}>
            <Text style={reminderStyles.title}>Historique des relances</Text>
            <View style={reminderStyles.list}>
              {reminderHistory.map((reminder) => (
                <View key={reminder.id} style={reminderStyles.item}>
                  <View style={[reminderStyles.levelBadge, { backgroundColor: getReminderLevelColor(reminder.level) + '20' }]}>
                    <Text style={[reminderStyles.levelText, { color: getReminderLevelColor(reminder.level) }]}>
                      {reminder.level}
                    </Text>
                  </View>
                  <View style={reminderStyles.itemContent}>
                    <Text style={reminderStyles.itemLabel}>{REMINDER_LEVEL_LABELS[reminder.level] || `Relance ${reminder.level}`}</Text>
                    <Text style={reminderStyles.itemDate}>{formatDate(reminder.sent_at)}</Text>
                    {reminder.recipient_email && (
                      <Text style={reminderStyles.itemEmail}>{reminder.recipient_email}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {showReminderSection && (
          <View style={reminderStyles.actionCard}>
            <View style={reminderStyles.actionHeader}>
              <Clock size={20} color={Colors.light.error} />
              <View style={reminderStyles.actionHeaderText}>
                <Text style={reminderStyles.actionTitle}>Facture en retard</Text>
                <Text style={reminderStyles.actionSubtitle}>
                  {lastReminderLevel === 0 
                    ? 'Aucune relance envoyée'
                    : `Dernière relance : niveau ${lastReminderLevel}`
                  }
                </Text>
              </View>
            </View>
            {lastReminderLevel < 3 && (
              <TouchableOpacity 
                style={reminderStyles.actionButton}
                onPress={openReminderModal}
              >
                <Bell size={18} color="#FFFFFF" />
                <Text style={reminderStyles.actionButtonText}>
                  Envoyer relance {lastReminderLevel + 1}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <View style={styles.actionsGrid}>
            {!isReadOnly && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: Colors.light.tint + '15' }]}
                onPress={handleEdit}
              >
                <Edit3 size={16} color={Colors.light.tint} />
                <Text style={[styles.actionButtonText, { color: Colors.light.tint }]}>
                  Modifier
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: Colors.light.info + '15' }]}
              onPress={handleDuplicate}
              disabled={isDuplicating}
            >
              <Copy size={16} color={Colors.light.info} />
              <Text style={[styles.actionButtonText, { color: Colors.light.info }]}>
                {isDuplicating ? 'Duplication...' : 'Dupliquer'}
              </Text>
            </TouchableOpacity>
            {document.status === 'draft' && !isEInvoiceEnabled && (
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
            )}
            {document.type === 'devis' && document.status !== 'cancelled' && document.status !== 'rejected' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: Colors.light.success + '15' }]}
                onPress={handleConvertToFacture}
                disabled={isConverting}
              >
                <ArrowRightLeft size={16} color={Colors.light.success} />
                <Text style={[styles.actionButtonText, { color: Colors.light.success }]}>
                  {isConverting ? 'Conversion...' : 'Convertir en facture'}
                </Text>
              </TouchableOpacity>
            )}
            {document.status === 'sent' && document.type === 'devis' && (
              <>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.light.success + '15' }]}
                  onPress={() => handleStatusChange('accepted')}
                >
                  <Check size={16} color={Colors.light.success} />
                  <Text style={[styles.actionButtonText, { color: Colors.light.success }]}>
                    Accepté
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, { backgroundColor: Colors.light.error + '15' }]}
                  onPress={() => handleStatusChange('rejected')}
                >
                  <X size={16} color={Colors.light.error} />
                  <Text style={[styles.actionButtonText, { color: Colors.light.error }]}>
                    Refusé
                  </Text>
                </TouchableOpacity>
              </>
            )}
            {document.type === 'devis' && document.status !== 'cancelled' && document.status !== 'paid' && (
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: Colors.light.textMuted + '15' }]}
                onPress={() => handleStatusChange('cancelled')}
              >
                <X size={16} color={Colors.light.textMuted} />
                <Text style={[styles.actionButtonText, { color: Colors.light.textMuted }]}>
                  Annuler
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showPaymentModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowPaymentModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPaymentModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Mode de paiement</Text>
            <Text style={styles.modalSubtitle}>Sélectionnez le mode de paiement (optionnel)</Text>
            
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

      <Modal
        visible={showReminderModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReminderModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowReminderModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Envoyer une relance</Text>
            <Text style={styles.modalSubtitle}>Sélectionnez le niveau de relance</Text>
            
            <View style={styles.paymentOptions}>
              {[1, 2, 3].map((level) => {
                const template = reminderTemplates.find((t: ReminderTemplate) => t.level === level);
                const isDisabled = level <= lastReminderLevel;
                return (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.paymentOption,
                      selectedReminderLevel === level && styles.paymentOptionSelected,
                      isDisabled && { opacity: 0.5 },
                    ]}
                    onPress={() => !isDisabled && setSelectedReminderLevel(level)}
                    disabled={isDisabled}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.paymentOptionText,
                          selectedReminderLevel === level && styles.paymentOptionTextSelected,
                        ]}
                      >
                        {REMINDER_LEVEL_LABELS[level]}
                      </Text>
                      {template && (
                        <Text style={{ fontSize: 12, color: Colors.light.textMuted, marginTop: 2 }} numberOfLines={1}>
                          {template.subject.substring(0, 40)}...
                        </Text>
                      )}
                    </View>
                    {selectedReminderLevel === level && (
                      <Check size={16} color={Colors.light.tint} />
                    )}
                    {isDisabled && (
                      <Text style={{ fontSize: 11, color: Colors.light.textMuted }}>Déjà envoyé</Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelButton}
                onPress={() => setShowReminderModal(false)}
              >
                <Text style={styles.modalCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmButton, { backgroundColor: Colors.light.warning }]}
                onPress={handleSendReminder}
                disabled={isSendingReminder}
              >
                <Text style={styles.modalConfirmText}>
                  {isSendingReminder ? 'Envoi...' : 'Envoyer'}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function getReminderLevelColor(level: number): string {
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

const reminderStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  list: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  levelBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: {
    fontSize: 14,
    fontWeight: '700' as const,
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  itemDate: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  itemEmail: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  actionCard: {
    backgroundColor: Colors.light.error + '10',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.error + '30',
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  actionHeaderText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.error,
  },
  actionSubtitle: {
    fontSize: 13,
    color: Colors.light.error + 'B0',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.warning,
    borderRadius: 12,
    paddingVertical: 12,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});

const pdfStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  paper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  documentNumber: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  dateLabel: {
    fontSize: 10,
    color: Colors.light.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  dateValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 16,
  },
  clientSection: {
    marginBottom: 20,
  },
  clientLabel: {
    fontSize: 10,
    color: Colors.light.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
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
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.light.surfaceSecondary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 4,
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.light.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  tableRowAlt: {
    backgroundColor: Colors.light.surfaceSecondary + '50',
    borderRadius: 4,
  },
  itemDesc: {
    fontSize: 13,
    color: Colors.light.text,
    lineHeight: 18,
  },
  itemText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  emptyLines: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.light.textMuted,
    fontStyle: 'italic' as const,
  },
  totalsContainer: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  autoLiquidationNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.light.warning + '15',
    borderRadius: 6,
  },
  autoLiquidationText: {
    fontSize: 11,
    color: Colors.light.warning,
    fontWeight: '500' as const,
  },
  totalsBox: {
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 8,
    padding: 14,
    minWidth: 180,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  totalLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  totalValue: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  totalDivider: {
    height: 1,
    backgroundColor: Colors.light.border,
    marginVertical: 8,
  },
  totalLabelMain: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  totalValueMain: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  notesSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 12,
  },
  noteBlock: {
    gap: 4,
  },
  noteTitle: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.light.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  noteText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
  legalSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  legalText: {
    fontSize: 10,
    color: Colors.light.textMuted,
    lineHeight: 14,
  },
});

const historyStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  timeline: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
  },
  item: {
    flexDirection: 'row',
    gap: 12,
  },
  iconContainer: {
    alignItems: 'center',
    width: 24,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 6,
    marginBottom: -10,
    borderRadius: 1,
  },
  content: {
    flex: 1,
    paddingBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  date: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  detail: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
});

const einvoiceStyles = StyleSheet.create({
  statusHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 6,
  },
  statusHeaderDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusHeaderText: {
    fontSize: 12,
    fontWeight: '600' as const,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    gap: 10,
  },
  statusBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500' as const,
    lineHeight: 18,
  },
  primaryActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 16,
    gap: 10,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryActionButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  timelineSection: {
    marginBottom: 20,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  eventsContainer: {
    marginTop: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    gap: 10,
  },
  eventDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  eventContent: {
    flex: 1,
  },
  eventStatus: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  eventDate: {
    fontSize: 11,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  eventMessage: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 4,
    fontStyle: 'italic' as const,
  },
});

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
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  statusHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelledBadge: {
    backgroundColor: Colors.light.error,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cancelledBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700' as const,
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  actionsSection: {
    marginBottom: 20,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    padding: 4,
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
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  paymentOptions: {
    gap: 8,
    marginBottom: 20,
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

const creditNoteStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  totalBadge: {
    backgroundColor: Colors.light.error + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  totalBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.light.error,
  },
  list: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  itemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.light.error + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemNumber: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
    fontFamily: 'monospace',
  },
  itemDate: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  itemReason: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
    fontStyle: 'italic' as const,
  },
  itemRight: {
    alignItems: 'flex-end',
  },
  itemAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.error,
  },
  linkedInvoiceCard: {
    backgroundColor: Colors.light.info + '10',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.light.info + '30',
  },
  linkedInvoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  linkedInvoiceTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.info,
  },
  linkedInvoiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 8,
    paddingVertical: 10,
    gap: 6,
  },
  linkedInvoiceButtonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
});

const splitStyles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  statsRow: {
    backgroundColor: Colors.light.tint + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statsText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  progressSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  progressBar: {
    height: 8,
    backgroundColor: Colors.light.borderLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.light.success,
    borderRadius: 4,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  progressPaid: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.success,
  },
  progressPending: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  list: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  splitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
    gap: 12,
  },
  splitLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  splitAvatar: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitAvatarText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  splitInfo: {
    flex: 1,
  },
  splitNumber: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
    fontFamily: 'monospace',
  },
  splitClient: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  splitRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  splitAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  splitStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  splitStatusText: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
});
