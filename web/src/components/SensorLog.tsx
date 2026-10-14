import type { LogRow } from '../types';

function sourceClass(source: string, type: string) {
  if (source === 'ZONE CHECK') return 'fusion';
  if (source === 'OPERATOR') return type === 'drone' ? 'drone' : 'operator';
  return type;
}

export function SensorLog({ logs }: { logs: LogRow[] }) {
  return (
    <div className="c2-panel panel-sensor-log">
      <div className="panel-header log-header">
        <span className="panel-title">Sensor log</span>
        <div className="log-header-right">
          <span className="log-sort-tag">Newest first</span>
          <span className="log-streaming-tag"><span className="streaming-dot" /> Streaming</span>
        </div>
      </div>
      <div className="log-content-box">
        {[...logs].reverse().map((log, i) => (
          <div key={`${logs.length - i}-${log.time}`} className={`log-row ${log.type}`}>
            <span className="log-time">{log.time}</span>
            <span className={`log-source ${sourceClass(log.source, log.type)}`}>{log.source}</span>
            <span className="log-text">{log.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
