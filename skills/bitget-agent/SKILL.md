---
name: bitget-agent-hub
description: Official Bitget Agent Hub v3.0 & Model Context Protocol (MCP) skill for NEXUS. Teaches AI assistants and trading agents to discover catalog operations, query live Bitget market telemetry, execute safe paper orders, and interface with the Bitget Unified Trading Account (UTA) v3.
---

# Bitget Agent Hub & MCP Protocol Specification

This skill integrates NEXUS with the **official Bitget Agent Hub v3.0** specification, enabling autonomous trading models (e.g. Alibaba Cloud Qwen 3.8 Max, Claude Code, Codex) to interact with Bitget UTA v3 services and the live Streamable HTTP MCP server.

---

## 1. Architecture Overview

Bitget Agent Hub exposes a layered architecture:
- **Foundation**: Bitget UTA v3 REST API (109 catalog operations across 6 user modules: `account`, `trade`, `market`, `strategy`, `cryptoloans`, `tax`).
- **MCP Surface**: Live Streamable HTTP Model Context Protocol server at `https://agent.bitget.com/mcp`.
- **Shell Surface**: The `bgc` command-line interface.

```
AI Model / Decision Agent (Qwen / Claude / Codex)
       │
       ▼  Streamable HTTP (JSON-RPC 2.0 + SSE)
┌──────────────────────────────────────────────┐
│       Bitget Agent Hub MCP Surface           │
│       https://agent.bitget.com/mcp           │
├──────────────────────┬───────────────────────┤
│  guide (Taxonomy)    │  do_query (Execution) │
└──────────────────────┴───────────────────────┘
```

---

## 2. Core Protocol Rules

### Rule 1: Mandatory Session Lifecycle
The Bitget MCP endpoint is session-oriented. Stateless one-shot requests without an active session header are rejected with HTTP 400.
1. **Initialize Handshake**: Send `initialize` with client info.
2. **Session Header**: Capture `mcp-session-id` from response headers.
3. **Session Confirmation**: Send `notifications/initialized` echoing `mcp-session-id`.
4. **Subsequent Calls**: All `tools/call` invocations must include `'mcp-session-id': <sessionId>`.

### Rule 2: Catalog Progressive Disclosure
Bitget MCP does not expose 100+ separate tool declarations (which would blow context windows). It exposes two canonical meta-tools:
- **`guide`**: Navigates catalog categories (`crypto`, `equity`, `etf`, `news`, `sentiment`) and discovers available `entry_id` targets.
- **`do_query`**: Executes a specific entry with required parameters:
  ```json
  {
    "name": "do_query",
    "arguments": {
      "entry_id": "equity_price_quote",
      "params": { "symbol": "NVDA" }
    }
  }
  ```

### Rule 3: Dual Transport Handling
Bitget MCP streams responses either as standard `application/json` or as Server-Sent Events (`text/event-stream`). Clients must parse both single-line JSON and multi-line `data:` SSE blocks.

---

## 3. Safety Model & Risk Cage Enforcement

All Bitget Agent Hub operations in NEXUS adhere to four strict guardrails:
1. **`readOnly`**: Write actions (order placement, withdrawals) self-block unless explicitly cleared by the NEXUS Deterministic Risk Cage.
2. **`confirm`**: Destructive actions require two-step confirmation.
3. **`paperTrading`**: Live autonomous cycles default to simulated / paper execution before touching real funds.
4. **`truthProvenance`**: All figures output by reasoning models are validated against live telemetry by the NEXUS Anti-Fabrication Engine. Unverified claims are redacted.

---

## 4. Diagnostic Probing

To verify the health and reachability of the Bitget Agent Hub MCP endpoint:
- **Endpoint**: `GET /api/mcp/probe`
- **Output**: Returns handshake status, session ID, round-trip latency, discovered tools, and sample quote telemetry.
