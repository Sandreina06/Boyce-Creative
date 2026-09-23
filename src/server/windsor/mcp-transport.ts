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
      result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 120_000 });
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
