import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Modal, Select, Spinner, Textarea } from '@/components/ui';
import { AiAnswer } from '@/components/question/StudySessionRunner';
import { useToast } from '@/contexts/ToastContext';
import { aiService } from '@/services/ai.service';
import { subjectsService, topicsService } from '@/services/questions.service';
import type { AiCredential } from '@/types';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  model?: string | null;
}

/**
 * Tutor de IA.
 * As chaves nunca aparecem aqui: o frontend só escolhe o provedor e o modelo.
 */
export default function AiTutor() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [configOpen, setConfigOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { data: credentials = [], isLoading: loadingCredentials } = useQuery<AiCredential[]>({
    queryKey: ['ai-credentials'],
    queryFn: () => aiService.credentials(),
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ['subjects'],
    queryFn: () => subjectsService.list(),
    staleTime: 10 * 60_000,
  });

  const [genSubject, setGenSubject] = useState('');
  const { data: topics = [] } = useQuery({
    queryKey: ['topics', genSubject],
    queryFn: async () => {
      const found = subjects.find((s) => s.code === genSubject);
      return found ? topicsService.list(found.id) : [];
    },
    enabled: Boolean(genSubject),
  });
  const [genTopic, setGenTopic] = useState('');
  const [genCount, setGenCount] = useState(5);

  /**
   * Provedores realmente utilizáveis agora:
   *  - o usuário cadastrou a própria chave e ela está ativa; OU
   *  - o servidor tem chave própria para aquele provedor.
   * Antes só valia o primeiro caso, e o tutor pedia chave mesmo com o servidor
   * já configurado.
   */
  const ready = credentials.filter((item) => item.isEnabled || item.hasServerKey);
  const selected = credentials.find((item) => item.key === provider);

  // Escolhe automaticamente o primeiro provedor utilizável.
  useEffect(() => {
    if (!provider && ready.length) {
      setProvider(ready[0].key);
      setModel(ready[0].model || '');
    }
  }, [provider, ready]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const chatMutation = useMutation({
    mutationFn: () =>
      aiService.chat({
        messages: messages.map(({ role, content }) => ({ role, content })),
        provider: provider || undefined,
        model: model || undefined,
        conversationId: conversationId || undefined,
      }),
    onSuccess: (result) => {
      setConversationId(result.conversationId);
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: result.content, model: result.model },
      ]);
      if (result.fallback) {
        toast(`${result.fallback.from} falhou — respondido por ${result.provider}.`, 'info');
      }
      queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setMessages((current) => [...current, { role: 'user', content: text }]);
    setInput('');
    // O mutation lê `messages` atualizado no próximo render.
    setTimeout(() => chatMutation.mutate(), 0);
  };

  const generateQuestions = useMutation({
    mutationFn: () =>
      aiService.generateQuestions({
        subjectId: subjects.find((s) => s.code === genSubject)!.id,
        topicId: genTopic || undefined,
        count: genCount,
        provider: provider || undefined,
      }),
    onSuccess: (result) => {
      const skipped = result.skipped || 0;
      if (result.fallback) {
        toast(
          `${result.fallback.from} falhou — as questões vieram de ${result.provider}.`,
          'info',
        );
      }
      toast(
        skipped
          ? `${result.created} ${result.created === 1 ? 'questão gerada' : 'questões geradas'}. `
            + `${skipped} ${skipped === 1 ? 'foi descartada' : 'foram descartadas'} por já existir `
            + 'no banco (a IA repetiu o que você já tem).'
          : `${result.created} questões geradas e adicionadas ao banco!`,
        skipped ? 'info' : 'success',
      );
      queryClient.invalidateQueries({ queryKey: ['bank-stats'] });
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  if (loadingCredentials) return <Spinner label="Carregando configurações de IA..." />;

  if (!ready.length) {
    return (
      <div className="wrap">
        <Card title="🤖 Tutor de IA">
          <p className="muted small">
            Nenhum provedor está pronto para uso. Você pode cadastrar a sua própria chave (ela fica
            cifrada no servidor e nunca aparece no navegador) ou pedir ao administrador para
            configurar a chave do servidor no <code>.env</code> do backend.
          </p>
          <Button variant="primary" onClick={() => setConfigOpen(true)}>
            Configurar minha chave de IA
          </Button>
        </Card>
        <AiSettingsModal open={configOpen} onClose={() => setConfigOpen(false)} />
      </div>
    );
  }

  return (
    <div className="wrap">
      <Card
        title="🤖 Tutor de IA"
        subtitle="Tire dúvidas, peça explicações, resumos e questões inéditas — tudo no estilo da banca."
        action={
          <Button size="sm" variant="ghost" onClick={() => setConfigOpen(true)}>
            ⚙ Configurar
          </Button>
        }
      >
        <div className="grid c2">
          <Field label="Provedor">
            <Select
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value);
                const found = credentials.find((item) => item.key === event.target.value);
                setModel(found?.model || '');
              }}
            >
              {ready.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                  {item.isFree ? ' (grátis)' : ''}
                  {!item.hasKey && item.hasServerKey ? ' · chave do servidor' : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Modelo"
            hint={selected?.hasKey ? 'usando sua chave' : 'usando a chave do servidor'}
          >
            <input
              className="input"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={selected?.model || 'modelo padrão'}
            />
          </Field>
        </div>

        <div className="chat" ref={bottomRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <p className="muted small">Sugestões para começar:</p>
              <div className="row gap-6">
                {[
                  'Explique a diferença entre decreto legislativo e resolução.',
                  'Como funciona o quórum de aprovação de emenda constitucional?',
                  'Resuma os princípios da administração pública.',
                  'Monte um roteiro de 7 dias focado em Direito Administrativo.',
                ].map((suggestion) => (
                  <Button key={suggestion} size="sm" onClick={() => setInput(suggestion)}>
                    {suggestion.slice(0, 42)}…
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div key={index} className={message.role === 'user' ? 'chat-msg user' : 'chat-msg bot'}>
              {message.role === 'assistant' ? (
                <AiAnswer text={message.content} />
              ) : (
                <p>{message.content}</p>
              )}
              {message.model && <span className="tiny muted">{message.model}</span>}
            </div>
          ))}

          {chatMutation.isPending && (
            <div className="chat-msg bot">
              <p className="muted small">O professor está escrevendo...</p>
            </div>
          )}
        </div>

        <div className="chatbar">
          <Textarea
            rows={2}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder="Escreva sua dúvida (Enter envia, Shift+Enter quebra linha)"
          />
          <Button variant="primary" loading={chatMutation.isPending} onClick={send}>
            Enviar
          </Button>
        </div>
      </Card>

      <Card title="✨ Gerar questões inéditas com IA">
        <p className="muted small">
          A IA cria questões no estilo da banca e elas entram no seu banco pessoal, prontas para
          treinar e revisar.
        </p>
        <div className="grid c3">
          <Field label="Matéria">
            <Select value={genSubject} onChange={(event) => { setGenSubject(event.target.value); setGenTopic(''); }}>
              <option value="">Escolha a matéria</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.code}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assunto (opcional)">
            <Select value={genTopic} onChange={(event) => setGenTopic(event.target.value)} disabled={!topics.length}>
              <option value="">Todos os assuntos</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantidade">
            <Select value={String(genCount)} onChange={(event) => setGenCount(Number(event.target.value))}>
              {[3, 5, 10, 15, 20].map((value) => (
                <option key={value} value={value}>
                  {value} questões
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="row gap-8" style={{ marginTop: 12 }}>
          <Button
            variant="primary"
            loading={generateQuestions.isPending}
            disabled={!genSubject}
            onClick={() => generateQuestions.mutate()}
          >
            ✨ Gerar questões
          </Button>
          {selected && <Badge tone={selected.isFree ? 'ok' : 'warn'}>{selected.name}</Badge>}
        </div>
      </Card>

      <AiSettingsModal open={configOpen} onClose={() => setConfigOpen(false)} />
    </div>
  );
}

/** Modal de configuração das chaves de IA. */
function AiSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();

  const { data: credentials = [] } = useQuery<AiCredential[]>({
    queryKey: ['ai-credentials'],
    queryFn: () => aiService.credentials(),
    enabled: open,
  });

  const [form, setForm] = useState<Record<string, { apiKey: string; model: string; baseUrl: string }>>({});

  const saveMutation = useMutation({
    mutationFn: (payload: { provider: string; apiKey?: string; model?: string; baseUrl?: string }) =>
      aiService.saveCredential(payload),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-credentials'] });
      toast(`${variables.provider} configurado com sucesso.`);
      setForm((current) => ({ ...current, [variables.provider]: { apiKey: '', model: '', baseUrl: '' } }));
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  /**
   * "Testar" salva primeiro: se a pessoa acabou de digitar a chave/URL e
   * clicar em testar direto, o backend testaria o que está no banco (ainda
   * vazio) e devolveria um erro sem sentido.
   */
  const testMutation = useMutation({
    mutationFn: async (providerKey: string) => {
      const value = form[providerKey];
      const credential = credentials.find((item) => item.key === providerKey);
      const hasChange =
        value && (value.apiKey || value.model || (value.baseUrl && value.baseUrl !== credential?.baseUrl));

      if (hasChange) {
        await aiService.saveCredential({
          provider: providerKey,
          apiKey: value.apiKey || undefined,
          model: value.model || credential?.model || undefined,
          baseUrl: value.baseUrl || credential?.baseUrl || undefined,
        });
        queryClient.invalidateQueries({ queryKey: ['ai-credentials'] });
      }
      return aiService.testCredential(providerKey);
    },
    onSuccess: (result) =>
      result.ok ? toast('Chave válida! ✅') : toast(`Falhou: ${result.error}`, 'error'),
    onError: (err: Error) => toast(err.message, 'error'),
  });

  return (
    <Modal open={open} title="🔑 Configurar provedores de IA" onClose={onClose} size="lg">
      <p className="muted small">
        Suas chaves são cifradas (AES-256) antes de serem gravadas e nunca são devolvidas para o
        navegador. Se deixar uma chave em branco, o servidor usa a chave própria, quando houver.
      </p>

      <div className="provider-list">
        {credentials.map((credential) => {
          const value = form[credential.key] || { apiKey: '', model: '', baseUrl: '' };
          return (
            <div key={credential.key} className="provider-item">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <b>
                  {credential.name} {credential.isFree && <Badge tone="ok">grátis</Badge>}
                </b>
                <span className="tiny muted">
                  {credential.hasKey ? '🔑 chave própria salva' : credential.hasServerKey ? '☁️ usa a do servidor' : 'sem chave'}
                </span>
              </div>

              <div className="grid c2" style={{ marginTop: 8 }}>
                <Field label="Chave da API">
                  <input
                    className="input"
                    type="password"
                    value={value.apiKey}
                    placeholder={credential.hasKey ? '•••••••• (já salva)' : 'cole sua chave aqui'}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [credential.key]: { ...value, apiKey: event.target.value },
                      }))
                    }
                  />
                </Field>
                <Field label="Modelo">
                  <input
                    className="input"
                    value={value.model || credential.model || ''}
                    placeholder={credential.model || 'modelo'}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [credential.key]: { ...value, model: event.target.value },
                      }))
                    }
                  />
                </Field>
              </div>

              <Field
                label={credential.key === 'custom' ? 'Endereço da API (obrigatório)' : 'Endereço da API'}
                hint={
                  credential.baseUrl
                    ? `salvo: ${credential.baseUrl}`
                    : credential.key === 'custom'
                      ? 'ex.: https://meu-servidor.com/v1/chat/completions'
                      : undefined
                }
              >
                <input
                  className="input"
                  value={value.baseUrl || credential.baseUrl || ''}
                  placeholder={
                    credential.baseUrl || 'https://.../v1/chat/completions'
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [credential.key]: { ...value, baseUrl: event.target.value },
                    }))
                  }
                />
              </Field>

              {credential.lastError && (
                <p className="tiny" style={{ color: 'var(--err)' }}>
                  Último erro: {credential.lastError}
                </p>
              )}

              <div className="row gap-8" style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="primary"
                  loading={saveMutation.isPending}
                  onClick={() =>
                    saveMutation.mutate({
                      provider: credential.key,
                      apiKey: value.apiKey || undefined,
                      model: value.model || credential.model || undefined,
                      baseUrl: value.baseUrl || undefined,
                    })
                  }
                >
                  Salvar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={testMutation.isPending}
                  onClick={() => testMutation.mutate(credential.key)}
                >
                  Testar chave
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
