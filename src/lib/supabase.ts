import { toast } from '../components/ToastCustom';

const API_BASE = import.meta.env.VITE_API_URL || '';
const STORAGE_KEY = 'mysql-auth-session';

type QueryFilter = {
  column: string;
  operator: string;
  value: any;
};

type Session = {
  access_token: string;
  token_type: string;
  user: any;
};

const listeners = new Set<(event: string, session: Session | null) => void>();

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    console.warn('Failed to persist auth state');
  }
}

function notify(event: string, session: Session | null) {
  listeners.forEach((listener) => listener(event, session));
}

async function request(path: string, options: RequestInit = {}) {
  const session = loadSession();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData) && !(options.body instanceof Blob)) {
    headers.set('Content-Type', 'application/json');
  }
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = json.error || { message: 'Erro de comunicacao com a API' };
    if (response.status === 401) {
      saveSession(null);
      notify('SIGNED_OUT', null);
    }
    throw error;
  }

  return json;
}

class QueryBuilder implements PromiseLike<any> {
  private filters: QueryFilter[] = [];
  private orFilters: string[] = [];
  private orders: Array<{ column: string; ascending?: boolean }> = [];
  private selected = '*';
  private selectOptions: any = {};
  private pendingAction: 'select' | 'insert' | 'update' | 'delete' | 'upsert' | null = null;
  private payload: any = null;
  private selectedAfterWrite = false;
  private singleResult = false;
  private maybeSingleResult = false;
  private rangeValue?: { from: number; to: number };
  private limitValue?: number;
  private upsertOptions: any;

  constructor(private table: string) {}

  select(columns = '*', options: any = {}) {
    this.pendingAction = this.pendingAction || 'select';
    this.selectedAfterWrite = this.pendingAction !== 'select';
    this.selected = columns;
    this.selectOptions = options || {};
    return this;
  }

  insert(payload: any) {
    this.pendingAction = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload: any) {
    this.pendingAction = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.pendingAction = 'delete';
    return this;
  }

  upsert(payload: any, options: any = {}) {
    this.pendingAction = 'upsert';
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  eq(column: string, value: any) { this.filters.push({ column, operator: 'eq', value }); return this; }
  neq(column: string, value: any) { this.filters.push({ column, operator: 'neq', value }); return this; }
  gt(column: string, value: any) { this.filters.push({ column, operator: 'gt', value }); return this; }
  gte(column: string, value: any) { this.filters.push({ column, operator: 'gte', value }); return this; }
  lt(column: string, value: any) { this.filters.push({ column, operator: 'lt', value }); return this; }
  lte(column: string, value: any) { this.filters.push({ column, operator: 'lte', value }); return this; }
  ilike(column: string, value: any) { this.filters.push({ column, operator: 'ilike', value }); return this; }
  in(column: string, value: any[]) { this.filters.push({ column, operator: 'in', value }); return this; }
  is(column: string, value: any) { this.filters.push({ column, operator: 'is', value }); return this; }
  or(expression: string) { this.orFilters.push(expression); return this; }
  order(column: string, options: any = {}) { this.orders.push({ column, ascending: options.ascending }); return this; }
  range(from: number, to: number) { this.rangeValue = { from, to }; return this; }
  limit(value: number) { this.limitValue = value; return this; }
  single() { this.singleResult = true; return this; }
  maybeSingle() { this.maybeSingleResult = true; return this; }

  async execute() {
    try {
      const action = this.pendingAction || 'select';
      const result = await request('/api/query', {
        method: 'POST',
        body: JSON.stringify({
          table: this.table,
          action,
          payload: this.payload,
          filters: this.filters,
          orFilters: this.orFilters,
          orders: this.orders,
          range: this.rangeValue,
          limit: this.limitValue,
          single: this.singleResult,
          maybeSingle: this.maybeSingleResult,
          count: this.selectOptions.count,
          head: this.selectOptions.head,
          select: this.selected,
          selectedAfterWrite: this.selectedAfterWrite,
          upsertOptions: this.upsertOptions,
        }),
      });
      return { data: result.data, count: result.count, error: null };
    } catch (error: any) {
      return { data: null, count: null, error };
    }
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const supabase = {
  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      try {
        const data = await request('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        saveSession(data.session);
        notify('SIGNED_IN', data.session);
        return { data, error: null };
      } catch (error) {
        return { data: { session: null, user: null }, error };
      }
    },

    async signUp({ email, password }: { email: string; password: string; options?: unknown }) {
      try {
        const data = await request('/api/auth/signup', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        saveSession(data.session);
        notify('SIGNED_IN', data.session);
        return { data, error: null };
      } catch (error) {
        return { data: { session: null, user: null }, error };
      }
    },

    async updateUser(payload: any) {
      try {
        const data = await request('/api/auth/user', {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        const session = loadSession();
        if (session && data.user) {
          session.user = data.user;
          saveSession(session);
          notify('USER_UPDATED', session);
        }
        return { data, error: null };
      } catch (error) {
        return { data: null, error };
      }
    },

    async getSession() {
      const local = loadSession();
      if (!local?.access_token) return { data: { session: null }, error: null };
      try {
        const data = await request('/api/auth/session');
        saveSession(data.session);
        return { data: { session: data.session }, error: null };
      } catch (error) {
        return { data: { session: null }, error };
      }
    },

    async getUser() {
      const { data, error } = await this.getSession();
      return { data: { user: data.session?.user || null }, error };
    },

    async signOut() {
      saveSession(null);
      notify('SIGNED_OUT', null);
      return { error: null };
    },

    onAuthStateChange(callback: (event: string, session: Session | null) => void) {
      listeners.add(callback);
      queueMicrotask(() => callback(loadSession() ? 'INITIAL_SESSION' : 'SIGNED_OUT', loadSession()));
      return {
        data: {
          subscription: {
            unsubscribe: () => {
              listeners.delete(callback);
            },
          },
        },
      };
    },
  },

  from(table: string) {
    return new QueryBuilder(table);
  },

  rpc(name: string, params: any) {
    return request(`/api/rpc/${name}`, {
      method: 'POST',
      body: JSON.stringify(params),
    }).catch((error) => ({ data: null, error }));
  },

  storage: {
    from(bucket: string) {
      return {
        async upload(path: string, file: File, _options?: unknown) {
          try {
            const response = await request(`/api/storage/${bucket}/upload?path=${encodeURIComponent(path)}`, {
              method: 'POST',
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
              body: file,
            });
            return { data: response.data, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
        async remove(paths: string[]) {
          try {
            const response = await request(`/api/storage/${bucket}`, {
              method: 'DELETE',
              body: JSON.stringify({ paths }),
            });
            return { data: response.data, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
    },
  },
};

export const handleAuthError = (error: any) => {
  if (error?.message?.includes('Sessao') || error?.message?.includes('Refresh Token')) {
    localStorage.removeItem(STORAGE_KEY);
    supabase.auth.signOut();
    toast.error('Sessao expirada. Faca login novamente.');
    return true;
  }
  return false;
};
