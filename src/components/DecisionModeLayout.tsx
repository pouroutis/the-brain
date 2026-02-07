// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Decision Mode Layout (Three-Pane: Sidebar + Thread + CEO Prompt + Clarification)
// =============================================================================

import { ExchangeList } from './ExchangeList';
import { CeoPromptPanel } from './CeoPromptPanel';
import { CeoClarificationPanel } from './CeoClarificationPanel';
import { ProjectSidebar } from './ProjectSidebar';
import type {
  Agent,
  BrainMode,
  CeoPromptArtifact,
  ClarificationState,
  DecisionBlockingState,
  Exchange,
  FileEntry,
  PendingExchange,
  ProjectState,
  SystemMessage,
} from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface DecisionModeLayoutProps {
  exchanges: Exchange[];
  pendingExchange: PendingExchange | null;
  currentAgent: Agent | null;
  mode: BrainMode;
  ceo: Agent;
  systemMessages: SystemMessage[];
  ceoPromptArtifact: CeoPromptArtifact | null;
  clarificationState: ClarificationState | null;
  onSendClarificationMessage: (content: string) => void;
  onCancelClarification: () => void;
  /** Warning message when CEO prompt is missing markers */
  ceoPromptWarning: string | null;
  /** Session blocking state (invalid CEO output) */
  blockingState: DecisionBlockingState | null;
  /** Callback to clear board and unblock */
  onClearAndUnblock: () => void;
  /** Callback to retry CEO with reformat instruction */
  onRetryCeoReformat: () => void;
  /** CEO-only routing toggle state */
  ceoOnlyModeEnabled: boolean;
  /** Callback to toggle CEO-only mode */
  onToggleCeoOnlyMode: (enabled: boolean) => void;
  /** CEO questions from last exchange (shown even when toggle is OFF) */
  lastCeoQuestions: string[];
  /** Callback to retry CEO call in clarification (after timeout/error) */
  onRetryCeoClarification: () => void;
  /** All saved projects for sidebar */
  projects: ProjectState[];
  /** Currently active project ID */
  activeProjectId: string | null;
  /** Callback when user selects a project */
  onSelectProject: (projectId: string) => void;
  /** Callback when user clicks New Project */
  onNewProject: () => void;
  /** Callback when user deletes a project */
  onDeleteProject: (projectId: string) => void;
  /** Active project state (for file list) */
  activeProject: ProjectState | null;
  /** Callback to add files to project */
  onAddFiles: (files: FileEntry[]) => void;
  /** Callback to remove a file from project */
  onRemoveFile: (fileId: string) => void;
  /** Callback to clear all project files */
  onClearFiles: () => void;
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function DecisionModeLayout({
  exchanges,
  pendingExchange,
  currentAgent,
  mode,
  ceo,
  systemMessages,
  ceoPromptArtifact,
  clarificationState,
  onSendClarificationMessage,
  onCancelClarification,
  ceoPromptWarning,
  blockingState,
  onClearAndUnblock,
  onRetryCeoReformat,
  ceoOnlyModeEnabled,
  onToggleCeoOnlyMode,
  lastCeoQuestions,
  onRetryCeoClarification,
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  activeProject,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
}: DecisionModeLayoutProps): JSX.Element {
  const isBlocked = blockingState?.isBlocked ?? false;

  return (
    <div className="decision-mode-layout" data-testid="decision-mode-layout">
      {/* Session Blocking Overlay */}
      {isBlocked && (
        <div className="decision-mode-layout__blocking-overlay" data-testid="decision-blocking-overlay">
          <div className="decision-mode-layout__blocking-content">
            <div className="decision-mode-layout__blocking-icon">⛔</div>
            <h3 className="decision-mode-layout__blocking-title">Session Blocked</h3>
            <p className="decision-mode-layout__blocking-reason">{blockingState?.reason}</p>
            <p className="decision-mode-layout__blocking-help">
              CEO must output either a valid Claude Code prompt (with markers) or clarification questions.
            </p>
            <div className="decision-mode-layout__blocking-actions">
              <button
                className="decision-mode-layout__blocking-btn decision-mode-layout__blocking-btn--primary"
                onClick={onRetryCeoReformat}
                data-testid="retry-ceo-reformat-btn"
              >
                Retry CEO (reformat)
              </button>
              <button
                className="decision-mode-layout__blocking-btn decision-mode-layout__blocking-btn--secondary"
                onClick={onClearAndUnblock}
                data-testid="clear-and-retry-btn"
              >
                Clear Board &amp; Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Rail: Project Sidebar */}
      <ProjectSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={onSelectProject}
        onNewProject={onNewProject}
        onDeleteProject={onDeleteProject}
        projectFiles={activeProject?.projectFiles ?? []}
        onAddFiles={onAddFiles}
        onRemoveFile={onRemoveFile}
        onClearFiles={onClearFiles}
      />

      {/* Center Pane: Discussion Thread */}
      <div className="decision-mode-layout__center">
        <ExchangeList
          exchanges={exchanges}
          pendingExchange={pendingExchange}
          currentAgent={currentAgent}
          mode={mode}
          ceo={ceo}
          systemMessages={systemMessages}
        />
      </div>

      {/* Right Pane: CEO Prompt + Clarification */}
      <div className="decision-mode-layout__right">
        <CeoPromptPanel artifact={ceoPromptArtifact} warning={ceoPromptWarning} />
        <CeoClarificationPanel
          clarificationState={clarificationState}
          onSendMessage={onSendClarificationMessage}
          onCancel={onCancelClarification}
          ceoOnlyModeEnabled={ceoOnlyModeEnabled}
          onToggleCeoOnlyMode={onToggleCeoOnlyMode}
          lastCeoQuestions={lastCeoQuestions}
          onRetryCeo={onRetryCeoClarification}
        />
      </div>
    </div>
  );
}
