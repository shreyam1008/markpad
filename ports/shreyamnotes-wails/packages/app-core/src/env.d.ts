/// <reference types="vite/client" />
import type { ZenBridge } from '@zennotes/bridge-contract/bridge'
import type * as React from 'react'

declare global {
  interface Window {
    zen: ZenBridge
  }

  namespace JSX {
    type Element = React.JSX.Element
  }
}

export {}
