import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Stack } from 'expo-router';
import { 
  Inbox, 
  FileText, 
  Calendar, 
  Building2,
  RefreshCw,
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllEInvoiceEnvelopes } from '@/db/einvoice';
import { getEInvoiceSettings } from '@/utils/einvoiceProvider';
import { EInvoiceStatusBadge } from '@/components/EInvoiceTimeline';
import { EInvoiceEnvelope, EINVOICE_FORMAT_LABELS } from '@/types/einvoice';
import { formatDate } from '@/types/document';

type TabType = 'outbound' | 'inbound';

export default function EInvoiceInboxScreen() {
  
  const { db, isReady } = useDatabase();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>('outbound');
  const [refreshing, setRefreshing] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['einvoiceSettings', db],
    queryFn: async () => {
      if (!db) return null;
      return getEInvoiceSettings(db);
    },
    enabled: isReady && !!db,
  });

  const { data: envelopes = [], isLoading } = useQuery({
    queryKey: ['einvoiceEnvelopes', db, activeTab],
    queryFn: async () => {
      if (!db) return [];
      return getAllEInvoiceEnvelopes(db, activeTab);
    },
    enabled: isReady && !!db,
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ['einvoiceEnvelopes'] });
    setRefreshing(false);
  };

  const isPdpConnected = settings?.pdpProvider && settings?.pdpEndpoint;

  const renderEnvelope = (envelope: EInvoiceEnvelope) => (
    <TouchableOpacity 
      key={envelope.id} 
      style={styles.envelopeCard}
      activeOpacity={0.7}
    >
      <View style={styles.envelopeHeader}>
        <View style={styles.envelopeIcon}>
          <FileText size={20} color="#8B5CF6" />
        </View>
        <View style={styles.envelopeInfo}>
          <Text style={styles.envelopeId}>Facture #{envelope.invoice_id}</Text>
          <Text style={styles.envelopeFormat}>
            {EINVOICE_FORMAT_LABELS[envelope.format]}
          </Text>
        </View>
        <EInvoiceStatusBadge status={envelope.status} size="small" />
      </View>
      
      <View style={styles.envelopeMeta}>
        <View style={styles.metaItem}>
          <Calendar size={14} color={Colors.light.textMuted} />
          <Text style={styles.metaText}>{formatDate(envelope.created_at)}</Text>
        </View>
        {envelope.pdp_reference && (
          <View style={styles.metaItem}>
            <Building2 size={14} color={Colors.light.textMuted} />
            <Text style={styles.metaText}>{envelope.pdp_reference}</Text>
          </View>
        )}
      </View>

      {envelope.error_message && (
        <View style={styles.errorBanner}>
          <AlertCircle size={14} color="#EF4444" />
          <Text style={styles.errorText}>{envelope.error_message}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Boîte e-factures',
          headerRight: () => (
            <TouchableOpacity
              style={styles.refreshButton}
              onPress={handleRefresh}
              disabled={refreshing}
            >
              <RefreshCw 
                size={20} 
                color={Colors.light.tint} 
                style={refreshing ? { opacity: 0.5 } : undefined}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <View style={styles.container}>
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'outbound' && styles.tabActive]}
            onPress={() => setActiveTab('outbound')}
          >
            <ArrowUpRight 
              size={16} 
              color={activeTab === 'outbound' ? '#8B5CF6' : Colors.light.textMuted} 
            />
            <Text style={[
              styles.tabText,
              activeTab === 'outbound' && styles.tabTextActive
            ]}>
              Émises
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'inbound' && styles.tabActive]}
            onPress={() => setActiveTab('inbound')}
          >
            <ArrowDownLeft 
              size={16} 
              color={activeTab === 'inbound' ? '#8B5CF6' : Colors.light.textMuted} 
            />
            <Text style={[
              styles.tabText,
              activeTab === 'inbound' && styles.tabTextActive
            ]}>
              Reçues
            </Text>
          </TouchableOpacity>
        </View>

        {!isPdpConnected && (
          <View style={styles.noConnectionBanner}>
            <AlertCircle size={18} color="#F59E0B" />
            <View style={styles.noConnectionContent}>
              <Text style={styles.noConnectionTitle}>PDP non connectée</Text>
              <Text style={styles.noConnectionText}>
                {activeTab === 'inbound' 
                  ? 'Les factures reçues seront disponibles après connexion à une PDP'
                  : 'Les factures sont préparées localement en attendant 2026'}
              </Text>
            </View>
          </View>
        )}

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.light.tint}
            />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.light.tint} />
            </View>
          ) : envelopes.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <Inbox size={48} color={Colors.light.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>
                {activeTab === 'inbound' ? 'Aucune facture reçue' : 'Aucune e-facture'}
              </Text>
              <Text style={styles.emptyText}>
                {activeTab === 'inbound'
                  ? 'Les factures fournisseurs apparaîtront ici après connexion à une PDP'
                  : 'Créez une facture avec l\'option "Facture électronique" activée'}
              </Text>
            </View>
          ) : (
            <View style={styles.envelopeList}>
              {envelopes.map(renderEnvelope)}
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            {envelopes.length} e-facture{envelopes.length !== 1 ? 's' : ''} {activeTab === 'inbound' ? 'reçue' : 'émise'}{envelopes.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  tabs: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.light.surface,
    gap: 8,
  },
  tabActive: {
    backgroundColor: '#8B5CF615',
    borderWidth: 1,
    borderColor: '#8B5CF630',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.textMuted,
  },
  tabTextActive: {
    color: '#8B5CF6',
  },
  noConnectionBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F59E0B10',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#F59E0B20',
  },
  noConnectionContent: {
    flex: 1,
  },
  noConnectionTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#F59E0B',
    marginBottom: 2,
  },
  noConnectionText: {
    fontSize: 12,
    color: '#F59E0B',
    opacity: 0.8,
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 32,
  },
  envelopeList: {
    gap: 12,
  },
  envelopeCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  envelopeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  envelopeIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#8B5CF615',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  envelopeInfo: {
    flex: 1,
  },
  envelopeId: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  envelopeFormat: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  envelopeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF444410',
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#EF4444',
  },
  refreshButton: {
    padding: 8,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
});
