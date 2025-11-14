*Disclaimer: this was 95% generated using ChatGPT and Copilot in a problem solving session. Use at your own risk.*

# FeatureServer Stats Test

This project provides an OpenData-style statistics indexer for ArcGIS FeatureServer layers. It fetches and computes summary statistics for numeric, string, and date fields from a given ArcGIS FeatureServer layer, and outputs the results in a structured JSON format.

## Features
- Computes min, max, avg, sum, and count for numeric fields
- Computes min, max, and count for date fields
- Computes unique value counts for string fields
- Outputs results to a timestamped JSON file in the `results/` directory for each run

## Usage

1. **Install dependencies:**
   ```sh
   npm install
   ```

2. **Run the script:**
   ```sh
   npm start
   ```
   This will fetch statistics from the configured ArcGIS FeatureServer layer and write the results to a new file in the `results/` directory, e.g. `results/results_2025-11-14T18-30-00-000Z.json`.

3. **View results:**
   Open the generated JSON file in the `results/` directory to view the statistics.

## Configuration

- The FeatureServer URL is set in `src/run.ts`.
- To change the target layer, edit the `url` variable in `src/run.ts`.

## Project Structure

- `src/stats.ts` — Main statistics logic and API calls
- `src/run.ts` — Entry point; runs the stats and writes output files
- `results/` — Output directory for JSON results

## Example Output

A sample output file contains statistics like:

```json
{
  "numeric": {
    "POPULATION": { "min": 1000, "max": 1000000, ... }
  },
  "string": {
    "STATE_NAME": {
      "values": [ { "value": "California", "count": 1 }, ... ],
      "count": 50,
      "uniqueCount": 50
    }
  },
  "date": {
    "LAST_UPDATED": { "min": 1609459200000, "max": 1635724800000, ... }
  },
  "objectid": { ... }
}
```

## License

MIT License
