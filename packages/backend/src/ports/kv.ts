/** Minimal Redis-protocol surface implemented by the ioredis and upstash adapters.
 *  Shapes match better-auth 1.7's SecondaryStorage requirements (5 methods, verified). */
export interface KvPort {
  readonly get: (key: string) => Promise<string | null>;
  readonly set: (key: string, value: string, ttlSeconds?: number) => Promise<void>;
  readonly delete: (key: string) => Promise<void>;
  /** Redis GETDEL. */
  readonly getAndDelete: (key: string) => Promise<string | null>;
  /** Atomic INCR; TTL applies only on key creation (fixed window).
   *  ioredis: single Lua (INCR; if 1 then EXPIRE). upstash: incr + expire(key, ttl, "NX"). */
  readonly incrementWithTtl: (key: string, ttlSeconds: number) => Promise<number>;
}
