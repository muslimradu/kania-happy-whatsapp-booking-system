import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/lib/AuthContext';
import { Spinner } from '@/components/ui/index';

export default function LoginPage() {
  const { login, loading, isAuthenticated } = useAuthContext();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);

  // Sudah login → langsung ke payments
  if (isAuthenticated) {
    navigate('/payments', { replace: true });
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    try {
      await login(username, password);
      navigate('/payments', { replace: true });
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Login gagal');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-100 mb-4">
            <span className="text-3xl">💕</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Kania Happy</h1>
          <p className="text-sm text-gray-500 mt-1">Masuk ke dashboard admin</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="input"
              placeholder="admin"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {err && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
              {err}
            </div>
          )}

          <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
            {loading ? <Spinner size="sm" /> : null}
            Masuk
          </button>
        </form>
      </div>
    </div>
  );
}
