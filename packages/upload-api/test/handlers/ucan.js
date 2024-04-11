import * as API from '../../src/types.js'
import { UCAN, Console } from '@web3-storage/capabilities'
import pDefer from 'p-defer'
import { Receipt } from '@ucanto/core'
import { ed25519 } from '@ucanto/principal'
import { sha256 } from 'multiformats/hashes/sha2'
import * as BlobCapabilities from '@web3-storage/capabilities/blob'
import * as W3sBlobCapabilities from '@web3-storage/capabilities/web3.storage/blob'
import * as HTTPCapabilities from '@web3-storage/capabilities/http'

import { createServer, connect } from '../../src/lib.js'
import { alice, bob, mallory, registerSpace } from '../util.js'
import {
  createConcludeInvocation,
  getConcludeReceipt,
} from '../../src/ucan/conclude.js'

/**
 * @type {API.Tests}
 */
export const test = {
  'issuer can revoke delegation': async (assert, context) => {
    const proof = await Console.log.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    const success = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'hello' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.deepEqual(success.out, { ok: 'hello' })

    const revoke = await UCAN.revoke
      .invoke({
        issuer: context.id,
        audience: context.id,
        with: context.id.did(),
        nb: {
          ucan: proof.cid,
        },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.ok(revoke.out.ok?.time)

    const failure = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'bye' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.ok(failure.out.error?.message.includes('has been revoked'))
  },

  'audience can revoke delegation': async (assert, context) => {
    const proof = await Console.log.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    const success = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'hello' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.deepEqual(success.out, { ok: 'hello' })

    const revoke = await UCAN.revoke
      .invoke({
        issuer: alice,
        audience: context.id,
        with: alice.did(),
        nb: {
          ucan: proof.cid,
        },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.ok(revoke.out.ok?.time)

    const failure = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'bye' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.ok(failure.out.error?.message.includes('has been revoked'))
  },

  'issuer can revoke downstream delegation': async (assert, context) => {
    const proof = await Console.log.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    const bad = await Console.log.delegate({
      issuer: alice,
      audience: bob,
      with: context.id.did(),
      proofs: [proof],
    })

    const good = await Console.log.delegate({
      issuer: alice,
      audience: mallory,
      with: context.id.did(),
      proofs: [proof],
    })

    const revoke = await UCAN.revoke
      .invoke({
        issuer: context.id,
        audience: context.id,
        with: context.id.did(),
        nb: {
          ucan: bad.cid,
        },
        proofs: [bad],
      })
      .execute(context.connection)

    assert.ok(revoke.out.ok?.time)

    const failure = await Console.log
      .invoke({
        issuer: bob,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'boom' },
        proofs: [bad],
      })
      .execute(context.connection)

    assert.ok(failure.out.error?.message.includes('has been revoked'))

    const success = await Console.log
      .invoke({
        issuer: mallory,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'works' },
        proofs: [good],
      })
      .execute(context.connection)

    assert.deepEqual(success.out, { ok: 'works' })
  },

  'offstream revocations does not apply': async (assert, context) => {
    const proof = await Console.log.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    // Bob can revoke but it won't apply since he's not in the delegation chain
    const revoke = await UCAN.revoke
      .invoke({
        issuer: bob,
        audience: context.id,
        with: bob.did(),
        nb: {
          ucan: proof.cid,
        },
        proofs: [proof],
      })
      .execute(context.connection)
    assert.ok(revoke.out.ok?.time)

    const success = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'hello' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.deepEqual(success.out, { ok: 'hello' })
  },

  'upstream revocations does not apply': async (assert, context) => {
    const root = await Console.console.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    const parent = await Console.log.delegate({
      issuer: alice,
      audience: bob,
      with: context.id.did(),
      proofs: [root],
    })

    const child = await Console.log.delegate({
      issuer: bob,
      audience: mallory,
      with: context.id.did(),
      proofs: [parent],
    })

    const revoke = await UCAN.revoke
      .invoke({
        issuer: bob,
        audience: context.id,
        with: bob.did(),
        nb: {
          ucan: root.cid,
        },
        proofs: [root],
      })
      .delegate()

    const [revocation] = await context.connection.execute(revoke)

    assert.ok(revocation.out.ok?.time)

    const revocations = await context.revocationsStorage.query({
      [root.cid.toString()]: {},
      [parent.cid.toString()]: {},
      [child.cid.toString()]: {},
    })

    assert.deepEqual(
      JSON.stringify(revocations.ok),
      JSON.stringify({
        [root.cid.toString()]: {
          [bob.did()]: {
            cause: revoke.cid,
          },
        },
      })
    )

    // even though bob is principal in the delegation chain, he is downstream
    // of the delegation he revoked, therefore his revocation does not apply

    const success = await Console.log
      .invoke({
        issuer: mallory,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'hello' },
        proofs: [child],
      })
      .execute(context.connection)

    assert.deepEqual(success.out, { ok: 'hello' })
  },

  'revocation capability can be delegated': async (assert, context) => {
    const proof = await Console.log.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    const success = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'hello' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.deepEqual(success.out, { ok: 'hello' })

    const revocation = await UCAN.revoke.delegate({
      issuer: context.id,
      audience: bob,
      with: context.id.did(),
      proofs: [proof],
    })

    const revoke = await UCAN.revoke
      .invoke({
        issuer: bob,
        audience: context.id,
        with: context.id.did(),
        nb: {
          ucan: proof.cid,
        },
        proofs: [revocation],
      })
      .execute(context.connection)

    assert.ok(revoke.out.ok?.time)

    const failure = await Console.log
      .invoke({
        issuer: alice,
        audience: context.id,
        with: context.id.did(),
        nb: { value: 'bye' },
        proofs: [proof],
      })
      .execute(context.connection)

    assert.ok(failure.out.error?.message.includes('has been revoked'))
  },

  'can delegate specific revocation': async (assert, context) => {
    const proof = await Console.log.delegate({
      issuer: context.id,
      audience: alice,
      with: context.id.did(),
    })

    const unrelated = await Console.log.delegate({
      issuer: context.id,
      audience: mallory,
      with: context.id.did(),
    })

    const revocation = await UCAN.revoke.delegate({
      issuer: context.id,
      audience: bob,
      with: context.id.did(),
      nb: {
        ucan: unrelated.cid,
      },
      proofs: [unrelated],
    })

    const revoke = await UCAN.revoke
      .invoke({
        issuer: bob,
        audience: context.id,
        with: context.id.did(),
        nb: {
          ucan: proof.cid,
        },
        proofs: [revocation],
      })
      .execute(context.connection)

    assert.ok(String(revoke.out.error?.message).match(/Constrain violation/))
  },
  'ucan/conclude schedules web3.storage/blob/accept if invoked with the blob put receipt':
    async (assert, context) => {
      const taskScheduled = pDefer()
      const { proof, spaceDid } = await registerSpace(alice, context)

      // prepare data
      const data = new Uint8Array([11, 22, 34, 44, 55])
      const multihash = await sha256.digest(data)
      const digest = multihash.bytes
      const size = data.byteLength

      // create service connection
      const connection = connect({
        id: context.id,
        channel: createServer({
          ...context,
          tasksScheduler: {
            schedule: (invocation) => {
              taskScheduled.resolve(invocation)

              return Promise.resolve({
                ok: {},
              })
            },
          },
        }),
      })

      // invoke `blob/add`
      const blobAddInvocation = BlobCapabilities.add.invoke({
        issuer: alice,
        audience: context.id,
        with: spaceDid,
        nb: {
          blob: {
            digest,
            size,
          },
        },
        proofs: [proof],
      })
      const blobAdd = await blobAddInvocation.execute(connection)
      if (!blobAdd.out.ok) {
        throw new Error('invocation failed', { cause: blobAdd })
      }

      // Get receipt relevant content
      /**
       * @type {import('@ucanto/interface').Invocation[]}
       **/
      // @ts-expect-error read only effect
      const forkInvocations = blobAdd.fx.fork
      const allocatefx = forkInvocations.find(
        (fork) => fork.capabilities[0].can === W3sBlobCapabilities.allocate.can
      )
      const allocateUcanConcludefx = forkInvocations.find(
        (fork) => fork.capabilities[0].can === UCAN.conclude.can
      )
      const putfx = forkInvocations.find(
        (fork) => fork.capabilities[0].can === HTTPCapabilities.put.can
      )
      if (!allocateUcanConcludefx || !putfx || !allocatefx) {
        throw new Error('effects not provided')
      }
      const receipt = getConcludeReceipt(allocateUcanConcludefx)

      // Get `web3.storage/blob/allocate` receipt with address
      /**
       * @type {import('@web3-storage/capabilities/types').BlobAddress}
       **/
      // @ts-expect-error receipt out is unknown
      const address = receipt?.out.ok?.address
      assert.ok(address)

      // Store allocate task to be fetchable from allocate
      await context.tasksStorage.put(allocatefx)

      // Write blob
      const goodPut = await fetch(address.url, {
        method: 'PUT',
        mode: 'cors',
        body: data,
        headers: address?.headers,
      })
      assert.equal(goodPut.status, 200, await goodPut.text())

      // Create `http/put` receipt
      const keys = putfx.facts[0]['keys']
      // @ts-expect-error Argument of type 'unknown' is not assignable to parameter of type 'SignerArchive<`did:${string}:${string}`, SigAlg>'
      const blobProvider = ed25519.from(keys)
      const httpPut = HTTPCapabilities.put.invoke({
        issuer: blobProvider,
        audience: blobProvider,
        with: blobProvider.toDIDKey(),
        nb: {
          body: {
            digest,
            size,
          },
          url: {
            'ucan/await': ['.out.ok.address.url', allocatefx.cid],
          },
          headers: {
            'ucan/await': ['.out.ok.address.headers', allocatefx.cid],
          },
        },
        facts: putfx.facts,
        expiration: Infinity,
      })

      const httpPutDelegation = await httpPut.delegate()
      const httpPutReceipt = await Receipt.issue({
        issuer: blobProvider,
        ran: httpPutDelegation.cid,
        result: {
          ok: {},
        },
      })
      const httpPutConcludeInvocation = createConcludeInvocation(
        alice,
        context.id,
        httpPutReceipt
      )
      const ucanConclude = await httpPutConcludeInvocation.execute(connection)
      if (!ucanConclude.out.ok) {
        throw new Error('invocation failed', { cause: blobAdd })
      }

      // verify accept was scheduled
      /** @type {import('@ucanto/interface').Invocation<import('@web3-storage/capabilities/types').BlobAccept>} */
      const blobAcceptInvocation = await taskScheduled.promise
      assert.equal(blobAcceptInvocation.capabilities.length, 1)
      assert.equal(
        blobAcceptInvocation.capabilities[0].can,
        W3sBlobCapabilities.accept.can
      )
      assert.equal(
        blobAcceptInvocation.capabilities[0].nb._put['ucan/await'][0],
        '.out.ok'
      )
      assert.ok(
        blobAcceptInvocation.capabilities[0].nb._put['ucan/await'][1].equals(
          httpPutDelegation.cid
        )
      )
      assert.ok(blobAcceptInvocation.capabilities[0].nb.blob)
      assert.equal(blobAcceptInvocation.capabilities[0].nb.space, spaceDid)
    },
}
