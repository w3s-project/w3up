import * as API from '../../src/types.js'

/**
 * @implements {API.AggregateStore}
 */
export class AggregateStore {
  constructor() {
    /** @type {Map<string, unknown[]>} */
    this.items = new Map()
  }

  /**
   * @param {string} commitmentProof
   * @param {unknown} deal
   */
  put(commitmentProof, deal) {
    const dealEntries = this.items.get(commitmentProof)
    let newEntries
    if (dealEntries) {
      newEntries = [...dealEntries, deal]
      this.items.set(commitmentProof, newEntries)
    } else {
      newEntries = [deal]
      this.items.set(commitmentProof, newEntries)
    }

    return Promise.resolve()
  }

  /**
   * @param {string} commitmentProof
   */
  get(commitmentProof) {
    return Promise.resolve(this.items.get(commitmentProof))
  }
}