#!/usr/bin/env bash

set -e

DATABASE_URL="${DATABASE_URL?Missing required env var: DATABASE_URL}"
# defaults to ./target/release/fil-deal-ingester to support local ingestion and backwards compatibility
JSON_CONVERTER_BIN="${JSON_CONVERTER_BIN:-./target/release/fil-deal-ingester}"

mkdir -p generated

if [ $ENVIRONMENT = "docker" ]; then
  echo "Skipping JSON->NDJSON converter build in docker environment"
else
  echo "** Building the JSON->NDJSON converter **"
  cargo build --release
fi

echo "** Downloading the latest market deals state **"
curl --fail -o ./generated/StateMarketDeals.json.zst https://marketdeals.s3.amazonaws.com/StateMarketDeals.json.zst

echo "** Converting from .json.zst to .ndjson **"
$JSON_CONVERTER_BIN ./generated/StateMarketDeals.json.zst > generated/StateMarketDeals.ndjson

echo "** Parsing retrievable deals **"
node scripts/parse-retrievable-deals.js

echo "** Building the SQL query to update the SPARK DB **"
node scripts/build-spark-update-sql.js

echo "** UPDATING THE PRODUCTION DATABASE **"
psql "$DATABASE_URL" -f generated/update-spark-db.sql | tee generated/dbupdate.log

echo "** Updating client-allocator mappings **"
node scripts/update-allocator-clients.js | tee generated/allocator-update.log

MESSAGE=$(
echo "**FINISHED INGESTION OF f05 DEALS**"
grep "^DELETE" < generated/dbupdate.log | awk '{s+=$2} END {print "Deleted: " s}'
grep "^INSERT" < generated/dbupdate.log | awk '{s+=$3} END {print "Added: " s}'
tail -1 generated/allocator-update.log
)

if [ -n "$SLACK_WEBHOOK_URL" ]; then
  echo "** Sending message to slack **"
  curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"$MESSAGE\"}" $SLACK_WEBHOOK_URL
else 
  echo $MESSAGE
fi
