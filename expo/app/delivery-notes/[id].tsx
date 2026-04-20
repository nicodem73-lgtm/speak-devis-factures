import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { 
  Printer, 
  Trash2, 
  Edit3, 
  Weight, 
  MapPin, 
  Phone, 
  FileText,
  Package,
  Send,
  Share2,
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { 
  getDeliveryNoteById, 
  getDeliveryNoteLines, 
  deleteDeliveryNote,
  markDeliveryNoteAsSent,
} from '@/db/deliveryNotes';
import { getDocumentById, getLineItemsByDocumentId } from '@/db/documents';
import { getClientById } from '@/db/clients';
import { getCompanyInfo, getTemplateSettings } from '@/db/settings';
import { formatWeight, formatDate } from '@/types/deliveryNote';
import { generateDeliveryNotePDF, printDeliveryNoteWithInvoice, reprintDeliveryNoteWithInvoice, shareDeliveryNotePDF } from '@/utils/deliveryNotePdf';

export default function DeliveryNoteDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { db, isReady } = useDatabase();
  const queryClient = useQueryClient();
  const [isPrinting, setIsPrinting] = useState(false);

  const { data: note, isLoading: isLoadingNote } = useQuery({
    queryKey: ['delivery-note', db, id],
    queryFn: async () => {
      if (!db || !id) return null;
      return getDeliveryNoteById(db, id);
    },
    enabled: isReady && !!db && !!id,
  });

  const { data: lines = [] } = useQuery({
    queryKey: ['delivery-note-lines', db, id],
    queryFn: async () => {
      if (!db || !id) return [];
      return getDeliveryNoteLines(db, id);
    },
    enabled: isReady && !!db && !!id,
  });

  const { data: invoice } = useQuery({
    queryKey: ['invoice-for-delivery', db, note?.invoice_id],
    queryFn: async () => {
      if (!db || !note?.invoice_id) return null;
      return getDocumentById(db, note.invoice_id);
    },
    enabled: isReady && !!db && !!note?.invoice_id,
  });

  const { data: invoiceLines = [] } = useQuery({
    queryKey: ['invoice-lines', db, invoice?.id],
    queryFn: async () => {
      if (!db || !invoice?.id) return [];
      return getLineItemsByDocumentId(db, invoice.id);
    },
    enabled: isReady && !!db && !!invoice?.id,
  });

  const { data: client } = useQuery({
    queryKey: ['client-for-delivery', db, invoice?.client_id],
    queryFn: async () => {
      if (!db || !invoice?.client_id) return null;
      return getClientById(db, invoice.client_id);
    },
    enabled: isReady && !!db && !!invoice?.client_id,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ['company-info', db],
    queryFn: async () => {
      if (!db) return null;
      return getCompanyInfo(db);
    },
    enabled: isReady && !!db,
  });

  const { data: templateSettings } = useQuery({
    queryKey: ['template-settings', db],
    queryFn: async () => {
      if (!db) return null;
      return getTemplateSettings(db);
    },
    enabled: isReady && !!db,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!db || !id) throw new Error('Database not ready');
      return deleteDeliveryNote(db, id);
    },
    onSuccess: () => {
      console.log('[DeliveryNoteDetail] Deleted');
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      router.back();
    },
    onError: (error) => {
      console.error('[DeliveryNoteDetail] Delete error:', error);
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de supprimer');
    },
  });

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Supprimer',
      'Voulez-vous vraiment supprimer ce bon de livraison ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteMutation.mutate() },
      ]
    );
  }, [deleteMutation.mutate]);

  const handleEdit = useCallback(() => {
    if (note?.status === 'Envoyé') {
      Alert.alert('Erreur', 'Impossible de modifier un bon de livraison envoyé');
      return;
    }
    router.push(`/delivery-notes/edit/${id}` as never);
  }, [router, id, note?.status]);

  const handlePrintAndSend = useCallback(async () => {
    if (!note || !invoice || !companyInfo || !db) return;

    setIsPrinting(true);
    try {
      const result = await printDeliveryNoteWithInvoice(
        note,
        lines,
        invoice,
        invoiceLines,
        client ?? null,
        companyInfo,
        templateSettings || undefined
      );

      if (result.printed) {
        await markDeliveryNoteAsSent(db, note.id, result.labelUri, result.invoiceUri);
        queryClient.invalidateQueries({ queryKey: ['delivery-note', db, id] });
        queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
        queryClient.invalidateQueries({ queryKey: ['documents'] });
        Alert.alert('Succès', 'Le bon de livraison et la facture ont été imprimés et marqués comme envoyés.');
      }
    } catch (error: any) {
      console.error('[DeliveryNoteDetail] Print error:', error);
      if (error?.message?.includes('did not complete') || error?.message?.includes('cancelled')) {
        console.log('[DeliveryNoteDetail] Print cancelled by user');
      } else {
        Alert.alert('Erreur', "Impossible d'imprimer les documents");
      }
    } finally {
      setIsPrinting(false);
    }
  }, [note, lines, invoice, invoiceLines, client, companyInfo, templateSettings, db, id, queryClient]);

  const handleSaveOnly = useCallback(async () => {
    if (!note || !invoice || !companyInfo || !db) return;

    setIsPrinting(true);
    try {
      const labelUri = await generateDeliveryNotePDF(note, lines);
      await markDeliveryNoteAsSent(db, note.id, labelUri);
      queryClient.invalidateQueries({ queryKey: ['delivery-note', db, id] });
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      Alert.alert('Succès', 'Le bon de livraison a été enregistré et marqué comme envoyé.');
    } catch (error) {
      console.error('[DeliveryNoteDetail] Save error:', error);
      Alert.alert('Erreur', "Impossible d'enregistrer le bon de livraison");
    } finally {
      setIsPrinting(false);
    }
  }, [note, lines, invoice, companyInfo, db, id, queryClient]);

  const handleReprint = useCallback(async () => {
    if (!note || !invoice || !companyInfo) return;

    setIsPrinting(true);
    try {
      await reprintDeliveryNoteWithInvoice(
        note,
        lines,
        invoice,
        invoiceLines,
        client ?? null,
        companyInfo,
        templateSettings || undefined
      );
    } catch (error: any) {
      console.error('[DeliveryNoteDetail] Reprint error:', error);
      if (error?.message?.includes('did not complete') || error?.message?.includes('cancelled')) {
        console.log('[DeliveryNoteDetail] Reprint cancelled by user');
      } else {
        Alert.alert('Erreur', "Impossible d'imprimer les documents");
      }
    } finally {
      setIsPrinting(false);
    }
  }, [note, lines, invoice, invoiceLines, client, companyInfo, templateSettings]);

  const handleSharePDF = useCallback(async () => {
    if (!note || !invoice || !companyInfo) return;

    setIsPrinting(true);
    try {
      await shareDeliveryNotePDF(
        note,
        lines,
        invoice,
        invoiceLines,
        client ?? null,
        companyInfo,
        templateSettings || undefined
      );
    } catch (error: any) {
      console.error('[DeliveryNoteDetail] Share error:', error);
      if (error?.message?.includes('dismissed') || error?.message?.includes('cancelled')) {
        console.log('[DeliveryNoteDetail] Share cancelled by user');
      } else {
        Alert.alert('Erreur', "Impossible de partager les documents");
      }
    } finally {
      setIsPrinting(false);
    }
  }, [note, lines, invoice, invoiceLines, client, companyInfo, templateSettings]);

  if (!isReady || isLoadingNote) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Bon de livraison' }} />
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (!note) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Bon de livraison' }} />
        <Text style={styles.errorText}>Bon de livraison non trouvé</Text>
      </View>
    );
  }

  const isReadOnly = note.status === 'Envoyé';
  const statusColor = isReadOnly ? Colors.light.success : Colors.light.warning;

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: note.number,
          headerRight: () => !isReadOnly ? (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleEdit} style={styles.headerButton}>
                <Edit3 size={20} color={Colors.light.tint} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
                <Trash2 size={20} color={Colors.light.error} />
              </TouchableOpacity>
            </View>
          ) : null,
        }} 
      />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{note.status}</Text>
          </View>
          <View style={styles.weightBadge}>
            <Weight size={18} color={Colors.light.tint} />
            <Text style={styles.weightText}>{formatWeight(note.total_weight_kg)}</Text>
          </View>
        </View>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>N° Bon de livraison</Text>
            <Text style={styles.infoValue}>{note.number}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date de création</Text>
            <Text style={styles.infoValue}>{formatDate(note.created_at)}</Text>
          </View>
          {note.sent_at && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Date d&apos;envoi</Text>
              <Text style={styles.infoValue}>{formatDate(note.sent_at)}</Text>
            </View>
          )}
          {invoice && (
            <TouchableOpacity 
              style={styles.invoiceLink}
              onPress={() => router.push(`/document/${invoice.id}` as never)}
            >
              <FileText size={18} color={Colors.light.tint} />
              <View style={styles.invoiceLinkInfo}>
                <Text style={styles.invoiceLinkLabel}>Facture associée</Text>
                <Text style={styles.invoiceLinkNumber}>{invoice.number}</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.addressSection}>
          <View style={styles.addressCard}>
            <View style={styles.addressHeader}>
              <Package size={18} color={Colors.light.tint} />
              <Text style={styles.addressTitle}>Destinataire</Text>
            </View>
            <Text style={styles.addressName}>{note.ship_to_name}</Text>
            <View style={styles.addressDetail}>
              <MapPin size={14} color={Colors.light.textSecondary} />
              <Text style={styles.addressText}>{note.ship_to_address}</Text>
            </View>
            {note.ship_to_phone && (
              <View style={styles.addressDetail}>
                <Phone size={14} color={Colors.light.textSecondary} />
                <Text style={styles.addressText}>{note.ship_to_phone}</Text>
              </View>
            )}
          </View>

          <View style={styles.addressCard}>
            <View style={styles.addressHeader}>
              <Send size={18} color={Colors.light.textSecondary} />
              <Text style={styles.addressTitle}>Émetteur</Text>
            </View>
            <Text style={styles.addressName}>{note.ship_from_name}</Text>
            <View style={styles.addressDetail}>
              <MapPin size={14} color={Colors.light.textSecondary} />
              <Text style={styles.addressText}>{note.ship_from_address}</Text>
            </View>
            {note.ship_from_phone && (
              <View style={styles.addressDetail}>
                <Phone size={14} color={Colors.light.textSecondary} />
                <Text style={styles.addressText}>{note.ship_from_phone}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.linesSection}>
          <Text style={styles.sectionTitle}>Contenu ({lines.length} ligne{lines.length > 1 ? 's' : ''})</Text>
          {lines.map((line, index) => (
            <View key={line.id} style={styles.lineCard}>
              <View style={styles.lineMain}>
                <Text style={styles.lineLabel}>{line.label}</Text>
                <Text style={styles.lineQty}>{line.qty} {line.unit}</Text>
              </View>
              {line.line_weight_kg > 0 && (
                <View style={styles.lineWeight}>
                  <Weight size={14} color={Colors.light.textSecondary} />
                  <Text style={styles.lineWeightText}>{formatWeight(line.line_weight_kg)}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomActions}>
        {!isReadOnly ? (
          <>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSaveOnly}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color={Colors.light.tint} />
              ) : (
                <>
                  <Send size={20} color={Colors.light.tint} />
                  <Text style={styles.saveButtonText}>Enregistrer</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.printButton}
              onPress={handlePrintAndSend}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Printer size={20} color="#FFFFFF" />
                  <Text style={styles.printButtonText}>Imprimer BL + Facture</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSharePDF}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color={Colors.light.tint} />
              ) : (
                <>
                  <Share2 size={20} color={Colors.light.tint} />
                  <Text style={styles.saveButtonText}>Partager PDF</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.printButton}
              onPress={handleReprint}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Printer size={20} color="#FFFFFF" />
                  <Text style={styles.printButtonText}>Réimprimer</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  errorText: {
    fontSize: 15,
    color: Colors.light.error,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 120,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  weightBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  weightText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  infoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  invoiceLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.tint + '10',
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  invoiceLinkInfo: {
    flex: 1,
  },
  invoiceLinkLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  invoiceLinkNumber: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  addressSection: {
    gap: 12,
    marginBottom: 16,
  },
  addressCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    gap: 8,
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
  },
  addressName: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  addressDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  addressText: {
    flex: 1,
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  linesSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  lineCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  lineMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lineLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  lineQty: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  lineWeight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  lineWeightText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  bottomActions: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    paddingBottom: 32,
    backgroundColor: Colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint + '15',
    paddingVertical: 14,
    borderRadius: 12,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  printButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint,
    paddingVertical: 14,
    borderRadius: 12,
  },
  printButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
});
