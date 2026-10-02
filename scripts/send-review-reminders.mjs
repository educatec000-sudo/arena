#!/usr/bin/env node
/**
 * Envia o lembrete de revisão ("você tem N questões para revisar hoje").
 *
 * Uso manual:
 *   node scripts/send-review-reminders.mjs
 *
 * Agendado (cron diário às 7h):
 *   0 7 * * * cd /caminho/arena-estudos && node scripts/send-review-reminders.mjs
 *
 * Em produção também pode ser um Render Cron Job, um GitHub Actions schedule
 * ou o próprio cron do servidor.
 */
import { sendReviewReminders } from '../backend/src/modules/notifications/notifications.service.js';
import { disconnectPrisma } from '../backend/src/database/prisma.js';

const result = await sendReviewReminders();
console.log('📬 Lembretes de revisão:', result);

await disconnectPrisma();
process.exit(0);
