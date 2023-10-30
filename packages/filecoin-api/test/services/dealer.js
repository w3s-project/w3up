import { Dealer } from '@web3-storage/capabilities'
import * as Signer from '@ucanto/principal/ed25519'
import * as Server from '@ucanto/server'
import * as DealTrackerCaps from '@web3-storage/capabilities/filecoin/deal-tracker'
import { CBOR } from '@ucanto/core'

import * as API from '../../src/types.js'
import * as DealerApi from '../../src/dealer/api.js'

import { createServer, connect } from '../../src/dealer/service.js'
import { randomAggregate } from '../utils.js'
import { FailingStore } from '../context/store.js'
import { mockService } from '../context/mocks.js'
import { getConnection } from '../context/service.js'
import { getStoreImplementations } from '../context/store-implementations.js'
import { StoreOperationErrorName } from '../../src/errors.js'

/**
 * @typedef {import('../../src/dealer/api.js').AggregateRecord} AggregateRecord
 * @typedef {import('../../src/dealer/api.js').AggregateRecordKey} AggregateRecordKey
 * @typedef {import('../../src/dealer/api.js').OfferDocument} OfferDocument
 */

/**
 * @type {API.Tests<DealerApi.ServiceContext>}
 */
export const test = {
  'aggregate/offer inserts aggregate into stores': async (assert, context) => {
    const { storefront } = await getServiceContext()
    const connection = connect({
      id: context.id,
      channel: createServer(context),
    })

    // Generate piece for test
    const { pieces, aggregate } = await randomAggregate(100, 128)
    const offer = pieces.map((p) => p.link)
    const piecesBlock = await CBOR.write(offer)

    // aggregator invocation
    const pieceAddInv = Dealer.aggregateOffer.invoke({
      issuer: storefront,
      audience: connection.id,
      with: storefront.did(),
      nb: {
        aggregate: aggregate.link,
        pieces: piecesBlock.cid,
      },
    })
    pieceAddInv.attach(piecesBlock)

    const response = await pieceAddInv.execute(connection)
    if (response.out.error) {
      throw new Error('invocation failed', { cause: response.out.error })
    }
    assert.ok(response.out.ok)
    assert.ok(response.out.ok.aggregate?.equals(aggregate.link))

    // Validate effect in receipt
    const fxJoin = await Dealer.aggregateAccept
      .invoke({
        issuer: context.id,
        audience: context.id,
        with: context.id.did(),
        nb: {
          aggregate: aggregate.link,
          pieces: piecesBlock.cid,
        },
        expiration: Infinity,
      })
      .delegate()

    assert.ok(response.fx.join)
    assert.ok(fxJoin.link().equals(response.fx.join?.link()))

    // Validate stores
    const storedDeal = await context.aggregateStore.get({
      aggregate: aggregate.link.link(),
    })
    assert.ok(storedDeal.ok)
    assert.ok(storedDeal.ok?.aggregate.equals(aggregate.link.link()))
    assert.ok(storedDeal.ok?.pieces.equals(piecesBlock.cid))
    assert.equal(storedDeal.ok?.status, 'offered')
    assert.ok(storedDeal.ok?.insertedAt)
    assert.ok(storedDeal.ok?.updatedAt)

    const storedOffer = await context.offerStore.get(piecesBlock.cid.toString())
    assert.ok(storedOffer.ok)
    assert.ok(storedOffer.ok?.value.aggregate.equals(aggregate.link.link()))
    assert.equal(storedOffer.ok?.value.issuer, storefront.did())
    assert.deepEqual(
      storedOffer.ok?.value.pieces.map((p) => p.toString()),
      offer.map((p) => p.toString())
    )
  },
  'aggregate/offer fails if not able to check aggregate store':
    wichMockableContext(
      async (assert, context) => {
        const { storefront } = await getServiceContext()
        const connection = connect({
          id: context.id,
          channel: createServer(context),
        })

        // Generate piece for test
        const { pieces, aggregate } = await randomAggregate(100, 128)
        const offer = pieces.map((p) => p.link)
        const piecesBlock = await CBOR.write(offer)

        // aggregator invocation
        const pieceAddInv = Dealer.aggregateOffer.invoke({
          issuer: storefront,
          audience: connection.id,
          with: storefront.did(),
          nb: {
            aggregate: aggregate.link,
            pieces: piecesBlock.cid,
          },
        })
        pieceAddInv.attach(piecesBlock)

        const response = await pieceAddInv.execute(connection)
        assert.ok(response.out.error)
        assert.equal(response.out.error?.name, StoreOperationErrorName)
      },
      async (context) => ({
        ...context,
        aggregateStore:
          getStoreImplementations(FailingStore).dealer.aggregateStore,
      })
    ),
  'aggregate/offer fails if not able to put to offer store':
    wichMockableContext(
      async (assert, context) => {
        const { storefront } = await getServiceContext()
        const connection = connect({
          id: context.id,
          channel: createServer(context),
        })

        // Generate piece for test
        const { pieces, aggregate } = await randomAggregate(100, 128)
        const offer = pieces.map((p) => p.link)
        const piecesBlock = await CBOR.write(offer)

        // aggregator invocation
        const pieceAddInv = Dealer.aggregateOffer.invoke({
          issuer: storefront,
          audience: connection.id,
          with: storefront.did(),
          nb: {
            aggregate: aggregate.link,
            pieces: piecesBlock.cid,
          },
        })
        pieceAddInv.attach(piecesBlock)

        const response = await pieceAddInv.execute(connection)
        assert.ok(response.out.error)
        assert.equal(response.out.error?.name, StoreOperationErrorName)
      },
      async (context) => ({
        ...context,
        offerStore: getStoreImplementations(FailingStore).dealer.offerStore,
      })
    ),
  'aggregate/accept issues receipt with data aggregation proof': async (
    assert,
    context
  ) => {
    const { storefront } = await getServiceContext()
    const connection = connect({
      id: context.id,
      channel: createServer(context),
    })

    // Generate piece for test
    const { pieces, aggregate } = await randomAggregate(100, 128)
    const offer = pieces.map((p) => p.link)
    const piecesBlock = await CBOR.write(offer)

    // Deal as in mocked service
    const deal = {
      dataType: 0n,
      dataSource: {
        dealID: 111n,
      },
    }
    const putRes = await context.aggregateStore.put({
      aggregate: aggregate.link,
      pieces: piecesBlock.cid,
      status: 'offered',
      insertedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    assert.ok(putRes.ok)

    // aggregator invocation
    const pieceAddInv = Dealer.aggregateAccept.invoke({
      issuer: storefront,
      audience: connection.id,
      with: storefront.did(),
      nb: {
        aggregate: aggregate.link,
        pieces: piecesBlock.cid,
      },
    })
    pieceAddInv.attach(piecesBlock)

    const response = await pieceAddInv.execute(connection)
    if (response.out.error) {
      throw new Error('invocation failed', { cause: response.out.error })
    }
    assert.ok(response.out.ok)
    assert.equal(
      BigInt(response.out.ok.dataSource.dealID),
      BigInt(deal.dataSource.dealID)
    )
    assert.equal(BigInt(response.out.ok.dataType), BigInt(deal.dataType))
  },
  'aggregate/accept fails if not able to invoke deal info':
    wichMockableContext(
      async (assert, context) => {
        const { storefront } = await getServiceContext()
        const connection = connect({
          id: context.id,
          channel: createServer(context),
        })

        // Generate piece for test
        const { pieces, aggregate } = await randomAggregate(100, 128)
        const offer = pieces.map((p) => p.link)
        const piecesBlock = await CBOR.write(offer)

        // aggregator invocation
        const pieceAddInv = Dealer.aggregateAccept.invoke({
          issuer: storefront,
          audience: connection.id,
          with: storefront.did(),
          nb: {
            aggregate: aggregate.link,
            pieces: piecesBlock.cid,
          },
        })
        pieceAddInv.attach(piecesBlock)

        const response = await pieceAddInv.execute(connection)
        assert.ok(response.out.error)
      },
      async (context) => {
        /**
         * Mock deal tracker to fail
         */
        const dealTrackerSigner = await Signer.generate()
        const service = mockService({
          deal: {
            info: Server.provideAdvanced({
              capability: DealTrackerCaps.dealInfo,
              handler: async ({ invocation, context }) => {
                return {
                  error: new Server.Failure(),
                }
              },
            }),
          },
        })
        const dealTrackerConnection = getConnection(
          dealTrackerSigner,
          service
        ).connection

        return {
          ...context,
          service,
          dealTrackerService: {
            connection: dealTrackerConnection,
            invocationConfig: {
              issuer: context.id,
              with: context.id.did(),
              audience: dealTrackerSigner,
            },
          },
        }
      }
    ),
}

async function getServiceContext() {
  const dealer = await Signer.generate()
  const storefront = await Signer.generate()

  return { dealer, storefront }
}

/**
 * @param {API.Test<DealerApi.ServiceContext>} testFn
 * @param {(context: DealerApi.ServiceContext) => Promise<DealerApi.ServiceContext>} mockContextFunction
 */
function wichMockableContext(testFn, mockContextFunction) {
  // @ts-ignore
  return async function (...args) {
    const modifiedArgs = [args[0], await mockContextFunction(args[1])]
    // @ts-ignore
    return testFn(...modifiedArgs)
  }
}
