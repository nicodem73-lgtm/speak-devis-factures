import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, ScrollView, TouchableOpacity, Dimensions, RefreshControl, Platform, Alert, ActivityIndicator } from 'react-native';
import { TrendingUp, CreditCard, Clock, CheckCircle, XCircle, ChevronDown, Calendar, Share2, Euro, Minus, RotateCcw, Truck, FileText, Package } from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { useDatabase } from '@/providers/DatabaseProvider';
import { useAppMode } from '@/providers/AppModeProvider';
import Colors from '@/constants/colors';
import { getStatsByPeriod, getAvailableYears, MonthlyStats } from '@/db/documents';
import { getExpenseStatsByPeriod, getExpensesByFilter } from '@/db/expenses';
import { getCreditNoteStatsByPeriod } from '@/db/creditNotes';
import { getDeliveryNoteStatsByPeriod } from '@/db/deliveryNotes';
import { Expense } from '@/types/expense';
import { EXPENSE_CATEGORIES } from '@/types/expense';
import { formatCurrency } from '@/types/document';
import * as Print from 'expo-print';
import * as MailComposer from 'expo-mail-composer';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';


const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_PADDING = 40;
const Y_AXIS_WIDTH = 70;
const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING;
const CHART_AREA_WIDTH = CHART_WIDTH - Y_AXIS_WIDTH - 20;
const CHART_HEIGHT = 200;
const BAR_WIDTH = 20;

type PeriodType = 'year' | 'month';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

interface StatCardProps {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  subValue?: string;
  color: string;
  large?: boolean;
}

function StatCard({ icon: Icon, label, value, subValue, color, large }: StatCardProps) {
  return (
    <View style={[styles.statCard, large && styles.statCardLarge]}>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        <Icon size={22} color={color} strokeWidth={2} />
      </View>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, large && styles.statValueLarge]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {subValue && <Text style={styles.statSubValue}>{subValue}</Text>}
    </View>
  );
}

interface BarChartProps {
  data: MonthlyStats[];
  maxValue: number;
}

