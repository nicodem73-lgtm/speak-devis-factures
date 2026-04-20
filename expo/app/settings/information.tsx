import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { 
  Smartphone, 
  FileText, 
  Shield, 
  ExternalLink,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import Constants from 'expo-constants';

import React from "react";

const APP_VERSION = Constants.expoConfig?.version ?? '1.1.2';

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value?: string;
  onPress?: () => void;
  isLink?: boolean;
}

function InfoItem({ icon, label, value, onPress, isLink }: InfoItemProps) {
  const content = (
    <View style={styles.infoItem}>
      <View style={styles.infoIconContainer}>
        {icon}
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        {value && <Text style={styles.infoValue}>{value}</Text>}
      </View>
      {isLink && (
        <View style={styles.linkIcon}>
          <ExternalLink size={18} color={Colors.light.textMuted} />
        </View>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

export default function InformationScreen() {
  const openCGU = () => {
    Linking.openURL('https://sites.google.com/view/niko-app/solutions/speak-devis-factures/cgu-speak-devis-factures');
  };

  const openRGPD = () => {
    Linking.openURL('https://sites.google.com/view/niko-app/solutions/speak-devis-factures/rgpd-speak-devis-factures');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Informations',
          headerBackTitle: 'Retour',
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <View style={styles.appIconContainer}>
            <View style={styles.appIcon}>
              <Smartphone size={32} color={Colors.light.tint} />
            </View>
          </View>
          <Text style={styles.appName}>Speak Devis & Factures</Text>
          <Text style={styles.appDescription}>
            Créez vos devis et factures facilement
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Application</Text>
          <View style={styles.sectionContent}>
            <InfoItem
              icon={<Smartphone size={20} color={Colors.light.tint} />}
              label="Version"
              value={APP_VERSION}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Légal</Text>
          <View style={styles.sectionContent}>
            <InfoItem
              icon={<FileText size={20} color="#8B5CF6" />}
              label="Conditions Générales d'Utilisation"
              onPress={openCGU}
              isLink
            />
            <View style={styles.separator} />
            <InfoItem
              icon={<Shield size={20} color="#10B981" />}
              label="Politique de Confidentialité (RGPD)"
              onPress={openRGPD}
              isLink
            />
          </View>
        </View>

        <View style={styles.footerCard}>
          <Text style={styles.footerText}>
            © 2026 Niko App. Tous droits réservés.
          </Text>
        </View>
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
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  appIconContainer: {
    marginBottom: 16,
  },
  appIcon: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 6,
  },
  appDescription: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    textAlign: 'center',
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
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  infoIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.light.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  infoValue: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  linkIcon: {
    marginLeft: 8,
  },
  separator: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
    marginLeft: 68,
  },
  footerCard: {
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: Colors.light.textMuted,
    textAlign: 'center',
  },
});
