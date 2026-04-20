import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlaskConical, ShieldCheck, ChevronRight } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAppMode } from '@/providers/AppModeProvider';

export default function ModeBanner() {
  const { mode, isTestMode } = useAppMode();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <TouchableOpacity
      style={[styles.banner, isTestMode ? styles.bannerTest : styles.bannerReal, { paddingTop: insets.top + 8 }]}
      onPress={() => router.push('/settings/app-mode')}
      activeOpacity={0.8}
      testID="mode-banner"
    >
      <View style={styles.bannerContent}>
        {isTestMode ? (
          <FlaskConical size={16} color="#92400E" strokeWidth={2.5} />
        ) : (
          <ShieldCheck size={16} color="#065F46" strokeWidth={2.5} />
        )}
        <Text style={[styles.bannerText, isTestMode ? styles.bannerTextTest : styles.bannerTextReal]}>
          MODE {mode}
        </Text>
        {isTestMode && (
          <Text style={styles.bannerSubtext}>Documents sans valeur légale</Text>
        )}
      </View>
      <ChevronRight size={14} color={isTestMode ? '#92400E' : '#065F46'} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerTest: {
    backgroundColor: '#FEF3C7',
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B40',
  },
  bannerReal: {
    backgroundColor: '#D1FAE5',
    borderBottomWidth: 1,
    borderBottomColor: '#10B98140',
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  bannerText: {
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  bannerTextTest: {
    color: '#92400E',
  },
  bannerTextReal: {
    color: '#065F46',
  },
  bannerSubtext: {
    fontSize: 11,
    color: '#B45309',
    fontStyle: 'italic',
  },
});
