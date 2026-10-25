/**
 * Fluxo de caixa: entradas e saídas em barras e o saldo acumulado em linha.
 * Em períodos curtos mostra dia a dia; sempre oferece a tendência de 12 meses.
 */

import { useMemo, useState } from 'react';
import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LineController, LineElement,
  LinearScale, PointElement, Tooltip, type TooltipItem,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { baseChartOptions, useChartPalette } from '../../lib/chart-theme';
import { formatCurrency } from '../../utils/formatters';
import { parseLocalDate, todayLocalDate } from '../../utils/dates';
import { Segmented } from '../ui';

ChartJS.register(BarController, LineController, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

type Daily = { dia: string; entradas: number; saidas: number };
type Monthly = { mes: string; entradas: number; saidas: number };
type View = 'periodo' | 'meses';

function dayLabel(day: string, total: number) {
  const date = parseLocalDate(day)!;
  if (total <= 7) return date.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }).replace('.', '').replace(',', '');
  return String(date.getDate());
}

function monthLabel(month: string) {
  const [year, value] = month.split('-').map(Number);
  return new Date(year, value - 1, 1).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
}

export function CashFlowChart({ daily, monthly }: { daily: Daily[]; monthly: Monthly[] }) {
  const { palette } = useChartPalette();
  const [view, setView] = useState<View>('periodo');
  const active: View = daily.length ? view : 'meses';

  const points = useMemo(
    () =>
      active === 'periodo'
        ? daily.map((item) => ({ label: dayLabel(item.dia, daily.length), entradas: item.entradas, saidas: item.saidas, future: item.dia > todayLocalDate() }))
        : monthly.map((item) => ({ label: monthLabel(item.mes), entradas: item.entradas, saidas: item.saidas, future: false })),
    [active, daily, monthly],
  );

  const data = useMemo(() => {
    // O acumulado para em hoje: dias futuros ainda não aconteceram.
    let running = 0;
    const balance = points.map((point) => {
      if (point.future) return null;
      running = Number((running + point.entradas - point.saidas).toFixed(2));
      return running;
    });
    return {
      labels: points.map((point) => point.label),
      datasets: [
        {
          type: 'line' as const,
          label: active === 'periodo' ? 'Saldo acumulado' : 'Saldo do mês',
          data: active === 'periodo' ? balance : points.map((point) => Number((point.entradas - point.saidas).toFixed(2))),
          borderColor: palette.brand,
          backgroundColor: palette.brandSoft,
          borderWidth: 2,
          pointRadius: points.length > 14 ? 0 : 3,
          pointHoverRadius: 4,
          tension: 0.3,
          order: 0,
          // No dia a dia o acumulado cresce muito mais que cada barra; ganha um eixo próprio à direita.
          yAxisID: active === 'periodo' ? 'y1' : 'y',
        },
        {
          type: 'bar' as const,
          label: 'Entradas',
          data: points.map((point) => point.entradas),
          backgroundColor: palette.success,
          borderRadius: 4,
          maxBarThickness: 28,
          order: 1,
        },
        {
          type: 'bar' as const,
          label: 'Saídas',
          data: points.map((point) => point.saidas),
          backgroundColor: palette.danger,
          borderRadius: 4,
          maxBarThickness: 28,
          order: 1,
        },
      ],
    };
  }, [active, palette, points]);

  const options = useMemo(() => {
    const base = baseChartOptions(palette);
    return {
      ...base,
      scales: {
        ...base.scales,
        y1: {
          ...base.scales.y,
          display: active === 'periodo',
          position: 'right' as const,
          grid: { display: false },
        },
      },
      plugins: {
        ...base.plugins,
        legend: { ...base.plugins.legend, position: 'top' as const, align: 'end' as const },
        tooltip: {
          ...base.plugins.tooltip,
          callbacks: { label: (item: TooltipItem<'bar' | 'line'>) => ` ${item.dataset.label}: ${formatCurrency(Number(item.parsed.y))}` },
        },
      },
    };
  }, [active, palette]);

  const empty = points.every((point) => !point.entradas && !point.saidas);

  return (
    <section className="ui-panel ui-panel-flush flex flex-col" aria-labelledby="cashflow-title">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 id="cashflow-title" className="dash-section-title">
            Fluxo de caixa
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {active === 'periodo' ? 'Dinheiro que entrou e saiu, dia a dia' : 'Entradas e saídas dos últimos 12 meses'}
          </p>
        </div>
        {daily.length > 0 && (
          <Segmented<View>
            value={active}
            onChange={setView}
            options={[
              { value: 'periodo', label: 'Dia a dia' },
              { value: 'meses', label: '12 meses' },
            ]}
          />
        )}
      </header>
      <div className="relative h-72 p-3 sm:p-4">
        <Chart type="bar" data={data} options={options} />
        {empty && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-ink-subtle">
            Nenhum movimento neste período.
          </p>
        )}
      </div>
    </section>
  );
}
