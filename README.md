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

### Parse storage deals from StateMarketDetals.json

1. Download the snapshot of StateMarketDeals from Glif: https://marketdeals.s3.amazonaws.com/StateMarketDeals.json.zst

2. Decompress the file and save it to project's root dir as `StateMarketDeals.json`

3. Run

   ```sh
   node scripts/parse-market-deals.js
   ```

The output is NOT committed to git, you can find it in `./generated/deals.json`
