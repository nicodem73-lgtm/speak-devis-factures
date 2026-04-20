import { useState, useEffect } from 'react';
import { StyleSheet, View, Text, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, Switch, Modal } from 'react-native';
import { Stack, router } from 'expo-router';
import { Palette, Type, FileText, Check, Eye, Layout, X, ZoomIn } from 'lucide-react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import Colors from '@/constants/colors';
import { useDatabase } from '@/providers/DatabaseProvider';
import { getTemplateSettings, saveTemplateSettings, TemplateSettings, TemplateStyle } from '@/db/settings';

const PRESET_COLORS = [
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#EF4444',
  '#EC4899',
  '#06B6D4',
  '#6366F1',
];

const FONT_OPTIONS = [
  { value: 'System', label: 'Système' },
  { value: 'Helvetica', label: 'Helvetica' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times', label: 'Times' },
];

interface TemplateOption {
  id: TemplateStyle;
  name: string;
  description: string;
  preview: {
    headerStyle: 'left' | 'center' | 'split';
    accentPosition: 'top' | 'left' | 'none';
    tableStyle: 'striped' | 'bordered' | 'minimal';
  };
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'classic',
    name: 'Classique',
    description: 'Style traditionnel et professionnel',
    preview: { headerStyle: 'left', accentPosition: 'top', tableStyle: 'striped' },
  },
  {
    id: 'modern',
    name: 'Moderne',
    description: 'Design épuré et contemporain',
    preview: { headerStyle: 'split', accentPosition: 'left', tableStyle: 'minimal' },
  },
  {
    id: 'elegant',
    name: 'Élégant',
    description: 'Raffiné avec bordures fines',
    preview: { headerStyle: 'center', accentPosition: 'top', tableStyle: 'bordered' },
  },
  {
    id: 'professional',
    name: 'Professionnel',
    description: 'Corporate et structuré',
    preview: { headerStyle: 'left', accentPosition: 'none', tableStyle: 'bordered' },
  },
  {
    id: 'minimal',
    name: 'Minimaliste',
    description: 'Simple et efficace',
    preview: { headerStyle: 'left', accentPosition: 'none', tableStyle: 'minimal' },
  },
  {
    id: 'creative',
    name: 'Créatif',
    description: 'Moderne avec accents colorés',
    preview: { headerStyle: 'split', accentPosition: 'left', tableStyle: 'striped' },
  },
];



