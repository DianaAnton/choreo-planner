import { useState } from 'react';
import { Link } from 'react-router';

import type { ProjectSummary } from '../../domain/types';

interface Props {
  projects: ProjectSummary[];
  onDelete(id: string): Promise<void>;
}

export function ProjectList({ projects, onDelete }: Props) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  if (projects.length === 0) {
    return (
      <p className="empty">
        No choreos yet. Create one to start mapping a song into 8-counts.
      </p>
    );
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await onDelete(id);
    } finally {
      setDeleting(null);
      setConfirming(null);
    }
  }

  return (
    <ul className="project-list">
      {projects.map((project) => (
        <li key={project.id} className="card project-list__item">
          <Link to={`/projects/${project.id}`} className="project-list__link">
            <span className="project-list__title">{project.title}</span>
            {project.artist && <span className="muted">{project.artist}</span>}
            <span className="muted small">Edited {formatRelative(project.updatedAt)}</span>
          </Link>

          {confirming === project.id ? (
            <div className="project-list__confirm">
              <span className="small">Delete for good?</span>
              <button
                type="button"
                className="danger"
                onClick={() => handleDelete(project.id)}
                disabled={deleting === project.id}
              >
                {deleting === project.id ? 'Deleting…' : 'Delete'}
              </button>
              <button type="button" className="ghost" onClick={() => setConfirming(null)}>
                Keep
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="ghost"
              onClick={() => setConfirming(project.id)}
              aria-label={`Delete ${project.title}`}
            >
              Delete
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Deliberately coarse — "3 minutes ago" is noise when you are picking a file. */
function formatRelative(timestamp: number, now: number = Date.now()): string {
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;

  return new Date(timestamp).toLocaleDateString();
}
