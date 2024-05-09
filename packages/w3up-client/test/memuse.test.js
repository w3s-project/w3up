import * as Test from './test.js'
import * as Result from '../src/result.js'
import { randomCAR } from './helpers/random.js'

/**
 * @type {Test.Suite}
 */
export const testMem = {
  'test usage': async (
    assert,
    { client, mail, connect, grantAccess, plansStorage }
  ) => {
    const space = await client.createSpace('test')

    const email = 'alice@web.mail'
    const login = client.login(email)
    const message = await mail.take()
    assert.deepEqual(message.to, email)
    await grantAccess(message)
    const account = await login

    Result.try(await account.provision(space.did()))
    await space.save()

    const car = await randomCAR(50_000_000)
    const before = process.memoryUsage()
    console.log(before)

    // @ts-expect-error
    const link = await client.uploadCAR(car, { pieceHasher: null })

    const after = process.memoryUsage()

    console.log({
      rss: after.rss - before.rss,
      heapTotal: after.heapTotal - before.heapTotal,
      heapUsed: after.heapUsed - before.heapUsed,
      external: after.external - before.external,
      arrayBuffers: after.arrayBuffers - before.arrayBuffers,
    })
  },
}

Test.test({ MemoryUse: testMem })
