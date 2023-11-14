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

### Parse storage deals from StateMarketDetails.json

1. Download the snapshot of StateMarketDeals from Glif: https://marketdeals.s3.amazonaws.com/StateMarketDeals.json.zst

   WARNING: The file has more than 3 GB.

2. Decompress the file and save it to project's root dir as `StateMarketDeals.json`

   WARNING: The decompressed file has over 23 GB

3. Run

   ```sh
   node scripts/parse-market-deals.js
   ```

   WARNING: This will take very long.

The output is NOT committed to git, you can find it in `./generated/deals.json`

You can create a subset of StateMarketsDeal.json by copying a byte range and then manually editing
the new file to turn it into a well-formed JSON.

```
dd if=StateMarketDeals.json of=StateMarketDeals.partial.json count=10240 skip=20971520
```

The default block size is 1024 bytes:
- `count=10240` will copy 10240*1024 = ~10MB of data
- `skip=20971520` will start at the offset ~20GB.

In the partial file:
 1. Delete text from the beginning of the file until the first `}}`
 2. Change `}}` to `{` (open the top-level object)
 3. Find the last `}}` in the file
 4. Delete everything after this `}}` block
 5. Append `}` (close the top-level object)

### Build retrieval tasks

1. Run the previous step to build `./generated/deals.json`

2. Run

   ```sh
   node scripts/build-retrieval-tasks.js
   ```

The output is NOT committed to git, you can find it in `./generated/retrieval-tasks.json`
