import { createReadStream, createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import JSONStream from 'JSONStream'
import { once } from 'node:events'
import varint from 'varint'


const thisDir = dirname(fileURLToPath(import.meta.url))
const infile = resolve(thisDir, '../generated/deals.json')
const outfile = resolve(thisDir, '../generated/retrieval-tasks.json')

const abortController = new AbortController()
const signal = abortController.signal

const stats = {
  total: 0n,
  retrievable: 0n
}
const started = Date.now()

await pipeline(
  createReadStream(infile, 'utf-8'),
  JSONStream.parse([true]),
  async function * (source, { signal }) {
    for await (const deal of source) {
      yield * await processDeal(deal, { signal })
    }
  },
  async function * (source, { signal }) {
    for await (const obj of source) {
      console.log(obj)
    }
  },
  // JSONStream.stringify('[\n  ', ',\n  ', '\n]\n'),
  // createWriteStream(outfile, 'utf-8'),
  { signal }
)

console.log('Finished in %s seconds', (Date.now() - started)/1000)
console.log()
console.log('Retrieval tasks were written to %s', relative(process.cwd(), outfile))
console.log('Total CIDs:  %s', stats.total)
console.log('Retrievable: %s', stats.retrievable)
console.log('Ratio:       %s%s', stats.total ? stats.retrievable * 100n / stats.total : '--', '%')
// TODO: break down per protocol

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

  for (const p of providers.flat()) {
    // console.log(p)

    // TODO: find only the contact advertised by the SP handling this deal

    const protocol = {
      0x900: 'bitswap',
      0x910: 'graphsync',
      0x0920: 'http',
      4128768: 'graphsync'
    }[varint.decode(Buffer.from(p.Metadata, 'base64'))]
    const providerAddress = p.Provider.Addrs[0]
    if (!protocol || !providerAddress) {
      continue
    }
    const fullAddress = `${providerAddress}/p2p/${p.Provider.ID}`

    stats.retrievable++

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
  const res = await fetch(`http://cid.contact/cid/${cid}`, { signal })

  if (res.status === 404) return undefined

  if (!res.ok) {
    throw new Error(`Cannot query cid.contact: ${res.status}\n${await res.text()}`)
  }

  const body = await res.json()
  return body.MultihashResults.map(r => r.ProviderResults)
}
