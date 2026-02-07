// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Core Type Definitions (Phase 2)
// =============================================================================

// -----------------------------------------------------------------------------
// Agent Types
// -----------------------------------------------------------------------------

export type Agent = 'gpt' | 'claude' | 'gemini';

// -----------------------------------------------------------------------------
// Mode Types (Phase 2)
// -----------------------------------------------------------------------------

/**
 * Brain operating modes with distinct behavior rules.
 *
 * - discussion: All AIs speak, multi-turn allowed, CEO inactive, no execution prompts
 * - decision: All AIs speak ONCE, CEO active (speaks last), single output, no execution prompts
 * - project: All AIs speak, CEO active, CEO controls flow, execution prompts ENABLED
 */
export type BrainMode = 'discussion' | 'decision' | 'project';

/**
 * Loop states (Phase 2C — Project Mode only)
 *
 * - idle: Not executing, controls enabled
 * - running: Autonomous execution active, controls locked
 * - paused: Temporarily paused, can resume or stop
 * - completed: Ghost orchestrator finished successfully
 * - failed: Ghost orchestrator failed, retry available
 */
export type LoopState = 'idle' | 'running' | 'paused' | 'completed' | 'failed';

// -----------------------------------------------------------------------------
// Project Phase Machine (Next Layer MVP)
// -----------------------------------------------------------------------------

/**
 * Project mode phase states — orchestrator transitions only.
 * AI text must never directly move state.
 */
export type ProjectPhase =
  | 'INTENT_RECEIVED'
  | 'DELIBERATION'
  | 'CONSENSUS_DRAFT'
  | 'CEO_GATE'
  | 'CLAUDE_CODE_EXECUTION'
  | 'REVIEW'
  | 'USER_BUILD_GATE'
  | 'DONE'
  | 'FAILED_REQUIRES_USER_DIRECTION';

/**
 * Interrupt severity levels for Request Change
 */
export type InterruptSeverity = 'blocker' | 'improvement';

/**
 * Interrupt scope categories
 */
export type InterruptScope = 'ui' | 'api' | 'tests' | 'other';

/**
 * Structured interrupt from user during project execution
 */
export interface ProjectInterrupt {
  id: string;
  message: string;
  severity: InterruptSeverity;
  scope: InterruptScope;
  timestamp: number;
  /** Whether this interrupt has been processed */
  processed: boolean;
}

/**
 * Project execution run state
 */
export interface ProjectRun {
  /** Current phase in the phase machine */
  phase: ProjectPhase;
  /** Unique epoch identifier (increments on new user direction) */
  epochId: number;
  /** Micro-epoch counter within an epoch (increments on blocker restart) */
  microEpochId: number;
  /** Revision count within current epoch (max 2) */
  revisionCount: number;
  /** Pending and processed interrupts */
  interrupts: ProjectInterrupt[];
  /** The user's intent for this epoch */
  lastIntent: string | null;
  /** CEO-generated prompt artifact for Claude Code */
  ceoPromptArtifact: string | null;
  /** Executor output artifact placeholder */
  executorOutput: string | null;
  /** Project-specific error message */
  error: string | null;
}

/**
 * Maximum revisions per epoch before terminal failure
 */
export const MAX_REVISIONS_PER_EPOCH = 2;

// -----------------------------------------------------------------------------
// Status Types
// -----------------------------------------------------------------------------

/**
 * Final status of an agent's participation in an exchange.
 * "loading" is NOT a status — it is derived from (isProcessing + currentAgent).
 */
export type AgentStatus = 'success' | 'error' | 'timeout' | 'cancelled' | 'skipped';

/**
 * Error classification — ONLY present when status === 'error'
 */
export type ErrorCode = 'network' | 'api' | 'rate_limit' | 'unknown';

// -----------------------------------------------------------------------------
// Warning Types
// -----------------------------------------------------------------------------

export type WarningType = 'context_limit' | 'exchange_limit' | 'timeout_warning';

export interface WarningState {
  type: WarningType;
  message: string;
  dismissable: boolean;
}

// -----------------------------------------------------------------------------
// Response Types (Discriminated Union by Status)
// -----------------------------------------------------------------------------

interface AgentResponseBase {
  agent: Agent;
  timestamp: number;
}

export interface AgentResponseSuccess extends AgentResponseBase {
  status: 'success';
  /** Required for success */
  content: string;
}

