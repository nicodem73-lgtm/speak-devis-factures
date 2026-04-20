import { useState, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FileText, Search, Plus, ChevronRight, X, FileCheck, Receipt, Mic, Package, Truck, RotateCcw } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import EmptyState from '@/components/EmptyState';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useAppMode } from '@/providers/AppModeProvider';
import { getAllDocuments } from '@/db/documents';
import { Document, DocumentType, STATUS_LABELS, formatCurrency, formatDate, isOverdue, isCreditNote, getDocumentDisplayType } from '@/types/document';
import { EInvoiceStatus, EINVOICE_STATUS_LABELS, EINVOICE_STATUS_COLORS } from '@/types/einvoice';
import VoiceCommand from '@/components/VoiceCommand';
import { ActionDraft } from '@/types/voice';

type TypeFilter = 'all' | DocumentType;
type StatusFilter = 'all' | 'draft' | 'sent' | 'paid' | 'overdue';

const TYPE_FILTERS: { key: TypeFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'devis', label: 'Devis' },
  { key: 'facture', label: 'Factures' },
];

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'draft', label: 'Brouillon' },
  { key: 'sent', label: 'Envoyé' },
  { key: 'paid', label: 'Payé' },
  { key: 'overdue', label: 'En retard' },
];

export default function DocumentsScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const { isTestMode } = useAppMode();
  const isTestFlag = isTestMode ? 1 : 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showVoiceCommand, setShowVoiceCommand] = useState(false);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', db, isTestFlag],
    queryFn: async () => {
      if (!db) return [];
      console.log('[Documents] Fetching documents... isTest:', isTestFlag);
      return getAllDocuments(db, isTestFlag);
    },
    enabled: isReady && !!db,
  });

  const filteredDocuments = useMemo(() => {
    let result = documents;

    if (typeFilter !== 'all') {
      result = result.filter((doc) => doc.type === typeFilter);
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'overdue') {
        result = result.filter((doc) => isOverdue(doc));
      } else {
        result = result.filter((doc) => doc.status === statusFilter);
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (doc) =>
          doc.number.toLowerCase().includes(query) ||
          doc.client_name?.toLowerCase().includes(query) ||
          doc.client_company?.toLowerCase().includes(query) ||
          formatCurrency(doc.total_ttc).includes(query)
      );
    }

    return result;
  }, [documents, typeFilter, statusFilter, searchQuery]);

  const handleCreateDevis = useCallback(() => {
    setShowNewModal(false);
    console.log('[Documents] Navigate to create devis');
    router.push('/document/new?type=devis');
  }, [router]);

  const handleCreateFacture = useCallback(() => {
    setShowNewModal(false);
    console.log('[Documents] Navigate to create facture');
    router.push('/document/new?type=facture');
  }, [router]);

  const handleOpenDeliveryNotes = useCallback(() => {
    setShowNewModal(false);
    console.log('[Documents] Navigate to delivery notes');
    router.push('/delivery-notes');
  }, [router]);

  const handleCreateAvoir = useCallback(() => {
    setShowNewModal(false);
    console.log('[Documents] Navigate to create avoir (credit note)');
    router.push('/document/credit-note');
  }, [router]);

  const handleDocumentPress = useCallback((doc: Document) => {
    console.log('[Documents] Navigate to document:', doc.id);
    router.push(`/document/${doc.id}` as never);
  }, [router]);

  const handleVoiceAction = useCallback((action: ActionDraft) => {
    console.log('[Documents] Voice action received:', action);
    
    switch (action.intent) {
      case 'CREATE_CLIENT': {
        const nameField = action.extractedFields.find(f => f.key === 'name');
        const params = nameField ? `?name=${encodeURIComponent(String(nameField.value))}` : '';
        router.push(`/client/new${params}` as never);
        break;
      }
      case 'CREATE_QUOTE': {
        const clientField = action.extractedFields.find(f => f.key === 'client_name');
        const params = clientField ? `?type=devis&clientName=${encodeURIComponent(String(clientField.value))}` : '?type=devis';
        router.push(`/document/new${params}` as never);
        break;
      }
      case 'CREATE_INVOICE': {
        const clientField = action.extractedFields.find(f => f.key === 'client_name');
        const params = clientField ? `?type=facture&clientName=${encodeURIComponent(String(clientField.value))}` : '?type=facture';
        router.push(`/document/new${params}` as never);
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
        console.log('[Documents] Unhandled voice action:', action.intent);
    }
  }, [router]);

  const getStatusColor = useCallback((doc: Document): string => {
    if (isOverdue(doc)) return Colors.light.error;
    return Colors.status[doc.status] || Colors.status.draft;
  }, []);

  const getStatusLabel = useCallback((doc: Document): string => {
    if (isOverdue(doc)) return 'En retard';
    return STATUS_LABELS[doc.status];
  }, []);

  const renderDocument = useCallback(({ item }: { item: Document }) => {
    const statusColor = getStatusColor(item);
    const statusLabel = getStatusLabel(item);
    const isEInvoice = item.is_einvoice === 1;
    
    return (
      <TouchableOpacity
        style={styles.documentCard}
        onPress={() => handleDocumentPress(item)}
        activeOpacity={0.7}
        testID={`document-item-${item.id}`}
      >
        <View style={styles.documentHeader}>
          <View style={[styles.typeTag, { backgroundColor: isCreditNote(item) ? Colors.light.error + '15' : item.type === 'devis' ? Colors.light.info + '15' : isEInvoice ? '#8B5CF6' + '15' : Colors.light.success + '15' }]}>
            <Text style={[styles.typeText, { color: isCreditNote(item) ? Colors.light.error : item.type === 'devis' ? Colors.light.info : isEInvoice ? '#8B5CF6' : Colors.light.success }]}>
              {getDocumentDisplayType(item)}
            </Text>
          </View>
          {item.type === 'devis' && item.status === 'cancelled' && (
            <View style={styles.cancelledTag}>
              <Text style={styles.cancelledTagText}>Annulé</Text>
            </View>
          )}

          {isEInvoice && item.einvoice_status && (
            <View style={[styles.einvoiceStatusTag, { backgroundColor: (EINVOICE_STATUS_COLORS[item.einvoice_status as EInvoiceStatus] || '#6B7280') + '15' }]}>
              <View style={[styles.einvoiceStatusDot, { backgroundColor: EINVOICE_STATUS_COLORS[item.einvoice_status as EInvoiceStatus] || '#6B7280' }]} />
              <Text style={[styles.einvoiceStatusText, { color: EINVOICE_STATUS_COLORS[item.einvoice_status as EInvoiceStatus] || '#6B7280' }]}>
                {EINVOICE_STATUS_LABELS[item.einvoice_status as EInvoiceStatus] || item.einvoice_status}
              </Text>
            </View>
          )}
          <View style={[styles.statusTag, { backgroundColor: statusColor + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.documentBody}>
          <Text style={styles.documentNumber}>{item.number}</Text>
          <Text style={styles.clientName} numberOfLines={1}>
            {item.client_name || 'Client inconnu'}
            {item.client_company ? ` • ${item.client_company}` : ''}
          </Text>
          <Text style={styles.documentDate}>{formatDate(item.date)}</Text>
        </View>

        <View style={styles.documentFooter}>
          <Text style={styles.documentAmount}>{formatCurrency(item.total_ttc)}</Text>
          <ChevronRight size={20} color={Colors.light.textMuted} />
        </View>
      </TouchableOpacity>
    );
  }, [handleDocumentPress, getStatusColor, getStatusLabel]);

  const keyExtractor = useCallback((item: Document) => item.id.toString(), []);

  if (!isReady || isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  if (documents.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={FileText}
          title="Aucun document"
          description="Créez votre premier devis ou facture pour commencer à gérer votre activité."
          actionLabel="Créer un document"
          onAction={() => setShowNewModal(true)}
        />
        <NewDocumentModal
          visible={showNewModal}
          onClose={() => setShowNewModal(false)}
          onCreateDevis={handleCreateDevis}
          onCreateFacture={handleCreateFacture}
          onCreateAvoir={handleCreateAvoir}
          onOpenDeliveryNotes={handleOpenDeliveryNotes}
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
            placeholder="Rechercher..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            testID="document-search-input"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color={Colors.light.textMuted} />
            </TouchableOpacity>
          )}
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
          onPress={() => setShowNewModal(true)}
          testID="add-document-button"
        >
          <Plus size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <View style={styles.filtersSection}>
        <View style={styles.filterRow}>
          {TYPE_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.filterChip,
                typeFilter === filter.key && styles.filterChipActive,
              ]}
              onPress={() => setTypeFilter(filter.key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  typeFilter === filter.key && styles.filterChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.blFilterChip}
            onPress={() => router.push('/delivery-notes')}
          >
            <Truck size={14} color={Colors.light.warning} />
            <Text style={styles.blFilterChipText}>BL</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterRow}>
          {STATUS_FILTERS.map((filter) => (
            <TouchableOpacity
              key={filter.key}
              style={[
                styles.statusChip,
                statusFilter === filter.key && styles.statusChipActive,
              ]}
              onPress={() => setStatusFilter(filter.key)}
            >
              <Text
                style={[
                  styles.statusChipText,
                  statusFilter === filter.key && styles.statusChipTextActive,
                ]}
              >
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {filteredDocuments.length === 0 ? (
        <View style={styles.noResultsContainer}>
          <Text style={styles.noResultsText}>
            Aucun document trouvé
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredDocuments}
          renderItem={renderDocument}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <NewDocumentModal
        visible={showNewModal}
        onClose={() => setShowNewModal(false)}
        onCreateDevis={handleCreateDevis}
        onCreateFacture={handleCreateFacture}
        onCreateAvoir={handleCreateAvoir}
        onOpenDeliveryNotes={handleOpenDeliveryNotes}
      />

      <VoiceCommand
        visible={showVoiceCommand}
        onClose={() => setShowVoiceCommand(false)}
        onAction={handleVoiceAction}
        initialMode="command"
      />
    </View>
  );
}

function NewDocumentModal({
  visible,
  onClose,
  onCreateDevis,
  onCreateFacture,
  onCreateAvoir,
  onOpenDeliveryNotes,
}: {
  visible: boolean;
  onClose: () => void;
  onCreateDevis: () => void;
  onCreateFacture: () => void;
  onCreateAvoir: () => void;
  onOpenDeliveryNotes: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Nouveau document</Text>
          
          <TouchableOpacity
            style={styles.modalOption}
            onPress={onCreateDevis}
            activeOpacity={0.7}
          >
            <View style={[styles.modalOptionIcon, { backgroundColor: Colors.light.info + '15' }]}>
              <FileCheck size={24} color={Colors.light.info} />
            </View>
            <View style={styles.modalOptionText}>
              <Text style={styles.modalOptionTitle}>Nouveau devis</Text>
              <Text style={styles.modalOptionDesc}>Créer une proposition commerciale</Text>
            </View>
            <ChevronRight size={20} color={Colors.light.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={onCreateFacture}
            activeOpacity={0.7}
          >
            <View style={[styles.modalOptionIcon, { backgroundColor: Colors.light.success + '15' }]}>
              <Receipt size={24} color={Colors.light.success} />
            </View>
            <View style={styles.modalOptionText}>
              <Text style={styles.modalOptionTitle}>Nouvelle facture</Text>
              <Text style={styles.modalOptionDesc}>Créer une facture client</Text>
            </View>
            <ChevronRight size={20} color={Colors.light.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={onCreateAvoir}
            activeOpacity={0.7}
          >
            <View style={[styles.modalOptionIcon, { backgroundColor: Colors.light.error + '15' }]}>
              <RotateCcw size={24} color={Colors.light.error} />
            </View>
            <View style={styles.modalOptionText}>
              <Text style={styles.modalOptionTitle}>Nouvel avoir</Text>
              <Text style={styles.modalOptionDesc}>Créer une note de crédit</Text>
            </View>
            <ChevronRight size={20} color={Colors.light.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.modalOption}
            onPress={onOpenDeliveryNotes}
            activeOpacity={0.7}
          >
            <View style={[styles.modalOptionIcon, { backgroundColor: '#F59E0B15' }]}>
              <Package size={24} color="#F59E0B" />
            </View>
            <View style={styles.modalOptionText}>
              <Text style={styles.modalOptionTitle}>Bons de livraison</Text>
              <Text style={styles.modalOptionDesc}>Gérer les bons de livraison</Text>
            </View>
            <ChevronRight size={20} color={Colors.light.textMuted} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
            <Text style={styles.modalCancelText}>Annuler</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
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
  filtersSection: {
    paddingHorizontal: 16,
    gap: 10,
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
  statusChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.light.surfaceSecondary,
  },
  statusChipActive: {
    backgroundColor: Colors.light.tint + '20',
  },
  statusChipText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  statusChipTextActive: {
    color: Colors.light.tint,
    fontWeight: '500' as const,
  },
  blFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.warning + '15',
    gap: 6,
  },
  blFilterChipText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.warning,
  },
  einvoiceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#8B5CF615',
    gap: 4,
  },
  einvoiceTagText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  einvoiceStatusTag: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    gap: 4,
  },
  einvoiceStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  einvoiceStatusText: {
    fontSize: 11,
    fontWeight: '600' as const,
  },
  cancelledTag: {
    backgroundColor: Colors.light.error,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cancelledTagText: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  documentCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  typeTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '600' as const,
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
  documentBody: {
    gap: 4,
  },
  documentNumber: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  clientName: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  documentDate: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  documentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  documentAmount: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.light.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.light.background,
    borderRadius: 14,
    marginBottom: 12,
    gap: 14,
  },
  modalOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionText: {
    flex: 1,
    gap: 2,
  },
  modalOptionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  modalOptionDesc: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  modalCancel: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
});
