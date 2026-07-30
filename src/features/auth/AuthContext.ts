import { createContext } from 'react';

import type { AuthUser, LinkGoogleResult } from '../../repositories/types';

/**
 * `user` is null only while the very first anonymous sign-in is in flight;
 * `status` is what components should branch on.
 */
export interface AuthState {
  status: 'starting' | 'ready' | 'error';
  user: AuthUser | null;
  error: Error | null;
  linkGoogle(): Promise<LinkGoogleResult>;
  switchToGoogleAccount(): Promise<void>;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);
