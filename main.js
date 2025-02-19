// 1) Chart dimensions
var margin = {top: 60, right: 30, bottom: 60, left: 150},
    width  = 1200 - margin.left - margin.right,
    height = 800  - margin.top  - margin.bottom;

// 2) Append the main SVG
var svg = d3.select("#graph")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

// 3) Prepare a tooltip reference
var tooltip = d3.select("#tooltip");

// 4) Load and process data
d3.csv("cases.csv").then(function(data) {

  // Filter rows (log-scale range 1..ebl95, remove "Others")
  let processedData = data
    .filter(d =>
       d.intraop_ebl !== "" &&
       d.intraop_ebl !== null &&
       !isNaN(d.intraop_ebl) &&
       d.optype &&
       d.optype !== "Others"
    )
    .map(d => ({
      op_type: d.optype,          
      intraop_ebl: +d.intraop_ebl
    }));

  // Compute 95th percentile
  const eblValues = processedData.map(d => d.intraop_ebl).sort(d3.ascending);
  const ebl95 = d3.quantile(eblValues, 0.95);

  // Keep only EBL in [1, ebl95]
  processedData = processedData.filter(d => d.intraop_ebl >= 1 && d.intraop_ebl <= ebl95);

  // Collect unique surgery types
  const opTypes = Array.from(new Set(processedData.map(d => d.op_type)));

  // X: log scale
  var x = d3.scaleLog()
    .domain([1, ebl95])
    .range([0, width]);

  // Custom tick values
  const customTicks = [1, 5, 10, 50, 100, 500, 1000, 5000];
  svg.append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(
      d3.axisBottom(x)
        .tickValues(customTicks)
        .tickFormat(d3.format("~s"))
    );

  // Y: point scale for the categories
  var y = d3.scalePoint()
    .domain(opTypes)
    .range([0, height])
    .padding(0.5);

  svg.append("g").call(d3.axisLeft(y));

  // Helper functions to compute stats
  function standardDeviation(values) {
    let mean = d3.mean(values);
    let variance = d3.mean(values.map(v => (v - mean)*(v - mean)));
    return Math.sqrt(variance);
  }

  // 5) Kernel Density Estimator
  var kde = kernelDensityEstimator(kernelEpanechnikov(40), x.ticks(50));

  // 6) For each surgery type: compute the KDE + stats
  var allDensity = opTypes.map(opType => {
    let values = processedData
      .filter(d => d.op_type === opType)
      .map(d => d.intraop_ebl);
    if (!values.length) return null;

    // Basic stats
    let medianVal = d3.median(values);
    let stdVal    = standardDeviation(values);
    let maxVal    = d3.max(values);
    let minVal    = d3.min(values);

    return {
      key: opType,
      density: kde(values),
      stats: {
        median: medianVal,
        std: stdVal,
        max: maxVal,
        min: minVal
      }
    };
  }).filter(d => d !== null);

  // 7) Draw violins
  var violins = svg.selectAll(".violins")
    .data(allDensity)
    .enter()
    .append("path")
      .attr("class", "violins")
      .attr("transform", d => `translate(0, ${y(d.key)})`)
      // Sort the density array so the line doesn't loop
      .each(function(d) {
        d.density = d.density.sort((a, b) => a[0] - b[0]);
      })
      // Use the line generator, referencing d.density
      .attr("d", d => d3.line()
          .curve(d3.curveBasis)
          .x(pt => x(pt[0]))
          .y(pt => -pt[1] * 8000)
        (d.density)
      )
      // 8) Add tooltip events
      .on("mouseover", function(event, d) {
        // Format your stats in the tooltip
        const html = `
          <strong>${d.key}</strong><br/>
          Average Bloodloss (Median): ${d3.format(".2f")(d.stats.median)}<br/>
          Std Dev: ${d3.format(".2f")(d.stats.std)}<br/>
          Max: ${d.stats.max}<br/>
          Min: ${d.stats.min}
        `;
        tooltip
          .style("visibility", "visible")
          .html(html);
      })
      .on("mousemove", function(event, d) {
        // Move tooltip near the mouse
        tooltip
          .style("top",  (event.pageY + 5) + "px")
          .style("left", (event.pageX + 5) + "px");
      })
      .on("mouseleave", function(event, d) {
        tooltip.style("visibility", "hidden");
      });

  // 9) Axis titles, chart title, etc.
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom * 0.8)
    .style("font-size", "16px")
    .text("Blood loss (ML)");

  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("transform", `translate(${-margin.left*0.6}, ${height/2}) rotate(-90)`)
    .style("font-size", "16px")
    .text("Surgery Type");

  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2)
    .style("font-size", "18px")
    .text("How do different surgery types correlate with blood loss?");
});

// Kernel Density Estimation helpers
function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
  };
}

function kernelEpanechnikov(k) {
  return function(v) {
    v /= k;
    return Math.abs(v) <= 1
      ? 0.75 * (1 - v*v) / k
      : 0;
  };
}