import { getDatabase } from './database';
import { initYearDatabase } from './multiYearDatabase';
import { Expense, ExpenseFormData, ExpenseFilter, ExpenseTotals } from '@/types/expense';

// Helper to get the year from a date string (YYYY-MM-DD)
function getYearFromDate(date: string): number {
  const year = parseInt(date.split('-')[0], 10);
  return isNaN(year) ? new Date().getFullYear() : year;
}

// Get the database for a specific year, auto-creating if needed
async function getDatabaseForExpenseYear(year: number) {
  console.log('[Expenses] Getting database for year:', year);
  return await initYearDatabase(year);
}

export async function createExpense(data: ExpenseFormData): Promise<number> {
  // Determine the year from the expense date
  const expenseYear = getYearFromDate(data.date);
  const db = await getDatabaseForExpenseYear(expenseYear);
  
  console.log('[Expenses] Creating expense for year:', expenseYear, 'date:', data.date);

  const amountTtcCents = Math.round(data.amount_ttc * 100);
  const amountTvaCents = Math.round(data.amount_tva * 100);

  // Si c'est une dépense récurrente, générer toutes les instances immédiatement
  // Chaque instance va dans la base de données de son année
  if (data.is_recurring && data.recurring_start_date && data.recurring_end_date) {
    console.log('[DB] Creating recurring expense instances from', data.recurring_start_date, 'to', data.recurring_end_date);
    
    const groupId = Date.now();
    
    // Parser les dates de début et fin
    const startParts = data.recurring_start_date.split('-');
    const endParts = data.recurring_end_date.split('-');
    
    const startYear = parseInt(startParts[0], 10);
    const startMonth = parseInt(startParts[1], 10) - 1; // 0-indexed
    const recurringDay = parseInt(startParts[2], 10);
    
    const endYear = parseInt(endParts[0], 10);
    const endMonth = parseInt(endParts[1], 10) - 1;
    
    console.log('[DB] Parsed dates - start:', startYear, startMonth, recurringDay, 'end:', endYear, endMonth);
    
    let firstId = 0;
    let count = 0;
    
    // Itérer mois par mois en utilisant year/month directement (évite les bugs de setMonth)
    let currentYear = startYear;
    let currentMonth = startMonth;
    
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const dayToUse = Math.min(recurringDay, daysInMonth);
      
      const expenseDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayToUse).padStart(2, '0')}`;
      
      console.log('[DB] Checking date:', expenseDate, 'against range', data.recurring_start_date, '-', data.recurring_end_date);
      
      // Vérifier que la date est dans la plage
      if (expenseDate >= data.recurring_start_date && expenseDate <= data.recurring_end_date) {
        console.log('[DB] Creating recurring instance for date:', expenseDate, 'in year db:', currentYear);
        
        // Get the database for this expense's year
        const yearDb = await getDatabaseForExpenseYear(currentYear);
        
        const result = await yearDb.runAsync(
          `INSERT INTO expenses (establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents, tva_rate, date, category, photo_uri, ocr_text, notes, is_recurring, recurring_start_date, recurring_end_date, recurring_day, recurring_parent_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.establishment,
            data.amount_ttc,
            data.amount_tva,
            amountTtcCents,
            amountTvaCents,
            data.tva_rate,
            expenseDate,
            data.category,
            data.photo_uri || null,
            data.ocr_text || null,
            data.notes || null,
            1,
            data.recurring_start_date,
            data.recurring_end_date,
            recurringDay,
            groupId,
          ]
        );
        
        if (firstId === 0) firstId = result.lastInsertRowId;
        count++;
      }
      
      // Passer au mois suivant
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }
    
    console.log('[DB] Created', count, 'recurring expense instances');
    return firstId;
  }

  // Dépense normale (non récurrente)
  console.log('[DB] Creating single expense:', data, 'cents:', { amountTtcCents, amountTvaCents });

  const result = await db.runAsync(
    `INSERT INTO expenses (establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents, tva_rate, date, category, photo_uri, ocr_text, notes, is_recurring, recurring_start_date, recurring_end_date, recurring_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.establishment,
      data.amount_ttc,
      data.amount_tva,
      amountTtcCents,
      amountTvaCents,
      data.tva_rate,
      data.date,
      data.category,
      data.photo_uri || null,
      data.ocr_text || null,
      data.notes || null,
      0,
      null,
      null,
      null,
    ]
  );

  console.log('[DB] Expense created with ID:', result.lastInsertRowId);
  return result.lastInsertRowId;
}

export async function updateExpense(id: number, data: ExpenseFormData): Promise<void> {
  // Determine the year from the expense date
  const expenseYear = getYearFromDate(data.date);
  const db = await getDatabaseForExpenseYear(expenseYear);
  
  console.log('[Expenses] Updating expense for year:', expenseYear);

  const amountTtcCents = Math.round(data.amount_ttc * 100);
  const amountTvaCents = Math.round(data.amount_tva * 100);
  const isRecurring = data.is_recurring ? 1 : 0;
  const recurringDay = data.recurring_start_date ? new Date(data.recurring_start_date).getDate() : null;

  console.log('[DB] Updating expense:', id, data, 'cents:', { amountTtcCents, amountTvaCents });

  // Récupérer l'expense actuelle pour vérifier si c'est une récurrence
  const currentExpense = await db.getFirstAsync<Expense>(
    'SELECT * FROM expenses WHERE id = ?',
    [id]
  );

  // Si c'est une dépense récurrente et que les dates ont changé, régénérer les instances manquantes
  // Les instances sont réparties dans les bases de données de leurs années respectives
  if (data.is_recurring && data.recurring_start_date && data.recurring_end_date && currentExpense) {
    const groupId = currentExpense.recurring_parent_id || Date.now();
    
    console.log('[DB] Updating recurring expense group:', groupId);

    // Parser les dates de début et fin
    const startParts = data.recurring_start_date.split('-');
    const endParts = data.recurring_end_date.split('-');
    
    const startYear = parseInt(startParts[0], 10);
    const startMonth = parseInt(startParts[1], 10) - 1;
    const recurringDayValue = parseInt(startParts[2], 10);
    
    const endYear = parseInt(endParts[0], 10);
    const endMonth = parseInt(endParts[1], 10) - 1;
    
    // Collecter les dates existantes de toutes les années concernées
    const existingDates = new Set<string>();
    
    for (let year = startYear; year <= endYear; year++) {
      try {
        const yearDb = await getDatabaseForExpenseYear(year);
        
        // Mettre à jour les instances existantes dans cette année
        await yearDb.runAsync(
          `UPDATE expenses SET
            establishment = ?,
            amount_ttc = ?,
            amount_tva = ?,
            amount_ttc_cents = ?,
            amount_tva_cents = ?,
            tva_rate = ?,
            category = ?,
            notes = ?,
            is_recurring = ?,
            recurring_start_date = ?,
            recurring_end_date = ?,
            recurring_day = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE recurring_parent_id = ?`,
          [
            data.establishment,
            data.amount_ttc,
            data.amount_tva,
            amountTtcCents,
            amountTvaCents,
            data.tva_rate,
            data.category,
            data.notes || null,
            isRecurring,
            data.recurring_start_date,
            data.recurring_end_date,
            recurringDay,
            groupId,
          ]
        );
        
        // Récupérer les dates existantes pour cette année
        const yearExpenses = await yearDb.getAllAsync<{ date: string }>(
          'SELECT date FROM expenses WHERE recurring_parent_id = ?',
          [groupId]
        );
        yearExpenses.forEach(e => existingDates.add(e.date));
        
        // Supprimer les instances hors de la nouvelle plage
        await yearDb.runAsync(
          `DELETE FROM expenses WHERE recurring_parent_id = ? AND (date < ? OR date > ?)`,
          [groupId, data.recurring_start_date, data.recurring_end_date]
        );
      } catch {
        console.log('[DB] No database for year', year, '- skipping update');
      }
    }
    
    console.log('[DB] Existing dates for group:', Array.from(existingDates));

    // Générer les instances manquantes dans les bonnes bases de données
    let currentYear = startYear;
    let currentMonth = startMonth;
    let createdCount = 0;

    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
      const dayToUse = Math.min(recurringDayValue, daysInMonth);
      
      const expenseDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(dayToUse).padStart(2, '0')}`;
      
      // Vérifier que la date est dans la plage et n'existe pas déjà
      if (expenseDate >= data.recurring_start_date && expenseDate <= data.recurring_end_date && !existingDates.has(expenseDate)) {
        console.log('[DB] Creating missing recurring instance for date:', expenseDate, 'in year db:', currentYear);
        
        // Get the database for this expense's year
        const yearDb = await getDatabaseForExpenseYear(currentYear);
        
        await yearDb.runAsync(
          `INSERT INTO expenses (establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents, tva_rate, date, category, photo_uri, ocr_text, notes, is_recurring, recurring_start_date, recurring_end_date, recurring_day, recurring_parent_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.establishment,
            data.amount_ttc,
            data.amount_tva,
            amountTtcCents,
            amountTvaCents,
            data.tva_rate,
            expenseDate,
            data.category,
            null, // photo_uri - pas de photo pour les nouvelles instances
            null,
            data.notes || null,
            1,
            data.recurring_start_date,
            data.recurring_end_date,
            recurringDayValue,
            groupId,
          ]
        );
        createdCount++;
      }
      
      // Passer au mois suivant
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
    }

    console.log('[DB] Recurring expense updated - created:', createdCount);
    return;
  }

  // Mise à jour simple pour une dépense non récurrente
  await db.runAsync(
    `UPDATE expenses SET
      establishment = ?,
      amount_ttc = ?,
      amount_tva = ?,
      amount_ttc_cents = ?,
      amount_tva_cents = ?,
      tva_rate = ?,
      date = ?,
      category = ?,
      photo_uri = ?,
      ocr_text = ?,
      notes = ?,
      is_recurring = ?,
      recurring_start_date = ?,
      recurring_end_date = ?,
      recurring_day = ?,
      updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      data.establishment,
      data.amount_ttc,
      data.amount_tva,
      amountTtcCents,
      amountTvaCents,
      data.tva_rate,
      data.date,
      data.category,
      data.photo_uri || null,
      data.ocr_text || null,
      data.notes || null,
      isRecurring,
      data.recurring_start_date || null,
      data.recurring_end_date || null,
      recurringDay,
      id,
    ]
  );

  console.log('[DB] Expense updated:', id);
}

