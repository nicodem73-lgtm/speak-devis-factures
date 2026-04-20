import React, { useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import {
  Wallet,
  FileText,
  Check,
  Clock,
  ChevronRight,
  AlertCircle,
  Receipt,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import {
  DepositPlan,
  canGenerateDeposit,
  canGenerateFinal,
} from '@/types/deposit';
import { formatCurrency } from '@/types/document';

interface DepositManagementSectionProps {
  depositPlan: DepositPlan;
  quoteStatus: string;
  onGenerateDeposit: (installmentIndex: number) => void;
  onGenerateFinal: () => void;
  onViewInvoice: (invoiceId: number) => void;
  isGenerating?: boolean;
  generatingIndex?: number | 'final';
}

export default function DepositManagementSection({
  depositPlan,
  quoteStatus,
  onGenerateDeposit,
  onGenerateFinal,
  onViewInvoice,
  isGenerating = false,
  generatingIndex,
}: DepositManagementSectionProps) {
  const { config, generatedInvoices, totalDepositAmount, quoteTotalTtc } = depositPlan;

  const depositInvoices = useMemo(() => 
    generatedInvoices.filter(inv => inv.stage === 'deposit' && inv.isMaster),
    [generatedInvoices]
  );

  const finalInvoices = useMemo(() =>
    generatedInvoices.filter(inv => inv.stage === 'final' && inv.isMaster),
    [generatedInvoices]
  );

  const totalGeneratedDeposits = useMemo(() =>
    depositInvoices.reduce((sum, inv) => sum + inv.amount, 0),
    [depositInvoices]
  );

  const actualRemainingBalance = useMemo(() =>
    Math.round((quoteTotalTtc - totalGeneratedDeposits) * 100) / 100,
    [quoteTotalTtc, totalGeneratedDeposits]
  );

  const canGenerateFinalInvoice = useMemo(() =>
    canGenerateFinal(quoteStatus, depositPlan),
    [quoteStatus, depositPlan]
  );

  if (!config.enabled) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Wallet size={20} color={Colors.light.textMuted} />
          <Text style={styles.headerTitle}>Acompte non configuré</Text>
        </View>
        <Text style={styles.infoText}>
          Ce devis n&apos;a pas d&apos;acompte configuré. Vous pouvez générer une facture directement.
        </Text>
        
        {finalInvoices.length === 0 && quoteStatus === 'accepted' && (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={onGenerateFinal}
            disabled={isGenerating}
          >
            {isGenerating && generatingIndex === 'final' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <FileText size={18} color="#fff" />
                <Text style={styles.generateButtonText}>Générer la facture</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {finalInvoices.length > 0 && (
          <View style={styles.invoicesList}>
            {finalInvoices.map(invoice => (
              <TouchableOpacity
                key={invoice.invoiceId}
                style={styles.invoiceCard}
                onPress={() => onViewInvoice(invoice.invoiceId)}
              >
                <View style={styles.invoiceInfo}>
                  <View style={styles.invoiceIconContainer}>
                    <Receipt size={16} color={Colors.light.success} />
                  </View>
                  <View>
                    <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
                    <Text style={styles.invoiceAmount}>{formatCurrency(invoice.amount)}</Text>
                  </View>
                </View>
                <ChevronRight size={18} color={Colors.light.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Wallet size={20} color="#F59E0B" />
        <Text style={styles.headerTitle}>Gestion des acomptes</Text>
      </View>

      <View style={styles.summary}>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total devis</Text>
          <Text style={styles.summaryValue}>{formatCurrency(quoteTotalTtc)}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Total acomptes prévus</Text>
          <Text style={[styles.summaryValue, styles.summaryHighlight]}>
            {formatCurrency(totalDepositAmount)}
          </Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Acomptes générés</Text>
          <Text style={styles.summaryValue}>{formatCurrency(totalGeneratedDeposits)}</Text>
        </View>
        <View style={[styles.summaryRow, styles.summaryRowLast]}>
          <Text style={styles.summaryLabel}>Solde restant</Text>
          <Text style={[styles.summaryValue, styles.summaryBold]}>
            {formatCurrency(actualRemainingBalance)}
          </Text>
        </View>
      </View>

      <View style={styles.installmentsSection}>
        <Text style={styles.sectionTitle}>Échéances d&apos;acompte</Text>
        
        {config.installments.map((installment) => {
          const isGenerated = installment.isGenerated;
          const generatedInvoice = depositInvoices.find(
            inv => inv.installmentIndex === installment.index
          );
          const canGenerate = canGenerateDeposit(quoteStatus, installment);
          const isCurrentlyGenerating = isGenerating && generatingIndex === installment.index;

          return (
            <View key={installment.index} style={styles.installmentCard}>
              <View style={styles.installmentHeader}>
                <View style={styles.installmentTitleRow}>
                  <View style={[
                    styles.installmentStatus,
                    isGenerated ? styles.installmentStatusDone : styles.installmentStatusPending,
                  ]}>
                    {isGenerated ? (
                      <Check size={12} color="#fff" />
                    ) : (
                      <Clock size={12} color={Colors.light.warning} />
                    )}
                  </View>
                  <Text style={styles.installmentTitle}>
                    Échéance {installment.index}/{config.installmentCount}
                  </Text>
                </View>
                <Text style={styles.installmentAmount}>
                  {formatCurrency(installment.amount)}
                </Text>
              </View>

              {installment.dueDate && (
                <Text style={styles.installmentDate}>
                  Échéance: {installment.dueDate}
                </Text>
              )}

              {isGenerated && generatedInvoice && (
                <TouchableOpacity
                  style={styles.generatedInvoiceRow}
                  onPress={() => onViewInvoice(generatedInvoice.invoiceId)}
                >
                  <View style={styles.invoiceInfo}>
                    <Receipt size={14} color={Colors.light.success} />
                    <Text style={styles.generatedInvoiceNumber}>
                      {generatedInvoice.invoiceNumber}
                    </Text>
                  </View>
                  <ChevronRight size={16} color={Colors.light.textMuted} />
                </TouchableOpacity>
              )}

              {!isGenerated && canGenerate && (
                <TouchableOpacity
                  style={styles.generateDepositButton}
                  onPress={() => onGenerateDeposit(installment.index)}
                  disabled={isGenerating}
                >
                  {isCurrentlyGenerating ? (
                    <ActivityIndicator size="small" color={Colors.light.tint} />
                  ) : (
                    <>
                      <FileText size={16} color={Colors.light.tint} />
                      <Text style={styles.generateDepositButtonText}>
                        Générer facture d&apos;acompte
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {!isGenerated && !canGenerate && quoteStatus !== 'accepted' && (
                <View style={styles.waitingRow}>
                  <AlertCircle size={14} color={Colors.light.textMuted} />
                  <Text style={styles.waitingText}>
                    En attente d&apos;acceptation du devis
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <View style={styles.finalSection}>
        <Text style={styles.sectionTitle}>Facture de solde</Text>
        
        {finalInvoices.length > 0 ? (
          <View style={styles.invoicesList}>
            {finalInvoices.map(invoice => (
              <TouchableOpacity
                key={invoice.invoiceId}
                style={styles.invoiceCard}
                onPress={() => onViewInvoice(invoice.invoiceId)}
              >
                <View style={styles.invoiceInfo}>
                  <View style={[styles.invoiceIconContainer, styles.invoiceIconFinal]}>
                    <Receipt size={16} color={Colors.light.success} />
                  </View>
                  <View>
                    <Text style={styles.invoiceNumber}>{invoice.invoiceNumber}</Text>
                    <Text style={styles.invoiceAmount}>
                      Solde: {formatCurrency(invoice.amount)}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color={Colors.light.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : canGenerateFinalInvoice ? (
          <TouchableOpacity
            style={styles.generateButton}
            onPress={onGenerateFinal}
            disabled={isGenerating}
          >
            {isGenerating && generatingIndex === 'final' ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <FileText size={18} color="#fff" />
                <Text style={styles.generateButtonText}>
                  Générer facture de solde ({formatCurrency(actualRemainingBalance)})
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.waitingCard}>
            <Clock size={18} color={Colors.light.textMuted} />
            <Text style={styles.waitingCardText}>
              {quoteStatus !== 'accepted'
                ? "En attente d'acceptation du devis"
                : "Générez d'abord toutes les factures d'acompte"}
            </Text>
          </View>
        )}
      </View>

      {generatedInvoices.filter(inv => !inv.isMaster).length > 0 && (
        <View style={styles.splitsSection}>
          <Text style={styles.sectionTitle}>
            Factures copropriétaires ({generatedInvoices.filter(inv => !inv.isMaster).length})
          </Text>
          <View style={styles.splitsList}>
            {generatedInvoices
              .filter(inv => !inv.isMaster)
              .slice(0, 5)
              .map(invoice => (
                <TouchableOpacity
                  key={invoice.invoiceId}
                  style={styles.splitCard}
                  onPress={() => onViewInvoice(invoice.invoiceId)}
                >
                  <Text style={styles.splitNumber}>{invoice.invoiceNumber}</Text>
                  <Text style={styles.splitAmount}>{formatCurrency(invoice.amount)}</Text>
                  <ChevronRight size={14} color={Colors.light.textMuted} />
                </TouchableOpacity>
              ))}
            {generatedInvoices.filter(inv => !inv.isMaster).length > 5 && (
              <Text style={styles.moreText}>
                +{generatedInvoices.filter(inv => !inv.isMaster).length - 5} autres factures
              </Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#F59E0B20',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  infoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    padding: 14,
    paddingTop: 0,
  },
  summary: {
    padding: 14,
    backgroundColor: Colors.light.background,
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryRowLast: {
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    paddingTop: 8,
    marginTop: 4,
  },
  summaryLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  summaryHighlight: {
    color: '#F59E0B',
  },
  summaryBold: {
    fontWeight: '700' as const,
    color: Colors.light.tint,
  },
  installmentsSection: {
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  installmentCard: {
    backgroundColor: Colors.light.background,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  installmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  installmentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  installmentStatus: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  installmentStatusDone: {
    backgroundColor: Colors.light.success,
  },
  installmentStatusPending: {
    backgroundColor: Colors.light.warning + '20',
  },
  installmentTitle: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  installmentAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  installmentDate: {
    fontSize: 12,
    color: Colors.light.textSecondary,
  },
  generatedInvoiceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.success + '10',
    padding: 10,
    borderRadius: 8,
  },
  invoiceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generatedInvoiceNumber: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.success,
  },
  generateDepositButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint + '10',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint + '30',
  },
  generateDepositButtonText: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.tint,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waitingText: {
    fontSize: 12,
    color: Colors.light.textMuted,
  },
  finalSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 10,
  },
  invoicesList: {
    gap: 8,
  },
  invoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.light.background,
    padding: 12,
    borderRadius: 10,
  },
  invoiceIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.light.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invoiceIconFinal: {
    backgroundColor: Colors.light.tint + '15',
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  invoiceAmount: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.tint,
    padding: 14,
    borderRadius: 10,
  },
  generateButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
  waitingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.light.background,
    padding: 14,
    borderRadius: 10,
  },
  waitingCardText: {
    fontSize: 13,
    color: Colors.light.textMuted,
  },
  splitsSection: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.light.borderLight,
    gap: 10,
  },
  splitsList: {
    gap: 6,
  },
  splitCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.background,
    padding: 10,
    borderRadius: 8,
    gap: 8,
  },
  splitNumber: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  splitAmount: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  moreText: {
    fontSize: 12,
    color: Colors.light.textMuted,
    textAlign: 'center',
    paddingTop: 4,
  },
});
