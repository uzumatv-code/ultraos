/**
 * Tema dos gráficos derivado dos tokens CSS.
 *
 * Evita cores cravadas dentro das telas: os gráficos passam a acompanhar
 * o tema claro/escuro automaticamente e usam a mesma paleta semântica do
 * resto do sistema (receita = sucesso, despesa = perigo, e assim por diante).
 */

import { useEffect, useState } from 'react';
import { getTheme, themeChangeEvent, type Theme } from './theme';

function readToken(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--ui-${name}`).trim();
  return value ? `rgb(${value.replaceAll(' ', ' ')})` : fallback;
}

function rgba(name: string, alpha: number, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--ui-${name}`).trim();
  return value ? `rgb(${value} / ${alpha})` : fallback;
}

export type ChartPalette = ReturnType<typeof buildChartPalette>;

export function buildChartPalette() {
  return {
    text: readToken('text', '#0f1420'),
    muted: readToken('text-muted', '#5c687e'),
    grid: rgba('border', 0.65, 'rgba(203,213,225,0.65)'),
    surface: readToken('surface-2', '#ffffff'),
    border: readToken('border', '#e2e8f0'),
    brand: readToken('brand', '#7c3aed'),
    brandSoft: rgba('brand', 0.16, 'rgba(124,58,237,0.16)'),
    success: readToken('success', '#059669'),
    successSoft: rgba('success', 0.16, 'rgba(5,150,105,0.16)'),
    danger: readToken('danger', '#e11d48'),
    dangerSoft: rgba('danger', 0.14, 'rgba(225,29,72,0.14)'),
    warning: readToken('warning', '#b45309'),
    info: readToken('info', '#0284c7'),
    accent: readToken('accent', '#0891b2'),
  };
}

/** Recalcula a paleta sempre que o tema muda. */
export function useChartPalette() {
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  const [palette, setPalette] = useState<ChartPalette>(() => buildChartPalette());

  useEffect(() => {
    function handleChange(event: Event) {
      setThemeState((event as CustomEvent<Theme>).detail);
      // Aguarda o navegador aplicar as novas variáveis antes de relê-las.
      requestAnimationFrame(() => setPalette(buildChartPalette()));
    }
    window.addEventListener(themeChangeEvent, handleChange);
    return () => window.removeEventListener(themeChangeEvent, handleChange);
  }, []);

  return { palette, theme };
}

/** Opções base compartilhadas por todos os gráficos do sistema. */
export function baseChartOptions(palette: ChartPalette) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: palette.muted,
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          pointStyle: 'circle' as const,
          padding: 16,
          font: { size: 11, weight: 600 as const },
        },
      },
      tooltip: {
        backgroundColor: palette.surface,
        titleColor: palette.text,
        bodyColor: palette.muted,
        borderColor: palette.border,
        borderWidth: 1,
        padding: 12,
        cornerRadius: 10,
        displayColors: true,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        ticks: { color: palette.muted, font: { size: 11 } },
        grid: { display: false },
        border: { color: palette.border },
      },
      y: {
        ticks: {
          color: palette.muted,
          font: { size: 11 },
          callback: (value: string | number) => compactCurrency(Number(value)),
        },
        grid: { color: palette.grid },
        border: { display: false },
      },
    },
  };
}

/** R$ 12,4 mil — usado em eixos e KPIs onde o valor exato atrapalha a leitura. */
export function compactCurrency(value: number) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `R$ ${(value / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1_000) return `R$ ${(value / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}
