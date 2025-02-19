var margin = { top: 60, right: 30, bottom: 60, left: 150 },
    width  = 1200 - margin.left - margin.right,
    height = 900  - margin.top  - margin.bottom;


var svg = d3.select("#graph")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

var tooltip = d3.select("#tooltip");
var fullData = null;


var y = d3.scalePoint().range([0, height]).padding(0.5);
var yAxisG = svg.append("g");


var x = d3.scaleLog().range([0, width]);
var xAxisG = svg.append("g")
  .attr("transform", `translate(0, ${height})`);

function kernelDensityEstimator(kernel, X) {
  return function(V) {
    return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
  };
}
function kernelEpanechnikov(k) {
  return function(v) {
    v /= k;
    return Math.abs(v) <= 1 ? 0.75*(1 - v*v)/k : 0;
  };
}
var kde = kernelDensityEstimator(kernelEpanechnikov(40), []);


function standardDeviation(values) {
  let mean = d3.mean(values);
  let variance = d3.mean(values.map(v => (v - mean)**2));
  return Math.sqrt(variance);
}
function mostFrequentSex(rows) {
  let counts = d3.rollup(rows, v => v.length, d => d.sex);
  let maxSex = null, maxCount = -Infinity;
  for (let [sex, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      maxSex   = sex;
    }
  }
  return maxSex || "Unknown";
}
function categorizeAge(age) {
  if (age < 40) return "Young";
  else if (age < 60) return "Middle-aged";
  else return "Old";
}

d3.csv("cases.csv").then(function(data) {
  fullData = data
    .filter(d =>
      d.intraop_ebl !== "" && d.intraop_ebl !== null && !isNaN(d.intraop_ebl)
      && d.optype && d.optype !== "Others"
      && d.age !== "" && d.age !== null && !isNaN(d.age)
      && d.sex !== "" && d.sex !== null
    )
    .map(d => ({
      op_type: d.optype,
      intraop_ebl: +d.intraop_ebl,
      age: +d.age,
      sex: (d.sex.trim().toUpperCase() === "M") ? "Male"
           : (d.sex.trim().toUpperCase() === "F") ? "Female"
           : d.sex.trim()
    }));

  const allOpTypes = Array.from(new Set(fullData.map(d => d.op_type)));
  y.domain(allOpTypes);
  yAxisG.call(d3.axisLeft(y))
    .selectAll("text")
    .style("font-size", "14px")
    .style("font-weight", "bold");

  svg.append("text")
    .attr("text-anchor", "middle")
    .attr("x", width / 2)
    .attr("y", height + margin.bottom - 10)
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text("Blood loss (ML)");


  svg.append("text")
    .attr("text-anchor", "middle")

    .attr("transform", `translate(${-margin.left*0.9}, ${height/2}) rotate(-90)`)
    .style("font-size", "16px")
    .style("font-weight", "bold")
    .text("Surgery Type");

  svg.append("text")
    .attr("text-anchor", "middle")
    .style("font-size", "20px")
    .style("font-weight", "bold")
    .attr("x", width / 2)
    .attr("y", -margin.top / 2)
    .text("How much blood can you expect to lose with each surgery?");


  svg.append("text")
    .attr("text-anchor", "middle")
    .style("font-size", "14px") 
    .style("font-weight", "normal") 
    .attr("x", width / 2)
    .attr("y", -margin.top / 2 + 20) 
    .text("Data points were omitted if their blood loss were greater than 1000 ML as the outliers did not represent the distribution");

  updateChart("Both", "All");
});


function updateChart(sexFilter, ageFilter) {

  let filteredData = (sexFilter === "Both") ? fullData
    : fullData.filter(d => d.sex === sexFilter);
  if (ageFilter !== "All") {
    filteredData = filteredData.filter(d => categorizeAge(d.age) === ageFilter);
  }


  let eblValues = filteredData.map(d => d.intraop_ebl).sort(d3.ascending);
  let ebl95 = d3.quantile(eblValues, 0.95);
  filteredData = filteredData.filter(d => d.intraop_ebl >= 1 && d.intraop_ebl <= ebl95);

  x.domain([1, ebl95 || 1]);
  let customTicks = [1, 5, 10, 50, 100, 500, 1000, 5000].filter(t => t <= ebl95);
  let xAxis = d3.axisBottom(x)
    .tickValues(customTicks)
    .tickFormat(d3.format("~s"));

  xAxisG.call(xAxis)
    .selectAll("text")
    .style("font-size", "14px")
    .style("font-weight", "bold");

 
  let kdEstimator = kernelDensityEstimator(kernelEpanechnikov(40), x.ticks(50));
  let allOpTypes = y.domain();

  let allDensity = allOpTypes.map(opType => {
    let rows = filteredData.filter(d => d.op_type === opType);
    let ebls = rows.map(d => d.intraop_ebl);
    if (ebls.length < 2) return null;

    let medianEBL = d3.median(ebls);
    let stdEBL    = standardDeviation(ebls);
    let avgAge    = d3.mean(rows, d => d.age);
    let modeSex   = mostFrequentSex(rows);

    return {
      key: opType,
      density: kdEstimator(ebls),
      stats: { medianEBL, stdEBL, avgAge, modeSex }
    };
  }).filter(d => d !== null);

  svg.selectAll(".violins").remove();

  let zeroLine = d3.line()
    .curve(d3.curveBasis)
    .x(pt => x(pt[0]))
    .y(pt => 0);

  let finalLine = d3.line()
    .curve(d3.curveBasis)
    .x(pt => x(pt[0]))
    .y(pt => -pt[1] * 8000);


  svg.selectAll(".violins")
    .data(allDensity, d => d.key)
    .enter()
    .append("path")
      .attr("class", "violins")
      .attr("transform", d => `translate(0, ${y(d.key)})`)
      .each(function(d) {
        d.density = d.density.sort((a,b) => a[0] - b[0]);
      })
      .attr("d", d => zeroLine(d.density))
      .on("mouseover", function(event, d) {
        let lines = [
          `<strong>${d.key}</strong>`,
          `Average Bloodloss (ML): ${d3.format(".2f")(d.stats.medianEBL)}`,
          `Standard Deviation: ${d3.format(".2f")(d.stats.stdEBL)}`,
          `Average Age (Years): ${d3.format(".1f")(d.stats.avgAge)}`
        ];
        if (sexFilter === "Both") {
          lines.push(`Most Frequent Sex: ${d.stats.modeSex}`);
        }
        tooltip
          .style("opacity", 1)
          .html(lines.join("<br/>"));
      })
      .on("mousemove", function(event) {
        tooltip
          .style("top",  (event.pageY + 5) + "px")
          .style("left", (event.pageX + 5) + "px");
      })
      .on("mouseleave", function() {
        tooltip.style("opacity", 0);
      })
      .transition()
      .duration(1000)
      .ease(d3.easeCubicOut)
      .attr("d", d => finalLine(d.density));
}

document.getElementById("sexSelect").onchange = applyFilters;
document.getElementById("ageSelect").onchange = applyFilters;

function applyFilters() {
  let sexFilter = d3.select("#sexSelect").property("value");
  let ageFilter = d3.select("#ageSelect").property("value");
  updateChart(sexFilter, ageFilter);
}