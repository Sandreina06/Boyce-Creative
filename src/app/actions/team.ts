"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/server/auth/access";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { db, schema } from "@/server/db";

export type TeamState = { ok?: string; error?: string };

const Role = z.enum(["admin", "manager", "viewer"]);

const AddUserSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
  role: Role,
  clientIds: z.array(z.string().uuid()),
});

async function setClientAccess(userId: string, clientIds: string[]) {
  await db().delete(schema.userClientAccess).where(eq(schema.userClientAccess.userId, userId));
  if (!clientIds.length) return;
  // Only grant clients that actually exist.
  const valid = await db().select({ id: schema.clients.id }).from(schema.clients).where(inArray(schema.clients.id, clientIds));
  if (valid.length) {
    await db().insert(schema.userClientAccess).values(valid.map((c) => ({ userId, clientId: c.id })));
  }
}

export async function addUser(_prev: TeamState, fd: FormData): Promise<TeamState> {
  await requireAdmin();
  const parsed = AddUserSchema.safeParse({
    name: fd.get("name"),
    email: fd.get("email"),
    password: fd.get("password"),
    role: fd.get("role"),
    clientIds: fd.getAll("clientIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  const { name, email, password, role, clientIds } = parsed.data;
  if (role !== "admin" && !clientIds.length) return { error: "Choose at least one client this person can see" };

  const [existing] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (existing) return { error: "Someone with that email already has a login" };

  const [user] = await db()
    .insert(schema.users)
    .values({ name, email, role, passwordHash: await hashPassword(password) })
    .returning({ id: schema.users.id });
  if (role !== "admin") await setClientAccess(user.id, clientIds);
  revalidatePath("/team");
  return { ok: `${name} can now sign in with ${email}` };
}

const UpdateAccessSchema = z.object({
  userId: z.string().uuid(),
  role: Role,
  clientIds: z.array(z.string().uuid()),
});

export async function updateUserAccess(_prev: TeamState, fd: FormData): Promise<TeamState> {
  const admin = await requireAdmin();
  const parsed = UpdateAccessSchema.safeParse({
    userId: fd.get("userId"),
    role: fd.get("role"),
    clientIds: fd.getAll("clientIds"),
  });
  if (!parsed.success) return { error: "Invalid details" };
  const { userId, role, clientIds } = parsed.data;
  if (userId === admin.id && role !== "admin") return { error: "You can't remove your own admin role" };
  if (role !== "admin" && !clientIds.length) return { error: "Choose at least one client" };

  await db().update(schema.users).set({ role }).where(eq(schema.users.id, userId));
  await setClientAccess(userId, role === "admin" ? [] : clientIds);
  revalidatePath("/team");
  return { ok: "Access updated" };
}

const ResetSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`),
});

export async function resetPassword(_prev: TeamState, fd: FormData): Promise<TeamState> {
  await requireAdmin();
  const parsed = ResetSchema.safeParse({ userId: fd.get("userId"), password: fd.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };
  await db()
    .update(schema.users)
    .set({ passwordHash: await hashPassword(parsed.data.password) })
    .where(eq(schema.users.id, parsed.data.userId));
  // Sign them out everywhere so the old password stops working immediately.
  await db().delete(schema.sessions).where(eq(schema.sessions.userId, parsed.data.userId));
  return { ok: "Password changed" };
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const admin = await requireAdmin();
  if (userId === admin.id) return; // never lock yourself out
  await db().update(schema.users).set({ isActive }).where(eq(schema.users.id, userId));
  if (!isActive) await db().delete(schema.sessions).where(eq(schema.sessions.userId, userId));
  revalidatePath("/team");
}
