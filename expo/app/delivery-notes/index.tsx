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
import { useRouter, Stack } from 'expo-router';
import { Package, Search, Plus, ChevronRight, X, Weight } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import EmptyState from '@/components/EmptyState';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllDeliveryNotes } from '@/db/deliveryNotes';
import { DeliveryNote, DeliveryNoteStatus, formatWeight, formatDate } from '@/types/deliveryNote';

type StatusFilter = 'all' | DeliveryNoteStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'Brouillon', label: 'Brouillon' },
  { key: 'Envoyé', label: 'Envoyé' },
];

export default function DeliveryNotesScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const { data: deliveryNotes = [], isLoading } = useQuery({
    queryKey: ['delivery-notes', db],
    queryFn: async () => {
      if (!db) return [];
      console.log('[DeliveryNotes] Fetching delivery notes...');
      return getAllDeliveryNotes(db);
    },
    enabled: isReady && !!db,
  });

  const filteredNotes = useMemo(() => {
    let result = deliveryNotes;

    if (statusFilter !== 'all') {
      result = result.filter((note) => note.status === statusFilter);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (note) =>
          note.number.toLowerCase().includes(query) ||
          note.ship_to_name.toLowerCase().includes(query) ||
          note.invoice_number?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [deliveryNotes, statusFilter, searchQuery]);

  const handleCreateNote = useCallback(() => {
    console.log('[DeliveryNotes] Navigate to create delivery note');
    router.push('/delivery-notes/new');
  }, [router]);

  const handleNotePress = useCallback((note: DeliveryNote) => {
    console.log('[DeliveryNotes] Navigate to delivery note:', note.id);
    router.push(`/delivery-notes/${note.id}` as never);
  }, [router]);

  const getStatusColor = useCallback((status: DeliveryNoteStatus): string => {
    return status === 'Envoyé' ? Colors.light.success : Colors.light.warning;
  }, []);

  const renderNote = useCallback(({ item }: { item: DeliveryNote }) => {
    const statusColor = getStatusColor(item.status);
    
    return (
      <TouchableOpacity
        style={styles.noteCard}
        onPress={() => handleNotePress(item)}
        activeOpacity={0.7}
        testID={`delivery-note-item-${item.id}`}
      >
        <View style={styles.noteHeader}>
          <View style={[styles.statusTag, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{item.status}</Text>
          </View>
          <View style={styles.weightTag}>
            <Weight size={14} color={Colors.light.textSecondary} />
            <Text style={styles.weightText}>{formatWeight(item.total_weight_kg)}</Text>
          </View>
        </View>

        <View style={styles.noteBody}>
          <Text style={styles.noteNumber}>{item.number}</Text>
          <Text style={styles.recipientName} numberOfLines={1}>
            {item.ship_to_name}
          </Text>
          {item.invoice_number && (
            <Text style={styles.invoiceRef}>Facture: {item.invoice_number}</Text>
          )}
          <Text style={styles.noteDate}>{formatDate(item.created_at)}</Text>
        </View>

        <View style={styles.noteFooter}>
          <Text style={styles.addressPreview} numberOfLines={1}>
            {item.ship_to_address}
          </Text>
          <ChevronRight size={20} color={Colors.light.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }, [handleNotePress, getStatusColor]);

  const keyExtractor = useCallback((item: DeliveryNote) => item.id, []);

  if (!isReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Stack.Screen options={{ title: 'Bons de livraison' }} />
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (deliveryNotes.length === 0) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Bons de livraison' }} />
        <EmptyState
          icon={Package}
          title="Aucun bon de livraison"
          description="Créez votre premier bon de livraison pour accompagner vos factures."
          actionLabel="Créer un bon de livraison"
          onAction={handleCreateNote}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Bons de livraison' }} />
      
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search size={18} color={Colors.light.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Rechercher..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            testID="delivery-note-search-input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={Colors.light.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleCreateNote}
          testID="add-delivery-note-button"
        >
          <Plus size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersSection}>
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterChip,
                statusFilter === filter.key && styles.filterChipActive,
              ]}
              onPress={() => setStatusFilter(filter.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  statusFilter === filter.key && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {filteredNotes.length === 0 ? (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>
            Aucun bon de livraison trouvé
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredNotes}
          renderItem={renderNote}
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
  filtersSection: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
  },
  filterChipActive: {
    backgroundColor: Colors.light.tint,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  noteCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  weightTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.light.surfaceSecondary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  weightText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
  },
  noteBody: {
    gap: 4,
  },
  noteNumber: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  recipientName: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  invoiceRef: {
    fontSize: 13,
    color: Colors.light.tint,
  },
  noteDate: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  addressPreview: {
    flex: 1,
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  separator: {
    height: 12,
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
