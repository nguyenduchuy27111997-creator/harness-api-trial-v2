import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, isNull } from "drizzle-orm";
import type { MiddlewareHandler } from "hono";
import { db } from "../db/client.js";
import { tokens, users } from "../db/schema.js";
import { apiError } from "./errors.js";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;

export type User = { id: string; email: string; created_at: string };

const toUser = (u: { id: string; email: string; createdAt: Date }): User => ({
  id: u.id,
  email: u.email,
  created_at: u.createdAt.toISOString(),
});

// scrypt, 64-byte key, 16-byte random salt; both stored as hex.
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return { hash: key.toString("hex"), salt: salt.toString("hex") };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

// The plain token is returned once; only its SHA-256 is stored.
async function issueToken(userId: string, tx: Pick<typeof db, "insert"> = db) {
  const token = randomBytes(32).toString("base64url");
  await tx.insert(tokens).values({ userId, tokenHash: hashToken(token) });
  return token;
}

// Email is expected already trimmed and lowercased. Returns null when it is taken.
// User and token are inserted in one transaction, so a failed token insert leaves no user.
export async function signUp(email: string, password: string) {
  const { hash, salt } = await hashPassword(password);
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(users)
      .values({ email, passwordHash: hash, passwordSalt: salt })
      .onConflictDoNothing({ target: users.email })
      .returning();
    if (!row) return null;
    return { user: toUser(row), token: await issueToken(row.id, tx) };
  });
}

// Stored for unknown emails so the check costs the same scrypt work.
const dummy = hashPassword("dummy-password").then(({ hash, salt }) => ({ passwordHash: hash, passwordSalt: salt }));

// Email is expected already trimmed and lowercased. Returns null on any bad credential.
export async function signIn(email: string, password: string) {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const stored = row ?? (await dummy);
  const key = await scryptAsync(password, Buffer.from(stored.passwordSalt, "hex"), 64);
  const ok = timingSafeEqual(key, Buffer.from(stored.passwordHash, "hex"));
  if (!row || !ok) return null;
  return { user: toUser(row), token: await issueToken(row.id) };
}

// Route middleware for protected routes: valid, unrevoked bearer token → sets userId and tokenId.
export const requireAuth: MiddlewareHandler<{ Variables: { userId: string; tokenId: string } }> = async (c, next) => {
  const m = /^Bearer (\S+)$/i.exec(c.req.header("authorization") ?? "");
  const [row] = m
    ? await db
        .select({ id: tokens.id, userId: tokens.userId })
        .from(tokens)
        .where(and(eq(tokens.tokenHash, hashToken(m[1]!)), isNull(tokens.revokedAt)))
    : [];
  if (!row) return apiError(c, 401, "unauthorized", "Missing or invalid bearer token");
  c.set("userId", row.userId);
  c.set("tokenId", row.id);
  await next();
};

export async function getUser(userId: string) {
  const [row] = await db.select().from(users).where(eq(users.id, userId));
  return row ? toUser(row) : null;
}

// Revokes one token, scoped to its owner. Other tokens of the user stay valid.
export async function revokeToken(userId: string, tokenId: string) {
  await db
    .update(tokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(tokens.id, tokenId), eq(tokens.userId, userId), isNull(tokens.revokedAt)));
}
