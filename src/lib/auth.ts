import { createHash, randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import { db } from "../db/client.js";
import { tokens, users } from "../db/schema.js";

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
async function issueToken(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(tokens).values({ userId, tokenHash: hashToken(token) });
  return token;
}

// Email is expected already trimmed and lowercased. Returns null when it is taken.
export async function signUp(email: string, password: string) {
  const { hash, salt } = await hashPassword(password);
  const [row] = await db
    .insert(users)
    .values({ email, passwordHash: hash, passwordSalt: salt })
    .onConflictDoNothing({ target: users.email })
    .returning();
  if (!row) return null;
  return { user: toUser(row), token: await issueToken(row.id) };
}
