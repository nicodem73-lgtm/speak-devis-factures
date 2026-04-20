import { View, Text, StyleSheet } from 'react-native';
import { 
  FileEdit, 
  Send, 
  FileCheck, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  CreditCard,
  Circle,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import { 
  EInvoiceStatus, 
  EINVOICE_STATUS_LABELS, 
  EINVOICE_STATUS_COLORS,
  getStatusOrder,
} from '@/types/einvoice';

interface TimelineStep {
  status: EInvoiceStatus;
  label: string;
  icon: typeof FileEdit;
}

const TIMELINE_STEPS: TimelineStep[] = [
  { status: 'draft', label: 'Brouillon', icon: FileEdit },
  { status: 'issued', label: 'Émise', icon: Send },
  { status: 'prepared', label: 'Préparée', icon: FileCheck },
  { status: 'submitted', label: 'Transmise', icon: Upload },
  { status: 'delivered', label: 'Délivrée', icon: CheckCircle2 },
];

interface EInvoiceTimelineProps {
  currentStatus: EInvoiceStatus;
  isRejected?: boolean;
  isPaid?: boolean;
  compact?: boolean;
}

export default function EInvoiceTimeline({ 
  currentStatus, 
  isRejected = false,
  isPaid = false,
  compact = false,
}: EInvoiceTimelineProps) {
  const currentOrder = getStatusOrder(currentStatus);
  
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={[
          styles.compactBadge,
          { backgroundColor: EINVOICE_STATUS_COLORS[currentStatus] + '15' }
        ]}>
          <Circle 
            size={8} 
            color={EINVOICE_STATUS_COLORS[currentStatus]} 
            fill={EINVOICE_STATUS_COLORS[currentStatus]}
          />
          <Text style={[
            styles.compactText,
            { color: EINVOICE_STATUS_COLORS[currentStatus] }
          ]}>
            {EINVOICE_STATUS_LABELS[currentStatus]}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.timeline}>
        {TIMELINE_STEPS.map((step, index) => {
          const stepOrder = getStatusOrder(step.status);
          const isCompleted = stepOrder < currentOrder;
          const isCurrent = step.status === currentStatus;
          const isPending = stepOrder > currentOrder;
          
          const Icon = step.icon;
          const color = isCompleted || isCurrent 
            ? EINVOICE_STATUS_COLORS[step.status]
            : Colors.light.textMuted;

          return (
            <View key={step.status} style={styles.stepContainer}>
              <View style={styles.stepContent}>
                <View style={[
                  styles.iconContainer,
                  isCompleted && styles.iconContainerCompleted,
                  isCurrent && styles.iconContainerCurrent,
                  isPending && styles.iconContainerPending,
                  { borderColor: color }
                ]}>
                  <Icon 
                    size={16} 
                    color={isCompleted || isCurrent ? '#fff' : color}
                    strokeWidth={2}
                  />
                </View>
                <Text style={[
                  styles.stepLabel,
                  (isCompleted || isCurrent) && styles.stepLabelActive,
                  isPending && styles.stepLabelPending,
                ]}>
                  {step.label}
                </Text>
              </View>
              {index < TIMELINE_STEPS.length - 1 && (
                <View style={[
                  styles.connector,
                  isCompleted && styles.connectorCompleted,
                ]} />
              )}
            </View>
          );
        })}
      </View>

      {(isRejected || isPaid) && (
        <View style={styles.finalStatus}>
          {isRejected ? (
            <View style={[styles.finalBadge, styles.finalBadgeRejected]}>
              <XCircle size={16} color="#EF4444" />
              <Text style={[styles.finalText, styles.finalTextRejected]}>
                Rejetée
              </Text>
            </View>
          ) : isPaid ? (
            <View style={[styles.finalBadge, styles.finalBadgePaid]}>
              <CreditCard size={16} color="#10B981" />
              <Text style={[styles.finalText, styles.finalTextPaid]}>
                Payée
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

interface EInvoiceStatusBadgeProps {
  status: EInvoiceStatus;
  size?: 'small' | 'medium';
}

export function EInvoiceStatusBadge({ status, size = 'medium' }: EInvoiceStatusBadgeProps) {
  const color = EINVOICE_STATUS_COLORS[status];
  const isSmall = size === 'small';

  return (
    <View style={[
      styles.badge,
      isSmall && styles.badgeSmall,
      { backgroundColor: color + '15' }
    ]}>
      <Circle 
        size={isSmall ? 6 : 8} 
        color={color} 
        fill={color}
      />
      <Text style={[
        styles.badgeText,
        isSmall && styles.badgeTextSmall,
        { color }
      ]}>
        {EINVOICE_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    padding: 16,
  },
  timeline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stepContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  stepContent: {
    alignItems: 'center',
    width: 50,
  },
  iconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: Colors.light.surface,
  },
  iconContainerCompleted: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  iconContainerCurrent: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  iconContainerPending: {
    backgroundColor: Colors.light.surface,
    borderColor: Colors.light.borderLight,
  },
  stepLabel: {
    fontSize: 10,
    color: Colors.light.text,
    marginTop: 6,
    textAlign: 'center',
  },
  stepLabelActive: {
    fontWeight: '600' as const,
    color: '#8B5CF6',
  },
  stepLabelPending: {
    color: Colors.light.textMuted,
  },
  connector: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.light.borderLight,
    marginTop: 15,
    marginHorizontal: 4,
  },
  connectorCompleted: {
    backgroundColor: '#8B5CF6',
  },
  finalStatus: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    alignItems: 'center',
  },
  finalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  finalBadgeRejected: {
    backgroundColor: '#EF444415',
  },
  finalBadgePaid: {
    backgroundColor: '#10B98115',
  },
  finalText: {
    fontSize: 13,
    fontWeight: '600' as const,
  },
  finalTextRejected: {
    color: '#EF4444',
  },
  finalTextPaid: {
    color: '#10B981',
  },
  compactContainer: {
    flexDirection: 'row',
  },
  compactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  compactText: {
    fontSize: 11,
    fontWeight: '500' as const,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 6,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
  badgeTextSmall: {
    fontSize: 10,
  },
});