export interface AgentResponseError extends AgentResponseBase {
  status: 'error';
  /** Optional for error states */
  content?: string;
  /** Required when status is error */
  errorCode: ErrorCode;
  /** Optional human-readable error detail */
  errorMessage?: string;
}

export interface AgentResponseTerminal extends AgentResponseBase {
  status: 'timeout' | 'cancelled' | 'skipped';
  /** Optional for terminal states */
  content?: string;
}

export type AgentResponse =
  | AgentResponseSuccess
  | AgentResponseError
  | AgentResponseTerminal;

// -----------------------------------------------------------------------------
// Exchange Types
// -----------------------------------------------------------------------------

export interface Exchange {
  id: string;
  /** The user's message for THIS specific exchange */
  userPrompt: string;
  /** Keyed by agent — guarantees uniqueness, deterministic rendering */
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
  timestamp: number;
}

export interface PendingExchange {
  /** Unique identifier for this sequence run — validated on every state transition */
  runId: string;
  userPrompt: string;
  /** Keyed by agent — accumulates during sequence */
  responsesByAgent: Partial<Record<Agent, AgentResponse>>;
}

// -----------------------------------------------------------------------------
// Gatekeeping (GPT's Decision Block)
// -----------------------------------------------------------------------------

export interface GatekeepingFlags {
  callClaude: boolean;
  callGemini: boolean;
  reasonTag: string;
  /** False if parsing failed — triggers fallback (call all agents) */
  valid: boolean;
}

// -----------------------------------------------------------------------------
// CEO Prompt Artifact (Discussion Mode)
// -----------------------------------------------------------------------------

/**
 * CEO's finalized Claude Code prompt artifact.
 * Published via JSON control block: {"ceo_action": "FINALIZE_PROMPT", "claude_code_prompt": "..."}
 */
export interface CeoPromptArtifact {
  /** The prompt text for Claude Code */
  text: string;
  /** Version counter (increments each time CEO publishes) */
  version: number;
  /** ISO timestamp when artifact was created/updated */
  createdAt: string;
}

// -----------------------------------------------------------------------------
// CEO Clarification Lane (Decision Mode Only)
// -----------------------------------------------------------------------------

/**
 * Single message in the clarification lane
 */
export interface ClarificationMessage {
  id: string;
  role: 'user' | 'ceo';
  content: string;
  timestamp: number;
}

/**
 * Decision Memo posted by CEO after clarification is resolved
 */
export interface DecisionMemo {
  /** Summary of the clarification exchange */
  clarificationSummary: string;
  /** The CEO's final decision */
  finalDecision: string;
  /** Next step to take */
  nextStep: string;
  /** Timestamp when memo was created */
  timestamp: number;
}

/**
 * State of the CEO-only clarification lane (Decision mode only)
 * - null when not active
 * - active when CEO outputs BLOCKED
 */
export interface ClarificationState {
  /** Whether clarification is currently active (main input locked) */
  isActive: boolean;
  /** The questions CEO asked when entering BLOCKED state (max 3) */
  blockedQuestions: string[];
  /** Messages exchanged in clarification lane */
  messages: ClarificationMessage[];
  /** Whether CEO is currently processing a response */
  isProcessing: boolean;
  /** The Decision Memo (set when clarification is resolved) */
  decisionMemo: DecisionMemo | null;
  /** Timestamp when clarification started */
  startedAt: number;
}

// -----------------------------------------------------------------------------
// Decision Record (ProjectState Persistence)
// -----------------------------------------------------------------------------

/**
 * A single decision record captured after CEO finalization.
 * Immutable once created (append-only).
 */
export interface DecisionRecord {
  /** Unique decision identifier */
  id: string;
  /** Epoch ID for traceability (Batch 4+, optional for backward compat) */
  epochId?: number;
  /** Creation timestamp */
  createdAt: number;
  /** Mode when decision was made */
  mode: BrainMode;
  /** Whether CEO produced a Claude Code prompt */
  promptProduced: boolean;
  /** The Claude Code prompt text (if promptProduced=true) */
  claudeCodePrompt?: string;
  /** Whether CEO was blocked (needed clarification) */
  blocked: boolean;
  /** Reason for blocking (if blocked=true) */
  blockedReason?: string;
  /** Blocked questions payload (if blocked=true) */
  blockedPayload?: string[];
  /** CEO agent at time of decision */
  ceoAgent: Agent;
  /** Advisor agents at time of decision */
  advisors: Agent[];
  /** Last 10 exchanges at time of decision (context snapshot) */
  recentExchanges: Exchange[];
  /** KeyNotes at time of decision (may be null) */
  keyNotes: KeyNotes | null;
}

