import { createReadStream, createWriteStream } from 'node:fs'
import { dirname, resolve, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import split2 from 'split2'
import pg from 'pg'

const thisDir = dirname(fileURLToPath(import.meta.url))
const infile = resolve(thisDir, '../generated/retrieval-tasks.ndjson')
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
    yield 'DELETE FROM retrieval_templates;\n'

    let counter = 0
    for await (const task of source) {
      counter++
      signal.throwIfAborted()

      if (counter % 5000 === 1) {
        if (counter > 1) yield ';\n'
        yield 'INSERT INTO retrieval_templates (cid, provider_address, protocol) VALUES\n'
      } else {
        yield ',\n'
      }

      const q = `(${[
        task.cid, task.address, task.protocol
      ].map(pg.escapeLiteral).join(', ')})`
      yield q
      // console.log(q)
    }
    yield ';'
  },
  createWriteStream(outfile, 'utf-8')
)
