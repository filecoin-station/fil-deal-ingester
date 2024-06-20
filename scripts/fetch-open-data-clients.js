import fs from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'
import LDN_NOTARIES from './ldn-notaries-snapshot.js'

const DATACAPS_URL = 'https://api.datacapstats.io/public/api/'
const API_KEY = process.env.API_KEY ?? await getApiKey()

const PUBLIC_DATA_ALLOCATORS = [
  'f03015751', // https://github.com/fidlabs/Open-Data-Pathway
]

const allOpenDataClients = []

const verifiers = [
  ...LDN_NOTARIES,
  ...PUBLIC_DATA_ALLOCATORS,
]

console.log('Updating data for %s verifiers', verifiers.length)

for (const verifierId of verifiers) {
  const clients = await getVerifiedClientsOf(verifierId)
  console.log('Verifier %s assigned datacap to %s clients', verifierId, clients.length)
  allOpenDataClients.push(...clients)
  // slow down to avoid hitting rate limits
  await setTimeout(100)
}

allOpenDataClients.sort()

// remove duplicates
const cleansed = []
for (let i = 0; i < allOpenDataClients.length; i++) {
  if (i === 0 || allOpenDataClients[i] !== allOpenDataClients[i - 1]) { cleansed.push(allOpenDataClients[i]) }
}

console.log('Found %s FIL+ LDN clients in total', cleansed.length)
const outfile = resolve(dirname(fileURLToPath(import.meta.url)), '../generated/open-data-clients.csv')
await fs.writeFile(outfile, cleansed.map(p => `${p}\n`).join(''))
console.log('The list was written to %s', relative(process.cwd(), outfile))

/** @returns {Promise<string>} */
async function getApiKey () {
  const res = await fetch(`${DATACAPS_URL}getApiKey`)
  if (!res.ok) {
    throw new Error(`Cannot obtain DataCapStats API key: ${res.status}\n${await res.text()}`)
  }

  return await res.text()
}

/** @returns {Promise<string[]>} */
async function getVerifiedClientsOf (notaryAddressId) {
  const res = await fetch(
    buildUrlWithQueryString(`getVerifiedClients/${notaryAddressId}`, { limit: 1000 }),
    { headers: { 'X-API-KEY': API_KEY } }
  )

  if (!res.ok) {
    throw new Error(`Cannot query verified clients: ${res.status}\n${await res.text()}`)
  }

  const body = await res.json()
  return body.data.map(obj => obj.addressId).filter(val => !!val)
}

function buildUrlWithQueryString (endpointPath, searchParams) {
  const url = new URL(endpointPath, DATACAPS_URL)
  url.search = new URLSearchParams(searchParams).toString()
  return url
}