// -----------------------------------------------------------------------------
// ProjectState (Durable Persistence)
// -----------------------------------------------------------------------------

/**
 * Project status states.
 * - active: Project in progress
 * - blocked: CEO needs user input
 * - done: Project completed
 */
export type ProjectStatus = 'active' | 'blocked' | 'done';

// -----------------------------------------------------------------------------
// Decision Epoch State Machine (Batch 4)
// -----------------------------------------------------------------------------

/**
 * Phase states for the Decision Epoch state machine.
 * Orchestrator transitions only — AI text NEVER moves phase directly.
 */
export type DecisionEpochPhase =
  | 'IDLE'
  | 'ADVISORS'
  | 'CEO_DRAFT'
  | 'ADVISOR_REVIEW'
  | 'CEO_FINAL'
  | 'EPOCH_COMPLETE'
  | 'EPOCH_BLOCKED'
  | 'EPOCH_STOPPED';

/** Default max rounds per epoch */
export const EPOCH_DEFAULT_MAX_ROUNDS = 2;

/** Absolute max rounds (only reachable via BLOCKED extension) */
export const EPOCH_ABSOLUTE_MAX_ROUNDS = 3;

/**
 * State object for a single Decision Epoch.
 * An epoch = one user intent → N rounds of deliberation → terminal state.
 *
 * Invariants:
 * - round is a first-class field, never derived from counting exchanges
 * - phase transitions are orchestrator-driven only
 * - Max 2 rounds default; max 3 only if CEO emits BLOCKED in Round 2
 * - epochId is project-scoped, resets per project
 */
export interface DecisionEpoch {
  /** Unique epoch identifier (monotonic within active project) */
  epochId: number;
  /** Current round (1-indexed) */
  round: number;
  /** Current phase within the round */
  phase: DecisionEpochPhase;
  /** Maximum rounds allowed (default 2, extends to 3 on BLOCKED) */
  maxRounds: number;
  /** The user's original intent for this epoch */
  intent: string;
  /** CEO agent for this epoch (captured at epoch start, immutable within epoch) */
  ceoAgent: Agent;
  /** Whether CEO-only mode was active at epoch start */
  ceoOnlyMode: boolean;
  /** Timestamp when epoch started */
  startedAt: number;
  /** Timestamp when epoch reached terminal state (null while active) */
  completedAt: number | null;
  /** Terminal reason (populated when phase is terminal) */
  terminalReason: 'prompt_delivered' | 'blocked' | 'stopped' | 'cancelled' | null;
  /** Parsed advisor reviews from Round 2+ (Batch 6, optional) */
  advisorReviews?: Partial<Record<Agent, ParsedAdvisorReview>>;
}

// -----------------------------------------------------------------------------
// Structured Advisor Review (Batch 6)
// -----------------------------------------------------------------------------

/** Advisor's review decision */
export type AdvisorDecision = 'APPROVE' | 'REVISE' | 'REJECT';

/** Advisor's confidence level */
export type AdvisorConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Parsed result of an advisor's Round 2 structured review.
 * Always includes rawText. Structured fields populated only if valid.
 */
export interface ParsedAdvisorReview {
  /** Whether the review conformed to the schema */
  valid: boolean;
  /** Parsing errors (if invalid) */
  errors: string[];
  /** Raw text of the advisor response (always populated) */
  rawText: string;
  /** Advisor's decision (null if invalid) */
  decision: AdvisorDecision | null;
  /** Rationale bullets */
  rationale: string[];
  /** Required changes (only for REVISE) */
  requiredChanges: string[];
  /** Identified risks */
  risks: string[];
  /** Confidence level (null if invalid) */
  confidence: AdvisorConfidence | null;
}

// -----------------------------------------------------------------------------
// CEO File Context (Batch 7)
// -----------------------------------------------------------------------------

/**
 * A file uploaded by the user for CEO context injection.
 * Content may be truncated if exceeding size limits.
 */
