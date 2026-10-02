import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ApiRequestError } from '@/services/http';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="dot">🎓</span>
          <div>
            <h1>Arena Estudos</h1>
            <p className="muted small">ALEPA 002/2026 · Fundação CETAP · Cargo 15</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="form-grid">
            <Field label="E-mail">
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                required
              />
            </Field>

            <Field label="Senha">
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>

            {error && <div className="alert err">{error}</div>}

            <Button type="submit" variant="primary" loading={loading} className="full">
              Entrar
            </Button>
          </form>

          <div className="auth-links">
            <Link to="/esqueci-senha">Esqueci minha senha</Link>
            <span className="muted">·</span>
            <Link to="/cadastro">Criar conta grátis</Link>
          </div>
        </Card>

        <p className="tiny muted auth-note">
          Seus dados ficam salvos na sua conta: você pode estudar no celular e continuar no
          computador de onde parou.
        </p>
      </div>
    </div>
  );
}
