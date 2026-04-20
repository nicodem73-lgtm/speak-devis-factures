import { 
  initYearDatabase, 
  setDatabaseReadOnly, 
  setActiveYear,
  vacuumDatabase
} from './multiYearDatabase';

export interface YearClosingResult {
  success: boolean;
  newYear: number;
  clientsCopied: number;
  productsCopied: number;
  recurringExpensesCopied: number;
  settingsCopied: number;
  errors: string[];
}

export async function closeYearAndCreateNew(
  currentYear: number,
  onProgress?: (message: string, progress: number) => void
): Promise<YearClosingResult> {
  const newYear = currentYear + 1;
  const errors: string[] = [];
  let clientsCopied = 0;
  let productsCopied = 0;
  let recurringExpensesCopied = 0;
  let settingsCopied = 0;
  
  console.log('[YearClosing] Closing year:', currentYear, '-> Creating:', newYear);
  
  try {
    onProgress?.('Préparation de la clôture...', 5);
    
    const oldDb = await initYearDatabase(currentYear);
    
    onProgress?.('Création de la nouvelle base...', 10);
    const newDb = await initYearDatabase(newYear);
    
    onProgress?.('Copie des clients...', 20);
    interface ClientRow {
      name: string;
      company: string | null;
      siret: string | null;
      tva_number: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      postal_code: string | null;
      country: string | null;
      delivery_address: string | null;
      delivery_city: string | null;
      delivery_postal_code: string | null;
      delivery_country: string | null;
      notes: string | null;
      created_at: string;
    }
    
    const clients = await oldDb.getAllAsync<ClientRow>(
      'SELECT * FROM clients'
    );
    
    for (const client of clients) {
      try {
        await newDb.runAsync(
          `INSERT INTO clients (
            name, company, siret, tva_number, email, phone,
            address, city, postal_code, country,
            delivery_address, delivery_city, delivery_postal_code, delivery_country,
            notes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            client.name, client.company || null, client.siret || null, client.tva_number || null,
            client.email || null, client.phone || null, client.address || null, client.city || null,
            client.postal_code || null, client.country || null, client.delivery_address || null,
            client.delivery_city || null, client.delivery_postal_code || null, client.delivery_country || null,
            client.notes || null, client.created_at, new Date().toISOString()
          ]
        );
        clientsCopied++;
      } catch (error) {
        console.error('[YearClosing] Error copying client:', error);
        errors.push(`Erreur client ${client.name}: ${error}`);
      }
    }
    
    onProgress?.('Copie des produits...', 40);
    interface ProductRow {
      name: string;
      description: string | null;
      unit_price: number;
      unit: string | null;
      tva_rate: number;
      is_service: number;
      created_at: string;
    }
    
    const products = await oldDb.getAllAsync<ProductRow>(
      'SELECT * FROM products'
    );
    
    for (const product of products) {
      try {
        await newDb.runAsync(
          `INSERT INTO products (
            name, description, unit_price, unit, tva_rate, is_service,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.name, product.description || null, product.unit_price,
            product.unit || null, product.tva_rate, product.is_service,
            product.created_at, new Date().toISOString()
          ]
        );
        productsCopied++;
      } catch (error) {
        console.error('[YearClosing] Error copying product:', error);
        errors.push(`Erreur produit ${product.name}: ${error}`);
      }
    }
    
    onProgress?.('Copie des dépenses récurrentes...', 60);
    interface RecurringExpenseRow {
      establishment: string;
      amount_ttc: number;
      amount_tva: number;
      amount_ttc_cents: number;
      amount_tva_cents: number;
      tva_rate: number;
      category: string;
      notes: string | null;
      recurring_day: number | null;
      recurring_parent_id: number | null;
    }
    
    const recurringExpenses = await oldDb.getAllAsync<RecurringExpenseRow>(
      `SELECT DISTINCT establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents,
              tva_rate, category, notes, recurring_day, recurring_parent_id
       FROM expenses 
       WHERE is_recurring = 1 
       AND (recurring_end_date IS NULL OR recurring_end_date >= ?)
       GROUP BY recurring_parent_id`,
      [`${newYear}-01-01`]
    );
    
    for (const expense of recurringExpenses) {
      try {
        const startDate = `${newYear}-01-${String(expense.recurring_day || 1).padStart(2, '0')}`;
        const endDate = `${newYear}-12-31`;
        
        const recurringDay = expense.recurring_day || 1;
        const groupId = Date.now() + Math.random();
        
        for (let month = 0; month < 12; month++) {
          const daysInMonth = new Date(newYear, month + 1, 0).getDate();
          const dayToUse = Math.min(recurringDay as number, daysInMonth);
          const expenseDate = `${newYear}-${String(month + 1).padStart(2, '0')}-${String(dayToUse).padStart(2, '0')}`;
          
          await newDb.runAsync(
            `INSERT INTO expenses (
              establishment, amount_ttc, amount_tva, amount_ttc_cents, amount_tva_cents,
              tva_rate, date, category, notes, is_recurring,
              recurring_start_date, recurring_end_date, recurring_day, recurring_parent_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              expense.establishment, expense.amount_ttc, expense.amount_tva,
              expense.amount_ttc_cents, expense.amount_tva_cents, expense.tva_rate,
              expenseDate, expense.category, expense.notes, 1,
              startDate, endDate, recurringDay, groupId
            ]
          );
        }
        recurringExpensesCopied++;
      } catch (error) {
        console.error('[YearClosing] Error copying recurring expense:', error);
        errors.push(`Erreur dépense récurrente ${expense.establishment}: ${error}`);
      }
    }
    
    onProgress?.('Copie des paramètres...', 80);
    const settings = await oldDb.getAllAsync<{ key: string; value: string }>(
      'SELECT key, value FROM settings'
    );
    
    const counterKeys = ['devis_counter', 'facture_counter', 'delivery_note_counter'];
    
    for (const setting of settings) {
      try {
        let value = setting.value;
        
        if (counterKeys.includes(setting.key)) {
          value = '1';
        }
        
        await newDb.runAsync(
          'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
          [setting.key, value, new Date().toISOString()]
        );
        settingsCopied++;
      } catch (error) {
        console.error('[YearClosing] Error copying setting:', error);
      }
    }
    
    onProgress?.('Finalisation...', 90);
    
    await setDatabaseReadOnly(currentYear);
    
    await vacuumDatabase(currentYear);
    
    await setActiveYear(newYear);
    
    onProgress?.('Clôture terminée!', 100);
    
    console.log('[YearClosing] Year closing completed:', {
      clientsCopied,
      productsCopied,
      recurringExpensesCopied,
      settingsCopied,
      errors: errors.length
    });
    
    return {
      success: errors.length === 0,
      newYear,
      clientsCopied,
      productsCopied,
      recurringExpensesCopied,
      settingsCopied,
      errors
    };
    
  } catch (error) {
    console.error('[YearClosing] Error during year closing:', error);
    return {
      success: false,
      newYear,
      clientsCopied,
      productsCopied,
      recurringExpensesCopied,
      settingsCopied,
      errors: [`Erreur critique: ${error instanceof Error ? error.message : 'Unknown error'}`]
    };
  }
}

export async function checkYearClosingEligibility(year: number): Promise<{
  canClose: boolean;
  reason?: string;
  stats: {
    documentsCount: number;
    unpaidInvoicesCount: number;
    draftDocumentsCount: number;
  };
}> {
  try {
    const db = await initYearDatabase(year);
    
    const totalDocs = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM documents'
    );
    
    const unpaidInvoices = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM documents 
       WHERE type = 'facture' AND status NOT IN ('paid', 'cancelled')`
    );
    
    const draftDocs = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM documents WHERE status = 'draft'`
    );
    
    const stats = {
      documentsCount: totalDocs?.count || 0,
      unpaidInvoicesCount: unpaidInvoices?.count || 0,
      draftDocumentsCount: draftDocs?.count || 0
    };
    
    const currentYear = new Date().getFullYear();
    if (year >= currentYear) {
      return {
        canClose: false,
        reason: 'Impossible de clôturer l\'année en cours ou future',
        stats
      };
    }
    
    return {
      canClose: true,
      stats
    };
    
  } catch (error) {
    return {
      canClose: false,
      reason: `Erreur: ${error instanceof Error ? error.message : 'Unknown'}`,
      stats: { documentsCount: 0, unpaidInvoicesCount: 0, draftDocumentsCount: 0 }
    };
  }
}

export async function getYearSummary(year: number): Promise<{
  documents: { devis: number; factures: number };
  revenue: { paid: number; unpaid: number };
  expenses: { total: number; count: number };
  clients: number;
  products: number;
}> {
  try {
    const db = await initYearDatabase(year);
    
    const devisCount = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM documents WHERE type = 'devis'`
    );
    
    const facturesCount = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM documents WHERE type = 'facture'`
    );
    
    const paidRevenue = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_ttc), 0) as total FROM documents 
       WHERE type = 'facture' AND status = 'paid'`
    );
    
    const unpaidRevenue = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total_ttc), 0) as total FROM documents 
       WHERE type = 'facture' AND status NOT IN ('paid', 'cancelled')`
    );
    
    const expensesTotal = await db.getFirstAsync<{ total: number; count: number }>(
      `SELECT COALESCE(SUM(amount_ttc), 0) as total, COUNT(*) as count FROM expenses`
    );
    
    const clientsCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM clients'
    );
    
    const productsCount = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM products'
    );
    
    return {
      documents: {
        devis: devisCount?.count || 0,
        factures: facturesCount?.count || 0
      },
      revenue: {
        paid: paidRevenue?.total || 0,
        unpaid: unpaidRevenue?.total || 0
      },
      expenses: {
        total: expensesTotal?.total || 0,
        count: expensesTotal?.count || 0
      },
      clients: clientsCount?.count || 0,
      products: productsCount?.count || 0
    };
    
  } catch (error) {
    console.error('[YearClosing] Error getting year summary:', error);
    return {
      documents: { devis: 0, factures: 0 },
      revenue: { paid: 0, unpaid: 0 },
      expenses: { total: 0, count: 0 },
      clients: 0,
      products: 0
    };
  }
}