export async function deleteExpense(id: number, expenseDate?: string): Promise<void> {
  // If expenseDate is provided, use it to determine the year database
  // Otherwise, try to find the expense in the current year's database
  let db;
  if (expenseDate) {
    const expenseYear = getYearFromDate(expenseDate);
    db = await getDatabaseForExpenseYear(expenseYear);
  } else {
    db = getDatabase();
    if (!db) throw new Error('Database not initialized');
  }

  console.log('[DB] Deleting expense:', id);

  await db.runAsync('DELETE FROM expenses WHERE id = ?', [id]);

  console.log('[DB] Expense deleted:', id);
}

export async function getExpenseById(id: number, year?: number): Promise<Expense | null> {
  let db;
  if (year) {
    db = await getDatabaseForExpenseYear(year);
  } else {
    db = getDatabase();
    if (!db) throw new Error('Database not initialized');
  }

  const result = await db.getFirstAsync<Expense>(
    'SELECT * FROM expenses WHERE id = ?',
    [id]
  );

  return result || null;
}

export async function getExpensesByFilter(filter: ExpenseFilter): Promise<Expense[]> {
  console.log('[DB] Getting expenses with filter:', filter);

  // Determine which years are covered by the filter
  const startYear = getYearFromDate(filter.startDate);
  const endYear = getYearFromDate(filter.endDate);
  
  console.log('[DB] Filter spans years:', startYear, 'to', endYear);
  
  const allResults: Expense[] = [];
  
  // Query each year's database
  for (let year = startYear; year <= endYear; year++) {
    try {
      const yearDb = await getDatabaseForExpenseYear(year);
      
      const results = await yearDb.getAllAsync<Expense>(
        `SELECT * FROM expenses 
         WHERE date >= ? AND date <= ? 
         ORDER BY date DESC, created_at DESC`,
        [filter.startDate, filter.endDate]
      );
      
      console.log('[DB] Found', results.length, 'expenses in year', year);
      allResults.push(...results);
    } catch {
      console.log('[DB] No database for year', year, '- skipping');
    }
  }
  
  // Sort all results by date descending
  allResults.sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (b.created_at || '').localeCompare(a.created_at || '');
  });

  console.log('[DB] Total expenses found:', allResults.length);
  return allResults;
}

