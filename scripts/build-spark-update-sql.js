import assert from 'node:assert'
import { createReadStream, createWriteStream } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import split2 from 'split2'
import pg from 'pg'

const ONE_DAY_IN_MS = 24 * 60 * 60_000

const thisDir = dirname(fileURLToPath(import.meta.url))
const infile = resolve(thisDir, '../generated/retrievable-deals.ndjson')
const outfile = resolve(thisDir, '../generated/update-spark-db.sql')

const started = Date.now()
process.on('beforeExit', () => {
  console.log('Finished in %s seconds', (Date.now() - started) / 1000)
  console.log()
  console.log('SQL query to update SPARK DB was written to %s', relative(process.cwd(), outfile))
})

await pipeline(
  createReadStream(infile, 'utf-8'),
  split2(JSON.parse),
  async function * (source, { signal }) {
    // FIXME: on conflict update expires_at to MAX(old.expires_at, new.expires_at)
    const END_OF_INSERT_STATEMENT = '\nON CONFLICT DO NOTHING;\n'

    // yield 'TRUNCATE TABLE retrievable_deals;\n'
    yield 'DELETE FROM retrievable_deals WHERE expires_at < now();\n'

    let counter = 0
    for await (const deal of source) {
      signal.throwIfAborted()

      assert(deal.payloadCID)
      assert(deal.provider)
      assert(deal.client)
      assert(deal.started)
      assert(deal.expires)

      // Skip deals that were created more than 60 days ago. These deals should be already in our DB.
      // IMPORTANT: after changing the logic determining which deals are eligible for testing,
      // disable this condition for the first run to ingest *all* deals again.
      if (deal.started < Date.now() - 60 * ONE_DAY_IN_MS) continue

      counter++

      if (counter % 5000 === 1) {
        if (counter > 1) yield END_OF_INSERT_STATEMENT
        yield 'INSERT INTO retrievable_deals (cid, miner_id, client_id, expires_at) VALUES\n'
      } else {
        yield ',\n'
      }

      const q = `(${[
        deal.payloadCID, deal.provider, deal.client, new Date(deal.expires).toISOString()
      ].map(pg.escapeLiteral).join(', ')})`
      yield q
      // console.log(q)
    }
    yield END_OF_INSERT_STATEMENT
  },
  createWriteStream(outfile, 'utf-8')
)
