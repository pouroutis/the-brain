# The Brain — Context Anchor

> This file is the single source of truth for project state across AI chat sessions.
> Update this file after each phase completion.

## Project
Multi-AI Sequential Chat System  
User asks question → GPT answers → GPT decides if Claude/Gemini respond → Sequential display

## Deployment

| Component | Location |
|-----------|----------|
| Frontend | https://the-brain-ten.vercel.app |
| Backend | Supabase Edge Functions @ fgjjbxznstbxqtcjmtzv.supabase.co |
| Source | Google Drive: My Drive / The Brain Project 2026 / TheBrain.zip |
| Git Repo | github.com/pouroutis/the-brain |
| Vercel Project | the-brain-ten |
| Production Branch | main |
| Auto-deploy | Yes (push to main → Vercel builds) |
| Build Command | npm run build |
| Output Directory | dist |

**To deploy:** Push to `main` branch → Vercel auto-deploys.

## Current Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 2 | Types, Reducer, Context/Provider, Orchestrator, UI | ✅ LOCKED |
| 3 | Integration (agentClient, real API calls) | ✅ LOCKED |
| 3B | Testing (Vitest, 60 tests) | ✅ LOCKED |
| 4 | UX Hardening (error/timeout/cancelled sub-messages) | ✅ LOCKED |
| 5 | Cost Controls (MAX_AGENT_CALLS=3, truncation, logging) | ✅ LOCKED |
| 6 | Routing Telemetry UI (deterministic, status-only) | ✅ LOCKED |
| 7 | Mode Architecture | ✅ LOCKED |
| 8 | Ghost Mode Design | ✅ LOCKED |
| 9A | Trust Boundary + Persistence Design | ✅ LOCKED |
| 9B | Ghost Mode Implementation | ✅ IMPLEMENTED |

## Ghost Mode (Phase 9 — Implemented)

Current behavior: Ghost Mode (CEO mode default)
- Server-side multi-AI deliberation (GPT → Claude → Gemini, max 2 rounds)
- Convergence gates: G1 (Compliance), G2 (Factual), G3 (Risk Stability)
- Hard caps: 2 rounds, 6 calls, 4000 tokens, 90s timeout
- CEO sees only final output (RECOMMENDATION, RATIONALE, RISKS ≤3, NEXT ACTIONS ≤3)
- Audit persistence to ghost_runs table (required for CEO mode)

## Agent Roles (Workflow)

- **GPT**: Reviewer / Risk Gatekeeper — approves or blocks, issues LOCK GRANTED
- **Claude**: Lead / Implementer — writes code, proposes architecture
- **Gemini**: Infrastructure / Stress-test — identifies edge cases and failure modes

## Locked Invariants

- State has exactly 8 fields (no additions)
- Agent order: GPT → Claude → Gemini (fixed)
- `reasonTag` is GPT routing metadata only — NOT stored in reducer state
- `loading` is UI-derived from `isProcessing + currentAgent` — NOT a status
- `runId` guards all sequence-related actions
- `errorCode` only exists when `status === 'error'`
- `CLEAR` action blocked when `isProcessing === true`
- `CLEAR` must increment `clearBoardVersion`
- `responsesByAgent` is keyed by Agent (not an array)
- Warnings are `runId`-scoped (no global warnings in reducer)

## Cost Controls (Phase 5)

- MAX_AGENT_CALLS = 3
- MAX_EXCHANGES = 10
- MAX_CONTEXT_CHARS = 12000
- Truncation: oldest-first dropping
- Logging: dev-only

## File Structure

```
TheBrain/
├── src/
│   ├── api/
│   │   ├── agentClient.ts
│   │   └── ghostClient.ts          (Phase 9B)
│   ├── components/
│   │   ├── AgentCard.tsx
│   │   ├── BrainChat.tsx
│   │   ├── ExchangeCard.tsx (Phase 6: routing telemetry)
│   │   ├── ExchangeList.tsx
│   │   ├── PromptInput.tsx
│   │   ├── ActionBar.tsx
│   │   ├── WarningBanner.tsx
│   │   └── index.ts
│   ├── config/env.ts
│   ├── context/BrainContext.tsx    (Phase 9B: Ghost branch)
│   ├── reducer/brainReducer.ts
│   ├── types/
│   │   ├── brain.ts
│   │   └── ghost.ts                (Phase 9B)
│   ├── utils/
│   │   ├── contextBuilder.ts
│   │   ├── costConfig.ts
│   │   └── devLogger.ts
│   ├── __tests__/
│   │   ├── brainReducer.test.ts
│   │   ├── orchestrator.test.ts
│   │   ├── parseGatekeepingFlags.indirect.test.ts
│   │   ├── ghostParser.test.ts     (Phase 9B)
│   │   ├── ghostConstraints.test.ts (Phase 9B)
│   │   └── ghostMode.test.ts       (Phase 9B)
│   ├── App.tsx
│   ├── index.tsx
│   └── styles.css
├── supabase/                        (Phase 9B)
│   ├── migrations/
│   │   └── 20260105000000_ghost_runs.sql
│   └── functions/
│       ├── _shared/
│       │   ├── types.ts
│       │   ├── cors.ts
│       │   ├── ghostPrompts.ts
│       │   ├── ghostParser.ts
│       │   └── ghostCanonical.ts
│       ├── openai-proxy/index.ts
│       ├── anthropic-proxy/index.ts
│       ├── gemini-proxy/index.ts
│       └── ghost-orchestrator/index.ts
├── README_CONTEXT.md (this file)
├── CONTRACT.md
├── CLAUDE_REHYDRATION_PROMPT.md
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Re-Hydration Prompt

Paste this at the start of any new chat:

```
PROJECT: The Brain

You are joining an ongoing multi-AI system build.

Rules:
- Canonical source: Google Drive → My Drive / The Brain Project 2026 / TheBrain.zip
- README_CONTEXT.md defines current truth and lock state
- Do NOT assume anything not in the ZIP
- Treat ZIP files as authoritative
- No redesigns unless explicitly authorized
- Changes require GPT LOCK GRANTED before Drive upload

Your role is: <GPT | Claude | Gemini>
```
