import { Component, type ReactNode } from 'react'

/**
 * The map is a visual complement (spec §9): if WebGL or the tile server fails, the list must keep
 * working, so a map crash falls back to the empty paper grid instead of taking the page down.
 */
export class MapErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Map failed', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
