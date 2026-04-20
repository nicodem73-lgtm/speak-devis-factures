import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, router } from 'expo-router';
import { Percent, Plus, Trash2, Check, Star } from 'lucide-react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getTaxRates, saveTaxRates, TaxRate } from '@/db/settings';

export default function TaxesSettingsScreen() {
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  
  const [rates, setRates] = useState<TaxRate[]>([]);

  const { data: taxRates, isLoading } = useQuery({
    queryKey: ['taxRates', db],
    queryFn: () => getTaxRates(db!),
    enabled: !!db,
  });

  useEffect(() => {
    if (taxRates) {
      setRates(taxRates);
    }
  }, [taxRates]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await saveTaxRates(db, rates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxRates'] });
      Alert.alert('Succès', 'Taux de TVA enregistrés');
      router.back();
    },
    onError: (error) => {
      console.error('[TaxesSettings] Save error:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    },
  });

  const addRate = () => {
    const newId = Date.now().toString();
    setRates(prev => [...prev, { id: newId, name: '', rate: 0, isDefault: false }]);
  };

  const updateRate = (id: string, field: keyof TaxRate, value: string | number | boolean) => {
    setRates(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const setDefaultRate = (id: string) => {
    setRates(prev => prev.map(r => ({ ...r, isDefault: r.id === id })));
  };

  const deleteRate = (id: string) => {
    if (rates.length <= 1) {
      Alert.alert('Erreur', 'Vous devez garder au moins un taux de TVA');
      return;
    }
    const rate = rates.find(r => r.id === id);
    if (rate?.isDefault) {
      Alert.alert('Erreur', 'Vous ne pouvez pas supprimer le taux par défaut');
      return;
    }
    setRates(prev => prev.filter(r => r.id !== id));
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Taux de TVA',
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
          Configurez les taux de TVA disponibles pour vos produits et documents.
        </Text>

        <View style={styles.ratesList}>
          {rates.map((rate) => (
            <View key={rate.id} style={styles.rateCard}>
              <View style={styles.rateHeader}>
                <TouchableOpacity 
                  style={[styles.defaultButton, rate.isDefault && styles.defaultButtonActive]}
                  onPress={() => setDefaultRate(rate.id)}
                >
                  <Star 
                    size={16} 
                    color={rate.isDefault ? '#FFF' : Colors.light.textMuted} 
                    fill={rate.isDefault ? '#FFF' : 'transparent'}
                  />
                </TouchableOpacity>
                <View style={styles.rateInputs}>
                  <View style={styles.nameInputContainer}>
                    <Text style={styles.tvaLabel}>TVA</Text>
                  </View>
                  <View style={styles.rateValueContainer}>
                    <TextInput
                      style={styles.rateInput}
                      placeholder="0"
                      placeholderTextColor={Colors.light.textMuted}
                      value={rate.rate.toString()}
                      onChangeText={(v) => {
                        const parsed = v.replace(',', '.');
                        const num = parseFloat(parsed);
                        updateRate(rate.id, 'rate', isNaN(num) ? 0 : num);
                      }}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                    />
                    <Percent size={16} color={Colors.light.textSecondary} />
                  </View>
                </View>
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => deleteRate(rate.id)}
                >
                  <Trash2 size={18} color={Colors.light.error} />
                </TouchableOpacity>
              </View>
              {rate.isDefault && (
                <View style={styles.defaultBadge}>
                  <Text style={styles.defaultBadgeText}>Taux par défaut</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.addButton} onPress={addRate}>
          <Plus size={20} color={Colors.light.tint} />
          <Text style={styles.addButtonText}>Ajouter un taux</Text>
        </TouchableOpacity>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>Taux français courants</Text>
          <Text style={styles.infoText}>• 20% - Taux normal</Text>
          <Text style={styles.infoText}>• 10% - Taux intermédiaire (restauration, travaux...)</Text>
          <Text style={styles.infoText}>• 5,5% - Taux réduit (alimentation, livres...)</Text>
          <Text style={styles.infoText}>• 2,1% - Taux super réduit (médicaments...)</Text>
        </View>
      </ScrollView>
    </View>
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
  ratesList: {
    gap: 12,
  },
  rateCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rateHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  defaultButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultButtonActive: {
    backgroundColor: Colors.light.warning,
  },
  rateInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nameInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tvaLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  rateValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 2,
  },
  rateInput: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
    width: 45,
    textAlign: 'right',
  },
  deleteButton: {
    padding: 8,
  },
  defaultBadge: {
    backgroundColor: Colors.light.warning + '20',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  defaultBadgeText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.warning,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginTop: 16,
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: Colors.light.borderLight,
    gap: 8,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  infoBox: {
    marginTop: 24,
    backgroundColor: Colors.light.surfaceSecondary,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    lineHeight: 18,
  },
});
