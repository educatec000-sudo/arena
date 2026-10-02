/**
 * Helpers de data.
 * O fuso padrão é o do usuário (America/Sao_Paulo), porque "dia de estudo"
 * é uma noção local — o heatmap e o streak precisam bater com o relógio dele.
 */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Meia-noite na data local do servidor (armazenamos só o dia). */
export function startOfDay(date = new Date()) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Chave YYYY-MM-DD (igual ao formato que o app legado usava no localStorage). */
export function dayKey(date = new Date()) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Diferença inteira de dias entre duas datas (ignora horário). */
export function diffInDays(a, b) {
  return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
}

/** Lista de dias (Date) do mais antigo ao mais recente. */
export function lastDays(count, from = new Date()) {
  const days = [];
  for (let i = count - 1; i >= 0; i -= 1) days.push(addDays(startOfDay(from), -i));
  return days;
}

export function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  return Number(value.toString());
}
