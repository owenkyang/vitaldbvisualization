var margin = {top: 60, right: 30, bottom: 40, left: 150},
    width  = 600 - margin.left - margin.right,
    height = 500 - margin.top  - margin.bottom;

// Append the SVG object
var svg = d3.select("#graph")
  .append("svg")
    .attr("width",  width  + margin.left + margin.right)
    .attr("height", height + margin.top  + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Load and process data
d3.csv("cases.csv").then(function(data) {

  // 1) Classify BMI
  function classifyBMI(bmi) {
    bmi = +bmi;
    if      (bmi < 18.5) return "Underweight";
    else if (bmi < 25)   return "Normal Weight";
    else if (bmi < 30)   return "Overweight";
    else if (bmi < 35)   return "Obesity Class 1";
    else if (bmi < 40)   return "Obesity Class 2";
    else                 return "Obesity Class 3";
  }

  // 2) Filter + map your data
  let processedData = data
    .filter(d => d.intraop_ebl !== "" && d.intraop_ebl !== null && !isNaN(d.intraop_ebl))
    .map(d => ({
      bmi_category: classifyBMI(d.bmi),
      intraop_ebl: +d.intraop_ebl
    }));

  // 3) Identify a cutoff to remove extreme outliers
  //    Here, we use the 95th percentile
  const eblValues = processedData.map(d => d.intraop_ebl).sort(d3.ascending);
  const ebl95 = d3.quantile(eblValues, 0.95);

  // Filter out any EBL above that 95th percentile
  processedData = processedData.filter(d => d.intraop_ebl >= 1 && d.intraop_ebl <= ebl95);

  // 4) Unique BMI categories in the filtered data
  var categories = Array.from(new Set(processedData.map(d => d.bmi_category)));

  // 5) Define a log scale for x, from [1, ebl95]
  //    (Assuming none of your data is < 1 after filtering)
  var x = d3.scaleLog()
    .domain([1, ebl95]) 
    .range([0, width]);

  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(
      d3.axisBottom(x)
        .ticks(6)
        .tickFormat(d3.format("~s")) // "1k", "10k", etc.
    );

  // 6) Define y scale for the BMI categories
  var yName = d3.scaleBand()
    .domain(categories)
    .range([0, height])
    .padding(0.5);

  svg.append("g")
    .call(d3.axisLeft(yName));

  // 7) Kernel Density Estimation setup
  //    Adjust bandwidth as needed
  var kde = kernelDensityEstimator(kernelEpanechnikov(30), x.ticks(50));

  // For each category, compute the KDE
  var allDensity = categories.map(category => {
    let values = processedData
      .filter(d => d.bmi_category === category)
      .map(d => d.intraop_ebl);
    if (values.length === 0) return null;
    return {
      key: category,
      density: kde(values)
    };
  }).filter(d => d !== null);

  // 8) Draw the KDE "violins"
  svg.selectAll("areas")
    .data(allDensity)
    .enter()
    .append("path")
      // Shift each category's shape down to the right y-level
      .attr("transform", d => 
        "translate(0," + (yName(d.key) + yName.bandwidth() / 2) + ")"
      )
      // Sort the density array by x so the line doesn't fold
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