import { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Search, X, Briefcase, Box, Plus } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllProducts } from '@/db/products';
import { Product, formatPrice } from '@/types/product';

interface ProductSelectorProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  onCreateNew?: () => void;
}

export default function ProductSelector({
  visible,
  onClose,
  onSelect,
  onCreateNew,
}: ProductSelectorProps) {
  const { db, isReady } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products', db],
    queryFn: async () => {
      if (!db) return [];
      return getAllProducts(db);
    },
    enabled: isReady && !!db && visible,
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

  const handleSelect = useCallback((product: Product) => {
    onSelect(product);
    setSearchQuery('');
    onClose();
  }, [onSelect, onClose]);

  const handleClose = useCallback(() => {
    setSearchQuery('');
    onClose();
  }, [onClose]);

  const renderProduct = useCallback(({ item }: { item: Product }) => (
    <TouchableOpacity
      style={styles.productItem}
      onPress={() => handleSelect(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.productIcon, item.is_service ? styles.serviceIcon : styles.goodIcon]}>
        {item.is_service ? (
          <Briefcase size={18} color={Colors.light.info} />
        ) : (
          <Box size={18} color={Colors.light.success} />
        )}
      </View>
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>
          {formatPrice(item.unit_price)} / {item.unit} • TVA {item.tva_rate}%
        </Text>
      </View>
    </TouchableOpacity>
  ), [handleSelect]);

  const keyExtractor = useCallback((item: Product) => item.id.toString(), []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Sélectionner un produit</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X size={24} color={Colors.light.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Search size={18} color={Colors.light.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
          </View>
        ) : filteredProducts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {searchQuery ? `Aucun résultat pour « ${searchQuery} »` : 'Aucun produit disponible'}
            </Text>
            {onCreateNew && (
              <TouchableOpacity style={styles.createButton} onPress={onCreateNew}>
                <Plus size={18} color="#FFFFFF" />
                <Text style={styles.createButtonText}>Créer un produit</Text>
              </TouchableOpacity>
            )}
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
    </Modal>
  );
}

export interface LineItemFromProduct {
  product_id: number;
  description: string;
  quantity: number;
  unit_price: number;
  tva_rate: number;
  total_ht: number;
}

export function productToLineItem(product: Product, quantity: number = 1): LineItemFromProduct {
  const total_ht = product.unit_price * quantity;
  return {
    product_id: product.id,
    description: product.name,
    quantity,
    unit_price: product.unit_price,
    tva_rate: product.tva_rate,
    total_ht,
  };
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  title: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  closeButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
    margin: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 16,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  createButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    padding: 12,
    gap: 12,
  },
  productIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
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
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  productPrice: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  separator: {
    height: 8,
  },
});
