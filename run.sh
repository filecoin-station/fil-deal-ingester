#!/usr/bin/env bash

set -e

DATABASE_URL="${DATABASE_URL?Missing required env var: DATABASE_URL}"

mkdir -p generated

echo "** Building the JSON->NDJSON converter **"
cargo build --release

echo "** Downloading the latest market deals state **"
curl --fail -o ./generated/StateMarketDeals.json.zst https://marketdeals.s3.amazonaws.com/StateMarketDeals.json.zst

echo "** Converting from .json.zst to .ndjson **"
./target/release/fil-deal-ingester ./generated/StateMarketDeals.json.zst > generated/StateMarketDeals.ndjson

echo "** Parsing retrievable deals **"
node scripts/parse-retrievable-deals.js

echo "** Building the SQL query to update the SPARK DB **"
node scripts/build-spark-update-sql.js

echo "** UPDATING THE PRODUCTION DATABASE **"
psql "$DATABASE_URL" -f generated/update-spark-db.sql | tee generated/dbupdate.log

echo "** Updating client-allocator mappings **"
node scripts/update-allocator-clients.js | tee generated/allocator-update.log

echo "** DONE **"
grep "^DELETE" < generated/dbupdate.log | awk '{s+=$2} END {print "Deleted: " s}'
grep "^INSERT" < generated/dbupdate.log | awk '{s+=$3} END {print "Added: " s}'
tail -1 generated/allocator-update.log

rm -rf generated
