import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  assertReadOnlyTool,
  type GetDataRequest,
  type ReadOnlyTool,
  type WindsorRow,
  type WindsorTransport,
  WindsorError,
} from "./client";

/** Max Windsor requests in flight at once (per server process). Trial/plan limits are low. */
const MAX_CONCURRENCY = Math.max(1, Number(process.env.WINDSOR_MAX_CONCURRENCY ?? 3));
const MAX_ATTEMPTS = 2;
/** Hard limit per Windsor call so a page never waits indefinitely. */
const CALL_TIMEOUT_MS = Number(process.env.WINDSOR_TIMEOUT_MS ?? 45_000);

let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENCY) await new Promise<void>((resolve) => waiting.push(resolve));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

/** Errors worth retrying: rate limits, timeouts, overloaded/5xx, dropped connections. */
export function isTransient(message: string): boolean {
  if (/not compatible|invalid|not available|unknown field|permission|unauthori[sz]ed|forbidden/i.test(message)) return false;
  return /rate|limit|too many|429|timeout|timed out|overload|temporar|unavailable|5\d\d|ECONNRESET|socket|network|fetch failed|aborted/i.test(message);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Talks to Windsor's hosted MCP server (https://mcp.windsor.ai/) with a
 * Windsor API key (`Authorization: Bearer …`). Windsor holds the Meta
 * connection — this app never sees a Meta token.
 */
export class McpWindsorTransport implements WindsorTransport {
  readonly source = "windsor" as const;
  private clientPromise?: Promise<Client>;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  private connect(): Promise<Client> {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const client = new Client({ name: "boyce-meta-intelligence", version: "0.1.0" });
        const transport = new StreamableHTTPClientTransport(new URL(this.url), {
          requestInit: { headers: { Authorization: `Bearer ${this.apiKey}` } },
        });
        await client.connect(transport);
        return client;
      })().catch((err) => {
        this.clientPromise = undefined; // allow a retry on the next request
        throw err;
      });
    }
    return this.clientPromise;
  }

  private async callTool(tool: ReadOnlyTool, args: Record<string, unknown>): Promise<unknown> {
    assertReadOnlyTool(tool);
    const client = await this.connect();
    let result;
    try {
      result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
    } catch (err) {
      this.clientPromise = undefined; // session may have expired; reconnect next time
      throw new WindsorError(`Windsor MCP call failed: ${(err as Error).message}`, err);
    }
    const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
    const text = content.find((c) => c.type === "text")?.text;
    if (result.isError) throw new WindsorError(text ?? "Windsor returned an error");
    if (result.structuredContent) return result.structuredContent;
    if (!text) throw new WindsorError("Empty Windsor response");
    try {
      return JSON.parse(text);
    } catch {
      throw new WindsorError(`Unexpected Windsor response: ${text.slice(0, 300)}`);
    }
  }

  async getData(req: GetDataRequest): Promise<WindsorRow[]> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await withSlot(() => this.getDataOnce(req));
      } catch (err) {
        lastErr = err;
        const msg = (err as Error).message ?? String(err);
        if (attempt === MAX_ATTEMPTS || !isTransient(msg)) break;
        const wait = 1000 * 3 ** (attempt - 1) + Math.random() * 500; // ~1s, ~3s
        console.warn(`[windsor] transient error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${Math.round(wait)}ms: ${msg}`);
        await sleep(wait);
      }
    }
    throw lastErr;
  }

  private async getDataOnce(req: GetDataRequest): Promise<WindsorRow[]> {
    const payload = (await this.callTool("get_data", {
      connector: req.connector,
      accounts: req.accounts,
      fields: req.fields,
      date_from: req.dateFrom,
      date_to: req.dateTo,
      ...(req.options && Object.keys(req.options).length ? { options: req.options } : {}),
    })) as { result?: WindsorRow[]; error?: string };

    if (payload.error) throw new WindsorError(payload.error);
    if (!Array.isArray(payload.result)) throw new WindsorError("Windsor response has no result array");
    return payload.result;
  }
}
