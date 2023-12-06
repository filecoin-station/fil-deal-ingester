import { setMaxListeners } from 'events'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createReadStream, createWriteStream } from 'node:fs'
import { dirname, resolve, relative, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import split2 from 'split2'
import varint from 'varint'

const stats = {
  total: 0n,
  advertised: 0n,
  tasks: 0n,
  http: 0n,
  bitswap: 0n,
  graphsync: 0n
}

const thisDir = dirname(fileURLToPath(import.meta.url))
const infile = process.argv[2] ?? resolve(thisDir, '../generated/ldn-deals.ndjson')
console.log('Processing LDN deals from %s', infile)
const outfile = resolve(thisDir, '../generated/retrieval-tasks.ndjson')

const cacheDir = fileURLToPath(new URL('../.cache', import.meta.url))
await mkdir(cacheDir, { recursive: true })
await mkdir(join(cacheDir, 'providers'), { recursive: true })

const started = Date.now()

const abortController = new AbortController()
const signal = abortController.signal
setMaxListeners(Infinity, signal)
process.on('SIGINT', () => abortController.abort('interrupted'))

process.on('beforeExit', () => {
  console.log('Finished in %s seconds', (Date.now() - started) / 1000)
  console.log()
  console.log('Total CIDs:    %s', stats.total)
  console.log(' - advertised: %s (%s)', stats.advertised, ratio(stats.advertised, stats.total))
  console.log()
  console.log('Total tasks:   %s', stats.tasks)
  console.log(' - http        %s (%s)', stats.http, ratio(stats.http, stats.tasks))
  console.log(' - bitswap     %s (%s)', stats.bitswap, ratio(stats.bitswap, stats.tasks))
  console.log(' - graphsync   %s (%s)', stats.graphsync, ratio(stats.graphsync, stats.tasks))
  console.log()
  console.log('Retrieval tasks were written to %s', relative(process.cwd(), outfile))
})

try {
  await pipeline(
    createReadStream(infile, 'utf-8'),
    split2(JSON.parse),
    async function * (source, { signal }) {
      const queue = []
      const collect = async () => {
        const results = await Promise.all(queue)
        queue.splice(0)
        return results.flat()
      }

      for await (const deal of source) {
          queue.push((async () => {
            const lines = []
            for await (const task of processDeal(deal, { signal })) {
              lines.push(JSON.stringify(task) + '\n')
              // console.log('%s -> %s', JSON.stringify(deal), JSON.stringify(task))
            }
            return lines
         })())
         if (queue.length === 5) {
            const lines = await collect()
            yield * lines
         }
      }
      const lines = await collect()
      yield * lines
    },
    createWriteStream(outfile, 'utf-8'),
    { signal }
  )
} catch (err) {
  if (err.name === 'AbortError') {
    console.log('\nAborted.')
  } else {
    throw err
  }
}

/** @param {{
   provider: string;
   pieceCID: string;
   payloadCID: string;
 }} deal
*/
async function * processDeal (deal, { signal }) {
  stats.total++
  const providers = await lookupRetrievalProviders(deal.payloadCID, { signal })
  if (!providers) {
    // console.log(deal.payladCID, 'unreachable')
    return
  }

  stats.advertised++

  for (const p of providers.flat()) {
    // console.log(p)

    // TODO: find only the contact advertised by the SP handling this deal
    // See https://filecoinproject.slack.com/archives/C048DLT4LAF/p1699958601915269?thread_ts=1699956597.137929&cid=C048DLT4LAF
    // bytes of CID of dag-cbor encoded DealProposal
    // https://github.com/filecoin-project/boost/blob/main/indexprovider/wrapper.go#L168-L172
    // https://github.com/filecoin-project/boost/blob/main/indexprovider/wrapper.go#L195

    const protocolCode = varint.decode(Buffer.from(p.Metadata, 'base64'))
    const protocol = {
      0x900: 'bitswap',
      0x910: 'graphsync',
      0x0920: 'http',
      4128768: 'graphsync'
    }[protocolCode]
    const providerAddress = p.Provider.Addrs[0]
    if (!providerAddress) continue
    if (!protocol) {
      console.log('Unknown protocol: %s', protocolCode)
      continue
    }

    stats.tasks++
    stats[protocol]++

    if (protocol !== 'http') continue
    // const fullAddress = `${providerAddress}/p2p/${p.Provider.ID}`
    // HTTP retrievals don't use ProviderID
    fullAddress = providerAddress

    yield {
      minerId: deal.provider,
      pieceCID: deal.pieceCID,
      cid: deal.payloadCID,
      address: fullAddress,
      protocol
    }
  }
}

/**
 *
 * @param {string} cid
 * @returns {Promise<undefined | Array<Array<{
    ContextID: string;
    Metadata: string;
    Provider: {
      ID: string;
      Addrs: string[]
    };
}>>>}
 */
async function lookupRetrievalProviders (cid, { signal }) {
  const pathOfCachedResponse = join(cacheDir, 'providers', cid + '.json')
  try {
    const text = await readFile(pathOfCachedResponse, 'utf-8')
    if (!text) return null // 404 not found
    return JSON.parse(text)
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('Cannot read cached contacts:', err)
  }

  const res = await fetch(`http://cid.contact/cid/${cid}`, { signal })

  if (res.status === 404) {
    await writeFile(pathOfCachedResponse, '')
    return undefined
  }

  if (!res.ok) {
    throw new Error(`Cannot query cid.contact: ${res.status}\n${await res.text()}`)
  }

  const body = await res.json()
  const providers = body.MultihashResults.map(r => r.ProviderResults)
  await writeFile(pathOfCachedResponse, JSON.stringify(providers))
  return providers
}

function ratio (fraction, total) {
  if (!total) return '--'
  return (100n * fraction / total).toString() + '%'
}
