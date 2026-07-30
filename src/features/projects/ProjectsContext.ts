import { createContext } from 'react';

import type { ProjectRepository } from '../../repositories/types';

/**
 * The repository is injected rather than imported so this feature never reaches
 * Firebase directly, and so tests can swap in InMemoryProjectRepository.
 */
export const ProjectsContext = createContext<ProjectRepository | null>(null);
