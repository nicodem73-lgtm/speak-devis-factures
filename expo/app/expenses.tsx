import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Camera,
  Image as ImageIcon,
  X,
  Calendar,
  Euro,
  UtensilsCrossed,
  Fuel,
  Package,
  Home,
  Route,
  ParkingCircle,
  Shield,
  Wrench,
  Car,
  Wifi,
  Smartphone,
  Store,
  GraduationCap,
  MoreHorizontal,
  Trash2,
  Check,
  FileDown,
  Share2,
  Mail,
  Repeat,
  Archive,
  CheckCircle,
} from 'lucide-react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Expense, ExpenseFormData, ExpenseCategory, EXPENSE_CATEGORIES, ExpenseTotals } from '@/types/expense';
import { createExpense, updateExpense, deleteExpense, getExpensesByFilter, getExpenseTotals, archiveExpensesByMonth } from '@/db/expenses';
import { getCompanyInfo, CompanyInfo } from '@/db/settings';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getActiveDatabase } from '@/db/multiYearDatabase';
import { generateObject } from '@rork-ai/toolkit-sdk';
import { z } from 'zod';
import Colors from '@/constants/colors';

let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

const DatePickerModal: React.FC<{
  value: Date;
  onClose: () => void;
  onChange: (date: Date) => void;
}> = ({ value, onClose, onChange }) => {
  if (Platform.OS === 'web' || !DateTimePicker) return null;
  return (
    <DateTimePicker
      value={value}
      mode="date"
      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
      onChange={(_event: unknown, date?: Date) => {
        if (Platform.OS !== 'ios') onClose();
        if (date) onChange(date);
      }}
    />
  );
};

