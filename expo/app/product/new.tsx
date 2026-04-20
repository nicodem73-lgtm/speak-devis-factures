import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import ProductForm from '@/components/ProductForm';
import { useDatabase } from '@/providers/DatabaseProvider';
import { createProduct } from '@/db/products';
import { ProductFormData } from '@/types/product';

export default function NewProductScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db } = useDatabase();

  const { mutate: createProductMutation, isPending } = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!db) throw new Error('Database not ready');
      return createProduct(db, data);
    },
    onSuccess: (productId) => {
      console.log('[NewProduct] Product created:', productId);
      queryClient.invalidateQueries({ queryKey: ['products'] });
      router.back();
    },
    onError: (error) => {
      console.error('[NewProduct] Create error:', error);
      Alert.alert('Erreur', 'Impossible de créer le produit');
    },
  });

  const handleSubmit = useCallback((data: ProductFormData) => {
    console.log('[NewProduct] Submitting:', data);
    createProductMutation(data);
  }, [createProductMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  return (
    <>
      <Stack.Screen options={{ title: 'Nouveau produit' }} />
      <ProductForm
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isPending}
        submitLabel="Créer"
      />
    </>
  );
}
