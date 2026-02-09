# The Brain — Locked Contract

> This contract is FROZEN. Changes require explicit unlock from all three agents.

## Project Overview
User asks a question → GPT answers first → GPT decides if Claude/Gemini should respond → Sequential responses display in one interface.

## Infrastructure (Complete)
- **Frontend**: Vite + React deployed on Vercel (the-brain-ten.vercel.app)
- **Backend**: Supabase Edge Functions (Deno)
- **Proxies**: openai-proxy, anthropic-proxy, gemini-proxy (all working)

## Agent Order
```
GPT → Claude (conditional) → Gemini (conditional)
```

## Gatekeeping (Option B)
GPT decides via strict flags at end of response:
```
---
CALL_CLAUDE=true|false
CALL_GEMINI=true|false
REASON_TAG=<short_code>
---
```

**Fallback**: If flags missing/invalid → call all agents

## Constraints
| Constraint | Value |
|------------|-------|
| Rolling window | 10 exchanges max |
| Context budget | ~12,000 characters |
| Protected prompt | User prompt never trimmed |
| Token cap | 1000 per agent |
| Agent timeout | 30s per agent |
| Total timeout | 90s |
| Persistence | None (refresh loses state) |
| Idempotency | runId on all events, double-submit blocked |
| MAX_AGENT_CALLS | 15 (3 agents × 5 rounds max) |

## State Fields (8 — Locked)
```typescript
exchanges: Exchange[]
pendingExchange: PendingExchange | null
currentAgent: Agent | null
isProcessing: boolean
userCancelled: boolean
warningState: WarningState | null
error: string | null
clearBoardVersion: number
```

**Exchange type** (V3-A):
```typescript
interface Exchange {
  id: string;
  userPrompt: string;
  rounds: Round[];       // V3-A: ordered rounds (not flat responsesByAgent)
  timestamp: number;
}

interface Round {
  roundNumber: number;
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
}
```

**NOT in state:**
- `inputValue` (local to InputArea component)
- `AbortController` (ref)
- `reasonTag` (GPT routing metadata only)

## Events (6 — Locked)
```
SEQUENCE_START
AGENT_STARTED
AGENT_COMPLETED
SEQUENCE_CANCELLED
SEQUENCE_TIMEOUT
SEQUENCE_COMPLETED
```

## Reducer Actions (10)
```
SUBMIT_START
AGENT_STARTED
AGENT_COMPLETED
SEQUENCE_COMPLETED          — carries rounds: Round[]
CANCEL_REQUESTED
CANCEL_COMPLETE             — carries rounds: Round[]
RESET_PENDING_ROUND         — clears pendingExchange.responsesByAgent between rounds
SET_WARNING
CLEAR
LOAD_CONVERSATION_SNAPSHOT
```

## Status Values (5)
```
success | timeout | cancelled | error | skipped
```

**Note**: `loading` is UI-derived, NOT a status.

## Multi-Round Protocol

- **Max rounds**: 5 per exchange
- **Termination**: All agents respond with exactly `[NO_FURTHER_INPUT]` → unanimous termination
- **Context injection**: `formatPriorRounds` serializes completed rounds for subsequent round context
- **Round reset**: `RESET_PENDING_ROUND` clears `pendingExchange.responsesByAgent` between rounds
- **Agent call budget**: MAX_AGENT_CALLS = 15 (3 agents × 5 rounds)

## Error Model
- `status`: success | timeout | cancelled | error | skipped
- `errorCode` (only when status=error): network | api | rate_limit | unknown
- `errorMessage`: optional string

## Build Order
1. Types
2. Reducer
3. Context + Provider
4. Orchestrator hook
5. UI components

## Process Rules
- GPT is Reviewer
- Claude is Lead
- Gemini is Infrastructure
- All communication is shared between AIs
- Start responses with "I am Claude" / "I am GPT" / "I am Gemini"
- No code until explicitly authorized
- Challenge corrections when warranted

## Type Invariants
- `AgentResponse` is discriminated union by status
- `success` → content required, no errorCode
- `error` → errorCode required, content optional
- `timeout|cancelled|skipped` → content optional, no errorCode
- `Exchange.rounds: Round[]` — ordered rounds, not flat responsesByAgent

## Reducer Invariants
- All sequence actions require runId match
- Stale runId → action ignored (no error)
- `SUBMIT_START` blocked if `isProcessing === true`
- `CLEAR` blocked if `isProcessing === true`
- `CLEAR` increments `clearBoardVersion`
- `SET_WARNING` is runId-scoped only
- `reasonTag` is NEVER stored in state
