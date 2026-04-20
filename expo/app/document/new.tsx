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
import { ChevronDown, Plus, Trash2, User, Percent, Euro, X, UserPlus, Check, AlertTriangle, FileCheck, Info, Sparkles, ChevronRight, Camera } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getReminderConfig } from '@/db/reminders';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useAppMode } from '@/providers/AppModeProvider';
import { getAllClients, createClient } from '@/db/clients';
import { getAllProducts, createProduct } from '@/db/products';
import ClientForm from '@/components/ClientForm';
import { createDocument, getNextDocumentNumber } from '@/db/documents';
import { Client, ClientFormData } from '@/types/client';
import { Product, ProductFormData } from '@/types/product';
import { 
  DocumentType, 
  LineItemInput, 
  TYPE_LABELS, 
  formatCurrency,
  DiscountType,
  calculateDocumentTotals,
  calculateLineTotal,
} from '@/types/document';
import { validateDocumentForm, formatValidationErrors } from '@/utils/validation';
import { getEInvoiceSettings } from '@/utils/einvoiceProvider';
import { markDocumentAsEInvoice } from '@/db/einvoice';
import { SplitClientInput, validateSplitConfiguration } from '@/types/splitBilling';
import { createDocumentSplits } from '@/db/splitBilling';
import SplitBillingSection from '@/components/SplitBillingSection';
import SplitSummaryModal from '@/components/SplitSummaryModal';
import OCRCamera, { PhotoThumbnailPicker } from '@/components/OCRCamera';
import DepositConfigSection from '@/components/DepositConfigSection';
import { DepositConfig, DEFAULT_DEPOSIT_CONFIG } from '@/types/deposit';
import { saveDepositConfig } from '@/db/deposits';
import { getCompanyInfo } from '@/db/settings';

interface LineItemForm extends Omit<LineItemInput, 'unit_price' | 'quantity' | 'tva_rate' | 'discount_value'> {
  key: string;
  unit_price: string;
  quantity: string;
  tva_rate: string;
  discount_value: string;
  image_url?: string;
}