export default function TemplatesSettingsScreen() {
  const { db } = useDatabase();
  const [previewTemplate, setPreviewTemplate] = useState<TemplateOption | null>(null);
  
  const [form, setForm] = useState<TemplateSettings>({
    primaryColor: '#3B82F6',
    accentColor: '#10B981',
    fontFamily: 'System',
    footerText: '',
    showLogo: true,
    templateStyle: 'classic',
  });

  const { data: templateSettings, isLoading } = useQuery({
    queryKey: ['templateSettings', db],
    queryFn: () => getTemplateSettings(db!),
    enabled: !!db,
  });

  useEffect(() => {
    if (templateSettings) {
      setForm(templateSettings);
    }
  }, [templateSettings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!db) throw new Error('Database not ready');
      await saveTemplateSettings(db, form);
    },
    onSuccess: () => {
      Alert.alert('Succès', 'Modèle enregistré. Les nouveaux documents utiliseront ce modèle.');
      router.back();
    },
    onError: (error) => {
      console.error('[TemplatesSettings] Save error:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder');
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.light.tint} />
      </View>
    );
  }

  const renderDetailedPreview = (template: TemplateOption, primaryColor: string, accentColor: string, isLarge: boolean = false) => {
    const previewHeight = isLarge ? 400 : 100;
    
    return (
      <View style={[styles.templatePreview, isLarge && styles.templatePreviewLarge, { height: previewHeight }]}>
        {template.preview.accentPosition === 'top' && (
          <View style={[styles.previewAccentTop, isLarge && styles.previewAccentTopLarge, { backgroundColor: primaryColor }]} />
        )}
        {template.preview.accentPosition === 'left' && (
          <View style={[styles.previewAccentLeft, isLarge && styles.previewAccentLeftLarge, { backgroundColor: primaryColor }]} />
        )}
        <View style={[styles.previewContent, isLarge && styles.previewContentLarge]}>
          {isLarge && (
            <View style={styles.previewDocTitle}>
              <Text style={[styles.previewDocTitleText, { color: primaryColor }]}>DEVIS N° 2024-001</Text>
              <Text style={styles.previewDocDate}>Date: 15/01/2024</Text>
            </View>
          )}
          <View style={[
            styles.previewHeader,
            template.preview.headerStyle === 'center' && styles.previewHeaderCenter,
            isLarge && styles.previewHeaderLarge,
          ]}>
            <View style={[styles.previewLogo, isLarge && styles.previewLogoLarge, { backgroundColor: primaryColor }]}>
              {isLarge && <Text style={styles.previewLogoText}>LOGO</Text>}
            </View>
            {template.preview.headerStyle === 'split' && (
              <View style={[styles.previewHeaderRight, isLarge && styles.previewHeaderRightLarge]}>
                {isLarge ? (
                  <>
                    <Text style={styles.previewCompanyName}>Mon Entreprise</Text>
                    <Text style={styles.previewCompanyInfo}>123 Rue Example</Text>
                    <Text style={styles.previewCompanyInfo}>75001 Paris</Text>
                  </>
                ) : (
                  <>
                    <View style={[styles.previewLine, { width: 30 }]} />
                    <View style={[styles.previewLine, { width: 20 }]} />
                  </>
                )}
              </View>
            )}
          </View>
          
          {isLarge && (
            <View style={styles.previewClientSection}>
              <Text style={styles.previewSectionLabel}>Client</Text>
              <View style={styles.previewClientBox}>
                <Text style={styles.previewClientName}>Client Example</Text>
                <Text style={styles.previewClientInfo}>456 Avenue Test, 75002 Paris</Text>
              </View>
            </View>
          )}
          
          <View style={[styles.previewBody, isLarge && styles.previewBodyLarge]}>
            <View style={[
              styles.previewTable,
              template.preview.tableStyle === 'bordered' && styles.previewTableBordered,
              isLarge && styles.previewTableLarge,
              isLarge && template.preview.tableStyle === 'bordered' && styles.previewTableBorderedLarge,
            ]}>
              {isLarge && (
                <View style={[styles.previewTableHeader, { backgroundColor: primaryColor + '15' }]}>
                  <Text style={[styles.previewTableHeaderText, { flex: 2 }]}>Description</Text>
                  <Text style={styles.previewTableHeaderText}>Qté</Text>
                  <Text style={styles.previewTableHeaderText}>P.U.</Text>
                  <Text style={styles.previewTableHeaderText}>Total</Text>
                </View>
              )}
              {(isLarge ? [0, 1, 2, 3] : [0, 1, 2]).map((i) => (
                <View 
                  key={i} 
                  style={[
                    styles.previewTableRow,
                    template.preview.tableStyle === 'striped' && i % 2 === 0 && styles.previewTableRowStriped,
                    isLarge && styles.previewTableRowLarge,
                  ]} 
                >
                  {isLarge && (
                    <>
                      <Text style={[styles.previewTableCell, { flex: 2 }]}>Produit {i + 1}</Text>
                      <Text style={styles.previewTableCell}>{i + 1}</Text>
                      <Text style={styles.previewTableCell}>{(100 * (i + 1)).toFixed(2)}€</Text>
                      <Text style={styles.previewTableCell}>{(100 * (i + 1) * (i + 1)).toFixed(2)}€</Text>
                    </>
                  )}
                </View>
              ))}
            </View>
            <View style={[styles.previewTotal, isLarge && styles.previewTotalLarge]}>
              {isLarge ? (
                <View style={[styles.previewTotalBoxLarge, { borderColor: accentColor }]}>
                  <View style={styles.previewTotalRow}>
                    <Text style={styles.previewTotalLabel}>Sous-total HT</Text>
                    <Text style={styles.previewTotalValue}>1 400,00 €</Text>
                  </View>
                  <View style={styles.previewTotalRow}>
                    <Text style={styles.previewTotalLabel}>TVA (20%)</Text>
                    <Text style={styles.previewTotalValue}>280,00 €</Text>
                  </View>
                  <View style={[styles.previewTotalRow, styles.previewTotalRowFinal, { backgroundColor: accentColor + '15' }]}>
                    <Text style={[styles.previewTotalLabel, styles.previewTotalLabelFinal]}>Total TTC</Text>
                    <Text style={[styles.previewTotalValue, styles.previewTotalValueFinal, { color: accentColor }]}>1 680,00 €</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.previewTotalBox, { borderColor: accentColor }]}>
                  <View style={[styles.previewLine, { width: 25, backgroundColor: accentColor }]} />
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    );
  };

  const renderTemplatePreview = (template: TemplateOption, isSelected: boolean) => {
    const primaryColor = form.primaryColor;
    const accentColor = form.accentColor;
    
    return (
      <View key={template.id} style={styles.templateCardWrapper}>
        <TouchableOpacity
          style={[
            styles.templateCard,
            isSelected && styles.templateCardSelected,
            isSelected && { borderColor: primaryColor },
          ]}
          onPress={() => setForm(prev => ({ ...prev, templateStyle: template.id }))}
        >
          {renderDetailedPreview(template, primaryColor, accentColor, false)}
          <View style={styles.templateInfo}>
            <View style={styles.templateHeader}>
              <Text style={styles.templateName}>{template.name}</Text>
              {isSelected && (
                <View style={[styles.checkBadge, { backgroundColor: primaryColor }]}>
                  <Check size={12} color="#FFF" />
                </View>
              )}
            </View>
            <Text style={styles.templateDescription}>{template.description}</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.previewButton}
          onPress={() => setPreviewTemplate(template)}
        >
          <ZoomIn size={14} color={Colors.light.tint} />
          <Text style={styles.previewButtonText}>Aperçu</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: 'Modèle de Facture',
          headerRight: () => (
            <TouchableOpacity 
              style={[styles.saveButton, saveMutation.isPending && styles.saveButtonDisabled]}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Check size={24} color="#FFFFFF" strokeWidth={3} />
              )}
            </TouchableOpacity>
          ),
        }} 
      />
      
      <Modal
        visible={previewTemplate !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setPreviewTemplate(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {previewTemplate?.name || ''}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setPreviewTemplate(null)}
              >
                <X size={24} color={Colors.light.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalBody} contentContainerStyle={styles.modalBodyContent}>
              {previewTemplate && renderDetailedPreview(previewTemplate, form.primaryColor, form.accentColor, true)}
              <Text style={styles.modalDescription}>
                {previewTemplate?.description}
              </Text>
              <View style={styles.modalFeatures}>
                <Text style={styles.modalFeaturesTitle}>Caractéristiques :</Text>
                <Text style={styles.modalFeatureItem}>• En-tête : {previewTemplate?.preview.headerStyle === 'left' ? 'Aligné à gauche' : previewTemplate?.preview.headerStyle === 'center' ? 'Centré' : 'Divisé'}</Text>
                <Text style={styles.modalFeatureItem}>• Accent : {previewTemplate?.preview.accentPosition === 'top' ? 'Bande supérieure' : previewTemplate?.preview.accentPosition === 'left' ? 'Bande latérale' : 'Aucun'}</Text>
                <Text style={styles.modalFeatureItem}>• Tableau : {previewTemplate?.preview.tableStyle === 'striped' ? 'Lignes alternées' : previewTemplate?.preview.tableStyle === 'bordered' ? 'Bordures' : 'Minimal'}</Text>
              </View>
            </ScrollView>
            <TouchableOpacity
              style={[styles.modalSelectButton, { backgroundColor: form.primaryColor }]}
              onPress={() => {
                if (previewTemplate) {
                  setForm(prev => ({ ...prev, templateStyle: previewTemplate.id }));
                }
                setPreviewTemplate(null);
              }}
            >
              <Check size={20} color="#FFF" />
              <Text style={styles.modalSelectButtonText}>Sélectionner ce modèle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Layout size={20} color={Colors.light.tint} />
            <Text style={styles.sectionTitle}>Choisir un modèle</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            Le modèle sélectionné sera appliqué aux nouveaux devis et factures
          </Text>
          <View style={styles.templatesGrid}>
            {TEMPLATE_OPTIONS.map((template) => 
              renderTemplatePreview(template, form.templateStyle === template.id)
            )}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Palette size={20} color={Colors.light.tint} />
            <Text style={styles.sectionTitle}>Couleur des devis</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[
                    styles.colorButton,
                    { backgroundColor: color },
                    form.primaryColor === color && styles.colorButtonSelected,
                  ]}
                  onPress={() => setForm(prev => ({ ...prev, primaryColor: color }))}
                >
                  {form.primaryColor === color && (
                    <Check size={16} color="#FFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.customColorRow}>
              <Text style={styles.customColorLabel}>Personnalisé :</Text>
              <TextInput
                style={[styles.customColorInput, { borderColor: form.primaryColor }]}
                value={form.primaryColor}
                onChangeText={(v) => setForm(prev => ({ ...prev, primaryColor: v }))}
                autoCapitalize="characters"
                maxLength={7}
              />
              <View style={[styles.colorPreview, { backgroundColor: form.primaryColor }]} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Palette size={20} color={Colors.light.success} />
            <Text style={styles.sectionTitle}>Couleur des factures</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.colorGrid}>
              {PRESET_COLORS.map((color) => (
                <TouchableOpacity
                  key={`accent-${color}`}
                  style={[
                    styles.colorButton,
                    { backgroundColor: color },
                    form.accentColor === color && styles.colorButtonSelected,
                  ]}
                  onPress={() => setForm(prev => ({ ...prev, accentColor: color }))}
                >
                  {form.accentColor === color && (
                    <Check size={16} color="#FFF" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.customColorRow}>
              <Text style={styles.customColorLabel}>Personnalisé :</Text>
              <TextInput
                style={[styles.customColorInput, { borderColor: form.accentColor }]}
                value={form.accentColor}
                onChangeText={(v) => setForm(prev => ({ ...prev, accentColor: v }))}
                autoCapitalize="characters"
                maxLength={7}
              />
              <View style={[styles.colorPreview, { backgroundColor: form.accentColor }]} />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Type size={20} color={Colors.light.tint} />
            <Text style={styles.sectionTitle}>Police</Text>
          </View>
          <View style={styles.card}>
            {FONT_OPTIONS.map((font) => (
              <TouchableOpacity
                key={font.value}
                style={[
                  styles.fontOption,
                  form.fontFamily === font.value && styles.fontOptionSelected,
                ]}
                onPress={() => setForm(prev => ({ ...prev, fontFamily: font.value }))}
              >
                <Text style={[styles.fontOptionText, { fontFamily: font.value === 'System' ? undefined : font.value }]}>
                  {font.label}
                </Text>
                {form.fontFamily === font.value && (
                  <Check size={18} color={Colors.light.tint} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Eye size={20} color={Colors.light.tint} />
            <Text style={styles.sectionTitle}>Options d{"'"}affichage</Text>
          </View>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Afficher le logo</Text>
              <Switch
                value={form.showLogo}
                onValueChange={(v) => setForm(prev => ({ ...prev, showLogo: v }))}
                trackColor={{ false: Colors.light.borderLight, true: Colors.light.tint }}
              />
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileText size={20} color={Colors.light.tint} />
            <Text style={styles.sectionTitle}>Pied de page</Text>
          </View>
          <View style={styles.card}>
            <TextInput
              style={styles.textArea}
              placeholder="Texte affiché en bas de chaque document..."
              placeholderTextColor={Colors.light.textMuted}
              value={form.footerText}
              onChangeText={(v) => setForm(prev => ({ ...prev, footerText: v }))}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
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
  saveButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#34C759',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 12,
  },
  templatesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  templateCardWrapper: {
    width: '48%',
  },
  templateCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  previewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 4,
  },
  previewButtonText: {
    fontSize: 12,
    color: Colors.light.tint,
    fontWeight: '500' as const,
  },
  templateCardSelected: {
    borderWidth: 2,
    shadowOpacity: 0.15,
  },
  templatePreview: {
    height: 100,
    backgroundColor: '#FFF',
    position: 'relative',
    overflow: 'hidden',
  },
  templatePreviewLarge: {
    height: 400,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.borderLight,
  },
  previewAccentTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  previewAccentTopLarge: {
    height: 8,
  },
  previewAccentLeft: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 4,
  },
  previewAccentLeftLarge: {
    width: 8,
  },
  previewContent: {
    flex: 1,
    padding: 8,
  },
  previewContentLarge: {
    padding: 20,
  },
  previewDocTitle: {
    marginBottom: 16,
  },
  previewDocTitleText: {
    fontSize: 18,
    fontWeight: '700' as const,
  },
  previewDocDate: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 4,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  previewHeaderLarge: {
    marginBottom: 20,
  },
  previewHeaderCenter: {
    justifyContent: 'center',
  },
  previewLogo: {
    width: 24,
    height: 12,
    borderRadius: 2,
  },
  previewLogoLarge: {
    width: 60,
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewLogoText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700' as const,
  },
  previewHeaderRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  previewHeaderRightLarge: {
    gap: 4,
  },
  previewCompanyName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  previewCompanyInfo: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  previewClientSection: {
    marginBottom: 16,
  },
  previewSectionLabel: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  previewClientBox: {
    backgroundColor: Colors.light.background,
    padding: 10,
    borderRadius: 6,
  },
  previewClientName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  previewClientInfo: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  previewLine: {
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
  },
  previewBody: {
    flex: 1,
    justifyContent: 'space-between',
  },
  previewBodyLarge: {
    justifyContent: 'flex-start',
    gap: 16,
  },
  previewTable: {
    gap: 3,
  },
  previewTableLarge: {
    gap: 0,
  },
  previewTableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginBottom: 4,
  },
  previewTableHeaderText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600' as const,
    color: Colors.light.textSecondary,
  },
  previewTableRow: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 1,
  },
  previewTableRowLarge: {
    height: 'auto' as unknown as number,
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 0,
  },
  previewTableCell: {
    flex: 1,
    fontSize: 11,
    color: Colors.light.text,
  },
  previewTableRowStriped: {
    backgroundColor: '#E5E7EB',
  },
  previewTableBordered: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 2,
    borderRadius: 2,
  },
  previewTableBorderedLarge: {
    padding: 0,
    borderRadius: 6,
    overflow: 'hidden',
  },
  previewTotal: {
    alignItems: 'flex-end',
    marginTop: 6,
  },
  previewTotalLarge: {
    marginTop: 12,
  },
  previewTotalBox: {
    width: 40,
    height: 14,
    borderWidth: 1,
    borderRadius: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewTotalBoxLarge: {
    width: 180,
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  previewTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  previewTotalRowFinal: {
    paddingVertical: 10,
  },
  previewTotalLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  previewTotalLabelFinal: {
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  previewTotalValue: {
    fontSize: 11,
    color: Colors.light.text,
  },
  previewTotalValueFinal: {
    fontWeight: '700' as const,
    fontSize: 13,
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  modalCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    maxHeight: 500,
  },
  modalBodyContent: {
    padding: 20,
  },
  modalDescription: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    marginTop: 16,
  },
  modalFeatures: {
    marginTop: 20,
    backgroundColor: Colors.light.background,
    padding: 16,
    borderRadius: 12,
  },
  modalFeaturesTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 8,
  },
  modalFeatureItem: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  modalSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  modalSelectButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  templateInfo: {
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
  },
  templateHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  templateName: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  templateDescription: {
    fontSize: 11,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  checkBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 16,
    gap: 12,
  },
  colorButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorButtonSelected: {
    borderWidth: 3,
    borderColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  customColorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 12,
  },
  customColorLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
  },
  customColorInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
    padding: 10,
    borderWidth: 2,
    borderRadius: 8,
    textAlign: 'center',
  },
  colorPreview: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  fontOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  fontOptionSelected: {
    backgroundColor: Colors.light.surfaceSecondary,
  },
  fontOptionText: {
    fontSize: 16,
    color: Colors.light.text,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  switchLabel: {
    fontSize: 16,
    color: Colors.light.text,
  },
  textArea: {
    padding: 16,
    fontSize: 15,
    color: Colors.light.text,
    minHeight: 100,
  },
});
