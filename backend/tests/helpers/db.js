import { randomBytes } from 'node:crypto';
import { prisma } from '../../src/database/prisma.js';

/** Zera apenas o que os testes escrevem (o seed estrutural é preservado). */
export async function cleanDatabase() {
  // Ordem: primeiro as tabelas dependentes, depois as principais.
  await prisma.answer.deleteMany();
  await prisma.questionNote.deleteMany();
  await prisma.errorNotebookItem.deleteMany();
  await prisma.favorite.deleteMany();
  await prisma.simuladoResult?.deleteMany();
  await prisma.simuladoQuestion.deleteMany();
  await prisma.simuladoFilter?.deleteMany();
  await prisma.simulado.deleteMany();
  await prisma.studySession.deleteMany();
  await prisma.dailyStat.deleteMany();
  await prisma.userProgress.deleteMany();
  await prisma.aiMessage.deleteMany();
  await prisma.aiConversation.deleteMany();
  await prisma.aiGeneratedBatch?.deleteMany();
  await prisma.aiUserCredential.deleteMany();
  await prisma.theoryProgress.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.passwordResetToken.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.userAchievement?.deleteMany();
  await prisma.studyTrackProgress?.deleteMany();
  await prisma.studyTrackItem?.deleteMany();
  await prisma.studyTrack?.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.userSetting.deleteMany();
  await prisma.user.deleteMany();
  await prisma.questionOption.deleteMany();
  await prisma.questionTag?.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.question.deleteMany();
  await prisma.theoryItem.deleteMany();
  await prisma.topic.deleteMany();
  await prisma.subject.deleteMany();
}

/** Cria a questão a partir de uma falsa e-mail. */
export const uniqueEmail = () => `teste-${randomBytes(6).toString('hex')}@arena.test`;

/** Cria uma matéria de teste. */
export async function createSubject(code = 'TEST') {
  return prisma.subject.create({
    data: { code, name: `Matéria ${code}`, groupName: 'Testes', color: '#4f7dfb' },
  });
}

/** Cria uma questão de teste com `correctIndex` correta. */
export async function createQuestion(subjectId, correctIndex = 0, extra = {}) {
  return prisma.question.create({
    data: {
      subjectId,
      prompt: `Enunciado de teste ${randomBytes(4).toString('hex')}?`,
      explanation: 'Explicação de teste',
      difficulty: 'MEDIA',
      origin: 'CURATED',
      ...extra,
      options: {
        create: ['A', 'B', 'C', 'D'].map((label, index) => ({
          label,
          text: `Alternativa ${label}`,
          order: index,
          isCorrect: index === correctIndex,
        })),
      },
    },
    include: { options: true },
  });
}

export { prisma };
