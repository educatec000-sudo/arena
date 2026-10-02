# Etapa — Gamificação, ranking, trilhas de estudo e lembrete de revisão

Status: **concluída e verificada** (94 testes passando: 70 API + 24 web).

---

## 1. O que foi implementado

### 1.1 Gamificação (XP, níveis e conquistas)
- XP calculado **no servidor** a partir da atividade real.
- 17 conquistas semeadas em 8 critérios (`answers`, `correct`, `streak`,
  `simulados`, `accuracy`, `favorites`, `errorBook`, `minutes`).
- Conquistas de aproveitamento exigem volume mínimo (50 respostas para 60%,
  100 para 80%) para não serem ganhas por acaso.
- A concessão acontece dentro de `GET /gamification/me`, que devolve
  `newlyUnlocked` para o app comemorar na hora.

| Evento | XP |
| --- | --- |
| Resposta registrada | 2 |
| Resposta correta | 3 |
| Simulado concluído | 40 |
| Erro resolvido no caderno | 5 |
| Cada conquista | valor da conquista |

Nível = `floor(sqrt(xp / 60)) + 1`.

Endpoints:
- `GET /api/gamification/me`
- `GET /api/gamification/ranking?period=7d|30d|all&limit=20`
  → **nome mascarado** ("Ana S."), nunca o e-mail.

### 1.2 Trilhas de estudo
- Sequência de etapas (matéria / assunto / teoria) com meta de questões.
- Progresso em `study_track_progress`, único por `userId + trackId + itemId`
  (marcar duas vezes não duplica).
- Duas trilhas semeadas: `trilha-base-alepa` (7 etapas) e
  `trilha-reta-final` (3 etapas).

Endpoints:
- `GET /api/study-tracks` · `GET /api/study-tracks/:slug`
- `POST /api/study-tracks/:slug/items/:itemId/complete` `{ "done": true }`
- `POST /api/study-tracks/:slug/reset`
- ADMIN/EDITOR: `POST|PATCH|DELETE /api/study-tracks[/:id]`,
  `POST /api/study-tracks/:id/items`, `DELETE /api/study-tracks/:id/items/:itemId`

### 1.3 Lembrete de revisão (e-mail)
- `sendReviewReminders()`: só envia para quem tem ≥ 1 resposta e só quando
  existe revisão vencida.
- Sem SMTP o e-mail é **simulado no log** (desenvolvimento).
- Script pronto para cron: `npm run notify:reviews`.

### 1.4 Frontend
- `GamificationCard` (XP/nível/KPIs) e `AchievementsGrid` no **Painel**.
- Cartão da **trilha em andamento** no Painel (4 primeiras etapas).
- Nova página **`/app/ranking`** (7d / 30d / desde o início, sua posição em destaque).
- Nova página **`/app/trilhas`** (checkbox por etapa, barra de progresso,
  link "Treinar →" que abre `/app/treinar?materia=CODIGO`).
- Entradas "🧭 Trilhas" e "🏆 Ranking" no menu lateral.

---

## 2. Arquivos criados/modificados

**Backend (novos)**
```
backend/src/modules/gamification/gamification.service.js
backend/src/modules/gamification/gamification.controller.js
backend/src/modules/gamification/gamification.routes.js
backend/src/modules/gamification/gamification.validators.js
backend/src/modules/study-tracks/study-tracks.service.js
backend/src/modules/study-tracks/study-tracks.controller.js
backend/src/modules/study-tracks/study-tracks.routes.js
backend/src/modules/study-tracks/study-tracks.validators.js
backend/src/modules/notifications/notifications.service.js
backend/src/shared/slug.js
scripts/send-review-reminders.mjs
backend/tests/gamification.test.js
backend/tests/study-tracks.test.js
backend/eslint.config.js          (flat config — o lint estava quebrado no CI)
prisma/migrations/20261001184028_gamificacao_trilhas/
```

