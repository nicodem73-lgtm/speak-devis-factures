import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router } from 'expo-router';
import { Hash, FileText, Receipt, Check } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getNumberingSettings, saveNumberingSettings, NumberingSettings } from '@/db/settings';

export default function NumberingSettingsScreen() {
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  
  const [form, setForm] = useState<NumberingSettings>({
    devisPrefix: 'DEV-',
    devisCounter: 1,
    facturePrefix: 'FAC-',
    factureCounter: 1,
  });

  const { data: numbering, isLoading } = useQuery({
    queryKey: ['numberingSettings', db],
    queryFn: () => getNumberingSettings(db!),
    enabled: !!db,
  });

  useEffect(() => {
    if (numbering) {
      setForm(numbering);
    }
  }, [numbering]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await saveNumberingSettings(db, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['numberingSettings'] });
      Alert.alert('Succès', 'Numérotation enregistrée');
      router.back();
    },
    onError: (error) => {
      console.error('[NumberingSettings] Save error:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    },
  });

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
          title: 'Numérotation',
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
        <Text style={styles.description}>
          Configurez les préfixes et compteurs pour la numérotation automatique de vos documents.
        </Text>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileText size={20} color={Colors.light.tint} />
            <Text style={styles.sectionTitle}>Devis</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Préfixe</Text>
                <TextInput
                  style={styles.input}
                  placeholder="DEV-"
                  placeholderTextColor={Colors.light.textMuted}
                  value={form.devisPrefix}
                  onChangeText={(v) => setForm(prev => ({ ...prev, devisPrefix: v }))}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Prochain numéro</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor={Colors.light.textMuted}
                  value={form.devisCounter.toString()}
                  onChangeText={(v) => {
                    const num = parseInt(v) || 0;
                    setForm(prev => ({ ...prev, devisCounter: num >= 0 ? num : 0 }));
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
            </View>
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Aperçu :</Text>
              <Text style={styles.previewValue}>
                {form.devisPrefix}{new Date().getFullYear()}-{String(form.devisCounter).padStart(4, '0')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Receipt size={20} color={Colors.light.success} />
            <Text style={styles.sectionTitle}>Factures</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Préfixe</Text>
                <TextInput
                  style={styles.input}
                  placeholder="FAC-"
                  placeholderTextColor={Colors.light.textMuted}
                  value={form.facturePrefix}
                  onChangeText={(v) => setForm(prev => ({ ...prev, facturePrefix: v }))}
                  autoCapitalize="characters"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Prochain numéro</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1"
                  placeholderTextColor={Colors.light.textMuted}
                  value={form.factureCounter.toString()}
                  onChangeText={(v) => {
                    const num = parseInt(v) || 0;
                    setForm(prev => ({ ...prev, factureCounter: num >= 0 ? num : 0 }));
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
              </View>
            </View>
            <View style={styles.preview}>
              <Text style={styles.previewLabel}>Aperçu :</Text>
              <Text style={styles.previewValue}>
                {form.facturePrefix}{new Date().getFullYear()}-{String(form.factureCounter).padStart(4, '0')}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.infoBox}>
          <Hash size={16} color={Colors.light.textSecondary} />
          <Text style={styles.infoText}>
            Les compteurs sont automatiquement incrémentés à chaque création de document.
          </Text>
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
  description: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 24,
    lineHeight: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
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
  },
  inputGroup: {
    flex: 1,
    padding: 16,
    borderRightWidth: 1,
    borderRightColor: Colors.light.borderLight,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  input: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
    padding: 0,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.light.surfaceSecondary,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 8,
  },
  previewLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  previewValue: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.tint,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.light.surfaceSecondary,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
});
