import type { PipelineStage } from '../types';

const LABEL: Record<PipelineStage['stage'], string> = {
  radar: 'Radar trigger',
  camera: 'Camera wake',
  detection: 'YOLO detect',
  zone_check: 'Unusual for zone?',
  outcome: 'Outcome',
};

const ICON: Record<PipelineStage['status'], string> = {
  done: '✓', pending: '…', skipped: '–', yes: 'YES', no: 'NO',
};

interface Props {
  stages: PipelineStage[];
  compact?: boolean;
  title?: string;
}

export function PipelineStrip({ stages, compact, title }: Props) {
  if (!stages.length) return null;
  return (
    <div className={`pipeline-strip ${compact ? 'compact' : ''}`}>
      {title && <div className="pipeline-title">{title}</div>}
      <div className="pipeline-steps">
        {stages.map((s, i) => (
          <div key={s.stage} className={`pipeline-step ${s.status} ${s.stage}`} title={s.detail}>
            <span className="pipeline-icon">{ICON[s.status]}</span>
            <span className="pipeline-label">{LABEL[s.stage]}</span>
            {compact
              ? i < stages.length - 1 && <span className="pipeline-arrow">→</span>
              : <span className="pipeline-detail">{s.detail}</span>}
          </div>
        ))}
      </div>
      {compact && <div className="pipeline-detail-line">{stages.map((s) => s.detail).filter(Boolean).slice(-2).join(' · ')}</div>}
    </div>
  );
}
