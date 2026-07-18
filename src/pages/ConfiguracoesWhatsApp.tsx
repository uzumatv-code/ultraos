import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unplug,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { toast } from '../components/ToastCustom';

type ConnectionStatus =
  | 'nao_configurado'
  | 'criando'
  | 'aguardando_qr'
  | 'conectando'
  | 'conectado'
  | 'desconectado'
  | 'erro';

interface ConnectionData {
  status: ConnectionStatus;
  phone_number?: string | null;
  profile_name?: string | null;
  profile_picture_url?: string | null;
  connected_at?: string | null;
  last_event_at?: string | null;
  last_checked_at?: string | null;
  disconnect_reason?: string | null;
  connection_status_code?: number | null;
  last_error?: string | null;
  qr?: {
    base64?: string | null;
    code?: string | null;
    pairingCode?: string | null;
  };
}

function authToken() {
  try {
    return JSON.parse(localStorage.getItem('mysql-auth-session') || 'null')?.access_token || '';
  } catch {
    return '';
  }
}

async function connectionRequest(method: 'GET' | 'POST' | 'DELETE' = 'GET') {
  const response = await fetch('/api/whatsapp/connection', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken()}`,
    },
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error?.message || 'Falha ao acessar a conexão do WhatsApp');
  return json.data as ConnectionData;
}

const statusInfo: Record<ConnectionStatus, { label: string; className: string }> = {
  nao_configurado: { label: 'Não conectado', className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  criando: { label: 'Criando conexão', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  aguardando_qr: { label: 'Aguardando QR Code', className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  conectando: { label: 'Conectando', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300' },
  conectado: { label: 'Conectado', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  desconectado: { label: 'Desconectado', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
  erro: { label: 'Erro na conexão', className: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' },
};

function formatDate(value?: string | null) {
  if (!value) return 'Ainda não registrado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function disconnectMessage(reason?: string | null, statusCode?: number | null) {
  const messages: Record<string, string> = {
    device_removed: 'O aparelho foi removido pelo WhatsApp no celular.',
    logged_out: 'A sessão foi encerrada pelo WhatsApp no celular.',
    loggedout: 'A sessão foi encerrada pelo WhatsApp no celular.',
    logout: 'A sessão foi encerrada pelo WhatsApp no celular.',
    unauthorized: 'O WhatsApp revogou a autorização desta conexão.',
    instance_not_found: 'A instância não existe mais na Evolution API.',
    instance_removed: 'A instância foi removida da Evolution API.',
    connection_closed: 'A conexão com o WhatsApp foi encerrada.',
    close: 'A conexão com o WhatsApp foi encerrada.',
    user_requested: 'A desconexão foi solicitada pelo administrador.',
  };
  const base = messages[reason || ''] || (reason ? `Conexão encerrada: ${reason.replace(/_/g, ' ')}.` : 'A conexão com o WhatsApp foi encerrada.');
  return statusCode ? `${base} Código ${statusCode}.` : base;
}

export function ConfiguracoesWhatsApp() {
  const [connection, setConnection] = useState<ConnectionData>({ status: 'nao_configurado' });
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadConnection = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await connectionRequest();
      setConnection((current) => ({ ...current, ...data, qr: data.qr || current.qr }));
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : 'Erro ao consultar WhatsApp');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  useEffect(() => {
    const waiting = ['aguardando_qr', 'conectando', 'criando'].includes(connection.status);
    const timer = window.setInterval(() => void loadConnection(true), waiting ? 5000 : 15000);
    return () => window.clearInterval(timer);
  }, [connection.status, loadConnection]);

  async function connect() {
    setConnecting(true);
    try {
      const data = await connectionRequest('POST');
      setConnection(data);
      if (data.status === 'conectado') toast.success('WhatsApp já está conectado!');
      else toast.success('QR Code gerado. Escaneie com o WhatsApp.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar a conexão');
    } finally {
      setConnecting(false);
    }
  }

  async function disconnect() {
    if (!window.confirm('Deseja desconectar este WhatsApp do UltraOS?')) return;
    setDisconnecting(true);
    try {
      const data = await connectionRequest('DELETE');
      setConnection(data);
      toast.success('WhatsApp desconectado com sucesso.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desconectar');
    } finally {
      setDisconnecting(false);
    }
  }

  const status = statusInfo[connection.status] || statusInfo.nao_configurado;
  const waitingForQr = ['aguardando_qr', 'conectando', 'criando'].includes(connection.status);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-700 shadow-lg shadow-emerald-500/20">
              <MessageCircle className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">WhatsApp</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Conecte o número da sua empresa ao UltraOS</p>
            </div>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${status.className}`}>
            {connection.status === 'conectado' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {status.label}
          </span>
        </div>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-7">
              {connection.status === 'conectado' ? (
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    {connection.profile_picture_url ? (
                      <img src={connection.profile_picture_url} alt="Perfil do WhatsApp" className="h-16 w-16 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                        <Smartphone className="h-8 w-8 text-emerald-600" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-semibold text-slate-950 dark:text-white">{connection.profile_name || 'WhatsApp conectado'}</h2>
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      </div>
                      <p className="mt-1 text-slate-500 dark:text-slate-400">{connection.phone_number || 'Número confirmado pela conexão'}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <InfoCard label="Conectado em" value={formatDate(connection.connected_at)} />
                    <InfoCard label="Última verificação" value={formatDate(connection.last_checked_at || connection.last_event_at)} />
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200">
                    Mensagens automáticas, atualizações de OS e lembretes de avaliação já podem ser enviados por este número.
                  </div>

                  <button onClick={disconnect} disabled={disconnecting} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950">
                    {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
                    Desconectar WhatsApp
                  </button>
                </div>
              ) : waitingForQr && connection.qr?.base64 ? (
                <div className="text-center">
                  <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950">
                    <QrCode className="h-6 w-6 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-950 dark:text-white">Escaneie o QR Code</h2>
                  <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">No WhatsApp, acesse Aparelhos conectados, toque em Conectar aparelho e aponte a câmera.</p>
                  <div className="mx-auto my-6 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                    <img src={connection.qr.base64} alt="QR Code para conectar o WhatsApp" className="h-64 w-64" />
                  </div>
                  <div className="flex flex-wrap justify-center gap-3">
                    <button onClick={connect} disabled={connecting} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                      {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      Atualizar QR Code
                    </button>
                    <button onClick={() => void loadConnection()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                      <Clock3 className="h-4 w-4" /> Verificar conexão
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-96 flex-col items-center justify-center text-center">
                  <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                    <Smartphone className="h-10 w-10 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">Conecte o WhatsApp da empresa</h2>
                  <p className="mt-3 max-w-md text-slate-500 dark:text-slate-400">O UltraOS criará uma conexão segura e exclusiva. Você só precisa escanear o QR Code.</p>
                  {connection.status === 'desconectado' && (
                    <div className="mt-4 flex max-w-lg items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                      <div>
                        <p className="font-semibold">WhatsApp desconectado</p>
                        <p className="mt-1">{disconnectMessage(connection.disconnect_reason, connection.connection_status_code)}</p>
                        <p className="mt-1 text-xs opacity-80">Última verificação: {formatDate(connection.last_checked_at)}</p>
                      </div>
                    </div>
                  )}
                  {connection.last_error && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{connection.last_error}</p>}
                  <button onClick={connect} disabled={connecting} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60">
                    {connecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <QrCode className="h-5 w-5" />}
                    {connecting ? 'Preparando conexão...' : 'Conectar WhatsApp'}
                  </button>
                </div>
              )}
            </motion.section>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-6 w-6 text-emerald-600" />
                  <h2 className="font-semibold text-slate-950 dark:text-white">Conexão protegida</h2>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
                  <li>• Instância exclusiva para sua empresa</li>
                  <li>• Credenciais protegidas no servidor</li>
                  <li>• Nenhuma chave técnica precisa ser informada</li>
                  <li>• Você pode desconectar quando quiser</li>
                </ul>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h2 className="font-semibold text-slate-950 dark:text-white">Como conectar</h2>
                <ol className="mt-4 space-y-4 text-sm text-slate-600 dark:text-slate-300">
                  <Step number="1" text="Clique em Conectar WhatsApp" />
                  <Step number="2" text="Abra Aparelhos conectados no WhatsApp" />
                  <Step number="3" text="Escaneie o QR Code exibido" />
                  <Step number="4" text="Aguarde a confirmação automática" />
                </ol>
              </section>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">{number}</span>
      <span>{text}</span>
    </li>
  );
}
