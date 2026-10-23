import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ExternalLink, ImagePlus, Link2, Loader2, MousePointerClick, Plug, Plus, RefreshCw, Save, Sparkles, Store, ThumbsUp, Trash2, X,
} from 'lucide-react';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { apiRequest } from '../lib/api-client';

interface Recomendado {
  id: string; titulo: string; categoria: string | null; marca: string | null; motivo: string | null; link_afiliado: string; url_anuncio: string | null;
  ml_id: string | null; preco: number | null; preco_de: number | null; preco_em: string | null; imagem_url: string | null; disponivel_ml: boolean | null;
  ativo: boolean; ordem: number; sincronizado_em: string | null; sincronia_erro: string | null; cliques_30d: number; cliques_total: number;
  aviso?: string | null;
}
interface ContaML {
  configurado: boolean; conectado: boolean; apelido?: string | null; conectado_em?: string | null; erro?: string | null; token_fixo?: boolean; redirect_uri?: string;
}
interface Lista { recomendados: Recomendado[]; integrado: boolean; ia?: boolean; mercado_livre: ContaML }

const SITE = 'https://luthieriabrasilia.com.br';
const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—');

/** Reduz a foto no navegador (até 1000 px, WebP): o cartão da vitrine é pequeno. */
async function prepararImagem(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível ler a imagem'))), 'image/webp', 0.85));
}

function Campo({ label, children, ajuda, acao }: { label: string; children: React.ReactNode; ajuda?: string; acao?: React.ReactNode }) {
  return (
    <div className="block">
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold text-slate-900 dark:text-white">{label}</label>
        {acao}
      </div>
      <label className="block">{children}</label>
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </div>
  );
}

type CampoIA = 'titulo' | 'motivo' | 'categoria' | 'marca';

/** Botão pequeno que pede à IA o texto de um campo. */
function BotaoIA({ ocupado, onClick }: { ocupado: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={ocupado}
      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-500/10 disabled:opacity-50">
      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Gerar com IA
    </button>
  );
}

function Situacao({ r }: { r: Recomendado }) {
  if (r.ativo && r.disponivel_ml === false) return <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">Pausado no ML</span>;
  return r.ativo
    ? <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">No site</span>
    : <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">Rascunho</span>;
}

