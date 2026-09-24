import { createHash } from "node:crypto";

/**
 * Parse Meta's ad account activity log (as returned by Windsor's Activities
 * fields) into changelog entries.
 *
 * Meta's activity log uses legacy object names:
 *   ADGROUP        → ad
 *   CAMPAIGN       → ad set (and, for audience events, the custom audience)
 *   CAMPAIGN_GROUP → campaign
 * and inside ad events `extra_data.campaign_id` is the ad set id.
 * Verified against real Edwards Roofing activity data (2026-09-23).
 */

export type ChangeCategory =
  | "budget"
  | "bid_strategy"
  | "budget_allocation"
  | "campaign_structure"
  | "audience"
  | "targeting"
  | "placement"
  | "creative"
  | "copy"
  | "optimization_event"
  | "tracking"
  | "conversion"
  | "campaign_status"
  | "ad_set_status"
  | "ad_status"
  | "other";

export type EntityKind = "account" | "campaign" | "adset" | "ad" | "audience" | "other";

export type RawActivity = {
  activity_event_time?: unknown;
  activity_actor_name?: unknown;
  activity_event_type?: unknown;
  activity_translated_event_type?: unknown;
  activity_object_type?: unknown;
  activity_object_id?: unknown;
  activity_object_name?: unknown;
  activity_extra_data?: unknown;
};

export type ParsedChange = {
  ref: string;
  accountId: string;
  changedAt: Date;
  actorName: string | null;
  isSystem: boolean;
  /** Noise such as billing, image-library uploads, delivery notices and review cycles. */
  isNoise: boolean;
  eventType: string;
  action: string;
  category: ChangeCategory;
  entityType: EntityKind;
  entityId: string | null;
  entityName: string | null;
  /** For ads: the parent ad set id (from extra_data.campaign_id). */
  parentAdsetId: string | null;
  previousValue: string | null;
  newValue: string | null;
};

const SYSTEM_ACTORS = new Set(["meta", "facebook", ""]);

/** Events that never represent an optimization decision. */
const NOISE_EVENTS = new Set([
  "ad_account_billing_charge",
  "add_images",
  "edit_images",
  "first_delivery_event",
  "ad_account_add_user_to_role",
  "ad_account_remove_user_from_role",
  "update_ad_run_status_to_be_set_after_review",
]);

/** Intermediate states Meta cycles through after every edit; not a decision. */
const TRANSIENT_STATUS = /pending|review|process/i;

export function entityKind(objectType: string | null, eventType: string): EntityKind {
  const t = (objectType ?? "").toUpperCase();
  if (/audience/.test(eventType)) return "audience";
  if (t === "ADGROUP" || t === "AD") return "ad";
  if (t === "CAMPAIGN" || t === "ADSET" || t === "AD_SET") return "adset";
  if (t === "CAMPAIGN_GROUP") return "campaign";
  if (t === "ACCOUNT") return "account";
  return "other";
}

export function categorize(eventType: string, entity: EntityKind): ChangeCategory {
  const e = eventType.toLowerCase();
  if (e.includes("run_status") || e.includes("status")) {
    return entity === "ad" ? "ad_status" : entity === "adset" ? "ad_set_status" : "campaign_status";
  }
  if (e.includes("budget") || e.includes("spend_cap")) return "budget";
  if (e.includes("bid")) return "bid_strategy";
  if (e.includes("audience")) return "audience";
  if (e.includes("target")) return "targeting";
  if (e.includes("placement") || e.includes("publisher_platform")) return "placement";
  if (e.includes("optimization_goal") || e.includes("promoted_object") || e.includes("conversion_event")) return "optimization_event";
  if (e.includes("pixel") || e.includes("tracking") || e.includes("url_tags")) return "tracking";
  if (e.includes("creative") || e === "create_ad" || e.includes("image") || e.includes("video")) return "creative";
  if (e.startsWith("create_") || e.includes("delete") || e.includes("archive") || e.includes("duplicate")) return "campaign_structure";
  return "other";
}

