import * as Types from '../../src/types.js'
import { equals } from 'uint8arrays/equals'
import { RecordKeyConflict, RecordNotFound } from '../../src/errors.js'

/**
 * @implements {Types.AllocationsStorage}
 */
export class AllocationsStorage {
  constructor() {
    /** @type {(Types.BlobAddInput & Types.BlobListItem)[]} */
    this.items = []
  }

  /**
   * @param {Types.BlobAddInput} input
   * @returns {ReturnType<Types.AllocationsStorage['insert']>}
   */
  async insert({ space, cause, ...output }) {
    if (
      this.items.some(
        (i) => i.space === space && equals(i.blob.digest, output.blob.digest)
      )
    ) {
      return {
        error: new RecordKeyConflict(),
      }
    }
    this.items.unshift({
      space,
      cause,
      ...output,
      insertedAt: new Date().toISOString(),
    })
    return { ok: output }
  }

  /**
   * @param {Types.DID} space
   * @param {Types.MultihashDigest} digest
   * @returns {ReturnType<Types.AllocationsStorage['get']>}
   */
  async get(space, digest) {
    const item = this.items.find(
      (i) => i.space === space && equals(i.blob.digest, digest.bytes)
    )
    if (!item) {
      return { error: new RecordNotFound() }
    }
    return { ok: item }
  }

  /**
   * @param {Types.DID} space
   * @param {Types.MultihashDigest} digest
   * @returns {ReturnType<Types.AllocationsStorage['exists']>}
   */
  async exists(space, digest) {
    const item = this.items.find(
      (i) => i.space === space && equals(i.blob.digest, digest.bytes)
    )
    return { ok: !!item }
  }

  /**
   * @param {Types.DID} space
   * @param {Types.MultihashDigest} digest
   * @returns {ReturnType<Types.AllocationsStorage['remove']>}
   */
  async remove(space, digest) {
    const item = this.items.find(
      (i) => i.space === space && equals(i.blob.digest, digest.bytes)
    )
    if (!item) {
      return { error: new RecordNotFound() }
    }
    this.items = this.items.filter((i) => i !== item)
    return {
      ok: {
        size: item.blob.size,
      },
    }
  }

  /**
   * @param {Types.DID} space
   * @param {Types.ListOptions} options
   * @returns {ReturnType<Types.AllocationsStorage['list']>}
   */
  async list(
    space,
    { cursor = '0', pre = false, size = this.items.length } = {}
  ) {
    const offset = parseInt(cursor, 10)
    const items = pre ? this.items.slice(0, offset) : this.items.slice(offset)

    const matches = [...items.entries()]
      .filter(([n, item]) => item.space === space)
      .slice(0, size)

    if (matches.length === 0) {
      return { ok: { size: 0, results: [] } }
    }

    const first = matches[0]
    const last = matches[matches.length - 1]

    const start = first[0] || 0
    const end = last[0] || 0
    const values = matches.map(([_, item]) => item)

    const [before, after, results] = pre
      ? [`${start}`, `${end + 1}`, values]
      : [`${start + offset}`, `${end + 1 + offset}`, values]

    return {
      ok: {
        size: values.length,
        before,
        after,
        cursor: after,
        results,
      },
    }
  }
}
