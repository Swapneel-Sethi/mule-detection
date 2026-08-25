/**
 * Ambient typings for plotly.js partial-bundle subpaths (plotly.js ships no
 * d.ts for `lib/*`). react-plotly.js ships its own types, so it is not
 * declared here.
 */
declare module "plotly.js/lib/core" {
  interface PlotlyStatic {
    /** Accepts a single trace/component module or an array of them. */
    register(modules: unknown[] | Record<string, unknown>): void;
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

