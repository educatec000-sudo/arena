import { Link } from 'react-router-dom';
import { Button, Card } from '@/components/ui';

export default function NotFound() {
  return (
    <div className="wrap">
      <Card title="🧭 Página não encontrada">
        <p className="muted small">
          O endereço que você tentou abrir não existe ou foi movido.
        </p>
        <div className="row gap-8">
          <Link to="/app">
            <Button variant="primary">Ir para o painel</Button>
          </Link>
          <Link to="/app/treinar">
            <Button>Continuar treinando</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
