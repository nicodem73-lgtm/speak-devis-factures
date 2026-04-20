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
import { Users, Search, Plus, Building2, ChevronRight, Mic } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import EmptyState from '@/components/EmptyState';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllClients } from '@/db/clients';
import { Client } from '@/types/client';
import VoiceCommand from '@/components/VoiceCommand';
import { ActionDraft } from '@/types/voice';

export default function ClientsScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const [showVoiceCommand, setShowVoiceCommand] = useState(false);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients', db],
    queryFn: async () => {
      if (!db) return [];
      console.log('[Clients] Fetching clients...');
      return getAllClients(db);
    },
    enabled: isReady && !!db,
  });

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const query = searchQuery.toLowerCase();
    return clients.filter(
      (client) =>
        client.name.toLowerCase().includes(query) ||
        client.company?.toLowerCase().includes(query) ||
        client.email?.toLowerCase().includes(query) ||
        client.phone?.includes(query)
    );
  }, [clients, searchQuery]);

  const handleCreateClient = useCallback(() => {
    console.log('[Clients] Navigate to create client');
    router.push('/client/new');
  }, [router]);

  const handleClientPress = useCallback((client: Client) => {
    console.log('[Clients] Navigate to client:', client.id);
    router.push(`/client/${client.id}`);
  }, [router]);

  const handleVoiceAction = useCallback((action: ActionDraft) => {
    console.log('[Clients] Voice action received:', action);
    
    switch (action.intent) {
      case 'CREATE_CLIENT': {
        const nameField = action.extractedFields.find(f => f.key === 'name');
        const companyField = action.extractedFields.find(f => f.key === 'company');
        const emailField = action.extractedFields.find(f => f.key === 'email');
        const phoneField = action.extractedFields.find(f => f.key === 'phone');
        const params = new URLSearchParams();
        if (nameField) params.set('name', String(nameField.value));
        if (companyField) params.set('company', String(companyField.value));
        if (emailField) params.set('email', String(emailField.value));
        if (phoneField) params.set('phone', String(phoneField.value));
        const queryString = params.toString();
        router.push(`/client/new${queryString ? `?${queryString}` : ''}` as never);
        break;
      }
      case 'SEARCH': {
        const queryField = action.extractedFields.find(f => f.key === 'query');
        if (queryField) {
          setSearchQuery(String(queryField.value));
        }
        break;
      }
      default:
        console.log('[Clients] Unhandled voice action:', action.intent);
    }
  }, [router]);

  const renderClient = useCallback(({ item }: { item: Client }) => (
    <TouchableOpacity
      style={styles.clientCard}
      onPress={() => handleClientPress(item)}
      activeOpacity={0.7}
      testID={`client-item-${item.id}`}
    >
      <View style={styles.clientAvatar}>
        <Text style={styles.avatarText}>
          {item.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.clientInfo}>
        <Text style={styles.clientName} numberOfLines={1}>{item.name}</Text>
        {item.company && (
          <View style={styles.companyRow}>
            <Building2 size={12} color={Colors.light.textMuted} />
            <Text style={styles.companyText} numberOfLines={1}>{item.company}</Text>
          </View>
        )}
        {item.email && (
          <Text style={styles.emailText} numberOfLines={1}>{item.email}</Text>
        )}
      </View>
      <ChevronRight size={20} color={Colors.light.textMuted} />
    </TouchableOpacity>
  ), [handleClientPress]);

  const keyExtractor = useCallback((item: Client) => item.id.toString(), []);

  if (!isReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (clients.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={Users}
          title="Aucun client"
          description="Ajoutez vos clients pour créer des devis et factures rapidement."
          actionLabel="Ajouter un client"
          onAction={handleCreateClient}
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
            placeholder="Rechercher un client..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            autoComplete="off"
            keyboardType="default"
            testID="client-search-input"
          />
        </View>
        <TouchableOpacity
          style={styles.voiceButton}
          onPress={() => setShowVoiceCommand(true)}
          testID="voice-command-button"
        >
          <Mic size={20} color={Colors.light.tint} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleCreateClient}
          testID="add-client-button"
        >
          <Plus size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <VoiceCommand
        visible={showVoiceCommand}
        onClose={() => setShowVoiceCommand(false)}
        onAction={handleVoiceAction}
        initialMode="command"
      />

      {filteredClients.length === 0 ? (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>Aucun résultat pour « {searchQuery} »</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClients}
          renderItem={renderClient}
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
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
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
  clientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  clientAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  clientInfo: {
    flex: 1,
    gap: 2,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  companyText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  emailText: {
    fontSize: 13,
    color: Colors.light.textMuted,
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
