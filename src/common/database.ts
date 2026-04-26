import type { z } from "zod";
import fs from "fs/promises";
import path from "path";
import {
  RecordId,
  Surreal,
  SurrealTransaction,
  createRemoteEngines,
} from "surrealdb";
import { createNodeEngines } from "@surrealdb/node";
import WebSocket from "ws";

const surrealDb = new Surreal({
  engines: {
    ...createRemoteEngines(),
    ...createNodeEngines(),
  },
  //@ts-ignore
  websocketImpl: WebSocket,
});

async function connectSurrealDB({
  url,
  namespace,
  database,
  username = "root",
  password = "root",
}: {
  url: string;
  namespace: string;
  database: string;
  username: string;
  password: string;
}) {
  console.log("[Surreal] connecting " + url);

  await surrealDb.connect(url, {
    namespace: namespace,
    database: database,
  });
  console.log("[Surreal] connected");
  await surrealDb.signin({
    username: username,
    password: password,
  });
  console.log("[Surreal] authenticated");
  await surrealDb.ready;
  console.log("[Surreal] ready");
  return surrealDb;
}

await connectSurrealDB({
  namespace: "scrambl",
  database: "prod",
  username: "root",
  password: "root",
  url: process.env.SURREAL_URI ?? "ws://192.168.0.7:8000/rpc",
});

export function getSurrealDB() {
  if (!surrealDb.isConnected) {
    throw new Error("Database is not connected");
  }
  return surrealDb;
}

export type Awaitable<T> = Promise<T> | T;

export type TallyTransaction = SurrealTransaction & {
  onCommit: (callback: () => Awaitable<void>) => void;
};

const singletonKey = "__singleton__";

export class DBSingleton<T extends z.ZodTypeAny, D = z.infer<T> | null> {
  protected name: string;
  protected schema: T;
  defaultV: D extends null ? D : z.infer<T>;

  constructor(options: {
    name: string;
    schema: T;
    defaultV: D extends null ? D : z.infer<T>;
  }) {
    this.name = options.name;
    this.schema = options.schema;
    this.defaultV = options.defaultV;
  }

  async get(
    transaction?: SurrealTransaction,
  ): Promise<D extends null ? z.infer<T> | null : z.infer<T>> {
    if (transaction) {
      const res = await transaction.select<{ value: z.infer<T> }>(
        new RecordId(singletonKey, this.name),
      );
      if (!res || !res.value) return this.defaultV as any;
      return this.schema.parse(res.value);
    }

    const res = await getSurrealDB().select<{ value: z.infer<T> }>(
      new RecordId(singletonKey, this.name),
    );
    if (!res || !res.value) return this.defaultV as any;
    return this.schema.parse(res.value);
  }

  async set(data: z.infer<T>, transaction?: SurrealTransaction) {
    if (transaction) {
      await transaction
        .upsert(new RecordId(singletonKey, this.name))
        .content({ value: data });
      return;
    }

    await getSurrealDB()
      .upsert(new RecordId(singletonKey, this.name))
      .content({ value: data });
  }

  async delete(transaction?: SurrealTransaction) {
    if (transaction) {
      await transaction.delete(new RecordId(singletonKey, this.name));
      return;
    }
    await getSurrealDB().delete(new RecordId(singletonKey, this.name));
  }
}

export class DBMap<T extends z.ZodTypeAny, D = z.infer<T> | null> {
  protected name: string;
  protected schema: T;
  defaultV: D extends null ? D : z.infer<T>;

  private constructor(
    name: string,
    schema: T,
    defaultV: D extends null ? D : z.infer<T>,
  ) {
    this.name = name;
    this.schema = schema;
    this.defaultV = defaultV;
  }

  static async create<T extends z.ZodTypeAny, D = z.infer<T> | null>(options: {
    name: string;
    schema: T;
    defaultV: D extends null ? D : z.infer<T>;
  }): Promise<DBMap<T, D>> {
    const instance = new this(options.name, options.schema, options.defaultV);
    await getSurrealDB().query(
      `DEFINE TABLE IF NOT EXISTS ${instance.name} SCHEMALESS;`,
    );
    return instance;
  }

