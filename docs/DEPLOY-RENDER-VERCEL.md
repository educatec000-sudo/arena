# Deploy dividido: backend no Render + frontend na Vercel

Guia completo (pt-BR), na ordem em que as coisas precisam acontecer.

```
┌─────────────────────────┐        ┌──────────────────────────┐
│  Vercel (estático)      │        │  Render (Node)           │
│  arena-estudos.vercel…  │  HTTPS │  arena-estudos-api.onr…  │
│  frontend/dist          │───────►│  node backend/src/server │
│  VITE_API_URL aponta    │        │  /api/*  +  /health      │
│  para a API             │        └────────────┬─────────────┘
└─────────────────────────┘                     │
                                                ▼
                                     Postgres do Supabase
```

**Por que dividir?** O plano gratuito do Render tem um limite que a Vercel não
tem: a função serverless da Vercel (Hobby) morre em **60 s**, o que aperta a
cadeia de provedores de IA. No Render o processo fica de pé e aguenta
requisições longas. Em troca, o plano free do Render **dorme** depois de 15 min
sem uso (o primeiro acesso demora ~50 s).

---

## 0. O que mudou no código para esse modo funcionar

Não dá só "apontar o DNS": front e API em domínios diferentes formam um
cenário **cross-site**, e isso quebra cookie e CORS se o código não souber.

| Mudança | Arquivo | Por quê |
|---|---|---|
| `VITE_API_URL` | `frontend/src/services/http.ts` | Antes o frontend chamava `/api` relativo (mesmo domínio). Agora ele aceita a URL absoluta da API. Sem variável, continua `/api`. |
| `COOKIE_SAMESITE` | `backend/src/shared/tokens.js` | `SameSite=Strict` **não é enviado** de vercel.app para onrender.com. Em produção o padrão agora é `none` (+ `Secure`, obrigatório junto). |
| Curinga no CORS | `backend/src/config/security.js` | `CORS_ORIGINS=https://*.vercel.app` libera também os previews de PR, que ganham endereço novo a cada deploy. |
| `credentials: 'include'` | `frontend/src/services/http.ts` | Já existia — é o que faz o navegador mandar o cookie httpOnly para outro domínio. |
| Correção do cadastro de usuário | `frontend/src/pages/admin/AdminUsers.tsx` | Havia um `fetch('/api/users')` direto, sem token e sem a URL da API. Agora passa pelo `adminService`. |

---

## 1. Render — crie o serviço da API

### 1.1. Pelo Blueprint (mais rápido)

O repositório já tem `render.yaml`. No Render:
**New + → Blueprint →** escolha o repositório → ele cria tudo e só pede as
variáveis marcadas como manuais (`DATABASE_URL`, `CORS_ORIGINS`,
`APP_WEB_URL`, `ENCRYPTION_KEY`).

### 1.2. Manual (se preferir)

**New + → Web Service →** conecte o repositório:

| Campo | Valor |
|---|---|
| **Name** | `arena-estudos-api` |
| **Region** | `Oregon (US West)` — menor latência para o Brasil |
| **Branch** | `main` |
| **Root Directory** | *(vazio — a raiz do monorepo)* |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npx prisma generate --schema prisma/schema.prisma` |
| **Start Command** | `node backend/src/server.js` |
| **Plan** | Free (ou Starter, se quiser evitar o "dormir") |
| **Health Check Path** | **`/health`** ← sem isso o Render pinga `/`, recebe 404 e reinicia o serviço |

### 1.3. Variáveis de ambiente no Render

**Environment → Add Environment Variable**

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URL do Supabase (**pooler de sessão, porta 5432**; ou 6543 com `?pgbouncer=true`) |
| `CORS_ORIGINS` | `https://SEU-FRONT.vercel.app` (depois do passo 2 você volta aqui) |
| `APP_WEB_URL` | `https://SEU-FRONT.vercel.app` (sem barra no final) |
| `COOKIE_SAMESITE` | `none` |
| `COOKIE_DOMAIN` | *(deixe vazio)* |
| `JWT_ACCESS_SECRET` | 48 bytes aleatórios (comando abaixo) |
| `JWT_REFRESH_SECRET` | outros 48 bytes aleatórios, diferentes |
| `ENCRYPTION_KEY` | **64 caracteres hexadecimais** |
| `AI_DEFAULT_PROVIDER` | `groq` |
| `AI_TOTAL_BUDGET_MS` | `120000` (no Render não existe o teto de 60 s) |
| `GROQ_API_KEY`, `GEMINI_API_KEY`, `HF_TOKEN` | as suas chaves |

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY
```

Render **não** define `PORT` para você? Define sim (10000). O `env.js` já lê
`PORT`, então não precisa cadastrar.

### 1.4. Migrações (uma vez, da sua máquina)

```powershell
cd D:\arena\arena-estudos
npx prisma migrate deploy
npm run db:seed
```

> Nunca `migrate dev` no Supabase: não há banco *shadow*.
> Se o seu `DATABASE_URL` for o pooler **6543**, rode o `migrate` com a URL direta:
> ```powershell
> $env:DATABASE_URL = "postgresql://postgres.<ref>:<SENHA>@db.<ref>.supabase.co:5432/postgres?sslmode=require"
> npx prisma migrate deploy
> ```

### 1.5. Confira que a API está de pé

```powershell
Invoke-WebRequest https://arena-estudos-api.onrender.com/health | Select-Object -Expand Content
```

Deve responder `{"success":true,"status":"ok","database":"ok"}`.

---

## 2. Vercel — publique o frontend

1. **<https://vercel.com/new>** → importe o repositório.
2. **Root Directory** → clique em *Edit* e escolha **`frontend`**.
   ← É o passo que mais erram: na raiz está o monorepo inteiro.
3. **Framework Preset**: `Vite` (detecta sozinho).
4. **Build Command**: `npm run build` · **Output Directory**: `dist`.
   (Os dois já vêm de `frontend/vercel.json`.)
5. **Environment Variables** — só uma:

   | Variável | Valor |
   |---|---|
   | `VITE_API_URL` | `https://arena-estudos-api.onrender.com/api` |

   ⚠️ Inclua o `/api` no final. ⚠️ **Sem barra no final.**
   ⚠️ Variável `VITE_` muda o bundle: depois de criá-la é preciso **redeploy**
   (Deployments → ⋯ → Redeploy).

