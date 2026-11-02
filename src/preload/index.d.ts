import type { ProTraceApi } from '../shared/types'

declare global {
  interface Window {
    protrace: ProTraceApi
  }
}

export {}
