# fil-deal-ingester

A set of tools to manually ingest Filecoin storage deals and produce a list of retrieval tasks

## Basic use

Make sure you have the latest Node.js LTS version installed.

Remember to install dependencies after cloning this repository locally.

```
❯ npm install
```

Generated files are stored in the directory `generated`. Make sure to create it before running
the first script.

### Download StateMarketDetails.json and convert it to ND-JSON format

1. Download the snapshot of StateMarketDeals from Glif: https://marketdeals.s3.amazonaws.com/StateMarketDeals.json.zst

   WARNING: The file has more than 3 GB.

2. Build the tool for converting `StateMarketDeals.json` to newline-delimited JSON

   ```sh
   cargo build --release
   ```

3. Run

   ```sh
   ./target/release/fil-deal-ingester StateMarketDeals.json.zst > generated/StateMarketDeals.ndjson
   ```

   This will take about 3-5 minutes to complete.

The output is NOT committed to git; you can find it in `./generated/StateMarketDeals.ndjson`.

You can create a smaller file by aborting the `jq` command by pressing Ctrl+C and/or truncating the
output file at any line boundary.

### Parse deals expected to be publicly retrievable

1. Run the previous step to build `./generated/StateMarketDeals.ndjsonn`


2. Run

   ```sh
   node scripts/parse-retrievable-deals.js
   ```

   This will take several minutes to complete.

The output is NOT committed to git; you can find it in `./generated/retrievable-deals.ndjson`

### Build SQL query to update SPARK DB

1. Run the previous step to build `./generated/retrievable-deals.ndjson`

2. Run

   ```sh
   node scripts/build-spark-update-sql.js
   ```

   The output is NOT committed to git; you can find it in `./generated/update-spark-db.sql`

### Apply updates to live SPARK DB

1. Setup port forwarding between your local computer and Postgres instance hosted by Fly.io
  ([docs](https://fly.io/docs/postgres/connecting/connecting-with-flyctl/)). Remember to use a
  different port if you have a local Postgres server for development!

   ```sh
   fly proxy 5454:5432 -a spark-db
   ```

2. Find spark-db entry in 1Password and get the user and password from the connection string.

3. Run the following command to apply the updates:

   ```sh
   psql postgres://user:password@localhost:5454/spark -f generated/update-spark-db.sql
   ```
