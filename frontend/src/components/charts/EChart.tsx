import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import {
  GridComponent, TooltipComponent, LegendComponent, AriaComponent, GraphicComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

echarts.use([
  LineChart, BarChart, PieChart,
  GridComponent, TooltipComponent, LegendComponent, AriaComponent, GraphicComponent,
  SVGRenderer,
]);

interface Props {
  option: EChartsCoreOption;
  height: number;
  /** What the chart shows, for screen readers. */
  label: string;
  onClick?: (params: any) => void;
}

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** One Apache ECharts chart that follows the size of its container. */
export default function EChart({ option, height, label, onClick }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const clickHandler = useRef(onClick);
  clickHandler.current = onClick;

  useEffect(() => {
    if (!holder.current) return;
    const instance = echarts.init(holder.current, undefined, { renderer: 'svg' });
    chart.current = instance;
    instance.on('click', params => clickHandler.current?.(params));

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(holder.current);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(
      { animation: !reducedMotion(), animationDuration: 500, aria: { enabled: true }, ...option },
      true,
    );
  }, [option]);

  // ECharts gives its canvas a fixed pixel width. Drawn in an absolutely
  // positioned layer, that width cannot hold the card open, so the chart
  // shrinks with the page as well as grows.
  return (
    <div style={{ position: 'relative', height, width: '100%', minWidth: 0 }}>
      <div
        ref={holder}
        role="img"
        aria-label={label}
        style={{ position: 'absolute', inset: 0, cursor: onClick ? 'pointer' : undefined }}
      />
    </div>
  );
}
