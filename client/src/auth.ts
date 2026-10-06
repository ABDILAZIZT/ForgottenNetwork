export interface SessionUser {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  role: 'member' | 'moderator' | 'administrator';
  publishingAllowed: boolean;
}

interface AuthClientOptions {
  baseUrl: string;
  developmentToken?: string;
}

export class AuthClient {
  private readonly baseUrl: string;
  private readonly developmentToken: string;

  constructor(options: AuthClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.developmentToken = options.developmentToken || '';
  }

  async getConfiguration() {
    const response = await fetch(`${this.baseUrl}/auth/config`, { credentials: 'include' });
    if (!response.ok) return { enabled: false };
    return (await response.json()) as { enabled: boolean };
  }

  async getSession(): Promise<SessionUser | null> {
    const response = await fetch(`${this.baseUrl}/me`, {
      credentials: 'include',
      headers: this.developmentToken
        ? { Authorization: `Bearer ${this.developmentToken}` }
        : undefined,
    });
    if (response.status === 401) return null;
    if (!response.ok) throw new Error('Could not load the current session');
    return (await response.json()) as SessionUser;
  }

  signIn(returnTo = window.location.pathname + window.location.search) {
    window.location.assign(
      `${this.baseUrl}/auth/login?returnTo=${encodeURIComponent(returnTo || '/')}`,
    );
  }

  async signOut() {
    const response = await fetch(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!response.ok && response.status !== 204) throw new Error('Sign-out failed');
  }
}
