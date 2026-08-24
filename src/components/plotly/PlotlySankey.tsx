"use client";

/**
 * Sankey-only Plotly build.
 *
 * The default `react-plotly.js` import bundles ALL ~50 trace types (~3.5 MB min /
 * 4.65 MB chunk measured). This factory registers only the sankey trace, cutting
 * the client payload by ~4 MB. If another trace type is needed later, register
 * its module from `plotly.js/lib/*` here.
 */
import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js/lib/core";
import Sankey from "plotly.js/lib/sankey";

Plotly.register([Sankey]);

const Plot = createPlotlyComponent(Plotly);

export default Plot;
