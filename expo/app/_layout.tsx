import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DatabaseProvider } from '@/providers/DatabaseProvider';
import { AppModeProvider } from '@/providers/AppModeProvider';
import AdSplashScreen from '@/components/AdSplashScreen';

try {
  SplashScreen.preventAutoHideAsync().catch(() => {});
} catch (e) {
  console.log('[SplashScreen] preventAutoHideAsync not supported:', e);
}

const queryClient = new QueryClient();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerBackTitle: 'Retour' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
      <Stack.Screen name="client/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="client/[id]" />
      <Stack.Screen name="client/edit/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="product/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="product/[id]" />
      <Stack.Screen name="product/edit/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="document/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="document/[id]" />
      <Stack.Screen name="document/edit/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings/company" />
      <Stack.Screen name="settings/numbering" />
      <Stack.Screen name="settings/taxes" />
      <Stack.Screen name="settings/templates" />
      <Stack.Screen name="settings/backup" />
      <Stack.Screen name="settings/reminders" />
      <Stack.Screen name="settings/archives" />
      <Stack.Screen name="settings/einvoice" />
      <Stack.Screen name="settings/pdp-config" />
      <Stack.Screen name="settings/einvoice-inbox" />
      <Stack.Screen name="settings/information" />
      <Stack.Screen name="settings/storage" />
      <Stack.Screen name="settings/app-mode" />
      <Stack.Screen name="expenses" />
      <Stack.Screen name="delivery-notes/index" options={{ title: 'Bons de livraison' }} />
      <Stack.Screen name="delivery-notes/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="delivery-notes/[id]" />
      <Stack.Screen name="delivery-notes/edit/[id]" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [showAd, setShowAd] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync().catch((e) => {
      console.log('[SplashScreen] hideAsync not supported:', e);
    });
    
    const adDelayTimer = setTimeout(() => {
      setShowAd(true);
    }, 5000);
    
    return () => clearTimeout(adDelayTimer);
  }, []);

  const handleAdComplete = () => {
    console.log('[AD] Ad splash screen completed');
    setShowAd(false);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <DatabaseProvider>
          <AppModeProvider>
          <RootLayoutNav />
          {showAd && (
            <AdSplashScreen
              onComplete={handleAdComplete}
              duration={5000}
              skipAfter={3000}
            />
          )}
          </AppModeProvider>
        </DatabaseProvider>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
