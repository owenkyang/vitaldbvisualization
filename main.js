var margin = {top: 60, right: 30, bottom: 40, left: 150},
    width  = 1200 - margin.left - margin.right, // widened
    height = 500   - margin.top  - margin.bottom;

// 2) Append the main SVG
var svg = d3.select("#graph")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// 3) Load and process data
d3.csv("cases.csv").then(function(data) {

  // Filter rows:
  //   - EBL is non‐empty and numeric
  //   - `optype` is defined and not "Other"
  let processedData = data
    .filter(d => {
      // Keep only if:
      // 1) `intraop_ebl` is valid numeric
      // 2) `optype` is not "Other" and not empty
      return d.intraop_ebl !== "" 
          && d.intraop_ebl !== null 
          && !isNaN(d.intraop_ebl)
          && d.optype
          && d.optype !== "Other";
    })
    .map(d => ({
      op_type: d.optype,          // Each surgery type
      intraop_ebl: +d.intraop_ebl // Numeric EBL
    }));

  // 4) Identify a cutoff to remove extreme outliers (e.g., 95th percentile)
  const eblValues = processedData.map(d => d.intraop_ebl).sort(d3.ascending);
  const ebl95 = d3.quantile(eblValues, 0.95); // 95th percentile

  // Keep only EBL in [1, ebl95] for log scale
  processedData = processedData.filter(d => d.intraop_ebl >= 1 && d.intraop_ebl <= ebl95);

  // 5) Get unique surgery types (optype) for the y‐axis
  const opTypes = Array.from(new Set(processedData.map(d => d.op_type)));

  // 6) Define a log scale for x
  var x = d3.scaleLog()
    .domain([1, ebl95])
    .range([0, width]);

  // Choose a custom set of tick values
  const customTicks = [1, 5, 10, 50, 100, 500, 1000, 5000];

  // Draw the bottom axis
  svg.append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(
      d3.axisBottom(x)
        .tickValues(customTicks)
        .tickFormat(d3.format("~s"))  // e.g. "1", "500", "1k"
    );

  // 7) Define y scale for the surgery types
  var y = d3.scaleBand()
    .domain(opTypes)
    .range([0, height])
    .padding(0.5);

  // Draw left axis
  svg.append("g")
    .call(d3.axisLeft(y));

  // 8) Kernel Density Estimation setup
  //    Feel free to adjust the bandwidth
  var kde = kernelDensityEstimator(kernelEpanechnikov(35), x.ticks(40));

  // For each surgery type, compute the KDE
  var allDensity = opTypes.map(opType => {
    // Filter data for this opType
    let values = processedData
      .filter(d => d.op_type === opType)
      .map(d => d.intraop_ebl);
    if (values.length === 0) return null;

    return {
      key: opType,
      density: kde(values)
    };
  }).filter(d => d !== null);

  // 9) Draw the violin shapes
  svg.selectAll("areas")
    .data(allDensity)
    .enter()
    .append("path")
      // Shift each type's shape vertically to match its band center
      .attr("transform", d =>
        "translate(0," + (y(d.key) + y.bandwidth() / 2) + ")"
      )
      // Sort the density by x so the line doesn't loop
      .datum(d => d.density.sort((a, b) => a[0] - b[0]))
      .attr("fill", "#69b3a2")
      .attr("stroke", "#000")
      .attr("stroke-width", 1)
      .attr("opacity", 0.7)
      .attr("d", d3.line()
        .curve(d3.curveBasis)
        .x(d => x(d[0]))
        // Multiply by a factor to control violin height
        .y(d => -d[1] * 3000)
      );

  // Debug logs
  console.log("Processed Data:", processedData);
  console.log("All Density Data:", allDensity);
  console.log("EBL 95th Percentile:", ebl95);
});

// 10) Kernel Density Estimation helpers
function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
  };
}
function kernelEpanechnikov(k) {
  return function(v) {
    v /= k;
    return Math.abs(v) <= 1 ? 0.75 * (1 - v*v) / k : 0;
  };
}