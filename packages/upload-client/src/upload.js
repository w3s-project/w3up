import * as UploadCapabilities from '@web3-storage/capabilities/upload'
import { SpaceDID } from '@web3-storage/capabilities/utils'
import retry from 'p-retry'
import { servicePrincipal, connection } from './service.js'
import { REQUEST_RETRIES } from './constants.js'

/**
 * Register an "upload" with the service. The issuer needs the `upload/add`
 * delegated capability.
 *
 * Required delegated capability proofs: `upload/add`
 *
 * @param {import('./types.js').InvocationConfig} conf Configuration
 * for the UCAN invocation. An object with `issuer`, `with` and `proofs`.
 *
 * The `issuer` is the signing authority that is issuing the UCAN
 * invocation(s). It is typically the user _agent_.
 *
 * The `with` is the resource the invocation applies to. It is typically the
 * DID of a space.
 *
 * The `proofs` are a set of capability delegations that prove the issuer
 * has the capability to perform the action.
 *
 * The issuer needs the `upload/add` delegated capability.
 * @param {import('multiformats/link').UnknownLink} root Root data CID for the DAG that was stored.
 * @param {import('./types.js').CARLink[]} shards CIDs of CAR files that contain the DAG.
 * @param {import('./types.js').RequestOptions} [options]
 * @returns {Promise<import('./types.js').UploadAddSuccess>}
 */
export async function add(
  { issuer, with: resource, proofs, audience },
  root,
  shards,
  options = {}
) {
  /* c8 ignore next */
  const conn = options.connection ?? connection
  const result = await retry(
    async () => {
      return await UploadCapabilities.add
        .invoke({
          issuer,
          /* c8 ignore next */
          audience: audience ?? servicePrincipal,
          with: SpaceDID.from(resource),
          nb: { root, shards },
          proofs,
        })
        .execute(conn)
    },
    {
      onFailedAttempt: console.warn,
      retries: options.retries ?? REQUEST_RETRIES,
    }
  )

  if (!result.out.ok) {
    throw new Error(`failed ${UploadCapabilities.add.can} invocation`, {
      cause: result.out.error,
    })
  }

  return result.out.ok
}

/**
 * List uploads created by the issuer.
 *
 * @param {import('./types.js').InvocationConfig} conf Configuration
 * for the UCAN invocation. An object with `issuer`, `with` and `proofs`.
 *
 * The `issuer` is the signing authority that is issuing the UCAN
 * invocation(s). It is typically the user _agent_.
 *
 * The `with` is the resource the invocation applies to. It is typically the
 * DID of a space.
 *
 * The `proofs` are a set of capability delegations that prove the issuer
 * has the capability to perform the action.
 *
 * The issuer needs the `upload/list` delegated capability.
 * @param {import('./types.js').ListRequestOptions} [options]
 * @returns {Promise<import('./types.js').UploadListSuccess>}
 */
export async function list(
  { issuer, with: resource, proofs, audience },
  options = {}
) {
  /* c8 ignore next */
  const conn = options.connection ?? connection

  const result = await UploadCapabilities.list
    .invoke({
      issuer,
      /* c8 ignore next */
      audience: audience ?? servicePrincipal,
      with: SpaceDID.from(resource),
      proofs,
      nb: {
        cursor: options.cursor,
        size: options.size,
        pre: options.pre,
      },
    })
    .execute(conn)

  if (!result.out.ok) {
    throw new Error(`failed ${UploadCapabilities.list.can} invocation`, {
      cause: result.out.error,
    })
  }

  return result.out.ok
}

/**
 * Remove an upload by root data CID.
 *
 * @param {import('./types.js').InvocationConfig} conf Configuration
 * for the UCAN invocation. An object with `issuer`, `with` and `proofs`.
 *
 * The `issuer` is the signing authority that is issuing the UCAN
 * invocation(s). It is typically the user _agent_.
 *
 * The `with` is the resource the invocation applies to. It is typically the
 * DID of a space.
 *
 * The `proofs` are a set of capability delegations that prove the issuer
 * has the capability to perform the action.
 *
 * The issuer needs the `upload/remove` delegated capability.
 * @param {import('multiformats').UnknownLink} root Root data CID to remove.
 * @param {import('./types.js').RequestOptions} [options]
 */
export async function remove(
  { issuer, with: resource, proofs, audience },
  root,
  options = {}
) {
  /* c8 ignore next */
  const conn = options.connection ?? connection
  const result = await UploadCapabilities.remove
    .invoke({
      issuer,
      /* c8 ignore next */
      audience: audience ?? servicePrincipal,
      with: SpaceDID.from(resource),
      nb: { root },
      proofs,
    })
    .execute(conn)

  if (!result.out.ok) {
    throw new Error(`failed ${UploadCapabilities.remove.can} invocation`, {
      cause: result.out.error,
    })
  }

  return result.out.ok
}
