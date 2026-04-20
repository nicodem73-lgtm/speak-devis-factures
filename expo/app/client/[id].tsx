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
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Pencil,
  Trash2,
  ChevronRight,
} from 'lucide-react-native';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getClientById, deleteClient } from '@/db/clients';
import Colors from '@/constants/colors';

interface Document {
  id: number;
  type: 'devis' | 'facture';
  number: string;
  status: string;
  total_ttc: number;
  date: string;
  is_einvoice?: number;
  document_subtype?: string;
}

function getDocumentDisplayType(doc: Document): string {
  if (doc.type === 'facture' && doc.document_subtype === 'credit_note') return 'Avoir';
  if (doc.type === 'facture' && doc.is_einvoice === 1) return 'E-facture';
  return doc.type === 'devis' ? 'Devis' : 'Facture';
}

export default function ClientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { db, isReady } = useDatabase();
  const clientId = parseInt(id || '0', 10);

  const { data: client, isLoading: isLoadingClient } = useQuery({
    queryKey: ['client', clientId, db],
    queryFn: async () => {
      if (!db) return null;
      console.log('[ClientDetail] Fetching client:', clientId);
      return getClientById(db, clientId);
    },
    enabled: isReady && !!db && clientId > 0,
  });

  const { data: documents = [] } = useQuery({
    queryKey: ['client-documents', clientId, db],
    queryFn: async () => {
      if (!db) return [];
      console.log('[ClientDetail] Fetching client documents:', clientId);
      const results = await db.getAllAsync<Document>(
        'SELECT * FROM documents WHERE client_id = ? ORDER BY date DESC',
        [clientId]
      );
      return results;
    },
    enabled: isReady && !!db && clientId > 0,
  });

  const { mutate: deleteClientMutation } = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await deleteClient(db, clientId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      router.back();
    },
    onError: (error) => {
      console.error('[ClientDetail] Delete error:', error);
      Alert.alert('Erreur', 'Impossible de supprimer ce client');
    },
  });

  const handleEdit = useCallback(() => {
    router.push(`/client/edit/${clientId}`);
  }, [router, clientId]);

  const handleDelete = useCallback(() => {
    if (documents.length > 0) {
      Alert.alert(
        'Suppression impossible',
        'Ce client a des documents associés. Supprimez d\'abord les documents.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Supprimer le client',
      `Êtes-vous sûr de vouloir supprimer ${client?.name} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => deleteClientMutation(),
        },
      ]
    );
  }, [client, documents.length, deleteClientMutation]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      sent: 'Envoyé',
      accepted: 'Accepté',
      rejected: 'Refusé',
      paid: 'Payé',
      cancelled: 'Annulé',
    };
    return labels[status] || status;
  };

  const getStatusColor = (status: string) => {
    return Colors.status[status as keyof typeof Colors.status] || Colors.light.textMuted;
  };

  if (!isReady || isLoadingClient) {
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
          title: client.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              <TouchableOpacity onPress={handleEdit} style={styles.headerButton}>
                <Pencil size={20} color={Colors.light.tint} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} style={styles.headerButton}>
                <Trash2 size={20} color={Colors.light.error} />
              </TouchableOpacity>
            </View>
          ),
        }}
      />

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <User size={32} color={Colors.light.tint} />
          </View>
          <Text style={styles.name}>{client.name}</Text>
          {client.company && (
            <View style={styles.companyRow}>
              <Building2 size={14} color={Colors.light.textSecondary} />
              <Text style={styles.company}>{client.company}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={styles.card}>
            {client.email && (
              <View style={styles.infoRow}>
                <Mail size={18} color={Colors.light.textMuted} />
                <Text style={styles.infoText}>{client.email}</Text>
              </View>
            )}
            {client.phone && (
              <View style={styles.infoRow}>
                <Phone size={18} color={Colors.light.textMuted} />
                <Text style={styles.infoText}>{client.phone}</Text>
              </View>
            )}
            {(client.address || client.city) && (
              <View style={styles.infoRow}>
                <MapPin size={18} color={Colors.light.textMuted} />
                <View style={styles.addressContainer}>
                  {client.address && <Text style={styles.infoText}>{client.address}</Text>}
                  <Text style={styles.infoText}>
                    {[client.postal_code, client.city].filter(Boolean).join(' ')}
                  </Text>
                  {client.country && client.country !== 'France' && (
                    <Text style={styles.infoText}>{client.country}</Text>
                  )}
                </View>
              </View>
            )}
            {!client.email && !client.phone && !client.address && !client.city && (
              <Text style={styles.emptyInfo}>Aucune information de contact</Text>
            )}
          </View>
        </View>

        {client.notes && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>
            <View style={styles.card}>
              <Text style={styles.notesText}>{client.notes}</Text>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Documents ({documents.length})
          </Text>
          {documents.length === 0 ? (
            <View style={styles.card}>
              <View style={styles.emptyDocuments}>
                <FileText size={32} color={Colors.light.textMuted} />
                <Text style={styles.emptyDocumentsText}>Aucun document</Text>
              </View>
            </View>
          ) : (
            <View style={styles.documentsContainer}>
              {documents.map((doc) => (
                <TouchableOpacity
                  key={doc.id}
                  style={styles.documentCard}
                  onPress={() => console.log('Open document:', doc.id)}
                >
                  <View style={styles.documentInfo}>
                    <View style={styles.documentHeader}>
                      <Text style={styles.documentNumber}>{doc.number}</Text>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(doc.status) + '20' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(doc.status) }]}>
                          {getStatusLabel(doc.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.documentDate}>{formatDate(doc.date)}</Text>
                    <Text style={styles.documentType}>
                      {getDocumentDisplayType(doc)}
                    </Text>
                  </View>
                  <View style={styles.documentRight}>
                    <Text style={styles.documentAmount}>{formatCurrency(doc.total_ttc)}</Text>
                    <ChevronRight size={18} color={Colors.light.textMuted} />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View style={styles.metaSection}>
          <Text style={styles.metaText}>
            Client créé le {formatDate(client.created_at)}
          </Text>
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
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: Colors.light.textSecondary,
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.light.tint,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600' as const,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 16,
  },
  headerButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: Colors.light.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.light.text,
    textAlign: 'center',
  },
  companyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  company: {
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 15,
    color: Colors.light.text,
    flex: 1,
  },
  addressContainer: {
    flex: 1,
  },
  emptyInfo: {
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  notesText: {
    fontSize: 15,
    color: Colors.light.text,
    lineHeight: 22,
  },
  documentsContainer: {
    gap: 10,
  },
  documentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 14,
  },
  documentInfo: {
    flex: 1,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  documentNumber: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  documentDate: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 2,
  },
  documentType: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  documentRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  documentAmount: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  emptyDocuments: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyDocumentsText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    marginTop: 8,
  },
  metaSection: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 32,
  },
  metaText: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
});
