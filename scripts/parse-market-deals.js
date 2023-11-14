import { createReadStream, createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import JSONStream from 'JSONStream'
import { once } from 'node:events'

// See https://docs.filecoin.io/networks/mainnet#genesis
const GENESIS_TS = new Date('2020-08-24T22:00:00Z').getTime()
const BLOCK_TIME = 30_000 // 30 seconds

const ldnClients = await loadLdnClients()

const outfile = resolve(dirname(fileURLToPath(import.meta.url)), '../generated/deals.json')
const outstream = JSONStream.stringify('[\n  ', ',\n  ', '\n]\n')
outstream.pipe(createWriteStream(outfile, 'utf-8'))

const infile = resolve(dirname(fileURLToPath(import.meta.url)), '../StateMarketDeals.json')
await pipeline(
  createReadStream(infile, 'utf-8'),
  JSONStream.parse([true, 'Proposal']),
  async function * (source, { signal }) {
    for await (const deal of source) {
      signal.throwIfAborted()
      await processDeal(deal)
    }
  }
)

outstream.end()
console.log('LDN deals were written to %s', relative(process.cwd(), outfile))

/** @param {{
   PieceCID: {
    '/': string;
  };
  PieceSize: number;
  VerifiedDeal: boolean;
  Client: string;
  Provider: string;
  Label?: string;
  StartEpoch: number;
  EndEpoch: number;
  StoragePricePerEpoch: string;
  ProviderCollateral: string;
  ClientCollateral: string;
 }} deal
*/
async function processDeal (deal) {
  if (!deal.VerifiedDeal) return

  // Skip deals that expire in the next 6 weeks
  const expires = deal.EndEpoch * BLOCK_TIME + GENESIS_TS
  const afterSixWeeks = Date.now() + 6 * 7 /* days/week */ * 24 /* hours/day */ * 3600_000
  if (expires < afterSixWeeks) return

  // Skip deals that are not part of FIL+ LDN
  if (!ldnClients.has(deal.Client)) return

  // Skip deals that don't have payload CID metadata
  // TODO: handle other CID formats
  if (!deal.Label || !deal.Label.match(/^(bafy|Qm)/)) return

  const entry = {
    provider: deal.Provider,
    pieceCID: deal.PieceCID['/'],
    payloadCID: deal.Label
  }
  if (!outstream.write(entry)) {
    await once(outstream, 'drain')
  }
}

async function loadLdnClients () {
  const data = await readFile(
    resolve(dirname(fileURLToPath(import.meta.url)), '../generated/ldn-clients.csv'),
    'utf-8'
  )
  const list = data
    .trim() // remove EOL at EOF
    .split('\n') // split lines
  const set = new Set()
  for (const p of list) {
    set.add(p)
  }
  return set
}
