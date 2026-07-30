import type { ReactNode } from 'react';

import type { ProjectRepository } from '../../repositories/types';
import { ProjectsContext } from './ProjectsContext';

interface Props {
  repository: ProjectRepository;
  children: ReactNode;
}

export function ProjectsProvider({ repository, children }: Props) {
  return <ProjectsContext.Provider value={repository}>{children}</ProjectsContext.Provider>;
}
