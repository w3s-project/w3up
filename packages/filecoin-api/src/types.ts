import type {
  HandlerExecutionError,
  Signer,
  InboundCodec,
  CapabilityParser,
  ParsedCapability,
  InferInvokedCapability,
  Match,
} from '@ucanto/interface'
import type { ProviderInput } from '@ucanto/server'
import { PieceLink } from '@web3-storage/data-segment'
import { UnknownLink } from '@ucanto/interface'
import { DealConfig } from '@web3-storage/filecoin-client/types'

export * as UcantoInterface from '@ucanto/interface'
export * from '@web3-storage/filecoin-client/types'
export * from '@web3-storage/capabilities/types'

// Resources
export interface Queue<Record> {
  add: (record: Record, options?: any) => Promise<Result<{}, QueueAddError>>
}

export interface Store<Record> {
  put: (record: Record) => Promise<Result<{}, StorePutError>>
  /**
   * Gets content data from the store.
   */
  get(key: any): Promise<Result<Record, StoreGetError>>
}

// Services
export interface StorefrontServiceContext {
  id: Signer
  addQueue: Queue<StorefrontRecord>
  pieceStore: Store<StorefrontRecord>
}

export interface AggregatorServiceContext {
  id: Signer
  addQueue: Queue<AggregatorRecord>
  pieceStore: Store<AggregatorRecord>
}

export interface BrokerServiceContext {
  id: Signer
  addQueue: Queue<BrokerRecord>
  offerStore: Store<BrokerRecord>
}

// Service Types

export interface StorefrontRecord {
  piece: PieceLink
  content: UnknownLink
}

export interface AggregatorRecord {
  piece: PieceLink
  storefront: string
  group: string
}

export interface BrokerRecord {
  piece: PieceLink
  offer: PieceLink[]
  deal: DealConfig
}

// Errors

export type QueueAddError = QueueOperationError
export type StorePutError = StoreOperationError
export type StoreGetError = StoreOperationError

export interface QueueOperationError extends Error {
  name: 'QueueOperationFailed'
}

export interface StoreOperationError extends Error {
  name: 'StoreOperationFailed'
}

// Service utils

export interface UcantoServerContext {
  id: Signer
  codec?: InboundCodec
  errorReporter: ErrorReporter
}

export interface ErrorReporter {
  catch: (error: HandlerExecutionError) => void
}

export type Result<T = unknown, X extends {} = {}> = Variant<{
  ok: T
  error: X
}>

/**
 * Utility type for defining a [keyed union] type as in IPLD Schema. In practice
 * this just works around typescript limitation that requires discriminant field
 * on all variants.
 *
 * ```ts
 * type Result<T, X> =
 *   | { ok: T }
 *   | { error: X }
 *
 * const demo = (result: Result<string, Error>) => {
 *   if (result.ok) {
 *   //  ^^^^^^^^^ Property 'ok' does not exist on type '{ error: Error; }`
 *   }
 * }
 * ```
 *
 * Using `Variant` type we can define same union type that works as expected:
 *
 * ```ts
 * type Result<T, X> = Variant<{
 *   ok: T
 *   error: X
 * }>
 *
 * const demo = (result: Result<string, Error>) => {
 *   if (result.ok) {
 *     result.ok.toUpperCase()
 *   }
 * }
 * ```
 *
 * [keyed union]:https://ipld.io/docs/schemas/features/representation-strategies/#union-keyed-representation
 */
export type Variant<U extends Record<string, unknown>> = {
  [Key in keyof U]: { [K in Exclude<keyof U, Key>]?: never } & {
    [K in Key]: U[Key]
  }
}[keyof U]

// test

export interface UcantoServerContextTest extends UcantoServerContext {
  queuedMessages: unknown[]
}

export type Test<S> = (
  assert: Assert,
  context: UcantoServerContextTest & S
) => unknown
export type Tests<S> = Record<string, Test<S>>

export type Input<C extends CapabilityParser<Match<ParsedCapability>>> =
  ProviderInput<InferInvokedCapability<C> & ParsedCapability>

export interface Assert {
  equal: <Actual, Expected extends Actual>(
    actual: Actual,
    expected: Expected,
    message?: string
  ) => unknown
  deepEqual: <Actual, Expected extends Actual>(
    actual: Actual,
    expected: Expected,
    message?: string
  ) => unknown
  ok: <Actual>(actual: Actual, message?: string) => unknown
}