export async function getExpenseTotals(filter: ExpenseFilter): Promise<ExpenseTotals> {
  // Determine which years are covered by the filter
  const startYear = getYearFromDate(filter.startDate);
  const endYear = getYearFromDate(filter.endDate);
  
  let totalTTC = 0;
  let totalTVA = 0;
  
  // Query each year's database
  for (let year = startYear; year <= endYear; year++) {
    try {
      const yearDb = await getDatabaseForExpenseYear(year);
      
      const result = await yearDb.getFirstAsync<{ totalTTC: number; totalTVA: number }>(
        `SELECT 
          COALESCE(SUM(amount_ttc), 0) as totalTTC,
          COALESCE(SUM(amount_tva), 0) as totalTVA
         FROM expenses 
         WHERE date >= ? AND date <= ?`,
        [filter.startDate, filter.endDate]
      );
      
      totalTTC += result?.totalTTC || 0;
      totalTVA += result?.totalTVA || 0;
    } catch {
      console.log('[DB] No database for year', year, '- skipping totals');
    }
  }

  return { totalTTC, totalTVA };
}

export async function getAllExpenses(): Promise<Expense[]> {
  // Get expenses from the current active database only
  const db = getDatabase();
  if (!db) throw new Error('Database not initialized');

  const results = await db.getAllAsync<Expense>(
    'SELECT * FROM expenses ORDER BY date DESC'
  );

  return results;
}

