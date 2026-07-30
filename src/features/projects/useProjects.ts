import { useCallback, useContext, useEffect, useState } from 'react';

import type { ProjectSummary } from '../../domain/types';
import type { NewProject, ProjectRepository } from '../../repositories/types';
import { ProjectsContext } from './ProjectsContext';

export function useProjectRepository(): ProjectRepository {
  const repository = useContext(ProjectsContext);
  if (!repository) {
    throw new Error('useProjectRepository must be used inside <ProjectsProvider>');
  }
  return repository;
}

interface ProjectsState {
  projects: ProjectSummary[];
  loading: boolean;
  error: Error | null;
  create(input: NewProject): Promise<void>;
  remove(id: string): Promise<void>;
}

export function useProjects(): ProjectsState {
  const repository = useProjectRepository();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = repository.subscribeList(
      (next) => {
        setProjects(next);
        setLoading(false);
      },
      (cause) => {
        // A listener error is usually a missing composite index or a rules
        // denial — both silent failures if we only logged them.
        setError(cause);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [repository]);

  // No local state updates after these: the live listener is the single source
  // of truth, so the UI cannot drift from what was actually persisted.
  const create = useCallback(
    async (input: NewProject) => {
      await repository.create(input);
    },
    [repository],
  );

  const remove = useCallback(
    async (id: string) => {
      await repository.remove(id);
    },
    [repository],
  );

  return { projects, loading, error, create, remove };
}
