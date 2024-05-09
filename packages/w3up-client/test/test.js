import { StoreMemory } from '@web3-storage/access/stores/store-memory'
import * as Context from '@web3-storage/upload-api/test/context'
import * as Client from '@web3-storage/w3up-client'
import * as assert from 'assert'
import * as http from 'http'

/**
 * @template [Context=void]
 * @typedef {(assert: Assert, context: Context) => unknown} Unit
 */
/**
 * @template [Context=undefined]
 * @typedef {object} Setup
 * @property {() => Context|PromiseLike<Context>} [before]
 * @property {() => PromiseLike<unknown>|unknown} [after]
 */

/**
 * @template [Context=undefined]
 * @typedef {{[name:string]: Unit<Context>|Suite<Context>}} Suite
 */

/**
 * @template Context
 * @param {object} descriptor
 * @param {(assert: Assert) => PromiseLike<Context>} descriptor.before
 * @param {(context: Context) => unknown} descriptor.after
 * @returns {(suite: Suite<Context>) => Suite}
 */

export const group =
  ({ before, after }) =>
  (suite) => {
    return Object.fromEntries(
      Object.entries(suite).map(([key, test]) => [
        key,
        typeof test === 'function'
          ? async (assert) => {
              const context = await before(assert)
              try {
                await test(assert, context)
              } finally {
                await after(context)
              }
            }
          : group({ before, after })(test),
      ])
    )
  }

/**
 * @typedef {Omit<typeof assert, 'ok'> & {ok(value:unknown, message?:string):void}} Assert
 */

/**
 * @param {Suite<void>|Record<string, Suite>} suite
 */
export const test = (suite) => {
  for (const [name, member] of Object.entries(suite)) {
    if (typeof member === 'function') {
      const define = name.startsWith('only ')
        ? it.only
        : name.startsWith('skip ')
        ? it.skip
        : it

      define(name, () => member(assert))
    } else {
      describe(name, () => test(member))
    }
  }
}

export const setup = async () => {
  const context = await Context.createContext({
    http,
    assert,
  })

  const connect = () =>
    Client.create({
      store: new StoreMemory(),
      serviceConf: {
        access: context.connection,
        upload: context.connection,
        filecoin: context.connection,
      },
    })

  return {
    ...context,
    connect,
    client: await connect(),
    cleanup: () => Context.cleanupContext(context),
  }
}

export const withContext = group({
  before: setup,
  after: (context) => Context.cleanupContext(context),
})
