import { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { ChevronDown, Check, Sparkles } from 'lucide-react-native';
import { ProductFormData, emptyProductForm, validateProductForm, UNIT_OPTIONS, TVA_OPTIONS } from '@/types/product';
import Colors from '@/constants/colors';
import OCRCamera from '@/components/OCRCamera';

interface ProductFormProps {
  initialData?: ProductFormData;
  onSubmit: (data: ProductFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export default function ProductForm({
  initialData = emptyProductForm,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Enregistrer',
}: ProductFormProps) {
  const [formData, setFormData] = useState<ProductFormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showTvaPicker, setShowTvaPicker] = useState(false);
  const [showOCRCamera, setShowOCRCamera] = useState(false);

  const updateField = useCallback((field: keyof ProductFormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const handleSubmit = useCallback(() => {
    const validation = validateProductForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    onSubmit(formData);
  }, [formData, onSubmit]);

  const handleOCRTextExtracted = useCallback((text: string) => {
    updateField('description', text);
  }, [updateField]);

  const selectedUnitLabel = UNIT_OPTIONS.find(u => u.value === formData.unit)?.label || formData.unit;
  const selectedTvaLabel = TVA_OPTIONS.find(t => t.value === formData.tva_rate)?.label || `${formData.tva_rate}%`;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={formData.name}
              onChangeText={(v) => updateField('name', v)}
              placeholder="Nom du produit ou service"
              placeholderTextColor={Colors.light.textMuted}
              testID="product-name-input"
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.descriptionHeader}>
              <Text style={styles.label}>Description</Text>
              <TouchableOpacity
                style={styles.ocrButton}
                onPress={() => setShowOCRCamera(true)}
              >
                <Sparkles size={14} color="#8B5CF6" />
                <Text style={styles.ocrButtonText}>Caméra IA</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.description}
              onChangeText={(v) => updateField('description', v)}
              placeholder="Description détaillée..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              testID="product-description-input"
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchLabelContainer}>
              <Text style={styles.switchLabel}>Service</Text>
              <Text style={styles.switchHint}>Activez si c&apos;est un service (non matériel)</Text>
            </View>
            <Switch
              value={formData.is_service}
              onValueChange={(v) => updateField('is_service', v)}
              trackColor={{ false: Colors.light.border, true: Colors.light.tint + '60' }}
              thumbColor={formData.is_service ? Colors.light.tint : '#f4f3f4'}
              testID="product-service-switch"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tarification</Text>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex2]}>
              <Text style={styles.label}>Prix unitaire HT *</Text>
              <View style={styles.priceInputContainer}>
                <TextInput
                  style={[styles.input, styles.priceInput, errors.unit_price && styles.inputError]}
                  value={formData.unit_price}
                  onChangeText={(v) => updateField('unit_price', v)}
                  placeholder="0,00"
                  placeholderTextColor={Colors.light.textMuted}
                  keyboardType="decimal-pad"
                  testID="product-price-input"
                />
                <Text style={styles.currencyLabel}>€</Text>
              </View>
              {errors.unit_price && <Text style={styles.errorText}>{errors.unit_price}</Text>}
            </View>

            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Unité</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowUnitPicker(!showUnitPicker)}
                testID="product-unit-picker"
              >
                <Text style={styles.pickerButtonText}>{selectedUnitLabel}</Text>
                <ChevronDown size={18} color={Colors.light.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>

          {showUnitPicker && (
            <View style={styles.pickerOptions}>
              {UNIT_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.pickerOption,
                    formData.unit === option.value && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    updateField('unit', option.value);
                    setShowUnitPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      formData.unit === option.value && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {formData.unit === option.value && (
                    <Check size={18} color={Colors.light.tint} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Taux TVA par défaut</Text>
            <TouchableOpacity
              style={styles.pickerButton}
              onPress={() => setShowTvaPicker(!showTvaPicker)}
              testID="product-tva-picker"
            >
              <Text style={styles.pickerButtonText}>{selectedTvaLabel}</Text>
              <ChevronDown size={18} color={Colors.light.textSecondary} />
            </TouchableOpacity>
            {errors.tva_rate && <Text style={styles.errorText}>{errors.tva_rate}</Text>}
          </View>

          {showTvaPicker && (
            <View style={styles.pickerOptions}>
              {TVA_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.pickerOption,
                    formData.tva_rate === option.value && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    updateField('tva_rate', option.value);
                    setShowTvaPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      formData.tva_rate === option.value && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {formData.tva_rate === option.value && (
                    <Check size={18} color={Colors.light.tint} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <OCRCamera
        visible={showOCRCamera}
        onClose={() => setShowOCRCamera(false)}
        onTextExtracted={handleOCRTextExtracted}
        title="Scanner la description"
      />

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          disabled={isLoading}
          testID="product-cancel-button"
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
          testID="product-submit-button"
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Check size={20} color="#FFFFFF" strokeWidth={2.5} />
              <Text style={styles.submitButtonText}>{submitLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.text,
  },
  inputError: {
    borderColor: Colors.light.error,
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
  },
  errorText: {
    fontSize: 12,
    color: Colors.light.error,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  flex1: {
    flex: 1,
  },
  flex2: {
    flex: 2,
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceInput: {
    flex: 1,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  currencyLabel: {
    backgroundColor: Colors.light.surfaceSecondary,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: Colors.light.border,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    padding: 14,
  },
  switchLabelContainer: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  switchHint: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  pickerOptions: {
    backgroundColor: Colors.light.surface,
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: 10,
    marginTop: -8,
    marginBottom: 16,
    overflow: 'hidden',
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pickerOptionSelected: {
    backgroundColor: Colors.light.tint + '10',
  },
  pickerOptionText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  pickerOptionTextSelected: {
    color: Colors.light.tint,
    fontWeight: '500' as const,
  },
  footer: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 40,
    gap: 12,
    backgroundColor: Colors.light.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: Colors.light.surfaceSecondary,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
  },
  submitButton: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 16,
    borderRadius: 12,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  descriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ocrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#8B5CF615',
    borderRadius: 6,
  },
  ocrButtonText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: '#8B5CF6',
  },
});
