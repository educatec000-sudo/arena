# Arena Estudos — ALEPA

Plataforma de estudos para o concurso da **Assembleia Legislativa do Pará (ALEPA)**,
com banco de questões, simulados, caderno de erros, estatísticas de desempenho,
tutor de IA e área administrativa.

Este repositório é a versão **refatorada** do app original (`index.html` de ~2 MB):
a identidade visual e todas as funcionalidades foram preservadas, mas agora existe
uma arquitetura de verdade — **frontend e backend separados, banco PostgreSQL e
dados por usuário no servidor** (nada mais de `localStorage` como fonte de verdade).

---

## 1. O que mudou em relação ao app antigo

| Antes | Agora |
| --- | --- |
| Um único `index.html` com todo o HTML/CSS/JS | Monorepo: `frontend/` (React + TS) e `backend/` (Node + Express) |
| Dados só no `localStorage` do navegador | PostgreSQL + Prisma, com migrações versionadas |
| Sem login | Autenticação completa: cadastro, login, refresh token em cookie httpOnly, recuperação de senha, troca de senha, bloqueio de conta e perfis `ADMIN` / `EDITOR` / `ALUNO` |
| Chaves de IA no navegador | IA **só no backend**, com chaves cifradas (AES-256) e 11 provedores |
| Progresso perdido ao trocar de aparelho | Progresso, erros, favoritos e simulados por usuário no servidor |
| Sem noção de permissão | RBAC por papel + trilha de auditoria |
| — | Testes automatizados (59 no total), health check, rate limiting, Helmet, CORS, logs estruturados |
| — | App instalável (PWA) que abre offline sem conflitar com o banco |

---

## 2. Arquitetura

```
arena-estudos/
├── prisma/
│   ├── schema.prisma          # modelo de dados (36 tabelas)
│   ├── migrations/            # migrações SQL versionadas
│   └── seed/index.js          # papéis, permissões, provedores de IA e 1º admin
├── scripts/
│   └── import-legacy-questions.mjs   # importa as 1.704 questões do index.html antigo
├── backend/                   # API REST — arquitetura por DOMÍNIO (não MVC)
│   └── src/
│       ├── modules/<domínio>/ # cada módulo tem service + controller + routes + validators
│       │   ├── auth/ users/ subjects/ topics/ questions/ simulados/
│       │   ├── progress/ favorites/ error-notebook/ study-sessions/
│       │   └── ai/ admin/
│       ├── shared/            # erros, respostas, tokens, criptografia, auditoria...
│       ├── middleware/        # autenticação, permissão, validação, rate limit
│       ├── config/            # env + segurança
│       └── app.js  server.js
├── frontend/                  # React 18 + TypeScript + Vite
│   └── src/
│       ├── pages/             # telas (Dashboard, Treinar, Simulados, Progresso...)
│       ├── components/        # ui/ (botões, cards, modais) + question/ + charts/
│       ├── layouts/ routes/   # casca do app e roteamento protegido
│       ├── services/          # único lugar que conhece a API (http.ts central)
│       ├── hooks/ contexts/   # estado compartilhado (auth, toasts)
│       ├── types/ utils/      # contratos com o backend e helpers
│       └── styles/global.css  # identidade visual original, reorganizada
└── docker-compose.yml         # PostgreSQL (e opcionalmente api + web)
```

**Regra de ouro do backend:** nenhum “controller gordo” e nenhuma pasta
`controllers/models` global — cada domínio é dono do seu service (regra de
negócio), controller (tradução HTTP) e rotas. **Regra de ouro do frontend:**
componente nenhum faz `fetch` direto; tudo passa por `src/services`.

---

## 3. Pré-requisitos

- **Node.js 20.11+** (testado com 20.20)
- **PostgreSQL 16+** (testado com 17)
- npm 10+

---

## 4. Instalação (do zero)

```bash
git clone <seu-repo> arena-estudos
cd arena-estudos
npm install                 # instala backend + frontend (npm workspaces)
cp .env.example .env        # crie o seu arquivo de variáveis
```

