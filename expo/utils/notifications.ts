import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { OverdueInvoice } from '@/types/reminder';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web platform - notifications limited');
    return false;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission not granted');
      return false;
    }

    console.log('[Notifications] Permission granted');
    return true;
  } catch (error) {
    console.error('[Notifications] Error requesting permissions:', error);
    return false;
  }
}

export async function scheduleReminderNotification(
  invoice: OverdueInvoice,
  reminderLevel: number
): Promise<string | null> {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web platform - skipping notification');
    return null;
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return null;

    const levelLabels: Record<number, string> = {
      1: 'première relance',
      2: 'deuxième relance',
      3: 'relance finale',
    };

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `Relance à envoyer - ${invoice.number}`,
        body: `La facture ${invoice.number} de ${invoice.client_name} est en retard de ${invoice.days_overdue} jours. Envoyez la ${levelLabels[reminderLevel] || 'relance'}.`,
        data: { 
          documentId: invoice.id,
          type: 'reminder',
          level: reminderLevel,
        },
      },
      trigger: null,
    });

    console.log('[Notifications] Scheduled notification:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('[Notifications] Error scheduling notification:', error);
    return null;
  }
}

export async function scheduleDelayedReminderCheck(
  invoicesNeedingReminder: { invoice: OverdueInvoice; suggestedLevel: number }[]
): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('[Notifications] Web platform - skipping delayed notification');
    return;
  }

  if (invoicesNeedingReminder.length === 0) {
    console.log('[Notifications] No invoices needing reminders');
    return;
  }

  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    await Notifications.cancelAllScheduledNotificationsAsync();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);

    const count = invoicesNeedingReminder.length;
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${count} relance${count > 1 ? 's' : ''} à envoyer`,
        body: `Vous avez ${count} facture${count > 1 ? 's' : ''} en retard nécessitant une relance.`,
        data: { 
          type: 'reminder_check',
          count,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: tomorrow,
      },
    });

    console.log('[Notifications] Scheduled daily reminder check for tomorrow at 9:00');
  } catch (error) {
    console.error('[Notifications] Error scheduling delayed notification:', error);
  }
}

export async function cancelAllNotifications(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('[Notifications] Cancelled all notifications');
  } catch (error) {
    console.error('[Notifications] Error cancelling notifications:', error);
  }
}

export async function setBadgeCount(count: number): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    await Notifications.setBadgeCountAsync(count);
    console.log('[Notifications] Badge count set to:', count);
  } catch (error) {
    console.error('[Notifications] Error setting badge count:', error);
  }
}
