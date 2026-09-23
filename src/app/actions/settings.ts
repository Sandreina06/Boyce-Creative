"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canAccessClient } from "@/server/auth/access";
import { requireUser, type SessionUser } from "@/server/auth/session";
import { db, schema } from "@/server/db";
import { KPI_OPTIONS } from "@/server/analytics/metrics";
import { isAttributionWindow, isConversionField, isValueField } from "@/server/windsor/fields";

export type ActionState = { ok?: string; error?: string };

async function authorize(clientId: string, opts: { admin?: boolean } = {}): Promise<SessionUser> {
  const user = await requireUser();
  if (!(await canAccessClient(user, clientId))) throw new Error("Not authorised");
  if (user.role === "viewer") throw new Error("Viewers cannot change settings");
  if (opts.admin && user.role !== "admin") throw new Error("Only admins can change account mappings");
  return user;
}

const kpiIds = KPI_OPTIONS.map((k) => k.id) as [string, ...string[]];

const SettingsSchema = z.object({
  clientId: z.string().uuid(),
  businessType: z.enum(["lead_gen", "ecommerce", "appointment", "custom"]),
  primaryConversionField: z.string().refine(isConversionField, "Unknown conversion field"),
  primaryConversionLabel: z.string().trim().min(1).max(40),
  primaryValueField: z
    .string()
    .transform((v) => v || null)
    .refine((v) => v == null || isValueField(v), "Unknown value field"),
  primaryKpi: z.enum(kpiIds),
  secondaryKpis: z.array(z.enum(kpiIds)).max(6),
  attributionWindow: z.string().refine(isAttributionWindow, "Unknown attribution window"),
  currency: z.string().regex(/^[A-Z]{3}$/),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
});

export async function saveClientSettings(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = SettingsSchema.safeParse({
    clientId: fd.get("clientId"),
    businessType: fd.get("businessType"),
    primaryConversionField: fd.get("primaryConversionField"),
    primaryConversionLabel: fd.get("primaryConversionLabel"),
    primaryValueField: fd.get("primaryValueField") ?? "",
    primaryKpi: fd.get("primaryKpi"),
    secondaryKpis: fd.getAll("secondaryKpis"),
    attributionWindow: fd.get("attributionWindow"),
    currency: fd.get("currency"),
    timezone: fd.get("timezone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  const { clientId, ...values } = parsed.data;
  try {
    await authorize(clientId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await db()
    .update(schema.clientSettings)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(schema.clientSettings.clientId, clientId));
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: "Settings saved" };
}

const BudgetSchema = z.object({
  clientId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  amount: z.coerce.number().min(0).max(10_000_000),
  notes: z.string().max(500).optional(),
});

export async function saveBudget(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = BudgetSchema.safeParse({
    clientId: fd.get("clientId"),
    month: fd.get("month"),
    amount: fd.get("amount"),
    notes: fd.get("notes") || undefined,
  });
  if (!parsed.success) return { error: "Enter a month and a budget amount" };
  const { clientId, month, amount, notes } = parsed.data;
  try {
    await authorize(clientId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const monthDate = `${month}-01`;
  await db()
    .insert(schema.clientBudgets)
    .values({ clientId, month: monthDate, amount, notes })
    .onConflictDoUpdate({
      target: [schema.clientBudgets.clientId, schema.clientBudgets.month],
      set: { amount, notes, updatedAt: new Date() },
    });
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: `Budget for ${month} saved` };
}

const TargetSchema = z.object({
  clientId: z.string().uuid(),
  metric: z.enum(kpiIds),
  targetValue: z.coerce.number().positive(),
});

const HIGHER_BETTER = new Set(["ROAS", "CTR", "CVR"]);

export async function saveTarget(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = TargetSchema.safeParse({
    clientId: fd.get("clientId"),
    metric: fd.get("metric"),
    targetValue: fd.get("targetValue"),
  });
  if (!parsed.success) return { error: "Choose a metric and a positive target" };
  const { clientId, metric } = parsed.data;
  // Percent metrics are entered as percentages (1.5) and stored as fractions (0.015).
  const targetValue = metric === "CTR" || metric === "CVR" ? parsed.data.targetValue / 100 : parsed.data.targetValue;
  try {
    await authorize(clientId);
  } catch (e) {
    return { error: (e as Error).message };
  }
  const direction = HIGHER_BETTER.has(metric) ? "higher_better" : "lower_better";
  await db()
    .insert(schema.clientTargets)
    .values({ clientId, metric, targetValue, direction })
    .onConflictDoUpdate({
      target: [schema.clientTargets.clientId, schema.clientTargets.metric],
      set: { targetValue, direction, updatedAt: new Date() },
    });
  revalidatePath(`/clients/${clientId}`, "layout");
  return { ok: `${metric} target saved` };
}

export async function deleteTarget(clientId: string, targetId: string): Promise<void> {
  await authorize(clientId);
  await db()
    .delete(schema.clientTargets)
    .where(and(eq(schema.clientTargets.id, targetId), eq(schema.clientTargets.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
}

const MappingSchema = z.object({
  clientId: z.string().uuid(),
  metaAccountId: z
    .string()
    .trim()
    .transform((v) => v.replace(/^act_/, ""))
    .pipe(z.string().regex(/^\d{5,20}$/, "Meta account id must be numeric")),
  displayName: z.string().trim().min(1).max(120),
});

export async function addAccountMapping(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = MappingSchema.safeParse({
    clientId: fd.get("clientId"),
    metaAccountId: fd.get("metaAccountId"),
    displayName: fd.get("displayName"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid mapping" };
  try {
    await authorize(parsed.data.clientId, { admin: true });
  } catch (e) {
    return { error: (e as Error).message };
  }
  try {
    await db().insert(schema.metaAccountMappings).values({ ...parsed.data, windsorConnector: "facebook" });
  } catch {
    return { error: "That ad account is already mapped to a client" };
  }
  revalidatePath(`/clients/${parsed.data.clientId}`, "layout");
  return { ok: "Ad account mapped" };
}

export async function setMappingActive(clientId: string, mappingId: string, isActive: boolean): Promise<void> {
  await authorize(clientId, { admin: true });
  await db()
    .update(schema.metaAccountMappings)
    .set({ isActive })
    .where(and(eq(schema.metaAccountMappings.id, mappingId), eq(schema.metaAccountMappings.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`, "layout");
}
