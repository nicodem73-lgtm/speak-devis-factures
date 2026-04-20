import * as SQLite from 'expo-sqlite';
import { Product, ProductFormData } from '@/types/product';

export async function getAllProducts(db: SQLite.SQLiteDatabase): Promise<Product[]> {
  console.log('[DB-Products] Fetching all products...');
  const results = await db.getAllAsync<Product>(
    'SELECT * FROM products ORDER BY name ASC'
  );
  console.log('[DB-Products] Found:', results.length, 'products');
  return results;
}

export async function searchProducts(db: SQLite.SQLiteDatabase, query: string): Promise<Product[]> {
  console.log('[DB-Products] Searching products:', query);
  const searchTerm = `%${query}%`;
  const results = await db.getAllAsync<Product>(
    `SELECT * FROM products 
     WHERE name LIKE ? OR description LIKE ?
     ORDER BY name ASC`,
    [searchTerm, searchTerm]
  );
  console.log('[DB-Products] Search found:', results.length, 'products');
  return results;
}

export async function getProductById(db: SQLite.SQLiteDatabase, id: number): Promise<Product | null> {
  console.log('[DB-Products] Fetching product by id:', id);
  const result = await db.getFirstAsync<Product>(
    'SELECT * FROM products WHERE id = ?',
    [id]
  );
  return result;
}

export async function createProduct(db: SQLite.SQLiteDatabase, data: ProductFormData): Promise<number> {
  console.log('[DB-Products] Creating product:', data.name);
  const unitPrice = parseFloat(data.unit_price.replace(',', '.'));
  const tvaRate = parseFloat(data.tva_rate);
  
  const result = await db.runAsync(
    `INSERT INTO products (name, description, unit_price, unit, tva_rate, is_service)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.description || null,
      unitPrice,
      data.unit,
      tvaRate,
      data.is_service ? 1 : 0,
    ]
  );
  console.log('[DB-Products] Product created with id:', result.lastInsertRowId);
  return result.lastInsertRowId;
}

export async function updateProduct(db: SQLite.SQLiteDatabase, id: number, data: ProductFormData): Promise<void> {
  console.log('[DB-Products] Updating product:', id);
  const unitPrice = parseFloat(data.unit_price.replace(',', '.'));
  const tvaRate = parseFloat(data.tva_rate);
  
  await db.runAsync(
    `UPDATE products 
     SET name = ?, description = ?, unit_price = ?, unit = ?, tva_rate = ?, is_service = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      data.name,
      data.description || null,
      unitPrice,
      data.unit,
      tvaRate,
      data.is_service ? 1 : 0,
      id,
    ]
  );
  console.log('[DB-Products] Product updated');
}

export async function deleteProduct(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  console.log('[DB-Products] Deleting product:', id);
  await db.runAsync('DELETE FROM products WHERE id = ?', [id]);
  console.log('[DB-Products] Product deleted');
}

export async function getProductUsageCount(db: SQLite.SQLiteDatabase, productId: number): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM line_items WHERE product_id = ?',
    [productId]
  );
  return result?.count || 0;
}

export async function getProductsByType(db: SQLite.SQLiteDatabase, isService: boolean): Promise<Product[]> {
  console.log('[DB-Products] Fetching by type, isService:', isService);
  const results = await db.getAllAsync<Product>(
    'SELECT * FROM products WHERE is_service = ? ORDER BY name ASC',
    [isService ? 1 : 0]
  );
  return results;
}
