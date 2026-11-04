import { DatabaseSync } from "node:sqlite";
export function createSnapshotDb(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;
    CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE stores(id TEXT PRIMARY KEY,json TEXT NOT NULL);
    CREATE TABLE facts(day TEXT,store TEXT,channel TEXT,revenue INTEGER,orders INTEGER,PRIMARY KEY(day,store,channel));
    CREATE TABLE overview(day TEXT,store TEXT,revenue INTEGER,orders INTEGER,refreshed TEXT,PRIMARY KEY(day,store));
    CREATE TABLE recharge(day TEXT,store TEXT,activity TEXT,name TEXT,amount INTEGER,records INTEGER,PRIMARY KEY(day,store,activity,name));
    CREATE TABLE spending(day TEXT,store TEXT,amount INTEGER,PRIMARY KEY(day,store));
    CREATE TABLE consumption(day TEXT,store TEXT,customer TEXT,receipt TEXT,seenNew INTEGER,seenOld INTEGER,PRIMARY KEY(day,store,customer,receipt));
    CREATE TABLE cohorts(store TEXT,created TEXT,registered TEXT,members INTEGER,balance INTEGER,PRIMARY KEY(store,created,registered));
    CREATE INDEX cohort_date ON cohorts(created);
    CREATE INDEX consumption_store_date ON consumption(store,day);
    CREATE INDEX recharge_store_date ON recharge(store,day);
  `);
  return db;
}
export function insertRows(db, table, columns, rows) {
  if (!rows.length) return;
  const stmt = db.prepare(
    `INSERT INTO ${table}(${columns.join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
  );
  db.exec("BEGIN");
  try {
    for (const row of rows) stmt.run(...row);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
