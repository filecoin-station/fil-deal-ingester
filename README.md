# fil-deal-ingester

A set of tools to manually ingest Filecoin storage deals and produce a list of retrieval tasks

## Basic use

Make sure you have the latest Node.js LTS version installed.

Remember to install dependencies after cloning this repository locally.

```
❯ npm install
```

### Update the list of clients participating in FIL+ LDN

```
node scripts/fetch-ldn-clients.js
```

The output is committed to git, see [./generated/ldn-clients.csv](./generated/ldn-clients.csv)

### Download StateMarketDetails.json and convert it to ND-JSON format

1. Download the snapshot of StateMarketDeals from Glif: https://marketdeals.s3.amazonaws.com/StateMarketDeals.json.zst

   WARNING: The file has more than 3 GB.

2. Decompress the file and save it to project's root dir as `StateMarketDeals.json`

   WARNING: The decompressed file has over 23 GB

3. Run

   ```sh
   jq --stream -c 'fromstream(1|truncate_stream(inputs))' StateMarketDeals.json > generated/StateMarketDeals.ndjson
   ```

   WARNING: This will take very long.

The output is NOT committed to git, you can find it in `./generated/StateMarketDeals.ndjson`

You can create a smaller file by aborting the `jq` command by pressing Ctrl+C and/or truncating the
output file at any line boundary.

### Parse FIL+ LDN deals

1. Run the previous step to build `./generated/StateMarketDeals.ndjsonn`


2. Run

   ```sh
   node scripts/parse-deals.js
   ```

The output is NOT committed to git, you can find it in `./generated/ldn-deals.ndjson`


### Build retrieval tasks

1. Run the previous step to build `./generated/ldn-deals.ndjson`

2. Run

   ```sh
   node scripts/build-retrieval-tasks.js
   ```

The output is NOT committed to git, you can find it in `./generated/retrieval-tasks.ndjson`
