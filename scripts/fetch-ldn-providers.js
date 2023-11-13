import fs from 'node:fs/promises'
import { dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'

const DATACAPS_URL = 'https://api.datacapstats.io/public/api/'
const API_KEY = process.env.API_KEY ?? await getApiKey()

const allLdnProviders = []

const notaries = await findNotaries('ldn')
console.log('Found %s notaries', notaries.length)

for (const notaryAddressId of notaries) {
  const providers = await getVerifiedClientsOfNotary(notaryAddressId)
  console.log('Notary %s tracks %s providers', notaryAddressId, providers.length)
  allLdnProviders.push(...providers)
  // slow down to avoid hitting rate limits
  await setTimeout(100)
}

console.log('Found %s FIL+ LDN providers in total', allLdnProviders.length)
const outfile = resolve(dirname(fileURLToPath(import.meta.url)), '../generated/ldn-providers.csv')
await fs.writeFile(outfile, allLdnProviders.map(p => `${p}\n`).join(''))
console.log('The list was written to %s', relative(process.cwd(), outfile))

/** @returns {Promise<string>} */
async function getApiKey () {
  const res = await fetch(`${DATACAPS_URL}/getApiKey`)
  if (!res.ok) {
    throw new Error(`Cannot obtain DataCapStats API key: ${res.status}\n${await res.text()}`)
  }

  return await res.text()
}

/** @returns {Promise<string[]>} */
async function findNotaries (filter) {
  const res = await fetch(
    buildUrlWithQueryString('getVerifiers', { limit: 1000, filter }),
    { headers: { 'X-API-KEY': API_KEY } }
  )

  if (!res.ok) {
    throw new Error(`Cannot query notaries: ${res.status}\n${await res.text()}`)
  }

  const body = await res.json()
  return body.data.map(obj => obj.addressId)
}

/** @returns {Promise<string[]>} */
async function getVerifiedClientsOfNotary (notaryAddressId) {
  const res = await fetch(
    buildUrlWithQueryString(`getVerifiedClients/${notaryAddressId}`, { limit: 1000 }),
    { headers: { 'X-API-KEY': API_KEY } }
  )

  if (!res.ok) {
    throw new Error(`Cannot query verified clients: ${res.status}\n${await res.text()}`)
  }

  const body = await res.json()
  return body.data.map(obj => obj.addressId)
}

function buildUrlWithQueryString (endpointPath, searchParams) {
  const url = new URL(endpointPath, DATACAPS_URL)
  url.search = new URLSearchParams(searchParams).toString()
  return url
}
