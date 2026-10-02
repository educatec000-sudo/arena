import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let transporter = null;

/** Cria o transporte SMTP sob demanda (em dev, geralmente não existe). */
function getTransporter() {
  if (transporter) return transporter;
  if (!env.mail.host) return null;
  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
  });
  return transporter;
}

/**
 * Envia e-mail. Sem SMTP configurado (desenvolvimento) o conteúdo vai para o
 * log e a função retorna `delivered: false` — o fluxo continua funcionando.
 */
export async function sendMail({ to, subject, text, html }) {
  const transport = getTransporter();

  if (!transport) {
    logger.info(
      { to, subject, preview: (text || '').slice(0, 400) },
      '[mailer] SMTP não configurado — e-mail simulado no log',
    );
    return { delivered: false, simulated: true };
  }

  const info = await transport.sendMail({
    from: env.mail.from,
    to,
    subject,
    text,
    html,
  });
  logger.info({ to, messageId: info.messageId }, '[mailer] e-mail enviado');
  return { delivered: true, messageId: info.messageId };
}

/** E-mail de redefinição de senha. */
export async function sendPasswordResetEmail(user, rawToken) {
  const link = `${env.server.webUrl}/redefinir-senha?token=${rawToken}`;
  const subject = 'Arena Estudos — redefinição de senha';
  const text =
    `Olá, ${user.name}.\n\n` +
    `Recebemos um pedido para redefinir sua senha.\n` +
    `Use o link abaixo (válido por ${env.mail.passwordResetTtlMinutes} minutos):\n\n${link}\n\n` +
    `Se não foi você, ignore este e-mail: sua senha continuará a mesma.`;
  const html = `
    <div style="font-family:sans-serif;background:#080b13;color:#e9edf8;padding:24px;border-radius:14px">
      <h2 style="margin:0 0 12px">Arena Estudos</h2>
      <p>Olá, <b>${user.name}</b>!</p>
      <p>Recebemos um pedido para redefinir sua senha. O link é válido por
      <b>${env.mail.passwordResetTtlMinutes} minutos</b>.</p>
      <p><a href="${link}" style="background:#4f7dfb;color:#fff;padding:12px 18px;border-radius:10px;text-decoration:none;display:inline-block">Redefinir minha senha</a></p>
      <p style="color:#98a4c2;font-size:12px">Se não foi você, ignore este e-mail.</p>
    </div>`;

  const result = await sendMail({ to: user.email, subject, text, html });

  // Em desenvolvimento imprimimos o link para o dev conseguir testar.
  if (!result.delivered && env.mail.logResetLink) {
    logger.info({ resetLink: link }, '[auth] link de redefinição de senha (desenvolvimento)');
  }
  return { ...result, link: env.mail.logResetLink || !result.delivered ? link : undefined };
}
