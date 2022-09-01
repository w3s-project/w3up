import { mf, serviceAuthority, test } from './helpers/setup.js'
import * as UCAN from '@ipld/dag-ucan'
import { SigningAuthority } from '@ucanto/authority'

test.before((t) => {
  t.context = { mf }
})

test('should fail with no header', async (t) => {
  const { mf } = t.context
  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
  })
  const rsp = await res.json()
  t.deepEqual(rsp, {
    error: {
      code: 'HTTP_ERROR',
      message: 'The required "Authorization: Bearer" header is missing.',
    },
  })
  t.is(res.status, 400)
})

test('should fail with bad ucan', async (t) => {
  const { mf } = t.context

  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ss`,
    },
  })
  t.is(res.status, 401)
  const rsp = await res.json()
  t.deepEqual(rsp, {
    error: {
      code: 'HTTP_ERROR',
      message: 'Malformed UCAN headers data.',
      cause:
        "ParseError: Can't parse UCAN: ss: Expected JWT format: 3 dot-separated base64url-encoded values.",
    },
  })
})

test('should fail with 0 caps', async (t) => {
  const { mf } = t.context

  const kp = await SigningAuthority.generate()

  const ucan = await UCAN.issue({
    issuer: kp,
    audience: serviceAuthority,
    capabilities: [],
  })
  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UCAN.format(ucan)}`,
    },
  })
  const rsp = await res.json()
  t.deepEqual(rsp, [
    {
      name: 'InvocationCapabilityError',
      error: true,
      message: 'Invocation is required to have a single capability.',
      capabilities: [],
    },
  ])
})

test('should fail with bad service audience', async (t) => {
  const { mf } = t.context

  const kp = await SigningAuthority.generate()
  const audience = await SigningAuthority.generate()
  const ucan = await UCAN.issue({
    issuer: kp,
    audience,
    capabilities: [],
  })
  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UCAN.format(ucan)}`,
    },
  })
  const rsp = await res.json()
  t.deepEqual(rsp, [
    {
      name: 'InvalidAudience',
      error: true,
      audience: serviceAuthority.did(),
      delegation: {
        audience: audience.did(),
      },
      message: `Delegates to '${audience.did()}' instead of '${serviceAuthority.did()}'`,
    },
  ])
})

test('should fail with with more than 1 cap', async (t) => {
  const { mf } = t.context

  const kp = await SigningAuthority.generate()
  const ucan = await UCAN.issue({
    issuer: kp,
    audience: serviceAuthority,
    capabilities: [
      { can: 'identity/validate', with: 'mailto:admin@dag.house' },
      { can: 'identity/register', with: 'mailto:admin@dag.house' },
    ],
  })
  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UCAN.format(ucan)}`,
    },
  })
  const rsp = await res.json()
  t.deepEqual(rsp, [
    {
      name: 'InvocationCapabilityError',
      error: true,
      message: 'Invocation is required to have a single capability.',
      capabilities: [
        { can: 'identity/validate', with: 'mailto:admin@dag.house' },
        { can: 'identity/register', with: 'mailto:admin@dag.house' },
      ],
    },
  ])
})

test('should route to handler', async (t) => {
  const { mf } = t.context

  const kp = await SigningAuthority.generate()
  const ucan = await UCAN.issue({
    issuer: kp,
    audience: serviceAuthority,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
  })
  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UCAN.format(ucan)}`,
    },
  })
  const rsp = await res.json()
  t.deepEqual(rsp, ['test pass'])
})

test('should handle exception in route handler', async (t) => {
  const { mf } = t.context

  const kp = await SigningAuthority.generate()
  const ucan = await UCAN.issue({
    issuer: kp,
    audience: serviceAuthority,
    capabilities: [{ can: 'testing/fail', with: 'mailto:admin@dag.house' }],
  })
  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UCAN.format(ucan)}`,
    },
  })
  const rsp = await res.json()
  t.deepEqual(
    rsp[0].message,
    'service handler {can: "testing/fail"} error: test fail'
  )
})

test('should fail with missing proofs', async (t) => {
  const { mf } = t.context

  const alice = await SigningAuthority.generate()
  const bob = await SigningAuthority.generate()
  const proof1 = await UCAN.issue({
    issuer: alice,
    audience: bob,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
  })

  const proof2 = await UCAN.issue({
    issuer: alice,
    audience: bob,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
  })
  const cid1 = await UCAN.link(proof1)
  const cid2 = await UCAN.link(proof2)
  const ucan = await UCAN.issue({
    issuer: bob,
    audience: serviceAuthority,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
    proofs: [cid1, cid2],
  })

  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UCAN.format(ucan)}`,
    },
  })
  const rsp = await res.json()
  t.deepEqual(rsp, {
    error: {
      code: 'HTTP_ERROR',
      message: 'Missing Proofs',
      cause: {
        prf: [cid1.toString(), cid2.toString()],
      },
    },
  })
})

test('should multiple invocation should pass', async (t) => {
  const { mf } = t.context

  const alice = await SigningAuthority.generate()
  const bob = await SigningAuthority.generate()
  const proof1 = await UCAN.issue({
    issuer: alice,
    audience: bob,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
  })

  const cid1 = await UCAN.link(proof1)
  const ucan1 = await UCAN.issue({
    issuer: bob,
    audience: serviceAuthority,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
    proofs: [cid1],
  })

  const ucan2 = await UCAN.issue({
    issuer: bob,
    audience: serviceAuthority,
    capabilities: [{ can: 'testing/pass', with: 'mailto:admin@dag.house' }],
    proofs: [cid1],
  })

  const headers = new Headers()
  headers.append('Authorization', `Bearer ${UCAN.format(ucan1)}`)
  headers.append('Authorization', `Bearer ${UCAN.format(ucan2)}`)
  headers.append('ucan', `${cid1.toString()} ${UCAN.format(proof1)}`)

  const res = await mf.dispatchFetch('http://localhost:8787/raw', {
    method: 'POST',
    headers,
  })

  const rsp = await res.json()
  t.deepEqual(rsp, ['test pass', 'test pass'])
})
