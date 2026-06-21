// Official Bitget Agent Hub "market-data" MCP server — confirmed directly
// from Bitget-AI/agent_hub docs/skill-hub.md "Required MCP Server" section
// and cross-checked against the real sentiment-analyst SKILL.md file.
// No API key required — this serves public market/macro/sentiment/news data.
const MCP_SERVER_URL = 'https://datahub.noxiaohao.com/mcp';

export class MarketDataMcpClient {
  private client: any = null;
  private connected = false;
  private connecting: Promise<void> | null = null;

  private async ensureConnected(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        // IMPORTANT: dynamic import(), not a static top-level import and not
        // require(). The MCP SDK has ESM-only transitive dependencies that
        // throw ERR_REQUIRE_ESM under CommonJS require() — dynamic import()
        // is Node's own documented workaround for this exact situation.
        const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
        const { StreamableHTTPClientTransport } = await import(
          '@modelcontextprotocol/sdk/client/streamableHttp.js'
        );

        const transport = new StreamableHTTPClientTransport(new URL(MCP_SERVER_URL));
        const client = new Client({ name: 'nexus-agent', version: '1.0.0' });
        await client.connect(transport);

        this.client = client;
        this.connected = true;
        console.log(`✅ [MCP] Connected to market-data server: ${MCP_SERVER_URL}`);
      } catch (err: any) {
        console.error(`❌ [MCP] Connection failed: ${err.message}`);
        this.connected = false;
        this.client = null;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  /** Diagnostic — logs every tool name + its exact input schema, straight from the server. */
  async listTools(): Promise<void> {
    await this.ensureConnected();
    if (!this.client) {
      console.error('[MCP] Cannot list tools — not connected');
      return;
    }
    try {
      const result = await this.client.listTools();
      console.log(`\n[MCP] ✅ Discovered ${result.tools.length} tools:\n`);
      for (const tool of result.tools) {
        console.log(`── ${tool.name} ──────────────────────────`);
        console.log(`   ${tool.description || '(no description)'}`);
        console.log(`   Input schema: ${JSON.stringify(tool.inputSchema)}`);
      }
    } catch (err: any) {
      console.error(`[MCP] ❌ tools/list failed: ${err.message}`);
    }
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    await this.ensureConnected();
    if (!this.client) throw new Error('Market-data MCP not connected');
    return this.client.callTool({ name, arguments: args });
  }
}

export const marketDataMcp = new MarketDataMcpClient();
