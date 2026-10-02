import { useLiveStatus } from '../lib/live-events';

/** Indicador discreto: a tela está recebendo atualizações em tempo real. */
export function LiveBadge() {
  const live = useLiveStatus();
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.7rem] font-semibold ${live ? 'border-signal-success/40 bg-signal-success/10 text-signal-success' : 'border-hairline text-ink-subtle'}`}
      title={live ? 'Esta tela atualiza sozinha a cada mudança.' : 'Reconectando às atualizações em tempo real…'}
      role="status"
    >
      <span className="relative flex h-2 w-2">
        {live && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-success opacity-60" />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? 'bg-signal-success' : 'bg-ink-subtle'}`} />
      </span>
      {live ? 'Ao vivo' : 'Reconectando…'}
    </span>
  );
}
