import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import {
  Shield,
  Key,
  Lock,
  Link2,
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Server,
  FileKey,
  User,
  RefreshCw,
  Zap,
  TestTube,
  Radio,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Clock,
} from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getEInvoiceSettings, saveEInvoiceSettings } from '@/utils/einvoiceProvider';
import { PdpEnvironment } from '@/types/einvoice';

const SECURE_KEYS = {
  PDP_API_KEY: 'pdp_api_key',
  PDP_CERTIFICATE: 'pdp_certificate',
  PDP_LOGIN: 'pdp_login',
} as const;

async function getSecureValue(key: string): Promise<string> {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value || '';
  } catch (e) {
    console.error('[PDPConfig] Error reading secure store:', key, e);
    return '';
  }
}

async function setSecureValue(key: string, value: string): Promise<void> {
  try {
    if (value) {
      await SecureStore.setItemAsync(key, value);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (e) {
    console.error('[PDPConfig] Error writing secure store:', key, e);
    throw e;
  }
}

function MaskedValue({ value, label }: { value: string; label: string }) {
  if (!value) return <Text style={styles.emptyValue}>Non configuré</Text>;
  const masked = value.length > 6
    ? value.substring(0, 3) + '•'.repeat(Math.min(value.length - 6, 20)) + value.substring(value.length - 3)
    : '•'.repeat(value.length);
  return <Text style={styles.maskedValue}>{masked}</Text>;
}

export default function PDPConfigScreen() {
  const { db, isReady } = useDatabase();
  const queryClient = useQueryClient();

  const [pdpLogin, setPdpLogin] = useState('');
  const [pdpApiKey, setPdpApiKey] = useState('');
  const [pdpCertificate, setPdpCertificate] = useState('');
  const [pdpProvider, setPdpProvider] = useState('');
  const [pdpEnvironment, setPdpEnvironment] = useState<PdpEnvironment>('test');
  const [testEndpoint, setTestEndpoint] = useState('');
  const [productionEndpoint, setProductionEndpoint] = useState('');

  const [showApiKey, setShowApiKey] = useState(false);
  const [showCertificate, setShowCertificate] = useState(false);
  const [credentialsLoaded, setCredentialsLoaded] = useState(false);

  const envAnimValue = useRef(new Animated.Value(0)).current;

  const { data: settings, isLoading } = useQuery({
    queryKey: ['einvoiceSettings', db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceSettings(db);
    },
    enabled: isReady && !!db,
  });

  const { data: secureCredentials, isLoading: isLoadingCredentials } = useQuery({
    queryKey: ['pdpSecureCredentials'],
    queryFn: async () => {
      const [login, apiKey, certificate] = await Promise.all([
        getSecureValue(SECURE_KEYS.PDP_LOGIN),
        getSecureValue(SECURE_KEYS.PDP_API_KEY),
        getSecureValue(SECURE_KEYS.PDP_CERTIFICATE),
      ]);
      return { login, apiKey, certificate };
    },
  });

  useEffect(() => {
    if (settings) {
      setPdpProvider(settings.pdpProvider || '');
      setPdpEnvironment((settings.pdpEnvironment as PdpEnvironment) || 'test');
      setTestEndpoint(settings.pdpTestEndpoint || settings.pdpEndpoint || '');
      setProductionEndpoint(settings.pdpProductionEndpoint || '');
    }
  }, [settings]);

  useEffect(() => {
    if (secureCredentials && !credentialsLoaded) {
      setPdpLogin(secureCredentials.login);
      setPdpApiKey(secureCredentials.apiKey);
      setPdpCertificate(secureCredentials.certificate);
      setCredentialsLoaded(true);
    }
  }, [secureCredentials, credentialsLoaded]);

  useEffect(() => {
    Animated.timing(envAnimValue, {
      toValue: pdpEnvironment === 'production' ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [pdpEnvironment, envAnimValue]);

  const { mutate: save, isPending: isSaving } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('No database');

      await Promise.all([
        setSecureValue(SECURE_KEYS.PDP_LOGIN, pdpLogin),
        setSecureValue(SECURE_KEYS.PDP_API_KEY, pdpApiKey),
        setSecureValue(SECURE_KEYS.PDP_CERTIFICATE, pdpCertificate),
      ]);
      console.log('[PDPConfig] Secure credentials saved');

      const activeEndpoint = pdpEnvironment === 'production' ? productionEndpoint : testEndpoint;

      await saveEInvoiceSettings(db, {
        pdpProvider: pdpProvider || undefined,
        pdpEndpoint: activeEndpoint || undefined,
        pdpEnvironment,
        pdpTestEndpoint: testEndpoint || undefined,
        pdpProductionEndpoint: productionEndpoint || undefined,
        pdpLogin: pdpLogin ? '***configured***' : undefined,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['einvoiceSettings'] });
      queryClient.invalidateQueries({ queryKey: ['pdpSecureCredentials'] });
      Alert.alert('Succès', 'Configuration PDP enregistrée de manière sécurisée');
    },
    onError: (error) => {
      console.error('[PDPConfig] Save error:', error);
      Alert.alert('Erreur', 'Impossible d\'enregistrer la configuration');
    },
  });

  const handleSwitchToProduction = useCallback(() => {
    if (pdpEnvironment === 'test') {
      Alert.alert(
        '⚠️ Passer en mode RÉEL',
        'Attention : en mode réel, les factures seront réellement transmises à la PDP. Cette action affecte vos obligations fiscales.\n\nÊtes-vous sûr de vouloir passer en production ?',
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Confirmer le passage en RÉEL',
            style: 'destructive',
            onPress: () => setPdpEnvironment('production'),
          },
        ]
      );
    } else {
      setPdpEnvironment('test');
    }
  }, [pdpEnvironment]);

  const { mutate: clearCredentials } = useMutation({
    mutationFn: async () => {
      await Promise.all([
        SecureStore.deleteItemAsync(SECURE_KEYS.PDP_LOGIN),
        SecureStore.deleteItemAsync(SECURE_KEYS.PDP_API_KEY),
        SecureStore.deleteItemAsync(SECURE_KEYS.PDP_CERTIFICATE),
      ]);
      setPdpLogin('');
      setPdpApiKey('');
      setPdpCertificate('');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pdpSecureCredentials'] });
      Alert.alert('Succès', 'Identifiants supprimés du stockage sécurisé');
    },
  });

  const handleClearCredentials = useCallback(() => {
    Alert.alert(
      'Supprimer les identifiants',
      'Cette action supprimera définitivement vos identifiants PDP du stockage sécurisé. Êtes-vous sûr ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => clearCredentials() },
      ]
    );
  }, [clearCredentials]);

  const handleTestConnection = useCallback(() => {
    const endpoint = pdpEnvironment === 'production' ? productionEndpoint : testEndpoint;
    if (!endpoint) {
      Alert.alert('Erreur', 'Veuillez renseigner l\'URL de l\'endpoint');
      return;
    }
    if (!pdpApiKey && !pdpLogin) {
      Alert.alert('Erreur', 'Veuillez renseigner vos identifiants');
      return;
    }
    Alert.alert(
      'Test de connexion',
      `Mode : ${pdpEnvironment === 'production' ? 'RÉEL' : 'TEST'}\nEndpoint : ${endpoint}\n\nLa connexion sera testée lors de l'intégration avec votre PDP.`,
      [{ text: 'OK' }]
    );
  }, [pdpEnvironment, productionEndpoint, testEndpoint, pdpApiKey, pdpLogin]);

  const hasCredentials = !!pdpLogin || !!pdpApiKey;
  const hasEndpoint = pdpEnvironment === 'production' ? !!productionEndpoint : !!testEndpoint;
  const isConfigured = hasCredentials && hasEndpoint && !!pdpProvider;

  const envBgColor = envAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#3B82F615', '#EF444415'],
  });
  const envBorderColor = envAnimValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['#3B82F630', '#EF444430'],
  });

  if (isLoading || isLoadingCredentials) {
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
          title: 'Configurer ma PDP',
          headerRight: () => (
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={() => save()}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Enregistrer</Text>
              )}
            </TouchableOpacity>
          ),
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>

        <Animated.View style={[
          styles.envBanner,
          { backgroundColor: envBgColor, borderColor: envBorderColor },
        ]}>
          <View style={styles.envBannerContent}>
            <View style={styles.envBannerLeft}>
              {pdpEnvironment === 'production' ? (
                <Radio size={22} color="#EF4444" />
              ) : (
                <TestTube size={22} color="#3B82F6" />
              )}
              <View style={styles.envBannerTextContainer}>
                <Text style={[
                  styles.envBannerTitle,
                  { color: pdpEnvironment === 'production' ? '#EF4444' : '#3B82F6' }
                ]}>
                  {pdpEnvironment === 'production' ? 'MODE RÉEL' : 'MODE TEST'}
                </Text>
                <Text style={styles.envBannerDescription}>
                  {pdpEnvironment === 'production'
                    ? 'Les factures seront réellement transmises'
                    : 'Environnement sandbox — aucun envoi réel'}
                </Text>
              </View>
            </View>
            <Switch
              value={pdpEnvironment === 'production'}
              onValueChange={handleSwitchToProduction}
              trackColor={{ false: '#3B82F6', true: '#EF4444' }}
              thumbColor="#fff"
            />
          </View>
          {pdpEnvironment === 'production' && (
            <View style={styles.envWarning}>
              <AlertTriangle size={14} color="#EF4444" />
              <Text style={styles.envWarningText}>
                Toute facture transmise en mode réel a valeur légale
              </Text>
            </View>
          )}
        </Animated.View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Shield size={16} color={Colors.light.textSecondary} />
            <Text style={styles.sectionTitle}>Fournisseur PDP</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={[styles.inputIconContainer, { backgroundColor: '#8B5CF615' }]}>
                <Server size={18} color="#8B5CF6" />
              </View>
              <View style={styles.inputContent}>
                <Text style={styles.inputLabel}>Nom du fournisseur</Text>
                <TextInput
                  style={styles.input}
                  value={pdpProvider}
                  onChangeText={setPdpProvider}
                  placeholder="ex: Chorus Pro, PDP Libre, Dématik..."
                  placeholderTextColor={Colors.light.textMuted}
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Lock size={16} color={Colors.light.textSecondary} />
            <Text style={styles.sectionTitle}>Identifiants d&apos;authentification</Text>
          </View>
          <View style={styles.secureNotice}>
            <ShieldCheck size={14} color="#10B981" />
            <Text style={styles.secureNoticeText}>
              Stockage sécurisé (Keychain iOS / Keystore Android)
            </Text>
          </View>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={[styles.inputIconContainer, { backgroundColor: '#3B82F615' }]}>
                <User size={18} color="#3B82F6" />
              </View>
              <View style={styles.inputContent}>
                <Text style={styles.inputLabel}>Login / Identifiant PDP</Text>
                <TextInput
                  style={styles.input}
                  value={pdpLogin}
                  onChangeText={setPdpLogin}
                  placeholder="Identifiant fourni par la PDP"
                  placeholderTextColor={Colors.light.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="pdp-login-input"
                />
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.inputRow}>
              <View style={[styles.inputIconContainer, { backgroundColor: '#F59E0B15' }]}>
                <Key size={18} color="#F59E0B" />
              </View>
              <View style={styles.inputContent}>
                <Text style={styles.inputLabel}>Clé API / Token</Text>
                <View style={styles.secretRow}>
                  <TextInput
                    style={[styles.input, styles.secretInput]}
                    value={pdpApiKey}
                    onChangeText={setPdpApiKey}
                    placeholder="Clé API sécurisée"
                    placeholderTextColor={Colors.light.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showApiKey}
                    testID="pdp-api-key-input"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowApiKey(!showApiKey)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {showApiKey ? (
                      <EyeOff size={18} color={Colors.light.textMuted} />
                    ) : (
                      <Eye size={18} color={Colors.light.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.inputRow}>
              <View style={[styles.inputIconContainer, { backgroundColor: '#10B98115' }]}>
                <FileKey size={18} color="#10B981" />
              </View>
              <View style={styles.inputContent}>
                <Text style={styles.inputLabel}>Certificat X.509 / Clé publique</Text>
                <View style={styles.secretRow}>
                  <TextInput
                    style={[styles.input, styles.secretInput, styles.certificateInput]}
                    value={pdpCertificate}
                    onChangeText={setPdpCertificate}
                    placeholder="Collez votre certificat ou clé publique ici"
                    placeholderTextColor={Colors.light.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={!showCertificate}
                    multiline={showCertificate}
                    numberOfLines={showCertificate ? 4 : 1}
                    testID="pdp-certificate-input"
                  />
                  <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowCertificate(!showCertificate)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    {showCertificate ? (
                      <EyeOff size={18} color={Colors.light.textMuted} />
                    ) : (
                      <Eye size={18} color={Colors.light.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          {hasCredentials && (
            <TouchableOpacity style={styles.clearButton} onPress={handleClearCredentials}>
              <Trash2 size={14} color="#EF4444" />
              <Text style={styles.clearButtonText}>Supprimer les identifiants</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Link2 size={16} color={Colors.light.textSecondary} />
            <Text style={styles.sectionTitle}>Endpoints API</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.endpointHeader}>
              <TestTube size={16} color="#3B82F6" />
              <Text style={styles.endpointHeaderText}>Endpoint TEST (sandbox)</Text>
              {pdpEnvironment === 'test' && (
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>ACTIF</Text>
                </View>
              )}
            </View>
            <View style={[styles.inputRow, { paddingTop: 0 }]}>
              <View style={styles.inputContent}>
                <TextInput
                  style={styles.input}
                  value={testEndpoint}
                  onChangeText={setTestEndpoint}
                  placeholder="https://sandbox.pdp-exemple.fr/api"
                  placeholderTextColor={Colors.light.textMuted}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="pdp-test-endpoint-input"
                />
              </View>
            </View>

            <View style={styles.separator} />

            <View style={styles.endpointHeader}>
              <Radio size={16} color="#EF4444" />
              <Text style={[styles.endpointHeaderText, { color: '#EF4444' }]}>
                Endpoint RÉEL (production)
              </Text>
              {pdpEnvironment === 'production' && (
                <View style={[styles.activeBadge, styles.activeBadgeProduction]}>
                  <Text style={[styles.activeBadgeText, { color: '#EF4444' }]}>ACTIF</Text>
                </View>
              )}
            </View>
            <View style={[styles.inputRow, { paddingTop: 0 }]}>
              <View style={styles.inputContent}>
                <TextInput
                  style={styles.input}
                  value={productionEndpoint}
                  onChangeText={setProductionEndpoint}
                  placeholder="https://api.pdp-exemple.fr/v1"
                  placeholderTextColor={Colors.light.textMuted}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="pdp-prod-endpoint-input"
                />
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Zap size={16} color={Colors.light.textSecondary} />
            <Text style={styles.sectionTitle}>Test de connexion</Text>
          </View>
          <TouchableOpacity
            style={[styles.testButton, !isConfigured && styles.testButtonDisabled]}
            onPress={handleTestConnection}
            disabled={!hasEndpoint}
          >
            <RefreshCw size={18} color={isConfigured ? '#FFFFFF' : Colors.light.textMuted} />
            <Text style={[
              styles.testButtonText,
              !isConfigured && styles.testButtonTextDisabled
            ]}>
              Tester la connexion
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <CheckCircle2 size={16} color={Colors.light.textSecondary} />
            <Text style={styles.sectionTitle}>Récapitulatif</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Fournisseur</Text>
              <Text style={[styles.summaryValue, !pdpProvider && styles.summaryValueEmpty]}>
                {pdpProvider || 'Non configuré'}
              </Text>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Login</Text>
              {pdpLogin ? (
                <MaskedValue value={pdpLogin} label="Login" />
              ) : (
                <Text style={styles.summaryValueEmpty}>Non configuré</Text>
              )}
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Clé API</Text>
              {pdpApiKey ? (
                <View style={styles.summaryConfigured}>
                  <ShieldCheck size={14} color="#10B981" />
                  <Text style={styles.summaryConfiguredText}>Configurée</Text>
                </View>
              ) : (
                <Text style={styles.summaryValueEmpty}>Non configurée</Text>
              )}
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Certificat</Text>
              {pdpCertificate ? (
                <View style={styles.summaryConfigured}>
                  <ShieldCheck size={14} color="#10B981" />
                  <Text style={styles.summaryConfiguredText}>Configuré</Text>
                </View>
              ) : (
                <Text style={styles.summaryValueEmpty}>Optionnel</Text>
              )}
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Environnement</Text>
              <View style={[
                styles.envTag,
                pdpEnvironment === 'production' ? styles.envTagProd : styles.envTagTest
              ]}>
                <Text style={[
                  styles.envTagText,
                  { color: pdpEnvironment === 'production' ? '#EF4444' : '#3B82F6' }
                ]}>
                  {pdpEnvironment === 'production' ? 'RÉEL' : 'TEST'}
                </Text>
              </View>
            </View>
            <View style={styles.separator} />
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Endpoint actif</Text>
              <Text style={[
                styles.summaryValue,
                !hasEndpoint && styles.summaryValueEmpty
              ]} numberOfLines={1}>
                {(pdpEnvironment === 'production' ? productionEndpoint : testEndpoint) || 'Non configuré'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoSection}>
          <View style={styles.infoHeader}>
            <ShieldAlert size={18} color="#F59E0B" />
            <Text style={styles.infoTitle}>Sécurité & bonnes pratiques</Text>
          </View>
          <View style={styles.infoItem}>
            <Lock size={14} color={Colors.light.textSecondary} />
            <Text style={styles.infoText}>
              Vos identifiants sont stockés dans le coffre-fort sécurisé du système (Keychain iOS / Keystore Android)
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Key size={14} color={Colors.light.textSecondary} />
            <Text style={styles.infoText}>
              Ne partagez jamais vos clés API. Renouvelez-les régulièrement via le portail de votre PDP
            </Text>
          </View>
          <View style={styles.infoItem}>
            <Clock size={14} color={Colors.light.textSecondary} />
            <Text style={styles.infoText}>
              Les tokens ont une durée de vie limitée. Vérifiez la validité depuis votre espace PDP
            </Text>
          </View>
          <View style={styles.infoItem}>
            <AlertTriangle size={14} color={Colors.light.textSecondary} />
            <Text style={styles.infoText}>
              Testez toujours en mode TEST avant de passer en mode RÉEL
            </Text>
          </View>
        </View>

      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  saveButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  envBanner: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
  },
  envBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  envBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  envBannerTextContainer: {
    flex: 1,
  },
  envBannerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  envBannerDescription: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  envWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#EF444420',
  },
  envWarningText: {
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500' as const,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  secureNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginLeft: 4,
  },
  secureNoticeText: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '500' as const,
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
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  inputIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  inputContent: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginBottom: 4,
  },
  input: {
    fontSize: 15,
    color: Colors.light.text,
    padding: 0,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secretInput: {
    flex: 1,
  },
  certificateInput: {
    minHeight: 20,
  },
  eyeButton: {
    padding: 4,
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 16,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  endpointHeaderText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#3B82F6',
  },
  activeBadge: {
    backgroundColor: '#3B82F615',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  activeBadgeProduction: {
    backgroundColor: '#EF444415',
  },
  activeBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  testButtonDisabled: {
    backgroundColor: Colors.light.borderLight,
  },
  testButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  testButtonTextDisabled: {
    color: Colors.light.textMuted,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    padding: 10,
  },
  clearButtonText: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '500' as const,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    paddingHorizontal: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    maxWidth: '55%' as unknown as number,
    textAlign: 'right' as const,
  },
  summaryValueEmpty: {
    color: Colors.light.textMuted,
    fontStyle: 'italic' as const,
  },
  summaryConfigured: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryConfiguredText: {
    fontSize: 13,
    color: '#10B981',
    fontWeight: '500' as const,
  },
  envTag: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  envTagTest: {
    backgroundColor: '#3B82F615',
  },
  envTagProd: {
    backgroundColor: '#EF444415',
  },
  envTagText: {
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  emptyValue: {
    fontSize: 13,
    color: Colors.light.textMuted,
    fontStyle: 'italic' as const,
  },
  maskedValue: {
    fontSize: 13,
    color: Colors.light.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  infoSection: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginTop: 8,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 19,
  },
});