6. **Deploy**.

---

## 3. Feche o círculo: libere o CORS

Volte no **Render → Environment** e ajuste:

```
CORS_ORIGINS = https://SEU-FRONT.vercel.app
APP_WEB_URL  = https://SEU-FRONT.vercel.app
```

Dica: use `https://*.vercel.app` para liberar também os previews de PR (o
curinga é suportado pelo `security.js`). Se mudar agora, o Render faz um deploy
automático.

---

## 4. Testando

1. `https://SEU-FRONT.vercel.app/api/health` **não** existe — a API é outra.
   Teste a API direto: `https://arena-estudos-api.onrender.com/health`.
2. Abra o site, faça login.
3. **DevTools → Network**: as chamadas devem ir para `…onrender.com/api/…`
   com status 200 (e não um erro de CORS no console).
4. **DevTools → Application → Cookies**: o cookie `arena_rt` deve estar em
   `onrender.com`, com `SameSite=None` e `Secure`.
5. Deixe o app aberto uns 20 minutos e navegue: a sessão tem que continuar
   (é o refresh automático funcionando cross-site).
6. Chame o tutor de IA e veja qual provedor respondeu.

---

## 5. Problemas conhecidos

| Sintoma | Causa e solução |
|---|---|
| Erro de CORS no console | `CORS_ORIGINS` no Render não contém o endereço exato do site (com `https://`, sem barra final). Ou esqueceu do `VITE_API_URL`. |
| Login funciona mas a sessão cai ao recarregar | Cookie cross-site. Confira `COOKIE_SAMESITE=none` no Render e que o cookie tem `Secure`. Se você setou `COOKIE_DOMAIN`, apague. |
| `VITE_API_URL` ignorado | Variável `VITE_` só vale no **build**. Depois de criá-la: **Redeploy**. |
| Serviço "unhealthy" no Render e reiniciando | **Health Check Path** vazio (Render pinga `/` → 404). Coloque `/health`. |
| Primeira requisição demora ~50 s | Plano free dorme após 15 min. É assim mesmo. Um ping de 10 em 10 min no `/health` resolve (UptimeRobot, cron-job.org). |
| `Prisma Client did not initialize` no build | O Build Command tem que incluir `npx prisma generate`. |
| `Can't reach database server` | `DATABASE_URL` errada, senha sem URL-encode (`@`→`%40`), ou o projeto Supabase pausado. |
| 401 em loop | O refresh não está mandando o cookie. Veja a linha do CORS/cookie acima. |

---

## 6. Quanto tempo leva

| Etapa | Tempo |
|---|---|
| Criar o serviço no Render + primeiro build | 5–8 min |
| Migrações + seed | 1 min |
| Deploy do frontend na Vercel | 1–2 min |
| Ajustar CORS e conferir | 2 min |

---

## 7. Voltar para "tudo na Vercel"

O modo anterior continua no repositório (`api/index.js` + `vercel.json` da raiz,
documentado em `DEPLOY-VERCEL.md`). Para usá-lo: crie o projeto na Vercel com
**Root Directory = raiz** e **não** defina `VITE_API_URL` — o frontend volta a
chamar `/api` relativo. Só escolha um dos dois por vez.
