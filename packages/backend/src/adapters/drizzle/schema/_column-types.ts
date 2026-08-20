import type { PgColumn, PgTableWithColumns } from "drizzle-orm/pg-core";

/**
 * Reusable PgColumn annotation aliases: bare `export const x = pgTable(...)`
 * fails isolatedDeclarations (TS9010 — compile-verified), so every exported
 * table is annotated with PosTable<> built from these one-line column aliases.
 * Query/insert inference through drizzle survives intact (verified).
 */
type Base<
  TTable extends string,
  TName extends string,
  TType extends string,
  TData,
  TNotNull extends boolean,
  THasDefault extends boolean,
  TPk extends boolean = false,
> = PgColumn<{
  name: TName;
  tableName: TTable;
  dataType: TData extends Date
    ? "date"
    : TData extends number
      ? "number"
      : TData extends boolean
        ? "boolean"
        : "string";
  columnType: TType;
  data: TData;
  driverParam: TData extends number ? number | string : string;
  notNull: TNotNull;
  hasDefault: THasDefault;
  isPrimaryKey: TPk;
  isAutoincrement: false;
  hasRuntimeDefault: false;
  enumValues: TType extends "PgText" ? [string, ...string[]] : undefined;
  baseColumn: never;
  identity: undefined;
  generated: undefined;
}>;

export type UuidPk<T extends string> = Base<T, "id", "PgUUID", string, true, true, true>;
export type BranchRef<T extends string> = Base<T, "branch_id", "PgUUID", string, true, false>;
export type UuidCol<T extends string, N extends string> = Base<T, N, "PgUUID", string, true, false>;
export type TextCol<T extends string, N extends string> = Base<T, N, "PgText", string, true, false>;
export type TextColD<T extends string, N extends string> = Base<T, N, "PgText", string, true, true>;
export type NullTextCol<T extends string, N extends string> = Base<
  T,
  N,
  "PgText",
  string,
  false,
  false
>;
/** numeric arrives as string — never float. */
export type MoneyCol<T extends string, N extends string> = Base<
  T,
  N,
  "PgNumeric",
  string,
  true,
  true
>;
export type BoolColD<T extends string, N extends string> = Base<
  T,
  N,
  "PgBoolean",
  boolean,
  true,
  true
>;
export type IntCol<T extends string, N extends string> = Base<
  T,
  N,
  "PgInteger",
  number,
  true,
  false
>;
export type BigIntNumCol<T extends string, N extends string> = Base<
  T,
  N,
  "PgBigInt53",
  number,
  true,
  false
>;
export type TsCol<T extends string, N extends string> = Base<
  T,
  N,
  "PgTimestamp",
  Date,
  true,
  false
>;
export type TsColD<T extends string, N extends string> = Base<
  T,
  N,
  "PgTimestamp",
  Date,
  true,
  true
>;
export type NullTsCol<T extends string, N extends string> = Base<
  T,
  N,
  "PgTimestamp",
  Date,
  false,
  false
>;
export type CreatedAt<T extends string> = Base<T, "created_at", "PgTimestamp", Date, true, true>;

export type PosTable<
  TName extends string,
  TCols extends Record<string, PgColumn>,
> = PgTableWithColumns<{
  name: TName;
  schema: undefined;
  columns: TCols;
  dialect: "pg";
}>;
