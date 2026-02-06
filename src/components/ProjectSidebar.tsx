// =============================================================================
// The Brain — Multi-AI Sequential Chat System
// Project Sidebar Component (Left Rail)
// =============================================================================

import { useMemo, useCallback } from 'react';
import type { ProjectState } from '../types/brain';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface ProjectSidebarProps {
  /** All saved projects */
  projects: ProjectState[];
  /** Currently active project ID (if any) */
  activeProjectId: string | null;
  /** Callback when user clicks a project to switch */
  onSelectProject: (projectId: string) => void;
  /** Callback when user clicks "New Project" button */
  onNewProject: () => void;
  /** Callback when user deletes a project */
  onDeleteProject: (projectId: string) => void;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Format timestamp to relative date string
 */
function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  // Fallback to date string
  return new Date(timestamp).toLocaleDateString();
}

/**
 * Get status badge info
 */
function getStatusBadge(status: ProjectState['status']): { label: string; className: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', className: 'project-sidebar__status--active' };
    case 'blocked':
      return { label: 'Blocked', className: 'project-sidebar__status--blocked' };
    case 'done':
      return { label: 'Done', className: 'project-sidebar__status--done' };
    default:
      return { label: 'Unknown', className: '' };
  }
}

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export function ProjectSidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onDeleteProject,
}: ProjectSidebarProps): JSX.Element {
  // Memoize sorted projects (already sorted by listProjects, but defensive)
  const sortedProjects = useMemo(() => {
    return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [projects]);

  // Handle delete with confirmation
  const handleDelete = useCallback(
    (e: React.MouseEvent, projectId: string, projectTitle?: string) => {
      e.stopPropagation(); // Don't trigger select
      const displayName = projectTitle || projectId.slice(0, 20);
      if (window.confirm(`Delete project "${displayName}"?`)) {
        onDeleteProject(projectId);
      }
    },
    [onDeleteProject]
  );

  return (
    <aside className="project-sidebar" data-testid="project-sidebar">
      {/* Header */}
      <div className="project-sidebar__header">
        <h3 className="project-sidebar__title">Projects</h3>
        <button
          className="project-sidebar__new-btn"
          onClick={onNewProject}
          title="Start a new project"
          data-testid="new-project-btn"
        >
          + New
        </button>
      </div>

      {/* Project List */}
      <div className="project-sidebar__list" data-testid="project-list">
        {sortedProjects.length === 0 ? (
          <div className="project-sidebar__empty">
            <p>No projects yet.</p>
            <p className="project-sidebar__empty-hint">
              Submit a prompt in Decision mode to create one.
            </p>
          </div>
        ) : (
          sortedProjects.map((project) => {
            const isActive = project.id === activeProjectId;
            const statusBadge = getStatusBadge(project.status);
            const displayTitle = project.title || `Project ${project.id.slice(5, 15)}...`;
            const decisionCount = project.decisions.length;

            return (
              <div
                key={project.id}
                className={`project-sidebar__item ${isActive ? 'project-sidebar__item--active' : ''}`}
                onClick={() => onSelectProject(project.id)}
                data-testid={`project-item-${project.id}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectProject(project.id);
                  }
                }}
              >
                {/* Title Row */}
                <div className="project-sidebar__item-header">
                  <span className="project-sidebar__item-title" title={displayTitle}>
                    {displayTitle}
                  </span>
                  <span className={`project-sidebar__status ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                </div>

                {/* Meta Row */}
                <div className="project-sidebar__item-meta">
                  <span className="project-sidebar__item-date">
                    {formatRelativeDate(project.updatedAt)}
                  </span>
                  <span className="project-sidebar__item-decisions">
                    {decisionCount} decision{decisionCount !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Delete Button */}
                <button
                  className="project-sidebar__delete-btn"
                  onClick={(e) => handleDelete(e, project.id, project.title)}
                  title="Delete project"
                  data-testid={`delete-project-${project.id}`}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
