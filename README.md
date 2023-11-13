# fil-deal-ingester

A set of tools to manually ingest Filecoin storage deals and produce a list of retrieval tasks

## Basic use

Make sure you have the latest Node.js LTS version installed.

Remember to install dependencies after cloning this repository locally.

```
❯ npm install
```

### Update list of SPs participating in FIL+ LDN

```
node scripts/fetch-ldn-providers.js
```

The output is committed to git, see [./generated/ldn-providers.csv](./generated/ldn-providers.csv)
