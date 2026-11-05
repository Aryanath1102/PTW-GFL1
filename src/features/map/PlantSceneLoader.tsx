import {Component, lazy, Suspense, useEffect, useRef, useState} from 'react';
import type {ReactNode} from 'react';
import type {DrawingSceneProps} from './DrawingThreeScene';

class SceneBoundary extends Component<{children: ReactNode; onError: () => void}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Bound both module loading and the wait for the first rendered frame. */
export function PlantSceneLoader(props: DrawingSceneProps) {
  // A fresh lazy wrapper permits retry after an import failure.
  const [Scene] = useState(() => lazy(() => import('./DrawingThreeScene')));
  const [ready, setReady] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (ready) return;
    const timeout = window.setTimeout(() => latest.current.onError(), 20000);
    return () => window.clearTimeout(timeout);
  }, [ready]);
  return <SceneBoundary onError={props.onError}>
    <Suspense fallback={null}><Scene {...props} onReady={() => setReady(true)}/></Suspense>
    {!ready && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#071622] p-6 text-center">
      <p role="status" className="text-sm">Loading the 3D plant map…</p>
      <p className="max-w-sm text-xs text-slate-400">The 2D plan will open if 3D cannot start within 20 seconds.</p>
      <button className="rounded-lg border border-cyan-500 px-4 py-2 text-sm text-cyan-100" onClick={props.onError}>Open 2D plan now</button>
    </div>}
  </SceneBoundary>;
}
