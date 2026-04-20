import { useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Image, ActionSheetIOS } from 'react-native';
import { Stack, router } from 'expo-router';
import { Building2, Mail, Phone, MapPin, CreditCard, FileText, Image as ImageIcon, Check, Search, Camera, FolderOpen, Scale, Landmark, Briefcase } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getCompanyInfo, saveCompanyInfo, CompanyInfo } from '@/db/settings';
import { searchFrenchAddress, AddressSuggestion } from '@/utils/addressApi';

export default function CompanySettingsScreen() {
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  
  const [form, setForm] = useState<CompanyInfo>({
    name: '',
    address: '',
    city: '',
    postalCode: '',
    email: '',
    phone: '',
    siret: '',
    tvaNumber: '',
    iban: '',
    logo: '',
    legalForm: '',
    capital: '',
    rcsNumber: '',
    rcsCity: '',
    rmNumber: '',
    rmDepartment: '',
    vatExempt: false,
    defaultConditions: '',
    defaultLegalMentions: '',
  });

  const [addressQuery, setAddressQuery] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: companyInfo, isLoading } = useQuery({
    queryKey: ['companyInfo', db],
    queryFn: () => getCompanyInfo(db!),
    enabled: !!db,
  });

  useEffect(() => {
    if (companyInfo) {
      setForm(companyInfo);
    }
  }, [companyInfo]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await saveCompanyInfo(db, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companyInfo'] });
      Alert.alert('Succès', 'Informations enregistrées');
      router.back();
    },
    onError: (error) => {
      console.error('[CompanySettings] Save error:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    },
  });

  const updateField = (field: keyof CompanyInfo, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleAddressChange = useCallback((text: string) => {
    setAddressQuery(text);
    updateField('address', text);

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    if (text.length < 3) {
      setAddressSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      const results = await searchFrenchAddress(text);
      setAddressSuggestions(results);
      setShowSuggestions(results.length > 0);
      setIsSearching(false);
    }, 300);
  }, []);

  const selectAddress = useCallback((suggestion: AddressSuggestion) => {
    const streetAddress = suggestion.housenumber 
      ? `${suggestion.housenumber} ${suggestion.street || ''}`.trim()
      : suggestion.street || suggestion.label.split(',')[0];
    
    setForm(prev => ({
      ...prev,
      address: streetAddress,
      city: suggestion.city,
      postalCode: suggestion.postcode,
    }));
    setAddressQuery(streetAddress);
    setShowSuggestions(false);
    setAddressSuggestions([]);
  }, []);

  useEffect(() => {
    if (companyInfo?.address) {
      setAddressQuery(companyInfo.address);
    }
  }, [companyInfo?.address]);

  const pickImageFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        if (asset.base64) {
          const dataUri = `data:image/jpeg;base64,${asset.base64}`;
          updateField('logo', dataUri);
        } else {
          updateField('logo', asset.uri);
        }
      }
    } catch (error) {
      console.error('[CompanySettings] Image picker error:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
    }
  };

  const pickImageFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets[0]) {
        updateField('logo', result.assets[0].uri);
      }
    } catch (error) {
      console.error('[CompanySettings] Document picker error:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier');
    }
  };

  const showImagePickerOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Annuler', 'Choisir depuis Photos', 'Choisir depuis Fichiers'],
          cancelButtonIndex: 0,
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            pickImageFromGallery();
          } else if (buttonIndex === 2) {
            pickImageFromFiles();
          }
        }
      );
    } else {
      Alert.alert(
        'Choisir une image',
        'Sélectionnez la source de l\'image',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Photos', onPress: pickImageFromGallery },
          { text: 'Fichiers', onPress: pickImageFromFiles },
        ]
      );
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Stack.Screen 
        options={{ 
          title: 'Mon entreprise',
          headerRight: () => (
            <TouchableOpacity 
              style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Check size={24} color="#FFFFFF" strokeWidth={3} />
              )}
            </TouchableOpacity>
          ),
        }} 
      />
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Identité</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Building2 size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Nom de l'entreprise"
                placeholderTextColor={Colors.light.textMuted}
                value={form.name}
                onChangeText={(v) => updateField('name', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
            
            <TouchableOpacity 
              style={styles.logoPickerContainer}
              onPress={showImagePickerOptions}
            >
              <View style={styles.logoPreviewContainer}>
                {form.logo ? (
                  <Image 
                    source={{ uri: form.logo }} 
                    style={styles.logoPreview}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.logoPlaceholder}>
                    <ImageIcon size={32} color={Colors.light.textMuted} />
                  </View>
                )}
              </View>
              <View style={styles.logoPickerContent}>
                <Text style={styles.logoPickerTitle}>
                  {form.logo ? 'Changer le logo' : 'Ajouter un logo'}
                </Text>
                <Text style={styles.logoPickerDescription}>
                  Photos ou Fichiers
                </Text>
              </View>
              <View style={styles.logoPickerActions}>
                <Camera size={18} color={Colors.light.tint} />
                <FolderOpen size={18} color={Colors.light.tint} />
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Adresse</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <MapPin size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Rechercher une adresse..."
                placeholderTextColor={Colors.light.textMuted}
                value={addressQuery}
                onChangeText={handleAddressChange}
                onFocus={() => addressSuggestions.length > 0 && setShowSuggestions(true)}
                autoCorrect={false}
                keyboardType="default"
              />
              {isSearching && (
                <View style={styles.searchIndicator}>
                  <ActivityIndicator size="small" color={Colors.light.tint} />
                </View>
              )}
              {!isSearching && addressQuery.length >= 3 && (
                <View style={styles.searchIndicator}>
                  <Search size={16} color={Colors.light.textMuted} />
                </View>
              )}
            </View>
            
            {showSuggestions && addressSuggestions.length > 0 && (
              <View style={styles.suggestionsContainer}>
                {addressSuggestions.map((suggestion, index) => (
                  <Pressable
                    key={`${suggestion.label}-${index}`}
                    style={({ pressed }) => [
                      styles.suggestionItem,
                      pressed && styles.suggestionItemPressed,
                      index < addressSuggestions.length - 1 && styles.suggestionBorder,
                    ]}
                    onPress={() => selectAddress(suggestion)}
                  >
                    <MapPin size={14} color={Colors.light.tint} />
                    <View style={styles.suggestionTextContainer}>
                      <Text style={styles.suggestionLabel} numberOfLines={1}>
                        {suggestion.label}
                      </Text>
                      <Text style={styles.suggestionContext} numberOfLines={1}>
                        {suggestion.context}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
            
            <View style={styles.row}>
              <View style={[styles.inputGroup, styles.flex1]}>
                <TextInput
                  style={styles.input}
                  placeholder="Code postal"
                  placeholderTextColor={Colors.light.textMuted}
                  value={form.postalCode}
                  onChangeText={(v) => updateField('postalCode', v)}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, styles.flex2]}>
                <TextInput
                  style={styles.input}
                  placeholder="Ville"
                  placeholderTextColor={Colors.light.textMuted}
                  value={form.city}
                  onChangeText={(v) => updateField('city', v)}
                  autoCorrect={false}
                  keyboardType="default"
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Mail size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Email"
                placeholderTextColor={Colors.light.textMuted}
                value={form.email}
                onChangeText={(v) => updateField('email', v.toLowerCase().replace(/\s/g, ''))}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Phone size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Téléphone"
                placeholderTextColor={Colors.light.textMuted}
                value={form.phone}
                onChangeText={(v) => updateField('phone', v)}
                keyboardType="phone-pad"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations légales</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <FileText size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="SIRET"
                placeholderTextColor={Colors.light.textMuted}
                value={form.siret}
                onChangeText={(v) => updateField('siret', v)}
                keyboardType="number-pad"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <FileText size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Numéro TVA intracommunautaire"
                placeholderTextColor={Colors.light.textMuted}
                value={form.tvaNumber}
                onChangeText={(v) => updateField('tvaNumber', v)}
                autoCapitalize="characters"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <CreditCard size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="IBAN"
                placeholderTextColor={Colors.light.textMuted}
                value={form.iban}
                onChangeText={(v) => updateField('iban', v)}
                autoCapitalize="characters"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Forme juridique</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Briefcase size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Forme juridique (SARL, SAS, EI...)"
                placeholderTextColor={Colors.light.textMuted}
                value={form.legalForm}
                onChangeText={(v) => updateField('legalForm', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Scale size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Capital social (ex: 10 000 €)"
                placeholderTextColor={Colors.light.textMuted}
                value={form.capital}
                onChangeText={(v) => updateField('capital', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>RCS (Commerçants)</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <Landmark size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Numéro RCS"
                placeholderTextColor={Colors.light.textMuted}
                value={form.rcsNumber}
                onChangeText={(v) => updateField('rcsNumber', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <MapPin size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Ville du greffe d'immatriculation"
                placeholderTextColor={Colors.light.textMuted}
                value={form.rcsCity}
                onChangeText={(v) => updateField('rcsCity', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Répertoire des métiers (Artisans)</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <FileText size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Numéro RM"
                placeholderTextColor={Colors.light.textMuted}
                value={form.rmNumber}
                onChangeText={(v) => updateField('rmNumber', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
            
            <View style={styles.inputGroup}>
              <View style={styles.inputIcon}>
                <MapPin size={18} color={Colors.light.tint} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="Département d'immatriculation"
                placeholderTextColor={Colors.light.textMuted}
                value={form.rmDepartment}
                onChangeText={(v) => updateField('rmDepartment', v)}
                autoCorrect={false}
                keyboardType="default"
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Exonération TVA</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setForm(prev => ({ ...prev, vatExempt: !prev.vatExempt }))}
            >
              <View style={styles.toggleContent}>
                <Text style={styles.toggleTitle}>Non assujetti à la TVA</Text>
                <Text style={styles.toggleDescription}>Article 293 B du CGI</Text>
              </View>
              <View style={[styles.toggle, form.vatExempt && styles.toggleActive]}>
                {form.vatExempt && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Textes par défaut</Text>
          <View style={styles.card}>
            <View style={styles.inputGroup}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Conditions de paiement par défaut..."
                placeholderTextColor={Colors.light.textMuted}
                value={form.defaultConditions}
                onChangeText={(v) => updateField('defaultConditions', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
            
            <View style={[styles.inputGroup, { borderBottomWidth: 0 }]}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Mentions légales par défaut..."
                placeholderTextColor={Colors.light.textMuted}
                value={form.defaultLegalMentions}
                onChangeText={(v) => updateField('defaultLegalMentions', v)}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
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
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  inputIcon: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: Colors.light.text,
  },
  row: {
    flexDirection: 'row',
  },
  flex1: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: Colors.light.borderLight,
  },
  flex2: {
    flex: 2,
  },
  searchIndicator: {
    paddingHorizontal: 12,
  },
  suggestionsContainer: {
    backgroundColor: Colors.light.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  suggestionItemPressed: {
    backgroundColor: Colors.light.borderLight,
  },
  suggestionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  suggestionTextContainer: {
    flex: 1,
  },
  suggestionLabel: {
    fontSize: 14,
    color: Colors.light.text,
    fontWeight: '500' as const,
  },
  suggestionContext: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  logoPickerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  logoPreviewContainer: {
    width: 60,
    height: 60,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.light.surfaceSecondary,
  },
  logoPreview: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoPickerContent: {
    flex: 1,
  },
  logoPickerTitle: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.text,
    marginBottom: 2,
  },
  logoPickerDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  logoPickerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  toggleContent: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  toggleDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  toggle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.light.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  textArea: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
});
