import { Tabs, router } from 'expo-router';
import { FileText, Users, Package, BarChart3, Search, Settings, Euro } from 'lucide-react-native';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';
import ModeBanner from '@/components/ModeBanner';

export default function TabLayout() {
  const headerLeft = () => (
    <TouchableOpacity
      onPress={() => router.push('/expenses')}
      style={styles.expenseButton}
    >
      <Euro size={18} color={Colors.light.tint} />
      <Text style={styles.expenseButtonText}>Dépenses</Text>
    </TouchableOpacity>
  );

  const headerRight = () => (
    <TouchableOpacity
      onPress={() => router.push('/settings')}
      style={{ marginRight: 16 }}
    >
      <Settings size={22} color={Colors.light.textSecondary} />
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1 }}>
    <ModeBanner />
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors.light.tint,
        tabBarInactiveTintColor: Colors.light.tabIconDefault,
        headerShown: true,
        headerStyle: {
          backgroundColor: Colors.light.surface,
        },
        headerTitleStyle: {
          fontWeight: '600',
          color: Colors.light.text,
        },
        tabBarStyle: {
          backgroundColor: Colors.light.surface,
          borderTopColor: Colors.light.borderLight,
        },
        headerRight,
        headerLeft,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Documents',
          tabBarIcon: ({ color, size }) => <FileText size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: 'Clients',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="products"
        options={{
          title: 'Produits',
          tabBarIcon: ({ color, size }) => <Package size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Recherche',
          tabBarIcon: ({ color, size }) => <Search size={size} color={color} />,
        }}
      />
    </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  expenseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: Colors.light.tint + '15',
    borderRadius: 8,
    gap: 6,
  },
  expenseButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.light.tint,
  },
});
