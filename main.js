var margin = {top: 60, right: 30, bottom: 40, left: 150},
    width = 600 - margin.left - margin.right,
    height = 500 - margin.top - margin.bottom;

// Append the SVG object to the body of the page
var svg = d3.select("#graph")
  .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
  .append("g")
    .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

// Load and process data
d3.csv("cases.csv").then(function(data) {

    // Function to classify BMI
    function classifyBMI(bmi) {
        bmi = +bmi;  
        if (bmi < 18.5) return "Underweight";
        else if (bmi < 25) return "Normal Weight";
        else if (bmi < 30) return "Overweight";
        else if (bmi < 35) return "Obesity Class 1";
        else if (bmi < 40) return "Obesity Class 2";
        else return "Obesity Class 3";
    }

    // Process data: categorize BMI and filter out null intraop_ebl
    let processedData = data
        .filter(d => d.intraop_ebl !== "" && d.intraop_ebl !== null && !isNaN(d.intraop_ebl))
        .map(d => ({
            bmi_category: classifyBMI(d.bmi),
            intraop_ebl: +d.intraop_ebl
        }));

    // Get unique BMI categories
    var categories = Array.from(new Set(processedData.map(d => d.bmi_category)));

    // X scale (distribution of intraop_ebl)
    var x = d3.scaleLinear()
        .domain([0, d3.max(processedData, d => d.intraop_ebl)])
        .range([0, width]);

    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    // Y scale (BMI categories)
    var yName = d3.scaleBand()
        .domain(categories)
        .range([0, height])
        .padding(0.5);

    svg.append("g")
        .call(d3.axisLeft(yName));

    // KDE computation
    var kde = kernelDensityEstimator(kernelEpanechnikov(1000), x.ticks(40)); // Adjust bandwidth
    var allDensity = categories.map(category => {
        let values = processedData.filter(d => d.bmi_category === category).map(d => d.intraop_ebl);
        if (values.length === 0) return null;  // Skip empty categories
        return { key: category, density: kde(values) };
    }).filter(d => d !== null); // Remove null values

    // Add KDE areas
    svg.selectAll("areas")
        .data(allDensity)
        .enter()
        .append("path")
            .attr("transform", d => "translate(0," + (yName(d.key) + yName.bandwidth() / 2) + ")")
            .datum(d => d.density)
            .attr("fill", "#69b3a2")
            .attr("stroke", "#000")
            .attr("stroke-width", 1)
            .attr("opacity", 0.7)
            .attr("d", d3.line()
                .curve(d3.curveBasis)
                .x(d => x(d[0]))
                .y(d => -d[1] * 300) // Scale KDE height for visibility
            );

    console.log("Processed Data:", processedData);
    console.log("All Density Data:", allDensity);
});

// Kernel Density Estimation Functions
function kernelDensityEstimator(kernel, X) {
    return function(V) {
        return X.map(x => [x, d3.mean(V, v => kernel(x - v))]);
    };
}
function kernelEpanechnikov(k) {
    return function(v) {
        return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
}