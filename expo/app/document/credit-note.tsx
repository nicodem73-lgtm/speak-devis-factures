import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { 
  ChevronDown, 
  Plus, 
  Trash2, 
  User, 
  Check, 
  FileText, 
  RotateCcw,
  Search,
  X,
  AlertTriangle,
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllClients } from '@/db/clients';
import { Client } from '@/types/client';
import { 
  Document,
  LineItemInput, 
  formatCurrency,
  DiscountType,
  calculateDocumentTotals,
  calculateLineTotal,
  formatDate,
} from '@/types/document';
import { 
  createCreditNote, 
  createCreditNoteFromInvoice,
  getInvoicesForCreditNote,
  getRemainingCreditableAmount,
  getTotalCreditedAmount,
} from '@/db/creditNotes';
import { getLineItemsByDocumentId } from '@/db/documents';

type CreditNoteMode = 'select' | 'linked' | 'free';
type LinkedMode = 'full' | 'partial';

interface LineItemForm extends Omit<LineItemInput, 'unit_price' | 'quantity' | 'tva_rate' | 'discount_value'> {
  key: string;
  unit_price: string;
  quantity: string;
  tva_rate: string;
  discount_value: string;
}

export default function CreditNoteScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const params = useLocalSearchParams<{ invoiceId?: string }>();
  const preselectedInvoiceId = params.invoiceId ? parseInt(params.invoiceId, 10) : null;

  const [mode, setMode] = useState<CreditNoteMode>(preselectedInvoiceId ? 'linked' : 'select');
  const [linkedMode, setLinkedMode] = useState<LinkedMode>('full');
  const [selectedInvoice, setSelectedInvoice] = useState<Document | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [reason, setReason] = useState('');
  const [documentDate] = useState(new Date().toISOString().split('T')[0]);
  const [lineItems, setLineItems] = useState<LineItemForm[]>([]);
  const [globalDiscountType, setGlobalDiscountType] = useState<DiscountType>('percent');
  const [globalDiscountValueStr, setGlobalDiscountValueStr] = useState('0');
  const globalDiscountValue = parseFloat(globalDiscountValueStr.replace(',', '.')) || 0;
  const [autoLiquidation, setAutoLiquidation] = useState(false);

  const parseDecimalValue = (text: string): number => {
    if (!text) return 0;
    const normalized = text.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const normalizeDecimalInput = (text: string): string => {
    return text.replace(',', '.');
  };

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['clients', db],
    queryFn: async () => {
      if (!db) return [];
      return getAllClients(db);
    },
    enabled: isReady && !!db,
  });

  const { data: invoices = [], isLoading: loadingInvoices } = useQuery({
    queryKey: ['invoices-for-credit-note', db, selectedClient?.id],
    queryFn: async () => {
      if (!db) return [];
      return getInvoicesForCreditNote(db, selectedClient?.id);
    },
    enabled: isReady && !!db && mode === 'linked',
  });

  useEffect(() => {
    if (preselectedInvoiceId && invoices.length > 0 && !selectedInvoice) {
      const invoice = invoices.find(inv => inv.id === preselectedInvoiceId);
      if (invoice) {
        setSelectedInvoice(invoice);
      }
    }
  }, [preselectedInvoiceId, invoices, selectedInvoice]);

  const { data: remainingAmount = 0 } = useQuery({
    queryKey: ['remaining-creditable', db, selectedInvoice?.id],
    queryFn: async () => {
      if (!db || !selectedInvoice?.id) return 0;
      return getRemainingCreditableAmount(db, selectedInvoice.id);
    },
    enabled: isReady && !!db && !!selectedInvoice?.id,
  });

  const { data: totalCredited = 0 } = useQuery({
    queryKey: ['total-credited', db, selectedInvoice?.id],
    queryFn: async () => {
      if (!db || !selectedInvoice?.id) return 0;
      return getTotalCreditedAmount(db, selectedInvoice.id);
    },
    enabled: isReady && !!db && !!selectedInvoice?.id,
  });

  const filteredInvoices = useMemo(() => {
    if (!invoiceSearchQuery.trim()) return invoices;
    const query = invoiceSearchQuery.toLowerCase();
    return invoices.filter(inv => 
      inv.number.toLowerCase().includes(query) ||
      inv.client_name?.toLowerCase().includes(query) ||
      inv.client_company?.toLowerCase().includes(query)
    );
  }, [invoices, invoiceSearchQuery]);

  useEffect(() => {
    if (selectedInvoice && mode === 'linked') {
      loadInvoiceLines();
    }
  }, [selectedInvoice, mode]);

  const loadInvoiceLines = async () => {
    if (!db || !selectedInvoice) return;
    
    const lines = await getLineItemsByDocumentId(db, selectedInvoice.id);
    const formLines: LineItemForm[] = lines.map((line, index) => ({
      key: `line-${index}-${Date.now()}`,
      product_id: line.product_id,
      label: line.label,
      description: line.description,
      quantity: String(line.quantity),
      unit_price: String(line.unit_price),
      tva_rate: String(line.tva_rate),
      discount_type: line.discount_type || 'percent',
      discount_value: String(line.discount_value || 0),
    }));
    setLineItems(formLines);
    setGlobalDiscountType(selectedInvoice.global_discount_type || 'percent');
    setGlobalDiscountValueStr(String(selectedInvoice.global_discount_value || 0));
    setAutoLiquidation(selectedInvoice.auto_liquidation === 1);
    
    const client = clients.find(c => c.id === selectedInvoice.client_id);
    if (client) setSelectedClient(client);
  };

  const parsedLineItems = useMemo(() => {
    return lineItems.map(item => ({
      ...item,
      quantity: parseDecimalValue(item.quantity),
      unit_price: parseDecimalValue(item.unit_price),
      tva_rate: parseDecimalValue(item.tva_rate),
      discount_value: parseDecimalValue(item.discount_value),
    }));
  }, [lineItems]);

  const totals = useMemo(() => {
    return calculateDocumentTotals(parsedLineItems, globalDiscountType, globalDiscountValue, autoLiquidation);
  }, [parsedLineItems, globalDiscountType, globalDiscountValue, autoLiquidation]);

  const { mutate: createAvoir, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      
      if (!reason.trim()) {
        throw new Error('Le motif est obligatoire');
      }

      if (mode === 'linked' && selectedInvoice) {
        if (linkedMode === 'full') {
          return createCreditNoteFromInvoice(db, {
            original_invoice_id: selectedInvoice.id,
            mode: 'full',
            reason: reason.trim(),
          });
        } else {
          const modifiedLines: LineItemInput[] = parsedLineItems.map(item => ({
            product_id: item.product_id,
            label: item.label,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tva_rate: item.tva_rate,
            discount_type: item.discount_type,
            discount_value: item.discount_value,
          }));

          return createCreditNoteFromInvoice(db, {
            original_invoice_id: selectedInvoice.id,
            mode: 'partial',
            reason: reason.trim(),
            modified_lines: modifiedLines,
          });
        }
      } else if (mode === 'free' && selectedClient) {
        const lineItemsInput: LineItemInput[] = parsedLineItems.map(item => ({
          product_id: item.product_id,
          label: item.label,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tva_rate: item.tva_rate,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
        }));

        return createCreditNote(db, {
          client_id: selectedClient.id,
          date: documentDate,
          reason: reason.trim(),
          line_items: lineItemsInput,
          global_discount_type: globalDiscountType,
          global_discount_value: globalDiscountValue,
          auto_liquidation: autoLiquidation,
        });
      }

      throw new Error('Configuration invalide');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.back();
    },
    onError: (error) => {
      console.error('[CreditNote] Error:', error);
      Alert.alert('Erreur', error instanceof Error ? error.message : 'Impossible de créer l\'avoir');
    },
  });

  const handleSelectInvoice = useCallback((invoice: Document) => {
    setSelectedInvoice(invoice);
    setShowInvoicePicker(false);
    setInvoiceSearchQuery('');
  }, []);

  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client);
    setShowClientPicker(false);
  }, []);

  const handleAddLine = useCallback(() => {
    const newItem: LineItemForm = {
      key: `${Date.now()}-${Math.random()}`,
      label: '',
      description: '',
      quantity: '1',
      unit_price: '',
      tva_rate: '20',
      discount_type: 'percent',
      discount_value: '0',
    };
    setLineItems((prev) => [...prev, newItem]);
  }, []);

  const handleRemoveLine = useCallback((key: string) => {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const handleUpdateLine = useCallback((key: string, field: string, value: string) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item
      )
    );
  }, []);

  const handleSave = useCallback(() => {
    if (!reason.trim()) {
      Alert.alert('Validation', 'Le motif de l\'avoir est obligatoire');
      return;
    }

    if (mode === 'linked' && !selectedInvoice) {
      Alert.alert('Validation', 'Veuillez sélectionner une facture');
      return;
    }

    if (mode === 'free' && !selectedClient) {
      Alert.alert('Validation', 'Veuillez sélectionner un client');
      return;
    }

    if (mode === 'free' && lineItems.length === 0) {
      Alert.alert('Validation', 'Ajoutez au moins une ligne');
      return;
    }

    if (mode === 'linked' && linkedMode === 'partial') {
      if (totals.totalTtc > remainingAmount + 0.01) {
        Alert.alert(
          'Montant dépassé',
          `Le montant de l'avoir (${formatCurrency(totals.totalTtc)}) dépasse le montant restant à avoir (${formatCurrency(remainingAmount)}).`
        );
        return;
      }
    }

    createAvoir();
  }, [reason, mode, selectedInvoice, selectedClient, lineItems, linkedMode, totals.totalTtc, remainingAmount, createAvoir]);

  const isLoading = !isReady || loadingClients || loadingInvoices;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (mode === 'select') {
    return (
      <>
        <Stack.Screen options={{ title: 'Nouvel avoir' }} />
        <View style={styles.container}>
          <View style={styles.modeSelectContainer}>
            <Text style={styles.modeSelectTitle}>Type d&apos;avoir</Text>
            <Text style={styles.modeSelectSubtitle}>
              Choisissez le type d&apos;avoir à créer
            </Text>

            <TouchableOpacity
              style={styles.modeCard}
              onPress={() => setMode('linked')}
              activeOpacity={0.7}
            >
              <View style={[styles.modeCardIcon, { backgroundColor: Colors.light.info + '15' }]}>
                <FileText size={28} color={Colors.light.info} />
              </View>
              <View style={styles.modeCardContent}>
                <Text style={styles.modeCardTitle}>Avoir lié à une facture</Text>
                <Text style={styles.modeCardDesc}>
                  Créer un avoir relatif à une facture existante (annulation totale ou partielle)
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modeCard}
              onPress={() => setMode('free')}
              activeOpacity={0.7}
            >
              <View style={[styles.modeCardIcon, { backgroundColor: Colors.light.warning + '15' }]}>
                <RotateCcw size={28} color={Colors.light.warning} />
              </View>
              <View style={styles.modeCardContent}>
                <Text style={styles.modeCardTitle}>Avoir libre</Text>
                <Text style={styles.modeCardDesc}>
                  Créer un crédit client sans facture d&apos;origine
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: mode === 'linked' ? 'Avoir sur facture' : 'Avoir libre',
          headerRight: () => (
            <TouchableOpacity
              style={[styles.headerSaveButton, isCreating && styles.headerSaveButtonDisabled]}
              onPress={handleSave}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.headerSaveButtonText}>Créer</Text>
                </>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {mode === 'linked' && (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Facture d&apos;origine</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => setShowInvoicePicker(true)}
                >
                  {selectedInvoice ? (
                    <View style={styles.selectedItem}>
                      <View style={styles.selectedItemIcon}>
                        <FileText size={20} color={Colors.light.success} />
                      </View>
                      <View style={styles.selectedItemInfo}>
                        <Text style={styles.selectedItemTitle}>{selectedInvoice.number}</Text>
                        <Text style={styles.selectedItemSubtitle}>
                          {selectedInvoice.client_name} • {formatCurrency(selectedInvoice.total_ttc)}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.placeholderItem}>
                      <FileText size={20} color={Colors.light.textMuted} />
                      <Text style={styles.placeholderText}>Sélectionner une facture</Text>
                    </View>
                  )}
                  <ChevronDown size={20} color={Colors.light.textMuted} />
                </TouchableOpacity>

                {selectedInvoice && (
                  <View style={styles.invoiceInfoCard}>
                    <View style={styles.invoiceInfoRow}>
                      <Text style={styles.invoiceInfoLabel}>Total facture</Text>
                      <Text style={styles.invoiceInfoValue}>{formatCurrency(selectedInvoice.total_ttc)}</Text>
                    </View>
                    {totalCredited > 0 && (
                      <View style={styles.invoiceInfoRow}>
                        <Text style={styles.invoiceInfoLabel}>Déjà avoir</Text>
                        <Text style={[styles.invoiceInfoValue, { color: Colors.light.error }]}>
                          -{formatCurrency(totalCredited)}
                        </Text>
                      </View>
                    )}
                    <View style={[styles.invoiceInfoRow, styles.invoiceInfoRowHighlight]}>
                      <Text style={styles.invoiceInfoLabelBold}>Reste à avoir</Text>
                      <Text style={styles.invoiceInfoValueBold}>{formatCurrency(remainingAmount)}</Text>
                    </View>
                  </View>
                )}
              </View>

              {selectedInvoice && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Mode d&apos;avoir</Text>
                  <View style={styles.linkedModeContainer}>
                    <TouchableOpacity
                      style={[
                        styles.linkedModeOption,
                        linkedMode === 'full' && styles.linkedModeOptionActive,
                      ]}
                      onPress={() => setLinkedMode('full')}
                    >
                      <View style={[
                        styles.linkedModeRadio,
                        linkedMode === 'full' && styles.linkedModeRadioActive,
                      ]}>
                        {linkedMode === 'full' && <View style={styles.linkedModeRadioDot} />}
                      </View>
                      <View style={styles.linkedModeContent}>
                        <Text style={styles.linkedModeTitle}>Annulation totale</Text>
                        <Text style={styles.linkedModeDesc}>
                          Avoir de {formatCurrency(remainingAmount)} (100%)
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.linkedModeOption,
                        linkedMode === 'partial' && styles.linkedModeOptionActive,
                      ]}
                      onPress={() => setLinkedMode('partial')}
                    >
                      <View style={[
                        styles.linkedModeRadio,
                        linkedMode === 'partial' && styles.linkedModeRadioActive,
                      ]}>
                        {linkedMode === 'partial' && <View style={styles.linkedModeRadioDot} />}
                      </View>
                      <View style={styles.linkedModeContent}>
                        <Text style={styles.linkedModeTitle}>Annulation partielle</Text>
                        <Text style={styles.linkedModeDesc}>
                          Modifier les quantités/prix
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}

          {mode === 'free' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Client</Text>
              <TouchableOpacity
                style={styles.picker}
                onPress={() => setShowClientPicker(!showClientPicker)}
              >
                {selectedClient ? (
                  <View style={styles.selectedItem}>
                    <View style={styles.clientAvatar}>
                      <Text style={styles.avatarText}>
                        {selectedClient.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.selectedItemInfo}>
                      <Text style={styles.selectedItemTitle}>{selectedClient.name}</Text>
                      {selectedClient.company && (
                        <Text style={styles.selectedItemSubtitle}>{selectedClient.company}</Text>
                      )}
                    </View>
                  </View>
                ) : (
                  <View style={styles.placeholderItem}>
                    <User size={20} color={Colors.light.textMuted} />
                    <Text style={styles.placeholderText}>Sélectionner un client</Text>
                  </View>
                )}
                <ChevronDown size={20} color={Colors.light.textMuted} />
              </TouchableOpacity>

              {showClientPicker && (
                <View style={styles.pickerList}>
                  {clients.map((client) => (
                    <TouchableOpacity
                      key={client.id}
                      style={styles.pickerItem}
                      onPress={() => handleSelectClient(client)}
                    >
                      <Text style={styles.pickerItemText}>{client.name}</Text>
                      {client.company && (
                        <Text style={styles.pickerItemSub}>{client.company}</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Motif de l&apos;avoir *</Text>
            <TextInput
              style={styles.reasonInput}
              value={reason}
              onChangeText={setReason}
              placeholder="Ex: Correction erreur de prix, Retour marchandise..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={2}
            />
          </View>

          {((mode === 'linked' && linkedMode === 'partial') || mode === 'free') && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Lignes</Text>
                <TouchableOpacity
                  style={styles.addLineButton}
                  onPress={handleAddLine}
                >
                  <Plus size={16} color={Colors.light.tint} />
                  <Text style={styles.addLineText}>Ajouter</Text>
                </TouchableOpacity>
              </View>

              {lineItems.length === 0 ? (
                <View style={styles.emptyLines}>
                  <Text style={styles.emptyLinesText}>
                    Ajoutez des lignes à l&apos;avoir
                  </Text>
                </View>
              ) : (
                <View style={styles.linesList}>
                  {lineItems.map((item, index) => {
                    const parsedItem = parsedLineItems[index];
                    const lineTotal = calculateLineTotal(parsedItem);
                    return (
                      <View key={item.key} style={styles.lineItem}>
                        <View style={styles.lineHeader}>
                          <Text style={styles.lineNumber}>#{index + 1}</Text>
                          <TouchableOpacity
                            onPress={() => handleRemoveLine(item.key)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Trash2 size={18} color={Colors.light.error} />
                          </TouchableOpacity>
                        </View>
                        
                        <TextInput
                          style={styles.lineInput}
                          value={item.label || ''}
                          onChangeText={(text) => handleUpdateLine(item.key, 'label', text)}
                          placeholder="Libellé"
                          placeholderTextColor={Colors.light.textMuted}
                        />
                        
                        <TextInput
                          style={[styles.lineInput, styles.descriptionInput]}
                          value={item.description}
                          onChangeText={(text) => handleUpdateLine(item.key, 'description', text)}
                          placeholder="Description"
                          placeholderTextColor={Colors.light.textMuted}
                          multiline
                        />
                        
                        <View style={styles.lineRow}>
                          <View style={styles.lineField}>
                            <Text style={styles.lineLabel}>Qté</Text>
                            <TextInput
                              style={styles.lineInputSmall}
                              value={item.quantity}
                              onChangeText={(text) => handleUpdateLine(item.key, 'quantity', normalizeDecimalInput(text))}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View style={styles.lineField}>
                            <Text style={styles.lineLabel}>Prix HT</Text>
                            <TextInput
                              style={styles.lineInputSmall}
                              value={item.unit_price}
                              onChangeText={(text) => handleUpdateLine(item.key, 'unit_price', normalizeDecimalInput(text))}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View style={styles.lineField}>
                            <Text style={styles.lineLabel}>TVA %</Text>
                            <TextInput
                              style={styles.lineInputSmall}
                              value={item.tva_rate}
                              onChangeText={(text) => handleUpdateLine(item.key, 'tva_rate', normalizeDecimalInput(text))}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>
                        
                        <Text style={styles.lineTotal}>
                          {formatCurrency(lineTotal.ht)} HT
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.totalsCard}>
              <View style={styles.warningBanner}>
                <AlertTriangle size={16} color={Colors.light.error} />
                <Text style={styles.warningText}>
                  Les montants de l&apos;avoir seront négatifs
                </Text>
              </View>
              
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total HT</Text>
                <Text style={[styles.totalValue, styles.negativeValue]}>
                  -{formatCurrency(totals.totalHt)}
                </Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TVA</Text>
                <Text style={[styles.totalValue, styles.negativeValue]}>
                  -{formatCurrency(totals.totalTva)}
                </Text>
              </View>
              <View style={[styles.totalRow, styles.totalRowFinal]}>
                <Text style={styles.totalLabelFinal}>Total TTC</Text>
                <Text style={[styles.totalValueFinal, styles.negativeValueFinal]}>
                  -{formatCurrency(totals.totalTtc)}
                </Text>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showInvoicePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowInvoicePicker(false)}
      >
        <Pressable 
          style={styles.modalOverlay} 
          onPress={() => setShowInvoicePicker(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionner une facture</Text>
              <TouchableOpacity onPress={() => setShowInvoicePicker(false)}>
                <X size={24} color={Colors.light.textSecondary} />
              </TouchableOpacity>
            </View>

            <View style={styles.searchContainer}>
              <Search size={18} color={Colors.light.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher..."
                placeholderTextColor={Colors.light.textMuted}
                value={invoiceSearchQuery}
                onChangeText={setInvoiceSearchQuery}
                autoCorrect={false}
              />
              {invoiceSearchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setInvoiceSearchQuery('')}>
                  <X size={18} color={Colors.light.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.invoiceList}>
              {filteredInvoices.length === 0 ? (
                <View style={styles.emptyInvoices}>
                  <Text style={styles.emptyInvoicesText}>
                    Aucune facture disponible
                  </Text>
                </View>
              ) : (
                filteredInvoices.map((invoice) => (
                  <TouchableOpacity
                    key={invoice.id}
                    style={styles.invoiceItem}
                    onPress={() => handleSelectInvoice(invoice)}
                  >
                    <View style={styles.invoiceItemLeft}>
                      <Text style={styles.invoiceItemNumber}>{invoice.number}</Text>
                      <Text style={styles.invoiceItemClient}>
                        {invoice.client_name}
                        {invoice.client_company ? ` • ${invoice.client_company}` : ''}
                      </Text>
                      <Text style={styles.invoiceItemDate}>{formatDate(invoice.date)}</Text>
                    </View>
                    <View style={styles.invoiceItemRight}>
                      <Text style={styles.invoiceItemAmount}>
                        {formatCurrency(invoice.total_ttc)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
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
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  headerSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.error,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  headerSaveButtonDisabled: {
    opacity: 0.6,
  },
  headerSaveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  modeSelectContainer: {
    flex: 1,
    paddingTop: 40,
    paddingHorizontal: 16,
  },
  modeSelectTitle: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 8,
  },
  modeSelectSubtitle: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginBottom: 32,
  },
  modeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    gap: 16,
  },
  modeCardIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeCardContent: {
    flex: 1,
  },
  modeCardTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  modeCardDesc: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  selectedItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  selectedItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedItemInfo: {
    flex: 1,
  },
  selectedItemTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  selectedItemSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  placeholderItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeholderText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  pickerList: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginTop: 8,
    maxHeight: 200,
  },
  pickerItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pickerItemText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  pickerItemSub: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  invoiceInfoCard: {
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
  },
  invoiceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  invoiceInfoRowHighlight: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    marginTop: 8,
    paddingTop: 12,
  },
  invoiceInfoLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  invoiceInfoValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  invoiceInfoLabelBold: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  invoiceInfoValueBold: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.light.success,
  },
  linkedModeContainer: {
    gap: 12,
  },
  linkedModeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    gap: 14,
  },
  linkedModeOptionActive: {
    borderColor: Colors.light.tint,
    backgroundColor: Colors.light.tint + '08',
  },
  linkedModeRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.light.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedModeRadioActive: {
    borderColor: Colors.light.tint,
  },
  linkedModeRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.light.tint,
  },
  linkedModeContent: {
    flex: 1,
  },
  linkedModeTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  linkedModeDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  reasonInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addLineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.tint + '15',
    gap: 6,
  },
  addLineText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  emptyLines: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyLinesText: {
    fontSize: 14,
    color: Colors.light.textMuted,
  },
  linesList: {
    gap: 12,
  },
  lineItem: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  lineNumber: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textMuted,
  },
  lineInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: Colors.light.text,
    marginBottom: 8,
  },
  descriptionInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  lineRow: {
    flexDirection: 'row',
    gap: 10,
  },
  lineField: {
    flex: 1,
  },
  lineLabel: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  lineInputSmall: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.light.text,
    textAlign: 'center',
  },
  lineTotal: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
    textAlign: 'right',
    marginTop: 12,
  },
  totalsCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.error + '10',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.error,
    fontWeight: '500' as const,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  totalRowFinal: {
    borderTopWidth: 2,
    borderTopColor: Colors.light.error,
    marginTop: 8,
    paddingTop: 12,
  },
  totalLabel: {
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  totalValue: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  negativeValue: {
    color: Colors.light.error,
  },
  totalLabelFinal: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  totalValueFinal: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  negativeValueFinal: {
    color: Colors.light.error,
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    margin: 16,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
  },
  invoiceList: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyInvoices: {
    padding: 32,
    alignItems: 'center',
  },
  emptyInvoicesText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  invoiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  invoiceItemLeft: {
    flex: 1,
  },
  invoiceItemNumber: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  invoiceItemClient: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  invoiceItemDate: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  invoiceItemRight: {
    alignItems: 'flex-end',
  },
  invoiceItemAmount: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.success,
  },
});
