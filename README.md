# fil-deal-ingester

A set of tools to manually ingest Filecoin storage deals and produce a list of retrieval tasks

## Basic use

Make sure you have a recent Rust toolchain set up.

Make sure you have the latest Node.js LTS version installed. Remember to install dependencies after cloning this repository locally.

```
❯ npm install
```

Setup port forwarding between your local computer and Postgres instance hosted by Fly.io
  ([docs](https://fly.io/docs/postgres/connecting/connecting-with-flyctl/)). Remember to use a
  different port if you have a local Postgres server for development!

```sh
fly proxy 5454:5432 -a spark-db
```

Find spark-db entry in 1Password and get the user and password from the connection string.

Run the following command to fetch the market deals and update SPARK DB:

```sh
DATABASE_URL=postgres://user:password@localhost:5454/spark ./run.sh
```

**NOTE: This will download & store several gigabytes of data and can take up to 3-5 hours to complete.**

> If you want to free up disk space, `generated/StateMarketDeals.ndjson` can weigh in at 40GB or more.
> Feel free to delete all files in the `generated` folder after the script finished running.


## Deploying to fly.io

**NOTE: Make sure you have the fly.io CLI installed and logged in.**

Creating scheduled machine has to be done by hand as it's not possible to set up a schedule inside the `fly.toml` file. In order to setup scheduled machine we will first have to setup app, volumes and secrets.

```sh
fly apps create --name=fil-deal-ingester --org=<org-name>
fly volumes create fil_deal_ingester_data --size=80 --app=fil-deal-ingester --region=<region> --snapshot-retention=1
fly secrets set DATABASE_URL=<postgres-connection-string> --app=fil-deal-ingester
fly secrets set SLACK_WEBHOOK_URL=<slack-webhook-url> --app=fil-deal-ingester
```

Finally, create the machine with the following command:

```sh
fly machine run . \
--app=fil-deal-ingester \
--schedule=daily \
--region=<region> \
--volume fil_deal_ingester_data:/usr/src/app/generated \
--env JSON_CONVERTER_BIN=/usr/src/app/fil-deal-ingester \
--env ENVIRONMENT=docker \
--vm-size=shared-cpu-1x
```
