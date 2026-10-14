import { useEffect, useRef, useState } from 'react';
import type { CameraState } from '../types';

interface Detections {
  fps: number;
  label?: string;
  frames: number[][][];
}

interface Props {
  videoUrl: string | null;
  detectionsUrl: string | null;
  snapshot: string | null;
  boxes: number[][] | null;
  label: string | null;
  cameraState?: CameraState;
  large?: boolean;
  onClick?: () => void;
}

const STATE_TEXT: Record<CameraState, string> = {
  standby: 'STANDBY', waking: 'WAKING', recording: 'RECORDING', offline: 'OFFLINE',
};

/**
 * Plays the prerecorded clip for an alert on loop. Until the clip file exists it shows a
 * placeholder (with the snapshot behind it, if there is one) so the layout is final.
 */
export function CameraFeed({ videoUrl, detectionsUrl, snapshot, boxes, label, cameraState, large, onClick }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [dets, setDets] = useState<Detections | null>(null);
  const [frameBoxes, setFrameBoxes] = useState<number[][] | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    setVideoFailed(false);
    setFrameBoxes(null);
    setDets(null);
    if (!detectionsUrl) return;
    let live = true;
    fetch(detectionsUrl).then((r) => r.json()).then((d: Detections) => live && setDets(d)).catch(() => {});
    return () => {
      live = false;
    };
  }, [videoUrl, detectionsUrl]);

  useEffect(() => {
    if (!dets || !video.current) return;
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        const i = Math.floor(v.currentTime * dets.fps) % Math.max(1, dets.frames.length);
        setFrameBoxes(dets.frames[i] ?? []);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [dets]);

  const hasVideo = !!videoUrl && !videoFailed;
  const shownBoxes = frameBoxes ?? boxes ?? [];

  return (
    <div className={`cam-viewport-box ${large ? 'large' : ''}`} onClick={onClick}>
      {hasVideo ? (
        <video
          ref={video}
          key={videoUrl}
          className="cam-live-img"
          src={videoUrl!}
          autoPlay
          loop
          muted
          playsInline
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <div className="clip-placeholder">
          {snapshot && <img src={snapshot} alt="Last recorded frame" className="cam-live-img dimmed" />}
          <div className="clip-placeholder-text">
            <span className="clip-icon">▶</span>
            <span>Recorded clip · pending</span>
            <span className="clip-sub">{snapshot ? 'showing last frame' : 'no frame for this alert yet'}</span>
          </div>
        </div>
      )}
      <div className="cam-boxes-overlay">
        {shownBoxes.map(([x1, y1, x2, y2], i) => (
          <div
            key={i}
            className="cam-bbox"
            style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
          >
            <div className="cam-bbox-label">{label ?? 'Target'}</div>
          </div>
        ))}
      </div>
      <div className="cam-corner-tags">
        <span className="cam-tag-sim">{hasVideo ? 'PRERECORDED · LOOP' : 'PLACEHOLDER'}</span>
        {cameraState && <span className={`cam-state-chip ${cameraState}`}>{STATE_TEXT[cameraState]}</span>}
      </div>
    </div>
  );
}
