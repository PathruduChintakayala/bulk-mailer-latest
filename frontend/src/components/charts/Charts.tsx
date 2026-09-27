import { useMemo, useState } from 'react';
import { BarChart3, Table2 } from 'lucide-react';
import EChart from './EChart';
import {
  SERIES_ORDER, ORDINAL_BLUE, STATUS, INK, GRID_LINE, SURFACE, FONT,
  tooltipBase, axisLabel, legendBase, compact, formatBucket,
} from './chartTheme';

type Row = { bucket: string; [key: string]: string | number };

function EmptyChart({ height = 240, message = 'No data for this period' }: { height?: number; message?: string }) {
  return (
    <div className="flex items-center justify-center text-sm text-gray-500" style={{ height }}>
      {message}
    </div>
  );
}

const dot = (color: string) =>
  `<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>`;

// ─── Card with a chart / table switch ─────────────────────────────────

export function ChartCard({
  title, subtitle, children, table, className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** The same numbers as a table, for anyone who cannot read the chart. */
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
}) {
  const [showTable, setShowTable] = useState(false);
  const hasTable = !!table && table.rows.length > 0;
  return (
    <section className={`card-static p-5 min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        {hasTable && (
          <button
            type="button"
            onClick={() => setShowTable(v => !v)}
            aria-pressed={showTable}
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-900 px-2 py-1 rounded-lg hover:bg-gray-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            {showTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>
      {showTable && hasTable ? (
        <div className="overflow-auto max-h-[300px] border border-gray-100 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 sticky top-0">
              <tr>
                {table!.columns.map((c, i) => (
                  <th key={c} scope="col" className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {table!.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, i) => (
                    <td key={i} className={`px-3 py-1.5 ${i === 0 ? 'text-left text-gray-700' : 'text-right tabular-nums text-gray-900'}`}>
                      {typeof cell === 'number' ? cell.toLocaleString() : cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : children}
    </section>
  );
}

// ─── Trend over time ──────────────────────────────────────────────────

export function TrendChart({
  data, keys, labels, colors = SERIES_ORDER, height = 280,
}: {
  data: Row[];
  keys: string[];
  labels: Record<string, string>;
  colors?: readonly string[];
  height?: number;
}) {
  const option = useMemo(() => ({
    color: [...colors],
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 16, top: 16, bottom: keys.length > 1 ? 40 : 8, containLabel: true },
    legend: keys.length > 1 ? { ...legendBase, bottom: 0, left: 'center' } : undefined,
    tooltip: {
      ...tooltipBase,
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: '#cbd5e1', width: 1 } },
      formatter: (items: any[]) => {
        if (!items?.length) return '';
        const head = `<div style="font-weight:600;margin-bottom:4px">${formatBucket(items[0].axisValue, true)}</div>`;
        return head + items.map(i =>
          `<div style="display:flex;justify-content:space-between;gap:16px">`
          + `<span style="color:${INK.secondary}">${dot(i.color)}${i.seriesName}</span>`
          + `<strong>${Number(i.value).toLocaleString()}</strong></div>`
        ).join('');
      },
    },
    xAxis: {
      type: 'category',
      data: data.map(d => d.bucket),
      boundaryGap: false,
      axisLine: { lineStyle: { color: GRID_LINE } },
      axisTick: { show: false },
      axisLabel: {
        ...axisLabel,
        formatter: (v: string) => formatBucket(v),
        hideOverlap: true,
        // Keep the first and last label inside the plot instead of cut off
        alignMinLabel: 'left',
        alignMaxLabel: 'right',
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: GRID_LINE, type: 'solid' } },
      axisLabel: { ...axisLabel, formatter: (v: number) => compact(v) },
    },
    series: keys.map((key, i) => ({
      name: labels[key] || key,
      type: 'line',
      data: data.map(d => Number(d[key] || 0)),
      // Straight segments: a curve would bulge into days that had no email
      smooth: false,
      // A single day has no line to draw, so its point must be visible
      showSymbol: data.length <= 2,
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { borderColor: SURFACE, borderWidth: 2 },
      lineStyle: { width: 2, cap: 'round', join: 'round' },
      areaStyle: i === 0 ? { opacity: 0.1 } : undefined,
      emphasis: { focus: 'series' },
    })),
  }), [data, keys, labels, colors]);

  if (!data.length) return <EmptyChart height={height} />;
  const summary = keys.map(k => `${labels[k] || k}: ${data.reduce((s, d) => s + Number(d[k] || 0), 0).toLocaleString()}`).join(', ');
  return <EChart option={option} height={height} label={`Trend over time. Totals: ${summary}`} />;
}

export function trendTable(data: Row[], keys: string[], labels: Record<string, string>) {
  return {
    columns: ['Date', ...keys.map(k => labels[k] || k)],
    rows: data.map(d => [formatBucket(d.bucket, true), ...keys.map(k => Number(d[k] || 0))]),
  };
}

// ─── Horizontal bars, one per state ───────────────────────────────────

export function StatusBars({
  data, height,
}: {
  data: { key: string; value: number }[];
  height?: number;
}) {
  const shown = data.filter(d => d.value > 0);
  const chartHeight = height ?? Math.max(shown.length * 44 + 24, 120);
  const option = useMemo(() => ({
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 48, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: any) => `${dot(p.color)}${p.name}: <strong>${Number(p.value).toLocaleString()}</strong>`,
    },
    xAxis: { type: 'value', show: false },
    yAxis: {
      type: 'category',
      inverse: true,
      data: shown.map(d => STATUS[d.key]?.label || d.key),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, color: INK.secondary, fontSize: 12 },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 18,
      data: shown.map(d => ({
        value: d.value,
        itemStyle: { color: STATUS[d.key]?.color || '#94a3b8', borderRadius: [0, 4, 4, 0] },
      })),
      label: {
        show: true, position: 'right', color: INK.primary, fontSize: 12, fontWeight: 600,
        formatter: (p: any) => Number(p.value).toLocaleString(),
      },
    }],
  }), [shown]);

  if (!shown.length) return <EmptyChart height={160} message="Nothing to show yet" />;
  return (
    <EChart
      option={option}
      height={chartHeight}
      label={`Counts by status: ${shown.map(d => `${STATUS[d.key]?.label || d.key} ${d.value}`).join(', ')}`}
    />
  );
}

// ─── Share of a whole ─────────────────────────────────────────────────

export function StatusDonut({
  data, totalLabel = 'recipients', height = 260,
}: {
  data: { key: string; value: number }[];
  totalLabel?: string;
  height?: number;
}) {
  const shown = data.filter(d => d.value > 0);
  const total = shown.reduce((s, d) => s + d.value, 0);
  const option = useMemo(() => ({
    textStyle: { fontFamily: FONT },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: any) =>
        `${dot(p.color)}${p.name}: <strong>${Number(p.value).toLocaleString()}</strong> (${p.percent}%)`,
    },
    legend: {
      ...legendBase,
      bottom: 0,
      left: 'center',
      formatter: (name: string) => {
        const item = shown.find(d => (STATUS[d.key]?.label || d.key) === name);
        return item ? `${name}  ${item.value.toLocaleString()}` : name;
      },
    },
    graphic: [{
      type: 'group', left: 'center', top: '36%',
      children: [
        { type: 'text', style: { text: compact(total), fill: INK.primary, font: `700 26px ${FONT}`, textAlign: 'center' } },
        { type: 'text', top: 32, style: { text: totalLabel, fill: INK.muted, font: `12px ${FONT}`, textAlign: 'center' } },
      ],
    }],
    series: [{
      type: 'pie',
      radius: ['56%', '78%'],
      center: ['50%', '44%'],
      avoidLabelOverlap: true,
      padAngle: 2,
      itemStyle: { borderColor: SURFACE, borderWidth: 2, borderRadius: 4 },
      label: { show: false },
      emphasis: { scaleSize: 4 },
      data: shown.map(d => ({
        name: STATUS[d.key]?.label || d.key,
        value: d.value,
        itemStyle: { color: STATUS[d.key]?.color || '#94a3b8' },
      })),
    }],
  }), [shown, total, totalLabel]);

  if (!shown.length) return <EmptyChart height={height} message="No recipients yet" />;
  return (
    <EChart
      option={option}
      height={height}
      label={`${total} ${totalLabel}: ${shown.map(d => `${STATUS[d.key]?.label || d.key} ${d.value}`).join(', ')}`}
    />
  );
}

// ─── Funnel: each step as a share of the first ────────────────────────

export function FunnelSteps({
  steps, height,
}: {
  steps: { label: string; value: number }[];
  height?: number;
}) {
  const base = steps[0]?.value || 0;
  const chartHeight = height ?? steps.length * 46 + 16;
  const option = useMemo(() => ({
    textStyle: { fontFamily: FONT },
    grid: { left: 8, right: 96, top: 8, bottom: 8, containLabel: true },
    tooltip: {
      ...tooltipBase,
      trigger: 'item',
      formatter: (p: any) => {
        const share = base ? ((p.value / base) * 100).toFixed(1) : '0';
        return `${dot(p.color)}${p.name}: <strong>${Number(p.value).toLocaleString()}</strong>`
          + `<div style="color:${INK.muted}">${share}% of ${steps[0].label.toLowerCase()}</div>`;
      },
    },
    xAxis: { type: 'value', show: false, max: Math.max(base, ...steps.map(s => s.value), 1) },
    yAxis: {
      type: 'category',
      inverse: true,
      data: steps.map(s => s.label),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { ...axisLabel, color: INK.secondary, fontSize: 12 },
    },
    series: [{
      type: 'bar',
      barMaxWidth: 20,
      showBackground: true,
      backgroundStyle: { color: '#f4f6f8', borderRadius: [0, 4, 4, 0] },
      data: steps.map((s, i) => ({
        value: s.value,
        itemStyle: { color: ORDINAL_BLUE[Math.min(i, ORDINAL_BLUE.length - 1)], borderRadius: [0, 4, 4, 0] },
      })),
      label: {
        show: true, position: 'right', color: INK.primary, fontSize: 12,
        formatter: (p: any) => {
          const share = base && p.dataIndex > 0 ? `  {muted|${((p.value / base) * 100).toFixed(0)}%}` : '';
          return `{value|${Number(p.value).toLocaleString()}}${share}`;
        },
        rich: {
          value: { fontWeight: 600, color: INK.primary, fontSize: 12 },
          muted: { color: INK.muted, fontSize: 11 },
        },
      },
    }],
  }), [steps, base]);

  if (!steps.length || !steps.some(s => s.value > 0)) {
    return <EmptyChart height={chartHeight} message="Nothing sent yet" />;
  }
  return (
    <EChart
      option={option}
      height={chartHeight}
      label={`Funnel: ${steps.map(s => `${s.label} ${s.value}`).join(', ')}`}
    />
  );
}

// ─── Two rates per campaign ───────────────────────────────────────────

export interface RateItem { code: string; name: string; openRate: number; clickRate: number; sent: number }

export function RateComparison({
  items, onSelect,
}: {
  items: RateItem[];
  onSelect?: (code: string) => void;
}) {
  const height = items.length * 58 + 56;
  const option = useMemo(() => {
    const peak = Math.max(...items.flatMap(i => [i.openRate, i.clickRate]), 0);
    return {
      color: [SERIES_ORDER[1], SERIES_ORDER[2]],
      textStyle: { fontFamily: FONT },
      grid: { left: 8, right: 52, top: 8, bottom: 40, containLabel: true },
      legend: { ...legendBase, bottom: 0, left: 'center' },
      tooltip: {
        ...tooltipBase,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(15,23,42,0.04)' } },
        formatter: (rows: any[]) => {
          const item = items[rows[0].dataIndex];
          return `<div style="font-weight:600">${item.name}</div>`
            + `<div style="color:${INK.muted};margin-bottom:4px">${item.sent.toLocaleString()} sent</div>`
            + rows.map(r =>
              `<div style="display:flex;justify-content:space-between;gap:16px">`
              + `<span style="color:${INK.secondary}">${dot(r.color)}${r.seriesName}</span>`
              + `<strong>${Number(r.value).toFixed(1)}%</strong></div>`).join('');
        },
      },
      xAxis: {
        type: 'value',
        // Rates share one axis; leave room for the value at the bar end
        max: Math.min(100, Math.max(10, Math.ceil((peak * 1.15) / 10) * 10)),
        splitLine: { lineStyle: { color: GRID_LINE, type: 'solid' } },
        axisLabel: { ...axisLabel, formatter: '{value}%' },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: items.map(i => i.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, color: INK.secondary, fontSize: 12, width: 130, overflow: 'truncate' },
      },
      series: [
        { name: 'Open rate', key: 'openRate' as const },
        { name: 'Click rate', key: 'clickRate' as const },
      ].map(s => ({
        name: s.name,
        type: 'bar',
        barMaxWidth: 14,
        barGap: '20%',
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        data: items.map(i => Number(i[s.key].toFixed(1))),
        label: {
          show: true, position: 'right', color: INK.primary, fontSize: 11,
          formatter: (p: any) => `${Number(p.value).toFixed(0)}%`,
        },
      })),
    };
  }, [items]);

  if (!items.length) return <EmptyChart height={200} message="Send a campaign to compare results" />;
  return (
    <EChart
      option={option}
      height={height}
      label={`Open and click rate per campaign: ${items.map(i => `${i.name} ${i.openRate.toFixed(0)}% opens, ${i.clickRate.toFixed(0)}% clicks`).join('; ')}`}
      onClick={onSelect ? (p: any) => { const item = items[p.dataIndex]; if (item) onSelect(item.code); } : undefined}
    />
  );
}

// ─── Sparkline for a stat tile ────────────────────────────────────────

export function Sparkline({ data, color = SERIES_ORDER[0], label }: { data: number[]; color?: string; label: string }) {
  const option = useMemo(() => ({
    grid: { left: 2, right: 2, top: 4, bottom: 2 },
    xAxis: { type: 'category', show: false, boundaryGap: false, data: data.map((_, i) => i) },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { show: false },
    series: [{
      type: 'line', data, smooth: false, showSymbol: false, silent: true,
      lineStyle: { width: 1.5, color }, areaStyle: { color, opacity: 0.1 },
    }],
  }), [data, color]);

  if (data.length < 2 || !data.some(v => v > 0)) return <div style={{ height: 36 }} />;
  return <EChart option={option} height={36} label={label} />;
}
