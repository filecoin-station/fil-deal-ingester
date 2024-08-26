import 'dotenv/config'

import fs from 'node:fs/promises'
import { setTimeout } from 'node:timers/promises'
import pg from 'pg'

const DATACAPS_URL = 'https://api.datacapstats.io/public/api/'

let {
  DATABASE_URL,
  DATACAPS_TOKEN
} = process.env

if (!DATABASE_URL) {
  console.log('Missing required environment variable: DATABASE_URL')
  process.exit(1)
}

if (!DATACAPS_TOKEN) {
  DATACAPS_TOKEN = await getApiKey()
  await fs.appendFile('.env', `DATACAPS_TOKEN=${DATACAPS_TOKEN}\n`)
}

const pgClient = new pg.Client(DATABASE_URL)
await pgClient.connect()

// The "WITH" query is a more performing variant of `SELECT DISTINCT(client) FROM retrievable_deals`
// See https://wiki.postgresql.org/wiki/Loose_indexscan
const { rows: clientsMissingAllocator } = await pgClient.query(`
  WITH all_clients AS (
    WITH RECURSIVE t AS (
      (SELECT client_id FROM retrievable_deals ORDER BY client_id LIMIT 1)
      UNION ALL
      SELECT (SELECT client_id FROM retrievable_deals WHERE client_id > t.client_id ORDER BY client_id LIMIT 1)
      FROM t
      WHERE t.client_id IS NOT NULL
    )
    SELECT client_id FROM t WHERE client_id IS NOT NULL
  )
  SELECT all_clients.client_id
  FROM all_clients
  LEFT OUTER JOIN allocator_clients ON all_clients.client_id = allocator_clients.client_id
  WHERE allocator_id IS NULL;
`)

for (const { client_id: clientId } of clientsMissingAllocator) {
  console.log('Fetching allowance info for the client %s', clientId)

  const res = await fetch(
    buildUrlWithQueryString('getVerifiedClients', { filter: clientId, limit: 1000 }),
    { headers: { 'X-API-KEY': DATACAPS_TOKEN } }
  )
  if (!res.ok) {
    throw new Error(`Cannot query client allowance: ${res.status}\n${await res.text()}`)
  }

  const body = await res.json()
  // console.log('%o', body)

  if (body.count === '0' || body.count === 0 || !body.count) {
    console.log('The client %s does not have any datacap allocation?! Skipping.', clientId)
    continue
  }

  if (body.count !== '1') {
    console.log('The clients should have datacap from a single allocator only. Client %s has datacap from %s allocators. Using the first record only.', clientId, body.count)
  }
  const { verifierAddressId } = body.data[0]

  console.log('Inserting client=%s allocator=%s', clientId, verifierAddressId)
  await pgClient.query('INSERT INTO allocator_clients (client_id, allocator_id) VALUES ($1, $2)', [
    clientId, verifierAddressId
  ])

  // slow down to avoid hitting rate limits
  await setTimeout(100)
}

console.log('Updated allocator info for %s clients', clientsMissingAllocator.length)

pgClient.end()

/** @returns {Promise<string>} */
async function getApiKey () {
  const res = await fetch(`${DATACAPS_URL}getApiKey`)
  if (!res.ok) {
    throw new Error(`Cannot obtain DataCapStats API key: ${res.status}\n${await res.text()}`)
  }

  return await res.text()
}

function buildUrlWithQueryString (endpointPath, searchParams) {
  const url = new URL(endpointPath, DATACAPS_URL)
  url.search = new URLSearchParams(searchParams).toString()
  return url
}
