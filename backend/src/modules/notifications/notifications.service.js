import { prisma } from '../../database/prisma.js';
import { sendMail } from '../../shared/mailer.js';
import { getReviewSchedule } from '../progress/progress.service.js';
import { logger } from '../../config/logger.js';
import { env } from '../../config/env.js';

/**
 * Notificações por e-mail.
 *
 * Não há scheduler embutido de propósito: em produção você agenda o script
 * `scripts/send-review-reminders.mjs` no cron/Render Cron/GitHub Actions.
 * Assim a infra de filas continua sendo escolha de quem faz o deploy.
 */

const publicUrl = (path) => `${env.server.webUrl}${path}`;

function reviewReminderTemplate(user, schedule) {
  const subject = `Arena Estudos — ${schedule.dueToday} revisões te esperam hoje 🔁`;
  const text =
    `Olá, ${user.name}!\n\n` +
    `Você tem ${schedule.dueToday} questões para revisar hoje pelo método Leitner.\n` +
    `Revisar no dia certo é o que transforma acerto em memória de longo prazo.\n\n` +
    `Abrir revisões: ${publicUrl('/app/treinar?modo=pendentes')}\n\n` +
    `Bons estudos!`;

  const html = `
    <div style="font-family:sans-serif;background:#080b13;color:#e9edf8;padding:24px;border-radius:14px">
      <h2 style="margin:0 0 12px">Arena Estudos</h2>
      <p>Olá, <b>${user.name}</b>!</p>
      <p>Você tem <b>${schedule.dueToday}</b> questões para revisar hoje pelo método Leitner.</p>
      <p>Revisar no dia certo é o que transforma acerto em memória de longo prazo. 🧠</p>
      <p>
        <a href="${publicUrl('/app/treinar?modo=pendentes')}"
           style="background:#4f7dfb;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;display:inline-block">
          Revisar agora
        </a>
      </p>
      <p style="color:#98a4c2;font-size:12px">Você recebe este e-mail porque tem revisões pendentes.</p>
    </div>`;

  return { subject, text, html };
}

/**
 * Envia o lembrete de revisão para quem tem questões vencidas.
 * @returns {{checked:number, sent:number, skipped:number, failed:number}}
 */
export async function sendReviewReminders({ limit = 200 } = {}) {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      blockedAt: null,
      // Só incomoda quem realmente estuda: pelo menos uma resposta.
      answers: { some: {} },
    },
    select: { id: true, name: true, email: true },
    take: limit,
  });

  const result = { checked: users.length, sent: 0, skipped: 0, failed: 0 };

  for (const user of users) {
    try {
      const schedule = await getReviewSchedule(user.id, { limit: 1 });
      if (!schedule.dueToday) {
        result.skipped += 1;
        continue;
      }

      const { subject, text, html } = reviewReminderTemplate(user, schedule);
      await sendMail({ to: user.email, subject, text, html });
      result.sent += 1;
    } catch (err) {
      result.failed += 1;
      logger.error({ err, userId: user.id }, '[notifications] falha ao enviar lembrete');
    }
  }

  logger.info(result, '[notifications] lembretes de revisão processados');
  return result;
}

export default { sendReviewReminders };
