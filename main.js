var margin = { top: 60, right: 30, bottom: 60, left: 150 },
    width  = 1200 - margin.left - margin.right,
    height = 800  - margin.top  - margin.bottom;

// 2) Append main SVG
var svg = d3.select("#graph")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

// 3) Prepare a tooltip reference
var tooltip = d3.select("#tooltip");

// 4) Load and process data
d3.csv("cases.csv").then(function(data) {

  // (Same data filtering & parsing logic as before) ...
  // Filter & parse each row
  let processedData = data
    .filter(d =>
       d.intraop_ebl !== "" && d.intraop_ebl !== null && !isNaN(d.intraop_ebl)
       && d.optype && d.optype !== "Others"
       && d.age !== "" && d.age !== null && !isNaN(d.age)
       && d.sex !== "" && d.sex !== null
    )
    .map(d => ({
      op_type:     d.optype,
      intraop_ebl: +d.intraop_ebl,
      age:         +d.age,
      sex:         (d.sex.trim().toUpperCase() === "M" ? "Male" 
                  : d.sex.trim().toUpperCase() === "F" ? "Female" 
                  : d.sex.trim())
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

  svg.append("g").call(d3.axisLeft(y));

  function standardDeviation(values) {
    let mean = d3.mean(values);
    let variance = d3.mean(values.map(v => (v - mean) ** 2));
    return Math.sqrt(variance);
  }

  function mostFrequentSex(rows) {
    let counts = d3.rollup(rows, v => v.length, d => d.sex);
    let maxSex   = null;
    let maxCount = -Infinity;
    for (let [sex, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        maxSex   = sex;
      }
    }
    return maxSex || "Unknown";
  }

  var kde = kernelDensityEstimator(kernelEpanechnikov(40), x.ticks(50));

  var allDensity = opTypes.map(opType => {
    let rows = processedData.filter(d => d.op_type === opType);
    let ebls = rows.map(d => d.intraop_ebl);
    if (!ebls.length) return null;

    let medianEBL  = d3.median(ebls);
    let stdEBL     = standardDeviation(ebls);
    let avgAge     = d3.mean(rows, d => d.age);
    let modeSex    = mostFrequentSex(rows);

    return {
      key: opType,
      density: kde(ebls),
      stats: {
        medianEBL,
        stdEBL,
        avgAge,
        modeSex
      }
    };
  }).filter(d => d !== null);

  // 5) Draw violin shapes
  svg.selectAll(".violins")
    .data(allDensity)
    .enter()
    .append("path")
      .attr("class", "violins")
      .attr("transform", d => `translate(0, ${y(d.key)})`)
      .each(function(d) {
        d.density = d.density.sort((a, b) => a[0] - b[0]);
      })
      .attr("d", d => d3.line()
        .curve(d3.curveBasis)
        .x(pt => x(pt[0]))
        .y(pt => -pt[1] * 8000)
        (d.density)
      )
      // 6) Tooltip events
      .on("mouseover", function(event, d) {
        const html = `
          <strong>${d.key}</strong><br/>
          Average Bloodloss (ML): ${d3.format(".2f")(d.stats.medianEBL)}<br/>
          Standard Deviation: ${d3.format(".2f")(d.stats.stdEBL)}<br/>
          Average Age (Years): ${d3.format(".1f")(d.stats.avgAge)}<br/>
          Most Frequent Sex: ${d.stats.modeSex}
        `;
        tooltip
          .style("opacity", 1)   // fade in
          .html(html);
      })
      .on("mousemove", function(event) {
        tooltip
          .style("top",  (event.pageY + 5) + "px")
          .style("left", (event.pageX + 5) + "px");
      })
      .on("mouseleave", function() {
        tooltip
          .style("opacity", 0);  // fade out
      });

  // 7) Axis labels & chart title
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
    .text("How much blood can you expect to lose with each surgery?");
});

// KDE Helpers
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