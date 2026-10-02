/** Formatação pt-BR — funções puras, sem dependência de biblioteca. */

export const nf = (value: number, digits = 1) =>
  Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

export const pct = (value: number, digits = 0) => `${nf(value, digits)}%`;

/**
 * Segundos -> "mm:ss" (ou "h:mm:ss" quando passa de uma hora).
 * Simulados podem durar 4h, então horas precisam aparecer.
 */
export function formatClock(totalSeconds: number) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Minutos -> "1h 20min" */
export function formatMinutes(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  return minutes ? `${hours}h ${minutes}min` : `${hours}h`;
}

export function formatDate(input: string | Date) {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleDateString('pt-BR');
}

export function formatDateTime(input: string | Date) {
  const date = typeof input === 'string' ? new Date(input) : input;
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/** Dia da semana curto para o heatmap/gráfico. */
export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const DIFFICULTY_LABEL: Record<string, string> = {
  FACIL: 'Fácil',
  MEDIA: 'Média',
  DIFICIL: 'Difícil',
};

/** Converte a dificuldade do enum do banco para o filtro amigável em pt-BR. */
export const DIFFICULTY_SLUG: Record<string, string> = {
  FACIL: 'facil',
  MEDIA: 'media',
  DIFICIL: 'dificil',
};

export const ORIGIN_LABEL: Record<string, string> = {
  CURATED: 'Banco curado',
  GENERATED: 'Gerador infinito',
  IMPORTED: 'Prova antiga',
  AI: 'Gerada por IA',
};

export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

/**
 * Renderizador de markdown mínimo para as respostas da IA.
 * Cobre o que o persona usa: títulos, listas, negrito, itálico e código inline.
 * NÃO usamos dangerouslySetInnerHTML: as respostas da IA não são confiáveis.
 */
export type MarkdownBlock =
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'paragraph'; text: string };

export function parseMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length) {
      blocks.push({ type: 'list', items: currentList });
      currentList = [];
    }
  };

  String(text || '')
    .split('\n')
    .forEach((rawLine) => {
      const line = rawLine.trimEnd();
      if (!line.trim()) {
        flushList();
        return;
      }
      const heading = line.match(/^#{1,4}\s+(.*)$/);
      if (heading) {
        flushList();
        blocks.push({ type: 'heading', text: heading[1] });
        return;
      }
      const listItem = line.match(/^\s*[-*•]\s+(.*)$/);
      if (listItem) {
        currentList.push(listItem[1]);
        return;
      }
      const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (numbered) {
        currentList.push(numbered[1]);
        return;
      }
      flushList();
      blocks.push({ type: 'paragraph', text: line });
    });

  flushList();
  return blocks;
}

/**
 * Aplica **negrito** e `código` devolvendo partes tipadas
 * (o componente decide como renderizar — sem HTML cru).
 */
export function parseInline(text: string): Array<{ text: string; bold?: boolean; code?: boolean }> {
  const parts: Array<{ text: string; bold?: boolean; code?: boolean }> = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ text: text.slice(lastIndex, match.index) });
    const token = match[0];
    if (token.startsWith('**')) parts.push({ text: token.slice(2, -2), bold: true });
    else parts.push({ text: token.slice(1, -1), code: true });
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex) });
  return parts;
}