const WebDatePickerModal: React.FC<{
  value: string;
  onClose: () => void;
  onChange: (date: string) => void;
}> = ({ value, onClose, onChange }) => {
  const [tempDate, setTempDate] = useState(value);
  
  return (
    <Modal
      visible={true}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={webDatePickerStyles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={webDatePickerStyles.container}>
          <Text style={webDatePickerStyles.title}>Sélectionner une date</Text>
          <TextInput
            style={webDatePickerStyles.input}
            value={tempDate}
            onChangeText={setTempDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={Colors.light.textMuted}
          />
          <View style={webDatePickerStyles.buttons}>
            <TouchableOpacity style={webDatePickerStyles.button} onPress={onClose}>
              <Text style={webDatePickerStyles.buttonTextCancel}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[webDatePickerStyles.button, webDatePickerStyles.buttonConfirm]} 
              onPress={() => {
                onChange(tempDate);
                onClose();
              }}
            >
              <Text style={webDatePickerStyles.buttonTextConfirm}>Confirmer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const webDatePickerStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    width: 300,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  input: {
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
    marginBottom: 16,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  buttonConfirm: {
    backgroundColor: Colors.light.tint,
  },
  buttonTextCancel: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  buttonTextConfirm: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

const normalizeAndFormatDate = (input: string): string => {
  if (!input) return '';
  
  // Remove all spaces
  let cleaned = input.replace(/\s/g, '');
  
  let day = '';
  let month = '';
  let year = '';
  
  // Check if it's already ISO format (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    const parts = cleaned.split('-');
    year = parts[0];
    month = parts[1];
    day = parts[2];
  }
  // Format with separators: DD-MM-YYYY or DD/MM/YYYY
  else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(cleaned)) {
    const parts = cleaned.split(/[-/]/);
    day = parts[0].padStart(2, '0');
    month = parts[1].padStart(2, '0');
    year = parts[2];
    if (year.length === 2) {
      year = '20' + year;
    }
  }
  // Format without separators: DDMMYYYY or DDMMYY
  else if (/^\d{6,8}$/.test(cleaned)) {
    if (cleaned.length === 8) {
      day = cleaned.substring(0, 2);
      month = cleaned.substring(2, 4);
      year = cleaned.substring(4, 8);
    } else if (cleaned.length === 6) {
      day = cleaned.substring(0, 2);
      month = cleaned.substring(2, 4);
      year = '20' + cleaned.substring(4, 6);
    } else {
      return cleaned;
    }
  } else {
    return cleaned;
  }
  
  // Validate day and month
  const dayNum = parseInt(day, 10);
  const monthNum = parseInt(month, 10);
  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
    return cleaned;
  }
  
  return `${day}/${month}/${year}`;
};

const formatDateToFrench = (isoDate: string): string => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return normalizeAndFormatDate(isoDate);
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const parseFrenchDateToISO = (frenchDate: string): string => {
  if (!frenchDate) return '';
  
  // First normalize the input
  const normalized = normalizeAndFormatDate(frenchDate);
  
  // If normalization returned a valid DD/MM/YYYY format
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    const parts = normalized.split('/');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  
  // Fallback for dates already with - separator
  if (/^\d{2}-\d{2}-\d{4}$/.test(frenchDate)) {
    const parts = frenchDate.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  
  return frenchDate;
};

const getTodayFrench = (): string => {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, '0');
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const year = today.getFullYear();
  return `${day}/${month}/${year}`;
};

const getTodayISO = (): string => {
  return new Date().toISOString().split('T')[0];
};

const CategoryIcon: React.FC<{ category: ExpenseCategory; size?: number; color?: string }> = ({ 
  category, 
  size = 20, 
  color 
}) => {
  const categoryInfo = EXPENSE_CATEGORIES.find(c => c.id === category);
  const iconColor = color || categoryInfo?.color || Colors.light.textSecondary;
  
  const iconProps = { size, color: iconColor };
  
  switch (category) {
    case 'restaurant': return <UtensilsCrossed {...iconProps} />;
    case 'carburant': return <Fuel {...iconProps} />;
    case 'fourniture': return <Package {...iconProps} />;
    case 'loyer': return <Home {...iconProps} />;
    case 'peages': return <Route {...iconProps} />;
    case 'parkings': return <ParkingCircle {...iconProps} />;
    case 'assurance': return <Shield {...iconProps} />;
    case 'entretien': return <Wrench {...iconProps} />;
    case 'deplacement': return <Car {...iconProps} />;
    case 'internet': return <Wifi {...iconProps} />;
    case 'mobile': return <Smartphone {...iconProps} />;
    case 'foire': return <Store {...iconProps} />;
    case 'formations': return <GraduationCap {...iconProps} />;
    default: return <MoreHorizontal {...iconProps} />;
  }
};

export default function ExpensesScreen() {
  const { db, isReady } = useDatabase();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totals, setTotals] = useState<ExpenseTotals>({ totalTTC: 0, totalTVA: 0 });
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterMode, setFilterMode] = useState<'month' | 'custom'>('month');
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  
  const [formData, setFormData] = useState<ExpenseFormData>({
    establishment: '',
    amount_ttc: 0,
    amount_tva: 0,
    tva_rate: 20,
    date: getTodayISO(),
    category: 'divers',
    photo_uri: undefined,
    notes: '',
    is_recurring: false,
    recurring_start_date: undefined,
    recurring_end_date: undefined,
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [ttcInputValue, setTtcInputValue] = useState('');
  const [tvaRateInputValue, setTvaRateInputValue] = useState('20');
  const [dateInputValue, setDateInputValue] = useState(getTodayFrench());
  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [recurringStartInputValue, setRecurringStartInputValue] = useState('');
  const [recurringEndInputValue, setRecurringEndInputValue] = useState('');
  const [archiving, setArchiving] = useState(false);

  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getFilterDates = useCallback(() => {
    if (filterMode === 'custom' && customStartDate && customEndDate) {
      return {
        startDate: formatLocalDate(customStartDate),
        endDate: formatLocalDate(customEndDate),
      };
    }
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const startDate = new Date(year, month, 1);
    const today = new Date();
    const endDate = new Date(year, month + 1, 0);
    
    if (year === today.getFullYear() && month === today.getMonth()) {
      return {
        startDate: formatLocalDate(startDate),
        endDate: formatLocalDate(today),
      };
    }
    
    return {
      startDate: formatLocalDate(startDate),
      endDate: formatLocalDate(endDate),
    };
  }, [currentDate, filterMode, customStartDate, customEndDate]);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const filter = getFilterDates();
      console.log('[Expenses] Loading with filter:', filter);
      const [expensesData, totalsData] = await Promise.all([
        getExpensesByFilter(filter),
        getExpenseTotals(filter),
      ]);
      setExpenses(expensesData);
      setTotals(totalsData);
    } catch (error) {
      console.error('[Expenses] Error loading:', error);
    } finally {
      setLoading(false);
    }
  }, [getFilterDates]);

  useEffect(() => {
    loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    const loadCompanyInfo = async () => {
      if (isReady) {
        try {
          const activeDb = await getActiveDatabase();
          const info = await getCompanyInfo(activeDb);
          setCompanyInfo(info);
        } catch (error) {
          console.error('[Expenses] Error loading company info:', error);
        }
      }
    };
    loadCompanyInfo();
  }, [isReady]);

  const goToPreviousMonth = () => {
    setFilterMode('month');
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setFilterMode('month');
    const today = new Date();
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    if (nextMonth <= today) {
      setCurrentDate(nextMonth);
    }
  };

  const resetForm = () => {
    setFormData({
      establishment: '',
      amount_ttc: 0,
      amount_tva: 0,
      tva_rate: 20,
      date: getTodayISO(),
      category: 'divers',
      photo_uri: undefined,
      notes: '',
      is_recurring: false,
      recurring_start_date: undefined,
      recurring_end_date: undefined,
    });
    setTtcInputValue('');
    setTvaRateInputValue('20');
    setDateInputValue(getTodayFrench());
    setRecurringStartInputValue('');
    setRecurringEndInputValue('');
    setEditingExpense(null);
  };

  const openAddModal = () => {
    resetForm();
    setShowAddModal(true);
  };

  const openEditModal = (expense: Expense) => {
    setEditingExpense(expense);
    setFormData({
      establishment: expense.establishment,
      amount_ttc: expense.amount_ttc,
      amount_tva: expense.amount_tva,
      tva_rate: expense.tva_rate,
      date: expense.date,
      category: expense.category,
      photo_uri: expense.photo_uri,
      notes: expense.notes || '',
      is_recurring: expense.is_recurring === 1,
      recurring_start_date: expense.recurring_start_date,
      recurring_end_date: expense.recurring_end_date,
    });
    setTtcInputValue(expense.amount_ttc > 0 ? String(expense.amount_ttc).replace('.', ',') : '');
    setTvaRateInputValue(String(expense.tva_rate));
    setDateInputValue(formatDateToFrench(expense.date));
    setRecurringStartInputValue(expense.recurring_start_date ? formatDateToFrench(expense.recurring_start_date) : '');
    setRecurringEndInputValue(expense.recurring_end_date ? formatDateToFrench(expense.recurring_end_date) : '');
    setShowAddModal(true);
  };

  const analyzeReceiptWithAI = async (imageUri: string) => {
    setAnalyzing(true);
    try {
      let base64Image: string;
      
      if (Platform.OS === 'web') {
        base64Image = imageUri;
      } else {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: 'base64',
        });
        base64Image = `data:image/jpeg;base64,${base64}`;
      }

      console.log('[Expenses] Starting AI analysis, image size:', Math.round(base64Image.length / 1024), 'KB');

      let result;
      try {
        result = await generateObject({
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: `Tu es un expert en extraction de données de tickets de caisse et factures français. Analyse attentivement cette image.

RECHERCHE EN PRIORITÉ :
1. NOM DE L'ÉTABLISSEMENT : Cherche en haut du ticket le nom du commerce, restaurant, station-service, magasin. Peut être en majuscules ou avec un logo.

2. MONTANT TOTAL TTC : C'est le montant final à payer. Cherche les mots : "TOTAL", "A PAYER", "TOTAL TTC", "NET A PAYER", "MONTANT DU". C'est généralement le plus gros montant en bas du ticket.

3. TVA : Cherche "TVA", "T.V.A.", les taux (5.5%, 10%, 20%). Si plusieurs taux, additionne les montants de TVA. Si non visible, calcule : TVA = TTC - (TTC / 1.20) pour 20%.

4. DATE : Cherche format JJ/MM/AAAA, JJ-MM-AAAA, ou JJ.MM.AAAA. Souvent en haut ou en bas du ticket près de l'heure.

5. CATÉGORIE : Détermine selon le type de commerce :
   - Restaurant/café/boulangerie → restaurant
   - Station essence (Total, Shell, BP, Carrefour Market fuel) → carburant
   - Bureau Vallée, fournitures → fourniture
   - Autoroute (SANEF, APRR, ASF, Vinci) → peages
   - Parking, stationnement → parkings
   - Garage, Norauto, Feu Vert → entretien
   - SNCF, taxi, Uber, location voiture → deplacement
   - Orange, SFR, Bouygues, Free (internet) → internet
   - Orange, SFR, Bouygues, Free (mobile) → mobile
   - Autre → divers

Si une information est illisible ou absente, fais une estimation raisonnable. Utilise 20% comme taux de TVA par défaut.` },
                { type: 'image', image: base64Image },
              ],
            },
          ],
          schema: z.object({
            establishment: z.string().describe('Nom de l\'établissement ou commerce'),
            amount_ttc: z.number().describe('Montant total TTC en euros'),
            amount_tva: z.number().describe('Montant de la TVA en euros'),
            tva_rate: z.number().describe('Taux de TVA principal en pourcentage (5.5, 10 ou 20)'),
            date: z.string().describe('Date au format YYYY-MM-DD'),
            category: z.enum(['restaurant', 'carburant', 'fourniture', 'loyer', 'peages', 'parkings', 'assurance', 'entretien', 'deplacement', 'internet', 'mobile', 'foire', 'formations', 'divers']).describe('Catégorie de dépense'),
          }),
        });
      } catch (apiError) {
        console.error('[Expenses] AI API error:', apiError);
        throw new Error('API_ERROR');
      }

      console.log('[Expenses] AI analysis result:', result);
      
      if (!result || typeof result !== 'object') {
        console.error('[Expenses] Invalid AI response:', result);
        throw new Error('INVALID_RESPONSE');
      }

      const newTtc = typeof result.amount_ttc === 'number' ? result.amount_ttc : formData.amount_ttc;
      const newTvaRate = typeof result.tva_rate === 'number' ? result.tva_rate : formData.tva_rate;
      const newDate = typeof result.date === 'string' && result.date ? result.date : formData.date;
      const newEstablishment = typeof result.establishment === 'string' ? result.establishment : formData.establishment;
      const newTva = typeof result.amount_tva === 'number' ? result.amount_tva : formData.amount_tva;
      const newCategory = result.category || formData.category;

      setTtcInputValue(newTtc > 0 ? String(newTtc).replace('.', ',') : '');
      setTvaRateInputValue(String(newTvaRate));
      setDateInputValue(formatDateToFrench(newDate));
      setFormData(prev => ({
        ...prev,
        establishment: newEstablishment,
        amount_ttc: newTtc,
        amount_tva: newTva,
        tva_rate: newTvaRate,
        date: newDate,
        category: newCategory,
        photo_uri: imageUri,
      }));
    } catch (error) {
      console.error('[Expenses] AI analysis error:', error);
      Alert.alert('Erreur', 'Impossible d\'analyser le ticket. Veuillez saisir les informations manuellement.');
      setFormData(prev => ({ ...prev, photo_uri: imageUri }));
    } finally {
      setAnalyzing(false);
    }
  };

  const pickImage = async (useCamera: boolean) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert('Permission requise', 'Veuillez autoriser l\'accès à la caméra ou à la galerie.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1.0,
            allowsEditing: true,
            aspect: [3, 4],
            base64: Platform.OS === 'web',
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 1.0,
            allowsEditing: true,
            aspect: [3, 4],
            base64: Platform.OS === 'web',
          });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const imageUri = Platform.OS === 'web' && asset.base64 
          ? `data:image/jpeg;base64,${asset.base64}`
          : asset.uri;
        
        console.log('[Expenses] Image captured, dimensions:', asset.width, 'x', asset.height);
        await analyzeReceiptWithAI(imageUri);
      }
    } catch (error) {
      console.error('[Expenses] Image picker error:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image.');
    }
  };

  const calculateTVA = (ttc: number, rate: number): number => {
    return ttc - (ttc / (1 + rate / 100));
  };

  const handleTTCChange = (value: string) => {
    setTtcInputValue(value);
    const normalizedValue = value.replace(',', '.');
    const ttc = parseFloat(normalizedValue) || 0;
    const tva = calculateTVA(ttc, formData.tva_rate);
    setFormData(prev => ({ ...prev, amount_ttc: ttc, amount_tva: Math.round(tva * 100) / 100 }));
  };

  const handleTVARateChange = (value: string) => {
    setTvaRateInputValue(value);
    const normalizedValue = value.replace(',', '.');
    const rate = parseFloat(normalizedValue) || 0;
    const tva = calculateTVA(formData.amount_ttc, rate);
    setFormData(prev => ({ ...prev, tva_rate: rate, amount_tva: Math.round(tva * 100) / 100 }));
  };

  const handleDateChange = (value: string) => {
    setDateInputValue(value);
  };

  const handleDateBlur = () => {
    if (dateInputValue) {
      const normalized = normalizeAndFormatDate(dateInputValue);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
        setDateInputValue(normalized);
        const isoDate = parseFrenchDateToISO(normalized);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          setFormData(prev => ({ ...prev, date: isoDate }));
        }
      }
    }
  };

  const handleRecurringStartChange = (value: string) => {
    setRecurringStartInputValue(value);
  };

  const handleRecurringStartBlur = () => {
    if (recurringStartInputValue) {
      const normalized = normalizeAndFormatDate(recurringStartInputValue);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
        setRecurringStartInputValue(normalized);
        const isoDate = parseFrenchDateToISO(normalized);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          setFormData(prev => ({ ...prev, recurring_start_date: isoDate }));
        }
      }
    }
  };

  const handleRecurringEndChange = (value: string) => {
    setRecurringEndInputValue(value);
  };

  const handleRecurringEndBlur = () => {
    if (recurringEndInputValue) {
      const normalized = normalizeAndFormatDate(recurringEndInputValue);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
        setRecurringEndInputValue(normalized);
        const isoDate = parseFrenchDateToISO(normalized);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          setFormData(prev => ({ ...prev, recurring_end_date: isoDate }));
        }
      }
    }
  };

  const saveExpense = async () => {
    if (!formData.establishment.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir le nom de l\'établissement.');
      return;
    }
    if (formData.amount_ttc <= 0) {
      Alert.alert('Erreur', 'Veuillez saisir un montant TTC valide.');
      return;
    }

    // Convertir la date principale si nécessaire
    let finalDate = formData.date;
    if (dateInputValue) {
      const normalizedDate = normalizeAndFormatDate(dateInputValue);
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedDate)) {
        const isoDate = parseFrenchDateToISO(normalizedDate);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
          finalDate = isoDate;
        }
      }
    }

    // Convertir les dates récurrentes depuis les inputs (au cas où onBlur n'a pas été déclenché)
    let finalRecurringStart = formData.recurring_start_date;
    let finalRecurringEnd = formData.recurring_end_date;
    
    if (formData.is_recurring) {
      if (recurringStartInputValue) {
        const normalizedStart = normalizeAndFormatDate(recurringStartInputValue);
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedStart)) {
          const isoStart = parseFrenchDateToISO(normalizedStart);
          if (/^\d{4}-\d{2}-\d{2}$/.test(isoStart)) {
            finalRecurringStart = isoStart;
          }
        }
      }
      
      if (recurringEndInputValue) {
        const normalizedEnd = normalizeAndFormatDate(recurringEndInputValue);
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedEnd)) {
          const isoEnd = parseFrenchDateToISO(normalizedEnd);
          if (/^\d{4}-\d{2}-\d{2}$/.test(isoEnd)) {
            finalRecurringEnd = isoEnd;
          }
        }
      }
      
      console.log('[Expenses] Recurring dates - start:', finalRecurringStart, 'end:', finalRecurringEnd);
      
      if (!finalRecurringStart || !finalRecurringEnd) {
        Alert.alert('Erreur', 'Veuillez saisir les dates de début et de fin pour la récurrence.');
        return;
      }
      if (new Date(finalRecurringStart) >= new Date(finalRecurringEnd)) {
        Alert.alert('Erreur', 'La date de fin doit être postérieure à la date de début.');
        return;
      }
    }

    try {
      const dataToSave: ExpenseFormData = {
        ...formData,
        date: finalDate,
        recurring_start_date: formData.is_recurring ? finalRecurringStart : undefined,
        recurring_end_date: formData.is_recurring ? finalRecurringEnd : undefined,
      };
      
      console.log('[Expenses] Saving expense:', dataToSave);
      
      if (editingExpense) {
        await updateExpense(editingExpense.id, dataToSave);
      } else {
        await createExpense(dataToSave);
      }
      setShowAddModal(false);
      resetForm();
      loadExpenses();
    } catch (error) {
      console.error('[Expenses] Save error:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder la dépense.');
    }
  };

  const convertImageToBase64 = async (uri: string): Promise<string | null> => {
    try {
      console.log('[Expenses] Converting image to base64:', uri.substring(0, 50) + '...');
      
      if (uri.startsWith('data:image')) {
        console.log('[Expenses] Image already in base64 format');
        return uri;
      }
      
      if (Platform.OS === 'web') {
        // On web, try to fetch the image and convert to base64
        try {
          const response = await fetch(uri);
          const blob = await response.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = reader.result as string;
              console.log('[Expenses] Web image converted successfully');
              resolve(result);
            };
            reader.onerror = () => {
              console.error('[Expenses] FileReader error');
              resolve(null);
            };
            reader.readAsDataURL(blob);
          });
        } catch (webError) {
          console.error('[Expenses] Web image conversion error:', webError);
          return null;
        }
      }
      
      // Check if file exists before reading
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists) {
        console.error('[Expenses] Image file does not exist:', uri);
        return null;
      }
      
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      
      // Determine image type from URI
      const extension = uri.toLowerCase().split('.').pop();
      let mimeType = 'image/jpeg';
      if (extension === 'png') mimeType = 'image/png';
      else if (extension === 'gif') mimeType = 'image/gif';
      else if (extension === 'webp') mimeType = 'image/webp';
      
      console.log('[Expenses] Native image converted successfully, mime:', mimeType);
      return `data:${mimeType};base64,${base64}`;
    } catch (error) {
      console.error('[Expenses] Error converting image to base64:', error);
      return null;
    }
  };

  const generateExpensesPDF = async (): Promise<string> => {
    const periodLabel = getMonthLabel();
    
    let loadedCompanyInfo: CompanyInfo | null = null;
    if (db) {
      try {
        loadedCompanyInfo = await getCompanyInfo(db);
        console.log('[Expenses] PDF - Company info loaded:', JSON.stringify(loadedCompanyInfo));
      } catch (error) {
        console.error('[Expenses] PDF - Error loading company info:', error);
      }
    }
    
    const effectiveCompanyInfo = loadedCompanyInfo || companyInfo;
    const companyName = effectiveCompanyInfo?.name?.trim() || '';
    const companyAddressFull = [
      effectiveCompanyInfo?.address?.trim(),
      [effectiveCompanyInfo?.postalCode?.trim(), effectiveCompanyInfo?.city?.trim()].filter(Boolean).join(' ')
    ].filter(Boolean).join(', ');
    const companySiret = effectiveCompanyInfo?.siret?.trim() || '';
    const companyPhone = effectiveCompanyInfo?.phone?.trim() || '';
    const companyEmail = effectiveCompanyInfo?.email?.trim() || '';
    const companyTva = effectiveCompanyInfo?.tvaNumber?.trim() || '';
    
    console.log('[Expenses] PDF Company:', { companyName, companyAddressFull, companySiret });
    
    const categoryTotals: Record<string, { count: number; totalTTC: number; totalTVA: number }> = {};
    expenses.forEach(expense => {
      if (!categoryTotals[expense.category]) {
        categoryTotals[expense.category] = { count: 0, totalTTC: 0, totalTVA: 0 };
      }
      categoryTotals[expense.category].count++;
      categoryTotals[expense.category].totalTTC += expense.amount_ttc;
      categoryTotals[expense.category].totalTVA += expense.amount_tva;
    });

    const categoryRows = Object.entries(categoryTotals)
      .sort((a, b) => b[1].totalTTC - a[1].totalTTC)
      .map(([catId, data]) => {
        const catInfo = EXPENSE_CATEGORIES.find(c => c.id === catId);
        return `<tr><td style="padding:8px;border:1px solid #ddd;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${catInfo?.color || '#78716C'};margin-right:6px;"></span>${catInfo?.label || 'Divers'}</td><td style="padding:8px;border:1px solid #ddd;text-align:center;">${data.count}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(data.totalTTC)}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(data.totalTVA)}</td></tr>`;
      }).join('');

    const expenseRows = expenses.map((expense, index) => {
      const catInfo = EXPENSE_CATEGORIES.find(c => c.id === expense.category);
      return `<tr style="background:${index % 2 === 0 ? '#f9f9f9' : '#fff'};"><td style="padding:8px;border:1px solid #ddd;"><b>${expense.establishment}</b><br/><small style="color:#666;">${catInfo?.label || 'Divers'}${expense.notes ? ' - ' + expense.notes : ''}</small></td><td style="padding:8px;border:1px solid #ddd;text-align:center;">${formatDate(expense.date)}</td><td style="padding:8px;border:1px solid #ddd;text-align:right;"><b>${formatCurrency(expense.amount_ttc)}</b></td><td style="padding:8px;border:1px solid #ddd;text-align:right;">${formatCurrency(expense.amount_tva)}</td></tr>`;
    }).join('');

    const companyHeader = companyName 
      ? `<div style="background:#2563EB;color:white;padding:20px;margin:-20px -20px 20px -20px;">
          <div style="font-size:22px;font-weight:bold;">${companyName}</div>
          ${companyAddressFull ? `<div style="font-size:13px;margin-top:6px;opacity:0.9;">${companyAddressFull}</div>` : ''}
          ${companyPhone || companyEmail ? `<div style="font-size:12px;margin-top:4px;opacity:0.8;">${[companyPhone ? 'Tél: ' + companyPhone : '', companyEmail].filter(Boolean).join(' | ')}</div>` : ''}
          ${companySiret || companyTva ? `<div style="font-size:11px;margin-top:4px;opacity:0.7;">${[companySiret ? 'SIRET: ' + companySiret : '', companyTva ? 'TVA: ' + companyTva : ''].filter(Boolean).join(' | ')}</div>` : ''}
        </div>`
      : '';

    const expensesWithPhotos = expenses.filter(e => e.photo_uri);
    const photosBase64: { expense: Expense; base64: string }[] = [];
    
    if (expensesWithPhotos.length > 0) {
      console.log('[Expenses] Converting', expensesWithPhotos.length, 'photos to base64');
      
      for (const expense of expensesWithPhotos) {
        try {
          const base64 = await convertImageToBase64(expense.photo_uri!);
          if (base64) {
            photosBase64.push({ expense, base64 });
            console.log('[Expenses] Photo converted:', expense.establishment, Math.round(base64.length/1024) + 'KB');
          }
        } catch (e) {
          console.error('[Expenses] Photo conversion error:', expense.establishment, e);
        }
      }
    }

    let photosPage = '';
    if (photosBase64.length > 0) {
      const photoBlocks = photosBase64.map(({ expense, base64 }) => {
        const catInfo = EXPENSE_CATEGORIES.find(c => c.id === expense.category);
        return `
          <div style="page-break-inside:avoid;margin-bottom:30px;border:2px solid #e5e7eb;border-radius:12px;overflow:hidden;background:white;">
            <div style="background:#f3f4f6;padding:15px;border-bottom:1px solid #e5e7eb;">
              <table width="100%"><tr>
                <td><b style="font-size:16px;color:#111;">${expense.establishment}</b><br/><span style="font-size:12px;color:#666;">${catInfo?.label || 'Divers'} • ${formatDate(expense.date)}</span></td>
                <td style="text-align:right;"><b style="font-size:18px;color:#111;">${formatCurrency(expense.amount_ttc)}</b><br/><span style="font-size:11px;color:#666;">TVA: ${formatCurrency(expense.amount_tva)}</span></td>
              </tr></table>
            </div>
            <div style="padding:15px;text-align:center;background:#fafafa;">
              <img src="${base64}" style="max-width:100%;max-height:500px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
            </div>
          </div>
        `;
      }).join('');

      photosPage = `
        <div style="page-break-before:always;padding:20px;">
          ${companyName ? `<div style="background:#2563EB;color:white;padding:15px;margin:-20px -20px 20px -20px;"><b style="font-size:18px;">${companyName}</b>${companyAddressFull ? '<br/><span style="font-size:12px;opacity:0.9;">' + companyAddressFull + '</span>' : ''}</div>` : ''}
          <h2 style="text-align:center;color:#111;margin:0 0 8px 0;font-size:20px;">📎 Justificatifs des Dépenses</h2>
          <p style="text-align:center;color:#666;margin:0 0 25px 0;font-size:13px;">${photosBase64.length} justificatif${photosBase64.length > 1 ? 's' : ''} pour la période ${periodLabel}</p>
          ${photoBlocks}
          <p style="text-align:center;color:#999;font-size:10px;margin-top:30px;padding-top:15px;border-top:1px solid #e5e7eb;">Document généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      `;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#333;margin:0;padding:20px;background:#fff;">
  ${companyHeader}
  <h1 style="text-align:center;font-size:24px;color:#111;margin:0 0 8px 0;">Récapitulatif des Dépenses</h1>
  <p style="text-align:center;color:#666;margin:0 0 25px 0;font-size:14px;">${periodLabel}</p>
  
  <table width="100%" style="margin-bottom:25px;background:linear-gradient(135deg,#f5f7fa 0%,#e4e8ed 100%);border-radius:12px;border-collapse:collapse;">
    <tr>
      <td style="padding:20px;text-align:center;width:33%;"><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Total TTC</div><div style="font-size:24px;font-weight:bold;color:#111;margin-top:4px;">${formatCurrency(totals.totalTTC)}</div></td>
      <td style="padding:20px;text-align:center;width:33%;border-left:1px solid #ddd;border-right:1px solid #ddd;"><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Total TVA</div><div style="font-size:24px;font-weight:bold;color:#2563EB;margin-top:4px;">${formatCurrency(totals.totalTVA)}</div></td>
      <td style="padding:20px;text-align:center;width:33%;"><div style="font-size:11px;color:#666;text-transform:uppercase;letter-spacing:0.5px;">Dépenses</div><div style="font-size:24px;font-weight:bold;color:#111;margin-top:4px;">${expenses.length}</div></td>
    </tr>
  </table>

  <h3 style="font-size:14px;color:#111;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.5px;">Répartition par Catégorie</h3>
  <table width="100%" style="margin-bottom:30px;border-collapse:collapse;">
    <tr style="background:#2563EB;color:#fff;"><th style="padding:12px;text-align:left;border-radius:8px 0 0 0;">Catégorie</th><th style="padding:12px;text-align:center;">Qté</th><th style="padding:12px;text-align:right;">Total TTC</th><th style="padding:12px;text-align:right;border-radius:0 8px 0 0;">Total TVA</th></tr>
    ${categoryRows}
  </table>

  <h3 style="font-size:14px;color:#111;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.5px;">Liste des Dépenses</h3>
  <table width="100%" style="border-collapse:collapse;">
    <tr style="background:#374151;color:#fff;"><th style="padding:12px;text-align:left;border-radius:8px 0 0 0;">Établissement</th><th style="padding:12px;text-align:center;">Date</th><th style="padding:12px;text-align:right;">TTC</th><th style="padding:12px;text-align:right;border-radius:0 8px 0 0;">TVA</th></tr>
    ${expenseRows || '<tr><td colspan="4" style="padding:30px;text-align:center;color:#999;">Aucune dépense sur cette période</td></tr>'}
  </table>

  <div style="margin-top:40px;padding-top:20px;border-top:2px solid #e5e7eb;text-align:center;">
    <p style="color:#999;font-size:10px;margin:0;">${companyName ? companyName + ' • ' : ''}Document généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    ${expensesWithPhotos.length > 0 ? `<p style="color:#666;font-size:11px;margin:8px 0 0 0;">📎 ${photosBase64.length} justificatif${photosBase64.length > 1 ? 's' : ''} en annexe</p>` : ''}
  </div>
  
  ${photosPage}
</body>
</html>`;

    console.log('[Expenses] Generating PDF with', photosBase64.length, 'photos embedded');

    const result = await Print.printToFileAsync({ 
      html,
      width: 595,
      height: 842,
    });
    console.log('[Expenses] PDF generated:', result.uri);
    return result.uri;
  };

  const handleExport = async (action: 'share' | 'email' | 'print') => {
    setExporting(true);
    try {
      if (action === 'print') {
        const periodLabel = getMonthLabel();
        
        const categoryTotals: Record<string, { count: number; totalTTC: number; totalTVA: number }> = {};
        expenses.forEach(expense => {
          if (!categoryTotals[expense.category]) {
            categoryTotals[expense.category] = { count: 0, totalTTC: 0, totalTVA: 0 };
          }
          categoryTotals[expense.category].count++;
          categoryTotals[expense.category].totalTTC += expense.amount_ttc;
          categoryTotals[expense.category].totalTVA += expense.amount_tva;
        });

        const categoryRows = Object.entries(categoryTotals)
          .sort((a, b) => b[1].totalTTC - a[1].totalTTC)
          .map(([catId, data]) => {
            const catInfo = EXPENSE_CATEGORIES.find(c => c.id === catId);
            return `
              <tr>
                <td style="padding: 10px 12px; border-bottom: 1px solid #E5E7EB;">
                  <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: ${catInfo?.color || '#78716C'}; margin-right: 8px;"></span>
                  ${catInfo?.label || 'Divers'}
                </td>
                <td style="padding: 10px 12px; text-align: center; border-bottom: 1px solid #E5E7EB;">${data.count}</td>
                <td style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #E5E7EB;">${formatCurrency(data.totalTTC)}</td>
                <td style="padding: 10px 12px; text-align: right; border-bottom: 1px solid #E5E7EB;">${formatCurrency(data.totalTVA)}</td>
              </tr>
            `;
          }).join('');

        const expenseRows = expenses.map((expense, index) => {
          const catInfo = EXPENSE_CATEGORIES.find(c => c.id === expense.category);
          const photoHtml = expense.photo_uri 
            ? `<div style="margin-top: 8px;"><img src="${expense.photo_uri}" style="max-width: 200px; max-height: 150px; border-radius: 8px; object-fit: contain;" /></div>`
            : '';
          return `
            <div style="page-break-inside: avoid; background: ${index % 2 === 0 ? '#F9FAFB' : '#FFFFFF'}; padding: 16px; border-radius: 8px; margin-bottom: 12px; border: 1px solid #E5E7EB;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="flex: 1;">
                  <div style="font-weight: 600; font-size: 14px; color: #111827;">${expense.establishment}</div>
                  <div style="display: flex; gap: 12px; margin-top: 4px; font-size: 12px; color: #6B7280;">
                    <span style="display: inline-flex; align-items: center;">
                      <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${catInfo?.color || '#78716C'}; margin-right: 4px;"></span>
                      ${catInfo?.label || 'Divers'}
                    </span>
                    <span>${formatDate(expense.date)}</span>
                  </div>
                  ${expense.notes ? `<div style="margin-top: 6px; font-size: 11px; color: #9CA3AF; font-style: italic;">${expense.notes}</div>` : ''}
                </div>
                <div style="text-align: right;">
                  <div style="font-weight: 700; font-size: 16px; color: #111827;">${formatCurrency(expense.amount_ttc)}</div>
                  <div style="font-size: 11px; color: #6B7280;">TVA: ${formatCurrency(expense.amount_tva)}</div>
                </div>
              </div>
              ${photoHtml}
            </div>
          `;
        }).join('');

        const html = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <style>
              @page { margin: 15mm; size: A4; }
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 12px; color: #374151; }
              .page { padding: 20px; }
              .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid ${Colors.light.tint}; }
              .title { font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 8px; }
              .period { font-size: 16px; color: #6B7280; }
              .totals-box { display: flex; justify-content: center; gap: 40px; background: #F9FAFB; padding: 20px; border-radius: 12px; margin-bottom: 24px; }
              .total-item { text-align: center; }
              .total-label { font-size: 11px; color: #6B7280; text-transform: uppercase; }
              .total-value { font-size: 24px; font-weight: 700; color: #111827; }
              .total-value-tva { font-size: 24px; font-weight: 700; color: ${Colors.light.tint}; }
              .section-title { font-size: 14px; font-weight: 600; color: #111827; margin-bottom: 12px; text-transform: uppercase; }
              .category-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
              .category-table th { background: ${Colors.light.tint}; color: #FFFFFF; padding: 12px; text-align: left; font-size: 11px; text-transform: uppercase; }
              .category-table th:nth-child(2) { text-align: center; }
              .category-table th:nth-child(3), .category-table th:nth-child(4) { text-align: right; }
              .expenses-section { margin-top: 30px; }
              .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #9CA3AF; padding-top: 20px; border-top: 1px solid #E5E7EB; }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="header">
                <div class="title">Récapitulatif des Dépenses</div>
                <div class="period">${periodLabel}</div>
              </div>
              <div class="totals-box">
                <div class="total-item"><div class="total-label">Total TTC</div><div class="total-value">${formatCurrency(totals.totalTTC)}</div></div>
                <div class="total-item"><div class="total-label">Total TVA</div><div class="total-value-tva">${formatCurrency(totals.totalTVA)}</div></div>
                <div class="total-item"><div class="total-label">Nombre</div><div class="total-value">${expenses.length}</div></div>
              </div>
              <div class="section-title">Détail par Catégorie</div>
              <table class="category-table"><thead><tr><th>Catégorie</th><th>Nombre</th><th>Total TTC</th><th>Total TVA</th></tr></thead><tbody>${categoryRows}</tbody></table>
              <div class="expenses-section"><div class="section-title">Détail des Dépenses</div>${expenseRows}</div>
              <div class="footer">Document généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
          </body>
          </html>
        `;
        await Print.printAsync({ html });
        setShowExportModal(false);
        return;
      }

      const pdfUri = await generateExpensesPDF();
      console.log('[Expenses] PDF generated:', pdfUri);

      if (action === 'share') {
        if (Platform.OS === 'web') {
          Alert.alert('Information', 'Le partage n\'est pas disponible sur le web.');
          return;
        }
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('Erreur', 'Le partage n\'est pas disponible sur cet appareil.');
          return;
        }
        await Sharing.shareAsync(pdfUri, {
          UTI: '.pdf',
          mimeType: 'application/pdf',
          dialogTitle: 'Partager le récapitulatif des dépenses',
        });
      } else if (action === 'email') {
        const isAvailable = await MailComposer.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('Erreur', 'L\'envoi d\'email n\'est pas configuré sur cet appareil.');
          return;
        }
        const periodLabel = getMonthLabel();
        await MailComposer.composeAsync({
          subject: `Récapitulatif des dépenses - ${periodLabel}`,
          body: `Bonjour,\n\nVeuillez trouver ci-joint le récapitulatif des dépenses pour la période ${periodLabel}.\n\nTotal TTC: ${formatCurrency(totals.totalTTC)}\nTotal TVA: ${formatCurrency(totals.totalTVA)}\nNombre de dépenses: ${expenses.length}\n\nCordialement`,
          attachments: Platform.OS !== 'web' ? [pdfUri] : [],
        });
      }
      setShowExportModal(false);
    } catch (error) {
      console.error('[Expenses] Export error:', error);
      Alert.alert('Erreur', 'Impossible de générer le PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteExpense = (expense: Expense) => {
    Alert.alert(
      'Supprimer la dépense',
      `Êtes-vous sûr de vouloir supprimer cette dépense de ${expense.establishment} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(expense.id, expense.date);
              loadExpenses();
            } catch (error) {
              console.error('[Expenses] Delete error:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la dépense.');
            }
          },
        },
      ]
    );
  };

  const handleArchiveMonth = () => {
    const monthName = MONTHS_FR[currentDate.getMonth()];
    const year = currentDate.getFullYear();
    
    Alert.alert(
      'Archiver le mois',
      `Archiver toutes les dépenses de ${monthName} ${year} ?\n\nCette action conservera les dépenses mais supprimera les photos associées pour alléger la base de données.\n\nCette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          style: 'destructive',
          onPress: async () => {
            setArchiving(true);
            try {
              const count = await archiveExpensesByMonth(year, currentDate.getMonth());
              loadExpenses();
              Alert.alert(
                'Archivage terminé',
                `${count} dépense${count > 1 ? 's' : ''} archivée${count > 1 ? 's' : ''}.\nLes photos ont été supprimées.`
              );
            } catch (error) {
              console.error('[Expenses] Archive error:', error);
              Alert.alert('Erreur', 'Impossible d\'archiver les dépenses.');
            } finally {
              setArchiving(false);
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getMonthLabel = (): string => {
    if (filterMode === 'custom' && customStartDate && customEndDate) {
      return `${formatDate(customStartDate.toISOString())} - ${formatDate(customEndDate.toISOString())}`;
    }
    return `${MONTHS_FR[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  };

  const isNextMonthDisabled = (): boolean => {
    const today = new Date();
    const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
    return nextMonth > today;
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Dépenses',
          headerStyle: { backgroundColor: Colors.light.surface },
          headerTitleStyle: { fontWeight: '600', color: Colors.light.text },
          headerRight: () => (
            <TouchableOpacity 
              onPress={() => setShowExportModal(true)} 
              style={styles.headerButton}
              disabled={expenses.length === 0}
            >
              <FileDown size={22} color={expenses.length === 0 ? Colors.light.textMuted : Colors.light.tint} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.header}>
        <View style={styles.periodSelector}>
          <TouchableOpacity onPress={goToPreviousMonth} style={styles.navButton}>
            <ChevronLeft size={24} color={Colors.light.tint} />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.monthLabel}
            onPress={() => {
              setShowStartPicker(true);
              setFilterMode('custom');
            }}
          >
            <Calendar size={16} color={Colors.light.textSecondary} />
            <Text style={styles.monthText}>{getMonthLabel()}</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={goToNextMonth} 
            style={[styles.navButton, isNextMonthDisabled() && styles.navButtonDisabled]}
            disabled={isNextMonthDisabled()}
          >
            <ChevronRight size={24} color={isNextMonthDisabled() ? Colors.light.textMuted : Colors.light.tint} />
          </TouchableOpacity>
        </View>

        <View style={styles.totalsContainer}>
          {expenses.length > 0 && expenses.every(e => e.is_archived === 1) && filterMode !== 'custom' ? (
            <View style={styles.archivedBadge}>
              <CheckCircle size={16} color="#10B981" />
              <Text style={styles.archivedBadgeText}>Archivé</Text>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.archiveButton}
              onPress={handleArchiveMonth}
              disabled={archiving || expenses.length === 0 || filterMode === 'custom'}
            >
              {archiving ? (
                <ActivityIndicator size="small" color={Colors.light.textSecondary} />
              ) : (
                <Archive size={18} color={expenses.length === 0 || filterMode === 'custom' ? Colors.light.textMuted : Colors.light.textSecondary} />
              )}
              <Text style={[
                styles.archiveButtonText,
                (expenses.length === 0 || filterMode === 'custom') && styles.archiveButtonTextDisabled
              ]}>
                Archiver
              </Text>
            </TouchableOpacity>
          )}
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>Total TTC</Text>
            <Text style={styles.totalValue}>{formatCurrency(totals.totalTTC)}</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>Total TVA</Text>
            <Text style={styles.totalValueTVA}>{formatCurrency(totals.totalTVA)}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.light.tint} />
        </View>
      ) : expenses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Euro size={64} color={Colors.light.textMuted} />
          <Text style={styles.emptyText}>Aucune dépense</Text>
          <Text style={styles.emptySubtext}>Ajoutez votre première dépense</Text>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {expenses.map((expense) => {
            const categoryInfo = EXPENSE_CATEGORIES.find(c => c.id === expense.category);
            return (
              <TouchableOpacity
                key={expense.id}
                style={styles.expenseCard}
                onPress={() => openEditModal(expense)}
                activeOpacity={0.7}
              >
                <View style={[styles.categoryBadge, { backgroundColor: categoryInfo?.color || Colors.light.textMuted }]}>
                  <CategoryIcon category={expense.category} size={18} color="#FFFFFF" />
                </View>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseEstablishment} numberOfLines={1}>
                    {expense.establishment}
                  </Text>
                  <View style={styles.expenseDetails}>
                    <Text style={styles.expenseCategory}>{categoryInfo?.label || 'Divers'}</Text>
                    <Text style={styles.expenseDate}>{formatDate(expense.date)}</Text>
                    {expense.is_recurring === 1 && (
                      <View style={styles.recurringBadge}>
                        <Repeat size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.expenseAmounts}>
                  <Text style={styles.expenseTTC}>{formatCurrency(expense.amount_ttc)}</Text>
                  <Text style={styles.expenseTVA}>TVA: {formatCurrency(expense.amount_tva)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteExpense(expense)}
                >
                  <Trash2 size={18} color={Colors.light.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={openAddModal}>
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingExpense ? 'Modifier la dépense' : 'Nouvelle dépense'}
            </Text>
            <TouchableOpacity onPress={saveExpense} disabled={analyzing}>
              <Check size={24} color={analyzing ? Colors.light.textMuted : Colors.light.tint} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.imageSection}>
              {formData.photo_uri ? (
                <View style={styles.imagePreviewContainer}>
                  <Image source={{ uri: formData.photo_uri }} style={styles.imagePreview} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setFormData(prev => ({ ...prev, photo_uri: undefined }))}
                  >
                    <X size={16} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={styles.imageButtons}>
                    <TouchableOpacity
                      style={styles.imageButton}
                      onPress={() => pickImage(true)}
                      disabled={analyzing}
                    >
                      <Camera size={28} color={Colors.light.tint} />
                      <Text style={styles.imageButtonText}>Caméra</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.imageButton}
                      onPress={() => pickImage(false)}
                      disabled={analyzing}
                    >
                      <ImageIcon size={28} color={Colors.light.tint} />
                      <Text style={styles.imageButtonText}>Galerie</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.imageTip}>Cadrez bien le ticket, bonne luminosité, dans le sens de la lecture</Text>
                </>
              )}
              {analyzing && (
                <View style={styles.analyzingOverlay}>
                  <ActivityIndicator size="large" color={Colors.light.tint} />
                  <Text style={styles.analyzingText}>Analyse en cours...</Text>
                </View>
              )}
            </View>

            <View style={styles.formSection}>
              <Text style={styles.inputLabel}>Établissement *</Text>
              <TextInput
                style={styles.textInput}
                value={formData.establishment}
                onChangeText={(text) => setFormData(prev => ({ ...prev, establishment: text }))}
                placeholder="Nom de l'établissement"
                placeholderTextColor={Colors.light.textMuted}
              />

              <Text style={styles.inputLabel}>Catégorie</Text>
              <View style={styles.categoryGrid}>
                {EXPENSE_CATEGORIES.map((cat) => {
                  const isSelected = formData.category === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[
                        styles.categoryGridItem,
                        isSelected && styles.categoryGridItemSelected,
                      ]}
                      onPress={() => setFormData(prev => ({ ...prev, category: cat.id }))}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        styles.categoryGridIcon,
                        { backgroundColor: isSelected ? cat.color : cat.color + '15' }
                      ]}>
                        <CategoryIcon 
                          category={cat.id} 
                          size={18} 
                          color={isSelected ? '#FFFFFF' : cat.color} 
                        />
                      </View>
                      <Text style={[
                        styles.categoryGridText,
                        isSelected && styles.categoryGridTextSelected,
                      ]} numberOfLines={1}>{cat.label}</Text>
                      {isSelected && (
                        <View style={[styles.categoryCheckmark, { backgroundColor: cat.color }]}>
                          <Check size={10} color="#FFFFFF" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Montant TTC *</Text>
                  <TextInput
                    style={styles.textInput}
                    value={ttcInputValue}
                    onChangeText={handleTTCChange}
                    placeholder="0,00"
                    placeholderTextColor={Colors.light.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Taux TVA (%)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tvaRateInputValue}
                    onChangeText={handleTVARateChange}
                    placeholder="20"
                    placeholderTextColor={Colors.light.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Montant TVA</Text>
                  <TextInput
                    style={[styles.textInput, styles.readOnlyInput]}
                    value={formData.amount_tva > 0 ? String(formData.amount_tva.toFixed(2)) : '0.00'}
                    onChangeText={(text) => setFormData(prev => ({ ...prev, amount_tva: parseFloat(text) || 0 }))}
                    placeholder="0.00"
                    placeholderTextColor={Colors.light.textMuted}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.halfInput}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dateInputValue}
                    onChangeText={handleDateChange}
                    onBlur={handleDateBlur}
                    placeholder="JJ/MM/AAAA"
                    placeholderTextColor={Colors.light.textMuted}
                    keyboardType="default"
                  />
                </View>
              </View>

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.textInput, styles.notesInput]}
                value={formData.notes}
                onChangeText={(text) => setFormData(prev => ({ ...prev, notes: text }))}
                placeholder="Notes optionnelles"
                placeholderTextColor={Colors.light.textMuted}
                multiline
                numberOfLines={3}
              />

              <View style={styles.recurringSection}>
                <TouchableOpacity
                  style={styles.recurringToggle}
                  onPress={() => setFormData(prev => ({ ...prev, is_recurring: !prev.is_recurring }))}
                  activeOpacity={0.7}
                >
                  <View style={styles.recurringToggleLeft}>
                    <View style={[styles.recurringIcon, formData.is_recurring && styles.recurringIconActive]}>
                      <Repeat size={18} color={formData.is_recurring ? '#FFFFFF' : Colors.light.tint} />
                    </View>
                    <View>
                      <Text style={styles.recurringToggleTitle}>Dépense récurrente</Text>
                      <Text style={styles.recurringToggleSubtitle}>Répéter chaque mois à la même date</Text>
                    </View>
                  </View>
                  <View style={[styles.toggleSwitch, formData.is_recurring && styles.toggleSwitchActive]}>
                    <View style={[styles.toggleKnob, formData.is_recurring && styles.toggleKnobActive]} />
                  </View>
                </TouchableOpacity>

                {formData.is_recurring && (
                  <View style={styles.recurringDates}>
                    <View style={styles.halfInput}>
                      <Text style={styles.inputLabel}>Date de début *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={recurringStartInputValue}
                        onChangeText={handleRecurringStartChange}
                        onBlur={handleRecurringStartBlur}
                        placeholder="JJ/MM/AAAA"
                        placeholderTextColor={Colors.light.textMuted}
                        keyboardType="default"
                      />
                    </View>
                    <View style={styles.halfInput}>
                      <Text style={styles.inputLabel}>Date de fin *</Text>
                      <TextInput
                        style={styles.textInput}
                        value={recurringEndInputValue}
                        onChangeText={handleRecurringEndChange}
                        onBlur={handleRecurringEndBlur}
                        placeholder="JJ/MM/AAAA"
                        placeholderTextColor={Colors.light.textMuted}
                        keyboardType="default"
                      />
                    </View>
                  </View>
                )}

                {formData.is_recurring && formData.recurring_start_date && (
                  <View style={styles.recurringInfo}>
                    <Text style={styles.recurringInfoText}>
                      La dépense sera générée automatiquement le {new Date(formData.recurring_start_date).getDate()} de chaque mois
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={showCategoryPicker}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <TouchableWithoutFeedback onPress={() => setShowCategoryPicker(false)}>
          <View style={styles.categoryPickerOverlay}>
            <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
              <View style={styles.categoryPickerContainer}>
          <View style={styles.categoryPickerHeader}>
            <Text style={styles.categoryPickerTitle}>Choisir une catégorie</Text>
            <TouchableOpacity onPress={() => setShowCategoryPicker(false)}>
              <X size={24} color={Colors.light.text} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.categoryList}>
            {EXPENSE_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.categoryItem,
                  formData.category === cat.id && styles.categoryItemSelected,
                ]}
                onPress={() => {
                  setFormData(prev => ({ ...prev, category: cat.id }));
                  setShowCategoryPicker(false);
                }}
              >
                <View style={[styles.categoryIconContainer, { backgroundColor: cat.color }]}>
                  <CategoryIcon category={cat.id} size={22} color="#FFFFFF" />
                </View>
                <Text style={styles.categoryItemText}>{cat.label}</Text>
                {formData.category === cat.id && (
                  <Check size={20} color={Colors.light.tint} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {showDatePicker && Platform.OS !== 'web' && (
        <DatePickerModal
          value={new Date(formData.date)}
          onClose={() => setShowDatePicker(false)}
          onChange={(date) => {
            setFormData(prev => ({ ...prev, date: date.toISOString().split('T')[0] }));
          }}
        />
      )}

      {showDatePicker && Platform.OS === 'web' && (
        <WebDatePickerModal
          value={formData.date}
          onClose={() => setShowDatePicker(false)}
          onChange={(dateStr) => {
            setFormData(prev => ({ ...prev, date: dateStr }));
          }}
        />
      )}

      {showStartPicker && Platform.OS !== 'web' && (
        <DatePickerModal
          value={customStartDate || new Date()}
          onClose={() => setShowStartPicker(false)}
          onChange={(date) => {
            setCustomStartDate(date);
            setShowEndPicker(true);
          }}
        />
      )}

      {showStartPicker && Platform.OS === 'web' && (
        <WebDatePickerModal
          value={customStartDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}
          onClose={() => setShowStartPicker(false)}
          onChange={(dateStr) => {
            setCustomStartDate(new Date(dateStr));
            setShowEndPicker(true);
          }}
        />
      )}

      {showEndPicker && Platform.OS !== 'web' && (
        <DatePickerModal
          value={customEndDate || new Date()}
          onClose={() => setShowEndPicker(false)}
          onChange={(date) => {
            setCustomEndDate(date);
          }}
        />
      )}

      {showEndPicker && Platform.OS === 'web' && (
        <WebDatePickerModal
          value={customEndDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0]}
          onClose={() => setShowEndPicker(false)}
          onChange={(dateStr) => {
            setCustomEndDate(new Date(dateStr));
          }}
        />
      )}

      <Modal
        visible={showExportModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowExportModal(false)}
      >
        <TouchableOpacity 
          style={styles.exportModalOverlay} 
          activeOpacity={1} 
          onPress={() => setShowExportModal(false)}
        >
          <View style={styles.exportModalContainer}>
            <View style={styles.exportModalHeader}>
              <Text style={styles.exportModalTitle}>Exporter les dépenses</Text>
              <Text style={styles.exportModalSubtitle}>{getMonthLabel()}</Text>
            </View>
            
            <View style={styles.exportModalSummary}>
              <View style={styles.exportModalSummaryItem}>
                <Text style={styles.exportModalSummaryLabel}>Total TTC</Text>
                <Text style={styles.exportModalSummaryValue}>{formatCurrency(totals.totalTTC)}</Text>
              </View>
              <View style={styles.exportModalSummaryDivider} />
              <View style={styles.exportModalSummaryItem}>
                <Text style={styles.exportModalSummaryLabel}>Dépenses</Text>
                <Text style={styles.exportModalSummaryValue}>{expenses.length}</Text>
              </View>
            </View>

            <View style={styles.exportModalActions}>
              <TouchableOpacity 
                style={styles.exportModalButton} 
                onPress={() => handleExport('share')}
                disabled={exporting}
              >
                <View style={[styles.exportModalButtonIcon, { backgroundColor: Colors.light.tint + '15' }]}>
                  <Share2 size={22} color={Colors.light.tint} />
                </View>
                <Text style={styles.exportModalButtonText}>Partager</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.exportModalButton} 
                onPress={() => handleExport('email')}
                disabled={exporting}
              >
                <View style={[styles.exportModalButtonIcon, { backgroundColor: '#10B98115' }]}>
                  <Mail size={22} color="#10B981" />
                </View>
                <Text style={styles.exportModalButtonText}>Email</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.exportModalButton} 
                onPress={() => handleExport('print')}
                disabled={exporting}
              >
                <View style={[styles.exportModalButtonIcon, { backgroundColor: '#8B5CF615' }]}>
                  <FileDown size={22} color="#8B5CF6" />
                </View>
                <Text style={styles.exportModalButtonText}>Imprimer</Text>
              </TouchableOpacity>
            </View>

            {exporting && (
              <View style={styles.exportingOverlay}>
                <ActivityIndicator size="large" color={Colors.light.tint} />
                <Text style={styles.exportingText}>Génération du PDF...</Text>
              </View>
            )}

            <TouchableOpacity 
              style={styles.exportModalCancel} 
              onPress={() => setShowExportModal(false)}
            >
              <Text style={styles.exportModalCancelText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    backgroundColor: Colors.light.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  periodSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.light.surfaceSecondary,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  monthLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 8,
  },
  monthText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  totalsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 16,
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 8,
    marginRight: 'auto',
  },
  archiveButtonText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    fontWeight: '500',
  },
  archiveButtonTextDisabled: {
    color: Colors.light.textMuted,
  },
  archivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#10B98115',
    borderRadius: 8,
    marginRight: 'auto',
  },
  archivedBadgeText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '600',
  },
  totalItem: {
    alignItems: 'flex-end',
  },
  totalLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  totalValueTVA: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.tint,
  },
  totalDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.light.border,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.light.text,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  expenseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 12,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseEstablishment: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  expenseDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  expenseCategory: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  expenseDate: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  recurringBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    gap: 3,
  },
  recurringBadgeText: {
    fontSize: 10,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  expenseAmounts: {
    alignItems: 'flex-end',
  },
  expenseTTC: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  expenseTVA: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  deleteButton: {
    padding: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.tint,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  modalContent: {
    flex: 1,
  },
  imageSection: {
    padding: 16,
    backgroundColor: Colors.light.surface,
    marginBottom: 8,
  },
  imageButtons: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  imageButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.light.border,
    borderStyle: 'dashed',
  },
  imageButtonText: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  imagePreviewContainer: {
    position: 'relative',
    alignItems: 'center',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    resizeMode: 'contain',
    backgroundColor: Colors.light.surfaceSecondary,
  },
  removeImageButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  analyzingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
  },
  analyzingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  imageTip: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
  formSection: {
    padding: 16,
    backgroundColor: Colors.light.surface,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  textInput: {
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  readOnlyInput: {
    backgroundColor: Colors.light.background,
  },
  notesInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfInput: {
    flex: 1,
  },
  categorySelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  categoryPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categorySelectorText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginHorizontal: -4,
  },
  categoryGridItem: {
    width: '33.33%',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  categoryGridItemSelected: {},
  categoryGridIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 4,
  },
  categoryGridText: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  categoryGridTextSelected: {
    color: Colors.light.text,
    fontWeight: '600',
  },
  categoryCheckmark: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryPickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  categoryPickerContainer: {
    backgroundColor: Colors.light.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  categoryPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  categoryPickerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.light.text,
  },
  categoryList: {
    flex: 1,
    padding: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  categoryItemSelected: {
    backgroundColor: Colors.light.tintLight + '20',
    borderWidth: 1,
    borderColor: Colors.light.tint,
  },
  categoryIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryItemText: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
  },
  headerButton: {
    padding: 8,
    marginRight: 4,
  },
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exportModalContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    width: '85%',
    maxWidth: 340,
    overflow: 'hidden',
  },
  exportModalHeader: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  exportModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  exportModalSubtitle: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  exportModalSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: Colors.light.surfaceSecondary,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  exportModalSummaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  exportModalSummaryLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  exportModalSummaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.light.text,
    marginTop: 2,
  },
  exportModalSummaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.light.border,
  },
  exportModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  exportModalButton: {
    alignItems: 'center',
    flex: 1,
  },
  exportModalButtonIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  exportModalButtonText: {
    fontSize: 13,
    color: Colors.light.text,
    fontWeight: '500',
  },
  exportingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  exportingText: {
    marginTop: 12,
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  exportModalCancel: {
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    alignItems: 'center',
  },
  exportModalCancelText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  recurringSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 12,
    padding: 14,
  },
  recurringToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  recurringIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recurringIconActive: {
    backgroundColor: Colors.light.tint,
  },
  recurringToggleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.light.text,
  },
  recurringToggleSubtitle: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  toggleSwitch: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.border,
    padding: 2,
    justifyContent: 'center',
  },
  toggleSwitchActive: {
    backgroundColor: Colors.light.tint,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },
  recurringDates: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  recurringInfo: {
    marginTop: 12,
    backgroundColor: Colors.light.tint + '10',
    borderRadius: 8,
    padding: 12,
  },
  recurringInfoText: {
    fontSize: 13,
    color: Colors.light.tint,
    textAlign: 'center',
  },
});