function Editor({ inicial, onFechar, onSalvo, iaAtiva }: { inicial: Recomendado; onFechar: () => void; onSalvo: () => void; iaAtiva: boolean }) {
  const [r, setR] = useState<Recomendado>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [gerando, setGerando] = useState<CampoIA[]>([]);
  const [pedidoIA, setPedidoIA] = useState('');

  // A IA usa o que está no formulário (mesmo sem salvar), a foto e as suas anotações; o texto volta para revisão, nada é salvo sozinho.
  async function gerarIA(campos: CampoIA[]) {
    if (!r.titulo.trim() && !r.imagem_url) return toast.error('Busque os dados no Mercado Livre ou escreva o nome antes');
    setGerando(campos);
    try {
      const resp = await apiRequest<{ textos: Partial<Record<CampoIA, string>> }>(`/api/loja-admin/recomendados/${r.id}/ia`, {
        method: 'POST',
        body: JSON.stringify({ campos, instrucoes: pedidoIA.trim() || undefined, rascunho: r }),
      });
      setR((atual) => ({ ...atual, ...resp.textos }));
      toast.success('Texto gerado. Revise antes de salvar.');
    } catch (error: any) {
      toast.error(error.message || 'A IA não respondeu agora');
    } finally {
      setGerando([]);
    }
  }
  const ia = (campo: CampoIA) => (iaAtiva ? <BotaoIA ocupado={gerando.includes(campo)} onClick={() => void gerarIA([campo])} /> : undefined);
  const [enviando, setEnviando] = useState(false);
  const set = <K extends keyof Recomendado>(k: K, v: Recomendado[K]) => setR((atual) => ({ ...atual, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  async function salvar(ativo?: boolean) {
    setSalvando(true);
    try {
      const salvo = await apiRequest<Recomendado>(`/api/loja-admin/recomendados/${r.id}`, {
        method: 'PUT', body: JSON.stringify({ ...r, ativo: ativo ?? r.ativo }),
      });
      setR(salvo);
      toast.success(ativo === true ? 'Publicado em Recomendamos' : ativo === false ? 'Tirado do site' : 'Salvo');
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  // Busca preço, disponibilidade e (se estiverem vazios) nome e foto no Mercado Livre. O que foi digitado não é trocado.
  async function buscar() {
    setBuscando(true);
    try {
      const salvo = await apiRequest<Recomendado>(`/api/loja-admin/recomendados/${r.id}/sincronizar`, { method: 'POST' });
      setR((atual) => ({ ...salvo, motivo: atual.motivo, categoria: atual.categoria, marca: atual.marca }));
      if (salvo.aviso) toast.error(salvo.aviso);
      else toast.success('Dados do Mercado Livre atualizados');
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível consultar o Mercado Livre');
    } finally {
      setBuscando(false);
    }
  }

  async function enviarFoto(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      const salvo = await apiRequest<Recomendado>(`/api/loja-admin/recomendados/${r.id}/imagem`, {
        method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: await prepararImagem(file),
      });
      setR((atual) => ({ ...atual, imagem_url: salvo.imagem_url }));
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível enviar a foto');
    } finally {
      setEnviando(false);
    }
  }

  async function removerFoto() {
    try {
      await apiRequest(`/api/loja-admin/recomendados/${r.id}/imagem`, { method: 'DELETE' });
      setR((atual) => ({ ...atual, imagem_url: null }));
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível remover a foto');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label={`Editar ${r.titulo || 'indicação'}`}>
      <div className="h-full w-full max-w-2xl overflow-y-auto bg-[rgb(var(--app-surface))] p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Indicação · Mercado Livre</p>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">{r.titulo || 'Sem nome'}</h2>
            <span className="mt-1 inline-flex items-center gap-2"><Situacao r={r} />
              {r.ativo && <a href={`${SITE}/recomendamos`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600">Ver no site <ExternalLink className="h-3 w-3" /></a>}
            </span>
          </div>
          <button type="button" onClick={onFechar} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-6">
          {r.sincronia_erro && (
            <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {r.sincronia_erro}
            </p>
          )}

          <section className="grid gap-4">
            <Campo label="Link de afiliado" ajuda="Gerado no painel de afiliados do Mercado Livre. É para ele que o cliente vai, então a comissão fica com você.">
              <input className={input} value={r.link_afiliado} onChange={(e) => set('link_afiliado', e.target.value)} />
            </Campo>
            <Campo label="Endereço do anúncio (opcional)" ajuda="Se o link curto não for reconhecido, cole aqui o endereço da página do produto para o sistema buscar foto e preço.">
              <input className={input} placeholder="https://produto.mercadolivre.com.br/MLB-…" value={r.url_anuncio || ''} onChange={(e) => set('url_anuncio', e.target.value)} />
            </Campo>
          </section>

          {iaAtiva && (
            <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-4 dark:border-slate-700 dark:bg-slate-900">
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Sparkles className="h-4 w-4 text-violet-600" /> Escrever com IA</p>
              <p className="mt-1 text-xs text-slate-500">A IA usa o nome do anúncio, a foto e as suas anotações para escrever nome curto, motivo, categoria e marca. Ela só diz que a oficina usa o produto se você escrever isso aqui. Revise e salve.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input className={`${input} mt-0`} placeholder="Opcional: sua experiência (ex.: usamos na troca de trastes, boa para iniciantes)" value={pedidoIA} onChange={(e) => setPedidoIA(e.target.value)} />
                <Button size="sm" icon={gerando.length > 1 ? Loader2 : Sparkles} disabled={gerando.length > 0} onClick={() => void gerarIA(['titulo', 'motivo', 'categoria', 'marca'])}>
                  {gerando.length > 1 ? 'Escrevendo…' : 'Preencher tudo'}
                </Button>
              </div>
            </section>
          )}

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Campo label="Nome" acao={ia('titulo')}><input className={input} value={r.titulo} onChange={(e) => set('titulo', e.target.value)} /></Campo></div>
            <div className="sm:col-span-2">
              <Campo label="Por que a oficina recomenda" acao={ia('motivo')} ajuda={`${(r.motivo || '').length}/400. Obrigatório para publicar. Ex.: "É a corda que usamos nas regulagens de guitarra: dura mais e segura a afinação."`}>
                <textarea rows={3} maxLength={400} className={input} value={r.motivo || ''} onChange={(e) => set('motivo', e.target.value)} />
              </Campo>
            </div>
            <Campo label="Categoria" acao={ia('categoria')}><input className={input} placeholder="Cordas, Afinadores, Limpeza…" value={r.categoria || ''} onChange={(e) => set('categoria', e.target.value)} /></Campo>
            <Campo label="Marca" acao={ia('marca')}><input className={input} value={r.marca || ''} onChange={(e) => set('marca', e.target.value)} /></Campo>
            <Campo label="Preço no Mercado Livre (R$)" ajuda={`Consultado em ${data(r.preco_em)}. Atualizado sozinho uma vez por dia.`}>
              <input type="number" min={0} step="0.01" className={input} value={r.preco ?? ''} onChange={(e) => set('preco', num(e.target.value))} />
            </Campo>
            <Campo label="Preço antigo, riscado (opcional)"><input type="number" min={0} step="0.01" className={input} value={r.preco_de ?? ''} onChange={(e) => set('preco_de', num(e.target.value))} /></Campo>
          </section>

          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950 dark:text-white">Foto</h3>
                <p className="text-sm text-slate-500">Vem do anúncio quando o Mercado Livre responde. Você pode trocar por uma foto sua.</p>
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[rgb(var(--app-border))] px-4 text-sm font-semibold text-violet-600 hover:bg-violet-500/5">
                <ImagePlus className="h-4 w-4" /> {enviando ? 'Enviando…' : r.imagem_url ? 'Trocar foto' : 'Enviar foto'}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={enviando} onChange={(e) => { void enviarFoto(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
            {r.imagem_url && (
              <div className="mt-3 flex items-end gap-3">
                <img src={r.imagem_url} alt={r.titulo} className="h-32 w-32 rounded-xl border border-slate-200 object-contain dark:border-slate-700" />
                <button type="button" className="rounded-lg p-2 text-[#FF4D67] hover:bg-[#FF4D67]/10" onClick={() => void removerFoto()} aria-label="Remover foto"><Trash2 className="h-4 w-4" /></button>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
            <p className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><MousePointerClick className="h-4 w-4 text-violet-600" /> {r.cliques_30d} clique(s) em 30 dias · {r.cliques_total} no total</p>
            <p className="mt-1 text-slate-500">Cliques contados pelo site. Vendas e comissão aparecem no painel de afiliados do Mercado Livre.</p>
          </section>

          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-5 py-3 sm:-mx-7 sm:px-7">
            <Button icon={Save} variant="secondary" disabled={salvando} onClick={() => void salvar()}>Salvar</Button>
            <Button icon={buscando ? Loader2 : RefreshCw} variant="secondary" disabled={buscando} onClick={() => void buscar()}>Buscar no Mercado Livre</Button>
            {!r.ativo && <Button icon={Store} disabled={salvando} onClick={() => void salvar(true)}>Publicar no site</Button>}
            {r.ativo && <Button variant="secondary" disabled={salvando} onClick={() => void salvar(false)}>Tirar do site</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Conta do Mercado Livre: sem ela a API do ML não devolve nome, foto e preço dos anúncios. */
function ContaMercadoLivre({ conta, onMudou }: { conta: ContaML; onMudou: () => void }) {
  const [ocupado, setOcupado] = useState(false);

  async function conectar() {
    setOcupado(true);
    try {
      const { url } = await apiRequest<{ url: string }>('/api/loja-admin/recomendados/mercadolivre/conectar', { method: 'POST' });
      // Vai para o Mercado Livre autorizar; ele devolve para esta página com ?ml=conectado.
      window.location.href = url;
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível iniciar a conexão');
      setOcupado(false);
    }
  }

  async function desconectar() {
    const ok = await alerts.confirm({
      title: 'Desconectar o Mercado Livre?', text: 'As indicações continuam no site, mas preço e disponibilidade param de ser atualizados.',
      icon: 'warning', confirmButtonText: 'Desconectar', cancelButtonText: 'Manter',
    });
    if (!ok.isConfirmed) return;
    try {
      await apiRequest('/api/loja-admin/recomendados/mercadolivre', { method: 'DELETE' });
      toast.success('Mercado Livre desconectado');
      onMudou();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível desconectar');
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Plug className="h-4 w-4 text-violet-600" /> Conta do Mercado Livre</p>
      {!conta.configurado ? (
        <div className="mt-2 space-y-2 text-xs text-slate-600 dark:text-slate-300">
          <p>Falta configurar <code>MERCADOLIVRE_CLIENT_ID</code> e <code>MERCADOLIVRE_CLIENT_SECRET</code> no servidor (aplicativo criado no painel de desenvolvedores do Mercado Livre).</p>
          {conta.redirect_uri && (
            <p>Endereço de retorno (redirect URI) para cadastrar no aplicativo:
              <button type="button" className="mt-1 block w-full break-all rounded-lg bg-slate-100 px-2 py-1.5 text-left font-mono text-slate-800 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                onClick={() => { void navigator.clipboard?.writeText(conta.redirect_uri!); toast.success('Endereço copiado'); }}>
                {conta.redirect_uri}
              </button>
            </p>
          )}
        </div>
      ) : conta.conectado ? (
        <div className="mt-2 space-y-3 text-sm">
          <p className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Conectado{conta.apelido ? ` como ${conta.apelido}` : ''}{conta.conectado_em ? ` desde ${data(conta.conectado_em)}` : ''}</p>
          <p className="text-xs text-slate-500">O acesso é renovado sozinho. Nome, foto e preço passam a vir do anúncio.</p>
          <Button size="sm" variant="secondary" onClick={() => void desconectar()}>Desconectar</Button>
        </div>
      ) : (
        <div className="mt-2 space-y-3 text-sm">
          {conta.erro && <p className="text-xs text-amber-700">{conta.erro}</p>}
          <p className="text-xs text-slate-500">O Mercado Livre só mostra os dados dos anúncios para contas conectadas. Entre com a conta de afiliado e autorize.</p>
          <Button size="sm" icon={ocupado ? Loader2 : Plug} disabled={ocupado} onClick={() => void conectar()}>Conectar Mercado Livre</Button>
        </div>
      )}
    </div>
  );
}

export function LojaRecomendados() {
  const [params, setParams] = useSearchParams();
  const [lista, setLista] = useState<Lista | null>(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Recomendado | null>(null);
  const [novo, setNovo] = useState({ link_afiliado: '', url_anuncio: '' });
  const [criando, setCriando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLista(await apiRequest<Lista>('/api/loja-admin/recomendados'));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar os recomendados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Volta do Mercado Livre depois de autorizar (?ml=conectado ou ?ml=erro&motivo=…).
  useEffect(() => {
    const ml = params.get('ml');
    if (!ml) return;
    if (ml === 'conectado') toast.success('Mercado Livre conectado. Use "Buscar no Mercado Livre" nas indicações já cadastradas.');
    else toast.error(params.get('motivo') || 'Não foi possível conectar o Mercado Livre');
    setParams({}, { replace: true });
  }, [params, setParams]);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    if (!novo.link_afiliado.trim()) return toast.error('Cole o link de afiliado');
    setCriando(true);
    try {
      const r = await apiRequest<Recomendado>('/api/loja-admin/recomendados', { method: 'POST', body: JSON.stringify(novo) });
      if (r.aviso) toast.error(r.aviso);
      setNovo({ link_afiliado: '', url_anuncio: '' });
      setEditando(r);
      void load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível cadastrar');
    } finally {
      setCriando(false);
    }
  }

  async function mover(i: number, d: -1 | 1) {
    const itens = [...(lista?.recomendados || [])];
    const j = i + d;
    if (j < 0 || j >= itens.length) return;
    [itens[i], itens[j]] = [itens[j], itens[i]];
    setLista((atual) => (atual ? { ...atual, recomendados: itens } : atual));
    try {
      await Promise.all([i, j].map((k) => apiRequest(`/api/loja-admin/recomendados/${itens[k].id}`, { method: 'PUT', body: JSON.stringify({ ordem: k + 1 }) })));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível reordenar');
      void load();
    }
  }

  async function excluir(r: Recomendado) {
    const ok = await alerts.confirm({
      title: `Excluir "${r.titulo || 'indicação'}"?`, text: 'Sai do site e os cliques contados somem. O anúncio no Mercado Livre não muda.',
      icon: 'warning', confirmButtonText: 'Excluir', cancelButtonText: 'Manter',
    });
    if (!ok.isConfirmed) return;
    try {
      await apiRequest(`/api/loja-admin/recomendados/${r.id}`, { method: 'DELETE' });
      toast.success('Excluído');
      void load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível excluir');
    }
  }

  const itens = lista?.recomendados || [];
  const cliques30 = itens.reduce((s, r) => s + r.cliques_30d, 0);

  return (
    <PageContainer
      title="Recomendados"
      description="Produtos do Mercado Livre que a oficina indica, com o seu link de afiliado. Aparecem em luthieriabrasilia.com.br/recomendamos."
      eyebrow="Loja"
      icon={ThumbsUp}
      actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()}>Atualizar</Button>}
    >
      {lista && !lista.integrado && (
        <section className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-slate-800 dark:bg-slate-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-slate-700 dark:text-slate-300">O site ainda não está conectado a esta conta (PORTAL_SHARED_SECRET / PORTAL_TENANT_EMAIL). Dá para cadastrar, mas nada aparece no site.</p>
        </section>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card hover={false} className="p-5">
          <form className="mb-5 grid gap-2 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700" onSubmit={(e) => void criar(e)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Link2 className="h-4 w-4 text-violet-600" /> Nova indicação</p>
            <input className={`${input} mt-0`} placeholder="Link de afiliado (https://mercadolivre.com/sec/… ou https://meli.la/…)" value={novo.link_afiliado} onChange={(e) => setNovo({ ...novo, link_afiliado: e.target.value })} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <input className={`${input} mt-0`} placeholder="Endereço do anúncio (opcional, ajuda a buscar foto e preço)" value={novo.url_anuncio} onChange={(e) => setNovo({ ...novo, url_anuncio: e.target.value })} />
              <Button type="submit" size="sm" icon={criando ? Loader2 : Plus} disabled={criando}>{criando ? 'Buscando…' : 'Adicionar'}</Button>
            </div>
          </form>

          {loading && !lista ? (
            <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nenhuma indicação ainda. Cole um link de afiliado acima para começar.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {itens.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3 py-3">
                  {r.imagem_url ? <img src={r.imagem_url} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-slate-100 object-contain dark:border-slate-800" loading="lazy" />
                    : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800"><ThumbsUp className="h-6 w-6" /></div>}
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditando(r)}>
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{r.titulo || 'Sem nome'}</p>
                    <p className="text-xs text-slate-500">
                      {r.categoria ? `${r.categoria} · ` : ''}{r.preco ? `${brl(r.preco)} em ${data(r.preco_em)}` : 'sem preço'} · {r.cliques_30d} clique(s) em 30 dias
                      {r.sincronia_erro ? ' · ⚠ não atualizou' : ''}
                    </p>
                  </button>
                  <span className="hidden sm:inline"><Situacao r={r} /></span>
                  <span className="flex">
                    <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === 0} onClick={() => void mover(i, -1)} aria-label="Subir"><ArrowUp className="h-4 w-4" /></button>
                    <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === itens.length - 1} onClick={() => void mover(i, 1)} aria-label="Descer"><ArrowDown className="h-4 w-4" /></button>
                  </span>
                  <button type="button" className="rounded-lg p-2 text-[#FF4D67] hover:bg-[#FF4D67]/10" onClick={() => void excluir(r)} aria-label={`Excluir ${r.titulo}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card hover={false} className="self-start p-5">
          <h2 className="font-bold text-slate-950 dark:text-white">Como funciona</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-4 text-sm text-slate-600 dark:text-slate-300">
            <li>Conecte a conta do Mercado Livre (abaixo), uma vez só.</li>
            <li>Gere o link do produto no painel de afiliados do Mercado Livre e cole aqui.</li>
            <li>O sistema busca nome, foto e preço. Escreva por que a oficina recomenda e publique.</li>
            <li>No site, o botão leva o cliente ao Mercado Livre pelo seu link. A compra e a entrega são do Mercado Livre.</li>
            <li>Uma vez por dia o preço é conferido. Anúncio pausado sai do site sozinho.</li>
          </ol>
          <p className="mt-4 rounded-xl bg-violet-500/5 p-3 text-sm font-semibold text-slate-900 dark:text-white">{cliques30} clique(s) nos últimos 30 dias</p>
          {lista && <ContaMercadoLivre conta={lista.mercado_livre} onMudou={() => void load()} />}
        </Card>
      </div>

      {editando && <Editor key={editando.id} inicial={editando} iaAtiva={Boolean(lista?.ia)} onFechar={() => setEditando(null)} onSalvo={() => void load()} />}
    </PageContainer>
  );
}