**Backend (modificados)**
```
prisma/schema.prisma        + Achievement, UserAchievement, StudyTrack,
                              StudyTrackItem, StudyTrackProgress
prisma/seed/index.js        + 17 conquistas e 2 trilhas (idempotente)
backend/src/app.js          + mount de /gamification e /study-tracks
backend/src/modules/progress/progress.service.js   (groupBy morto removido)
backend/src/modules/simulados/simulados.service.js (var não usada removida)
backend/src/middleware/errorHandler.js             (disable obsoleto removido)
package.json                + script notify:reviews
```

**Frontend**
```
src/services/gamification.service.ts     (novo)
src/services/study-tracks.service.ts     (novo)
src/components/gamification/GamificationCard.tsx   (novo)
src/components/gamification/AchievementsGrid.tsx   (novo)
src/pages/Ranking.tsx                    (novo)
src/pages/Trilhas.tsx                    (novo)
src/test/gamification.test.tsx           (novo, 4 testes)
src/types/index.ts                       + Achievement, Gamification, RankingEntry, StudyTrack
src/routes/index.tsx                     + /app/trilhas e /app/ranking
src/layouts/AppLayout.tsx                + itens de menu
src/pages/Dashboard.tsx                  + card de XP e grade de conquistas
src/pages/Train.tsx                      + aceita ?materia=CODIGO
src/styles/global.css                    + .track-list e .table
```

**Documentação**
```
README.md        seções 6, 7, 11 e nova seção 14
.env.example     + DB_CONNECT_RETRIES, DB_CONNECT_RETRY_DELAY_MS
```

---

## 3. Comandos (Windows/PowerShell, a partir de `D:\arena-estudos`)

```powershell
# 1) dependências (só na 1ª vez ou quando o package.json mudar)
npm install

# 2) aplicar a nova migration no seu Postgres/Supabase
npm run db:migrate:deploy          # use SEMPRE este (não o db:migrate)
npm run db:seed                    # cria as 17 conquistas e as 2 trilhas

# 3) subir
npm run dev                        # API :4000 + web :5173

# 4) testes, lint e build
npm test                           # 94 testes (70 API + 24 web)
npm run lint --workspace backend
npm run build --workspace frontend
```

### Novas variáveis de ambiente

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `DB_CONNECT_RETRIES` | `10` | tentativas ao esperar o banco acordar |
| `DB_CONNECT_RETRY_DELAY_MS` | `2000` | intervalo entre as tentativas |

(As duas já estão no `.env.example` e no `.env` do sandbox — opcionais.)

---

## 4. Como testar

```bash
# login
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"SEU_EMAIL","password":"SUA_SENHA"}'

# XP / nível / conquistas
curl http://localhost:4000/api/gamification/me -H "Authorization: Bearer <TOKEN>"

# ranking (nome mascarado)
curl "http://localhost:4000/api/gamification/ranking?period=30d&limit=10" \
  -H "Authorization: Bearer <TOKEN>"

# trilhas + concluir uma etapa
curl http://localhost:4000/api/study-tracks -H "Authorization: Bearer <TOKEN>"
curl -X POST http://localhost:4000/api/study-tracks/trilha-base-alepa/items/<ITEM_ID>/complete \
  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"done":true}'

# lembrete de revisão (sem SMTP, imprime no log)
npm run notify:reviews
```

Navegador: `http://localhost:5173` → **Painel** (cartão de XP + conquistas) →
**🧭 Trilhas** e **🏆 Ranking** no menu.

---

## 5. Correções feitas no caminho

1. `GET /gamification/me` devolvia **400**: o serviço consultava
   `DailyStat._sum.minutesStudied` (campo inexistente — o correto é `minutes`)
   e `StudySession.plannedMinutes` (também inexistente). O 400 vinha do
   `PrismaClientValidationError` traduzido pelo `errorHandler`. Corrigido.
2. **Ranking sem validação** de `period`/`limit` → agora há
   `gamification.validators.js` (zod) e período inválido devolve 422.
3. **Lint quebrado no CI**: não existia `eslint.config.js` (ESLint 9 exige
   flat config). Criado; também removidos dois `const` mortos que o lint pegou.

---

## 6. O que ainda falta (fora desta etapa)

- Notificação **push** (hoje o lembrete é só e-mail).
- Ranking por matéria / por turma.
- Importação de provas em PDF.
- Teste ponta a ponta do simulado no frontend.
