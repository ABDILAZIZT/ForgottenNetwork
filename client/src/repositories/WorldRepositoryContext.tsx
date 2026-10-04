import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { WorldRepository } from './types';

const RepositoryContext = createContext<WorldRepository | null>(null);

export function WorldRepositoryProvider({
  repository,
  children,
}: {
  repository: WorldRepository;
  children: ReactNode;
}) {
  return <RepositoryContext.Provider value={repository}>{children}</RepositoryContext.Provider>;
}

export function useWorldRepository() {
  const repository = useContext(RepositoryContext);
  if (!repository) throw new Error('WorldRepositoryProvider is missing');
  return repository;
}
