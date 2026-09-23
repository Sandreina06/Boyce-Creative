/**
 * Low-level Windsor access. Only the service layer (./service.ts) may use this.
 *
 * READ ONLY: Windsor's MCP also exposes write tools that can pause, enable,
 * create and re-budget Meta campaigns (`execute_action`, …). The app must never
 * call them, so every transport goes through `assertReadOnlyTool`.
 */

export const READ_ONLY_TOOLS = ["get_data", "get_fields", "get_options", "get_connectors"] as const;
export type ReadOnlyTool = (typeof READ_ONLY_TOOLS)[number];

export function assertReadOnlyTool(tool: string): asserts tool is ReadOnlyTool {
  if (!(READ_ONLY_TOOLS as readonly string[]).includes(tool)) {
    throw new Error(`Windsor tool "${tool}" is not allowed: the app is read-only`);
  }
}

export type WindsorRow = Record<string, string | number | boolean | null>;

export type GetDataRequest = {
  connector: string;
  /** Explicit account ids. Never empty — an empty list means "all accounts" to Windsor. */
  accounts: string[];
  fields: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  options?: Record<string, string | boolean>;
};

export type GetDataResponse = {
  rows: WindsorRow[];
  source: DataSource;
  /** When the data was fetched from Windsor (or generated, for demo). */
  fetchedAt: Date;
  fromCache: boolean;
};

export type DataSource = "windsor" | "demo";

export interface WindsorTransport {
  readonly source: DataSource;
  getData(req: GetDataRequest): Promise<WindsorRow[]>;
}

export class WindsorError extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "WindsorError";
  }
}

export function validateGetDataRequest(req: GetDataRequest): void {
  if (!req.accounts.length) {
    throw new WindsorError("Refusing Windsor query without explicit account ids");
  }
  if (req.accounts.some((a) => !/^\d+$/.test(a))) {
    throw new WindsorError("Meta account ids must be numeric strings");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(req.dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(req.dateTo)) {
    throw new WindsorError("dateFrom/dateTo must be YYYY-MM-DD");
  }
  if (req.dateFrom > req.dateTo) throw new WindsorError("dateFrom is after dateTo");
  if (!req.fields.length) throw new WindsorError("No fields requested");
}
