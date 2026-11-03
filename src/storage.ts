import { DurableObject } from 'cloudflare:workers';
import { controlSchema } from './control-schema';
import { schema } from './schema';

type Value = SqlStorageValue;
type Query = { sql: string; values: Value[] };
type Result<T = Record<string, Value>> = { results: T[]; meta: { changes: number } };

// One coordination/storage object per protected security group. It is never public HTTP.
export class AccessDatabase extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.transactionSync(() => {
        ctx.storage.sql.exec(schema);
        const columns = new Set(ctx.storage.sql.exec<{name: string}>('PRAGMA table_info(customers)').toArray().map(c => c.name));
        if (!columns.has('max_manual_days')) ctx.storage.sql.exec('ALTER TABLE customers ADD COLUMN max_manual_days INTEGER NOT NULL DEFAULT 365');
        if (!columns.has('tier')) ctx.storage.sql.exec("ALTER TABLE customers ADD COLUMN tier TEXT NOT NULL DEFAULT 'standard'");
        for (const statement of controlSchema) ctx.storage.sql.exec(statement);
      });
    });
  }
  private execute(query: Query): Result {
    const results = this.ctx.storage.sql.exec(query.sql, ...query.values).toArray();
    const changes = this.ctx.storage.sql.exec<{ n: number }>('SELECT changes() AS n').one().n;
    return { results, meta: { changes } };
  }
  async query(query: Query): Promise<Result> { return this.execute(query); }
  async batch(queries: Query[]): Promise<Result[]> {
    return this.ctx.storage.transactionSync(() => queries.map(query => this.execute(query)));
  }
}

type Stub = DurableObjectStub<AccessDatabase>;
export class Statement {
  constructor(readonly stub: Stub, readonly sql: string, readonly values: Value[] = []) {}
  bind(...values: Value[]) { return new Statement(this.stub, this.sql, values); }
  async run() { return this.stub.query({ sql: this.sql, values: this.values }); }
  async all<T = Record<string, Value>>(): Promise<Result<T>> { const result = await this.run(); const rows: unknown[] = Array.from(result.results); return { results: rows as T[], meta: { changes: result.meta.changes } }; }
  async first<T = Record<string, Value>>(): Promise<T | null> { return (await this.all<T>()).results[0] ?? null; }
}
export class Database {
  constructor(readonly stub: Stub) {}
  prepare(sql: string) { return new Statement(this.stub, sql); }
  batch(statements: Statement[]) { return this.stub.batch(statements.map(s => ({ sql: s.sql, values: s.values }))); }
}
