// ------------------------------------------------------------
// OpenData-style Statistics Indexer for ArcGIS FeatureServer
// ------------------------------------------------------------
//
// This module fetches and computes summary statistics for fields in an ArcGIS FeatureServer layer.
// It outputs statistics in a structure similar to ArcGIS OpenData, including numeric, string, date, and objectid fields.
//

// Numeric field statistics
export interface NumericStats {
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  count?: number;
}

// Single value and its count for string fields
export interface StringStatsValue {
  value: string | null;
  count: number;
}

// Statistics for string fields
export interface StringStats {
  values: StringStatsValue[];
  count: number;       // total values (including duplicates)
  uniqueCount: number; // number of unique values
}

// Statistics for date fields (min/max/count in epoch ms)
export interface DateStats {
  min?: number; // Unix epoch ms
  max?: number;
  count?: number;
}

// Main output structure for all statistics
export interface OpenDataStatistics {
  numeric: Record<string, NumericStats>;
  string: Record<string, StringStats>;
  date: Record<string, DateStats>;
  objectid: Record<string, NumericStats>;
}

// Field schema info from ArcGIS layer
type FieldInfo = {
  name: string;
  type: string; // esriFieldTypeString, Integer, Date, etc.
};

// --- HTTP request counting for diagnostics ---
let httpRequestCount = 0;

// Get the number of HTTP requests made (since last reset)
export function getHttpRequestCount() {
  return httpRequestCount;
}

// Reset the HTTP request counter
export function resetHttpRequestCount() {
  httpRequestCount = 0;
}

// Helper to fetch JSON from a URL, with request counting and delay
async function getJson(url: string) {
  await sleep(500); // avoid overwhelming server
  httpRequestCount++;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP Error: ${res.status} - ${url}`);
  return res.json();
}

// Helper to build an outStatistics entry for ArcGIS REST API
function stat(type: string, field: string, output: string) {
  return {
    statisticType: type,
    onStatisticField: field,
    outStatisticFieldName: output,
  };
}

// Sleep for a given number of milliseconds
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function: compute OpenData-style statistics for a FeatureServer layer
 * @param featureLayerUrl - URL to the ArcGIS FeatureServer layer
 * @returns OpenDataStatistics object with stats for all fields
 */
export async function getOpenDataStyleStatistics(
  featureLayerUrl: string
): Promise<OpenDataStatistics> {
  // 1. Fetch layer schema
  const layerInfo = await getJson(`${featureLayerUrl}?f=json`);
  const fields: FieldInfo[] = layerInfo.fields;

  // Prepare output structure
  const output: OpenDataStatistics = {
    numeric: {},
    string: {},
    date: {},
    objectid: {},
  };

  // 2. Gather numeric, date, and objectid fields (objectid strictly by type)
  const STATS_BATCH_SIZE = 1; // Number of fields per /query request
  const numericOrDateOrObjectIdFields = fields.filter(f => {
    const t = f.type;
    return (
      t === "esriFieldTypeInteger" ||
      t === "esriFieldTypeSmallInteger" ||
      t === "esriFieldTypeDouble" ||
      t === "esriFieldTypeSingle" ||
      t === "esriFieldTypeDate" ||
      t === "esriFieldTypeOID"
    );
  });

  // Helper to split fields into batches
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  const batches = chunk(numericOrDateOrObjectIdFields, STATS_BATCH_SIZE);

  // 3. For each batch, request statistics from the server
  for (const batch of batches) {
    const statsDefs: any[] = [];
    for (const field of batch) {
      const name = field.name;
      const type = field.type;

      // Only one field per layer will have esriFieldTypeOID
      const isObjectId = type === "esriFieldTypeOID";
      const isNumeric =
        type === "esriFieldTypeInteger" ||
        type === "esriFieldTypeSmallInteger" ||
        type === "esriFieldTypeDouble" ||
        type === "esriFieldTypeSingle";
      const isDate = type === "esriFieldTypeDate";

      if (isObjectId) {
        if (!output.objectid[name]) output.objectid[name] = {};
        statsDefs.push(stat("min", name, `${name}_min`));
        statsDefs.push(stat("max", name, `${name}_max`));
        statsDefs.push(stat("avg", name, `${name}_avg`));
        statsDefs.push(stat("sum", name, `${name}_sum`));
        statsDefs.push(stat("count", name, `${name}_count`));
      } else if (isNumeric) {
        if (!output.numeric[name]) output.numeric[name] = {};
        statsDefs.push(stat("min", name, `${name}_min`));
        statsDefs.push(stat("max", name, `${name}_max`));
        statsDefs.push(stat("avg", name, `${name}_avg`));
        statsDefs.push(stat("sum", name, `${name}_sum`));
        statsDefs.push(stat("count", name, `${name}_count`));
      } else if (isDate) {
        if (!output.date[name]) output.date[name] = {};
        statsDefs.push(stat("min", name, `${name}_min`));
        statsDefs.push(stat("max", name, `${name}_max`));
        statsDefs.push(stat("count", name, `${name}_count`));
      }
    }

    // Build and send the /query request for this batch
    const encoded = encodeURIComponent(JSON.stringify(statsDefs));
    const url =
      `${featureLayerUrl}/query?f=json` +
      `&where=1=1` +
      `&returnGeometry=false` +
      `&outStatistics=${encoded}`;
    const resp = await getJson(url);
    const attrs = resp?.features?.[0]?.attributes || {};

    // Merge statistics into output
    for (const key in attrs) {
      const match = key.match(/(.+)_([a-z]+)$/);
      if (!match) continue;
      const fieldName = match[1];
      const statType = match[2];
      const value = attrs[key];
      if (output.objectid[fieldName]) {
        (output.objectid[fieldName] as any)[statType] = value;
      } else if (output.numeric[fieldName]) {
        (output.numeric[fieldName] as any)[statType] = value;
      } else if (output.date[fieldName]) {
        (output.date[fieldName] as any)[statType] = value;
      }
    }
  }

  // 4. For each string field, get unique values and counts using groupByFieldsForStatistics
  for (const field of fields) {
    if (field.type !== "esriFieldTypeString") continue;
    const name = field.name;
    const groupQuery =
      `${featureLayerUrl}/query?f=json` +
      `&where=1%3D1` +
      `&returnGeometry=false` +
      `&groupByFieldsForStatistics=${name}` +
      `&outStatistics=` +
      encodeURIComponent(
        JSON.stringify([
          {
            statisticType: "count",
            onStatisticField: name,
            outStatisticFieldName: "value_count",
          },
        ])
      );
    const response = await getJson(groupQuery);
    const values =
      response.features?.map((f: any) => ({
        value: f.attributes[name],
        count: f.attributes.value_count,
      })) || [];
    output.string[name] = {
      values,
      count: values.reduce((sum: number, v: StringStatsValue) => sum + v.count, 0),
      uniqueCount: values.length,
    };
  }

  // 5. Return the fully assembled statistics object
  return output;
}