### 4.1 Variáveis de ambiente (`.env`)

As **obrigatórias** para rodar em desenvolvimento:

```bash
NODE_ENV=development
PORT=4000
APP_WEB_URL=http://localhost:5173

DATABASE_URL=postgresql://arena:arena_dev@127.0.0.1:5432/arena_estudos?schema=public
DATABASE_URL_TEST=postgresql://arena:arena_dev@127.0.0.1:5432/arena_estudos_test?schema=public

# Segredos — gere com: openssl rand -base64 48
JWT_ACCESS_SECRET=<segredo longo>
JWT_REFRESH_SECRET=<outro segredo longo>
# Chave AES-256 em hex (64 caracteres):
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64 caracteres hex>

SEED_ADMIN_EMAIL=admin@arenaestudos.local
SEED_ADMIN_PASSWORD=Admin@123456
```

As demais (SMTP, chaves de IA, rate limiting, CORS) estão comentadas no
`.env.example`. **Nunca** versione o `.env` — só o `.env.example`.

### 4.2 PostgreSQL

**Opção A — Docker (recomendado):**
```bash
docker compose up -d postgres
```

**Opção B — PostgreSQL local:**
```bash
sudo -u postgres psql -c "CREATE ROLE arena LOGIN PASSWORD 'arena_dev';"
sudo -u postgres psql -c "CREATE DATABASE arena_estudos OWNER arena;"
sudo -u postgres psql -c "CREATE DATABASE arena_estudos_test OWNER arena;"   # para os testes
```

**Opção C — Supabase (nuvem):**

1. Crie o projeto em <https://supabase.com/dashboard>.
2. Em **Project Settings → Database → Connection string**, copie a URI do
   **Session pooler** (porta **5432**) — ela serve tanto para a API quanto para
   as migrações.
3. Coloque no `.env` da **raiz** (atenção: senha com `@`, `#`, `/` precisa de
   URL-encode, ex.: `@` → `%40`):

```bash
DATABASE_URL="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres?sslmode=require"
DATABASE_URL_TEST="postgresql://postgres.<ref>:<SENHA>@aws-0-<regiao>.pooler.supabase.com:5432/postgres?sslmode=require&schema=arena_test"
```

4. Aplique as migrações com **`deploy`** (não `dev`) e rode o seed:

```powershell
npm run db:generate
npm run db:migrate:deploy   # aplica as migrações já existentes
npm run db:seed
```

> **Cuidados com Supabase**
> - Use `db:migrate:deploy`. O `db:migrate` (`prisma migrate dev`) precisa criar um
>   *shadow database* e o Supabase não permite criar bancos — ele vai falhar.
>   Para criar novas migrações, aponte temporariamente para um Postgres local.
> - `prisma migrate` **não** funciona pelo pooler de transação (porta 6543).
>   Se usar 6543 na API (`?pgbouncer=true&connection_limit=1`), mantenha uma
>   conexão direta (porta 5432) em `DIRECT_URL` para rodar as migrações.
> - Os testes limpam e recriam as tabelas: aponte `DATABASE_URL_TEST` para
>   **outro schema/projeto**, nunca para o banco de produção.
> - O app usa transações interativas em alguns pontos (ex.: correção de
>   simulado), por isso o **Session pooler** é a escolha recomendada.

### 4.3 Migrações + seed

```bash
npm run db:setup          # faz tudo: generate + migrate deploy + seed  ⭐ recomendado
```

Ou passo a passo:

```bash
npm run db:generate       # gera o Prisma Client (obrigatório após mudar o schema)
npm run db:migrate:deploy # aplica as migrações (cria as tabelas)
npm run db:seed           # papéis (ADMIN/EDITOR/ALUNO), permissões, 11 provedores de IA,
                          # 17 conquistas, 2 trilhas de estudo e o admin
```

> ⚠️ **Sempre que você atualizar o projeto (git pull), rode `npm run db:generate`.**
> Sem isso o Prisma Client fica desatualizado e o seed quebra com
> `TypeError: Cannot read properties of undefined (reading 'upsert')`.
> O seed já detecta isso e imprime o comando que falta — mas o `db:setup`
> resolve de uma vez.

