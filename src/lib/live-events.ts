import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * Atualização em tempo real: uma única conexão (SSE) por navegador, compartilhada por todas as telas.
 * O servidor só diz "o assunto X mudou"; cada tela decide o que buscar de novo.
 */

export type LiveTopic = 'financeiro' | 'ordens' | 'conversas' | 'fiscal';

interface Subscription {
  topics: Set<string>;
  callback: () => void;
}

const API_BASE = import.meta.env.VITE_API_URL || '';
const subscriptions = new Set<Subscription>();
const statusListeners = new Set<() => void>();

let connected = false;
let controller: AbortController | null = null;
let retryMs = 1000;
let retryTimer: number | undefined;
let everConnected = false;
let hiddenAt = 0;

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  statusListeners.forEach((listener) => listener());
}

function token() {
  try {
    return JSON.parse(localStorage.getItem('mysql-auth-session') || 'null')?.access_token || '';
  } catch {
    return '';
  }
}

function notify(topics: string[] | '*') {
  subscriptions.forEach((subscription) => {
    if (topics === '*' || topics.some((topic) => subscription.topics.has(topic))) subscription.callback();
  });
}

function handleBlock(block: string) {
  let event = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data += line.slice(5).trim();
  }
  if (event === 'ready') {
    const wasReconnect = everConnected;
    everConnected = true;
    retryMs = 1000;
    setConnected(true);
    // Eventos perdidos durante a queda: manda todo mundo se atualizar.
    if (wasReconnect) notify('*');
  } else if (event === 'change') {
    try {
      notify((JSON.parse(data).topics as string[]) || []);
    } catch {
      notify('*');
    }
  }
}

async function connect() {
  if (controller || subscriptions.size === 0 || !token()) return;
  const current = new AbortController();
  controller = current;
  try {
    const response = await fetch(`${API_BASE}/api/eventos`, {
      headers: { Authorization: `Bearer ${token()}`, Accept: 'text/event-stream' },
      cache: 'no-store',
      signal: current.signal,
    });
    if (response.status === 401) return; // sessão expirada: o restante do app cuida do login
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        handleBlock(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
        index = buffer.indexOf('\n\n');
      }
    }
  } catch {
    // queda de rede ou servidor reiniciando: cai no reconectar abaixo
  } finally {
    if (controller === current) controller = null;
    setConnected(false);
    if (!current.signal.aborted && subscriptions.size > 0) {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => void connect(), retryMs);
      retryMs = Math.min(Math.round(retryMs * 1.7), 15_000);
    }
  }
}

function disconnect() {
  window.clearTimeout(retryTimer);
  controller?.abort();
  controller = null;
  setConnected(false);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    // Voltou para a aba: reconecta se preciso e, após uma pausa longa, atualiza por garantia.
    if (subscriptions.size > 0 && !controller) {
      retryMs = 1000;
      void connect();
    }
    if (hiddenAt && Date.now() - hiddenAt > 30_000) notify('*');
    hiddenAt = 0;
  });
}

/** Executa `refresh` (com pequena espera para agrupar rajadas) sempre que algum dos assuntos mudar. */
export function useLiveRefresh(topics: LiveTopic[], refresh: () => unknown) {
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = topics.join(',');

  useEffect(() => {
    let timer: number | undefined;
    const subscription: Subscription = {
      topics: new Set(key.split(',')),
      callback: () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void latest.current(), 400);
      },
    };
    subscriptions.add(subscription);
    void connect();
    // Rede de segurança: se o canal ao vivo estiver fora do ar (proxy, rede), atualiza a cada 30 s.
    const fallback = window.setInterval(() => {
      if (!connected && !document.hidden) subscription.callback();
    }, 30_000);
    return () => {
      window.clearInterval(fallback);
      window.clearTimeout(timer);
      subscriptions.delete(subscription);
      if (subscriptions.size === 0) disconnect();
    };
  }, [key]);
}

export function useLiveStatus() {
  return useSyncExternalStore(
    (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
    () => connected,
    () => false,
  );
}
