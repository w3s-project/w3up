import Queue from 'p-queue'
import { encode } from './car.js'
import { store } from './storage.js'

// most thing are < 30MB
const SHARD_SIZE = 1024 * 1024 * 30
const CONCURRENT_UPLOADS = 3

/**
 * Shard a set of blocks into a set of CAR files. The last block is assumed to
 * be the DAG root and becomes the CAR root CID for the last CAR output.
 *
 * @extends {TransformStream<import('@ipld/unixfs').Block, import('./types').CARFile>}
 */
export class ShardingStream extends TransformStream {
  /**
   * @param {object} [options]
   * @param {number} [options.shardSize] The target shard size. Actual size of
   * CAR output may be bigger due to CAR header and block encoding data.
   */
  constructor(options = {}) {
    const shardSize = options.shardSize ?? SHARD_SIZE
    /** @type {import('@ipld/unixfs').Block[]} */
    let shard = []
    /** @type {import('@ipld/unixfs').Block[] | null} */
    let readyShard = null
    let size = 0

    super({
      async transform(block, controller) {
        if (readyShard != null) {
          controller.enqueue(await encode(readyShard))
          readyShard = null
        }
        if (shard.length && size + block.bytes.length > shardSize) {
          readyShard = shard
          shard = []
          size = 0
        }
        shard.push(block)
        size += block.bytes.length
      },

      async flush(controller) {
        if (readyShard != null) {
          controller.enqueue(await encode(readyShard))
        }

        const rootBlock = shard.at(-1)
        if (rootBlock != null) {
          controller.enqueue(await encode(shard, rootBlock.cid))
        }
      },
    })
  }
}

/**
 * Upload multiple DAG shards (encoded as CAR files) to the service.
 *
 * Note: an "upload" must be registered in order to link multiple shards
 * together as a complete upload.
 *
 * The writeable side of this transform stream accepts CAR files and the
 * readable side yields `CARMetadata`.
 *
 * @extends {TransformStream<import('./types').CARFile, import('./types').CARMetadata>}
 */
export class ShardStoringStream extends TransformStream {
  /**
   * @param {import('./types').InvocationConfig} invocationConfig Configuration
   * for the UCAN invocation. An object with `issuer` and `proofs`.
   *
   * The `issuer` is the signing authority that is issuing the UCAN
   * invocation(s). It is typically the user _agent_.
   *
   * The `proofs` are a set of capability delegations that prove the issuer
   * has the capability to perform the action.
   *
   * The issuer needs the `store/add` delegated capability.
   * @param {import('./types').RequestOptions} [options]
   */
  constructor({ issuer, proofs }, options = {}) {
    const queue = new Queue({ concurrency: CONCURRENT_UPLOADS })
    const abortController = new AbortController()
    super({
      async transform(car, controller) {
        void queue.add(
          async () => {
            try {
              const opts = { ...options, signal: abortController.signal }
              const cid = await store({ issuer, proofs }, car, opts)
              const { version, roots, size } = car
              controller.enqueue({ version, roots, cid, size })
            } catch (err) {
              controller.error(err)
              abortController.abort(err)
            }
          },
          { signal: abortController.signal }
        )

        // retain backpressure by not returning until no items queued to be run
        await queue.onSizeLessThan(1)
      },
      async flush() {
        // wait for queue empty AND pending items complete
        await queue.onIdle()
      },
    })
  }
}
