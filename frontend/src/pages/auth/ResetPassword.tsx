import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, Card, Field, Input } from '@/components/ui';
import { authService } from '@/services/auth.service';
import { ApiRequestError } from '@/services/http';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') || '';

  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (form.password !== form.confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }
    if (!token) {
      setError('Link inválido: token não encontrado na URL.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({ token, password: form.password, confirmPassword: form.confirmPassword });
      navigate('/login', { replace: true, state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Não foi possível redefinir a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="dot">🔐</span>
          <div>
            <h1>Definir nova senha</h1>
            <p className="muted small">Escolha uma senha que você ainda não usou.</p>
          </div>
        </div>

        <Card>
          {!token ? (
            <div className="alert err">
              Este link está incompleto. Volte para a tela de login e peça um novo link de
              recuperação.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="form-grid">
              <Field label="Nova senha" hint="Mínimo 8 caracteres, com letra e número.">
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
              </Field>
              <Field label="Confirmar nova senha">
                <Input
                  type="password"
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  required
                />
              </Field>
              {error && <div className="alert err">{error}</div>}
              <Button type="submit" variant="primary" loading={loading} className="full">
                Salvar nova senha
              </Button>
            </form>
          )}

          <div className="auth-links">
            <Link to="/login">Voltar para o login</Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
