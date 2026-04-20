import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Search,
  X,
  FileText,
  Users,
  FileCheck,
  Receipt,
  UserPlus,
  ChevronRight,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getAllDocuments } from '@/db/documents';
import { getAllClients } from '@/db/clients';
import { Document, formatCurrency, TYPE_LABELS } from '@/types/document';
import { Client } from '@/types/client';


type SearchCategory = 'all' | 'documents' | 'clients';

export default function SearchScreen() {
  const router = useRouter();
  const { db, isReady } = useDatabase();
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef<TextInput>(null);
  const [category, setCategory] = useState<SearchCategory>('all');
  const [isFocused, setIsFocused] = useState(false);

  const lastDetectedTextRef = useRef<string>('');
  const ignoreEmptyUntilRef = useRef<number>(0);

  useEffect(() => {
    if (!isFocused) return;
    
    const checkInterval = setInterval(() => {
      if (inputRef.current) {
        const nativeInput = inputRef.current as any;
        const nativeText = nativeInput._lastNativeText;
        
        if (nativeText !== undefined && nativeText !== lastDetectedTextRef.current) {
          lastDetectedTextRef.current = nativeText;
          
          if (nativeText.trim().length > 0) {
            ignoreEmptyUntilRef.current = Date.now() + 2000;
            if (nativeText !== searchQuery) {
              setSearchQuery(nativeText);
            }
          } else if (Date.now() > ignoreEmptyUntilRef.current) {
            if (searchQuery !== '') {
              setSearchQuery('');
            }
          }
        }
      }
    }, 300);

    return () => clearInterval(checkInterval);
  }, [isFocused, searchQuery]);

  const { data: documents = [], isLoading: loadingDocs } = useQuery({
    queryKey: ['documents', db],
    queryFn: async () => {
      if (!db) return [];
      return getAllDocuments(db);
    },
    enabled: isReady && !!db,
  });

  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ['clients', db],
    queryFn: async () => {
      if (!db) return [];
      return getAllClients(db);
    },
    enabled: isReady && !!db,
  });

  const normalizeText = useCallback((text: string) => {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9@.\s-]/g, '')
      .trim();
  }, []);

  const getPhoneticCode = useCallback((text: string): string => {
    let s = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    s = s.replace(/ph/g, 'f')
         .replace(/qu/g, 'k')
         .replace(/ck/g, 'k')
         .replace(/cc/g, 'k')
         .replace(/ch/g, 's')
         .replace(/gu/g, 'g')
         .replace(/gn/g, 'n')
         .replace(/ll/g, 'l')
         .replace(/ss/g, 's')
         .replace(/tt/g, 't')
         .replace(/nn/g, 'n')
         .replace(/mm/g, 'm')
         .replace(/pp/g, 'p')
         .replace(/bb/g, 'b')
         .replace(/dd/g, 'd')
         .replace(/ff/g, 'f')
         .replace(/rr/g, 'r')
         .replace(/au/g, 'o')
         .replace(/eau/g, 'o')
         .replace(/ai/g, 'e')
         .replace(/ei/g, 'e')
         .replace(/ou/g, 'u')
         .replace(/oi/g, 'wa')
         .replace(/[dt]$/g, '')
         .replace(/[sz]$/g, '')
         .replace(/e$/g, '')
         .replace(/[^a-z0-9]/g, '');
    
    return s;
  }, []);

  const levenshteinDistance = useCallback((a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }, []);

  const fuzzyMatch = useCallback((searchTerm: string, target: string): boolean => {
    const normalizedSearch = normalizeText(searchTerm);
    const normalizedTarget = normalizeText(target);
    
    if (normalizedTarget.includes(normalizedSearch)) {
      return true;
    }
    
    const phoneticSearch = getPhoneticCode(searchTerm);
    const phoneticTarget = getPhoneticCode(target);
    
    if (phoneticTarget.includes(phoneticSearch) || phoneticSearch.includes(phoneticTarget)) {
      return true;
    }
    
    const targetWords = normalizedTarget.split(/\s+/);
    for (const word of targetWords) {
      if (word.length >= 3 && normalizedSearch.length >= 3) {
        const distance = levenshteinDistance(normalizedSearch, word);
        const maxLen = Math.max(normalizedSearch.length, word.length);
        const similarity = 1 - (distance / maxLen);
        if (similarity >= 0.7) {
          return true;
        }
        
        const phoneticWord = getPhoneticCode(word);
        const phoneticDist = levenshteinDistance(phoneticSearch, phoneticWord);
        const phoneticMaxLen = Math.max(phoneticSearch.length, phoneticWord.length);
        const phoneticSimilarity = 1 - (phoneticDist / phoneticMaxLen);
        if (phoneticSimilarity >= 0.75) {
          return true;
        }
      }
    }
    
    return false;
  }, [normalizeText, getPhoneticCode, levenshteinDistance]);

  const matchesSearch = useCallback((searchTerms: string[], targetFields: (string | undefined | null)[]) => {
    const validFields = targetFields.filter(Boolean) as string[];
    
    return searchTerms.some(term => 
      validFields.some(field => fuzzyMatch(term, field))
    );
  }, [fuzzyMatch]);

  const filteredDocuments = useMemo(() => {
    if (!searchQuery.trim() || (category !== 'all' && category !== 'documents')) return [];
    
    const normalizedQuery = normalizeText(searchQuery);
    const searchTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) return [];
    
    return documents.filter((doc) => {
      const fieldsToSearch = [
        doc.number,
        doc.client_name,
        doc.client_company,
      ];
      return matchesSearch(searchTerms, fieldsToSearch);
    }).slice(0, 10);
  }, [documents, searchQuery, category, normalizeText, matchesSearch]);

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim() || (category !== 'all' && category !== 'clients')) return [];
    
    const normalizedQuery = normalizeText(searchQuery);
    const searchTerms = normalizedQuery.split(/\s+/).filter(term => term.length > 0);
    
    if (searchTerms.length === 0) return [];
    
    return clients.filter((client) => {
      const fieldsToSearch = [
        client.name,
        client.company,
        client.email,
        client.phone,
      ];
      return matchesSearch(searchTerms, fieldsToSearch);
    }).slice(0, 10);
  }, [clients, searchQuery, category, normalizeText, matchesSearch]);

  const handleDocumentPress = useCallback((doc: Document) => {
    router.push(`/document/${doc.id}` as never);
  }, [router]);

  const handleClientPress = useCallback((client: Client) => {
    router.push(`/client/${client.id}` as never);
  }, [router]);

  const isLoading = loadingDocs || loadingClients;

  return (
    <View style={styles.container}>
      <View style={styles.searchHeader}>
        <View style={styles.searchContainer}>
          <Search size={20} color={Colors.light.textMuted} />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder="Rechercher un document, client..."
            placeholderTextColor={Colors.light.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onChange={(e) => {
              const text = e.nativeEvent.text;
              if (text !== searchQuery) {
                setSearchQuery(text);
              }
            }}
            onEndEditing={(e) => {
              const text = e.nativeEvent.text;
              if (text && text !== searchQuery) {
                setSearchQuery(text);
              }
            }}
            onSubmitEditing={(e) => {
              const text = e.nativeEvent.text;
              if (text && text !== searchQuery) {
                setSearchQuery(text);
              }
            }}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            autoCorrect={false}
            autoFocus
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={20} color={Colors.light.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.categoryRow}>
        {(['all', 'documents', 'clients'] as SearchCategory[]).map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.categoryChip, category === cat && styles.categoryChipActive]}
            onPress={() => setCategory(cat)}
          >
            <Text style={[styles.categoryText, category === cat && styles.categoryTextActive]}>
              {cat === 'all' ? 'Tout' : cat === 'documents' ? 'Documents' : 'Clients'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions rapides</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/document/new?type=devis')}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.info + '15' }]}>
                <FileCheck size={24} color={Colors.light.info} />
              </View>
              <Text style={styles.actionLabel}>Nouveau devis</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/document/new?type=facture')}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.success + '15' }]}>
                <Receipt size={24} color={Colors.light.success} />
              </View>
              <Text style={styles.actionLabel}>Nouvelle facture</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => router.push('/client/new')}
            >
              <View style={[styles.actionIcon, { backgroundColor: Colors.light.tint + '15' }]}>
                <UserPlus size={24} color={Colors.light.tint} />
              </View>
              <Text style={styles.actionLabel}>Nouveau client</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color={Colors.light.tint} />
          </View>
        )}

        {/* Search Results */}
        {searchQuery.trim().length > 0 && (
          <>
            {filteredDocuments.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Documents</Text>
                <View style={styles.resultsList}>
                  {filteredDocuments.map((doc) => (
                    <TouchableOpacity
                      key={doc.id}
                      style={styles.resultItem}
                      onPress={() => handleDocumentPress(doc)}
                    >
                      <View style={[styles.resultIcon, { backgroundColor: doc.type === 'devis' ? Colors.light.info + '15' : Colors.light.success + '15' }]}>
                        <FileText size={18} color={doc.type === 'devis' ? Colors.light.info : Colors.light.success} />
                      </View>
                      <View style={styles.resultContent}>
                        <Text style={styles.resultTitle}>{doc.number}</Text>
                        <Text style={styles.resultSubtitle}>
                          {TYPE_LABELS[doc.type]} • {doc.client_name || 'Client inconnu'}
                        </Text>
                      </View>
                      <Text style={styles.resultAmount}>{formatCurrency(doc.total_ttc)}</Text>
                      <ChevronRight size={18} color={Colors.light.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {filteredClients.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Clients</Text>
                <View style={styles.resultsList}>
                  {filteredClients.map((client) => (
                    <TouchableOpacity
                      key={client.id}
                      style={styles.resultItem}
                      onPress={() => handleClientPress(client)}
                    >
                      <View style={[styles.resultIcon, { backgroundColor: Colors.light.tint + '15' }]}>
                        <Users size={18} color={Colors.light.tint} />
                      </View>
                      <View style={styles.resultContent}>
                        <Text style={styles.resultTitle}>{client.name}</Text>
                        <Text style={styles.resultSubtitle}>
                          {client.company || client.email || 'Pas de détails'}
                        </Text>
                      </View>
                      <ChevronRight size={18} color={Colors.light.textMuted} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {filteredDocuments.length === 0 && filteredClients.length === 0 && !isLoading && (
              <View style={styles.noResults}>
                <Text style={styles.noResultsText}>Aucun résultat trouvé</Text>
                <Text style={styles.noResultsHint}>Essayez avec d&apos;autres termes de recherche</Text>
              </View>
            )}
          </>
        )}

        {!searchQuery.trim() && (
          <View style={styles.emptyState}>
            <Search size={48} color={Colors.light.textMuted} />
            <Text style={styles.emptyStateText}>Recherchez des documents ou clients</Text>
            <Text style={styles.emptyStateHint}>
              Tapez un nom, numéro de document ou email
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  searchHeader: {
    padding: 16,
    paddingTop: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.light.text,
  },

  categoryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 8,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.light.surface,
  },
  categoryChipActive: {
    backgroundColor: Colors.light.tint,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingTop: 8,
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
    marginLeft: 4,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    gap: 10,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.light.text,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  resultsList: {
    backgroundColor: Colors.light.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  resultIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultContent: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  resultSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  resultAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginRight: 4,
  },
  noResults: {
    alignItems: 'center',
    padding: 40,
  },
  noResultsText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  noResultsHint: {
    fontSize: 14,
    color: Colors.light.textMuted,
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
    marginTop: 8,
  },
  emptyStateHint: {
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
});
