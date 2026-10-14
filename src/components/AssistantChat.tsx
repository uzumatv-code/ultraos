import { useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles } from 'lucide-react';
import { apiRequest } from '../lib/api-client';
import { Panel, Skeleton } from './ui';

type ChatMessage = { id: string; from: 'user' | 'ai'; text: string; error?: boolean };
type HistoryRow = { id: string; mensagem: string | null; resposta: string | null };

const suggestions = [
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

export function AssistantChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const endRef = useRef<HTMLDivElement>(null);

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
    const box = endRef.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, sending]);

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

  return (
    <Panel
      title="Assistente de IA"
      subtitle="Pergunte sobre ordens, caixa e contas — ou peça para lançar, pagar e criar OS"
      icon={Sparkles}
      tone="brand"
      flush
    >
      <div className="flex h-[26rem] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5" aria-live="polite">
          {loading ? (
            <Skeleton className="h-16" />
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="ui-icon-tile ui-icon-tile-md ui-tone-brand"><Bot /></span>
              <p className="max-w-sm text-sm text-ink-muted">
                Converse como no WhatsApp: “gastei 50 no mercado”, “paguei a conta de luz”, “quanto entrou hoje?”.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => void send(item)}
                    className="rounded-full border border-hairline px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-brand hover:text-ink"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id} className={`flex ${message.from === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                    message.from === 'user'
                      ? 'bg-brand text-white'
                      : message.error
                        ? 'border border-signal-danger/40 bg-surface-muted text-signal-danger'
                        : 'bg-surface-muted text-ink'
                  }`}
                >
                  {renderRich(message.text)}
                </div>
              </div>
            ))
          )}
          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-surface-muted px-3.5 py-2.5 text-sm text-ink-muted">Pensando…</div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          className="flex items-end gap-2 border-t border-hairline p-3 sm:p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            className="ui-field min-h-[2.75rem] flex-1 resize-none"
            rows={1}
            value={draft}
            maxLength={2000}
            placeholder="Escreva para a IA…"
            aria-label="Mensagem para a IA"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
          />
          <button
            type="submit"
            disabled={sending || !draft.trim()}
            aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand text-white transition disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </Panel>
  );
}
