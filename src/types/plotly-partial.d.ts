/** Minimal ambient typings for plotly.js partial-bundle subpaths (no public d.ts). */
declare module "plotly.js/lib/core" {
  interface PlotlyStatic {
    register(modules: unknown[]): void;
    newPlot(el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown): unknown;
    react(el: HTMLElement, data: unknown[], layout?: unknown, config?: unknown): unknown;
    purge(el: HTMLElement): void;
    plots: { resize(el: HTMLElement): void };
  }
  const Plotly: PlotlyStatic;
  export default Plotly;
}

declare module "plotly.js/lib/sankey" {
  const SankeyTrace: { moduleType?: string } & Record<string, unknown>;
  export default SankeyTrace;
}

declare module "react-plotly.js/factory" {
  import type { ComponentType } from "react";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function createPlotlyComponent(Plotly: unknown): ComponentType<any>;
  export default createPlotlyComponent;
}