  async get(
    key: string,
    transaction?: TallyTransaction,
  ): Promise<D extends null ? z.infer<T> | null : z.infer<T>> {
    if (transaction) {
      const res = await transaction.select<{ value: z.infer<T> }>(
        new RecordId(this.name, key),
      );
      if (!res || !res.value) return this.defaultV as any;
      return this.schema.parse(res.value);
    }
    const res = await getSurrealDB().select<{ value: z.infer<T> }>(
      new RecordId(this.name, key),
    );
    if (!res || !res.value) return this.defaultV as any;
    return this.schema.parse(res.value);
  }

  async set(key: string, data: z.infer<T>, transaction?: TallyTransaction) {
    if (transaction) {
      await transaction
        .upsert(new RecordId(this.name, key))
        .content({ value: data });
      return;
    }
    await getSurrealDB()
      .upsert(new RecordId(this.name, key))
      .content({ value: data });
  }

  async delete(key: string, transaction?: TallyTransaction) {
    if (transaction) {
      await transaction.delete(new RecordId(this.name, key));
      return;
    }
    await getSurrealDB().delete(new RecordId(this.name, key));
  }
  async allKeys(transaction?: TallyTransaction): Promise<string[]> {
    if (transaction) {
      const sql = `SELECT id FROM ${this.name}`;
      const rows = await transaction.query(sql);
      return (rows[0] as { id: RecordId }[]).map(({ id }) => {
        return id.id.toString();
      });
    }
    const sql = `SELECT id FROM ${this.name}`;
    const rows = await getSurrealDB().query(sql);
    return (rows[0] as { id: RecordId }[]).map(({ id }) => {
      return id.id.toString();
    });
  }
}

type FixedLengthTuple<
  N extends number,
  T = string,
  R extends unknown[] = [],
> = R["length"] extends N ? R : FixedLengthTuple<N, T, [...R, T]>;

export class DBNestedMapX<
  N extends number,
  T extends z.ZodTypeAny,
  D = z.infer<T> | null,
