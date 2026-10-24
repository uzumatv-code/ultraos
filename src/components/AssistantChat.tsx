import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Send, Sparkles } from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { Skeleton } from './ui';

type ChatMessage = { id: string; from: 'user' | 'ai'; text: string; error?: boolean };
type HistoryRow = { id: string; mensagem: string | null; resposta: string | null };

const defaultSuggestions = [
  'Quanto entrou hoje?',
  'Quais contas vencem esta semana?',
  'Quais ordens estão abertas?',
  'Resumo do mês',
];

let counter = 0;
const nextId = () => `local-${Date.now()}-${counter++}`;

/** Converte o *negrito* do WhatsApp em <strong>, sem usar HTML cru. */
function renderRich(text: string) {
  return text.split(/(\*[^*\n]+\*)/g).map((part, index) =>
    /^\*[^*\n]+\*$/.test(part) ? <strong key={index}>{part.slice(1, -1)}</strong> : <span key={index}>{part}</span>,
  );
}

/**
 * Assistente de IA do painel.
 *
 * `suggestions` troca os atalhos pelos que fazem sentido no momento (o painel
 * passa os ligados ao que está pendente). `seed` coloca um texto no campo sem
 * enviar — quem decide mandar é sempre a pessoa, porque a IA pode executar ações.
 */
export function AssistantChat({
  suggestions = defaultSuggestions,
  seed,
  className = '',
}: {
  suggestions?: string[];
  seed?: { text: string; nonce: number } | null;
  className?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    apiRequest<HistoryRow[]>('/api/ia/chat/historico')
      .then((rows) => {
        if (!active) return;
        setMessages(
          (rows || []).flatMap((row) => [
            ...(row.mensagem ? [{ id: `${row.id}-u`, from: 'user' as const, text: row.mensagem }] : []),
            ...(row.resposta ? [{ id: `${row.id}-a`, from: 'ai' as const, text: row.resposta }] : []),
          ]),
        );
      })
      .catch(() => undefined)
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, sending, loading]);

  useEffect(() => {
    if (!seed) return;
    setDraft(seed.text);
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(seed.text.length, seed.text.length);
    });
  }, [seed]);

  /* Campo cresce com o texto até seis linhas. */
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 160)}px`;
  }, [draft]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setDraft('');
    setMessages((current) => [...current, { id: nextId(), from: 'user', text: content }]);
    setSending(true);
    try {
      const data = await apiRequest<{ reply: string }>('/api/ia/chat', {
        method: 'POST',
        body: JSON.stringify({ mensagem: content }),
      });
      setMessages((current) => [...current, { id: nextId(), from: 'ai', text: data.reply }]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { id: nextId(), from: 'ai', error: true, text: error instanceof Error ? error.message : 'Não consegui responder agora.' },
      ]);
    } finally {
      setSending(false);
    }
  }

  const empty = !loading && messages.length === 0;

  return (
    <section className={`ui-ai ${className}`} aria-labelledby="assistant-title">
      <header className="flex shrink-0 items-center gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <span className="ui-ai-mark" aria-hidden>
          <Sparkles />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="assistant-title" className="dash-section-title">
            Ultra IA
          </h2>
          <p className="truncate text-xs text-ink-muted">Consulta e executa no sistema por você</p>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="ml-auto h-10 w-2/3" />
            <Skeleton className="h-20 w-5/6" />
          </div>
        ) : empty ? (
          <div className="flex min-h-full flex-col justify-center py-2">
            <p className="font-display text-lg font-semibold tracking-tight text-ink">Como posso ajudar agora?</p>
            <p className="mt-1 text-sm text-ink-muted">
              Escreva como no WhatsApp: “inicia a OS 120”, “gastei 50 no mercado”.
            </p>
            <ul className="mt-3 space-y-1.5">
              {suggestions.map((item) => (
                <li key={item}>
                  <button type="button" onClick={() => void send(item)} className="ui-ai-suggestion">
                    <span className="truncate">{item}</span>
                    <ArrowUpRight aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[88%] whitespace-pre-wrap break-words px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.from === 'user'
                      ? 'rounded-2xl rounded-br-md bg-brand text-white'
                      : message.error
                        ? 'rounded-2xl rounded-bl-md border border-signal-danger/40 bg-signal-danger/10 text-signal-danger'
                        : 'rounded-2xl rounded-bl-md bg-surface-muted text-ink'
                  }`}
                >
                  {renderRich(message.text)}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start" aria-label="A IA está respondendo">
                <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface-muted px-3.5 py-3">
                  {[0, 150, 300].map((delay) => (
                    <span key={delay} className="ui-ai-typing" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-hairline p-3 sm:px-4">
        {!empty && !draft && !sending && (
          <div className="-mx-1 mb-2 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
            {suggestions.map((item) => (
              <button key={item} type="button" onClick={() => void send(item)} className="ui-ai-chip">
                {item}
              </button>
            ))}
          </div>
        )}
        <form
          className="ui-ai-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={draft}
            maxLength={2000}
            placeholder="Pergunte ou peça uma ação…"
            aria-label="Mensagem para a IA"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="submit" disabled={sending || !draft.trim()} aria-label="Enviar" className="ui-ai-send">
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-1.5 px-1 text-[0.6875rem] text-ink-subtle">
          A IA pode lançar, pagar e alterar OS quando você pede. Enter envia · Shift+Enter quebra linha.
        </p>
      </div>
    </section>
  );
}
