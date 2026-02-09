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
| 9B | Ghost Mode Implementation | ✅ LOCKED |
| V2-A | Hard Delete Ghost Mode (clean slate) | ✅ LOCKED |
| V3-A | Exchange Rounds Data Model + Migration | ✅ LOCKED |
| V3-B | Multi-Round Orchestrator Loop | ✅ LOCKED |
| V3-C | UI Renders Rounds | ✅ LOCKED |
| V3-D | GPT Context Fix + Doc Sync | ✅ LOCKED |

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
- Warnings are `runId`-scoped (no global warnings in reducer)
- `Exchange.rounds: Round[]` — ordered rounds, not flat responsesByAgent
- Multi-round max 5 rounds per exchange
- `[NO_FURTHER_INPUT]` — unanimous termination token

## Cost Controls (Phase 5)

- MAX_AGENT_CALLS = 15 (3 agents × 5 rounds)
- MAX_EXCHANGES = 10
- MAX_CONTEXT_CHARS = 12000
- Truncation: oldest-first dropping
- Logging: dev-only

## Test Count

**180 tests** across 9 test files (all passing).

## File Structure

```
TheBrain/
├── src/
│   ├── api/
│   │   └── agentClient.ts
│   ├── components/
│   │   ├── AgentCard.tsx
│   │   ├── AppLayout.tsx
│   │   ├── BrainChat.tsx
│   │   ├── ContextShelfPanel.tsx
│   │   ├── ExchangeCard.tsx (V3-C: round rendering)
│   │   ├── ExchangeList.tsx
│   │   ├── PromptInput.tsx
│   │   ├── ActionBar.tsx
│   │   ├── WarningBanner.tsx
│   │   ├── WorkItemSidebar.tsx
│   │   └── index.ts
│   ├── config/
│   │   ├── env.ts
│   │   └── projectContext.ts
│   ├── context/
│   │   ├── BrainContext.tsx
│   │   └── WorkItemContext.tsx
│   ├── reducer/brainReducer.ts
│   ├── types/
│   │   ├── brain.ts
│   │   └── workItem.ts
│   ├── utils/
│   │   ├── contextBuilder.ts
│   │   ├── costConfig.ts
│   │   ├── devLogger.ts
│   │   ├── discussionPersistence.ts
│   │   └── workItemStore.ts
│   ├── __tests__/
│   │   ├── agentCardSanitization.test.ts
│   │   ├── agentClient.test.ts
│   │   ├── brainReducer.test.ts
│   │   ├── contextBuilder.test.ts
│   │   ├── discussionPersistence.test.ts
│   │   ├── exchangeCard.test.tsx
│   │   ├── orchestrator.test.ts
│   │   ├── productionGuards.test.ts
│   │   └── workItemStore.test.ts
│   ├── App.tsx
│   ├── index.tsx
│   └── styles.css
├── supabase/
│   ├── migrations/
│   │   └── 20260105000000_ghost_runs.sql
│   └── functions/
│       ├── _shared/
│       │   ├── types.ts
│       │   ├── cors.ts
│       │   └── productionGuards.ts
│       ├── openai-proxy/index.ts
│       ├── anthropic-proxy/index.ts
│       └── gemini-proxy/index.ts
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
