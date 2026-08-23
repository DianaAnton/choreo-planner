import { useState } from 'react';
import { Link } from 'react-router';

import { AccountBar } from '../../features/auth';
import { CreateProjectForm, ProjectList, useProjects } from '../../features/projects';
import { POLE } from '../registry';

export function ProjectsPage() {
  const { projects, loading, error, create, remove } = useProjects();
  const [creating, setCreating] = useState(false);

  return (
    <main className="shell">
      <header className="page-header">
        <h1>Choreo Planner</h1>
        <AccountBar />
      </header>

      <nav className="tabs" aria-label="Sections">
        <Link to="/">Choreos</Link>
        <Link to="/training">Training</Link>
      </nav>

      {error && (
        <p className="notice notice--error" role="alert">
          Could not load your choreos: {error.message}
        </p>
      )}

      {creating ? (
        <CreateProjectForm
          discipline={POLE.id}
          onCreate={async (input) => {
            await create(input);
            setCreating(false);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          New choreo
        </button>
      )}

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <ProjectList projects={projects} onDelete={remove} />
      )}
    </main>
  );
}