function parseExtra(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw !== "string" || !raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Render an old/new value for humans. Budgets are minor units (cents). */
export function renderValue(v: unknown, eventType: string, currency = "USD"): string | null {
  if (v == null || v === "") return null;
  if (/budget|spend_cap|bid_amount/.test(eventType) && (typeof v === "number" || /^\d+$/.test(String(v)))) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v) / 100);
  }
  if (Array.isArray(v)) {
    if (v.some((x) => typeof x === "string" && /^https?:\/\//.test(x))) return "Creative asset";
    return truncate(v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", "));
  }
  if (typeof v === "object") return truncate(JSON.stringify(v));
  const s = String(v);
  if (/^https?:\/\//.test(s)) return "Creative asset";
  if (s.startsWith("{") || s.startsWith("[")) return truncate(s);
  return truncate(s);
}

const truncate = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function parseActivity(row: RawActivity, accountId: string, currency = "USD"): ParsedChange | null {
  const eventType = String(row.activity_event_type ?? "");
  const time = row.activity_event_time ? new Date(String(row.activity_event_time)) : null;
  if (!eventType || !time || Number.isNaN(time.getTime())) return null;

  const extra = parseExtra(row.activity_extra_data);
  const objectType = row.activity_object_type ? String(row.activity_object_type) : null;
  const entityType = entityKind(objectType, eventType);
  const actor = row.activity_actor_name ? String(row.activity_actor_name) : null;
  const isSystem = SYSTEM_ACTORS.has((actor ?? "").trim().toLowerCase());
  const oldV = renderValue(extra.old_value, eventType, currency);
  const newV = renderValue(extra.new_value, eventType, currency);

  // Status edits arrive as "Active → Pending Process" then "Pending Process → Inactive".
  // The decision is the final state; transitions INTO a transient state, and Meta
  // completing its review ("Pending Review → Active" by Meta), are not decisions.
  const isStatus = eventType.includes("run_status");
  const transient =
    isStatus && (TRANSIENT_STATUS.test(newV ?? "") || (isSystem && TRANSIENT_STATUS.test(oldV ?? "")));
  const isNoise = NOISE_EVENTS.has(eventType) || transient || (isSystem && entityType === "audience");

  const parentRaw = extra.campaign_id;
  const parentAdsetId =
    entityType === "ad" && parentRaw != null
      ? String(typeof parentRaw === "object" ? ((parentRaw as Record<string, unknown>).new ?? "") : parentRaw) || null
      : null;

  const ref = createHash("sha256")
    .update([accountId, String(row.activity_event_time), eventType, String(row.activity_object_id ?? ""), String(row.activity_extra_data ?? "")].join("|"))
    .digest("hex")
    .slice(0, 40);

  const creativeSwap = oldV === "Creative asset" && newV === "Creative asset";
  return {
    ref,
    accountId,
    changedAt: time,
    actorName: actor,
    isSystem,
    isNoise,
    eventType,
    action: creativeSwap ? "Ad creative replaced" : String(row.activity_translated_event_type ?? eventType.replace(/_/g, " ")),
    category: categorize(eventType, entityType),
    entityType,
    entityId: row.activity_object_id != null ? String(row.activity_object_id) : null,
    entityName: row.activity_object_name != null ? String(row.activity_object_name) : null,
    parentAdsetId,
    previousValue: creativeSwap ? null : isStatus ? statusLabel(oldV) : oldV,
    newValue: creativeSwap ? null : isStatus ? statusLabel(newV) : newV,
  };
}

const statusLabel = (v: string | null) => (v == null ? null : /^inactive$/i.test(v) ? "Paused" : v);

/**
 * Replace a transient "previous value" (e.g. "Pending Process") with the state
 * the object was in before the edit, using the preceding event on the same
 * object within 10 minutes. Input may be in any order.
 */
export function resolveStatusChains(all: ParsedChange[]): ParsedChange[] {
  const byObject = new Map<string, ParsedChange[]>();
  for (const c of all) {
    if (!c.eventType.includes("run_status") || !c.entityId) continue;
    const list = byObject.get(c.entityId) ?? [];
    list.push(c);
    byObject.set(c.entityId, list);
  }
  for (const list of byObject.values()) list.sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
  return all.map((c) => {
    if (!c.eventType.includes("run_status") || !c.entityId || !TRANSIENT_STATUS.test(c.previousValue ?? "")) return c;
    const list = byObject.get(c.entityId)!;
    const idx = list.indexOf(c);
    for (let k = idx - 1; k >= 0; k--) {
      const p = list[k];
      if (c.changedAt.getTime() - p.changedAt.getTime() > 10 * 60_000) break;
      if (p.previousValue && !TRANSIENT_STATUS.test(p.previousValue)) {
        return { ...c, previousValue: p.previousValue, action: describeStatus(p.previousValue, c.newValue, c.entityType) };
      }
    }
    return { ...c, action: describeStatus(null, c.newValue, c.entityType) };
  });
}

function describeStatus(from: string | null, to: string | null, entity: EntityKind): string {
  const what = entity === "ad" ? "Ad" : entity === "adset" ? "Ad set" : entity === "campaign" ? "Campaign" : "Status";
  if (to === "Paused") return `${what} paused`;
  if (to === "Active") return from === "Paused" ? `${what} re-activated` : `${what} activated`;
  return `${what} status changed`;
}

export const CATEGORY_LABEL: Record<ChangeCategory, string> = {
  budget: "Budget",
  bid_strategy: "Bid strategy",
  budget_allocation: "Budget allocation",
  campaign_structure: "Structure",
  audience: "Audience",
  targeting: "Targeting",
  placement: "Placement",
  creative: "Creative",
  copy: "Copy",
  optimization_event: "Optimization event",
  tracking: "Tracking",
  conversion: "Conversion",
  campaign_status: "Campaign status",
  ad_set_status: "Ad set status",
  ad_status: "Ad status",
  other: "Other",
};