Todos esses scripts funcionam tanto na **raiz** quanto dentro de `backend/`.

Saída esperada do seed (resumida): `👤 Admin: admin@arenaestudos.local` e
`⚠️ TROQUE A SENHA DO ADMIN APÓS O PRIMEIRO LOGIN.`

### 4.4 Importar as questões do app antigo

O backup do app original ficou em `~/backup-legado/index.html` (não foi apagado).
O importador lê os `window.__BANCO__`, `window.__EDITAL__` e `window.__TEORIA__`
direto do arquivo, sem precisar de navegador, e é **idempotente** (pode rodar
mais de uma vez):

```bash
# conferir antes (não grava nada)
npm run db:seed:questions -- --dry-run

# importar de verdade (procura ../backup-legado/index.html por padrão)
npm run db:seed:questions

# ou apontando o arquivo (Windows)
npm run db:seed:questions -- --file D:\estudo\index.html
```

Resultado neste ambiente: **1.704 questões, 8.426 alternativas, 14 matérias,
319 assuntos e 63 conteúdos de teoria**.

---

## 5. Rodando

```bash
npm run dev          # sobe API (4000) e web (5173) juntos
# ou, em terminais separados:
npm run dev:api      # backend  -> http://localhost:4000
npm run dev:web      # frontend -> http://localhost:5173
```

- Frontend: **http://localhost:5173**
- API: **http://localhost:4000/api**
- Health check: **http://localhost:4000/api/health** → `{"status":"ok","database":"ok"}`

Em desenvolvimento o Vite faz proxy de `/api` para o backend, então **o navegador
nunca precisa saber o endereço da API** (é assim também em produção, via nginx).

### 5.1 Como testar o login

1. Abra http://localhost:5173
2. Clique em **Criar conta**, preencha nome/e-mail/senha (`Senha@123` serve) →
   você entra direto no painel.
3. Ou entre com o admin criado pelo seed:
   - e-mail: `admin@arenaestudos.local`
   - senha: `Admin@123456`
   - com ele o menu **Administração** aparece na lateral.
4. **Recuperação de senha:** em `/esqueci-senha`, informe o e-mail. Como não há
   SMTP configurado, o link aparece **no corpo da resposta** (e no log do
   servidor) em desenvolvimento; em produção ele é enviado por e-mail e nunca
   volta na resposta.
5. Para testar o fluxo de aluno: `/app/treinar` → filtre uma matéria → responder
   algumas questões → confira `/app/progresso` e `/app/caderno`.

---

## 6. Testes

```bash
npm test             # backend (103) + frontend (28)
npm run test:api     # só o backend
npm run test:web     # só o frontend
```

O backend usa um **banco separado** (`DATABASE_URL_TEST`): antes da suíte ele
roda `prisma db push` + seed, e limpa as tabelas entre os arquivos.

Cobertura mínima exigida pelo plano:

| Arquivo | Cobre |
| --- | --- |
| `tests/auth.test.js` | cadastro, login, senha fraca, e-mail duplicado, refresh, logout, recuperação de senha, ausência de hash na resposta |
| `tests/questions.test.js` | listagem paginada, sorteio sem repetição, gabarito escondido, criação por EDITOR, bloqueio para ALUNO, validação |
| `tests/progress.test.js` | resposta certa/errada, caderno de erros, cálculo de desempenho (50%), fila de revisão, favoritos |
| `tests/simulados.test.js` | criação, gabarito escondido, correção/nota, simulado dos erros, isolamento entre usuários |
| `tests/admin.test.js` | permissões (403 para ALUNO), promoção, bloqueio/desbloqueio, auditoria, soft delete, auto-bloqueio impedido |
| `tests/ai.test.js` | provedores sem expor chave, chat com histórico, erro do provedor → 502, **gerador de questões** (JSON limpo/cercado/inválido), **simulado gerado por IA**, validação |
| `tests/health.test.js` | respostas padronizadas, 404, headers de segurança |
| `tests/gamification.test.js` | XP/nível, conquistas desbloqueadas, ranking por período, nome mascarado, validação |
| `tests/study-tracks.test.js` | listagem com progresso, concluir/desmarcar etapa, idempotência, permissão ADMIN, validação |
| `tests/progress.test.js` (agenda) | revisão espaçada: errada volta para hoje, certa vai para amanhã |

