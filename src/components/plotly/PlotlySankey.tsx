"use client";

/**
 * Sankey-only Plotly build.
 *
 * The default `react-plotly.js` import bundles every Plotly trace type —
 * several MB of minified JS. This factory registers only the sankey trace,
 * keeping the client payload to a fraction of that. If another trace type is
 * needed later, register its module from `plotly.js/lib/*` here.
 */
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js/lib/core";
import Sankey from "plotly.js/lib/sankey";

Plotly.register([Sankey]);

const Plot = createPlotlyComponent(Plotly);

export default Plot;
