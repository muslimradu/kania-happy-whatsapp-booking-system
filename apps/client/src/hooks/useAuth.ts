import { useState, useCallback } from 'react';
import { api, saveToken, clearToken, getToken, getUsername } from '@/lib/api';
import type { LoginResponse } from '@/types/api';

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => !!getToken());
  const [username, setUsername] = useState<string | null>(() => getUsername());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (user: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<LoginResponse>('/auth/login', { username: user, password });
      saveToken(data.token, data.username);
      setIsAuthenticated(true);
      setUsername(data.username);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login gagal';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setIsAuthenticated(false);
    setUsername(null);
  }, []);

  return { isAuthenticated, username, loading, error, login, logout };
}
