import { useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ProductForm from '@/components/ProductForm';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getProductById, updateProduct } from '@/db/products';
import { ProductFormData, productToFormData } from '@/types/product';

export default function EditProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();

  const productId = parseInt(id, 10);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId, db],
    queryFn: async () => {
      if (!db) return null;
      console.log('[EditProduct] Fetching product:', productId);
      return getProductById(db, productId);
    },
    enabled: isReady && !!db && !isNaN(productId),
  });

  const { mutate: updateProductMutation, isPending } = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!db) throw new Error('Database not ready');
      await updateProduct(db, productId, data);
    },
    onSuccess: () => {
      console.log('[EditProduct] Product updated');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', productId] });
      router.back();
    },
    onError: (error) => {
      console.error('[EditProduct] Update error:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le produit');
    },
  });

  const handleSubmit = useCallback((data: ProductFormData) => {
    console.log('[EditProduct] Submitting:', data);
    updateProductMutation(data);
  }, [updateProductMutation]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  if (!isReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Produit non trouvé</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Modifier le produit' }} />
      <ProductForm
        initialData={productToFormData(product)}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isLoading={isPending}
        submitLabel="Enregistrer"
      />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
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
