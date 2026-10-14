import { useEffect, useState } from 'react';
import { CameraFeed } from './CameraFeed';
import { Icon } from './Icon';

export type FeedKind = 'thermal' | 'drone' | 'cctv' | 'night';

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

/** Sensor names from the zone file mapped to the kind of picture they give. */
export function feedKindFor(sensors: string[]): FeedKind {
  if (sensors.includes('thermal_camera')) return 'thermal';
  if (sensors.includes('night_vision_camera')) return 'night';
  return 'cctv';
}

interface Props {
  feed: Feed;
  onClose: () => void;
  onOpenAlert?: (id: string) => void;
}

/** A small player docked over the map, like a video site's mini player. The map stays usable behind it. */
export function MiniPlayer({ feed, onClose, onOpenAlert }: Props) {
  const [big, setBig] = useState(false);

  useEffect(() => setBig(false), [feed.key]);

  return (
    <section className={`mini-player ${big ? 'big' : ''} kind-${feed.kind}`} aria-label={`${KIND_TEXT[feed.kind]} feed: ${feed.title}`}>
      <div className="mp-head">
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
        <button className="mp-btn" onClick={() => setBig((b) => !b)} aria-label={big ? 'Shrink player' : 'Enlarge player'} title={big ? 'Shrink' : 'Enlarge'}>
          <Icon name={big ? 'shrink' : 'expand'} size={14} />
        </button>
        <button className="mp-btn" onClick={onClose} aria-label="Close player" title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
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
    </section>
  );
}
