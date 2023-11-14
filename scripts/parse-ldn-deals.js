import assert from 'node:assert'
import { createReadStream, createWriteStream } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import split2 from 'split2'

// See https://docs.filecoin.io/networks/mainnet#genesis
const GENESIS_TS = new Date('2020-08-24T22:00:00Z').getTime()
const BLOCK_TIME = 30_000 // 30 seconds

const stats = {
  total: 0n,
  ldn: 0n,
}

const infile = resolve(dirname(fileURLToPath(import.meta.url)), '../generated/StateMarketDeals.ndjson')
const outfile = resolve(dirname(fileURLToPath(import.meta.url)), '../generated/ldn-deals.ndjson')
const started = Date.now()

const abortController = new AbortController()
const signal = abortController.signal
process.on('SIGINT', () => abortController.abort("interrupted"))

process.on('beforeExit', () => {
  console.log('Finished after %s seconds', (Date.now() - started)/1000)
  console.log()
  console.log('Total deals:    %s', stats.total)
  console.log('LDN with Label: %s', stats.ldn)
  console.log('Ratio:          %s%s', stats.total ? (stats.ldn * 100n / stats.total).toString() : '--', '%')
  console.log()
  console.log('LDN deals were written to %s', relative(process.cwd(), outfile))
})

const ldnClients = await loadLdnClients()

await pipeline(
  createReadStream(infile, 'utf-8'),
  split2(JSON.parse),
  async function * (source, { signal }) {
    for await (const deal of source) {
      stats.total++
      for await (const out of processDeal(deal, { signal })) {
        stats.ldn++
        yield JSON.stringify(out) + '\n'
        // console.log(JSON.stringify(out))
      }
    }
  },
  createWriteStream(outfile, 'utf-8'),
  { signal }
)

/** @param {{
   Proposal: {
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
  },
  State: {
    SectorStartEpoch: number;
    LastUpdatedEpoch: number;
    SlashEpoch: number;
    VerifiedClaim: number;
  }
 }} deal
*/
function * processDeal (deal) {
  const {VerifiedDeal, EndEpoch, Client, Label, Provider, PieceCID} = deal.Proposal
  assert.strictEqual(typeof VerifiedDeal, 'boolean', `VerifiedDeal is not a boolean: ${JSON.stringify(deal.Proposal)}`)
  if (!VerifiedDeal) return

  // FIXME: investigate why some deals don't have any PieceCID
  if (!PieceCID) return

  // Skip deals that expire in the next 6 weeks
  assert.strictEqual(typeof EndEpoch, 'number', `Epoch is not a number: ${JSON.stringify(deal.Proposal)}`)
  const expires = EndEpoch * BLOCK_TIME + GENESIS_TS
  const afterSixWeeks = Date.now() + 6 * 7 /* days/week */ * 24 /* hours/day */ * 3600_000
  if (expires < afterSixWeeks) return

  // Skip deals that are not part of FIL+ LDN
  assert.strictEqual(typeof Client, 'string', `Client is not a string: ${JSON.stringify(deal.Proposal)}`)
  if (!ldnClients.has(Client)) return

  // Skip deals that don't have payload CID metadata
  // TODO: handle other CID formats
  assert.strictEqual(typeof Label, 'string', `Label is not a string: ${JSON.stringify(deal.Proposal)}`)
  if (!Label || !Label.match(/^(bafy|Qm)/)) return

  assert.strictEqual(typeof Provider, 'string', `Provider is not a string: ${JSON.stringify(deal.Proposal)}`)
  assert.strictEqual(typeof PieceCID['/'], 'string', `PieceCID is not a CID link: ${JSON.stringify(deal.Proposal)}`)
  const entry = {
    provider: Provider,
    pieceCID: PieceCID['/'],
    payloadCID: Label
  }
  yield entry
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
