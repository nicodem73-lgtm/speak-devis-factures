import { useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator, Text, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClientForm from '@/components/ClientForm';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getClientById, updateClient } from '@/db/clients';
import { ClientFormData } from '@/types/client';
import Colors from '@/constants/colors';

export default function EditClientScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const clientId = parseInt(id || '0', 10);

  const { data: client, isLoading } = useQuery({
    queryKey: ['client', clientId, db],
    queryFn: async () => {
      if (!db) return null;
      console.log('[EditClient] Fetching client:', clientId);
      return getClientById(db, clientId);
    },
    enabled: isReady && !!db && clientId > 0,
  });

  const { mutate: updateClientMutation, isPending: isUpdating } = useMutation({
    mutationFn: async (data: ClientFormData) => {
      if (!db) throw new Error('Database not ready');
      console.log('[EditClient] Updating client:', clientId);
      await updateClient(db, clientId, data);
    },
    onSuccess: () => {
      console.log('[EditClient] Client updated');
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['client', clientId] });
      router.back();
    },
    onError: (error) => {
      console.error('[EditClient] Error updating client:', error);
      Alert.alert('Erreur', 'Impossible de modifier le client');
    },
  });

  const handleSubmit = useCallback((data: ClientFormData) => {
    updateClientMutation(data);
  }, [updateClientMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  if (!isReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Chargement...' }} />
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  if (!client) {
    return (
      <View style={styles.errorContainer}>
        <Stack.Screen options={{ title: 'Erreur' }} />
        <Text style={styles.errorText}>Client non trouvé</Text>
      </View>
    );
  }

  const initialData: ClientFormData = {
    name: client.name,
    company: client.company || '',
    siret: client.siret || '',
    tva_number: client.tva_number || '',
    email: client.email || '',
    phone: client.phone || '',
    address: client.address || '',
    city: client.city || '',
    postal_code: client.postal_code || '',
    country: client.country || 'France',
    delivery_address: client.delivery_address || '',
    delivery_city: client.delivery_city || '',
    delivery_postal_code: client.delivery_postal_code || '',
    delivery_country: client.delivery_country || '',
    notes: client.notes || '',
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `Modifier ${client.name}` }} />
      <ClientForm
        initialData={initialData}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isUpdating}
        submitLabel="Enregistrer"
      />
    </View>
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
});