export interface FileEntry {
  /** Unique identifier */
  id: string;
  /** Filename (e.g., "ceoControlBlockParser.ts") */
  name: string;
  /** Relative path (e.g., "src/utils/ceoControlBlockParser.ts") */
  path: string;
  /** File text content (possibly truncated) */
  content: string;
  /** Original file size in characters before truncation */
  originalSize: number;
  /** Whether content was truncated to fit size limits */
  isTruncated: boolean;
  /** Timestamp when file was added */
  addedAt: number;
}

/**
 * Durable project state persisted to localStorage.
 * Survives refresh and mode transitions.
 */
export interface ProjectState {
  /** Unique project identifier */
  id: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  updatedAt: number;
  /** Optional user-provided title */
  title?: string;
  /** Current project status */
  status: ProjectStatus;
  /** ID of the last decision (if any) */
  lastDecisionId?: string;
  /** Append-only decision history */
  decisions: DecisionRecord[];
  /** Project-level memory (recent exchanges + keyNotes snapshot) */
  projectMemory: {
    recentExchanges: Exchange[];
    keyNotes: KeyNotes | null;
  };
  /** Schema version for migration support */
  schemaVersion: 1;
  /** Files uploaded for CEO context injection (Batch 7) */
  projectFiles?: FileEntry[];
}

// -----------------------------------------------------------------------------
// CEO Output Validation (Decision Mode Hard Gate)
// -----------------------------------------------------------------------------

/**
 * CEO output validation result (Decision mode only)
 * CEO MUST output one of:
 * 1. Valid Claude Code prompt (with markers)
 * 2. BLOCKED questions (max 3)
 */
export type CeoOutputValidation =
  | { valid: true; type: 'prompt' }
  | { valid: true; type: 'blocked' }
  | { valid: false; reason: string };

/**
 * Decision mode session blocking state
 * - null when not blocked
 * - set when CEO output is invalid
 */
export interface DecisionBlockingState {
  /** Whether session is blocked due to invalid CEO output */
  isBlocked: boolean;
  /** Reason for blocking */
  reason: string;
  /** The exchange ID that triggered the block */
  exchangeId: string;
  /** Timestamp when block occurred */
  timestamp: number;
}

// -----------------------------------------------------------------------------
// Discussion Session (Persistence)
// -----------------------------------------------------------------------------

export interface DiscussionSession {
  /** Unique session identifier */
  id: string;
  /** Creation timestamp */
  createdAt: number;
  /** Last update timestamp */
  lastUpdatedAt: number;
  /** Number of exchanges in session */
  exchangeCount: number;
  /** Schema version for migration support */
  schemaVersion: 1;
}

// -----------------------------------------------------------------------------
// Transcript (Append-Only Record)
// -----------------------------------------------------------------------------

export type TranscriptRole = 'user' | 'gpt' | 'claude' | 'gemini';

export interface TranscriptEntry {
  /** Reference to the exchange this entry belongs to */
  exchangeId: string;
  /** Role of the speaker */
  role: TranscriptRole;
  /** Exact verbatim content */
  content: string;
  /** Timestamp when this entry was created */
  timestamp: number;
}

// -----------------------------------------------------------------------------
// Key-Notes (Compaction Memory)
// -----------------------------------------------------------------------------

/**
 * Structured memory from compacted exchanges.
 * Preserves reasoning, decisions, and context across compaction cycles.
 */
export interface KeyNotes {
  /** Key decisions made during discussion */
  decisions: string[];
  /** Reasoning chains and thought processes */
  reasoningChains: string[];
  /** Points of agreement between participants */
  agreements: string[];
  /** Constraints and limitations identified */
  constraints: string[];
  /** Unresolved questions for future discussion */
  openQuestions: string[];
}

/**
 * System message for inline notifications (compaction, etc.)
 */
export interface SystemMessage {
  id: string;
  type: 'compaction';
  message: string;
  timestamp: number;
}

// -----------------------------------------------------------------------------
// Carryover (Discussion → Project Transfer)
// -----------------------------------------------------------------------------

/**
 * Carryover data from Discussion to Project mode.
 * Contains keyNotes + last 10 exchanges for context continuity.
 */
export interface Carryover {
  /** Schema version for migration support */
  schemaVersion: 1;
  /** Source discussion session ID */
  fromSessionId: string;
  /** Key-notes from discussion (may be null if no compaction occurred) */
  keyNotes: KeyNotes | null;
  /** Last 10 exchanges from discussion (strict slice) */
  last10Exchanges: Exchange[];
  /** Timestamp when carryover was created */
  createdAt: number;
}

