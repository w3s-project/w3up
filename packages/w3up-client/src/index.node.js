/**
 * @hidden
 * @module
 */
import { AgentData } from '@web3-storage/access/agent'
import { StoreConf } from '@web3-storage/access/stores/store-conf'
import { generate } from '@ucanto/principal/ed25519'
import { Client } from './client.js'

/**
 * Create a new w3up client.
 *
 * If no backing store is passed one will be created that is appropriate for
 * the environment.
 *
 * If the backing store is empty, a new signing key will be generated and
 * persisted to the store. In the browser an unextractable RSA key will be
 * generated by default. In other environments an Ed25519 key is generated.
 *
 * If the backing store already has data stored, it will be loaded and used.
 *
 * @type {import('./types').ClientFactory}
 */
export async function create(options = {}) {
  const store = options.store ?? new StoreConf({ profile: 'w3up-client' })
  const raw = await store.load()
  if (raw) {
    const data = AgentData.fromExport(raw, { store })
    if (options.principal && data.principal.did() !== options.principal.did()) {
      throw new Error(`store cannot be used with ${options.principal.did()}, stored principal and passed principal must match`)
    }
    return new Client(data, options)
  }
  const principal = options.principal ?? await generate()
  const data = await AgentData.create({ principal }, { store })
  return new Client(data, options)
}

export { Client }
