import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';

import { barCount, barDurationMs } from '../../domain/time';
import type { Project } from '../../domain/types';
import { useProjectRepository } from '../../features/projects';

/**
 * Placeholder detail screen. The waveform, beat grid, sections and shapes land
 * in Phases 3–6 — see docs/plan.md. It exists now so the project list has
 * somewhere to navigate to, and so the live single-project subscription is
 * exercised early.
 */
export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const repository = useProjectRepository();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);

    return repository.subscribe(projectId, (next) => {
      setProject(next);
      setLoading(false);
    });
  }, [projectId, repository]);

  if (loading) {
    return (
      <main className="shell" aria-busy="true">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="shell">
        <p className="notice">That choreo doesn’t exist, or it isn’t yours.</p>
        <Link to="/">Back to your choreos</Link>
      </main>
    );
  }

  // The sanity check the brief asks for. Until audio is loaded (Phase 3) the
  // duration is unknown, so the count is only shown once there is one.
  const durationMs = project.audio?.durationMs ?? 0;

  return (
    <main className="shell">
      <p>
        <Link to="/">← Your choreos</Link>
      </p>

      <h1>{project.title}</h1>
      {project.artist && <p className="muted">{project.artist}</p>}

      <dl className="stats">
        <div>
          <dt>Tempo</dt>
          <dd>{project.grid.bpm} BPM</dd>
        </div>
        <div>
          <dt>One {project.grid.beatsPerBar}-count</dt>
          <dd>{(barDurationMs(project.grid) / 1000).toFixed(2)}s</dd>
        </div>
        <div>
          <dt>Song</dt>
          <dd>
            {project.audio
              ? `${project.audio.name} · ${barCount(project.grid, durationMs)} eight-counts`
              : 'Not loaded yet'}
          </dd>
        </div>
      </dl>

      <p className="notice">
        The waveform, beat grid, sections and shapes arrive in the next phases.
      </p>
    </main>
  );
}
