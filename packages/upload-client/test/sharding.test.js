import assert from 'assert'
import { CID } from 'multiformats'
import { equals } from 'multiformats/bytes'
import { sha256 } from 'multiformats/hashes/sha2'
import { createFileEncoderStream } from '../src/unixfs.js'
import { ShardingStream } from '../src/sharding.js'
import { randomBlock, randomBytes } from './helpers/random.js'

describe('ShardingStream', () => {
  it('creates shards from blocks', async () => {
    const file = new Blob([await randomBytes(1024 * 1024 * 5)])
    const shardSize = 1024 * 1024 * 2

    /** @type {import('../src/types.js').CARFile[]} */
    const shards = []

    await createFileEncoderStream(file)
      .pipeThrough(new ShardingStream({ shardSize }))
      .pipeTo(
        new WritableStream({
          write: (s) => {
            shards.push(s)
          },
        })
      )

    assert(shards.length > 1)

    for (const car of shards) {
      // add 100 bytes leeway to the chunk size for encoded CAR data
      assert(car.size <= shardSize + 100)
    }
  })

  it('uses passed root CID', async () => {
    const file = new Blob([await randomBytes(32)])

    const rootCID = CID.parse(
      'bafybeibrqc2se2p3k4kfdwg7deigdggamlumemkiggrnqw3edrjosqhvnm'
    )
    /** @type {import('../src/types.js').CARFile[]} */
    const shards = []

    await createFileEncoderStream(file)
      .pipeThrough(new ShardingStream({ rootCID }))
      .pipeTo(
        new WritableStream({
          write: (s) => {
            shards.push(s)
          },
        })
      )

    assert.equal(shards.length, 1)
    assert.equal(shards[0].roots[0].toString(), rootCID.toString())
  })

  it('exceeds shard size when block bigger than shard size is encoded', async () => {
    await assert.rejects(
      () =>
        new ReadableStream({
          async pull(controller) {
            const block = await randomBlock(128)
            controller.enqueue(block)
            controller.close()
          },
        })
          .pipeThrough(new ShardingStream({ shardSize: 64 }))
          .pipeTo(new WritableStream()),
      /block will cause CAR to exceed shard size/
    )
  })

  it('creates overflow shard when CAR header with root CID exceeds shard size', async () => {
    const blocks = [
      await randomBlock(128), // encoded block length = 166
      await randomBlock(64), // encoded block length = 102
      await randomBlock(32), // encoded block length = 70
    ]

    /** @type {import('../src/types.js').CARFile[]} */
    const shards = []
    await new ReadableStream({
      pull(controller) {
        const block = blocks.shift()
        if (!block) return controller.close()
        controller.enqueue(block)
      },
    })
      // shard with no roots = encoded block (166) + CAR header (18) = 183
      // shard with no roots = encoded block (102) + CAR header (18) = 120
      // shard with 1 root = encoded block (70) + CAR header (18) = 88
      // shard with 1 root = encoded block (70) + CAR header (59) = 155
      // i.e. shard size of 208 (120 + 88) should allow us 1 shard with 0 roots
      // and then 1 shard with 2 blocks that, when encoded as a CAR with 1 root
      // will actually exceed the shard size. It must then be refactored into
      // 2 shards.
      .pipeThrough(new ShardingStream({ shardSize: 208 }))
      .pipeTo(
        new WritableStream({
          write: (s) => {
            shards.push(s)
          },
        })
      )

    assert.equal(shards.length, 3)
  })

  it('exceeds shard size when block is encoded with root CID', async () => {
    const blocks = [
      await randomBlock(128), // encoded block length = 166
    ]

    await assert.rejects(() => {
      return (
        new ReadableStream({
          pull(controller) {
            const block = blocks.shift()
            if (!block) return controller.close()
            controller.enqueue(block)
          },
        })
          // shard with no roots = encoded block (166) + CAR header (18) = 184
          // shard with 1 root = encoded block (166) + CAR header (59) = 225
          // i.e. shard size of 183 should allow us 1 shard with no roots and then
          // we'll fail to create a shard with 1 root.
          .pipeThrough(new ShardingStream({ shardSize: 184 }))
          .pipeTo(new WritableStream())
      )
    }, /block will cause CAR to exceed shard size/)
  })

  it('no blocks no shards', async () => {
    let shards = 0
    await new ReadableStream({
      pull: (controller) => {
        controller.close()
      },
    })
      .pipeThrough(new ShardingStream({ shardSize: 206 }))
      .pipeTo(
        new WritableStream({
          write: () => {
            shards++
          },
        })
      )
    assert.equal(shards, 0)
  })

  it('indexes blocks in shards', async () => {
    const file = new Blob([await randomBytes(1024 * 1024 * 10)])
    const shardSize = 1024 * 1024 * 3

    /** @type {import('../src/types.js').IndexedCARFile[]} */
    const shards = []

    await createFileEncoderStream(file)
      .pipeThrough(new ShardingStream({ shardSize }))
      .pipeTo(
        new WritableStream({
          write: (s) => {
            shards.push(s)
          },
        })
      )

    assert(shards.length > 1)

    for (const car of shards) {
      const bytes = new Uint8Array(await car.arrayBuffer())
      for (const [expected, [offset, length]] of car.slices.entries()) {
        const actual = await sha256.digest(bytes.slice(offset, offset + length))
        assert(equals(expected.bytes, actual.bytes))
      }
    }
  })
})
