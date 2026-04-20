import { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Package, Search, Plus, ChevronRight, Briefcase, Box } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import EmptyState from '@/components/EmptyState';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllProducts } from '@/db/products';
import { Product, formatPrice } from '@/types/product';

export default function ProductsScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', db],
    queryFn: async () => {
      if (!db) return [];
      console.log('[Products] Fetching products...');
      return getAllProducts(db);
    },
    enabled: isReady && !!db,
  });

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.description?.toLowerCase().includes(query)
    );
  }, [products, searchQuery]);

  const handleCreateProduct = useCallback(() => {
    console.log('[Products] Navigate to create product');
    router.push('/product/new');
  }, [router]);

  const handleProductPress = useCallback((product: Product) => {
    console.log('[Products] Navigate to product:', product.id);
    router.push(`/product/${product.id}`);
  }, [router]);

  const renderProduct = useCallback(({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => handleProductPress(item)}
      activeOpacity={0.7}
      testID={`product-item-${item.id}`}
    >
      <View style={[styles.productIcon, item.is_service ? styles.serviceIcon : styles.goodIcon]}>
        {item.is_service ? (
          <Briefcase size={20} color={Colors.light.info} />
        ) : (
          <Box size={20} color={Colors.light.success} />
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>
          {formatPrice(item.unit_price)} / {item.unit}
        </Text>
        {item.description && (
          <Text style={styles.productDescription} numberOfLines={1}>{item.description}</Text>
        )}
      </View>
      <View style={styles.productMeta}>
        <Text style={styles.tvaText}>TVA {item.tva_rate}%</Text>
        <ChevronRight size={20} color={Colors.light.textMuted} />
      </View>
    </TouchableOpacity>
  ), [handleProductPress]);

  const keyExtractor = useCallback((item: Product) => item.id.toString(), []);

  if (!isReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (products.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={Package}
          title="Aucun produit ou service"
          description="Créez votre catalogue de produits et services pour accélérer la création de devis."
          actionLabel="Ajouter un produit"
          onAction={handleCreateProduct}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search size={18} color={Colors.light.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher un produit..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            testID="product-search-input"
          />
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleCreateProduct}
          testID="add-product-button"
        >
          <Plus size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {filteredProducts.length === 0 ? (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>Aucun résultat pour « {searchQuery} »</Text>
        </View>
      ) : (
        <FlatList
          data={filteredProducts}
          renderItem={renderProduct}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 8,
    gap: 12,
  },
  searchContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.light.tint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  productIcon: {
    width: 46,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  serviceIcon: {
    backgroundColor: Colors.light.info + '15',
  },
  goodIcon: {
    backgroundColor: Colors.light.success + '15',
  },
  productInfo: {
    flex: 1,
    gap: 2,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  productDescription: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  productMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  tvaText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    backgroundColor: Colors.light.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  separator: {
    height: 10,
  },
  noResultsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  noResultsText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
});
