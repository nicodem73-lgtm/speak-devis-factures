import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';



interface AdSplashScreenProps {
  onComplete: () => void;
  duration?: number;
  skipAfter?: number;
}

const AD_CONTENT = [
  {
    title: 'Speak Devis Factures',
    subtitle: 'Gérez vos devis et factures en toute simplicité',
    description: 'Créez, envoyez et suivez vos documents professionnels',
    gradient: ['#1a1a2e', '#16213e', '#0f3460'] as const,
    accentColor: '#e94560',
  },
  {
    title: 'Professionnalisez votre activité',
    subtitle: 'Des documents conformes et élégants',
    description: 'Factures, devis, bons de livraison en quelques clics',
    gradient: ['#0d1b2a', '#1b263b', '#415a77'] as const,
    accentColor: '#778da9',
  },
  {
    title: 'Gagnez du temps',
    subtitle: 'Automatisez votre facturation',
    description: 'Rappels automatiques, suivi des paiements, statistiques',
    gradient: ['#2d3436', '#636e72', '#b2bec3'] as const,
    accentColor: '#74b9ff',
  },
];

export default function AdSplashScreen({ 
  onComplete, 
  duration = 5000,
  skipAfter = 3000 
}: AdSplashScreenProps) {
  const [canSkip, setCanSkip] = useState(false);
  const [countdown, setCountdown] = useState(Math.ceil(skipAfter / 1000));
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const gradientAnim = useRef(new Animated.Value(0)).current;
  
  const adContent = AD_CONTENT[Math.floor(Math.random() * AD_CONTENT.length)];

  const handleClose = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onComplete();
    });
  }, [fadeAnim, onComplete]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: false,
        }),
        Animated.timing(gradientAnim, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: false,
        }),
      ])
    ).start();

    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    const skipTimer = setTimeout(() => {
      setCanSkip(true);
    }, skipAfter);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(skipTimer);
    };
  }, [skipAfter, fadeAnim, scaleAnim, gradientAnim]);

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }]
        }
      ]}
    >
      <LinearGradient
        colors={adContent.gradient}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.header}>
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>Publicité</Text>
          </View>
          
          {canSkip ? (
            <TouchableOpacity 
              style={[styles.skipButton, { borderColor: adContent.accentColor }]}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.skipText, { color: adContent.accentColor }]}>
                Passer
              </Text>
              <X size={16} color={adContent.accentColor} />
            </TouchableOpacity>
          ) : (
            <View style={[styles.countdownBadge, { borderColor: 'rgba(255,255,255,0.3)' }]}>
              <Text style={styles.countdownText}>{countdown}s</Text>
            </View>
          )}
        </View>

        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <View style={[styles.logoCircle, { backgroundColor: adContent.accentColor }]}>
              <Text style={styles.logoText}>SF</Text>
            </View>
          </View>

          <Text style={styles.title}>{adContent.title}</Text>
          <Text style={styles.subtitle}>{adContent.subtitle}</Text>
          
          <View style={styles.separator}>
            <View style={[styles.separatorLine, { backgroundColor: adContent.accentColor }]} />
          </View>
          
          <Text style={styles.description}>{adContent.description}</Text>

          <View style={styles.features}>
            {['Devis', 'Factures', 'Clients', 'Statistiques'].map((feature, index) => (
              <View 
                key={feature} 
                style={[
                  styles.featureBadge, 
                  { 
                    backgroundColor: `${adContent.accentColor}20`,
                    borderColor: `${adContent.accentColor}40`
                  }
                ]}
              >
                <Text style={[styles.featureText, { color: adContent.accentColor }]}>
                  {feature}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Application de gestion commerciale
          </Text>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  gradient: {
    flex: 1,
    paddingTop: 60,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  adBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  adBadgeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  countdownBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  countdownText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  logoContainer: {
    marginBottom: 30,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
  },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 20,
  },
  separator: {
    width: 60,
    marginBottom: 20,
  },
  separatorLine: {
    height: 3,
    borderRadius: 2,
  },
  description: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  featureBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  featureText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footer: {
    paddingBottom: 40,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
});
