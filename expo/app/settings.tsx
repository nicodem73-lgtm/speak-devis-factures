import { StyleSheet, View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { router, Stack } from 'expo-router';

import { Building2, Hash, Percent, Palette, Download, ChevronRight, Calendar, Info, FileCheck, Inbox, Archive, HardDrive, FlaskConical } from 'lucide-react-native';
import Colors from '@/constants/colors';
import Constants from 'expo-constants';

interface SettingsItemProps {
  icon: typeof Building2;
  iconColor?: string;
  label: string;
  description?: string;
  onPress: () => void;
}

function SettingsItem({ icon: Icon, iconColor = Colors.light.tint, label, description, onPress }: SettingsItemProps) {
  return (
    <TouchableOpacity style={styles.settingsItem} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.settingsIconContainer, { backgroundColor: iconColor + '15' }]}>
        <Icon size={20} color={iconColor} strokeWidth={2} />
      </View>
      <View style={styles.settingsContent}>
        <Text style={styles.settingsLabel}>{label}</Text>
        {description && <Text style={styles.settingsDescription}>{description}</Text>}
      </View>
      <ChevronRight size={20} color={Colors.light.textMuted} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Paramètres' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mon entreprise</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={Building2}
              label="Informations entreprise"
              description="Nom, adresse, SIRET, TVA, IBAN..."
              onPress={() => router.push('/settings/company')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Documents</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={Hash}
              iconColor="#8B5CF6"
              label="Numérotation"
              description="Préfixes et compteurs devis/factures"
              onPress={() => router.push('/settings/numbering')}
            />
            <SettingsItem
              icon={Percent}
              iconColor="#F59E0B"
              label="Taux de TVA"
              description="Gérer les taux disponibles"
              onPress={() => router.push('/settings/taxes')}
            />
            <SettingsItem
              icon={Palette}
              iconColor="#EC4899"
              label="Modèle PDF"
              description="Couleurs, police, pied de page"
              onPress={() => router.push('/settings/templates')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Facturation électronique</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={FileCheck}
              iconColor="#8B5CF6"
              label="Paramètres e-facturation"
              description="Format, PDP, identifiants"
              onPress={() => router.push('/settings/einvoice')}
            />
            <SettingsItem
              icon={Inbox}
              iconColor="#6366F1"
              label="Boîte e-factures"
              description="Factures émises et reçues"
              onPress={() => router.push('/settings/einvoice-inbox')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Application</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={Calendar}
              iconColor="#10B981"
              label="Relances impayés"
              description="Rappels et modèles d'email"
              onPress={() => router.push('/settings/reminders')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Données</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={Archive}
              iconColor="#F59E0B"
              label="Archives annuelles"
              description="Clôturer, archiver et restaurer par année"
              onPress={() => router.push('/settings/archives')}
            />
            <SettingsItem
              icon={Download}
              iconColor="#6366F1"
              label="Sauvegarde complète"
              description="Exporter / importer toutes les données"
              onPress={() => router.push('/settings/backup')}
            />
            <SettingsItem
              icon={HardDrive}
              iconColor="#10B981"
              label="Stockage"
              description="Gérer l'espace et nettoyer les fichiers"
              onPress={() => router.push('/settings/storage')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mode application</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={FlaskConical}
              iconColor="#F59E0B"
              label="Mode TEST / RÉEL"
              description="Sandbox, checklist d'activation, conformité"
              onPress={() => router.push('/settings/app-mode')}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>À propos</Text>
          <View style={styles.sectionContent}>
            <SettingsItem
              icon={Info}
              iconColor="#14B8A6"
              label="Informations"
              description="Version, CGU, confidentialité"
              onPress={() => router.push('/settings/information')}
            />
          </View>
        </View>

        <Text style={styles.version}>Version {Constants.expoConfig?.version ?? '1.1.3'}</Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
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
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionContent: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  settingsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  settingsContent: {
    flex: 1,
  },
  settingsLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  settingsDescription: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  version: {
    fontSize: 13,
    color: Colors.light.textMuted,
    textAlign: 'center',
    marginTop: 20,
  },
});