---

## 7. API REST

Tudo sob `/api`, sempre no formato
`{ "success": true, "data": ..., "meta": { ... } }` ou
`{ "success": false, "error": { "message", "code", "details" } }`.

|grupo | rotas |
|---|---|
| `auth` | `POST /register`, `/login`, `/refresh`, `/logout`, `/logout-all`, `/forgot-password`, `/reset-password`, `GET /me`, `PATCH /profile`, `PATCH /settings`, `POST /change-password`, `GET|DELETE /sessions` |
| `users` | `GET /me`, `GET /me/export` (LGPD), `PATCH /me`, `GET /`, `POST /`, `DELETE /:id` |
| `subjects` `topics` | matérias e assuntos (+ `GET /topics/theory`, `POST /topics/theory/:id/read`) |
| `questions` | `GET /`, `GET /session` (sorteia para treinar), `POST /random`, `GET /stats`, `GET /counts`, `POST|PATCH|DELETE` (ADMIN/EDITOR) |
| `simulados` | `POST /`, `GET /`, `GET /:id`, `POST /:id/answer`, `POST /:id/finish`, `POST /:id/abandon`, `DELETE /:id`, `GET /stats` |
| `progress` | `/dashboard`, `/report`, `/overview`, `/evolution`, `/by-subject`, `/by-topic`, `/by-difficulty`, `/review-queue`, **`/review-schedule`** (agenda Leitner), `POST /answer` |
| `favorites` `error-notebook` | favoritos e caderno de erros (`POST /error-notebook/generate-simulado` gera prova com os erros) |
| `study-sessions` | sessões de estudo e tempo cronometrado |
| `ai` | `/providers`, `/chat`, `/study-help`, `/summarize`, `/generate-questions`, `/generate-simulado`, `/suggest-review`, `/conversations`, `/credentials` |
| `gamification` | `GET /me` (XP, nível, conquistas), `GET /ranking?period=7d\|30d\|all&limit=` |
| `study-tracks` | `GET /`, `GET /:slug`, `POST /:slug/items/:itemId/complete` `{done}`, `POST /:slug/reset`; ADMIN/EDITOR: `POST`/`PATCH`/`DELETE /[:id]`, `POST /:id/items`, `DELETE /:id/items/:itemId` |
| `admin` | `/dashboard`, `/users` (+ block, unblock, role), `/logs`, `/roles`, `/content-stats`, `/hardest-questions` |

---

## 8. Segurança

- Senhas com **bcrypt** (custo configurável, padrão 12) — nunca devolvidas em resposta.
- **Access token JWT curto (15 min)** + **refresh token opaco** em cookie
  `httpOnly`/`SameSite`/`Secure` em produção, com apenas o hash (SHA-256) no banco
  e rotação a cada uso.
- Troca de senha e bloqueio de conta **revogam** todas as sessões.
- **Helmet**, CORS restrito por origem, rate limiting global, de auth e de IA.
- Validação de **toda** entrada com Zod (body, query, params) antes do serviço.
- Proteção contra brute force (tentativas por IP/e-mail + bloqueio temporário).
- **Chaves de IA cifradas** (AES-256-GCM) e chamadas exclusivamente pelo backend.
- Trilha de **auditoria** em cada mutação administrativa.

---

## 9. PWA e funcionamento offline

- `manifest.webmanifest` + `sw.js` na pasta `public/`.
- O service worker **nunca cacheia `/api`**: os dados do usuário vivem no Postgres,
  então cachear respostas criaria divergência entre aparelhos.
- O que fica em cache é o *shell* da aplicação (HTML/JS/CSS) — o app abre offline
  e as ações ficam na fila até a conexão voltar.
