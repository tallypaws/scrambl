import Surreal, { RecordId } from "surrealdb";
import type { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { isDev } from "common/constants";
import { client } from "strife.js";
import { ActivityType } from "discord.js";

const surrealDb = new Surreal();
// surreal sql --namespace prism --database prism --username root --password root --pretty
async function connectDB() {
  let loops = 0;
  
  while (true) {
    try {
      await surrealDb.connect(
        process.env.SURREAL_URI ?? "ws://localhost:9000/rpc",
        {
          namespace: "scrambl",
          database: isDev ? "dev" : "prod",
          auth: { username: "root", password: "root" },
        }
      );
      
      break;
    } catch (error: any) {
      // console.error("Failed to connect to DB", error.message);
      
      if ((loops = 3)) {
        client?.user.setActivity("Waiting for DB", {
          type: ActivityType.Custom,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }
}

await connectDB();
export { surrealDb };
export class DBSingleton<T extends z.ZodTypeAny> {
  protected name: string;
  protected schema: T;
  protected defaultV: z.infer<T>;
  protected recordId: RecordId;
  private changeCallbacks: ((data: z.infer<T>) => void | Promise<void>)[] = [];

  constructor(name: string, defaultV: z.infer<typeof schema>, schema: T) {
    this.name = name;
    this.schema = schema;
    this.defaultV = defaultV;
    this.recordId = new RecordId("singleton", this.name);
  }

  onChange(callback: (data: z.infer<T>) => void | Promise<void>) {
    this.changeCallbacks.push(callback);
    return {
      trigger: async (data: z.infer<T>) => {
        await this.notifyChange(data);
      },
      remove: () => {
        const index = this.changeCallbacks.indexOf(callback);
        if (index > -1) {
          this.changeCallbacks.splice(index, 1);
        }
      },
    };
  }

  private async notifyChange(data: z.infer<T>) {
    
    await Promise.allSettled(
      this.changeCallbacks.map(async (callback) => {
        try {
          await callback(data);
        } catch (error) {
          console.error("Error in onChange callback:", error);
        }
      })
    );
  }

  async get(): Promise<z.infer<T>> {
    const res = await surrealDb.select(this.recordId);
    if (!res) {
      return this.defaultV;
    }
    return this.schema.parse(res.value);
  }
  async set(data: z.infer<T>) {
    await this.schema.parseAsync(data);
    await surrealDb.upsert(this.recordId, {
      value: data,
    });
    await writeDevJson(this.recordId, { value: data });
    await this.notifyChange(data);
  }
  async update(patch: Partial<z.infer<T>>) {
    await surrealDb.merge(this.recordId, {
      value: patch,
    });
    await writeDevJson(this.recordId, { value: patch });
    const updatedData = await this.get();
    await this.notifyChange(updatedData);
  }
}

export class DBMap<T extends z.ZodTypeAny, D = z.infer<T> | null> {
  protected name: string;
  protected schema: T;
  defaultV: D;
  private changeCallbacks: ((
    key: string,
    data: z.infer<T> | null
  ) => void | Promise<void>)[] = [];

  constructor(name: string, schema: T, defaultV: D) {
    this.name = name;
    this.schema = schema;
    this.defaultV = defaultV;
  }

  onChange(
    callback: (key: string, data: z.infer<T> | null) => void | Promise<void>
  ) {
    this.changeCallbacks.push(callback);
    return {
      trigger: async (key: string, data: z.infer<T> | null) => {
        await this.notifyChange(key, data);
      },
      remove: () => {
        const index = this.changeCallbacks.indexOf(callback);
        if (index > -1) {
          this.changeCallbacks.splice(index, 1);
        }
      },
    };
  }

  private async notifyChange(key: string, data: z.infer<T> | null) {
    
    await Promise.allSettled(
      this.changeCallbacks.map(async (callback) => {
        try {
          await callback(key, data);
        } catch (error) {
          console.error("Error in onChange callback:", error);
        }
      })
    );
  }

  async get(
    key: string
  ): Promise<D extends null ? z.infer<T> | null : z.infer<T>> {
    const res = await surrealDb.select(new RecordId(this.name, key));
    function notUndefined<T>(v: T) {
      return v !== undefined;
    }
    if (!notUndefined(res) || !notUndefined(res.value))
      return this.defaultV as any;

    return this.schema.parse(res.value);
  }

  async set(key: string, data: z.infer<T>) {
    await this.schema.parseAsync(data);
    const recordId = new RecordId(this.name, key);
    await surrealDb.upsert(recordId, { value: data });
    await writeDevJson(recordId, { value: data });
    await this.notifyChange(key, data);
  }

  async delete(key: string) {
    const recordId = new RecordId(this.name, key);
    await surrealDb.delete(recordId);
    await deleteDevJson(recordId);
    await this.notifyChange(key, null);
  }

  async allKeys() {
    const sql = `SELECT id FROM ${this.name}`;
    const rows = await surrealDb.query(sql);
    return (rows[0] as { id: RecordId }[]).map(({ id }) => {
      return id.id.toString();
    });
  }
}

type FixedLengthTuple<
  N extends number,
  T = string,
  R extends unknown[] = []
> = R["length"] extends N ? R : FixedLengthTuple<N, T, [...R, T]>;

export class DBNestedMapX<N extends number, T extends z.ZodTypeAny> {
  private changeCallbacks: ((
    keys: FixedLengthTuple<N>,
    data: z.infer<T> | null
  ) => void | Promise<void>)[] = [];

  constructor(
    public namespace: string,
    public schema: T,
    public defaultV: z.infer<T> | null,
    private depth: N
  ) {
    void depth;
  }

  static async create<N extends number, T extends z.ZodTypeAny>(
    namespace: string,
    schema: T,
    defaultV: z.infer<T> | null,
    depth: N
  ): Promise<DBNestedMapX<N, T>> {
    const instance = new DBNestedMapX(namespace, schema, defaultV, depth);
    await instance.ensureIndexes();
    return instance;
  }

  onChange(
    callback: (
      keys: FixedLengthTuple<N>,
      data: z.infer<T> | null
    ) => void | Promise<void>
  ) {
    this.changeCallbacks.push(callback);
    return {
      trigger: async (keys: FixedLengthTuple<N>, data: z.infer<T> | null) => {
        await this.notifyChange(keys, data);
      },
      remove: () => {
        const index = this.changeCallbacks.indexOf(callback);
        if (index > -1) {
          this.changeCallbacks.splice(index, 1);
        }
      },
    };
  }

  private async notifyChange(
    keys: FixedLengthTuple<N>,
    data: z.infer<T> | null
  ) {
    
    await Promise.allSettled(
      this.changeCallbacks.map(async (callback) => {
        try {
          
          await callback(keys, data);
        } catch (error) {
          console.error("Error in onChange callback:", error);
        }
      })
    );
  }

  private async ensureIndexes() {
    const indexName = `idx_${this.namespace}_keys`;

    const keyFields = Array.from(
      { length: this.depth - 1 },
      (_, i) => `key${i + 1}`
    );

    const defineSql = `DEFINE INDEX ${indexName} ON ${
      this.namespace
    } FIELDS ${keyFields.join(", ")}`;

    try {
      await surrealDb.query(defineSql);
      
    } catch (e) {
      if (
        (e instanceof Error ? e.message : String(e)) !==
        `The index '${indexName}' already exists`
      )
        console.warn(
          `[DBNestedMapX] Failed to define index:`,
          e instanceof Error ? e.message : String(e)
        );
    }
  }

  private makeId(keys: FixedLengthTuple<N>): RecordId {
    return new RecordId(this.namespace, (keys as string[]).join(":"));
  }

  private buildMetaKeys(keys: FixedLengthTuple<N>): Record<string, string> {
    const meta: Record<string, string> = {};
    (keys as string[]).forEach((key, i) => {
      meta[`key${i + 1}`] = key;
    });
    return meta;
  }

  async get(keys: FixedLengthTuple<N>): Promise<z.infer<T> | null> {
    const rec = await surrealDb.select(this.makeId(keys));
    if (!rec) return this.defaultV;
    return this.schema.parse(rec.value);
  }

  async set(keys: FixedLengthTuple<N>, data: z.infer<T>) {
    await this.schema.parseAsync(data);
    const meta = this.buildMetaKeys(keys);
    const recordId = this.makeId(keys);
    await surrealDb.upsert(recordId, {
      value: data,
      ...meta,
    });
    await writeDevJson(recordId, { value: data, ...meta });
    await this.notifyChange(keys, data);
  }
  async update(keys: FixedLengthTuple<N>, patch: Partial<z.infer<T>>) {
    const recordId = this.makeId(keys);
    await surrealDb.merge(recordId, { value: patch });
    await writeDevJson(recordId, { value: patch });
    const updatedData = await this.get(keys);
    await this.notifyChange(keys, updatedData);
  }
  async delete(keys: FixedLengthTuple<N>) {
    const recordId = this.makeId(keys);
    await surrealDb.delete(recordId);
    await deleteDevJson(recordId);
    await this.notifyChange(keys, null);
  }
  async find(
    keys: FixedLengthTuple<N> & string[],
    raw: true
  ): Promise<{ value: z.infer<T>; [keyString: `key${number}`]: string }[]>;
  async find(
    keys: FixedLengthTuple<N> & string[],
    raw?: false
  ): Promise<z.infer<T>[]>;
  async find(
    keys: FixedLengthTuple<N> & string[],
    raw?: boolean
  ): Promise<any[]> {
    const filters: string[] = [];
    const params: Record<string, string> = {};

    keys.forEach((val, i) => {
      if (val !== "*") {
        const keyName = `key${i + 1}`;
        filters.push(`${keyName} = $${keyName}`);
        params[keyName] = val;
      }
    });

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
    const sql = `SELECT * FROM ${this.namespace} ${whereClause}`;

    const rows = await surrealDb.query(sql, params);
    return (rows[0] as any[]).map((r: any) => (raw ? r : r.value));
  }

  async findSortedPaginated(
    keys: FixedLengthTuple<N> & string[],
    sortBy: `value.${string}`,
    direction: "asc" | "desc",
    limit: number,
    offset: number,
    raw: true
  ): Promise<
    { value: z.infer<T>; [keyString: `key${number}`]: string; rank: number }[]
  >;
  async findSortedPaginated(
    keys: FixedLengthTuple<N> & string[],
    sortBy: `value.${string}`,
    direction?: "asc" | "desc",
    limit?: number,
    offset?: number,
    raw?: boolean
  ): Promise<
    | (z.infer<T> & { rank: number })[]
    | { value: z.infer<T>; [keyString: `key${number}`]: string; rank: number }[]
  >;
  async findSortedPaginated(
    keys: FixedLengthTuple<N> & string[],
    sortBy: `value.${string}`,
    direction: "asc" | "desc" = "desc",
    limit: number = 30,
    offset: number = 0,
    raw: boolean = false
  ): Promise<
    | (z.infer<T> & { rank: number })[]
    | { value: z.infer<T>; [keyString: `key${number}`]: string; rank: number }[]
  > {
    const filters: string[] = [];
    const params: Record<string, any> = {};

    keys.forEach((val, i) => {
      if (val !== "*") {
        const key = `key${i + 1}`;
        filters.push(`${key} = $${key}`);
        params[key] = val;
      }
    });

    const whereClause =
      filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";

    const sql = `
      SELECT * FROM ${this.namespace}
      ${whereClause}
      ORDER BY ${sortBy} ${direction}
      LIMIT ${limit} START ${offset}
    `;

    const [results] = await surrealDb.query(sql, params);

    return (results as any[]).map((row: any, i: number) =>
      raw
        ? { ...row, rank: offset + i + 1 }
        : { ...row.value, rank: offset + i + 1 }
    );
  }

  query() {
    return new QueryBuilder<z.infer<T>>(this.namespace, (row) =>
      this.schema.parse(row.value)
    );
  }
}

class QueryBuilder<T> {
  private filters: string[] = [];
  private params: Record<string, any> = {};
  private _limit: number = 30;
  private _offset: number = 0;
  private _sortBy?: string;
  private _sortDir: "asc" | "desc" = "desc";

  constructor(private namespace: string, private parse: (row: any) => T) {}

  where(
    field: string,
    operator: "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE",
    value: any
  ) {
    const key = `param_${this.filters.length}`;
    this.filters.push(`${field} ${operator} $${key}`);
    this.params[key] = value;
    return this;
  }

  sortBy(field: string, dir: "asc" | "desc" = "desc") {
    this._sortBy = field;
    this._sortDir = dir;
    return this;
  }

  limit(n: number) {
    this._limit = n;
    return this;
  }

  offset(n: number) {
    this._offset = n;
    return this;
  }

  async exec(): Promise<T[]> {
    const where = this.filters.length
      ? `WHERE ${this.filters.join(" AND ")}`
      : "";
    const sort = this._sortBy
      ? `ORDER BY ${this._sortBy} ${this._sortDir}`
      : "";
    const sql = `SELECT * FROM ${this.namespace} ${where} ${sort} LIMIT ${this._limit} START ${this._offset}`;
    const [result] = await surrealDb.query(sql, this.params);
    return (result as any[]).map((r: any) => this.parse(r));
  }
}

const DEV_DB_DIR = path.resolve(process.cwd(), "dev_db");
async function writeDevJson(recordId: RecordId, data: any) {
  if (!isDev) return;
  await fs.mkdir(DEV_DB_DIR, { recursive: true });
  const file = path.join(DEV_DB_DIR, `${recordId.tb}_${recordId.id}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}
async function deleteDevJson(recordId: RecordId) {
  if (!isDev) return;
  const file = path.join(DEV_DB_DIR, `${recordId.tb}_${recordId.id}.json`);
  try {
    await fs.unlink(file);
  } catch {}
}