function BarChart({ data, maxValue }: BarChartProps) {
  const chartMax = maxValue > 0 ? maxValue : 1000;
  const totalBarsWidth = data.length * BAR_WIDTH;
  const availableSpace = CHART_AREA_WIDTH - totalBarsWidth;
  const barSpacing = data.length > 1 ? Math.max(availableSpace / (data.length - 1), 2) : 0;
  const hasRevenue = data.some(d => d.revenue > 0);
  const chartHeight = CHART_HEIGHT - 70;
  
  console.log('[BarChart] Data:', data.map(d => ({ month: d.month, revenue: d.revenue })));
  console.log('[BarChart] Max value:', maxValue, 'Chart max:', chartMax);
  
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Chiffre d&apos;affaires mensuel</Text>
      <View style={styles.chart}>
        <View style={styles.yAxis}>
          {[1, 0.75, 0.5, 0.25, 0].map((ratio, i) => (
            <Text key={i} style={styles.yAxisLabel}>
              {formatCurrency(chartMax * ratio).replace(/,00\s*€$/, ' €')}
            </Text>
          ))}
        </View>
        <View style={styles.chartArea}>
          <View style={styles.gridLines}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.gridLine} />
            ))}
          </View>
          <View style={styles.barsContainer}>
            {data.map((item, index) => {
              const barHeight = chartMax > 0 ? (item.revenue / chartMax) * chartHeight : 0;
              return (
                <View 
                  key={index} 
                  style={[styles.barWrapper, { marginRight: index < data.length - 1 ? Math.floor(barSpacing) : 0 }]}
                >
                  <View style={styles.barBackground}>
                    <View 
                      style={[
                        styles.bar, 
                        { 
                          height: item.revenue > 0 ? Math.max(barHeight, 16) : 0,
                          backgroundColor: Colors.light.tint,
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.xAxisLabel}>{item.month}</Text>
                </View>
              );
            })}
          </View>
          {!hasRevenue && (
            <View style={styles.noDataOverlay}>
              <Text style={styles.noDataText}>Aucune facture payée cette année</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

interface PieChartProps {
  paid: number;
  unpaid: number;
}

function PieChart({ paid, unpaid }: PieChartProps) {
  const total = paid + unpaid;
  const paidPercent = total > 0 ? (paid / total) * 100 : 0;
  const unpaidPercent = total > 0 ? (unpaid / total) * 100 : 0;
  
  
  
  return (
    <View style={styles.pieChartContainer}>
      <Text style={styles.chartTitle}>Factures payées vs impayées</Text>
      <View style={styles.pieChartContent}>
        <View style={styles.pieChartSvgContainer}>
          <View style={styles.pieChartCircle}>
            {total === 0 ? (
              <View style={[styles.pieSlice, { backgroundColor: Colors.light.border }]} />
            ) : (
              <>
                <View 
                  style={[
                    styles.pieSlicePaid, 
                    { 
                      transform: [{ rotate: '0deg' }],
                    }
                  ]} 
                />
                <View style={styles.pieCenter}>
                  <Text style={styles.pieCenterValue}>{total}</Text>
                  <Text style={styles.pieCenterLabel}>factures</Text>
                </View>
              </>
            )}
          </View>
          <View style={styles.pieChartVisual}>
            <View style={[styles.pieSegment, { backgroundColor: Colors.light.success, flex: paid }]} />
            <View style={[styles.pieSegment, { backgroundColor: Colors.light.warning, flex: unpaid || (total === 0 ? 1 : 0) }]} />
          </View>
        </View>
        <View style={styles.pieChartLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.light.success }]} />
            <View>
              <Text style={styles.legendLabel}>Payées</Text>
              <Text style={styles.legendValue}>{paid} ({paidPercent.toFixed(0)}%)</Text>
            </View>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.light.warning }]} />
            <View>
              <Text style={styles.legendLabel}>Impayées</Text>
              <Text style={styles.legendValue}>{unpaid} ({unpaidPercent.toFixed(0)}%)</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

interface QuotesChartProps {
  accepted: number;
  rejected: number;
  pending: number;
  acceptedAmount: number;
}

interface ExpenseBarChartProps {
  data: { month: string; total: number }[];
  maxValue: number;
}

function ExpenseBarChart({ data, maxValue }: ExpenseBarChartProps) {
  const chartMax = maxValue > 0 ? maxValue : 1000;
  const totalBarsWidth = data.length * BAR_WIDTH;
  const availableSpace = CHART_AREA_WIDTH - totalBarsWidth;
  const barSpacing = data.length > 1 ? Math.max(availableSpace / (data.length - 1), 2) : 0;
  const hasExpenses = data.some(d => d.total > 0);
  const chartHeight = CHART_HEIGHT - 70;
  
  return (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>Dépenses mensuelles</Text>
      <View style={styles.chart}>
        <View style={styles.yAxis}>
          {[1, 0.75, 0.5, 0.25, 0].map((ratio, i) => (
            <Text key={i} style={styles.yAxisLabel}>
              {formatCurrency(chartMax * ratio).replace(/,00\s*€$/, ' €')}
            </Text>
          ))}
        </View>
        <View style={styles.chartArea}>
          <View style={styles.gridLines}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.gridLine} />
            ))}
          </View>
          <View style={styles.barsContainer}>
            {data.map((item, index) => {
              const barHeight = chartMax > 0 ? (item.total / chartMax) * chartHeight : 0;
              return (
                <View 
                  key={index} 
                  style={[styles.barWrapper, { marginRight: index < data.length - 1 ? Math.floor(barSpacing) : 0 }]}
                >
                  <View style={styles.barBackground}>
                    <View 
                      style={[
                        styles.bar, 
                        { 
                          height: item.total > 0 ? Math.max(barHeight, 16) : 0,
                          backgroundColor: Colors.light.error,
                        }
                      ]} 
                    />
                  </View>
                  <Text style={styles.xAxisLabel}>{item.month}</Text>
                </View>
              );
            })}
          </View>
          {!hasExpenses && (
            <View style={styles.noDataOverlay}>
              <Text style={styles.noDataText}>Aucune dépense cette année</Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

interface ExpenseCategoryChartProps {
  categories: { category: string; total: number; count: number }[];
  total: number;
}

function ExpenseCategoryChart({ categories, total }: ExpenseCategoryChartProps) {
  const getCategoryInfo = (categoryId: string) => {
    return EXPENSE_CATEGORIES.find(c => c.id === categoryId) || { label: categoryId, color: '#78716C' };
  };

  return (
    <View style={styles.categoryChartContainer}>
      <Text style={styles.chartTitle}>Dépenses par catégorie</Text>
      <View style={styles.categoryProgressBar}>
        {categories.map((cat, index) => {
          const info = getCategoryInfo(cat.category);
          const percent = total > 0 ? (cat.total / total) * 100 : 0;
          return (
            <View 
              key={index} 
              style={[
                styles.categorySegment, 
                { flex: cat.total, backgroundColor: info.color }
              ]} 
            />
          );
        })}
      </View>
      <View style={styles.categoryList}>
        {categories.slice(0, 6).map((cat, index) => {
          const info = getCategoryInfo(cat.category);
          const percent = total > 0 ? ((cat.total / total) * 100).toFixed(0) : '0';
          return (
            <View key={index} style={styles.categoryItem}>
              <View style={styles.categoryItemLeft}>
                <View style={[styles.categoryDot, { backgroundColor: info.color }]} />
                <Text style={styles.categoryLabel}>{info.label}</Text>
              </View>
              <View style={styles.categoryItemRight}>
                <Text style={styles.categoryAmount}>{formatCurrency(cat.total)}</Text>
                <Text style={styles.categoryPercent}>{percent}%</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function QuotesChart({ accepted, rejected, pending, acceptedAmount }: QuotesChartProps) {
  const total = accepted + rejected + pending;
  const acceptRate = total > 0 ? ((accepted / total) * 100).toFixed(0) : '0';
  
  return (
    <View style={styles.quotesChartContainer}>
      <Text style={styles.chartTitle}>Devis</Text>
      <View style={styles.quotesStats}>
        <View style={styles.quoteStat}>
          <View style={[styles.quoteIconContainer, { backgroundColor: Colors.status.accepted + '20' }]}>
            <CheckCircle size={20} color={Colors.status.accepted} strokeWidth={2} />
          </View>
          <Text style={styles.quoteStatValue}>{accepted}</Text>
          <Text style={styles.quoteStatLabel}>Acceptés</Text>
        </View>
        <View style={styles.quoteStat}>
          <View style={[styles.quoteIconContainer, { backgroundColor: Colors.status.rejected + '20' }]}>
            <XCircle size={20} color={Colors.status.rejected} strokeWidth={2} />
          </View>
          <Text style={styles.quoteStatValue}>{rejected}</Text>
          <Text style={styles.quoteStatLabel}>Refusés</Text>
        </View>
        <View style={styles.quoteStat}>
          <View style={[styles.quoteIconContainer, { backgroundColor: Colors.status.sent + '20' }]}>
            <Clock size={20} color={Colors.status.sent} strokeWidth={2} />
          </View>
          <Text style={styles.quoteStatValue}>{pending}</Text>
          <Text style={styles.quoteStatLabel}>En attente</Text>
        </View>
      </View>
      <View style={styles.quotesProgressContainer}>
        <View style={styles.quotesProgressBar}>
          {total > 0 ? (
            <>
              <View style={[styles.progressSegment, { flex: accepted, backgroundColor: Colors.status.accepted }]} />
              <View style={[styles.progressSegment, { flex: rejected, backgroundColor: Colors.status.rejected }]} />
              <View style={[styles.progressSegment, { flex: pending, backgroundColor: Colors.status.sent }]} />
            </>
          ) : (
            <View style={[styles.progressSegment, { flex: 1, backgroundColor: Colors.light.border }]} />
          )}
        </View>
        <View style={styles.quotesInfo}>
          <Text style={styles.quoteInfoText}>
            Taux d&apos;acceptation : <Text style={styles.quoteInfoHighlight}>{acceptRate}%</Text>
          </Text>
          <Text style={styles.quoteInfoText}>
            Montant accepté : <Text style={styles.quoteInfoHighlight}>{formatCurrency(acceptedAmount)}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function StatsScreen() {
  const { db } = useDatabase();
  const { isTestMode } = useAppMode();
  const isTestFlag = isTestMode ? 1 : 0;
  const currentYear = new Date().getFullYear();
  const [isExporting, setIsExporting] = useState(false);
  const currentMonth = new Date().getMonth();
  
  const [periodType, setPeriodType] = useState<PeriodType>('year');
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [showYearPicker, setShowYearPicker] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const yearsQuery = useQuery({
    queryKey: ['available-years', !!db],
    queryFn: () => getAvailableYears(db!),
    enabled: !!db,
  });

  const statsQuery = useQuery({
    queryKey: ['stats', selectedYear, periodType, selectedMonth, !!db, isTestFlag],
    queryFn: () => getStatsByPeriod(db!, selectedYear, periodType === 'month' ? selectedMonth : undefined, isTestFlag),
    enabled: !!db,
  });

  const expenseStatsQuery = useQuery({
    queryKey: ['expense-stats', selectedYear, periodType, selectedMonth],
    queryFn: () => getExpenseStatsByPeriod(selectedYear, periodType === 'month' ? selectedMonth : undefined),
    enabled: true,
  });

  const expenseListQuery = useQuery({
    queryKey: ['expense-list-stats', selectedYear, periodType, selectedMonth],
    queryFn: () => {
      let startDate: string;
      let endDate: string;
      if (periodType === 'month') {
        const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
        startDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-01`;
        endDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${lastDay}`;
      } else {
        startDate = `${selectedYear}-01-01`;
        endDate = `${selectedYear}-12-31`;
      }
      return getExpensesByFilter({ startDate, endDate });
    },
    enabled: true,
  });

  const creditNoteStatsQuery = useQuery({
    queryKey: ['credit-note-stats', selectedYear, periodType, selectedMonth, !!db],
    queryFn: () => getCreditNoteStatsByPeriod(db!, selectedYear, periodType === 'month' ? selectedMonth : undefined),
    enabled: !!db,
  });

  const deliveryNoteStatsQuery = useQuery({
    queryKey: ['delivery-note-stats', selectedYear, periodType, selectedMonth, !!db],
    queryFn: () => getDeliveryNoteStatsByPeriod(db!, selectedYear, periodType === 'month' ? selectedMonth : undefined),
    enabled: !!db,
  });

  const stats = statsQuery.data;
  const expenseStats = expenseStatsQuery.data;
  const expenseList = expenseListQuery.data || [];
  const creditNoteStats = creditNoteStatsQuery.data;
  const deliveryNoteStats = deliveryNoteStatsQuery.data;
  const availableYears = useMemo(() => {
    const startYear = 2020;
    const endYear = currentYear;
    const yearsList: number[] = [];
    for (let y = endYear; y >= startYear; y--) {
      yearsList.push(y);
    }
    return yearsList;
  }, [currentYear]);

  const years = availableYears;

  const maxMonthlyRevenue = useMemo(() => {
    if (!stats?.monthlyData) return 0;
    return Math.max(...stats.monthlyData.map(d => d.revenue), 0);
  }, [stats?.monthlyData]);

  const maxMonthlyExpense = useMemo(() => {
    if (!expenseStats?.monthlyData) return 0;
    return Math.max(...expenseStats.monthlyData.map(d => d.total), 0);
  }, [expenseStats?.monthlyData]);

  const periodLabel = periodType === 'year' 
    ? `Année ${selectedYear}` 
    : `${MONTHS[selectedMonth]} ${selectedYear}`;

  const { refetch: refetchStats } = statsQuery;
  const { refetch: refetchYears } = yearsQuery;
  const { refetch: refetchExpenseStats } = expenseStatsQuery;
  const { refetch: refetchExpenseList } = expenseListQuery;
  const { refetch: refetchCreditNoteStats } = creditNoteStatsQuery;
  const { refetch: refetchDeliveryNoteStats } = deliveryNoteStatsQuery;

  const onRefresh = useCallback(() => {
    refetchStats();
    refetchYears();
    refetchExpenseStats();
    refetchExpenseList();
    refetchCreditNoteStats();
    refetchDeliveryNoteStats();
  }, [refetchStats, refetchYears, refetchExpenseStats, refetchExpenseList, refetchCreditNoteStats, refetchDeliveryNoteStats]);

  const generateStatsHTML = useCallback(() => {
    if (!stats) return '';
    
    const getCategoryInfo = (categoryId: string) => {
      return EXPENSE_CATEGORIES.find(c => c.id === categoryId) || { label: categoryId, color: '#78716C' };
    };
    
    const monthlyRows = stats.monthlyData?.map(m => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${m.month}</td>
        <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">${formatCurrency(m.revenue)}</td>
      </tr>
    `).join('') || '';

    const chartMaxValue = maxMonthlyRevenue > 0 ? maxMonthlyRevenue : 1000;
    const barChartHeight = 180;
    const barWidth = 35;
    const barGap = 8;
    const chartWidth = stats.monthlyData ? (stats.monthlyData.length * (barWidth + barGap)) + 80 : 500;
    
    const barChartSVG = periodType === 'year' && stats.monthlyData?.length > 0 ? `
      <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <h3 style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Chiffre d'affaires mensuel</h3>
        <svg width="${chartWidth}" height="${barChartHeight + 50}" viewBox="0 0 ${chartWidth} ${barChartHeight + 50}">
          <!-- Grid lines -->
          ${[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = 10 + (barChartHeight * (1 - ratio));
            const value = chartMaxValue * ratio;
            return `
              <line x1="70" y1="${y}" x2="${chartWidth - 10}" y2="${y}" stroke="#E5E7EB" stroke-width="1"/>
              <text x="65" y="${y + 4}" font-size="10" fill="#9CA3AF" text-anchor="end">${formatCurrency(value).replace(/,00\s*€$/, '€')}</text>
            `;
          }).join('')}
          
          <!-- Bars -->
          ${stats.monthlyData.map((item, index) => {
            const barHeight = chartMaxValue > 0 ? (item.revenue / chartMaxValue) * barChartHeight : 0;
            const x = 80 + (index * (barWidth + barGap));
            const y = 10 + barChartHeight - barHeight;
            return `
              <rect x="${x}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" fill="${Colors.light.tint}" rx="3"/>
              <text x="${x + barWidth/2}" y="${barChartHeight + 30}" font-size="9" fill="#6B7280" text-anchor="middle">${item.month}</text>
              ${item.revenue > 0 ? `<text x="${x + barWidth/2}" y="${y - 5}" font-size="8" fill="#374151" text-anchor="middle">${formatCurrency(item.revenue).replace(/,00\s*€$/, '€')}</text>` : ''}
            `;
          }).join('')}
        </svg>
      </div>
    ` : '';

    const totalInvoices = stats.paidInvoices + stats.unpaidInvoices;
    const paidPercent = totalInvoices > 0 ? (stats.paidInvoices / totalInvoices) * 100 : 0;
    const unpaidPercent = totalInvoices > 0 ? (stats.unpaidInvoices / totalInvoices) * 100 : 0;
    
    const pieChartSVG = `
      <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <h3 style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Factures payées vs impayées</h3>
        <div style="display: flex; align-items: center; gap: 40px;">
          <svg width="150" height="150" viewBox="0 0 150 150">
            ${totalInvoices === 0 ? `
              <circle cx="75" cy="75" r="60" fill="#E5E7EB"/>
            ` : `
              <!-- Pie chart using stroke-dasharray technique -->
              <circle cx="75" cy="75" r="50" fill="none" stroke="${Colors.light.warning}" stroke-width="30" stroke-dasharray="${unpaidPercent * 3.14} 314" transform="rotate(-90 75 75)"/>
              <circle cx="75" cy="75" r="50" fill="none" stroke="${Colors.light.success}" stroke-width="30" stroke-dasharray="${paidPercent * 3.14} 314" stroke-dashoffset="-${unpaidPercent * 3.14}" transform="rotate(-90 75 75)"/>
            `}
            <circle cx="75" cy="75" r="35" fill="white"/>
            <text x="75" y="72" font-size="20" font-weight="bold" fill="#1F2937" text-anchor="middle">${totalInvoices}</text>
            <text x="75" y="88" font-size="10" fill="#6B7280" text-anchor="middle">factures</text>
          </svg>
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
              <div style="width: 14px; height: 14px; border-radius: 7px; background: ${Colors.light.success};"></div>
              <div>
                <div style="font-size: 13px; color: #6B7280;">Payées</div>
                <div style="font-size: 16px; font-weight: 600; color: #1F2937;">${stats.paidInvoices} (${paidPercent.toFixed(0)}%)</div>
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 14px; height: 14px; border-radius: 7px; background: ${Colors.light.warning};"></div>
              <div>
                <div style="font-size: 13px; color: #6B7280;">Impayées</div>
                <div style="font-size: 16px; font-weight: 600; color: #1F2937;">${stats.unpaidInvoices} (${unpaidPercent.toFixed(0)}%)</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    const totalQuotes = stats.acceptedQuotes + stats.rejectedQuotes + stats.pendingQuotes;
    const acceptRate = totalQuotes > 0 ? Math.round((stats.acceptedQuotes / totalQuotes) * 100) : 0;
    const acceptedWidth = totalQuotes > 0 ? (stats.acceptedQuotes / totalQuotes) * 100 : 0;
    const rejectedWidth = totalQuotes > 0 ? (stats.rejectedQuotes / totalQuotes) * 100 : 0;
    const pendingWidth = totalQuotes > 0 ? (stats.pendingQuotes / totalQuotes) * 100 : 0;

    const quotesChartSVG = `
      <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 20px 0;">
        <h3 style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Devis</h3>
        <div style="display: flex; justify-content: space-around; margin-bottom: 20px;">
          <div style="text-align: center;">
            <div style="width: 50px; height: 50px; border-radius: 25px; background: ${Colors.status.accepted}20; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${Colors.status.accepted}" stroke-width="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #1F2937;">${stats.acceptedQuotes}</div>
            <div style="font-size: 12px; color: #6B7280;">Acceptés</div>
          </div>
          <div style="text-align: center;">
            <div style="width: 50px; height: 50px; border-radius: 25px; background: ${Colors.status.rejected}20; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${Colors.status.rejected}" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #1F2937;">${stats.rejectedQuotes}</div>
            <div style="font-size: 12px; color: #6B7280;">Refusés</div>
          </div>
          <div style="text-align: center;">
            <div style="width: 50px; height: 50px; border-radius: 25px; background: ${Colors.status.sent}20; display: flex; align-items: center; justify-content: center; margin: 0 auto 8px;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${Colors.status.sent}" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
            </div>
            <div style="font-size: 24px; font-weight: 700; color: #1F2937;">${stats.pendingQuotes}</div>
            <div style="font-size: 12px; color: #6B7280;">En attente</div>
          </div>
        </div>
        <div style="background: #E5E7EB; border-radius: 4px; height: 10px; overflow: hidden; display: flex;">
          ${totalQuotes > 0 ? `
            <div style="width: ${acceptedWidth}%; background: ${Colors.status.accepted}; height: 100%;"></div>
            <div style="width: ${rejectedWidth}%; background: ${Colors.status.rejected}; height: 100%;"></div>
            <div style="width: ${pendingWidth}%; background: ${Colors.status.sent}; height: 100%;"></div>
          ` : ''}
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 12px;">
          <span style="font-size: 13px; color: #6B7280;">Taux d'acceptation: <strong style="color: #1F2937;">${acceptRate}%</strong></span>
          <span style="font-size: 13px; color: #6B7280;">Montant accepté: <strong style="color: #059669;">${formatCurrency(stats.acceptedQuotesAmount)}</strong></span>
        </div>
      </div>
    `;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #1F2937; }
    h1 { color: #111827; font-size: 28px; margin-bottom: 8px; }
    h2 { color: #374151; font-size: 18px; margin: 30px 0 15px; border-bottom: 2px solid #E5E7EB; padding-bottom: 8px; }
    .subtitle { color: #6B7280; margin-bottom: 30px; }
    .card { background: #F9FAFB; border-radius: 12px; padding: 20px; margin-bottom: 20px; }
    .card-title { font-size: 14px; color: #6B7280; margin-bottom: 8px; }
    .card-value { font-size: 28px; font-weight: 700; color: #111827; }
    .card-sub { font-size: 13px; color: #9CA3AF; margin-top: 4px; }
    .grid { display: flex; gap: 20px; flex-wrap: wrap; }
    .grid > div { flex: 1; min-width: 200px; }
    table { width: 100%; border-collapse: collapse; margin-top: 15px; }
    th { background: #F3F4F6; padding: 12px; text-align: left; font-weight: 600; color: #374151; }
    td { padding: 10px; border-bottom: 1px solid #E5E7EB; }
    .highlight { color: #059669; font-weight: 600; }
    .warning { color: #D97706; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #E5E7EB; text-align: center; font-size: 12px; color: #9CA3AF; }
  </style>
</head>
<body>
  <h1>Rapport Statistiques</h1>
  <p class="subtitle">${periodLabel}</p>
  
  <div class="card" style="background: linear-gradient(135deg, #ECFDF5, #D1FAE5);">
    <div class="card-title">Chiffre d'affaires total</div>
    <div class="card-value" style="color: #059669;">${formatCurrency(stats.totalRevenue)}</div>
    <div class="card-sub">${stats.paidInvoices} facture(s) payée(s)</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-title">Factures payées</div>
      <div class="card-value">${formatCurrency(stats.paidAmount)}</div>
      <div class="card-sub">${stats.paidInvoices} factures</div>
    </div>
    <div class="card">
      <div class="card-title">En attente</div>
      <div class="card-value" style="color: #D97706;">${formatCurrency(stats.unpaidAmount)}</div>
      <div class="card-sub">${stats.unpaidInvoices} factures</div>
    </div>
  </div>

  ${barChartSVG}

  ${pieChartSVG}

  ${quotesChartSVG}

  ${periodType === 'year' && stats.monthlyData?.length > 0 ? `
  <h2>Détail mensuel</h2>
  <table>
    <thead>
      <tr>
        <th>Mois</th>
        <th style="text-align: right;">Chiffre d'affaires</th>
      </tr>
    </thead>
    <tbody>
      ${monthlyRows}
    </tbody>
  </table>
  ` : ''}

  ${expenseStats ? `
  <h2 style="margin-top: 40px;">Dépenses</h2>
  
  <div class="card" style="background: linear-gradient(135deg, #FEF2F2, #FECACA); border-left: 4px solid ${Colors.light.error};">
    <div class="card-title">Total des dépenses</div>
    <div class="card-value" style="color: ${Colors.light.error};">${formatCurrency(expenseStats.totalExpenses)}</div>
    <div class="card-sub">${expenseStats.expenseCount} dépense(s) • TVA: ${formatCurrency(expenseStats.totalTVA)}</div>
  </div>

  ${periodType === 'year' && expenseStats.monthlyData?.length > 0 ? `
  <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 20px 0;">
    <h3 style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Dépenses mensuelles</h3>
    <svg width="${(expenseStats.monthlyData.length * 43) + 80}" height="230" viewBox="0 0 ${(expenseStats.monthlyData.length * 43) + 80} 230">
      ${[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
        const y = 10 + (180 * (1 - ratio));
        const expenseChartMax = maxMonthlyExpense > 0 ? maxMonthlyExpense : 1000;
        const value = expenseChartMax * ratio;
        return `
          <line x1="70" y1="${y}" x2="${(expenseStats.monthlyData.length * 43) + 70}" y2="${y}" stroke="#E5E7EB" stroke-width="1"/>
          <text x="65" y="${y + 4}" font-size="10" fill="#9CA3AF" text-anchor="end">${formatCurrency(value).replace(/,00\s*€$/, '€')}</text>
        `;
      }).join('')}
      ${expenseStats.monthlyData.map((item: { month: string; total: number }, index: number) => {
        const expenseChartMax = maxMonthlyExpense > 0 ? maxMonthlyExpense : 1000;
        const barHeight = expenseChartMax > 0 ? (item.total / expenseChartMax) * 180 : 0;
        const x = 80 + (index * 43);
        const y = 10 + 180 - barHeight;
        return `
          <rect x="${x}" y="${y}" width="35" height="${Math.max(barHeight, 2)}" fill="${Colors.light.error}" rx="3"/>
          <text x="${x + 17.5}" y="210" font-size="9" fill="#6B7280" text-anchor="middle">${item.month}</text>
          ${item.total > 0 ? `<text x="${x + 17.5}" y="${y - 5}" font-size="8" fill="#374151" text-anchor="middle">${formatCurrency(item.total).replace(/,00\s*€$/, '€')}</text>` : ''}
        `;
      }).join('')}
    </svg>
  </div>
  ` : ''}

  ${expenseStats.byCategory?.length > 0 ? `
  <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 20px 0;">
    <h3 style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Dépenses par catégorie</h3>
    <div style="display: flex; height: 12px; border-radius: 6px; overflow: hidden; margin-bottom: 16px;">
      ${expenseStats.byCategory.map((cat: { category: string; total: number; count: number }) => {
        const info = getCategoryInfo(cat.category);
        const percent = expenseStats.totalExpenses > 0 ? (cat.total / expenseStats.totalExpenses) * 100 : 0;
        return `<div style="width: ${percent}%; background: ${info.color};"></div>`;
      }).join('')}
    </div>
    <table style="width: 100%;">
      <tbody>
        ${expenseStats.byCategory.slice(0, 8).map((cat: { category: string; total: number; count: number }) => {
          const info = getCategoryInfo(cat.category);
          const percent = expenseStats.totalExpenses > 0 ? ((cat.total / expenseStats.totalExpenses) * 100).toFixed(0) : '0';
          return `
            <tr>
              <td style="padding: 8px 0; display: flex; align-items: center; gap: 10px;">
                <div style="width: 10px; height: 10px; border-radius: 5px; background: ${info.color};"></div>
                <span>${info.label}</span>
              </td>
              <td style="padding: 8px 0; text-align: right; font-weight: 600;">${formatCurrency(cat.total)}</td>
              <td style="padding: 8px 0; text-align: right; color: #9CA3AF; width: 50px;">${percent}%</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${expenseList.length > 0 ? `
  <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 20px 0;">
    <h3 style="font-size: 16px; color: #374151; margin: 0 0 20px 0;">Détail des dépenses</h3>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="background: #F3F4F6; padding: 10px; text-align: left; font-weight: 600; color: #374151;">Établissement</th>
          <th style="background: #F3F4F6; padding: 10px; text-align: left; font-weight: 600; color: #374151;">Catégorie</th>
          <th style="background: #F3F4F6; padding: 10px; text-align: right; font-weight: 600; color: #374151;">Date</th>
          <th style="background: #F3F4F6; padding: 10px; text-align: right; font-weight: 600; color: #374151;">Montant TTC</th>
        </tr>
      </thead>
      <tbody>
        ${expenseList.slice(0, 30).map((expense: Expense) => {
          const categoryInfo = getCategoryInfo(expense.category);
          return `
            <tr>
              <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">${expense.establishment}</td>
              <td style="padding: 10px; border-bottom: 1px solid #E5E7EB;">
                <span style="display: inline-flex; align-items: center; gap: 6px;">
                  <span style="width: 8px; height: 8px; border-radius: 4px; background: ${categoryInfo.color};"></span>
                  ${categoryInfo.label}
                </span>
              </td>
              <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right;">${new Date(expense.date).toLocaleDateString('fr-FR')}</td>
              <td style="padding: 10px; border-bottom: 1px solid #E5E7EB; text-align: right; font-weight: 600; color: ${Colors.light.error};">${formatCurrency(expense.amount_ttc)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
    ${expenseList.length > 30 ? `<p style="text-align: center; color: #6B7280; font-style: italic; margin-top: 10px;">+ ${expenseList.length - 30} autre(s) dépense(s)</p>` : ''}
  </div>
  ` : ''}

  <div class="card" style="background: ${(stats.totalRevenue - expenseStats.totalExpenses) >= 0 ? 'linear-gradient(135deg, #ECFDF5, #D1FAE5)' : 'linear-gradient(135deg, #FEF2F2, #FECACA)'}; text-align: center;">
    <div class="card-title">Résultat net (CA - Dépenses)</div>
    <div class="card-value" style="color: ${(stats.totalRevenue - expenseStats.totalExpenses) >= 0 ? Colors.light.success : Colors.light.error};">
      ${formatCurrency(stats.totalRevenue - expenseStats.totalExpenses)}
    </div>
  </div>
  ` : ''}

  <div class="footer">
    Rapport généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
  </div>
</body>
</html>
    `;
  }, [stats, expenseStats, expenseList, periodLabel, periodType, maxMonthlyRevenue, maxMonthlyExpense]);

  const exportFile = useCallback(async (fileUri: string, mimeType: string, extension: string) => {
    const canMail = await MailComposer.isAvailableAsync();
    
    Alert.alert(
      'Exporter les statistiques',
      'Comment souhaitez-vous exporter ce rapport ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Partager',
          onPress: async () => {
            try {
              const isAvailable = await Sharing.isAvailableAsync();
              if (isAvailable) {
                await Sharing.shareAsync(fileUri, {
                  UTI: extension,
                  mimeType: mimeType,
                  dialogTitle: 'Partager le rapport',
                });
              } else {
                Alert.alert('Erreur', 'Le partage n\'est pas disponible sur cet appareil.');
              }
            } catch (e) {
              console.error('[Stats] Share error:', e);
              Alert.alert('Erreur', 'Impossible de partager le fichier.');
            }
          },
        },
        ...(canMail ? [{
          text: 'Email',
          onPress: async () => {
            try {
              await MailComposer.composeAsync({
                subject: `Rapport Statistiques - ${periodLabel}`,
                body: `Veuillez trouver ci-joint le rapport statistiques pour ${periodLabel}.`,
                attachments: [fileUri],
              });
            } catch (e) {
              console.error('[Stats] Mail error:', e);
              Alert.alert('Erreur', 'Impossible d\'ouvrir le composeur d\'email.');
            }
          },
        }] : []),
      ]
    );
  }, [periodLabel]);

  const generateWordDocument = useCallback(async () => {
    const html = generateStatsHTML();
    const fileName = `rapport_${periodLabel.replace(/\s+/g, '_')}.doc`;
    
    const wordHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" 
            xmlns:w="urn:schemas-microsoft-com:office:word" 
            xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
          </w:WordDocument>
        </xml>
        <![endif]-->
      </head>
      <body>
        ${html.replace(/<html[^>]*>|<\/html>|<head[^>]*>.*?<\/head>/gs, '').replace(/<body[^>]*>|<\/body>/g, '')}
      </body>
      </html>
    `;
    
    const file = new File(Paths.cache, fileName);
    file.create({ overwrite: true });
    file.write(wordHtml);
    
    console.log('[Stats] Word document generated:', file.uri);
    return file.uri;
  }, [generateStatsHTML, periodLabel]);

  const handleExport = useCallback(async () => {
    if (!stats) return;
    
    if (Platform.OS === 'web') {
      Alert.alert('Export', 'L\'export n\'est pas disponible sur le web.');
      return;
    }
    
    Alert.alert(
      'Format d\'export',
      'Choisissez le format du rapport',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'PDF',
          onPress: async () => {
            setIsExporting(true);
            try {
              const html = generateStatsHTML();
              const { uri } = await Print.printToFileAsync({
                html,
                width: 595,
                height: 842,
              });
              console.log('[Stats] PDF generated:', uri);
              await exportFile(uri, 'application/pdf', '.pdf');
            } catch (error) {
              console.error('[Stats] PDF export error:', error);
              Alert.alert('Erreur', 'Impossible de générer le PDF.');
            } finally {
              setIsExporting(false);
            }
          },
        },
        {
          text: 'Word (.doc)',
          onPress: async () => {
            setIsExporting(true);
            try {
              const uri = await generateWordDocument();
              await exportFile(uri, 'application/msword', '.doc');
            } catch (error) {
              console.error('[Stats] Word export error:', error);
              Alert.alert('Erreur', 'Impossible de générer le document Word.');
            } finally {
              setIsExporting(false);
            }
          },
        },
      ]
    );
  }, [stats, generateStatsHTML, exportFile, generateWordDocument]);

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={statsQuery.isRefetching}
          onRefresh={onRefresh}
          tintColor={Colors.light.tint}
        />
      }
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Statistiques {isTestMode ? '(TEST)' : ''}</Text>
        {stats && (
          <TouchableOpacity 
            style={styles.exportButton} 
            onPress={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={Colors.light.tint} />
            ) : (
              <Share2 size={20} color={Colors.light.tint} />
            )}
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.subtitle}>Aperçu de votre activité</Text>

      <View style={styles.periodSelector}>
        <View style={styles.periodTabs}>
          <TouchableOpacity
            style={[styles.periodTab, periodType === 'year' && styles.periodTabActive]}
            onPress={() => setPeriodType('year')}
          >
            <Text style={[styles.periodTabText, periodType === 'year' && styles.periodTabTextActive]}>
              Année
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.periodTab, periodType === 'month' && styles.periodTabActive]}
            onPress={() => setPeriodType('month')}
          >
            <Text style={[styles.periodTabText, periodType === 'month' && styles.periodTabTextActive]}>
              Mois
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.periodPickers}>
          <TouchableOpacity 
            style={styles.periodPicker}
            onPress={() => setShowYearPicker(!showYearPicker)}
          >
            <Calendar size={16} color={Colors.light.textSecondary} />
            <Text style={styles.periodPickerText}>{selectedYear}</Text>
            <ChevronDown size={16} color={Colors.light.textSecondary} />
          </TouchableOpacity>

          {periodType === 'month' && (
            <TouchableOpacity 
              style={styles.periodPicker}
              onPress={() => setShowMonthPicker(!showMonthPicker)}
            >
              <Text style={styles.periodPickerText}>{MONTHS[selectedMonth]}</Text>
              <ChevronDown size={16} color={Colors.light.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {showYearPicker && (
          <View style={styles.pickerDropdown}>
            {years.map(year => (
              <TouchableOpacity
                key={year}
                style={[styles.pickerOption, year === selectedYear && styles.pickerOptionActive]}
                onPress={() => {
                  setSelectedYear(year);
                  setShowYearPicker(false);
                }}
              >
                <Text style={[styles.pickerOptionText, year === selectedYear && styles.pickerOptionTextActive]}>
                  {year}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {showMonthPicker && (
          <View style={styles.pickerDropdown}>
            <ScrollView style={styles.monthScroll} nestedScrollEnabled>
              {MONTHS.map((month, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.pickerOption, index === selectedMonth && styles.pickerOptionActive]}
                  onPress={() => {
                    setSelectedMonth(index);
                    setShowMonthPicker(false);
                  }}
                >
                  <Text style={[styles.pickerOptionText, index === selectedMonth && styles.pickerOptionTextActive]}>
                    {month}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.periodBadge}>
        <Text style={styles.periodBadgeText}>{periodLabel}</Text>
      </View>

      {statsQuery.isLoading ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : stats ? (
        <>
          <View style={styles.mainStatCard}>
            <View style={[styles.mainStatIcon, { backgroundColor: Colors.light.success + '15' }]}>
              <TrendingUp size={28} color={Colors.light.success} strokeWidth={2} />
            </View>
            <Text style={styles.mainStatLabel}>Chiffre d&apos;affaires</Text>
            <Text style={styles.mainStatValue}>{formatCurrency(stats.totalRevenue)}</Text>
            <Text style={styles.mainStatSubValue}>{stats.paidInvoices} facture(s) payée(s)</Text>
          </View>

          <View style={styles.statsGrid}>
            <StatCard
              icon={CreditCard}
              label="Factures payées"
              value={formatCurrency(stats.paidAmount)}
              subValue={`${stats.paidInvoices} factures`}
              color={Colors.light.success}
            />
            <StatCard
              icon={Clock}
              label="En attente"
              value={formatCurrency(stats.unpaidAmount)}
              subValue={`${stats.unpaidInvoices} factures`}
              color={Colors.light.warning}
            />
          </View>

          {periodType === 'year' && stats.monthlyData.length > 0 && (
            <BarChart data={stats.monthlyData} maxValue={maxMonthlyRevenue} />
          )}

          <PieChart paid={stats.paidInvoices} unpaid={stats.unpaidInvoices} />

          <QuotesChart 
            accepted={stats.acceptedQuotes}
            rejected={stats.rejectedQuotes}
            pending={stats.pendingQuotes}
            acceptedAmount={stats.acceptedQuotesAmount}
          />

          {creditNoteStats && creditNoteStats.totalCount > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <RotateCcw size={20} color={Colors.light.error} />
                <Text style={styles.sectionTitle}>Avoirs</Text>
              </View>

              <View style={styles.creditNoteCard}>
                <View style={[styles.mainStatIcon, { backgroundColor: Colors.light.error + '15' }]}>
                  <RotateCcw size={28} color={Colors.light.error} strokeWidth={2} />
                </View>
                <Text style={styles.mainStatLabel}>Total des avoirs</Text>
                <Text style={[styles.mainStatValue, { color: Colors.light.error }]}>
                  {formatCurrency(creditNoteStats.totalAmount)}
                </Text>
                <Text style={styles.mainStatSubValue}>
                  {creditNoteStats.totalCount} avoir(s) émis
                </Text>
              </View>

              <View style={styles.creditNoteStatsContainer}>
                <View style={styles.creditNoteStatRow}>
                  <View style={styles.creditNoteStat}>
                    <View style={[styles.creditNoteIconSmall, { backgroundColor: Colors.status.draft + '20' }]}>
                      <FileText size={16} color={Colors.status.draft} />
                    </View>
                    <View>
                      <Text style={styles.creditNoteStatValue}>{creditNoteStats.draftCount}</Text>
                      <Text style={styles.creditNoteStatLabel}>Brouillons</Text>
                    </View>
                  </View>
                  <View style={styles.creditNoteStat}>
                    <View style={[styles.creditNoteIconSmall, { backgroundColor: Colors.status.sent + '20' }]}>
                      <Clock size={16} color={Colors.status.sent} />
                    </View>
                    <View>
                      <Text style={styles.creditNoteStatValue}>{creditNoteStats.sentCount}</Text>
                      <Text style={styles.creditNoteStatLabel}>Envoyés</Text>
                    </View>
                  </View>
                  <View style={styles.creditNoteStat}>
                    <View style={[styles.creditNoteIconSmall, { backgroundColor: Colors.status.paid + '20' }]}>
                      <CheckCircle size={16} color={Colors.status.paid} />
                    </View>
                    <View>
                      <Text style={styles.creditNoteStatValue}>{creditNoteStats.paidCount}</Text>
                      <Text style={styles.creditNoteStatLabel}>Appliqués</Text>
                    </View>
                  </View>
                </View>
              </View>
            </>
          )}

          {expenseStats && (
            <>
              <View style={styles.sectionHeader}>
                <Euro size={20} color={Colors.light.error} />
                <Text style={styles.sectionTitle}>Dépenses</Text>
              </View>

              <View style={styles.expenseMainCard}>
                <View style={[styles.mainStatIcon, { backgroundColor: Colors.light.error + '15' }]}>
                  <Minus size={28} color={Colors.light.error} strokeWidth={2} />
                </View>
                <Text style={styles.mainStatLabel}>Total des dépenses</Text>
                <Text style={[styles.mainStatValue, { color: Colors.light.error }]}>
                  {formatCurrency(expenseStats.totalExpenses)}
                </Text>
                <Text style={styles.mainStatSubValue}>
                  {expenseStats.expenseCount} dépense(s) • TVA: {formatCurrency(expenseStats.totalTVA)}
                </Text>
              </View>

              {periodType === 'year' && expenseStats.monthlyData.length > 0 && (
                <ExpenseBarChart data={expenseStats.monthlyData} maxValue={maxMonthlyExpense} />
              )}

              {expenseStats.byCategory.length > 0 && (
                <ExpenseCategoryChart categories={expenseStats.byCategory} total={expenseStats.totalExpenses} />
              )}

              {expenseList.length > 0 && (
                <View style={styles.expenseDetailContainer}>
                  <Text style={styles.chartTitle}>Détail des dépenses</Text>
                  <View style={styles.expenseDetailList}>
                    {expenseList.slice(0, 15).map((expense: Expense) => {
                      const categoryInfo = EXPENSE_CATEGORIES.find(c => c.id === expense.category);
                      return (
                        <View key={expense.id} style={styles.expenseDetailItem}>
                          <View style={styles.expenseDetailLeft}>
                            <View style={[styles.expenseDetailDot, { backgroundColor: categoryInfo?.color || '#78716C' }]} />
                            <View style={styles.expenseDetailInfo}>
                              <Text style={styles.expenseDetailName} numberOfLines={1}>{expense.establishment}</Text>
                              <Text style={styles.expenseDetailCategory}>{categoryInfo?.label || expense.category}</Text>
                            </View>
                          </View>
                          <View style={styles.expenseDetailRight}>
                            <Text style={styles.expenseDetailAmount}>{formatCurrency(expense.amount_ttc)}</Text>
                            <Text style={styles.expenseDetailDate}>
                              {new Date(expense.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {expenseList.length > 15 && (
                      <Text style={styles.expenseDetailMore}>
                        + {expenseList.length - 15} autre(s) dépense(s)
                      </Text>
                    )}
                  </View>
                </View>
              )}

              <View style={styles.profitCard}>
                <Text style={styles.profitLabel}>Résultat net (CA - Dépenses)</Text>
                <Text style={[
                  styles.profitValue,
                  { color: (stats.totalRevenue - expenseStats.totalExpenses) >= 0 ? Colors.light.success : Colors.light.error }
                ]}>
                  {formatCurrency(stats.totalRevenue - expenseStats.totalExpenses)}
                </Text>
              </View>
            </>
          )}

          {deliveryNoteStats && deliveryNoteStats.totalCount > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Truck size={20} color={Colors.light.warning} />
                <Text style={styles.sectionTitle}>Bons de livraison</Text>
              </View>

              <View style={styles.deliveryNoteCard}>
                <View style={[styles.mainStatIcon, { backgroundColor: Colors.light.warning + '15' }]}>
                  <Truck size={28} color={Colors.light.warning} strokeWidth={2} />
                </View>
                <Text style={styles.mainStatLabel}>Total BL</Text>
                <Text style={[styles.mainStatValue, { color: Colors.light.warning }]}>
                  {deliveryNoteStats.totalCount}
                </Text>
                <Text style={styles.mainStatSubValue}>
                  Poids total: {deliveryNoteStats.totalWeight.toFixed(2)} kg
                </Text>
              </View>

              <View style={styles.deliveryNoteStatsContainer}>
                <View style={styles.deliveryNoteStatRow}>
                  <View style={styles.deliveryNoteStat}>
                    <View style={[styles.deliveryNoteIconSmall, { backgroundColor: Colors.status.draft + '20' }]}>
                      <FileText size={16} color={Colors.status.draft} />
                    </View>
                    <View>
                      <Text style={styles.deliveryNoteStatValue}>{deliveryNoteStats.draftCount}</Text>
                      <Text style={styles.deliveryNoteStatLabel}>Brouillons</Text>
                    </View>
                  </View>
                  <View style={styles.deliveryNoteStat}>
                    <View style={[styles.deliveryNoteIconSmall, { backgroundColor: Colors.light.success + '20' }]}>
                      <CheckCircle size={16} color={Colors.light.success} />
                    </View>
                    <View>
                      <Text style={styles.deliveryNoteStatValue}>{deliveryNoteStats.sentCount}</Text>
                      <Text style={styles.deliveryNoteStatLabel}>Envoyés</Text>
                    </View>
                  </View>
                  <View style={styles.deliveryNoteStat}>
                    <View style={[styles.deliveryNoteIconSmall, { backgroundColor: Colors.light.warning + '20' }]}>
                      <Package size={16} color={Colors.light.warning} />
                    </View>
                    <View>
                      <Text style={styles.deliveryNoteStatValue}>{deliveryNoteStats.totalWeight.toFixed(1)}</Text>
                      <Text style={styles.deliveryNoteStatLabel}>kg livrés</Text>
                    </View>
                  </View>
                </View>
              </View>
            </>
          )}
        </>
      ) : (
        <View style={styles.emptyChart}>
          <TrendingUp size={40} color={Colors.light.textMuted} strokeWidth={1.5} />
          <Text style={styles.emptyChartText}>
            Les graphiques apparaîtront quand vous aurez créé des documents
          </Text>
        </View>
      )}
    </ScrollView>
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
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.light.text,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: Colors.light.textSecondary,
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  exportButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.light.tint + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodSelector: {
    marginBottom: 16,
  },
  periodTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.light.surfaceSecondary,
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
  },
  periodTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  periodTabActive: {
    backgroundColor: Colors.light.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  periodTabText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.textSecondary,
  },
  periodTabTextActive: {
    color: Colors.light.tint,
  },
  periodPickers: {
    flexDirection: 'row',
    gap: 12,
  },
  periodPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.surface,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  periodPickerText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  pickerDropdown: {
    backgroundColor: Colors.light.surface,
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: Colors.light.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    overflow: 'hidden',
  },
  monthScroll: {
    maxHeight: 200,
  },
  pickerOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  pickerOptionActive: {
    backgroundColor: Colors.light.tint + '10',
  },
  pickerOptionText: {
    fontSize: 15,
    color: Colors.light.text,
  },
  pickerOptionTextActive: {
    color: Colors.light.tint,
    fontWeight: '600' as const,
  },
  periodBadge: {
    backgroundColor: Colors.light.tint + '15',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  periodBadgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.light.tint,
  },
  mainStatCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  mainStatIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  mainStatLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  mainStatValue: {
    fontSize: 36,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  mainStatSubValue: {
    fontSize: 13,
    color: Colors.light.textMuted,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardLarge: {
    flex: 2,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  statValueLarge: {
    fontSize: 24,
  },
  statSubValue: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  chartContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.light.text,
    marginBottom: 20,
  },
  chart: {
    flexDirection: 'row',
    height: CHART_HEIGHT,
  },
  yAxis: {
    width: Y_AXIS_WIDTH,
    justifyContent: 'space-between',
    paddingBottom: 24,
    paddingRight: 8,
  },
  yAxisLabel: {
    fontSize: 9,
    color: Colors.light.textMuted,
    textAlign: 'right',
  },
  chartArea: {
    flex: 1,
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 24,
    justifyContent: 'space-between',
  },
  gridLine: {
    height: 1,
    backgroundColor: Colors.light.borderLight,
  },
  barsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    height: CHART_HEIGHT - 24,
    paddingBottom: 24,
    width: CHART_AREA_WIDTH,
  },
  barWrapper: {
    alignItems: 'center',
    width: BAR_WIDTH,
  },
  barBackground: {
    width: BAR_WIDTH,
    height: CHART_HEIGHT - 70,
    justifyContent: 'flex-end',
    backgroundColor: Colors.light.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 2,
  },
  xAxisLabel: {
    fontSize: 9,
    color: Colors.light.textMuted,
    marginTop: 6,
  },
  noDataOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  noDataText: {
    fontSize: 13,
    color: Colors.light.textMuted,
    fontStyle: 'italic',
  },
  pieChartContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  pieChartContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pieChartSvgContainer: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieChartCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.light.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pieSlice: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
  },
  pieSlicePaid: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  pieCenter: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pieCenterValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  pieCenterLabel: {
    fontSize: 11,
    color: Colors.light.textMuted,
  },
  pieChartVisual: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    flexDirection: 'row',
    overflow: 'hidden',
    transform: [{ rotate: '-90deg' }],
  },
  pieSegment: {
    height: '100%',
  },
  pieChartLegend: {
    flex: 1,
    marginLeft: 24,
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendLabel: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  legendValue: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  quotesChartContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  quotesStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
  },
  quoteStat: {
    alignItems: 'center',
  },
  quoteIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quoteStatValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  quoteStatLabel: {
    fontSize: 12,
    color: Colors.light.textSecondary,
    marginTop: 2,
  },
  quotesProgressContainer: {
    gap: 12,
  },
  quotesProgressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.light.borderLight,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  progressSegment: {
    height: '100%',
  },
  quotesInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quoteInfoText: {
    fontSize: 13,
    color: Colors.light.textSecondary,
  },
  quoteInfoHighlight: {
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  emptyChart: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyChartText: {
    fontSize: 14,
    color: Colors.light.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  expenseMainCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.error,
  },
  categoryChartContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryProgressBar: {
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.light.borderLight,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 16,
  },
  categorySegment: {
    height: '100%',
  },
  categoryList: {
    gap: 12,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  categoryLabel: {
    fontSize: 14,
    color: Colors.light.text,
  },
  categoryItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.text,
  },
  categoryPercent: {
    fontSize: 12,
    color: Colors.light.textMuted,
    minWidth: 35,
    textAlign: 'right',
  },
  profitCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  profitLabel: {
    fontSize: 14,
    color: Colors.light.textSecondary,
    marginBottom: 8,
  },
  profitValue: {
    fontSize: 28,
    fontWeight: '700' as const,
  },
  expenseDetailContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  expenseDetailList: {
    gap: 12,
  },
  expenseDetailItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.borderLight,
  },
  expenseDetailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  expenseDetailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  expenseDetailInfo: {
    flex: 1,
  },
  expenseDetailName: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.light.text,
  },
  expenseDetailCategory: {
    fontSize: 12,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  expenseDetailRight: {
    alignItems: 'flex-end',
  },
  expenseDetailAmount: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.light.error,
  },
  expenseDetailDate: {
    fontSize: 11,
    color: Colors.light.textMuted,
    marginTop: 2,
  },
  expenseDetailMore: {
    fontSize: 13,
    color: Colors.light.textSecondary,
    textAlign: 'center',
    paddingTop: 8,
    fontStyle: 'italic',
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 15,
    color: Colors.light.textSecondary,
  },
  creditNoteCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.error,
  },
  creditNoteStatsContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  creditNoteStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  creditNoteStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  creditNoteIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creditNoteStatValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  creditNoteStatLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
  deliveryNoteCard: {
    backgroundColor: Colors.light.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.warning,
  },
  deliveryNoteStatsContainer: {
    backgroundColor: Colors.light.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  deliveryNoteStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  deliveryNoteStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deliveryNoteIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryNoteStatValue: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.light.text,
  },
  deliveryNoteStatLabel: {
    fontSize: 11,
    color: Colors.light.textSecondary,
  },
});
