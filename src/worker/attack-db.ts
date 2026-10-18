import type { Database, SqlJsStatic, SqlValue } from 'sql.js';

export type LabIdentity = { id: number; email: string; role: string };
export type LabRow = Record<string, SqlValue>;

export const DEMO_CUSTOMERS = Array.from({ length: 102 }, (_, index) => ({
  id: index + 1,
  full_name: index === 0 ? '架空 花子' : index === 1 ? '見本 太郎' : `架空 顧客${String(index + 1).padStart(3, '0')}`,
  email: index === 0 ? 'buyer-a@example.test' : index === 1 ? 'buyer-b@example.test' : `customer-${String(index + 1).padStart(3, '0')}@example.test`,
  birth_date: '1995-04-12', address: `架空県サンプル市デモ町 ${index + 1}番地`,
  phone: `000-0000-${String(index + 1).padStart(4, '0')}`,
  employer: '架空サンプル株式会社', license_number: `SAMPLE-INVALID-${index + 1}`,
  internal_note: 'DEMO ONLY / 実在しない顧客 / 社内向けの架空メモ', synthetic: 1,
}));

// No network, Supabase connection, filesystem mounting or real credentials.
// Every request gets a fresh DB; injection cannot change another visitor's data.
export function createAttackDb(SQL: SqlJsStatic): Database {
  const db = new SQL.Database();
  db.run('CREATE TABLE lab_users (id INTEGER, email TEXT, password TEXT, role TEXT)');
  db.run("INSERT INTO lab_users VALUES (1,'buyer-a@example.test','demo-password','customer'),(2,'buyer-b@example.test','demo-password','customer'),(103,'admin@example.test','admin','admin')");
  db.run('CREATE TABLE lab_customers (id INTEGER, full_name TEXT, email TEXT, birth_date TEXT, address TEXT, phone TEXT, employer TEXT, license_number TEXT, internal_note TEXT, synthetic INTEGER)');
  const insert = db.prepare('INSERT INTO lab_customers VALUES (?,?,?,?,?,?,?,?,?,?)');
  try { for (const customer of DEMO_CUSTOMERS) insert.run(Object.values(customer)); }
  finally { insert.free(); }
  db.run('PRAGMA query_only=ON; PRAGMA hard_heap_limit=4194304;');
  return db;
}

export function selectRows(db: Database, sql: string, params: SqlValue[] = []): LabRow[] {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    const rows: LabRow[] = [];
    while (rows.length < 102 && statement.step()) rows.push(statement.getAsObject());
    return rows;
  } finally { statement.free(); }
}

export function loginQuery(db: Database, email: string, password: string, secure: boolean) {
  const sql = secure
    ? 'SELECT id,email,role FROM lab_users WHERE email=? AND password=?'
    : `SELECT id,email,role FROM lab_users WHERE email='${email}' AND password='${password}'`;
  return { sql, rows: selectRows(db, sql, secure ? [email, password] : []) };
}

export function searchQuery(db: Database, term: string, secure: boolean) {
  const sql = secure
    ? 'SELECT id,full_name,email FROM lab_customers WHERE email=? LIMIT 102'
    : `SELECT id,full_name,email FROM lab_customers WHERE email='${term}' LIMIT 102`;
  return { sql, rows: selectRows(db, sql, secure ? [term] : []) };
}

