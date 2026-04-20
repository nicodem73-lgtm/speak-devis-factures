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
} from 'react-native';
import { Check, MapPin, Building2, Truck, FileText } from 'lucide-react-native';
import { searchFrenchAddress, AddressSuggestion } from '@/utils/addressApi';
import { ClientFormData, emptyClientForm, validateClientForm } from '@/types/client';
import Colors from '@/constants/colors';

interface ClientFormProps {
  initialData?: ClientFormData;
  onSubmit: (data: ClientFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  submitLabel?: string;
}

export default function ClientForm({
  initialData = emptyClientForm,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Enregistrer',
}: ClientFormProps) {
  const [formData, setFormData] = useState<ClientFormData>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [deliveryAddressSuggestions, setDeliveryAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSearchingDeliveryAddress, setIsSearchingDeliveryAddress] = useState(false);

  const updateField = useCallback((field: keyof ClientFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [errors]);

  const handleAddressSearch = useCallback(async (query: string) => {
    setFormData(prev => ({ ...prev, address: query }));
    if (query.length >= 3) {
      setIsSearchingAddress(true);
      try {
        const results = await searchFrenchAddress(query);
        setAddressSuggestions(results);
      } catch (error) {
        console.error('[ClientForm] Address search error:', error);
      } finally {
        setIsSearchingAddress(false);
      }
    } else {
      setAddressSuggestions([]);
    }
  }, []);

  const selectAddress = useCallback((suggestion: AddressSuggestion) => {
    const streetAddress = suggestion.housenumber
      ? `${suggestion.housenumber} ${suggestion.street || ''}`.trim()
      : suggestion.street || suggestion.label.split(',')[0];

    setFormData(prev => ({
      ...prev,
      address: streetAddress,
      city: suggestion.city,
      postal_code: suggestion.postcode,
      country: 'France',
    }));
    setAddressSuggestions([]);
  }, []);

  const handleDeliveryAddressSearch = useCallback(async (query: string) => {
    setFormData(prev => ({ ...prev, delivery_address: query }));
    if (query.length >= 3) {
      setIsSearchingDeliveryAddress(true);
      try {
        const results = await searchFrenchAddress(query);
        setDeliveryAddressSuggestions(results);
      } catch (error) {
        console.error('[ClientForm] Delivery address search error:', error);
      } finally {
        setIsSearchingDeliveryAddress(false);
      }
    } else {
      setDeliveryAddressSuggestions([]);
    }
  }, []);

  const selectDeliveryAddress = useCallback((suggestion: AddressSuggestion) => {
    const streetAddress = suggestion.housenumber
      ? `${suggestion.housenumber} ${suggestion.street || ''}`.trim()
      : suggestion.street || suggestion.label.split(',')[0];

    setFormData(prev => ({
      ...prev,
      delivery_address: streetAddress,
      delivery_city: suggestion.city,
      delivery_postal_code: suggestion.postcode,
      delivery_country: 'France',
    }));
    setDeliveryAddressSuggestions([]);
  }, []);

  const handleSubmit = useCallback(() => {
    const validation = validateClientForm(formData);
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    onSubmit(formData);
  }, [formData, onSubmit]);

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
          <Text style={styles.sectionTitle}>Informations principales</Text>
          
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nom *</Text>
            <TextInput
              style={[styles.input, errors.name && styles.inputError]}
              value={formData.name}
              onChangeText={(v) => updateField('name', v)}
              placeholder="Nom du client"
              placeholderTextColor={Colors.light.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              keyboardType="default"
              testID="client-name-input"
            />
            {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Entreprise</Text>
            <TextInput
              style={styles.input}
              value={formData.company}
              onChangeText={(v) => updateField('company', v)}
              placeholder="Nom de l'entreprise"
              placeholderTextColor={Colors.light.textMuted}
              autoCapitalize="words"
              autoCorrect={false}
              keyboardType="default"
              testID="client-company-input"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>
              SIREN / SIRET {formData.company.trim() ? '*' : ''}
            </Text>
            <View style={styles.siretInputWrapper}>
              <Building2 size={18} color={Colors.light.textMuted} style={styles.siretIcon} />
              <TextInput
                style={[styles.input, styles.siretInput, errors.siret && styles.inputError]}
                value={formData.siret}
                onChangeText={(v) => updateField('siret', v.replace(/[^0-9\s]/g, ''))}
                placeholder="123 456 789 00012"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="number-pad"
                maxLength={17}
                testID="client-siret-input"
              />
            </View>
            {errors.siret && <Text style={styles.errorText}>{errors.siret}</Text>}
            {formData.company.trim() && !errors.siret && (
              <Text style={styles.hintText}>
                Obligatoire pour la facturation électronique
              </Text>
            )}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>N° TVA intracommunautaire</Text>
            <View style={styles.siretInputWrapper}>
              <FileText size={18} color={Colors.light.textMuted} style={styles.siretIcon} />
              <TextInput
                style={[styles.input, styles.siretInput]}
                value={formData.tva_number}
                onChangeText={(v) => updateField('tva_number', v.toUpperCase())}
                placeholder="FR12345678901"
                placeholderTextColor={Colors.light.textMuted}
                autoCapitalize="characters"
                testID="client-tva-input"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={formData.email}
              onChangeText={(v) => updateField('email', v.toLowerCase().replace(/\s/g, ''))}
              placeholder="email@exemple.com"
              placeholderTextColor={Colors.light.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              testID="client-email-input"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              style={styles.input}
              value={formData.phone}
              onChangeText={(v) => updateField('phone', v)}
              placeholder="06 12 34 56 78"
              placeholderTextColor={Colors.light.textMuted}
              keyboardType="phone-pad"
              testID="client-phone-input"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adresse</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse</Text>
            <View style={styles.addressInputWrapper}>
              <TextInput
                style={styles.input}
                value={formData.address}
                onChangeText={handleAddressSearch}
                placeholder="Commencez à taper une adresse..."
                placeholderTextColor={Colors.light.textMuted}
                autoCorrect={false}
                keyboardType="default"
                testID="client-address-input"
              />
              {isSearchingAddress && (
                <ActivityIndicator
                  size="small"
                  color={Colors.light.tint}
                  style={styles.addressLoader}
                />
              )}
            </View>
            {addressSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {addressSuggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => selectAddress(suggestion)}
                  >
                    <MapPin size={16} color={Colors.light.tint} />
                    <View style={styles.suggestionContent}>
                      <Text style={styles.suggestionText}>{suggestion.label}</Text>
                      <Text style={styles.suggestionContext}>{suggestion.context}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex2]}>
              <Text style={styles.label}>Ville</Text>
              <TextInput
                style={styles.input}
                value={formData.city}
                onChangeText={(v) => updateField('city', v)}
                placeholder="Paris"
                placeholderTextColor={Colors.light.textMuted}
                autoCorrect={false}
                keyboardType="default"
                testID="client-city-input"
              />
            </View>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Code postal</Text>
              <TextInput
                style={styles.input}
                value={formData.postal_code}
                onChangeText={(v) => updateField('postal_code', v)}
                placeholder="75001"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="number-pad"
                testID="client-postal-input"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pays</Text>
            <TextInput
              style={styles.input}
              value={formData.country}
              onChangeText={(v) => updateField('country', v)}
              placeholder="France"
              placeholderTextColor={Colors.light.textMuted}
              autoCorrect={false}
              keyboardType="default"
              testID="client-country-input"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adresse de livraison</Text>
          <Text style={styles.sectionHint}>Si différente de l&apos;adresse principale</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Adresse de livraison</Text>
            <View style={styles.addressInputWrapper}>
              <Truck size={18} color={Colors.light.textMuted} style={{ position: 'absolute', left: 14, top: 14, zIndex: 1 }} />
              <TextInput
                style={[styles.input, { paddingLeft: 42 }]}
                value={formData.delivery_address}
                onChangeText={handleDeliveryAddressSearch}
                placeholder="Commencez à taper une adresse..."
                placeholderTextColor={Colors.light.textMuted}
                autoCorrect={false}
                keyboardType="default"
                testID="client-delivery-address-input"
              />
              {isSearchingDeliveryAddress && (
                <ActivityIndicator
                  size="small"
                  color={Colors.light.tint}
                  style={styles.deliveryAddressLoader}
                />
              )}
            </View>
            {deliveryAddressSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {deliveryAddressSuggestions.map((suggestion, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.suggestionItem}
                    onPress={() => selectDeliveryAddress(suggestion)}
                  >
                    <MapPin size={16} color={Colors.light.tint} />
                    <View style={styles.suggestionContent}>
                      <Text style={styles.suggestionText}>{suggestion.label}</Text>
                      <Text style={styles.suggestionContext}>{suggestion.context}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.row}>
            <View style={[styles.inputGroup, styles.flex2]}>
              <Text style={styles.label}>Ville</Text>
              <TextInput
                style={styles.input}
                value={formData.delivery_city}
                onChangeText={(v) => updateField('delivery_city', v)}
                placeholder="Ville"
                placeholderTextColor={Colors.light.textMuted}
                autoCorrect={false}
                keyboardType="default"
                testID="client-delivery-city-input"
              />
            </View>
            <View style={[styles.inputGroup, styles.flex1]}>
              <Text style={styles.label}>Code postal</Text>
              <TextInput
                style={styles.input}
                value={formData.delivery_postal_code}
                onChangeText={(v) => updateField('delivery_postal_code', v)}
                placeholder="CP"
                placeholderTextColor={Colors.light.textMuted}
                keyboardType="number-pad"
                testID="client-delivery-postal-input"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pays</Text>
            <TextInput
              style={styles.input}
              value={formData.delivery_country}
              onChangeText={(v) => updateField('delivery_country', v)}
              placeholder="France"
              placeholderTextColor={Colors.light.textMuted}
              autoCorrect={false}
              keyboardType="default"
              testID="client-delivery-country-input"
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formData.notes}
              onChangeText={(v) => updateField('notes', v)}
              placeholder="Notes supplémentaires..."
              placeholderTextColor={Colors.light.textMuted}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              testID="client-notes-input"
            />
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={onCancel}
          disabled={isLoading}
          testID="client-cancel-button"
        >
          <Text style={styles.cancelButtonText}>Annuler</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={isLoading}
          testID="client-submit-button"
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
    minHeight: 100,
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
  addressInputWrapper: {
    position: 'relative',
  },
  addressLoader: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  deliveryAddressLoader: {
    position: 'absolute',
    right: 12,
    top: 14,
  },
  suggestionsContainer: {
    marginTop: 4,
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.light.border,
    overflow: 'hidden',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  suggestionContent: {
    flex: 1,
  },
  suggestionText: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500' as const,
  },
  suggestionContext: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  siretInputWrapper: {
    position: 'relative',
  },
  siretIcon: {
    position: 'absolute',
    left: 14,
    top: 14,
    zIndex: 1,
  },
  siretInput: {
    paddingLeft: 42,
  },
  hintText: {
    fontSize: 12,
    color: Colors.light.tint,
    marginTop: 4,
    fontStyle: 'italic' as const,
  },
  sectionHint: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginBottom: 12,
    fontStyle: 'italic' as const,
  },
});
