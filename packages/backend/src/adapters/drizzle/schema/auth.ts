/**
 * better-auth 1.7.1 tables — based on `npx auth@1.7.1 generate` output with the
 * organization->branch remap and uuid PKs (advanced.database.generateId: "uuid"),
 * then (a) annotated for isolatedDeclarations (bare pgTable exports are TS9010),
 * (b) `$onUpdate` removed — better-auth writes updatedAt itself, and
 * (c) `relations()` exports dropped (unused by the adapter).
 * drizzle-kit owns ALL SQL from here; CI diff-checks regeneration on upgrades.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type {
  BigIntNumCol,
  BoolColD,
  IntCol,
  NullTextCol,
  PosTable,
  TextCol,
  TextColD,
  TsCol,
  TsColD,
  UuidCol,
  UuidPk,
} from "./_column-types.js";

const uuidPk = (): ReturnType<typeof uuid> => uuid("id").default(sql`pg_catalog.gen_random_uuid()`);

export const user: PosTable<
  "user",
  {
    id: UuidPk<"user">;
    name: TextCol<"user", "name">;
    email: TextCol<"user", "email">;
    emailVerified: BoolColD<"user", "email_verified">;
    image: NullTextCol<"user", "image">;
    createdAt: TsColD<"user", "created_at">;
    updatedAt: TsColD<"user", "updated_at">;
  }
> = pgTable("user", {
  id: uuidPk().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const session: PosTable<
  "session",
  {
    id: UuidPk<"session">;
    expiresAt: TsCol<"session", "expires_at">;
    token: TextCol<"session", "token">;
    createdAt: TsColD<"session", "created_at">;
    updatedAt: TsColD<"session", "updated_at">;
    ipAddress: NullTextCol<"session", "ip_address">;
    userAgent: NullTextCol<"session", "user_agent">;
    userId: UuidCol<"session", "user_id">;
    activeOrganizationId: NullTextCol<"session", "active_organization_id">;
  }
> = pgTable(
  "session",
  {
    id: uuidPk().primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account: PosTable<
  "account",
  {
    id: UuidPk<"account">;
    accountId: TextCol<"account", "account_id">;
    providerId: TextCol<"account", "provider_id">;
    userId: UuidCol<"account", "user_id">;
    accessToken: NullTextCol<"account", "access_token">;
    refreshToken: NullTextCol<"account", "refresh_token">;
    idToken: NullTextCol<"account", "id_token">;
    accessTokenExpiresAt: NullTsCol<"account", "access_token_expires_at">;
    refreshTokenExpiresAt: NullTsCol<"account", "refresh_token_expires_at">;
    scope: NullTextCol<"account", "scope">;
    password: NullTextCol<"account", "password">;
    createdAt: TsColD<"account", "created_at">;
    updatedAt: TsColD<"account", "updated_at">;
  }
> = pgTable(
  "account",
  {
    id: uuidPk().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("account_providerId_accountId_uidx").on(table.providerId, table.accountId),
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification: PosTable<
  "verification",
  {
    id: UuidPk<"verification">;
    identifier: TextCol<"verification", "identifier">;
    value: TextCol<"verification", "value">;
    expiresAt: TsCol<"verification", "expires_at">;
    createdAt: TsColD<"verification", "created_at">;
    updatedAt: TsColD<"verification", "updated_at">;
  }
> = pgTable(
  "verification",
  {
    id: uuidPk().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const branch: PosTable<
  "branch",
  {
    id: UuidPk<"branch">;
    name: TextCol<"branch", "name">;
    slug: TextCol<"branch", "slug">;
    logo: NullTextCol<"branch", "logo">;
    createdAt: TsCol<"branch", "created_at">;
    metadata: NullTextCol<"branch", "metadata">;
  }
> = pgTable("branch", {
  id: uuidPk().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
});

export const branchMember: PosTable<
  "branch_member",
  {
    id: UuidPk<"branch_member">;
    branchId: UuidCol<"branch_member", "branch_id">;
    userId: UuidCol<"branch_member", "user_id">;
    role: TextColD<"branch_member", "role">;
    createdAt: TsCol<"branch_member", "created_at">;
  }
> = pgTable(
  "branch_member",
  {
    id: uuidPk().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("branchMember_branchId_idx").on(table.branchId),
    index("branchMember_userId_idx").on(table.userId),
  ],
);

export const branchInvitation: PosTable<
  "branch_invitation",
  {
    id: UuidPk<"branch_invitation">;
    branchId: UuidCol<"branch_invitation", "branch_id">;
    email: TextCol<"branch_invitation", "email">;
    role: NullTextCol<"branch_invitation", "role">;
    status: TextColD<"branch_invitation", "status">;
    expiresAt: TsCol<"branch_invitation", "expires_at">;
    createdAt: TsColD<"branch_invitation", "created_at">;
    inviterId: UuidCol<"branch_invitation", "inviter_id">;
  }
> = pgTable(
  "branch_invitation",
  {
    id: uuidPk().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("branchInvitation_branchId_idx").on(table.branchId),
    index("branchInvitation_email_idx").on(table.email),
  ],
);

export const rateLimit: PosTable<
  "rate_limit",
  {
    id: UuidPk<"rate_limit">;
    key: TextCol<"rate_limit", "key">;
    count: IntCol<"rate_limit", "count">;
    lastRequest: BigIntNumCol<"rate_limit", "last_request">;
  }
> = pgTable("rate_limit", {
  id: uuidPk().primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