> {
  defaultV: D extends null ? D : z.infer<T>;

  private constructor(
    public namespace: string,
    public schema: T,
    defaultV: D extends null ? D : z.infer<T>,
    private depth: N,
  ) {
    void depth;
    this.defaultV = defaultV;
  }

  static async create<
    N extends number,
    T extends z.ZodTypeAny,
    D = z.infer<T> | null,
  >(options: {
    namespace: string;
    schema: T;
    defaultV: D extends null ? D : z.infer<T>;
    depth: N;
  }): Promise<DBNestedMapX<N, T, D>> {
    const instance = new DBNestedMapX(
      options.namespace,
      options.schema,
      options.defaultV,
      options.depth,
    );
    await instance.ensureIndexes();
    return instance;
  }

  private async ensureIndexes() {
    const indexName = `idx_${this.namespace}_keys`;

    const keyFields = Array.from(
      { length: this.depth - 1 },
      (_, i) => `key${i + 1}`,
    );

    if (keyFields.length === 0) {
      return;
    }

    const defineSql = `DEFINE INDEX ${indexName} ON ${
      this.namespace
    } FIELDS ${keyFields.join(", ")}`;

    try {
      await getSurrealDB().query(defineSql);
    } catch (e) {
      if (
        (e instanceof Error ? e.message : String(e)) !==
        `The index '${indexName}' already exists`
      )
        console.warn(
          `[DBNestedMapX] Failed to define index:`,
          e instanceof Error ? e.message : String(e),
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

  async get(
    keys: FixedLengthTuple<N>,
    transaction?: TallyTransaction,
  ): Promise<D extends null ? z.infer<T> | null : z.infer<T>> {
    if (!transaction) {
    }
    const rec = await (transaction ?? getSurrealDB()).select<{
      value: z.infer<T>;
    }>(this.makeId(keys));
    if (!rec) return this.defaultV;
    return this.schema.parse(rec.value);
  }

  async set(
    keys: FixedLengthTuple<N>,
    data: z.infer<T>,
    transaction?: TallyTransaction,
  ) {
    await this.schema.parseAsync(data);
    const meta = this.buildMetaKeys(keys);
    const recordId = this.makeId(keys);
    await (transaction ?? getSurrealDB()).upsert(recordId).content({
      value: data,
      ...meta,
    });
  }

  async delete(keys: FixedLengthTuple<N>, transaction?: TallyTransaction) {
    if (transaction) {
    } else {
    }

    const recordId = this.makeId(keys);
    await (transaction ?? getSurrealDB()).delete(recordId);
  }

  async find(
    keys: FixedLengthTuple<N> & string[],
    { raw, transaction }: { raw: true; transaction?: TallyTransaction },
  ): Promise<{ value: z.infer<T>; [keyString: `key${number}`]: string }[]>;
  async find(
    keys: FixedLengthTuple<N> & string[],
    { raw, transaction }: { raw: false; transaction?: TallyTransaction },
  ): Promise<z.infer<T>[]>;
  async find(
    keys: FixedLengthTuple<N> & string[],
    { raw, transaction }: { raw?: boolean; transaction?: TallyTransaction },
  ): Promise<
    z.infer<T>[] | { value: z.infer<T>; [keyString: `key${number}`]: string }[]
  >;
  async find(keys: FixedLengthTuple<N> & string[]): Promise<z.infer<T>[]>;
  async find(
    keys: FixedLengthTuple<N> & string[],
    options:
      | { raw?: boolean; transaction?: TallyTransaction }
      | undefined = undefined,
  ): Promise<any[]> {
    const { raw = false, transaction } = options || {};
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

    const rows = await (transaction ?? getSurrealDB()).query(sql, params);
    return (rows[0] as any[]).map((r: any) => (raw ? r : r.value));
  }

  async findSortedPaginated({
    keys,
    sortBy,
    direction,
    limit,
    offset,
    raw,
    transaction,
  }: {
    keys: FixedLengthTuple<N> & string[];
    sortBy: `value.${string}`;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
    raw: true;
    transaction?: TallyTransaction;
  }): Promise<
    { value: z.infer<T>; [keyString: `key${number}`]: string; rank: number }[]
  >;
  async findSortedPaginated({
    keys,
    sortBy,
    direction,
    limit,
    offset,
    raw,
    transaction,
  }: {
    keys: FixedLengthTuple<N> & string[];
    sortBy: `value.${string}`;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
    raw: false;
    transaction?: TallyTransaction;
  }): Promise<(z.infer<T> & { rank: number })[]>;
  async findSortedPaginated({
    keys,
    sortBy,
    direction,
    limit,
    offset,
    raw,
    transaction,
  }: {
    keys: FixedLengthTuple<N> & string[];
    sortBy: `value.${string}`;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
    raw?: undefined;
    transaction?: TallyTransaction;
  }): Promise<(z.infer<T> & { rank: number })[]>;
  async findSortedPaginated({
    keys,
    sortBy,
    direction = "desc",
    limit = 30,
    offset = 0,
    raw = false,
    transaction,
  }: {
    keys: FixedLengthTuple<N> & string[];
    sortBy: `value.${string}`;
    direction?: "asc" | "desc";
    limit?: number;
    offset?: number;
    raw?: boolean;
    transaction?: TallyTransaction;
  }): Promise<
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

    const [results] = await (transaction ?? getSurrealDB()).query(sql, params);

    return (results as any[]).map((row: any, i: number) =>
      raw
        ? { ...row, rank: offset + i + 1 }
        : { ...row.value, rank: offset + i + 1 },
    );
  }

  query() {
    return new QueryBuilder<z.infer<T>>(this.namespace, (row) =>
      this.schema.parse(row.value),
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

  constructor(
    private namespace: string,
    private parse: (row: any) => T,
  ) {}

  where(
    field: string,
    operator: "=" | "!=" | "<" | "<=" | ">" | ">=" | "LIKE",
    value: any,
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
