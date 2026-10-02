import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Card, Field, Input } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { ApiRequestError } from '@/services/http';

interface FieldErrors {
  [key: string]: string;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const update = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setMessage(null);

    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: 'As senhas não coincidem.' });
      return;
    }

    setLoading(true);
    try {
      await register(form);
      navigate('/app', { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.details?.length) {
        const mapped: FieldErrors = {};
        err.details.forEach((detail) => {
          mapped[detail.field] = detail.message;
        });
        setErrors(mapped);
      }
      setMessage(err instanceof ApiRequestError ? err.message : 'Não foi possível criar sua conta.');
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
            <h1>Criar sua conta</h1>
            <p className="muted small">É grátis e leva menos de um minuto.</p>
          </div>
        </div>

        <Card>
          <form onSubmit={handleSubmit} className="form-grid">
            <Field label="Nome completo" error={errors.name}>
              <Input value={form.name} onChange={update('name')} placeholder="Como devemos te chamar?" required />
            </Field>

            <Field label="E-mail" error={errors.email}>
              <Input type="email" value={form.email} onChange={update('email')} placeholder="voce@email.com" required />
            </Field>

            <Field label="Senha" error={errors.password} hint="Mínimo 8 caracteres, com letra e número.">
              <Input
                type="password"
                value={form.password}
                onChange={update('password')}
                placeholder="••••••••"
                required
              />
            </Field>

            <Field label="Confirmar senha" error={errors.confirmPassword}>
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={update('confirmPassword')}
                placeholder="••••••••"
                required
              />
            </Field>

            {message && <div className="alert err">{message}</div>}

            <Button type="submit" variant="primary" loading={loading} className="full">
              Criar conta
            </Button>
          </form>

          <div className="auth-links">
            <Link to="/login">Já tenho conta</Link>
          </div>
        </Card>

        <p className="tiny muted auth-note">
          Ao criar a conta você concorda com o uso dos seus dados de estudo exclusivamente para
          gerar seu progresso e estatísticas.
        </p>
      </div>
    </div>
  );
}
