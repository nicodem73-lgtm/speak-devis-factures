import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import { Save, Plus, Trash2, ChevronDown, FileText, Weight } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { createDeliveryNote, CreateDeliveryNoteData } from '@/db/deliveryNotes';
import { getAllDocuments, getDocumentById, getLineItemsByDocumentId } from '@/db/documents';
import { getClientById } from '@/db/clients';
import { getCompanyInfo } from '@/db/settings';
import { DeliveryNoteLineInput, calculateLineWeight, calculateTotalWeight, formatWeight } from '@/types/deliveryNote';
import { Document, formatCurrency } from '@/types/document';

export default function NewDeliveryNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const { db, isReady } = useDatabase();
  const queryClient = useQueryClient();

  const [invoiceId, setInvoiceId] = useState<number | null>(params.invoiceId ? parseInt(params.invoiceId, 10) : null);
  const [shipToName, setShipToName] = useState('');
  const [shipToAddress, setShipToAddress] = useState('');
  const [shipToPhone, setShipToPhone] = useState('');
  const [shipFromName, setShipFromName] = useState('');
  const [shipFromAddress, setShipFromAddress] = useState('');
  const [shipFromPhone, setShipFromPhone] = useState('');
  const [lines, setLines] = useState<DeliveryNoteLineInput[]>([]);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  const { data: invoices = [] } = useQuery({
    queryKey: ['invoices-for-delivery', db],
    queryFn: async () => {
      if (!db) return [];
      const docs = await getAllDocuments(db);
      return docs.filter(d => d.type === 'facture');
    },
    enabled: isReady && !!db,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ['company-info', db],
    queryFn: async () => {
      if (!db) return null;
      return getCompanyInfo(db);
    },
    enabled: isReady && !!db,
  });

  const { data: selectedInvoice, isLoading: isLoadingInvoice } = useQuery({
    queryKey: ['selected-invoice', db, invoiceId],
    queryFn: async () => {
      if (!db || !invoiceId) return null;
      return getDocumentById(db, invoiceId);
    },
    enabled: isReady && !!db && !!invoiceId,
  });

  useEffect(() => {
    if (companyInfo) {
      setShipFromName(companyInfo.name || '');
      const address = [
        companyInfo.address,
        [companyInfo.postalCode, companyInfo.city].filter(Boolean).join(' ')
      ].filter(Boolean).join(', ');
      setShipFromAddress(address);
      setShipFromPhone(companyInfo.phone || '');
    }
  }, [companyInfo]);

  useEffect(() => {
    const loadInvoiceData = async () => {
      if (!db || !selectedInvoice) return;

      const client = selectedInvoice.client_id ? await getClientById(db, selectedInvoice.client_id) : null;
      
      if (client) {
        setShipToName(client.company || client.name);
        const deliveryAddr = client.delivery_address || client.address;
        const deliveryCity = client.delivery_city || client.city;
        const deliveryPostal = client.delivery_postal_code || client.postal_code;
        const address = [
          deliveryAddr,
          [deliveryPostal, deliveryCity].filter(Boolean).join(' ')
        ].filter(Boolean).join(', ');
        setShipToAddress(address);
        setShipToPhone(client.phone || '');
      }

      const lineItems = await getLineItemsByDocumentId(db, selectedInvoice.id);
      const newLines: DeliveryNoteLineInput[] = lineItems.map(item => ({
        product_id: item.product_id,
        label: item.label || item.description,
        qty: item.quantity,
        unit: 'unité',
        unit_weight_kg: undefined,
        line_weight_kg: 0,
      }));
      setLines(newLines);
    };

    loadInvoiceData();
  }, [db, selectedInvoice]);

  const totalWeight = useMemo(() => calculateTotalWeight(lines), [lines]);

  const createMutation = useMutation({
    mutationFn: async (data: CreateDeliveryNoteData) => {
      if (!db) throw new Error('Database not ready');
      return createDeliveryNote(db, data);
    },
    onSuccess: (id) => {
      console.log('[NewDeliveryNote] Created:', id);
      queryClient.invalidateQueries({ queryKey: ['delivery-notes'] });
      router.replace(`/delivery-notes/${id}` as never);
    },
    onError: (error) => {
      console.error('[NewDeliveryNote] Error:', error);
      Alert.alert('Erreur', 'Impossible de créer le bon de livraison');
    },
  });

  const handleSave = useCallback(() => {
    if (!invoiceId) {
      Alert.alert('Erreur', 'Veuillez sélectionner une facture associée');
      return;
    }
    if (!shipToName.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir le nom du destinataire');
      return;
    }
    if (!shipToAddress.trim()) {
      Alert.alert('Erreur', "Veuillez saisir l'adresse de livraison");
      return;
    }
    if (!shipFromName.trim()) {
      Alert.alert('Erreur', "Veuillez saisir le nom de l'émetteur");
      return;
    }
    if (!shipFromAddress.trim()) {
      Alert.alert('Erreur', "Veuillez saisir l'adresse de l'émetteur");
      return;
    }

    createMutation.mutate({
      invoice_id: invoiceId,
      ship_to_name: shipToName.trim(),
      ship_to_address: shipToAddress.trim(),
      ship_to_phone: shipToPhone.trim() || undefined,
      ship_from_name: shipFromName.trim(),
      ship_from_address: shipFromAddress.trim(),
      ship_from_phone: shipFromPhone.trim() || undefined,
      lines,
    });
  }, [invoiceId, shipToName, shipToAddress, shipToPhone, shipFromName, shipFromAddress, shipFromPhone, lines, createMutation.mutate]);

  const handleAddLine = useCallback(() => {
    setLines(prev => [...prev, {
      label: '',
      qty: 1,
      unit: 'unité',
      unit_weight_kg: undefined,
      line_weight_kg: 0,
    }]);
  }, []);

  const handleRemoveLine = useCallback((index: number) => {
    setLines(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpdateLine = useCallback((index: number, field: keyof DeliveryNoteLineInput, value: string | number) => {
    setLines(prev => {
      const newLines = [...prev];
      const line = { ...newLines[index] };
      
      if (field === 'qty') {
        line.qty = typeof value === 'string' ? parseFloat(value) || 0 : value;
        line.line_weight_kg = calculateLineWeight(line.qty, line.unit_weight_kg);
      } else if (field === 'unit_weight_kg') {
        line.unit_weight_kg = typeof value === 'string' ? parseFloat(value) || undefined : value;
        line.line_weight_kg = calculateLineWeight(line.qty, line.unit_weight_kg);
      } else if (field === 'label') {
        line.label = String(value);
      } else if (field === 'unit') {
        line.unit = String(value);
      }
      
      newLines[index] = line;
      return newLines;
    });
  }, []);

  const handleSelectInvoice = useCallback((invoice: Document) => {
    setInvoiceId(invoice.id);
    setShowInvoiceModal(false);
  }, []);

  if (!isReady) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Nouveau bon de livraison' }} />
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Nouveau bon de livraison',
          headerRight: () => (
            <TouchableOpacity
              onPress={handleSave}
              disabled={createMutation.isPending}
              style={styles.headerButton}
            >
              {createMutation.isPending ? (
                <ActivityIndicator size="small" color={Colors.light.tint} />
              ) : (
                <Save size={22} color={Colors.light.tint} />
              )}
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facture associée *</Text>
          <TouchableOpacity
            style={styles.selectButton}
            onPress={() => setShowInvoiceModal(true)}
          >
            {selectedInvoice ? (
              <View style={styles.selectedInvoice}>
                <FileText size={20} color={Colors.light.tint} />
                <View style={styles.selectedInvoiceInfo}>
                  <Text style={styles.selectedInvoiceNumber}>{selectedInvoice.number}</Text>
                  <Text style={styles.selectedInvoiceAmount}>{formatCurrency(selectedInvoice.total_ttc)}</Text>
                </View>
              </View>
            ) : (
              <Text style={styles.selectButtonText}>Sélectionner une facture</Text>
            )}
            <ChevronDown size={20} color={Colors.light.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Destinataire</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom / Entreprise *</Text>
            <TextInput
              style={styles.input}
              value={shipToName}
              onChangeText={setShipToName}
              placeholder="Nom du destinataire"
              placeholderTextColor={Colors.light.textMuted}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Adresse *</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={shipToAddress}
              onChangeText={setShipToAddress}
              placeholder="Adresse de livraison"
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Téléphone</Text>
            <TextInput
              style={styles.input}
              value={shipToPhone}
              onChangeText={setShipToPhone}
              placeholder="Téléphone (optionnel)"
              placeholderTextColor={Colors.light.textMuted}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Émetteur</Text>
          <View style={styles.senderInfo}>
            <Text style={styles.senderName}>{shipFromName || 'Non configuré'}</Text>
            {shipFromAddress ? (
              <Text style={styles.senderAddress}>{shipFromAddress}</Text>
            ) : null}
            {shipFromPhone ? (
              <Text style={styles.senderPhone}>{shipFromPhone}</Text>
            ) : null}
            {!companyInfo?.name && (
              <Text style={styles.senderWarning}>Configurez vos informations dans Paramètres {'>'} Informations entreprise</Text>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Lignes</Text>
            <TouchableOpacity style={styles.addLineButton} onPress={handleAddLine}>
              <Plus size={18} color={Colors.light.tint} />
              <Text style={styles.addLineText}>Ajouter</Text>
            </TouchableOpacity>
          </View>
          
          {lines.map((line, index) => (
            <View key={index} style={styles.lineCard}>
              <View style={styles.lineHeader}>
                <Text style={styles.lineNumber}>Ligne {index + 1}</Text>
                <TouchableOpacity onPress={() => handleRemoveLine(index)}>
                  <Trash2 size={18} color={Colors.light.error} />
                </TouchableOpacity>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Désignation</Text>
                <TextInput
                  style={styles.input}
                  value={line.label}
                  onChangeText={(v) => handleUpdateLine(index, 'label', v)}
                  placeholder="Description"
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
              
              <View style={styles.lineRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Quantité</Text>
                  <TextInput
                    style={styles.input}
                    value={String(line.qty)}
                    onChangeText={(v) => handleUpdateLine(index, 'qty', v)}
                    keyboardType="decimal-pad"
                    placeholder="1"
                    placeholderTextColor={Colors.light.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Unité</Text>
                  <TextInput
                    style={styles.input}
                    value={line.unit}
                    onChangeText={(v) => handleUpdateLine(index, 'unit', v)}
                    placeholder="unité"
                    placeholderTextColor={Colors.light.textMuted}
                  />
                </View>
              </View>
              
              <View style={styles.lineRow}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Poids unitaire (kg)</Text>
                  <TextInput
                    style={styles.input}
                    value={line.unit_weight_kg ? String(line.unit_weight_kg) : ''}
                    onChangeText={(v) => handleUpdateLine(index, 'unit_weight_kg', v)}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={Colors.light.textMuted}
                  />
                </View>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.inputLabel}>Poids ligne</Text>
                  <View style={styles.weightDisplay}>
                    <Weight size={16} color={Colors.light.textSecondary} />
                    <Text style={styles.weightValue}>{formatWeight(line.line_weight_kg)}</Text>
                  </View>
                </View>
              </View>
            </View>
          ))}

          {lines.length === 0 && (
            <View style={styles.emptyLines}>
              <Text style={styles.emptyLinesText}>Aucune ligne ajoutée</Text>
            </View>
          )}
        </View>

        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Poids total</Text>
            <View style={styles.totalValue}>
              <Weight size={20} color={Colors.light.tint} />
              <Text style={styles.totalWeight}>{formatWeight(totalWeight)}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={showInvoiceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInvoiceModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowInvoiceModal(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Sélectionner une facture</Text>
            <FlatList
              data={invoices}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.invoiceOption,
                    invoiceId === item.id && styles.invoiceOptionSelected,
                  ]}
                  onPress={() => handleSelectInvoice(item)}
                >
                  <View style={styles.invoiceOptionIcon}>
                    <FileText size={20} color={invoiceId === item.id ? '#FFFFFF' : Colors.light.tint} />
                  </View>
                  <View style={styles.invoiceOptionInfo}>
                    <Text style={[
                      styles.invoiceOptionNumber,
                      invoiceId === item.id && styles.invoiceOptionTextSelected,
                    ]}>
                      {item.number}
                    </Text>
                    <Text style={[
                      styles.invoiceOptionClient,
                      invoiceId === item.id && styles.invoiceOptionTextSelected,
                    ]}>
                      {item.client_name || item.client_company || 'Client'}
                    </Text>
                  </View>
                  <Text style={[
                    styles.invoiceOptionAmount,
                    invoiceId === item.id && styles.invoiceOptionTextSelected,
                  ]}>
                    {formatCurrency(item.total_ttc)}
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyModalText}>Aucune facture disponible</Text>
              }
              style={styles.invoiceList}
            />
            <TouchableOpacity 
              style={styles.modalCancel} 
              onPress={() => setShowInvoiceModal(false)}
            >
              <Text style={styles.modalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  },
  headerButton: {
    padding: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  selectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  selectButtonText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  selectedInvoice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  selectedInvoiceInfo: {
    flex: 1,
  },
  selectedInvoiceNumber: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  selectedInvoiceAmount: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  addLineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.light.tint + '15',
    borderRadius: 8,
  },
  addLineText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  lineCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  lineNumber: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
  },
  lineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  weightDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 10,
    padding: 14,
  },
  weightValue: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  emptyLines: {
    padding: 20,
    alignItems: 'center',
  },
  emptyLinesText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  senderInfo: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.light.border,
    gap: 4,
  },
  senderName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  senderAddress: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  senderPhone: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  senderWarning: {
    fontSize: 13,
    color: Colors.light.warning,
    fontStyle: 'italic' as const,
    marginTop: 4,
  },
  totalSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  totalValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  totalWeight: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '70%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  invoiceList: {
    maxHeight: 400,
  },
  invoiceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  invoiceOptionSelected: {
    backgroundColor: Colors.light.tint,
  },
  invoiceOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceOptionInfo: {
    flex: 1,
  },
  invoiceOptionNumber: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  invoiceOptionClient: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  invoiceOptionAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  invoiceOptionTextSelected: {
    color: '#FFFFFF',
  },
  emptyModalText: {
    fontSize: 15,
    color: Colors.light.textMuted,
    textAlign: 'center',
    padding: 20,
  },
  modalCancel: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
});
