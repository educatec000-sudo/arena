import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Field, Input } from '@/components/ui';
import { authService } from '@/services/auth.service';
import { ApiRequestError } from '@/services/http';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authService.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Não foi possível enviar o link.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="dot">🔑</span>
          <div>
            <h1>Recuperar senha</h1>
            <p className="muted small">Enviaremos um link de redefinição para o seu e-mail.</p>
          </div>
        </div>

        <Card>
          {sent ? (
            <div className="alert ok">
              <b>Verifique sua caixa de entrada.</b>
              <p className="small" style={{ margin: '6px 0 0' }}>
                Se o e-mail estiver cadastrado, você receberá o link em instantes. Ele vale por 60
                minutos.
              </p>
              {devLink && (
                <p className="tiny muted" style={{ marginTop: 8 }}>
                  (ambiente de desenvolvimento) link:{' '}
                  <a href={devLink} onClick={() => setDevLink(null)}>
                    abrir
                  </a>
                </p>
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="form-grid">
              <Field label="E-mail da sua conta">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  required
                />
              </Field>
              {error && <div className="alert err">{error}</div>}
              <Button type="submit" variant="primary" loading={loading} className="full">
                Enviar link
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
