/**
 * Windsor.ai `facebook` connector field ids used by the app.
 *
 * Every id here was verified against the live Windsor schema (get_fields /
 * get_options) and real get_data responses on 2026-09-23 — see
 * docs/01-discovery-and-architecture.md §2. Do not add ids that have not been
 * verified the same way.
 */

export const WINDSOR_CONNECTOR = "facebook" as const;

export const F = {
  // Dimensions / identifiers
  date: "date",
  accountId: "account_id",
  accountName: "account_name",
  accountCurrency: "account_currency",
  accountTimezone: "account_timezone",
  campaignId: "campaign_id",
  campaignName: "campaign",
  campaignObjective: "campaign_objective",
  campaignEffectiveStatus: "campaign_effective_status",
  campaignDailyBudget: "campaign_daily_budget", // minor currency units
  campaignLifetimeBudget: "campaign_lifetime_budget", // minor currency units
  adsetId: "adset_id",
  adsetName: "adset_name",
  adsetEffectiveStatus: "adset_effective_status",
  adsetDailyBudget: "adset_daily_budget", // minor currency units
  adsetLifetimeBudget: "adset_lifetime_budget", // minor currency units
  adId: "ad_id",
  adName: "ad_name",
  adEffectiveStatus: "effective_status",
  creativeId: "creative_id",
  thumbnailUrl: "thumbnail_url", // signed, expiring Meta CDN URL — never persist long-term
  /** Click destination; "http://fb.me/" is Meta's value for instant-form (lead form) ads. */
  destinationUrl: "website_destination_url",
  adTitle: "title",
  adBody: "body",
  callToAction: "call_to_action_type",
  // Meta relevance diagnostics: ABOVE_AVERAGE | AVERAGE | BELOW_AVERAGE_* | UNKNOWN
  qualityRanking: "quality_ranking",
  engagementRanking: "engagement_rate_ranking",
  conversionRanking: "conversion_rate_ranking",
  // Video (null for image ads)
  videoViews3s: "actions_video_view", // 3-second video views
  videoP25: "video_p25_watched_actions_video_view",
  videoP100: "video_p100_watched_actions_video_view",
  thruplays: "video_thruplay_watched_actions_video_view",
  // Ad set delivery: LEARNING | FAIL (= "Learning limited") | null (learning complete / inactive)
  adsetLearningStage: "adset_learning_stage_info",
  adsetOptimizationGoal: "adsset_optimization_goal", // sic — Windsor's spelling

  // Base metrics (additive unless noted)
  spend: "spend", // major currency units
  impressions: "impressions",
  clicks: "clicks", // all clicks
  linkClicks: "actions_link_click",
  reach: "reach", // NOT additive across days or entities
  frequency: "frequency", // NOT additive

  dataFetchedAt: "data_fetched_at",
} as const;

/** Conversion (result) fields a client can pick as its primary conversion. */
export const CONVERSION_FIELDS = [
  { id: "actions_lead", label: "Leads (all sources)" },
  { id: "actions_onsite_conversion_lead_grouped", label: "Leads — Meta instant forms" },
  { id: "actions_offsite_conversion_fb_pixel_lead", label: "Leads — website pixel" },
  { id: "actions_purchase", label: "Purchases" },
  { id: "actions_offsite_conversion_fb_pixel_purchase", label: "Purchases — website pixel" },
  { id: "actions_omni_purchase", label: "Purchases — omni" },
  { id: "actions_complete_registration", label: "Complete registration" },
  { id: "conversions_schedule_total", label: "Schedule (appointments)" },
  { id: "conversions_submit_application_total", label: "Submit application" },
  { id: "conversions_contact_total", label: "Contact" },
  { id: "conversions_start_trial_total", label: "Start trial" },
  { id: "actions_onsite_conversion_messaging_conversation_started_7d", label: "Messaging conversations started" },
  { id: "actions_add_to_cart", label: "Add to cart" },
  { id: "actions_initiate_checkout", label: "Initiate checkout" },
  { id: "actions_landing_page_view", label: "Landing page views" },
] as const;

/** Conversion value (revenue) fields. */
export const VALUE_FIELDS = [
  { id: "action_values_purchase", label: "Purchase value" },
  { id: "action_values_offsite_conversion_fb_pixel_purchase", label: "Purchase value — website pixel" },
  { id: "action_values_omni_purchase", label: "Purchase value — omni" },
  { id: "action_values_lead", label: "Lead value" },
  { id: "conversion_values_schedule_total", label: "Schedule value" },
] as const;

/** Values accepted by the Windsor `attribution_window` option (subset surfaced in the UI). */
export const ATTRIBUTION_WINDOWS = [
  { id: "default", label: "Default (7-day click, 1-day view)" },
  { id: "1d_click", label: "1-day click" },
  { id: "7d_click", label: "7-day click" },
  { id: "28d_click", label: "28-day click" },
  { id: "1d_view", label: "1-day view" },
  { id: "7d_view", label: "7-day view" },
  { id: "dda", label: "Data-driven (dda)" },
] as const;

const CONVERSION_IDS = new Set<string>(CONVERSION_FIELDS.map((f) => f.id));
const VALUE_IDS = new Set<string>(VALUE_FIELDS.map((f) => f.id));
const ATTRIBUTION_IDS = new Set<string>(ATTRIBUTION_WINDOWS.map((f) => f.id));

export const isConversionField = (id: string) => CONVERSION_IDS.has(id);
export const isValueField = (id: string) => VALUE_IDS.has(id);
export const isAttributionWindow = (id: string) => ATTRIBUTION_IDS.has(id);
