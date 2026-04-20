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
  Switch,
  Modal,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { ChevronDown, Plus, Trash2, User, Percent, Euro, X, UserPlus, Check, AlertTriangle } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReminderConfig } from '@/db/reminders';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllClients, createClient } from '@/db/clients';
import { getAllProducts } from '@/db/products';
import { getDocumentById, getLineItemsByDocumentId, updateDocument, deleteDocument } from '@/db/documents';
import { Client, ClientFormData } from '@/types/client';
import { Product } from '@/types/product';
import { 
  DocumentType, 
  LineItemInput, 
  TYPE_LABELS, 
  formatCurrency,
  DiscountType,
  calculateDocumentTotals,
  calculateLineTotal,
} from '@/types/document';
import { DepositConfig, DEFAULT_DEPOSIT_CONFIG } from '@/types/deposit';
import { getDepositConfig, saveDepositConfig } from '@/db/deposits';
import DepositConfigSection from '@/components/DepositConfigSection';
import { getCompanyInfo } from '@/db/settings';

interface LineItemForm extends LineItemInput {
  key: string;
}

const formatDateToFrench = (isoDate: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const normalizeDateInput = (input: string): string => {
  if (!input) return '';
  
  const digitsOnly = input.replace(/\D/g, '');
  
  if (digitsOnly.length === 8) {
    const day = digitsOnly.substring(0, 2);
    const month = digitsOnly.substring(2, 4);
    const year = digitsOnly.substring(4, 8);
    return `${day}/${month}/${year}`;
  }
  
  if (input.includes('-')) {
    const parts = input.split('-');
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
      } else {
        return `${parts[0]}/${parts[1]}/${parts[2]}`;
      }
    }
  }
  
  return input;
};

const formatDateToISO = (frenchDate: string): string => {
  if (!frenchDate) return '';
  const normalized = normalizeDateInput(frenchDate);
  const parts = normalized.split('/');
  if (parts.length !== 3) return frenchDate;
  return `${parts[2]}-${parts[1]}-${parts[0]}`;
};