export default function NewDocumentScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const { isTestMode, logAction } = useAppMode();
  const params = useLocalSearchParams<{ type?: string }>();
  
  const documentType: DocumentType = (params.type === 'facture' ? 'facture' : 'devis');

  const normalizeDateToISO = (input: string): string => {
    if (!input) return '';
    
    const digitsOnly = input.replace(/\D/g, '');
    
    if (digitsOnly.length === 8) {
      const day = digitsOnly.substring(0, 2);
      const month = digitsOnly.substring(2, 4);
      const year = digitsOnly.substring(4, 8);
      return `${year}-${month}-${day}`;
    }
    
    if (input.includes('/')) {
      const parts = input.split('/');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return input.replace(/\//g, '-');
        } else {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
    }
    
    if (input.includes('-')) {
      const parts = input.split('-');
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          return input;
        } else {
          return `${parts[2]}-${parts[1]}-${parts[0]}`;
        }
      }
    }
    
    return input;
  };

  const handleDateChange = (setter: (value: string) => void) => (text: string) => {
    setter(text);
  };

  const handleDateBlur = (value: string, setter: (value: string) => void) => () => {
    if (value) {
      setter(normalizeDateToISO(value));
    }
  };

  const parseDecimalValue = (text: string): number => {
    if (!text) return 0;
    const normalized = text.replace(',', '.');
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  };

  const normalizeDecimalInput = (text: string): string => {
    return text.replace(',', '.');
  };

  const getTodayISO = (): string => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${year}-${month}-${day}`;
  };

  const getDefaultDueDate = (paymentDays: number): string => {
    const today = new Date();
    today.setDate(today.getDate() + paymentDays);
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${year}-${month}-${day}`;
  };
  
  const [documentNumber, setDocumentNumber] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [showClientFormModal, setShowClientFormModal] = useState(false);
  const [documentDate, setDocumentDate] = useState(getTodayISO());
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [conditions, setConditions] = useState('');
  const [dossier, setDossier] = useState('');
  const [objet, setObjet] = useState('');
  const [objetExpanded, setObjetExpanded] = useState(false);
  const [lineItems, setLineItems] = useState<LineItemForm[]>([]);
  const [globalDiscountType, setGlobalDiscountType] = useState<DiscountType>('percent');
  const [globalDiscountValueStr, setGlobalDiscountValueStr] = useState('0');
  const globalDiscountValue = parseDecimalValue(globalDiscountValueStr);
  const [autoLiquidation, setAutoLiquidation] = useState(false);
  const [isEInvoice, setIsEInvoice] = useState(false);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splits, setSplits] = useState<SplitClientInput[]>([]);
  const [showSplitSummary, setShowSplitSummary] = useState(false);
  const [showOCRCamera, setShowOCRCamera] = useState(false);
  const [ocrTargetLineKey, setOcrTargetLineKey] = useState<string | null>(null);
  const [expandedLineDiscounts, setExpandedLineDiscounts] = useState<Set<string>>(new Set());
  const [globalDiscountExpanded, setGlobalDiscountExpanded] = useState(false);
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [conditionsExpanded, setConditionsExpanded] = useState(false);
  const [depositConfig, setDepositConfig] = useState<DepositConfig>(DEFAULT_DEPOSIT_CONFIG);
  const [activeTooltip, setActiveTooltip] = useState<{ lineKey: string; type: 'photo' | 'ocr' } | null>(null);

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

  const { data: einvoiceSettings } = useQuery({
    queryKey: ['einvoiceSettings', db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceSettings(db);
    },
    enabled: isReady && !!db,
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
    async function loadNextNumber() {
      if (db && isReady) {
        const nextNum = await getNextDocumentNumber(db, documentType);
        setDocumentNumber(nextNum);
      }
    }
    loadNextNumber();
  }, [db, isReady, documentType]);

  useEffect(() => {
    if (reminderConfig && documentType === 'facture') {
      setDueDate((currentDueDate) => {
        if (!currentDueDate) {
          return getDefaultDueDate(reminderConfig.defaultPaymentDays);
        }
        return currentDueDate;
      });
    }
  }, [reminderConfig, documentType]);

  const { mutate: createDoc, isPending: isCreating } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Missing data');
      if (!splitEnabled && !selectedClient) throw new Error('Missing client');
      
      const itemsWithProducts: LineItemInput[] = [];
      
      for (const item of lineItems) {
        let productId = item.product_id;
        const parsedUnitPrice = parseDecimalValue(item.unit_price);
        const parsedTvaRate = parseDecimalValue(item.tva_rate);
        const parsedQuantity = parseDecimalValue(item.quantity);
        const parsedDiscountValue = parseDecimalValue(item.discount_value);
        
        if (!productId && item.label && item.label.trim()) {
          const productData: ProductFormData = {
            name: item.label.trim(),
            description: item.description || '',
            unit_price: String(parsedUnitPrice),
            unit: 'unité',
            tva_rate: String(parsedTvaRate),
            is_service: false,
          };
          productId = await createProduct(db, productData);
          console.log('[NewDocument] Created product from free line:', productId);
        }
        
        itemsWithProducts.push({
          product_id: productId,
          label: item.label,
          description: item.description,
          quantity: parsedQuantity,
          unit_price: parsedUnitPrice,
          tva_rate: noTva ? 0 : parsedTvaRate,
          discount_type: item.discount_type,
          discount_value: parsedDiscountValue,
          image_url: item.image_url,
        });
      }

      const clientId = selectedClient?.id 
        ?? (splitEnabled && splits.length > 0 ? splits[0].client_id : null);
      
      if (!clientId) throw new Error('Missing client');

      const docId = await createDocument(db, {
        type: documentType,
        number: documentNumber,
        client_id: clientId,
        date: documentDate,
        due_date: dueDate || undefined,
        global_discount_type: globalDiscountType,
        global_discount_value: globalDiscountValue,
        auto_liquidation: autoLiquidation,
        notes: isTestMode ? `DOCUMENT DE TEST \u2013 SANS VALEUR L\u00c9GALE\n${notes || ''}` : (notes || undefined),
        conditions: conditions || undefined,
        legal_mentions: undefined,
        dossier: dossier || undefined,
        objet: objet || undefined,
        line_items: itemsWithProducts,
        is_test: isTestMode,
        is_einvoice: isEInvoice,
      });

      await logAction('CREATE_DOCUMENT', documentType, String(docId), `${documentNumber} - ${isTestMode ? 'TEST' : 'REEL'}`);

      if (splitEnabled && splits.length > 0) {
        const lineItemsWithIds = await db.getAllAsync<{ id: number; description: string }>(
          'SELECT id, description FROM line_items WHERE document_id = ? ORDER BY id',
          [docId]
        );
        
        const lineItemsForSplit = itemsWithProducts.map((item, index) => ({
          id: lineItemsWithIds[index]?.id || 0,
          key: lineItems[index]?.key || `line-${index}`,
          product_id: item.product_id,
          label: item.label,
          description: item.description,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tva_rate: item.tva_rate,
          discount_type: item.discount_type,
          discount_value: item.discount_value,
          total_ht: item.quantity * item.unit_price,
        }));

        console.log('[NewDocument] Creating splits with masterNumber:', documentNumber, 'masterId:', docId, 'splits count:', splits.length);
        await createDocumentSplits(db, {
          masterId: docId,
          masterNumber: documentNumber,
          masterTotalTtc: totals.totalTtc,
          autoLiquidation,
          splits,
          lineItems: lineItemsForSplit,
        });
      }

      if (isEInvoice) {
        try {
          await markDocumentAsEInvoice(db, docId, true);
          console.log('[NewDocument] Document marked as e-invoice:', docId);
        } catch (eInvoiceError) {
          console.warn('[NewDocument] Failed to mark as e-invoice, continuing:', eInvoiceError);
        }
      }

      return docId;
    },
    onSuccess: async (documentId) => {
      if (documentType === 'devis' && depositConfig.enabled && db) {
        try {
          await saveDepositConfig(db, documentId, depositConfig, totals.totalTtc);
        } catch (depositError) {
          console.warn('[NewDocument] Failed to save deposit config:', depositError);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['documents'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      router.back();
    },
    onError: (error) => {
      console.error('[NewDocument] Error creating document:', error?.message || error);
      Alert.alert('Erreur', `Impossible de créer le document: ${error?.message || 'Erreur inconnue'}`);
    },
  });

  const { mutate: createNewClient, isPending: isCreatingClient } = useMutation({
    mutationFn: async (clientData: ClientFormData) => {
      if (!db) throw new Error('No database');
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
      setShowClientFormModal(false);
    },
    onError: (error) => {
      console.error('[NewClient] Error:', error);
      Alert.alert('Erreur', 'Impossible de créer le client');
    },
  });

  const handleClientFormSubmit = useCallback((data: ClientFormData) => {
    createNewClient(data);
  }, [createNewClient]);

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
    return calculateDocumentTotals(parsedLineItems, globalDiscountType, globalDiscountValue, noTva);
  }, [parsedLineItems, globalDiscountType, globalDiscountValue, noTva]);

  const handleAddProduct = useCallback((product: Product) => {
    setShowProductPicker(false);
    const newItem: LineItemForm = {
      key: `${Date.now()}-${Math.random()}`,
      product_id: product.id,
      label: product.name,
      description: product.description || product.name,
      quantity: '1',
      unit_price: String(product.unit_price),
      tva_rate: String(product.tva_rate),
      discount_type: 'percent',
      discount_value: '0',
    };
    setLineItems((prev) => [...prev, newItem]);
  }, []);

  const handleAddCustomLine = useCallback(() => {
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

  const handleOCRForLine = useCallback((lineKey: string) => {
    setOcrTargetLineKey(lineKey);
    setShowOCRCamera(true);
  }, []);

  const handleOCRTextExtracted = useCallback((text: string) => {
    if (ocrTargetLineKey) {
      handleUpdateLine(ocrTargetLineKey, 'description', text);
    }
    setOcrTargetLineKey(null);
  }, [ocrTargetLineKey, handleUpdateLine]);

  const handleLineImageSelected = useCallback((key: string, uri: string) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, image_url: uri } : item
      )
    );
  }, []);

  const handleLineImageRemoved = useCallback((key: string) => {
    setLineItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, image_url: undefined } : item
      )
    );
  }, []);

  const toggleLineDiscount = useCallback((key: string) => {
    setExpandedLineDiscounts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleSelectClient = useCallback((client: Client) => {
    setSelectedClient(client);
    setShowClientPicker(false);
  }, []);

  const handleSave = useCallback(() => {
    const clientIdForValidation = selectedClient?.id 
      ?? (splitEnabled && splits.length > 0 ? splits[0].client_id : null);

    const validation = validateDocumentForm({
      number: documentNumber,
      client_id: clientIdForValidation,
      date: documentDate,
      due_date: dueDate || undefined,
      line_items: parsedLineItems,
      global_discount_type: globalDiscountType,
      global_discount_value: globalDiscountValue,
    });

    if (!validation.isValid) {
      const errorMessage = formatValidationErrors(validation.errors.slice(0, 3));
      Alert.alert(
        'Validation',
        errorMessage + (validation.errors.length > 3 ? `\n\n+${validation.errors.length - 3} autre(s) erreur(s)` : ''),
        [{ text: 'OK' }]
      );
      return;
    }

    if (splitEnabled && splits.length > 0) {
      const splitValidation = validateSplitConfiguration(
        splits,
        totals.totalTtc,
        lineItems.map(l => ({ key: l.key }))
      );
      
      if (!splitValidation.isValid) {
        setShowSplitSummary(true);
        return;
      }
      setShowSplitSummary(true);
      return;
    }

    createDoc();
  }, [selectedClient, parsedLineItems, createDoc, documentNumber, documentDate, dueDate, globalDiscountType, globalDiscountValue, splitEnabled, splits, totals.totalTtc, lineItems]);

  const isLoading = !isReady || loadingClients || loadingProducts;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `Nouveau ${TYPE_LABELS[documentType].toLowerCase()}`,
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
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Informations</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Numéro</Text>
                <Text style={styles.infoValueReadonly}>{documentNumber || 'Chargement...'}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date</Text>
                <TextInput
                  style={styles.infoInput}
                  value={documentDate}
                  onChangeText={handleDateChange(setDocumentDate)}
                  onBlur={handleDateBlur(documentDate, setDocumentDate)}
                  placeholder="AAAA-MM-JJ"
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
                  placeholder={documentType === 'facture' ? 'AAAA-MM-JJ (requis pour relances)' : 'AAAA-MM-JJ (optionnel)'}
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
            </View>
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => setObjetExpanded(!objetExpanded)}
            >
              <View style={styles.discountAccordionLeft}>
                <View style={[
                  styles.globalDiscountAccordionIcon,
                  objetExpanded && styles.discountAccordionIconExpanded,
                ]}>
                  <Plus size={14} color={Colors.light.tint} />
                </View>
                <Text style={styles.globalDiscountAccordionTitle}>Objet</Text>
              </View>
              {objet.trim() && (
                <Text style={styles.accordionPreviewText} numberOfLines={1}>
                  {objet.substring(0, 20)}{objet.length > 20 ? '...' : ''}
                </Text>
              )}
              <ChevronRight
                size={18}
                color={Colors.light.textMuted}
                style={{
                  transform: [{ rotate: objetExpanded ? '90deg' : '0deg' }],
                }}
              />
            </TouchableOpacity>

            {objetExpanded && (
              <View style={styles.accordionContent}>
                <TextInput
                  style={styles.accordionInput}
                  value={objet}
                  onChangeText={setObjet}
                  placeholder="Objet du document..."
                  placeholderTextColor={Colors.light.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Client</Text>
              <TouchableOpacity
                style={styles.quickAddButton}
                onPress={() => setShowClientFormModal(true)}
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
                  style={styles.aiCameraButton}
                  onPress={handleAddCustomLine}
                >
                  <Sparkles size={16} color="#8B5CF6" />
                  <Text style={styles.aiCameraText}>+ Ligne IA</Text>
                </TouchableOpacity>
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
                  const parsedItem = parsedLineItems[index];
                  const lineTotal = calculateLineTotal(parsedItem);
                  return (
                    <View key={item.key} style={styles.lineItem}>
                      <View style={styles.lineHeader}>
                        <View style={styles.lineHeaderLeft}>
                          <Text style={styles.lineNumber}>#{index + 1}</Text>
                          <View>
                            <TouchableOpacity
                              onPress={() => {
                                if (activeTooltip?.lineKey === item.key && activeTooltip?.type === 'photo') {
                                  setActiveTooltip(null);
                                } else {
                                  setActiveTooltip({ lineKey: item.key, type: 'photo' });
                                }
                              }}
                              style={styles.tooltipTrigger}
                            >
                              <PhotoThumbnailPicker
                                imageUri={item.image_url || null}
                                onImageSelected={(uri) => {
                                  handleLineImageSelected(item.key, uri);
                                  setActiveTooltip(null);
                                }}
                                onImageRemoved={() => handleLineImageRemoved(item.key)}
                              />
                            </TouchableOpacity>
                            {activeTooltip?.lineKey === item.key && activeTooltip?.type === 'photo' && (
                              <View style={styles.tooltipContainer}>
                                <View style={styles.tooltipArrow} />
                                <TouchableOpacity
                                  style={styles.tooltipBubble}
                                  activeOpacity={0.9}
                                  onPress={() => setActiveTooltip(null)}
                                >
                                  <Camera size={14} color="#FFFFFF" />
                                  <Text style={styles.tooltipText}>Prenez une photo du produit, elle sera affichée sur la ligne</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                        <View style={styles.lineHeaderActions}>
                          <View>
                            <TouchableOpacity
                              onPress={() => {
                                if (activeTooltip?.lineKey === item.key && activeTooltip?.type === 'ocr') {
                                  setActiveTooltip(null);
                                  handleOCRForLine(item.key);
                                } else {
                                  setActiveTooltip({ lineKey: item.key, type: 'ocr' });
                                }
                              }}
                              style={styles.lineOcrButton}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Sparkles size={16} color="#8B5CF6" />
                            </TouchableOpacity>
                            {activeTooltip?.lineKey === item.key && activeTooltip?.type === 'ocr' && (
                              <View style={[styles.tooltipContainer, styles.tooltipContainerRight]}>
                                <View style={[styles.tooltipArrow, styles.tooltipArrowRight]} />
                                <TouchableOpacity
                                  style={[styles.tooltipBubble, styles.tooltipBubbleAI]}
                                  activeOpacity={0.9}
                                  onPress={() => {
                                    setActiveTooltip(null);
                                    handleOCRForLine(item.key);
                                  }}
                                >
                                  <Sparkles size={14} color="#FFFFFF" />
                                  <Text style={styles.tooltipText}>Photographiez un texte pour le retranscrire dans la description</Text>
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                          <TouchableOpacity
                            onPress={() => handleRemoveLine(item.key)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <Trash2 size={18} color={Colors.light.error} />
                          </TouchableOpacity>
                        </View>
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

                      <TouchableOpacity
                        style={styles.discountAccordionHeader}
                        onPress={() => toggleLineDiscount(item.key)}
                      >
                        <View style={styles.discountAccordionLeft}>
                          <View style={[
                            styles.discountAccordionIcon,
                            expandedLineDiscounts.has(item.key) && styles.discountAccordionIconExpanded,
                          ]}>
                            <Plus size={12} color={Colors.light.tint} />
                          </View>
                          <Text style={styles.discountAccordionTitle}>Remise</Text>
                        </View>
                        {parseDecimalValue(item.discount_value) > 0 && (
                          <Text style={styles.discountAccordionValue}>
                            -{item.discount_value}{item.discount_type === 'percent' ? '%' : '€'}
                          </Text>
                        )}
                        <ChevronRight
                          size={16}
                          color={Colors.light.textMuted}
                          style={{
                            transform: [{ rotate: expandedLineDiscounts.has(item.key) ? '90deg' : '0deg' }],
                          }}
                        />
                      </TouchableOpacity>

                      {expandedLineDiscounts.has(item.key) && (
                        <View style={styles.discountAccordionContent}>
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
                            value={item.discount_value}
                            onChangeText={(text) => handleUpdateLine(item.key, 'discount_value', normalizeDecimalInput(text))}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.light.textMuted}
                          />
                        </View>
                      )}
                      
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

          <View style={styles.section}>
            <SplitBillingSection
              enabled={splitEnabled}
              onEnabledChange={setSplitEnabled}
              splits={splits}
              onSplitsChange={setSplits}
              clients={clients}
              lineItems={lineItems.map(item => ({
                key: item.key,
                label: item.label,
                description: item.description,
                quantity: parseDecimalValue(item.quantity),
                unit_price: parseDecimalValue(item.unit_price),
                tva_rate: parseDecimalValue(item.tva_rate),
                discount_type: item.discount_type,
                discount_value: parseDecimalValue(item.discount_value),
              }))}
              masterTotalHt={totals.totalHt}
              masterTotalTva={totals.totalTva}
              masterTotalTtc={totals.totalTtc}
              autoLiquidation={autoLiquidation}
            />
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

          {documentType === 'facture' && (
            <View style={styles.section}>
              <View style={styles.einvoiceCard}>
                <View style={styles.einvoiceHeader}>
                  <View style={styles.einvoiceIconContainer}>
                    <FileCheck size={20} color="#8B5CF6" strokeWidth={2} />
                  </View>
                  <View style={styles.einvoiceInfo}>
                    <Text style={styles.einvoiceTitle}>Facture électronique</Text>
                    <Text style={styles.einvoiceDesc}>
                      {isEInvoice ? 'Format Factur-X conforme e-facturation' : 'Facture classique (PDF standard)'}
                    </Text>
                  </View>
                  <Switch
                    value={isEInvoice}
                    onValueChange={setIsEInvoice}
                    trackColor={{ false: Colors.light.borderLight, true: '#8B5CF6' }}
                    thumbColor="#fff"
                  />
                </View>
                {isEInvoice && (
                  <View style={styles.einvoiceNotice}>
                    <Info size={14} color="#8B5CF6" />
                    <Text style={styles.einvoiceNoticeText}>
                      {einvoiceSettings?.pdpProvider 
                        ? 'PDP connectée - la facture sera transmise automatiquement'
                        : 'Mode préparation - facture prête pour transmission PDP (2026)'}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => setNotesExpanded(!notesExpanded)}
            >
              <View style={styles.discountAccordionLeft}>
                <View style={[
                  styles.globalDiscountAccordionIcon,
                  notesExpanded && styles.discountAccordionIconExpanded,
                ]}>
                  <Plus size={14} color={Colors.light.tint} />
                </View>
                <Text style={styles.globalDiscountAccordionTitle}>Durée des travaux prévisionnelle</Text>
              </View>
              {notes.trim() && (
                <Text style={styles.accordionPreviewText} numberOfLines={1}>
                  {notes.substring(0, 20)}{notes.length > 20 ? '...' : ''}
                </Text>
              )}
              <ChevronRight
                size={18}
                color={Colors.light.textMuted}
                style={{
                  transform: [{ rotate: notesExpanded ? '90deg' : '0deg' }],
                }}
              />
            </TouchableOpacity>

            {notesExpanded && (
              <View style={styles.accordionContent}>
                <TextInput
                  style={styles.accordionInput}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="Durée estimée des travaux..."
                  placeholderTextColor={Colors.light.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.globalDiscountAccordionHeader}
              onPress={() => setGlobalDiscountExpanded(!globalDiscountExpanded)}
            >
              <View style={styles.discountAccordionLeft}>
                <View style={[
                  styles.globalDiscountAccordionIcon,
                  globalDiscountExpanded && styles.discountAccordionIconExpanded,
                ]}>
                  <Plus size={14} color={Colors.light.tint} />
                </View>
                <Text style={styles.globalDiscountAccordionTitle}>Remise globale</Text>
              </View>
              {globalDiscountValue > 0 && (
                <Text style={styles.globalDiscountAccordionValue}>
                  -{globalDiscountValueStr}{globalDiscountType === 'percent' ? '%' : '€'}
                </Text>
              )}
              <ChevronRight
                size={18}
                color={Colors.light.textMuted}
                style={{
                  transform: [{ rotate: globalDiscountExpanded ? '90deg' : '0deg' }],
                }}
              />
            </TouchableOpacity>

            {globalDiscountExpanded && (
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
                  value={globalDiscountValueStr}
                  onChangeText={(text) => setGlobalDiscountValueStr(normalizeDecimalInput(text))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.light.textMuted}
                />
              </View>
            )}
          </View>

          <View style={styles.section}>
            <TouchableOpacity
              style={styles.accordionHeader}
              onPress={() => setConditionsExpanded(!conditionsExpanded)}
            >
              <View style={styles.discountAccordionLeft}>
                <View style={[
                  styles.globalDiscountAccordionIcon,
                  conditionsExpanded && styles.discountAccordionIconExpanded,
                ]}>
                  <Plus size={14} color={Colors.light.tint} />
                </View>
                <Text style={styles.globalDiscountAccordionTitle}>Conditions particulières</Text>
              </View>
              {conditions.trim() && (
                <Text style={styles.accordionPreviewText} numberOfLines={1}>
                  {conditions.substring(0, 20)}{conditions.length > 20 ? '...' : ''}
                </Text>
              )}
              <ChevronRight
                size={18}
                color={Colors.light.textMuted}
                style={{
                  transform: [{ rotate: conditionsExpanded ? '90deg' : '0deg' }],
                }}
              />
            </TouchableOpacity>

            {conditionsExpanded && (
              <View style={styles.accordionContent}>
                <TextInput
                  style={styles.accordionInput}
                  value={conditions}
                  onChangeText={setConditions}
                  placeholder="Conditions de paiement, validité..."
                  placeholderTextColor={Colors.light.textMuted}
                  multiline
                  numberOfLines={3}
                />
              </View>
            )}
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
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        visible={showClientFormModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowClientFormModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowClientFormModal(false)}>
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Nouveau client</Text>
            <View style={{ width: 24 }} />
          </View>
          <ClientForm
            onSubmit={handleClientFormSubmit}
            onCancel={() => setShowClientFormModal(false)}
            isLoading={isCreatingClient}
            submitLabel="Créer"
          />
        </View>
      </Modal>

      <SplitSummaryModal
        visible={showSplitSummary}
        onClose={() => setShowSplitSummary(false)}
        onConfirm={() => {
          setShowSplitSummary(false);
          createDoc();
        }}
        splits={splits}
        lineItems={lineItems.map(item => ({
          key: item.key,
          label: item.label,
          description: item.description,
          quantity: parseDecimalValue(item.quantity),
          unit_price: parseDecimalValue(item.unit_price),
        }))}
        masterNumber={documentNumber}
        masterTotalHt={totals.totalHt}
        masterTotalTva={totals.totalTva}
        masterTotalTtc={totals.totalTtc}
        isCreating={isCreating}
      />

      <OCRCamera
        visible={showOCRCamera}
        onClose={() => {
          setShowOCRCamera(false);
          setOcrTargetLineKey(null);
        }}
        onTextExtracted={handleOCRTextExtracted}
        title="Scanner avec IA"
      />
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
  aiCameraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#8B5CF615',
    borderRadius: 8,
  },
  aiCameraText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: '#8B5CF6',
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
  lineHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  lineOcrButton: {
    padding: 4,
  },
  tooltipTrigger: {
    position: 'relative' as const,
  },
  tooltipContainer: {
    position: 'absolute' as const,
    top: '100%' as unknown as number,
    left: 0,
    marginTop: 6,
    zIndex: 1000,
    width: 220,
  },
  tooltipContainerRight: {
    left: undefined as unknown as number,
    right: 0,
  },
  tooltipArrow: {
    position: 'absolute' as const,
    top: -5,
    left: 12,
    width: 10,
    height: 10,
    backgroundColor: '#1F2937',
    transform: [{ rotate: '45deg' }],
    zIndex: 999,
  },
  tooltipArrowRight: {
    left: undefined as unknown as number,
    right: 12,
  },
  tooltipBubble: {
    backgroundColor: '#1F2937',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  tooltipBubbleAI: {
    backgroundColor: '#6D28D9',
  },
  tooltipText: {
    fontSize: 12,
    color: '#FFFFFF',
    flex: 1,
    lineHeight: 16,
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
  discountAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 10,
  },
  discountAccordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  discountAccordionIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discountAccordionIconExpanded: {
    backgroundColor: Colors.light.tint + '25',
  },
  discountAccordionTitle: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  discountAccordionValue: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.error,
    marginRight: 8,
  },
  discountAccordionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
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
  globalDiscountAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  globalDiscountAccordionIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globalDiscountAccordionTitle: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  globalDiscountAccordionValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.error,
    marginRight: 8,
  },
  globalDiscountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
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
  einvoiceCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#8B5CF620',
  },
  einvoiceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  einvoiceIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#8B5CF615',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  einvoiceInfo: {
    flex: 1,
  },
  einvoiceTitle: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  einvoiceDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  einvoiceNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8B5CF610',
    padding: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#8B5CF620',
  },
  einvoiceNoticeText: {
    flex: 1,
    fontSize: 12,
    color: '#8B5CF6',
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
  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  accordionContent: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    marginTop: -12,
  },
  accordionInput: {
    backgroundColor: Colors.light.background,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: Colors.light.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  accordionPreviewText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginRight: 8,
    maxWidth: 100,
  },
  totalsSection: {
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
  
});
