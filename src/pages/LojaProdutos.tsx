import { useCallback, useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import {
  AlertCircle, ArrowDown, ArrowUp, BookOpen, ExternalLink, FileUp, ImagePlus, Package, PlaySquare, Plus, RefreshCw, Save, Store, Trash2, X,
} from 'lucide-react';
import { PageContainer } from '../components/PageContainer';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { toast } from '../components/ToastCustom';
import { alerts } from '../utils/alerts';
import { apiRequest } from '../lib/api-client';

type Tipo = 'fisico' | 'curso' | 'ebook';
type Status = 'rascunho' | 'publicado' | 'esgotado' | 'arquivado';

interface Imagem { path: string; alt: string; url: string }
interface Aula { id: string; modulo: string | null; titulo: string; descricao: string | null; video_url: string | null; duracao_min: number | null; ordem: number; gratis: boolean }
interface Produto {
  id: string; tipo: Tipo; titulo: string; slug: string; subtitulo: string | null; descricao: string | null; condicao: 'novo' | 'seminovo' | null;
  marca: string | null; categoria: string | null; sku: string | null; preco: number; preco_de: number | null; estoque: number;
  peso_g: number | null; altura_cm: number | null; largura_cm: number | null; comprimento_cm: number | null; garantia: string | null; laudo: string | null;
  ebook_paginas: number | null; carga_horaria: string | null; destaque: boolean; status: Status; seo_titulo: string | null; seo_descricao: string | null;
  imagens: Imagem[]; tem_arquivo: boolean; aulas?: Aula[]; updated_at: string;
}
interface LojaStatus {
  integrado: boolean; mercado_pago: boolean; aviso_assinado: boolean; melhor_envio: boolean; url_aviso_pagamento: string;
  config: { loja_ativa: boolean; cep_origem: string; retirada_ativa: boolean; retirada_texto: string; envio_ativo: boolean; prazo_postagem_dias: number };
}

const SITE = 'https://luthieriabrasilia.com.br';
const TIPOS: Record<Tipo, { label: string; icon: typeof Package; caminho: string }> = {
  fisico: { label: 'Produto', icon: Package, caminho: 'loja' },
  curso: { label: 'Curso em vídeo', icon: PlaySquare, caminho: 'cursos' },
  ebook: { label: 'Ebook', icon: BookOpen, caminho: 'ebooks' },
};
const STATUS: Record<Status, { label: string; tone: string }> = {
  rascunho: { label: 'Rascunho', tone: 'bg-slate-100 text-slate-600' },
  publicado: { label: 'Publicado', tone: 'bg-emerald-50 text-emerald-700' },
  esgotado: { label: 'Esgotado', tone: 'bg-amber-50 text-amber-700' },
  arquivado: { label: 'Arquivado', tone: 'bg-slate-100 text-slate-400' },
};
const input = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white';
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Reduz a foto no navegador (até 1600 px, WebP) antes de enviar: menos espera no upload e site mais leve. */
async function prepararImagem(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível ler a imagem'))), 'image/webp', 0.85));
}

function Campo({ label, children, ajuda }: { label: string; children: React.ReactNode; ajuda?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-slate-900 dark:text-white">{label}</span>
      {children}
      {ajuda && <span className="mt-1 block text-xs text-slate-500">{ajuda}</span>}
    </label>
  );
}

function Editor({ inicial, onFechar, onSalvo }: { inicial: Produto; onFechar: () => void; onSalvo: () => void }) {
  const [p, setP] = useState<Produto>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [novaAula, setNovaAula] = useState({ modulo: '', titulo: '', video_url: '', duracao_min: '', gratis: false });
  const set = <K extends keyof Produto>(k: K, v: Produto[K]) => setP((atual) => ({ ...atual, [k]: v }));
  const num = (v: string) => (v === '' ? null : Number(v));

  async function recarregar() {
    setP(await apiRequest<Produto>(`/api/loja-admin/produtos/${p.id}`));
  }

  async function salvar(status?: Status) {
    setSalvando(true);
    try {
      const corpo = { ...p, status: status || p.status };
      const salvo = await apiRequest<Produto>(`/api/loja-admin/produtos/${p.id}`, { method: 'PUT', body: JSON.stringify(corpo) });
      setP({ ...salvo, aulas: p.aulas });
      toast.success(status === 'publicado' ? 'Publicado no site' : 'Salvo');
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function enviarFotos(files: FileList | null) {
    if (!files?.length) return;
    setEnviando(true);
    try {
      for (const file of Array.from(files)) {
        const blob = await prepararImagem(file);
        await apiRequest(`/api/loja-admin/produtos/${p.id}/imagens?alt=${encodeURIComponent(p.titulo)}`, {
          method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob,
        });
      }
      await recarregar();
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível enviar a foto');
    } finally {
      setEnviando(false);
    }
  }

  async function salvarFotos(imagens: Imagem[]) {
    try {
      const salvo = await apiRequest<Produto>(`/api/loja-admin/produtos/${p.id}/imagens`, { method: 'PUT', body: JSON.stringify({ imagens }) });
      setP((atual) => ({ ...atual, imagens: salvo.imagens }));
      onSalvo();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível atualizar as fotos');
    }
  }

  function moverFoto(i: number, d: -1 | 1) {
    const lista = [...p.imagens];
    const j = i + d;
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    void salvarFotos(lista);
  }

  async function enviarEbook(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setEnviando(true);
    try {
      await apiRequest(`/api/loja-admin/produtos/${p.id}/ebook`, { method: 'POST', headers: { 'Content-Type': 'application/pdf' }, body: file });
      toast.success('PDF enviado. Só quem comprar consegue baixar.');
      setP((atual) => ({ ...atual, tem_arquivo: true }));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível enviar o PDF');
    } finally {
      setEnviando(false);
    }
  }

  async function adicionarAula() {
    if (!novaAula.titulo.trim()) return toast.error('Informe o título da aula');
    try {
      await apiRequest(`/api/loja-admin/produtos/${p.id}/aulas`, {
        method: 'POST', body: JSON.stringify({ ...novaAula, duracao_min: Number(novaAula.duracao_min) || null }),
      });
      setNovaAula({ modulo: novaAula.modulo, titulo: '', video_url: '', duracao_min: '', gratis: false });
      await recarregar();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível adicionar a aula');
    }
  }

  async function salvarAula(aula: Aula) {
    try {
      await apiRequest(`/api/loja-admin/aulas/${aula.id}`, { method: 'PUT', body: JSON.stringify(aula) });
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar a aula');
    }
  }

  async function moverAula(i: number, d: -1 | 1) {
    const aulas = [...(p.aulas || [])];
    const j = i + d;
    if (j < 0 || j >= aulas.length) return;
    [aulas[i], aulas[j]] = [aulas[j], aulas[i]];
    const renumeradas = aulas.map((a, idx) => ({ ...a, ordem: idx + 1 }));
    setP((atual) => ({ ...atual, aulas: renumeradas }));
    await Promise.all([renumeradas[i], renumeradas[j]].map(salvarAula));
  }

  async function removerAula(aula: Aula) {
    const ok = await alerts.confirm({ title: `Remover "${aula.titulo}"?`, text: 'O vídeo continua no Panda Video; só sai do curso.', icon: 'warning', confirmButtonText: 'Remover', cancelButtonText: 'Manter' });
    if (!ok.isConfirmed) return;
    await apiRequest(`/api/loja-admin/aulas/${aula.id}`, { method: 'DELETE' });
    await recarregar();
  }

  const tipo = TIPOS[p.tipo];
  const urlSite = `${SITE}/${tipo.caminho}/${p.slug}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40" role="dialog" aria-modal="true" aria-label={`Editar ${p.titulo}`}>
      <div className="h-full w-full max-w-3xl overflow-y-auto bg-[rgb(var(--app-surface))] p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-600">{tipo.label}</p>
            <h2 className="text-xl font-bold text-slate-950 dark:text-white">{p.titulo}</h2>
            <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
            {p.status === 'publicado' && (
              <a href={urlSite} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-600">Ver no site <ExternalLink className="h-3 w-3" /></a>
            )}
          </div>
          <button type="button" onClick={onFechar} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fechar"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Campo label="Nome"><input className={input} value={p.titulo} onChange={(e) => set('titulo', e.target.value)} /></Campo></div>
            <div className="sm:col-span-2"><Campo label="Resumo (aparece abaixo do nome)"><input className={input} value={p.subtitulo || ''} onChange={(e) => set('subtitulo', e.target.value)} /></Campo></div>
            <Campo label="Preço (R$)"><input type="number" min={0} step="0.01" className={input} value={p.preco || ''} onChange={(e) => set('preco', Number(e.target.value))} /></Campo>
            <Campo label="Preço antigo, riscado (opcional)"><input type="number" min={0} step="0.01" className={input} value={p.preco_de ?? ''} onChange={(e) => set('preco_de', num(e.target.value))} /></Campo>
            {p.tipo === 'fisico' && (
              <>
                <Campo label="Condição">
                  <select className={input} value={p.condicao || ''} onChange={(e) => set('condicao', (e.target.value || null) as Produto['condicao'])}>
                    <option value="">—</option><option value="novo">Novo</option><option value="seminovo">Seminovo</option>
                  </select>
                </Campo>
                <Campo label="Estoque"><input type="number" min={0} className={input} value={p.estoque} onChange={(e) => set('estoque', Number(e.target.value))} /></Campo>
                <Campo label="Marca"><input className={input} value={p.marca || ''} onChange={(e) => set('marca', e.target.value)} /></Campo>
                <Campo label="Categoria"><input className={input} placeholder="Guitarras, Violões, Acessórios…" value={p.categoria || ''} onChange={(e) => set('categoria', e.target.value)} /></Campo>
                <Campo label="Código (SKU)"><input className={input} value={p.sku || ''} onChange={(e) => set('sku', e.target.value)} /></Campo>
                <Campo label="Garantia"><input className={input} placeholder="90 dias" value={p.garantia || ''} onChange={(e) => set('garantia', e.target.value)} /></Campo>
              </>
            )}
            {p.tipo === 'curso' && <Campo label="Carga horária"><input className={input} placeholder="3h20" value={p.carga_horaria || ''} onChange={(e) => set('carga_horaria', e.target.value)} /></Campo>}
            {p.tipo === 'ebook' && <Campo label="Páginas"><input type="number" min={1} className={input} value={p.ebook_paginas ?? ''} onChange={(e) => set('ebook_paginas', num(e.target.value))} /></Campo>}
            <div className="sm:col-span-2">
              <Campo label="Descrição" ajuda="Texto da página do produto. Linhas em branco separam parágrafos.">
                <textarea rows={6} className={input} value={p.descricao || ''} onChange={(e) => set('descricao', e.target.value)} />
              </Campo>
            </div>
            {p.tipo === 'fisico' && p.condicao === 'seminovo' && (
              <div className="sm:col-span-2">
                <Campo label="Laudo da oficina" ajuda="Estado do instrumento, o que foi revisado e marcas de uso. Passa confiança para quem compra seminovo.">
                  <textarea rows={4} className={input} value={p.laudo || ''} onChange={(e) => set('laudo', e.target.value)} />
                </Campo>
              </div>
            )}
          </section>

          {p.tipo === 'fisico' && (
            <section>
              <h3 className="font-bold text-slate-950 dark:text-white">Embalagem para o frete</h3>
              <p className="text-sm text-slate-500">Medidas da caixa já embalada. Obrigatórias para publicar, porque o frete é calculado com elas.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Campo label="Peso (g)"><input type="number" min={1} className={input} value={p.peso_g ?? ''} onChange={(e) => set('peso_g', num(e.target.value))} /></Campo>
                <Campo label="Altura (cm)"><input type="number" min={1} className={input} value={p.altura_cm ?? ''} onChange={(e) => set('altura_cm', num(e.target.value))} /></Campo>
                <Campo label="Largura (cm)"><input type="number" min={1} className={input} value={p.largura_cm ?? ''} onChange={(e) => set('largura_cm', num(e.target.value))} /></Campo>
                <Campo label="Comprimento (cm)"><input type="number" min={1} className={input} value={p.comprimento_cm ?? ''} onChange={(e) => set('comprimento_cm', num(e.target.value))} /></Campo>
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-950 dark:text-white">Fotos</h3>
                <p className="text-sm text-slate-500">A primeira é a capa. Fotos grandes são reduzidas antes do envio.</p>
              </div>
              <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[rgb(var(--app-border))] px-4 text-sm font-semibold text-violet-600 hover:bg-violet-500/5">
                <ImagePlus className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Adicionar fotos'}
                <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={enviando} onChange={(e) => { void enviarFotos(e.target.files); e.target.value = ''; }} />
              </label>
            </div>
            {p.imagens.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {p.imagens.map((img, i) => (
                  <li key={img.path} className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                    <img src={img.url} alt={img.alt} className="aspect-square w-full object-cover" loading="lazy" />
                    <div className="flex items-center justify-between p-1.5">
                      <div className="flex">
                        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === 0} onClick={() => moverFoto(i, -1)} aria-label="Mover para a esquerda"><ArrowUp className="h-4 w-4 -rotate-90" /></button>
                        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === p.imagens.length - 1} onClick={() => moverFoto(i, 1)} aria-label="Mover para a direita"><ArrowDown className="h-4 w-4 -rotate-90" /></button>
                      </div>
                      <button type="button" className="rounded-lg p-1.5 text-[#FF4D67] hover:bg-[#FF4D67]/10" onClick={() => void salvarFotos(p.imagens.filter((x) => x.path !== img.path))} aria-label="Remover foto"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {p.tipo === 'ebook' && (
            <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <h3 className="font-bold text-slate-950 dark:text-white">Arquivo do ebook</h3>
              <p className="text-sm text-slate-500">{p.tem_arquivo ? 'PDF enviado. Enviar outro substitui o atual.' : 'Nenhum PDF enviado ainda.'} O arquivo fica protegido: só baixa quem comprou, pela área do cliente.</p>
              <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-[rgb(var(--app-border))] px-4 text-sm font-semibold text-violet-600 hover:bg-violet-500/5">
                <FileUp className="h-4 w-4" /> {enviando ? 'Enviando…' : 'Enviar PDF'}
                <input type="file" accept="application/pdf" className="sr-only" disabled={enviando} onChange={(e) => { void enviarEbook(e.target.files); e.target.value = ''; }} />
              </label>
            </section>
          )}

          {p.tipo === 'curso' && (
            <section>
              <h3 className="font-bold text-slate-950 dark:text-white">Aulas</h3>
              <p className="text-sm text-slate-500">Cole o link de incorporação (embed) do vídeo no Panda Video. Aulas marcadas como grátis aparecem como amostra na página do curso.</p>
              <ol className="mt-3 space-y-2">
                {(p.aulas || []).map((aula, i) => (
                  <li key={aula.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
                      <input className={input} placeholder="Módulo" value={aula.modulo || ''} onChange={(e) => setP((a) => ({ ...a, aulas: a.aulas!.map((x) => (x.id === aula.id ? { ...x, modulo: e.target.value } : x)) }))} onBlur={() => void salvarAula(p.aulas![i])} />
                      <input className={input} placeholder="Título da aula" value={aula.titulo} onChange={(e) => setP((a) => ({ ...a, aulas: a.aulas!.map((x) => (x.id === aula.id ? { ...x, titulo: e.target.value } : x)) }))} onBlur={() => void salvarAula(p.aulas![i])} />
                      <input className={`${input} sm:col-span-2`} placeholder="https://player-vz-….tv.pandavideo.com.br/embed/?v=…" value={aula.video_url || ''} onChange={(e) => setP((a) => ({ ...a, aulas: a.aulas!.map((x) => (x.id === aula.id ? { ...x, video_url: e.target.value } : x)) }))} onBlur={() => void salvarAula(p.aulas![i])} />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">Minutos <input type="number" min={0} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" value={aula.duracao_min ?? ''} onChange={(e) => setP((a) => ({ ...a, aulas: a.aulas!.map((x) => (x.id === aula.id ? { ...x, duracao_min: num(e.target.value) } : x)) }))} onBlur={() => void salvarAula(p.aulas![i])} /></label>
                      <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-violet-600" checked={aula.gratis} onChange={(e) => { const nova = { ...aula, gratis: e.target.checked }; setP((a) => ({ ...a, aulas: a.aulas!.map((x) => (x.id === aula.id ? nova : x)) })); void salvarAula(nova); }} /> Aula grátis</label>
                      <span className="ml-auto flex">
                        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === 0} onClick={() => void moverAula(i, -1)} aria-label="Subir aula"><ArrowUp className="h-4 w-4" /></button>
                        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" disabled={i === (p.aulas || []).length - 1} onClick={() => void moverAula(i, 1)} aria-label="Descer aula"><ArrowDown className="h-4 w-4" /></button>
                        <button type="button" className="rounded-lg p-1.5 text-[#FF4D67] hover:bg-[#FF4D67]/10" onClick={() => void removerAula(aula)} aria-label="Remover aula"><Trash2 className="h-4 w-4" /></button>
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="mt-3 grid gap-2 rounded-xl border border-dashed border-slate-300 p-3 sm:grid-cols-[1fr_2fr] dark:border-slate-700">
                <input className={input} placeholder="Módulo" value={novaAula.modulo} onChange={(e) => setNovaAula({ ...novaAula, modulo: e.target.value })} />
                <input className={input} placeholder="Título da nova aula" value={novaAula.titulo} onChange={(e) => setNovaAula({ ...novaAula, titulo: e.target.value })} />
                <input className={`${input} sm:col-span-2`} placeholder="Link de incorporação do Panda Video" value={novaAula.video_url} onChange={(e) => setNovaAula({ ...novaAula, video_url: e.target.value })} />
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <label className="flex items-center gap-2 text-sm">Minutos <input type="number" min={0} className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900" value={novaAula.duracao_min} onChange={(e) => setNovaAula({ ...novaAula, duracao_min: e.target.value })} /></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet-600" checked={novaAula.gratis} onChange={(e) => setNovaAula({ ...novaAula, gratis: e.target.checked })} /> Aula grátis</label>
                  <Button size="sm" variant="secondary" icon={Plus} className="ml-auto" onClick={() => void adicionarAula()}>Adicionar aula</Button>
                </div>
              </div>
            </section>
          )}

          <section className="grid gap-4">
            <h3 className="font-bold text-slate-950 dark:text-white">Google (opcional)</h3>
            <Campo label="Título no Google" ajuda={`${(p.seo_titulo || '').length}/60. Em branco, usa o nome.`}><input maxLength={70} className={input} value={p.seo_titulo || ''} onChange={(e) => set('seo_titulo', e.target.value)} /></Campo>
            <Campo label="Descrição no Google" ajuda={`${(p.seo_descricao || '').length}/155. Em branco, usa o resumo.`}><textarea maxLength={170} rows={2} className={input} value={p.seo_descricao || ''} onChange={(e) => set('seo_descricao', e.target.value)} /></Campo>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-violet-600" checked={p.destaque} onChange={(e) => set('destaque', e.target.checked)} /> Destacar no topo da loja</label>
          </section>

          <div className="sticky bottom-0 -mx-5 flex flex-wrap gap-2 border-t border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] px-5 py-3 sm:-mx-7 sm:px-7">
            <Button icon={Save} variant="secondary" disabled={salvando} onClick={() => void salvar()}>Salvar</Button>
            {p.status !== 'publicado' && <Button icon={Store} disabled={salvando} onClick={() => void salvar('publicado')}>Publicar no site</Button>}
            {p.status === 'publicado' && <Button variant="secondary" disabled={salvando} onClick={() => void salvar('rascunho')}>Tirar do site</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function LojaProdutos() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [status, setStatus] = useState<LojaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<Tipo | 'todos'>('todos');
  const [editando, setEditando] = useState<Produto | null>(null);
  const [config, setConfig] = useState<LojaStatus['config'] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lista, st] = await Promise.all([
        apiRequest<{ produtos: Produto[] }>('/api/loja-admin/produtos'),
        apiRequest<LojaStatus>('/api/loja-admin/status'),
      ]);
      setProdutos(lista.produtos);
      setStatus(st);
      setConfig(st.config);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar a loja');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function criar(tipo: Tipo) {
    const { value: titulo } = await Swal.fire<string>({
      title: `Novo ${TIPOS[tipo].label.toLowerCase()}`, input: 'text', inputLabel: 'Nome', showCancelButton: true,
      confirmButtonText: 'Criar', cancelButtonText: 'Cancelar', confirmButtonColor: '#8b5cf6',
      inputValidator: (v) => (v.trim() ? null : 'Informe o nome'),
    });
    if (!titulo) return;
    try {
      const novo = await apiRequest<Produto>('/api/loja-admin/produtos', { method: 'POST', body: JSON.stringify({ tipo, titulo, condicao: tipo === 'fisico' ? 'novo' : null }) });
      setEditando({ ...novo, aulas: [] });
      void load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível criar');
    }
  }

  async function abrir(p: Produto) {
    try {
      setEditando(await apiRequest<Produto>(`/api/loja-admin/produtos/${p.id}`));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível abrir');
    }
  }

  async function excluir(p: Produto) {
    const ok = await alerts.confirm({
      title: `Excluir "${p.titulo}"?`,
      text: 'Se já tiver sido vendido, ele só é arquivado, para os pedidos e o acesso de quem comprou continuarem funcionando.',
      icon: 'warning', confirmButtonText: 'Excluir', cancelButtonText: 'Manter',
    });
    if (!ok.isConfirmed) return;
    try {
      const r = await apiRequest<{ arquivado?: boolean }>(`/api/loja-admin/produtos/${p.id}`, { method: 'DELETE' });
      toast.success(r.arquivado ? 'Arquivado (já tinha vendas)' : 'Excluído');
      void load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível excluir');
    }
  }

  async function salvarConfig() {
    if (!config) return;
    try {
      setConfig(await apiRequest<LojaStatus['config']>('/api/loja-admin/config', { method: 'PUT', body: JSON.stringify(config) }));
      toast.success('Configuração da loja salva');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar');
    }
  }

  const lista = produtos.filter((p) => filtro === 'todos' || p.tipo === filtro);
  const pendencias = status ? [
    !status.integrado && 'O site ainda não está conectado a esta conta (PORTAL_SHARED_SECRET / PORTAL_TENANT_EMAIL).',
    !status.mercado_pago && 'Pagamento: falta MERCADOPAGO_ACCESS_TOKEN no servidor. Sem ele o site mostra os produtos mas não finaliza compras.',
    !status.melhor_envio && 'Frete: falta MELHOR_ENVIO_TOKEN. Enquanto isso, produtos físicos só podem ser retirados na loja.',
  ].filter(Boolean) as string[] : [];

  return (
    <PageContainer
      title="Loja do site"
      description="Instrumentos novos e seminovos, cursos em vídeo e ebooks vendidos em luthieriabrasilia.com.br."
      eyebrow="Loja"
      icon={Store}
      actions={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => void load()}>Atualizar</Button>}
    >
      {pendencias.length > 0 && (
        <section className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-slate-800 dark:bg-slate-900">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <ul className="list-disc space-y-1 pl-4 text-sm text-slate-700 dark:text-slate-300">{pendencias.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>
      )}

      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card hover={false} className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filtrar por tipo">
              {(['todos', 'fisico', 'curso', 'ebook'] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={filtro === t} onClick={() => setFiltro(t)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filtro === t ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                  {t === 'todos' ? 'Todos' : TIPOS[t].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon={Package} onClick={() => void criar('fisico')}>Produto</Button>
              <Button size="sm" variant="secondary" icon={PlaySquare} onClick={() => void criar('curso')}>Curso</Button>
              <Button size="sm" variant="secondary" icon={BookOpen} onClick={() => void criar('ebook')}>Ebook</Button>
            </div>
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Carregando…</p>
          ) : lista.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Nada cadastrado ainda. Comece por um produto, curso ou ebook.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {lista.map((p) => {
                const Icone = TIPOS[p.tipo].icon;
                return (
                  <li key={p.id} className="flex items-center gap-3 py-3">
                    {p.imagens[0] ? <img src={p.imagens[0].url} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" loading="lazy" />
                      : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Icone className="h-6 w-6" /></div>}
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void abrir(p)}>
                      <p className="truncate font-semibold text-slate-900 dark:text-white">{p.titulo}</p>
                      <p className="text-xs text-slate-500">
                        {TIPOS[p.tipo].label}{p.condicao ? ` · ${p.condicao}` : ''} · {brl(p.preco)}{p.tipo === 'fisico' ? ` · ${p.estoque} em estoque` : ''}
                      </p>
                    </button>
                    <span className={`hidden rounded-full px-2.5 py-0.5 text-xs font-semibold sm:inline ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span>
                    <button type="button" className="rounded-lg p-2 text-[#FF4D67] hover:bg-[#FF4D67]/10" onClick={() => void excluir(p)} aria-label={`Excluir ${p.titulo}`}><Trash2 className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card hover={false} className="self-start p-5">
          <h2 className="font-bold text-slate-950 dark:text-white">Entrega e loja</h2>
          {config && (
            <div className="mt-4 space-y-4">
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900 dark:text-white">Loja visível no site<input type="checkbox" className="h-5 w-5 accent-violet-600" checked={config.loja_ativa} onChange={(e) => setConfig({ ...config, loja_ativa: e.target.checked })} /></label>
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900 dark:text-white">Retirada na loja<input type="checkbox" className="h-5 w-5 accent-violet-600" checked={config.retirada_ativa} onChange={(e) => setConfig({ ...config, retirada_ativa: e.target.checked })} /></label>
              {config.retirada_ativa && <Campo label="Texto da retirada"><input className={input} value={config.retirada_texto} onChange={(e) => setConfig({ ...config, retirada_texto: e.target.value })} /></Campo>}
              <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-900 dark:text-white">Envio pelos Correios e transportadoras<input type="checkbox" className="h-5 w-5 accent-violet-600" checked={config.envio_ativo} onChange={(e) => setConfig({ ...config, envio_ativo: e.target.checked })} /></label>
              <Campo label="CEP de onde sai o envio"><input className={input} inputMode="numeric" value={config.cep_origem} onChange={(e) => setConfig({ ...config, cep_origem: e.target.value })} /></Campo>
              <Campo label="Dias para postar" ajuda="Somados ao prazo da transportadora."><input type="number" min={0} max={30} className={input} value={config.prazo_postagem_dias} onChange={(e) => setConfig({ ...config, prazo_postagem_dias: Number(e.target.value) })} /></Campo>
              <Button icon={Save} fullWidth onClick={() => void salvarConfig()}>Salvar</Button>
            </div>
          )}
        </Card>
      </div>

      {editando && <Editor key={editando.id} inicial={editando} onFechar={() => setEditando(null)} onSalvo={() => void load()} />}
    </PageContainer>
  );
}