// -----------------------------------------------------------------------------
// Brain State (Phase 2 — Mode + Execution Loop)
// -----------------------------------------------------------------------------

export interface BrainState {
  exchanges: Exchange[];
  pendingExchange: PendingExchange | null;
  currentAgent: Agent | null;
  isProcessing: boolean;
  userCancelled: boolean;
  warningState: WarningState | null;
  error: string | null;
  clearBoardVersion: number;
  /** Loop state (Phase 2C — Project mode only) */
  loopState: LoopState;
  /** Latest Claude Code execution result artifact (Phase 2C) */
  resultArtifact: string | null;
  /** Persisted CEO execution prompt for Executor Panel (Phase 2D) */
  ceoExecutionPrompt: string | null;
  /** Discussion session metadata (persistence) */
  discussionSession: DiscussionSession | null;
  /** Full transcript (append-only, Discussion mode) */
  transcript: TranscriptEntry[];
  /** Key-notes memory from compacted exchanges (Discussion mode) */
  keyNotes: KeyNotes | null;
  /** System messages for inline notifications */
  systemMessages: SystemMessage[];
  /** Carryover data from Discussion to Project mode */
  carryover: Carryover | null;
  /** Project mode: Error message from ghost orchestrator (STEP 3-4) */
  projectError: string | null;
  /** Project mode: Last user intent sent to ghost orchestrator (STEP 3-4) */
  lastProjectIntent: string | null;
  /** Project mode: Ghost orchestrator output (STEP 3-4) */
  ghostOutput: string | null;
  /** Project mode: Full run state (phase machine) */
  projectRun: ProjectRun | null;
  /** Discussion mode: CEO's finalized Claude Code prompt artifact */
  discussionCeoPromptArtifact: CeoPromptArtifact | null;
  /** Decision mode: CEO-only clarification lane state */
  clarificationState: ClarificationState | null;
  /** Decision mode: Session blocking state (invalid CEO output) */
  decisionBlockingState: DecisionBlockingState | null;
  /** Decision mode: CEO-only routing toggle (skip Gemini+Claude when enabled) */
  ceoOnlyModeEnabled: boolean;
  /** Active project state (ProjectState Persistence) */
  activeProject: ProjectState | null;
  /** Decision mode: Epoch state machine (Batch 4+) */
  decisionEpoch: DecisionEpoch | null;
}

// -----------------------------------------------------------------------------
// Brain Actions (Reducer) — runId-guardable where sequence context applies
// -----------------------------------------------------------------------------

