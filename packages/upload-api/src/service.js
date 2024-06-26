import { blobAllocateProvider } from './blob/allocate.js'
import { blobAcceptProvider } from './blob/accept.js'
import * as API from './types.js'

/**
 * @param {API.BlobServiceContext} context
 */
export function createService(context) {
  return {
    blob: {
      allocate: blobAllocateProvider(context),
      accept: blobAcceptProvider(context),
    },
  }
}
