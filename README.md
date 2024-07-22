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

**NOTE: This will download & store several gigabytes of data and can take up to 2-3 hours to complete.**

