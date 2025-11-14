// ------------------------------------------------------------
// OpenData-style Statistics Indexer for ArcGIS FeatureServer
// ------------------------------------------------------------

export interface NumericStats {
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  count?: number;
}

export interface StringStatsValue {
  value: string | null;
  count: number;
}

export interface StringStats {
  values: StringStatsValue[];
  count: number;
  uniqueCount: number;
}

export interface DateStats {
  min?: number; // Unix epoch ms
  max?: number;
  count?: number;
}

export interface OpenDataStatistics {
  numeric: Record<string, NumericStats>;
  string: Record<string, StringStats>;
  date: Record<string, DateStats>;
  objectid: Record<string, NumericStats>;
}

type FieldInfo = {
  name: string;
  type: string; // esriFieldTypeString, Integer, Date, etc.
};

/**
 * Fetch JSON helper with request counting
 */
let httpRequestCount = 0;
export function getHttpRequestCount() {
  return httpRequestCount;
}
export function resetHttpRequestCount() {
  httpRequestCount = 0;
}
async function getJson(url: string) {
  await sleep(500); // avoid overwhelming server
  httpRequestCount++;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP Error: ${res.status} - ${url}`);
  return res.json();
}

/**
 * Build outStatistics JSON entries
 */
function stat(type: string, field: string, output: string) {
  return {
    statisticType: type,
    onStatisticField: field,
    outStatisticFieldName: output,
  };
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Main function: compute OpenData-style stats
 */
export async function getOpenDataStyleStatistics(
  featureLayerUrl: string
): Promise<OpenDataStatistics> {
  // ---------------------------------------------------------------------
  // 1. Fetch layer schema
  // ---------------------------------------------------------------------
  const layerInfo = await getJson(`${featureLayerUrl}?f=json`);
  const fields: FieldInfo[] = layerInfo.fields;

  const output: OpenDataStatistics = {
    numeric: {},
    string: {},
    date: {},
    objectid: {},
  };

  // ---------------------------------------------------------------------
  // 2. Build numeric/date outStatistics definitions grouped in batches
  // ---------------------------------------------------------------------

  const STATS_BATCH_SIZE = 1; // number of fields to process per /query

  // 2A - Create list of numeric/date fields
  const numericOrDateFields = fields.filter(f => {
    const t = f.type;
    return (
      t === "esriFieldTypeInteger" ||
      t === "esriFieldTypeSmallInteger" ||
      t === "esriFieldTypeDouble" ||
      t === "esriFieldTypeSingle" ||
      t === "esriFieldTypeOID" ||
      t === "esriFieldTypeDate"
    );
  });

  // 2B — Split into batches
  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      out.push(arr.slice(i, i + size));
    }
    return out;
  }

  const batches = chunk(numericOrDateFields, STATS_BATCH_SIZE);

  // 2C — Process each batch with its own /query
  for (const batch of batches) {

    const statsDefs: any[] = [];

    for (const field of batch) {
      const name = field.name;
      const type = field.type;

      const isNumeric =
        type === "esriFieldTypeInteger" ||
        type === "esriFieldTypeSmallInteger" ||
        type === "esriFieldTypeDouble" ||
        type === "esriFieldTypeSingle" ||
        type === "esriFieldTypeOID";

      const isDate = type === "esriFieldTypeDate";

      if (isNumeric) {
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

    const encoded = encodeURIComponent(JSON.stringify(statsDefs));

    const url =
      `${featureLayerUrl}/query?f=json` +
      `&where=1=1` +
      `&returnGeometry=false` +
      `&outStatistics=${encoded}`;

    const resp = await getJson(url);
    const attrs = resp?.features?.[0]?.attributes || {};

    // merge into output
    for (const key in attrs) {
      const match = key.match(/(.+)_([a-z]+)$/);
      if (!match) continue;

      const fieldName = match[1];
      const statType = match[2];
      const value = attrs[key];

      if (output.numeric[fieldName]) {
        (output.numeric[fieldName] as any)[statType] = value;
      } else if (output.date[fieldName]) {
        (output.date[fieldName] as any)[statType] = value;
      }
    }
  }

  // ---------------------------------------------------------------------
  // 3. Run a single numeric/date stats query
  // ---------------------------------------------------------------------
  // (Removed redundant block; stats are already processed in the previous loop)

  // ---------------------------------------------------------------------
  // 4. String fields — unique values & counts (groupByFieldsForStatistics)
  // ---------------------------------------------------------------------
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

  // ---------------------------------------------------------------------
  // 5. Return fully assembled stats
  // ---------------------------------------------------------------------
  return output;
}
