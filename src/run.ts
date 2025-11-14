import { getOpenDataStyleStatistics, getHttpRequestCount, resetHttpRequestCount } from "./stats";
import * as fs from "fs";
import * as path from "path";

async function main() {
  // const url =
  //   "https://servicesqa.arcgis.com/Xj56SBi2udA78cC9/arcgis/rest/services/US_States_Generalized/FeatureServer/0";
  const url =
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Environment_Air_Quality_WebMercator/MapServer/1";

  console.log("Fetching statistics...\n");

  try {
    resetHttpRequestCount();
    const stats = await getOpenDataStyleStatistics(url);
    const output = JSON.stringify(stats, null, 2);
    console.log(output);

    // Write to timestamped file
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `results_${timestamp}.json`;
    const resultsDir = path.join(__dirname, "../results");
    const filePath = path.join(resultsDir, filename);
    fs.writeFileSync(filePath, output, "utf8");
    console.log(`\nResults written to: ${filePath}`);
    console.log(`\nHTTP requests made: ${getHttpRequestCount()}`);
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
