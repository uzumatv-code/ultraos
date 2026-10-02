import { toast as hotToast } from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react';

type ToastId = string;
type Tone = 'success' | 'error' | 'warning' | 'info';

interface ToastOptions {
  duration?: number;
  position?: 'top-right' | 'top-center' | 'top-left' | 'bottom-right' | 'bottom-center' | 'bottom-left';
  /** Título em destaque; a mensagem passa a ser o detalhe. */
  title?: string;
}

const META: Record<Tone, { icon: LucideIcon; duration: number }> = {
  success: { icon: CheckCircle2, duration: 4000 },
  info: { icon: Info, duration: 4500 },
  warning: { icon: AlertTriangle, duration: 6000 },
  error: { icon: XCircle, duration: 7000 },
};

/**
 * Aviso flutuante do sistema. A posição vem do <Toaster /> (canto inferior direito no
 * desktop e acima da navegação no celular), de modo que nunca cubra o topo da tela,
 * o sino de notificações nem os botões de ação do cabeçalho.
 */
function show(tone: Tone, message: string, options: ToastOptions = {}) {
  const { icon: Icon, duration: defaultDuration } = META[tone];
  const duration = options.duration ?? defaultDuration;
  return hotToast.custom(
    (t) => (
      <div
        role={tone === 'error' ? 'alert' : 'status'}
        aria-live={tone === 'error' ? 'assertive' : 'polite'}
        className={`ui-toast ui-toast-${tone} ${t.visible ? 'ui-toast-in' : 'ui-toast-out'}`}
      >
        <span className="ui-toast-icon"><Icon aria-hidden /></span>
        <div className="min-w-0 flex-1">
          {options.title && <p className="ui-toast-title">{options.title}</p>}
          <p className={options.title ? 'ui-toast-text' : 'ui-toast-title'}>{message}</p>
        </div>
        <button type="button" className="ui-toast-close" aria-label="Fechar aviso" onClick={() => hotToast.dismiss(t.id)}>
          <X aria-hidden />
        </button>
        {duration !== Infinity && <span className="ui-toast-bar" style={{ animationDuration: `${duration}ms` }} aria-hidden />}
      </div>
    ),
    // id estável por mensagem: repetir o mesmo aviso renova o existente em vez de empilhar cópias
    { id: `${tone}:${message}`, duration, position: options.position },
  );
}

export const toast = {
  success: (message: string, options?: ToastOptions) => show('success', message, options),
  error: (message: string, options?: ToastOptions) => show('error', message, options),
  warning: (message: string, options?: ToastOptions) => show('warning', message, options),
  info: (message: string, options?: ToastOptions) => show('info', message, options),
  dismiss: (id?: ToastId) => hotToast.dismiss(id),
};
