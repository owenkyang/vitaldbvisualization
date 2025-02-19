var margin = {top: 60, right: 30, bottom: 60, left: 150},
    width  = 1200 - margin.left - margin.right,
    height = 800  - margin.top  - margin.bottom;

var svg = d3.select("#graph")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

d3.csv("cases.csv").then(function(data) {

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

  const eblValues = processedData.map(d => d.intraop_ebl).sort(d3.ascending);
  const ebl95 = d3.quantile(eblValues, 0.95);
  processedData = processedData.filter(d => d.intraop_ebl >= 1 && d.intraop_ebl <= ebl95);

  const opTypes = Array.from(new Set(processedData.map(d => d.op_type)));

  var x = d3.scaleLog()
    .domain([1, ebl95])
    .range([0, width]);

  const customTicks = [1, 5, 10, 50, 100, 500, 1000, 5000];
  svg.append("g")
    .attr("transform", `translate(0, ${height})`)
    .call(d3.axisBottom(x).tickValues(customTicks).tickFormat(d3.format("~s")));

  var y = d3.scalePoint()
    .domain(opTypes)
    .range([0, height])
    .padding(0.5);

  svg.append("g")
    .call(d3.axisLeft(y));

  var kde = kernelDensityEstimator(kernelEpanechnikov(40), x.ticks(50));

  var allDensity = opTypes.map(opType => {
    let values = processedData.filter(d => d.op_type === opType).map(d => d.intraop_ebl);
    if (!values.length) return null;
    return { key: opType, density: kde(values) };
  }).filter(d => d !== null);

  svg.selectAll(".violins")
    .data(allDensity)
    .enter()
    .append("path")
      .attr("class", "violins") // <-- apply the class
      .attr("transform", d => `translate(0, ${y(d.key)})`)
      .datum(d => d.density.sort((a, b) => a[0] - b[0]))
      .attr("d", d3.line()
        .curve(d3.curveBasis)
        .x(d => x(d[0]))
        .y(d => -d[1] * 8000)
      );

  // Axis titles, chart title, etc. remain unchanged
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
    return Math.abs(v) <= 1 ? 0.75 * (1 - v*v) / k : 0;
  };
}