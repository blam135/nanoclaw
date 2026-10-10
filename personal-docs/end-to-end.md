# End-to-end: a Discord message to an agent reply

This shows the normal triggered-message path. Routing may reject an unknown sender or an unauthorized user, or store a message without waking the agent when its engagement rules do not match.

```mermaid
sequenceDiagram
    actor You
    participant Discord
    participant Bridge as Discord adapter / Chat SDK bridge
    participant Host as Router + session manager
    participant Central as Central DB
    participant In as inbound.db
    participant Runtime as Container runner
    participant Agent as Bun agent runner + provider
    participant Gateway as OneCLI
    participant Model as Model service
    participant Out as outbound.db
    participant Delivery as Host delivery poller

    You->>Discord: Send a message or mention the bot
    Discord->>Bridge: Gateway message event
    Bridge->>Bridge: Normalize sender, content, thread, mention and attachments
    Bridge->>Host: Inbound message
    Host->>Central: Resolve user, permissions, chat wiring and agent group
    Host->>Host: Apply engagement and session isolation rules
    Host->>Central: Resolve or create session
    Host->>In: Write message, routing and destination context
    Host->>Runtime: Wake the session
    alt Container needs to start
        Runtime->>Gateway: Obtain session identity and gateway configuration
        Gateway-->>Runtime: Gateway lease and credential-safe container contribution
        Runtime->>Agent: Start runtime with mailbox, workspace and source mounts
    else Container already running
        Note over In,Agent: Existing poll loop discovers the new message
    end
    Agent->>In: Poll pending messages
    Agent->>Out: Record processing acknowledgement
    Agent->>Agent: Format prompt with instructions and conversation context
    Agent->>Gateway: Provider request through gateway
    Gateway->>Gateway: Apply credential and request policy
    Gateway->>Model: Forward allowed model request with injected credentials
    Model-->>Gateway: Model output
    Gateway-->>Agent: Provider output
    opt Agent needs tools
        Agent->>Agent: Execute local tool or MCP operation
        Note over Agent,Gateway: External tool requests use gateway policy too
    end
    Agent->>Out: Write reply or tool-requested output and continuation state
    Agent->>Out: Mark batch completed
    Delivery->>Out: Poll pending output
    Delivery->>Central: Validate destination and applicable permissions
    Delivery->>Bridge: Deliver message, file, reaction or card
    Bridge->>Discord: Platform API request
    Discord-->>You: Show reply
    Delivery->>In: Record delivery result for the agent
```

The provider can stream output and use tools during a turn, so replies and acknowledgements can interleave. The host polls active sessions roughly every second and also sweeps sessions roughly every minute. It checks the heartbeat and processing state to detect stalled work.

## When an external request needs approval

```mermaid
sequenceDiagram
    participant Agent
    participant Gateway as OneCLI
    participant Coordinator as Host approval coordinator
    participant DB as Central DB
    participant Discord
    actor Admin as Authorized operator
    participant Service as External service

    Agent->>Gateway: External request
    Gateway->>Gateway: Policy holds request
    Gateway->>Coordinator: Pending approval event
    Coordinator->>DB: Validate request, resolve approver, save pending approval
    Coordinator->>Discord: Send approval card
    Discord-->>Admin: Show request details
    Admin->>Discord: Approve or deny
    Discord->>Coordinator: Card action with sender identity
    Coordinator->>DB: Check authorization and finalize decision
    Coordinator->>Gateway: Return decision
    alt Approved
        Gateway->>Service: Forward request with applicable credentials
        Service-->>Agent: Response through gateway
    else Denied or expired
        Gateway-->>Agent: Refuse request
    end
```

Approval depends on the gateway policy and host rules; not every model or tool request shows a card. If the approval subscription fails, the host closes session admission and stops gateway-dependent running sessions until reconnection succeeds.

## Trace a failure without an AI assistant

| Last successful checkpoint | What to inspect next |
|---|---|
| Nothing starts | `logs/nanoclaw.error.log`: upgrade tripwire, startup backoff, gateway selection, Docker availability |
| Discord shows online but no agents start | OneCLI and Postgres health; gateway subscription/admission errors in the host error log |
| Discord receives a message but nothing routes | Adapter logs, user access, chat wiring, mention/engagement rules in the router |
| Message routed | Session `inbound.db`: confirm a `messages_in` row exists |
| Inbound row exists but no reply | Session `outbound.db`: inspect `processing_ack`; check runtime, heartbeat, provider and gateway errors |
| Outbound reply exists but Discord receives nothing | Delivery errors, destination validation, adapter/API failures |

Start with these read-only checks from the checkout:

```bash
tail -n 40 logs/nanoclaw.error.log
tail -n 60 logs/nanoclaw.log
docker compose -f "$HOME/.onecli/docker-compose.yml" ps
curl -fsS http://127.0.0.1:10254/v1/health
pnpm ncl sessions list
```

`ncl` needs the host to be running. To inspect the central database directly, use the in-tree wrapper:

```bash
pnpm exec tsx scripts/q.ts data/v2.db "SELECT id, agent_group_id, status, container_status FROM sessions"
```

For a particular session, use its actual mailbox path from `data/v2-sessions/` with the same wrapper. Schema and query examples are in [the debug skill](../.claude/skills/debug/SKILL.md) and [session database reference](../docs/db-session.md). Inspect data before changing it; do not delete a session or credential volume to diagnose a missing reply.
