import { useCallback } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ClientForm from '@/components/ClientForm';
import { useDatabase } from '@/providers/DatabaseProvider';
import { createClient } from '@/db/clients';
import { ClientFormData } from '@/types/client';
import Colors from '@/constants/colors';

export default function NewClientScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db } = useDatabase();

  const { mutate: createClientMutation, isPending: isCreating } = useMutation({
    mutationFn: async (data: ClientFormData) => {
      if (!db) throw new Error('Database not ready');
      console.log('[NewClient] Creating client:', data.name);
      return createClient(db, data);
    },
    onSuccess: (clientId) => {
      console.log('[NewClient] Client created:', clientId);
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.back();
    },
    onError: (error) => {
      console.error('[NewClient] Error creating client:', error);
      Alert.alert('Erreur', 'Impossible de créer le client');
    },
  });

  const handleSubmit = useCallback((data: ClientFormData) => {
    createClientMutation(data);
  }, [createClientMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Nouveau client' }} />
      <ClientForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isCreating}
        submitLabel="Créer le client"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
});
