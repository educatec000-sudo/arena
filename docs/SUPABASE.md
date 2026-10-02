# Arena Estudos + Supabase (PostgreSQL gerenciado)

Guia completo para rodar o projeto com o banco na nuvem, no Windows, Linux ou macOS.
Todos os comandos são executados na **raiz do monorepo** (`arena-estudos/`), que é
onde ficam o `.env` e o `prisma/schema.prisma`.

---

## 1. Pegar a string de conexão

No painel: **Project Settings → Database → Connection string**.

| Tipo | Porta | Usar para |
| --- | --- | --- |
| **Session pooler** ✅ | `5432` | API **e** migrações (recomendado) |
| Transaction pooler | `6543` | somente API, com `?pgbouncer=true` |
| Direct connection | `5432` (`db.<ref>.supabase.com`) | migrações, quando a API usa 6543 |

> O app usa **transações interativas** na correção de simulados. O pooler de
> transação (6543) não aceita esse tipo de transação, então o **Session pooler é
> a escolha certa**: uma única URL serve para tudo.

---

## 2. Configurar o `.env` (na raiz)

```bash
DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres?sslmode=require"
DATABASE_URL_TEST="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres?sslmode=require&schema=arena_test"
```

**Regras que mais causam erro:**

1. **URL-encode na senha** — caracteres como `@ # / % : ?` quebram a URL:
   `@` → `%40`, `#` → `%23`, `/` → `%2F`, `%` → `%25`.
2. Sempre **`?sslmode=require`** — o Supabase exige TLS.
3. Se usar a porta **6543**, acrescente `?pgbouncer=true&connection_limit=1`.
4. `DATABASE_URL_TEST` **nunca** deve apontar para o mesmo schema da produção:
   a suíte de testes limpa e recria as tabelas.

Segredos restantes (obrigatórios):

```bash
JWT_ACCESS_SECRET=<openssl rand -base64 48>
JWT_REFRESH_SECRET=<openssl rand -base64 48>
ENCRYPTION_KEY=<64 caracteres hex>   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Instalar e migrar

```bash
npm install                # na raiz: instala backend + frontend + Prisma CLI
npm run db:generate        # gera o Prisma Client
npm run db:migrate:supabase   # aplica as migrações (equivale a `prisma migrate deploy`)
npm run db:seed             # papéis, permissões, provedores de IA e o admin
```

### ❗ Por que `db:migrate:supabase` e não `db:migrate`?

`prisma migrate dev` precisa criar um **shadow database** (para comparar o schema
com as migrações). O Supabase não permite criar bancos, então ele falha com
`Error: P3006 / could not create shadow database`. O `migrate deploy` apenas aplica
as migrações já versionadas — é o caminho correto na nuvem.

Se precisar **criar** uma migração nova:

1. Rode um Postgres local (`docker compose up -d postgres`).
2. Aponte `DATABASE_URL` para ele e rode `npm run db:migrate -- --name sua_mudanca`.
3. Volte a URL do Supabase e rode `npm run db:migrate:supabase`.

### Comandos úteis

```bash
npm run db:status    # mostra quais migrações estão aplicadas
npm run db:studio    # abre o Prisma Studio para inspecionar os dados
```

---

## 4. Importar as questões do app antigo

```bash
npm run legacy:import -- --file ../backup-legado/index.html --dry-run   # confere
npm run legacy:import -- --file ../backup-legado/index.html             # importa
```

O importador é idempotente: pode rodar quantas vezes quiser.

---

## 5. Rodar

```bash
npm run dev          # API em 4000, web em 5173
```

A API **só começa a receber requisições depois de confirmar que o banco responde**
(`waitForDatabase`, até 10 tentativas). Se o projeto Supabase estiver pausado ou a
URL estiver errada, você verá uma mensagem clara em vez de 500 genéricos:

- `P1001` → host/porta inacessíveis (projeto pausado?)
- `P1002` → timeout (cold start, tente de novo)
- `P1000` → usuário/senha inválidos (senha sem URL-encode é a campeã)
- `P1017` → conexão fechada pelo pooler após inatividade

---

## 6. Deploy (frontend, backend e banco separados)

**Banco:** este projeto Supabase (já está pronto).

**Backend** (Render/Railway/Fly/VPS):
```bash
npm ci
npx prisma migrate deploy      # aplica migrações na subida
npm start
```
Variáveis: `NODE_ENV=production`, `DATABASE_URL`, `JWT_*`, `ENCRYPTION_KEY`,
`CORS_ORIGINS=https://seu-frontend`, `PASSWORD_RESET_LOG_LINK=false`,
`APP_WEB_URL=https://seu-frontend`.

**Frontend** (Vercel/Netlify/Cloudflare): `npm run build` → publicar `frontend/dist`.
O app chama apenas `/api` (caminho relativo); configure o proxy do provedor ou use
o `frontend/nginx.conf` incluso.

---

## 7. Checklist de erros comuns

| Sintoma | Causa provável |
| --- | --- |
| `Missing script: "db:migrate"` | você rodou dentro de `backend/`. Volte para a raiz (ou use os scripts `db:*` que agora também existem em `backend/`). |
| `Could not find Prisma Schema` | mesmo caso: o schema está em `arena-estudos/prisma/schema.prisma`. |
| `Environment variable not found: DATABASE_URL` | `.env` na raiz (não em `backend/`). |
| `P1001 Can't reach database` | host/porta errados, IP não liberado ou projeto pausado. |
| `Can't reach database at localhost:5432` | `DATABASE_URL` ainda aponta para o Postgres local. |
| `could not create shadow database` | usou `migrate dev` no Supabase — use `migrate deploy`. |
| `prepared statement already exists` | pooler de transação sem `?pgbouncer=true`. |
| Testes apagando seus dados | `DATABASE_URL_TEST` apontando para o schema errado. |