export type BrainAction =
  | { type: 'SUBMIT_START'; runId: string; userPrompt: string }
  | { type: 'AGENT_STARTED'; runId: string; agent: Agent }
  | { type: 'AGENT_COMPLETED'; runId: string; response: AgentResponse }
  | { type: 'SEQUENCE_COMPLETED'; runId: string }
  | { type: 'CANCEL_REQUESTED'; runId: string }
  | { type: 'CANCEL_COMPLETE'; runId: string }
  | { type: 'SET_WARNING'; runId: string; warning: WarningState | null }
  | { type: 'CLEAR' }
  | { type: 'START_EXECUTION_LOOP'; intent?: string }
  | { type: 'STOP_EXECUTION_LOOP' }
  | { type: 'PAUSE_EXECUTION_LOOP' }
  | { type: 'SET_RESULT_ARTIFACT'; artifact: string | null }
  | { type: 'CEO_DONE_DETECTED' }
  | { type: 'SET_CEO_EXECUTION_PROMPT'; prompt: string | null }
  | { type: 'REHYDRATE_DISCUSSION'; session: DiscussionSession; exchanges: Exchange[]; transcript: TranscriptEntry[]; keyNotes: KeyNotes | null }
  | { type: 'COMPACTION_COMPLETED'; keyNotes: KeyNotes; trimmedExchanges: Exchange[] }
  | { type: 'CREATE_CARRYOVER_FROM_DISCUSSION' }
  | { type: 'CLEAR_CARRYOVER' }
  | { type: 'PROJECT_GHOST_SUCCESS'; content: string }
  | { type: 'PROJECT_GHOST_FAILED'; error: string }
  | { type: 'PROJECT_RESET_ERROR' }
  // Project Phase Machine Actions
  | { type: 'PROJECT_START_EPOCH'; intent: string }
  | { type: 'PROJECT_SET_PHASE'; phase: ProjectPhase }
  | { type: 'PROJECT_ADD_INTERRUPT'; interrupt: Omit<ProjectInterrupt, 'id' | 'timestamp' | 'processed'> }
  | { type: 'PROJECT_PROCESS_BLOCKER' }
  | { type: 'PROJECT_SET_CEO_ARTIFACT'; artifact: string }
  | { type: 'PROJECT_SET_EXECUTOR_OUTPUT'; output: string }
  | { type: 'PROJECT_NEW_DIRECTION'; intent: string }
  | { type: 'PROJECT_MARK_DONE' }
  | { type: 'PROJECT_FORCE_FAIL' }
  // Discussion Mode CEO Prompt Artifact
  | { type: 'SET_DISCUSSION_CEO_PROMPT_ARTIFACT'; artifact: CeoPromptArtifact }
  // Decision Mode CEO Clarification Lane
  | { type: 'START_CLARIFICATION'; questions: string[] }
  | { type: 'CLARIFICATION_USER_MESSAGE'; content: string }
  | { type: 'CLARIFICATION_CEO_STARTED' }
  | { type: 'CLARIFICATION_CEO_RESPONSE'; content: string }
  | { type: 'RESOLVE_CLARIFICATION'; memo: DecisionMemo }
  | { type: 'CANCEL_CLARIFICATION' }
  // Decision Mode CEO Hard Gate
  | { type: 'DECISION_BLOCK_SESSION'; reason: string; exchangeId: string }
  | { type: 'DECISION_UNBLOCK_SESSION' }
  // Decision Mode CEO-Only Toggle
  | { type: 'SET_CEO_ONLY_MODE'; enabled: boolean }
  // ProjectState Persistence
  | { type: 'CREATE_PROJECT'; projectId: string; title?: string }
  | { type: 'REHYDRATE_PROJECT'; project: ProjectState }
  | { type: 'APPEND_PROJECT_DECISION'; decision: DecisionRecord }
  | { type: 'SET_PROJECT_BLOCKED'; blocked: boolean; reason?: string }
  | { type: 'CLEAR_PROJECT' }
  // Decision Epoch State Machine (Batch 4)
  | { type: 'EPOCH_START'; intent: string; ceoAgent: Agent; ceoOnlyMode: boolean }
  | { type: 'EPOCH_ADVANCE_PHASE'; phase: DecisionEpochPhase }
  | { type: 'EPOCH_ADVANCE_ROUND' }
  | { type: 'EPOCH_EXTEND_MAX_ROUNDS' }
  | { type: 'EPOCH_COMPLETE'; reason: 'prompt_delivered' | 'blocked' | 'stopped' | 'cancelled' }
  | { type: 'EPOCH_RESET' }
  // Structured Advisor Review (Batch 6)
  | { type: 'EPOCH_SET_ADVISOR_REVIEWS'; reviews: Partial<Record<Agent, ParsedAdvisorReview>> }
  // CEO File Context (Batch 7)
  | { type: 'ADD_PROJECT_FILES'; files: FileEntry[] }
  | { type: 'REMOVE_PROJECT_FILE'; fileId: string }
  | { type: 'CLEAR_PROJECT_FILES' };

// -----------------------------------------------------------------------------
// Brain Events (Logging / Debugging) — 6 variants, contract-locked
// -----------------------------------------------------------------------------

type AgentCompletedEventError = {
  type: 'AGENT_COMPLETED';
  runId: string;
  agent: Agent;
  status: 'error';
  errorCode: ErrorCode;
  timestamp: number;
};

type AgentCompletedEventNonError = {
  type: 'AGENT_COMPLETED';
  runId: string;
  agent: Agent;
  status: 'success' | 'timeout' | 'cancelled' | 'skipped';
  timestamp: number;
};

export type BrainEvent =
  | { type: 'SEQUENCE_START'; runId: string; userPrompt: string; timestamp: number }
  | { type: 'AGENT_STARTED'; runId: string; agent: Agent; timestamp: number }
  | AgentCompletedEventError
  | AgentCompletedEventNonError
  | { type: 'SEQUENCE_CANCELLED'; runId: string; timestamp: number }
  | { type: 'SEQUENCE_TIMEOUT'; runId: string; agent: Agent; timestamp: number }
  | { type: 'SEQUENCE_COMPLETED'; runId: string; timestamp: number };
