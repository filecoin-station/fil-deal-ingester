import assert from 'node:assert'
import { createReadStream, createWriteStream } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import split2 from 'split2'
import pg from 'pg'

const thisDir = dirname(fileURLToPath(import.meta.url))
const infile = resolve(thisDir, '../generated/ldn-deals.ndjson')
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
    for await (const task of source) {
      assert(task.payloadCID)
      assert(task.expires)

      counter++
      signal.throwIfAborted()

      if (counter % 5000 === 1) {
        if (counter > 1) yield END_OF_INSERT_STATEMENT;
        yield 'INSERT INTO retrievable_deals (cid, miner_id, expires_at) VALUES\n'
      } else {
        yield ',\n'
      }

      const q = `(${[
        task.payloadCID, task.provider, new Date(task.expires).toISOString()
      ].map(pg.escapeLiteral).join(', ')})`
      yield q
      // console.log(q)
    }
    yield END_OF_INSERT_STATEMENT
  },
  createWriteStream(outfile, 'utf-8')
)
