import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { CameraFeed } from './CameraFeed';
import { Icon } from './Icon';
import { Modal } from './Modals';

export type FeedKind = 'thermal' | 'drone' | 'cctv' | 'night';
export type FeedMode = 'full' | 'mini';

/** Anything with video to show: a node camera, a drone, later CCTV or night vision. */
export interface Feed {
  key: string;
  kind: FeedKind;
  title: string;
  subtitle: string;
  videoUrl: string | null;
  detectionsUrl: string | null;
  snapshot: string | null;
  boxes: number[][] | null;
  label: string | null;
  alertId?: string;
}

const KIND_TEXT: Record<FeedKind, string> = { thermal: 'THERMAL', drone: 'DRONE', cctv: 'CCTV', night: 'NIGHT VISION' };
const POS_KEY = 'trinetra.miniPlayerPos';
const MARGIN = 10;

/** Sensor names from the zone file mapped to the kind of picture they give. */
export function feedKindFor(sensors: string[]): FeedKind {
  if (sensors.includes('thermal_camera')) return 'thermal';
  if (sensors.includes('night_vision_camera')) return 'night';
  return 'cctv';
}

interface Props {
  feed: Feed;
  mode: FeedMode;
  onMode: (m: FeedMode) => void;
  onClose: () => void;
  onOpenAlert?: (id: string) => void;
}

/**
 * Plays a feed full-screen or as a draggable mini player over the map. Closing the full-screen
 * view hands the feed to the mini player, like a video site; closing the mini player stops it.
 */
export function FeedPlayer({ feed, mode, onMode, onClose, onOpenAlert }: Props) {
  const video = (
    <div className="mp-video">
      <CameraFeed
        key={feed.key}
        large
        videoUrl={feed.videoUrl}
        detectionsUrl={feed.detectionsUrl}
        snapshot={feed.snapshot}
        boxes={feed.boxes}
        label={feed.label}
      />
      <span className="mp-live"><i /> {feed.videoUrl ? 'PLAYING' : 'LAST FRAME'}</span>
    </div>
  );

  if (mode === 'full') {
    return (
      <Modal
        width={1040}
        onClose={() => onMode('mini')}
        title={
          <>
            <span className={`mp-kind kind-${feed.kind}`}>{KIND_TEXT[feed.kind]}</span>
            <span>{feed.title}</span>
            <span className="mp-full-sub">{feed.subtitle}</span>
          </>
        }
      >
        <div className={`full-feed kind-${feed.kind}`}>{video}</div>
        <div className="full-feed-foot">Closing keeps it playing in the mini player.</div>
      </Modal>
    );
  }

  return (
    <MiniFrame feed={feed} onFull={() => onMode('full')} onClose={onClose} onOpenAlert={onOpenAlert}>
      {video}
    </MiniFrame>
  );
}

function readPos(): { x: number; y: number } | null {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    return p && typeof p.x === 'number' && typeof p.y === 'number' ? p : null;
  } catch {
    return null;
  }
}

function MiniFrame({ feed, onFull, onClose, onOpenAlert, children }: {
  feed: Feed; onFull: () => void; onClose: () => void; onOpenAlert?: (id: string) => void; children: React.ReactNode;
}) {
  const box = useRef<HTMLElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(readPos);
  const [dragging, setDragging] = useState(false);

  // Keep the player inside the map, e.g. after the window shrinks.
  const clamp = (x: number, y: number) => {
    const el = box.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return { x, y };
    return {
      x: Math.min(Math.max(MARGIN, x), Math.max(MARGIN, parent.clientWidth - el.offsetWidth - MARGIN)),
      y: Math.min(Math.max(MARGIN, y), Math.max(MARGIN, parent.clientHeight - el.offsetHeight - MARGIN)),
    };
  };

  useLayoutEffect(() => {
    if (pos) setPos((p) => (p ? clamp(p.x, p.y) : p));
    const onResize = () => setPos((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pos || dragging) return;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {
      /* position is a convenience; fine to lose */
    }
  }, [pos, dragging]);

  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button') || !box.current) return;
    e.preventDefault();
    const start = { px: e.clientX, py: e.clientY, x: box.current.offsetLeft, y: box.current.offsetTop };
    const head = e.currentTarget;
    head.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => setPos(clamp(start.x + ev.clientX - start.px, start.y + ev.clientY - start.py));
    const up = () => {
      setDragging(false);
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  };

  return (
    <section
      ref={box}
      className={`mini-player kind-${feed.kind} ${dragging ? 'dragging' : ''}`}
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      aria-label={`${KIND_TEXT[feed.kind]} feed: ${feed.title}`}
    >
      <div className="mp-head" onPointerDown={startDrag} title="Drag to move">
        <span className="mp-kind">{KIND_TEXT[feed.kind]}</span>
        <div className="mp-titles">
          <span className="mp-title">{feed.title}</span>
          <span className="mp-sub">{feed.subtitle}</span>
        </div>
        {feed.alertId && onOpenAlert && (
          <button className="mp-btn text" onClick={() => onOpenAlert(feed.alertId!)} title="Open the alert this feed belongs to">
            Open alert
          </button>
        )}
        <button className="mp-btn" onClick={onFull} aria-label="Full screen" title="Full screen">
          <Icon name="expand" size={14} />
        </button>
        <button className="mp-btn" onClick={onClose} aria-label="Close player" title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
      {children}
    </section>
  );
}
