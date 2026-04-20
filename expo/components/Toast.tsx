import React, { useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CheckCircle, AlertCircle, Info, X, AlertTriangle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastProps {
  visible: boolean;
  type: ToastType;
  message: string;
  description?: string;
  duration?: number;
  onDismiss: () => void;
  action?: {
    label: string;
    onPress: () => void;
  };
}

const TOAST_ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={20} color={Colors.light.success} />,
  error: <AlertCircle size={20} color={Colors.light.error} />,
  warning: <AlertTriangle size={20} color={Colors.light.warning} />,
  info: <Info size={20} color={Colors.light.info} />,
};

const TOAST_COLORS: Record<ToastType, { bg: string; border: string }> = {
  success: { bg: Colors.light.success + '15', border: Colors.light.success + '30' },
  error: { bg: Colors.light.error + '15', border: Colors.light.error + '30' },
  warning: { bg: Colors.light.warning + '15', border: Colors.light.warning + '30' },
  info: { bg: Colors.light.info + '15', border: Colors.light.info + '30' },
};

export default function Toast({
  visible,
  type,
  message,
  description,
  duration = 4000,
  onDismiss,
  action,
}: ToastProps) {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
    });
  }, [onDismiss, translateY, opacity]);

  useEffect(() => {
    if (visible) {
      if (type === 'error') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else if (type === 'success') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (duration > 0) {
        const timer = setTimeout(() => {
          dismiss();
        }, duration);
        return () => clearTimeout(timer);
      }
    } else {
      translateY.setValue(-100);
      opacity.setValue(0);
    }
  }, [visible, duration, type, dismiss, translateY, opacity]);

  if (!visible) return null;

  const colors = TOAST_COLORS[type];

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: insets.top + 8,
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View
        style={[
          styles.toast,
          {
            backgroundColor: colors.bg,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.iconContainer}>{TOAST_ICONS[type]}</View>
        <View style={styles.content}>
          <Text style={styles.message} numberOfLines={2}>
            {message}
          </Text>
          {description && (
            <Text style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>
        {action && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => {
              action.onPress();
              dismiss();
            }}
          >
            <Text style={styles.actionText}>{action.label}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={dismiss}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={16} color={Colors.light.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  iconContainer: {
    marginRight: 12,
  },
  content: {
    flex: 1,
    gap: 2,
  },
  message: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  description: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  closeButton: {
    padding: 4,
    marginLeft: 4,
  },
});

export interface ToastState {
  visible: boolean;
  type: ToastType;
  message: string;
  description?: string;
}

export const initialToastState: ToastState = {
  visible: false,
  type: 'info',
  message: '',
  description: undefined,
};

export function useToast() {
  const [toast, setToast] = React.useState<ToastState>(initialToastState);

  const showToast = useCallback(
    (type: ToastType, message: string, description?: string) => {
      setToast({ visible: true, type, message, description });
    },
    []
  );

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const showSuccess = useCallback(
    (message: string, description?: string) => showToast('success', message, description),
    [showToast]
  );

  const showError = useCallback(
    (message: string, description?: string) => showToast('error', message, description),
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, description?: string) => showToast('warning', message, description),
    [showToast]
  );

  const showInfo = useCallback(
    (message: string, description?: string) => showToast('info', message, description),
    [showToast]
  );

  return {
    toast,
    showToast,
    hideToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  };
}