// Get all expenses for a specific year
export async function getExpensesByYear(year: number): Promise<Expense[]> {
  const db = await getDatabaseForExpenseYear(year);
  
  const results = await db.getAllAsync<Expense>(
    'SELECT * FROM expenses ORDER BY date DESC'
  );

  return results;
}

// Fonction simplifiée - plus besoin de génération automatique
// Les dépenses récurrentes sont maintenant générées immédiatement à la création
export async function checkAndGenerateRecurringExpenses(): Promise<number> {
  console.log('[DB] checkAndGenerateRecurringExpenses - no longer needed, instances are created at save time');
  return 0;
}

export interface ExpenseStats {
  totalExpenses: number;
  totalTVA: number;
  expenseCount: number;
  byCategory: { category: string; total: number; count: number }[];
  monthlyData: { month: string; total: number }[];
}

export async function archiveExpensesByMonth(year: number, month: number): Promise<number> {
  // Get the database for the specific year
  const db = await getDatabaseForExpenseYear(year);

  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;

  console.log('[DB] Archiving expenses from', startDate, 'to', endDate);

  // Get expenses with photos to delete
  const expensesWithPhotos = await db.getAllAsync<{ id: number; photo_uri: string }>(
    `SELECT id, photo_uri FROM expenses 
     WHERE date >= ? AND date <= ? AND photo_uri IS NOT NULL AND is_archived = 0`,
    [startDate, endDate]
  );

  console.log('[DB] Found', expensesWithPhotos.length, 'expenses with photos to archive');

  // Archive all expenses for the month: set is_archived=1 and photo_uri=NULL
  const result = await db.runAsync(
    `UPDATE expenses 
     SET is_archived = 1, photo_uri = NULL, updated_at = CURRENT_TIMESTAMP
     WHERE date >= ? AND date <= ? AND is_archived = 0`,
    [startDate, endDate]
  );

  console.log('[DB] Archived', result.changes, 'expenses');

  return result.changes;
}

export async function getExpenseStatsByPeriod(
  year: number,
  month?: number
): Promise<ExpenseStats> {
  // Get the database for the specific year
  const db = await getDatabaseForExpenseYear(year);

  let startDate: string;
  let endDate: string;

  if (month !== undefined) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    startDate = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    endDate = `${year}-${String(month + 1).padStart(2, '0')}-${lastDay}`;
  } else {
    startDate = `${year}-01-01`;
    endDate = `${year}-12-31`;
  }

  console.log('[DB] Getting expense stats from', startDate, 'to', endDate);

  const totals = await db.getFirstAsync<{ totalTTC: number; totalTVA: number; count: number }>(
    `SELECT 
      COALESCE(SUM(amount_ttc), 0) as totalTTC,
      COALESCE(SUM(amount_tva), 0) as totalTVA,
      COUNT(*) as count
     FROM expenses 
     WHERE date >= ? AND date <= ?`,
    [startDate, endDate]
  );

  const byCategory = await db.getAllAsync<{ category: string; total: number; count: number }>(
    `SELECT 
      category,
      COALESCE(SUM(amount_ttc), 0) as total,
      COUNT(*) as count
     FROM expenses 
     WHERE date >= ? AND date <= ?
     GROUP BY category
     ORDER BY total DESC`,
    [startDate, endDate]
  );

  let monthlyData: { month: string; total: number }[] = [];
  
  if (month === undefined) {
    const monthlyResults = await db.getAllAsync<{ month_num: number; total: number }>(
      `SELECT 
        CAST(strftime('%m', date) AS INTEGER) as month_num,
        COALESCE(SUM(amount_ttc), 0) as total
       FROM expenses 
       WHERE date >= ? AND date <= ?
       GROUP BY month_num
       ORDER BY month_num`,
      [startDate, endDate]
    );

    const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
    monthlyData = MONTHS_SHORT.map((monthName, index) => {
      const found = monthlyResults.find(r => r.month_num === index + 1);
      return {
        month: monthName,
        total: found?.total || 0,
      };
    });
  }

  console.log('[DB] Expense stats:', { totals, byCategory: byCategory.length, monthlyData: monthlyData.length });

  return {
    totalExpenses: totals?.totalTTC || 0,
    totalTVA: totals?.totalTVA || 0,
    expenseCount: totals?.count || 0,
    byCategory,
    monthlyData,
  };
}
