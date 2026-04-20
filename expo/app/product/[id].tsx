import { useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Pencil, Trash2, Briefcase, Box, Euro, Percent, Package as PackageIcon } from 'lucide-react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getProductById, deleteProduct, getProductUsageCount } from '@/db/products';
import { formatPrice } from '@/types/product';

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();

  const productId = parseInt(id, 10);

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId, db],
    queryFn: async () => {
      if (!db) return null;
      console.log('[ProductDetail] Fetching product:', productId);
      return getProductById(db, productId);
    },
    enabled: isReady && !!db && !isNaN(productId),
  });

  const { data: usageCount = 0 } = useQuery({
    queryKey: ['product-usage', productId, db],
    queryFn: async () => {
      if (!db) return 0;
      return getProductUsageCount(db, productId);
    },
    enabled: isReady && !!db && !isNaN(productId),
  });

  const { mutate: deleteProductMutation } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await deleteProduct(db, productId);
    },
    onSuccess: () => {
      console.log('[ProductDetail] Product deleted');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      router.back();
    },
    onError: (error) => {
      console.error('[ProductDetail] Delete error:', error);
      Alert.alert('Erreur', 'Impossible de supprimer ce produit');
    },
  });

  const handleEdit = useCallback(() => {
    router.push(`/product/edit/${productId}`);
  }, [router, productId]);

  const handleDelete = useCallback(() => {
    if (usageCount > 0) {
      Alert.alert(
        'Attention',
        `Ce produit est utilisé dans ${usageCount} document(s). La suppression est impossible.`,
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Supprimer le produit',
      'Êtes-vous sûr de vouloir supprimer ce produit ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteProductMutation(),
        },
      ]
    );
  }, [usageCount, deleteProductMutation]);

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
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: product.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleEdit} style={styles.headerButton} testID="edit-product-button">
                <Pencil size={20} color={Colors.light.tint} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerButton} testID="delete-product-button">
                <Trash2 size={20} color={Colors.light.error} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, product.is_service ? styles.serviceIcon : styles.goodIcon]}>
            {product.is_service ? (
              <Briefcase size={32} color={Colors.light.info} />
            ) : (
              <Box size={32} color={Colors.light.success} />
            )}
          </View>
          <Text style={styles.productName}>{product.name}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {product.is_service ? 'Service' : 'Produit'}
            </Text>
          </View>
        </View>

        {product.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.descriptionText}>{product.description}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tarification</Text>
          
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Euro size={18} color={Colors.light.tint} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Prix unitaire HT</Text>
                <Text style={styles.infoValue}>{formatPrice(product.unit_price)}</Text>
              </View>
            </View>

            <View style={styles.infoSeparator} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <PackageIcon size={18} color={Colors.light.tint} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Unité</Text>
                <Text style={styles.infoValue}>{product.unit}</Text>
              </View>
            </View>

            <View style={styles.infoSeparator} />

            <View style={styles.infoRow}>
              <View style={styles.infoIconContainer}>
                <Percent size={18} color={Colors.light.tint} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Taux TVA</Text>
                <Text style={styles.infoValue}>{product.tva_rate}%</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Utilisation</Text>
          <View style={styles.usageCard}>
            <Text style={styles.usageValue}>{usageCount}</Text>
            <Text style={styles.usageLabel}>
              {usageCount === 1 ? 'document utilise ce produit' : 'documents utilisent ce produit'}
            </Text>
          </View>
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
    gap: 16,
  },
  errorText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  backButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    marginBottom: 8,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  serviceIcon: {
    backgroundColor: Colors.light.info + '15',
  },
  goodIcon: {
    backgroundColor: Colors.light.success + '15',
  },
  productName: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.light.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  badge: {
    backgroundColor: Colors.light.surfaceSecondary,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
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
  descriptionText: {
    fontSize: 15,
    color: Colors.light.text,
    lineHeight: 22,
    backgroundColor: Colors.light.surface,
    padding: 14,
    borderRadius: 12,
  },
  infoCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  infoIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginTop: 2,
  },
  infoSeparator: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginHorizontal: 14,
  },
  usageCard: {
    backgroundColor: Colors.light.surface,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  usageValue: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  usageLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
});
