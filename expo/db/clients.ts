import * as SQLite from 'expo-sqlite';
import { Client, ClientFormData } from '@/types/client';

export async function getAllClients(db: SQLite.SQLiteDatabase): Promise<Client[]> {
  console.log('[DB-Clients] Fetching all clients...');
  const results = await db.getAllAsync<Client>(
    'SELECT * FROM clients ORDER BY name ASC'
  );
  console.log('[DB-Clients] Found:', results.length, 'clients');
  return results;
}

export async function searchClients(db: SQLite.SQLiteDatabase, query: string): Promise<Client[]> {
  console.log('[DB-Clients] Searching clients:', query);
  const searchTerm = `%${query}%`;
  const results = await db.getAllAsync<Client>(
    `SELECT * FROM clients 
     WHERE name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ?
     ORDER BY name ASC`,
    [searchTerm, searchTerm, searchTerm, searchTerm]
  );
  console.log('[DB-Clients] Search found:', results.length, 'clients');
  return results;
}

export async function getClientById(db: SQLite.SQLiteDatabase, id: number): Promise<Client | null> {
  console.log('[DB-Clients] Fetching client by id:', id);
  const result = await db.getFirstAsync<Client>(
    'SELECT * FROM clients WHERE id = ?',
    [id]
  );
  return result;
}

export async function createClient(db: SQLite.SQLiteDatabase, data: ClientFormData): Promise<number> {
  console.log('[DB-Clients] Creating client:', data.name);
  const result = await db.runAsync(
    `INSERT INTO clients (name, company, siret, tva_number, email, phone, address, city, postal_code, country, delivery_address, delivery_city, delivery_postal_code, delivery_country, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name,
      data.company || null,
      data.siret || null,
      data.tva_number || null,
      data.email || null,
      data.phone || null,
      data.address || null,
      data.city || null,
      data.postal_code || null,
      data.country || 'France',
      data.delivery_address || null,
      data.delivery_city || null,
      data.delivery_postal_code || null,
      data.delivery_country || null,
      data.notes || null,
    ]
  );
  console.log('[DB-Clients] Client created with id:', result.lastInsertRowId);
  return result.lastInsertRowId;
}

export async function updateClient(db: SQLite.SQLiteDatabase, id: number, data: ClientFormData): Promise<void> {
  console.log('[DB-Clients] Updating client:', id);
  await db.runAsync(
    `UPDATE clients 
     SET name = ?, company = ?, siret = ?, tva_number = ?, email = ?, phone = ?, address = ?, city = ?, postal_code = ?, country = ?, delivery_address = ?, delivery_city = ?, delivery_postal_code = ?, delivery_country = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      data.name,
      data.company || null,
      data.siret || null,
      data.tva_number || null,
      data.email || null,
      data.phone || null,
      data.address || null,
      data.city || null,
      data.postal_code || null,
      data.country || 'France',
      data.delivery_address || null,
      data.delivery_city || null,
      data.delivery_postal_code || null,
      data.delivery_country || null,
      data.notes || null,
      id,
    ]
  );
  console.log('[DB-Clients] Client updated');
}

export async function deleteClient(db: SQLite.SQLiteDatabase, id: number): Promise<void> {
  console.log('[DB-Clients] Deleting client:', id);
  await db.runAsync('DELETE FROM clients WHERE id = ?', [id]);
  console.log('[DB-Clients] Client deleted');
}

export async function getClientDocumentCount(db: SQLite.SQLiteDatabase, clientId: number): Promise<number> {
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM documents WHERE client_id = ?',
    [clientId]
  );
  return result?.count || 0;
}