export default function EditDocumentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const { id } = useLocalSearchParams<{ id: string }>();
  const documentId = parseInt(id || '0', 10);
  
  const [documentType, setDocumentType] = useState<DocumentType>('devis');
  const [documentNumber, setDocumentNumber] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showQuickClientModal, setShowQuickClientModal] = useState(false);
  const [quickClientName, setQuickClientName] = useState('');
  const [quickClientEmail, setQuickClientEmail] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('');
  const [legalMentions, setLegalMentions] = useState('');
  const [dossier, setDossier] = useState('');
  const [objet, setObjet] = useState('');
  const [lineItems, setLineItems] = useState<LineItemForm[]>([]);
  const [globalDiscountType, setGlobalDiscountType] = useState<DiscountType>('percent');
  const [globalDiscountValue, setGlobalDiscountValue] = useState(0);
  const [autoLiquidation, setAutoLiquidation] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [depositConfig, setDepositConfig] = useState<DepositConfig>(DEFAULT_DEPOSIT_CONFIG);

  const handleDateChange = (setter: (value: string) => void) => (text: string) => {
    setter(text);
  };

  const handleDateBlur = (value: string, setter: (value: string) => void) => () => {
    if (value) {
      setter(normalizeDateInput(value));
    }
  };

  const { data: document, isLoading: loadingDoc } = useQuery({
    queryKey: ['document', documentId, db],
    queryFn: async () => {
      if (!db) return null;
      return getDocumentById(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  useEffect(() => {
    if (document && document.type === 'facture') {
      Alert.alert(
        'Modification impossible',
        'Les factures ne peuvent pas être modifiées.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    }
  }, [document, router]);

  const { data: existingLineItems = [], isLoading: loadingLines } = useQuery({
    queryKey: ['lineItems', documentId, db],
    queryFn: async () => {
      if (!db) return [];
      return getLineItemsByDocumentId(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['clients', db],
    queryFn: async () => {
      if (!db) return [];
      return getAllClients(db);
    },
    enabled: isReady && !!db,
  });

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['products', db],
    queryFn: async () => {
      if (!db) return [];
      return getAllProducts(db);
    },
    enabled: isReady && !!db,
  });

  const { data: reminderConfig } = useQuery({
    queryKey: ['reminderConfig', db],
    queryFn: async () => {
      if (!db) return null;
      return getReminderConfig(db);
    },
    enabled: isReady && !!db,
  });

  const { data: existingDepositConfig } = useQuery({
    queryKey: ['depositConfig', documentId, db],
    queryFn: async () => {
      if (!db) return null;
      return getDepositConfig(db, documentId);
    },
    enabled: isReady && !!db && documentId > 0,
  });

  const { data: companyInfo } = useQuery({
    queryKey: ['companyInfo', db],
    queryFn: async () => {
      if (!db) return null;
      return getCompanyInfo(db);
    },
    enabled: isReady && !!db,
  });

  const isVatExempt = companyInfo?.vatExempt === true;
  const noTva = autoLiquidation || isVatExempt;

  useEffect(() => {
    if (document && existingLineItems && clients.length > 0 && !isInitialized) {
      setDocumentType(document.type);
      setDocumentNumber(document.number);
      setDocumentDate(formatDateToFrench(document.date));
      setDueDate(document.due_date ? formatDateToFrench(document.due_date) : '');
      setNotes(document.notes || '');
      setConditions(document.conditions || '');
      setLegalMentions(document.legal_mentions || '');
      setDossier(document.dossier || '');
      setObjet(document.objet || '');
      setGlobalDiscountType(document.global_discount_type || 'percent');
      setGlobalDiscountValue(document.global_discount_value || 0);
      setAutoLiquidation(document.auto_liquidation === 1);
      
      const client = clients.find(c => c.id === document.client_id);
      if (client) {
        setSelectedClient(client);
      }
      
      const items: LineItemForm[] = existingLineItems.map(item => ({
        key: `${item.id}-${Date.now()}`,
        product_id: item.product_id,
        label: item.label,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tva_rate: item.tva_rate,
        discount_type: item.discount_type || 'percent',
        discount_value: item.discount_value || 0,
        image_url: item.image_url,
      }));
      setLineItems(items);
      
      if (existingDepositConfig) {
        setDepositConfig(existingDepositConfig);
      }
      
      setIsInitialized(true);
    }
  }, [document, existingLineItems, clients, isInitialized, existingDepositConfig]);

  const { mutate: updateDoc, isPending: isUpdating } = useMutation({
    mutationFn: async () => {
      if (!db || !selectedClient) throw new Error('Missing data');
      
      const items: LineItemInput[] = lineItems.map((item) => ({
        product_id: item.product_id,
        label: item.label,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tva_rate: noTva ? 0 : item.tva_rate,
        discount_type: item.discount_type,
        discount_value: item.discount_value,
        image_url: item.image_url,
      }));

      return updateDocument(db, documentId, {
        type: documentType,
        number: documentNumber,
        client_id: selectedClient.id,
        date: formatDateToISO(documentDate),
        due_date: dueDate ? formatDateToISO(dueDate) : undefined,
        global_discount_type: globalDiscountType,
        global_discount_value: globalDiscountValue,
        auto_liquidation: autoLiquidation,
        notes: notes || undefined,
        conditions: conditions || undefined,
        legal_mentions: legalMentions || undefined,
        dossier: dossier || undefined,
        objet: objet || undefined,
        line_items: items,
      });
    },
    onSuccess: async () => {
      if (documentType === 'devis' && db) {
        await saveDepositConfig(db, documentId, depositConfig, totals.totalTtc);
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['document', documentId] });
      queryClient.invalidateQueries({ queryKey: ['lineItems', documentId] });
      queryClient.invalidateQueries({ queryKey: ['depositConfig', documentId] });
      queryClient.invalidateQueries({ queryKey: ['depositPlan', documentId] });
      router.back();
    },
    onError: (error) => {
      console.error('[EditDocument] Error:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le document');
    },
  });

  const { mutate: deleteDoc, isPending: isDeleting } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      return deleteDocument(db, documentId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      router.replace('/(tabs)');
    },
    onError: (error) => {
      console.error('[DeleteDocument] Error:', error);
      Alert.alert('Erreur', 'Impossible de supprimer le document');
    },
  });

  const { mutate: createQuickClient, isPending: isCreatingClient } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');
      const clientData: ClientFormData = {
        name: quickClientName,
        company: '',
        siret: '',
        tva_number: '',
        email: quickClientEmail,
        phone: '',
        address: '',
        city: '',
        postal_code: '',
        country: 'France',
        delivery_address: '',
        delivery_city: '',
        delivery_postal_code: '',
        delivery_country: '',
        notes: '',
      };
      return createClient(db, clientData);
    },
    onSuccess: async (clientId) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      if (db) {
        const newClients = await getAllClients(db);
        const newClient = newClients.find(c => c.id === clientId);
        if (newClient) {
          setSelectedClient(newClient);
        }
      }
      setShowQuickClientModal(false);
      setQuickClientName('');
      setQuickClientEmail('');
    },
    onError: (error) => {
      console.error('[QuickClient] Error:', error);
      Alert.alert('Erreur', 'Impossible de créer le client');
    },
  });

  const totals = useMemo(() => {
    return calculateDocumentTotals(lineItems, globalDiscountType, globalDiscountValue, noTva);
  }, [lineItems, globalDiscountType, globalDiscountValue, noTva]);

  const handleAddProduct = useCallback((product: Product) => {
    setShowProductPicker(false);
    const newItem: LineItemForm = {
      key: `${Date.now()}-${Math.random()}`,
      product_id: product.id,
      label: product.name,
      description: product.description || product.name,
      quantity: 1,
      unit_price: product.unit_price,
      tva_rate: product.tva_rate,
      discount_type: 'percent',
      discount_value: 0,
    };
    setLineItems((prev) => [...prev, newItem]);
  }, []);

  const handleAddCustomLine = useCallback(() => {
    const newItem: LineItemForm = {
      key: `${Date.now()}-${Math.random()}`,
      label: '',
      description: '',
      quantity: 1,
      unit_price: 0,
      tva_rate: 20,
      discount_type: 'percent',
      discount_value: 0,
    };
    setLineItems((prev) => [...prev, newItem]);
  }, []);

  const handleRemoveLine = useCallback((key: string) => {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  }, []);

  const handleUpdateLine = useCallback((key: string, field: keyof LineItemInput, value: string | number) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item
      )
    );
  }, []);

  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client);
    setShowClientPicker(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedClient) {
      Alert.alert('Erreur', 'Veuillez sélectionner un client');
      return;
    }
    if (lineItems.length === 0) {
      Alert.alert('Erreur', 'Ajoutez au moins une ligne');
      return;
    }
    updateDoc();
  }, [selectedClient, lineItems, updateDoc]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      'Supprimer le document',
      'Cette action est irréversible. Voulez-vous continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteDoc() },
      ]
    );
  }, [deleteDoc]);

  const isLoading = !isReady || loadingDoc || loadingLines || loadingClients || loadingProducts || !isInitialized;

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

  return (
    <>
      <Stack.Screen
        options={{
          title: `Modifier ${TYPE_LABELS[documentType].toLowerCase()}`,
          headerRight: () => (
            <TouchableOpacity
              style={[styles.headerSaveButton, isUpdating && styles.headerSaveButtonDisabled]}
              onPress={handleSave}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.headerSaveButtonText}>Enregistrer</Text>
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informations</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Numéro</Text>
                <Text style={styles.infoValueReadonly}>{documentNumber}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date</Text>
                <TextInput
                  style={styles.infoInput}
                  value={documentDate}
                  onChangeText={handleDateChange(setDocumentDate)}
                  onBlur={handleDateBlur(documentDate, setDocumentDate)}
                  placeholder="JJ/MM/AAAA"
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Échéance</Text>
                <TextInput
                  style={styles.infoInput}
                  value={dueDate}
                  onChangeText={handleDateChange(setDueDate)}
                  onBlur={handleDateBlur(dueDate, setDueDate)}
                  placeholder={documentType === 'facture' ? 'JJ/MM/AAAA (requis pour relances)' : 'JJ/MM/AAAA (optionnel)'}
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
              {documentType === 'facture' && reminderConfig?.enabled && !dueDate && (
                <View style={styles.dueDateWarning}>
                  <AlertTriangle size={14} color={Colors.light.warning} />
                  <Text style={styles.dueDateWarningText}>
                    Sans échéance, les relances ne pourront pas être déclenchées
                  </Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Dossier</Text>
                <TextInput
                  style={styles.infoInput}
                  value={dossier}
                  onChangeText={setDossier}
                  placeholder="Référence dossier (optionnel)"
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Objet</Text>
                <TextInput
                  style={styles.infoInput}
                  value={objet}
                  onChangeText={setObjet}
                  placeholder="Objet du document (optionnel)"
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Client</Text>
              <TouchableOpacity
                style={styles.quickAddButton}
                onPress={() => setShowQuickClientModal(true)}
              >
                <UserPlus size={16} color={Colors.light.tint} />
                <Text style={styles.quickAddText}>Nouveau</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={styles.clientPicker}
              onPress={() => setShowClientPicker(!showClientPicker)}
            >
              {selectedClient ? (
                <View style={styles.selectedClient}>
                  <View style={styles.clientAvatar}>
                    <Text style={styles.avatarText}>
                      {selectedClient.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.clientInfo}>
                    <Text style={styles.clientName}>{selectedClient.name}</Text>
                    {selectedClient.company && (
                      <Text style={styles.clientCompany}>{selectedClient.company}</Text>
                    )}
                  </View>
                </View>
              ) : (
                <View style={styles.placeholderClient}>
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
                {clients.length === 0 && (
                  <Text style={styles.emptyPicker}>Aucun client disponible</Text>
                )}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Lignes</Text>
              <View style={styles.lineActions}>
                <TouchableOpacity
                  style={styles.addLineButton}
                  onPress={() => setShowProductPicker(!showProductPicker)}
                >
                  <Plus size={16} color={Colors.light.tint} />
                  <Text style={styles.addLineText}>Produit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.addLineButton}
                  onPress={handleAddCustomLine}
                >
                  <Plus size={16} color={Colors.light.tint} />
                  <Text style={styles.addLineText}>Ligne libre</Text>
                </TouchableOpacity>
              </View>
            </View>

            {showProductPicker && (
              <View style={styles.pickerList}>
                {products.map((product) => (
                  <TouchableOpacity
                    key={product.id}
                    style={styles.pickerItem}
                    onPress={() => handleAddProduct(product)}
                  >
                    <Text style={styles.pickerItemText}>{product.name}</Text>
                    <Text style={styles.pickerItemSub}>
                      {formatCurrency(product.unit_price)} • TVA {product.tva_rate}%
                    </Text>
                  </TouchableOpacity>
                ))}
                {products.length === 0 && (
                  <Text style={styles.emptyPicker}>Aucun produit disponible</Text>
                )}
              </View>
            )}

            {lineItems.length === 0 ? (
              <View style={styles.emptyLines}>
                <Text style={styles.emptyLinesText}>
                  Ajoutez des produits ou des lignes libres
                </Text>
              </View>
            ) : (
              <View style={styles.linesList}>
                {lineItems.map((item, index) => {
                  const lineTotal = calculateLineTotal(item);
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
                            value={String(item.quantity)}
                            onChangeText={(text) => handleUpdateLine(item.key, 'quantity', parseFloat(text) || 0)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.lineField}>
                          <Text style={styles.lineLabel}>Prix HT</Text>
                          <TextInput
                            style={styles.lineInputSmall}
                            value={String(item.unit_price)}
                            onChangeText={(text) => handleUpdateLine(item.key, 'unit_price', parseFloat(text) || 0)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                        <View style={styles.lineField}>
                          <Text style={styles.lineLabel}>TVA %</Text>
                          <TextInput
                            style={styles.lineInputSmall}
                            value={String(item.tva_rate)}
                            onChangeText={(text) => handleUpdateLine(item.key, 'tva_rate', parseFloat(text) || 0)}
                            keyboardType="decimal-pad"
                          />
                        </View>
                      </View>

                      <View style={styles.lineDiscountRow}>
                        <Text style={styles.lineLabel}>Remise</Text>
                        <View style={styles.discountTypeToggle}>
                          <TouchableOpacity
                            style={[
                              styles.discountTypeBtn,
                              item.discount_type === 'percent' && styles.discountTypeBtnActive,
                            ]}
                            onPress={() => handleUpdateLine(item.key, 'discount_type', 'percent')}
                          >
                            <Percent size={14} color={item.discount_type === 'percent' ? '#fff' : Colors.light.textMuted} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.discountTypeBtn,
                              item.discount_type === 'fixed' && styles.discountTypeBtnActive,
                            ]}
                            onPress={() => handleUpdateLine(item.key, 'discount_type', 'fixed')}
                          >
                            <Euro size={14} color={item.discount_type === 'fixed' ? '#fff' : Colors.light.textMuted} />
                          </TouchableOpacity>
                        </View>
                        <TextInput
                          style={styles.discountInput}
                          value={String(item.discount_value)}
                          onChangeText={(text) => handleUpdateLine(item.key, 'discount_value', parseFloat(text) || 0)}
                          keyboardType="decimal-pad"
                          placeholder="0"
                          placeholderTextColor={Colors.light.textMuted}
                        />
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

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Remise globale</Text>
            <View style={styles.globalDiscountCard}>
              <View style={styles.discountTypeToggle}>
                <TouchableOpacity
                  style={[
                    styles.discountTypeBtn,
                    globalDiscountType === 'percent' && styles.discountTypeBtnActive,
                  ]}
                  onPress={() => setGlobalDiscountType('percent')}
                >
                  <Percent size={16} color={globalDiscountType === 'percent' ? '#fff' : Colors.light.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.discountTypeBtn,
                    globalDiscountType === 'fixed' && styles.discountTypeBtnActive,
                  ]}
                  onPress={() => setGlobalDiscountType('fixed')}
                >
                  <Euro size={16} color={globalDiscountType === 'fixed' ? '#fff' : Colors.light.textMuted} />
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.globalDiscountInput}
                value={String(globalDiscountValue)}
                onChangeText={(text) => setGlobalDiscountValue(parseFloat(text) || 0)}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.light.textMuted}
              />
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.autoLiquidationRow}>
              <View style={styles.autoLiquidationInfo}>
                <Text style={styles.autoLiquidationTitle}>Auto-liquidation</Text>
                <Text style={styles.autoLiquidationDesc}>TVA à 0% (export, intracommunautaire)</Text>
              </View>
              <Switch
                value={autoLiquidation}
                onValueChange={setAutoLiquidation}
                disabled={isVatExempt}
                trackColor={{ false: Colors.light.borderLight, true: Colors.light.tint }}
                thumbColor="#fff"
              />
            </View>
          </View>

          {documentType === 'devis' && (
            <View style={styles.section}>
              <DepositConfigSection
                config={depositConfig}
                onConfigChange={setDepositConfig}
                totalTtc={totals.totalTtc}
                totalHt={totals.totalHt}
              />
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes internes ou pour le client..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Conditions</Text>
            <TextInput
              style={styles.notesInput}
              value={conditions}
              onChangeText={setConditions}
              placeholder="Conditions de paiement, validité..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Mentions légales</Text>
            <TextInput
              style={styles.notesInput}
              value={legalMentions}
              onChangeText={setLegalMentions}
              placeholder="Mentions obligatoires..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={3}
            />
          </View>

          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Sous-total HT</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.totalHt + totals.discountAmount)}</Text>
            </View>
            {totals.discountAmount > 0 && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Remise</Text>
                <Text style={[styles.totalValue, { color: Colors.light.error }]}>
                  -{formatCurrency(totals.discountAmount)}
                </Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total HT</Text>
              <Text style={styles.totalValue}>{formatCurrency(totals.totalHt)}</Text>
            </View>
            {!noTva && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TVA</Text>
                <Text style={styles.totalValue}>{formatCurrency(totals.totalTva)}</Text>
              </View>
            )}
            {autoLiquidation && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#D97706', fontStyle: 'italic' }]}>Auto-liquidation de TVA (Art. 283-2 du CGI)</Text>
              </View>
            )}
            {isVatExempt && !autoLiquidation && (
              <View style={styles.totalRow}>
                <Text style={[styles.totalLabel, { color: '#D97706', fontStyle: 'italic' }]}>TVA non applicable, art. 293 B du CGI</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.totalRowMain]}>
              <Text style={styles.totalLabelMain}>{noTva ? 'Total HT net' : 'Total TTC'}</Text>
              <Text style={styles.totalValueMain}>{formatCurrency(noTva ? totals.totalHt : totals.totalTtc)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={isDeleting}
          >
            <Trash2 size={18} color={Colors.light.error} />
            <Text style={styles.deleteButtonText}>
              {isDeleting ? 'Suppression...' : 'Supprimer ce document'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showQuickClientModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQuickClientModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowQuickClientModal(false)}>
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nouveau client</Text>
            <TouchableOpacity
              style={[
                styles.headerSaveButton,
                (isCreatingClient || !quickClientName.trim()) && styles.headerSaveButtonDisabled
              ]}
              onPress={() => createQuickClient()}
              disabled={isCreatingClient || !quickClientName.trim()}
            >
              {isCreatingClient ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                  <Text style={styles.headerSaveButtonText}>Créer</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Nom *</Text>
              <TextInput
                style={styles.formInput}
                value={quickClientName}
                onChangeText={setQuickClientName}
                placeholder="Nom du client"
                placeholderTextColor={Colors.light.textMuted}
                autoFocus
              />
            </View>
            <View style={styles.formField}>
              <Text style={styles.formLabel}>Email</Text>
              <TextInput
                style={styles.formInput}
                value={quickClientEmail}
                onChangeText={setQuickClientEmail}
                placeholder="email@exemple.com"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>
        </View>
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
    backgroundColor: '#34C759',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  headerSaveButtonDisabled: {
    opacity: 0.6,
  },
  headerSaveButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 24,
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
  infoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  infoLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    width: 80,
  },
  infoInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.light.text,
    textAlign: 'right' as const,
  },
  infoValueReadonly: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.tint,
    textAlign: 'right' as const,
  },
  dueDateWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.warning + '15',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.warning + '30',
  },
  dueDateWarningText: {
    flex: 1,
    fontSize: 12,
    color: Colors.light.warning,
  },
  quickAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.light.tint + '15',
    borderRadius: 8,
  },
  quickAddText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  clientPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  selectedClient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clientAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  clientCompany: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  placeholderClient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  placeholderText: {
    fontSize: 15,
    color: Colors.light.textMuted,
  },
  pickerList: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginTop: 8,
    overflow: 'hidden',
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
  emptyPicker: {
    padding: 14,
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
  lineActions: {
    flexDirection: 'row',
    gap: 8,
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
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  emptyLines: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 24,
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
    gap: 10,
  },
  lineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
    gap: 4,
  },
  lineLabel: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  lineInputSmall: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.light.text,
    textAlign: 'center',
  },
  lineDiscountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  discountTypeToggle: {
    flexDirection: 'row',
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 2,
  },
  discountTypeBtn: {
    padding: 8,
    borderRadius: 6,
  },
  discountTypeBtnActive: {
    backgroundColor: Colors.light.tint,
  },
  discountInput: {
    flex: 1,
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
    color: Colors.light.tint,
    textAlign: 'right',
  },
  globalDiscountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  globalDiscountInput: {
    flex: 1,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: Colors.light.text,
    textAlign: 'center',
  },
  autoLiquidationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  autoLiquidationInfo: {
    flex: 1,
  },
  autoLiquidationTitle: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  autoLiquidationDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  notesInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  totalsSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 24,
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
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.error + '15',
    borderRadius: 12,
    padding: 16,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.error,
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
    padding: 16,
    gap: 16,
  },
  formField: {
    gap: 8,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  formInput: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.light.text,
  },
});