- O `localStorage` continua existindo **apenas como cache de leitura**
  (`src/utils/storage.ts`), nunca como fonte de verdade.

---

## 10. Deploy (DEV / STAGING / PROD)

Cada ambiente usa o seu próprio `.env` (`.env.development`, `.env.staging`,
`.env.production`) — o código é o mesmo, só mudam as variáveis.

**Backend (API)** — qualquer serviço Node (Render, Railway, Fly, VPS, ECS):
```bash
npm ci
npx prisma migrate deploy     # aplica migrações em produção (nunca db push)
npm start                     # node src/server.js
```
Variáveis críticas em produção: `NODE_ENV=production`, `DATABASE_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `CORS_ORIGINS`
(com o domínio do frontend) e `PASSWORD_RESET_LOG_LINK=false`.

**Frontend (estático)** — Vercel, Netlify, Cloudflare Pages, S3+CDN ou nginx:
```bash
npm run build      # gera frontend/dist
npm run preview    # confere o build localmente
```
O frontend só fala com `/api` (endereço relativo), então em produção o proxy é
feito pelo nginx (já configurado em `frontend/nginx.conf`) ou pelo provedor.

**Banco** — PostgreSQL gerenciado (RDS, Supabase, Neon, Railway). Use sempre
`prisma migrate deploy` (nunca `db push`) e mantenha backups automáticos.

### 10.1 Deploy na Vercel (site + API no mesmo projeto) 🚀

Um único projeto entrega o frontend estático **e** a API Express como função
serverless; o banco continua sendo o seu PostgreSQL (Supabase, Neon, RDS).

```
https://seu-projeto.vercel.app        → frontend/dist (estático)
https://seu-projeto.vercel.app/api/*  → api/index.js (função serverless)
```

Arquivos que fazem isso funcionar: `api/index.js`, `vercel.json`,
`.vercelignore` e os `binaryTargets` do Prisma.

```powershell
# 1) criar as tabelas (da sua máquina, antes do primeiro deploy)
$env:DIRECT_URL = "postgresql://postgres.<ref>:<SENHA>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
npx prisma migrate deploy     # NUNCA migrate dev no Supabase (não há shadow DB)
npm run db:seed

# 2) subir
npm i -g vercel
vercel login
vercel --prod
```

Variáveis obrigatórias no painel da Vercel: `DATABASE_URL`, `DIRECT_URL`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (≥ 32 chars cada), `ENCRYPTION_KEY`
(64 hex), `NODE_ENV=production`. E **deixe `CORS_ORIGINS` e `COOKIE_DOMAIN` em
branco** — front e API no mesmo domínio dispensam os dois.

Guia completo, com a tabela de variáveis, limites do plano Hobby e os erros
conhecidos: **[docs/DEPLOY-VERCEL.md](docs/DEPLOY-VERCEL.md)**.

**Tudo junto com Docker:**
```bash
docker compose --profile app up -d --build   # postgres + api + web
```
- web em `http://localhost:8080`, api em `http://localhost:4000`.

---

## 11. Estado atual do projeto ✔️

- [x] Monorepo frontend/backend/banco, arquitetura modular por domínio
- [x] PostgreSQL + Prisma com migrações versionadas
- [x] Autenticação completa com papéis ADMIN / EDITOR / ALUNO
- [x] 1.704 questões, 319 assuntos e 63 teoria migrados do app antigo
- [x] Deploy em um projeto Vercel (frontend estático + API serverless + Postgres externo)
- [x] Treino, simulados (com timer e correção), caderno de erros, favoritos
- [x] Dashboard de desempenho com gráficos (evolução, por matéria, por assunto, calor)
- [x] **Revisão espaçada (caixas de Leitner)** com agenda "hoje / amanhã / 7 dias" no painel e botão *Revisar agora*
- [x] IA no backend (11 provedores, histórico de conversas, geração de questões)
- [x] Área administrativa (usuários, questões, conteúdo, estatísticas, logs)
- [x] Frontend componentizado em React + TypeScript (build e typecheck limpos)
- [x] **Visual "clássico" do app original**: barra superior fixa (logo, meta do dia,
      contagem regressiva, status da IA) + **abas horizontais** + conteúdo centralizado em 1060 px
- [x] **131 testes** automatizados passando (103 API + 28 web) e CI no GitHub Actions
- [x] **Gamificação** (XP, níveis, 17 conquistas), **ranking** com nome mascarado
- [x] **Trilhas de estudo** com progresso salvo no servidor
- [x] **Lembrete de revisão** por e-mail (script `npm run notify:reviews`, pronto para cron)
- [x] PWA, segurança, health check e arquivos de deploy

## 12. Integração contínua

`.github/workflows/ci.yml` roda a cada push/PR:

- **API**: sobe um PostgreSQL 17, aplica as migrações, confere que o schema não
  divergiu (`prisma migrate diff --exit-code`), roda os 103 testes e o lint;
- **Web**: `tsc -b` + build de produção + os 24 testes;
- **Docker**: build das duas imagens (só em push).

## 13. Banco na nuvem (Supabase)

Veja o guia completo em **[`docs/SUPABASE.md`](docs/SUPABASE.md)**: qual string de
conexão usar, URL-encode da senha, por que `prisma migrate deploy` (e não `dev`)
e a tabela de erros mais comuns.

Resumo: `DATABASE_URL` aponta para o **Session pooler (5432)** e a API só começa a
responder **depois de confirmar que o banco está de pé** (`waitForDatabase`, com
mensagens claras para `P1001/P1002/P1017`).

### Próximos passos sugeridos (fora do escopo desta etapa)
- [ ] Notificações **push** (hoje o lembrete de revisão vai por e-mail)
- [ ] Importação de provas em PDF
- [ ] Mais fluxos de tela cobertos por teste (simulado ponta a ponta)
- [ ] Ranking por matéria e por turma

---

## 14. Gamificação, ranking, trilhas e lembretes

### XP e níveis
O XP é calculado **no servidor** a partir da atividade real — nada de número
guardado no navegador:

| Evento | XP |
| --- | --- |
| Resposta registrada | 2 |
| Resposta **correta** | 3 |
| Simulado concluído | 40 |
| Erro resolvido no caderno | 5 |
| Cada conquista desbloqueada | valor da conquista |

Nível = `floor(sqrt(xp / 60)) + 1` — cresce rápido no começo e vai ficando
difícil, o que segura o ritmo até o dia da prova.

### Conquistas
17 conquistas semeadas (`prisma/seed/index.js`) em 8 critérios
(`answers`, `correct`, `streak`, `simulados`, `accuracy`, `favorites`,
`errorBook`, `minutes`). Conquistas de aproveitamento exigem volume mínimo
(≥ 50 respostas para 60%, ≥ 100 para 80%) para não serem ganhas por acaso.
A concessão acontece dentro de `GET /gamification/me`, que devolve também
`newlyUnlocked` (para o app mostrar o "🎉 nova conquista").

### Ranking
`GET /api/gamification/ranking?period=7d|30d|all&limit=20`.
**Privacidade:** só o primeiro nome + inicial do sobrenome ("Ana S.");
e-mail nunca sai da API.

### Trilhas de estudo
Sequência de etapas (matéria/assunto/teoria) com meta de questões. O aluno
marca cada etapa; o progresso fica em `study_track_progress` (único por
`userId + trackId + itemId`), então continua de onde parou em qualquer aparelho.
Duas trilhas já vêm semeadas: `trilha-base-alepa` (7 etapas) e
`trilha-reta-final` (3 etapas).

### Lembrete de revisão
`sendReviewReminders()` só envia para quem tem pelo menos uma resposta e só
quando existe revisão vencida. Sem SMTP configurado o e-mail é **simulado no
log** (desenvolvimento). Para agendar:

```bash
npm run notify:reviews              # execução manual
# cron diário às 7h:
0 7 * * * cd /caminho/arena-estudos && node scripts/send-review-reminders.mjs
```

Em produção configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e
`MAIL_FROM` (veja `.env.example`); no Render use um Cron Job, no Windows use o
Agendador de Tarefas.
