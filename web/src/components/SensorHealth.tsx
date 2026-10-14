import type { NodeStatus } from '../types';
import { secondsAgo } from '../lib/format';

interface Props {
  nodes: Record<string, NodeStatus>;
  serverNow: number;
}

const CAM_LABEL: Record<string, string> = { standby: 'Standby', waking: 'Waking', recording: 'Rec', offline: '—' };

export function SensorHealth({ nodes, serverNow }: Props) {
  const ids = Object.keys(nodes).sort();
  const online = ids.filter((id) => nodes[id].status !== 'offline').length;

  return (
    <div className="c2-panel panel-sensor-health">
      <div className="panel-header">
        <span className="panel-title">Sensor health</span>
        <span className="panel-subtitle">{online} / {ids.length} online</span>
      </div>
      <table className="health-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Battery</th>
            <th>Signal</th>
            <th>Camera</th>
            <th style={{ textAlign: 'right' }}>Seen</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const n = nodes[id];
            return (
              <tr key={id} title={n.name}>
                <td>{id}</td>
                <td style={n.battery < 30 ? { color: 'var(--amber)' } : undefined}>{n.battery}%</td>
                <td>{n.signal_dbm} dBm</td>
                <td><span className={`cam-state-chip ${n.camera_state}`}>{CAM_LABEL[n.camera_state]}</span></td>
                <td style={{ textAlign: 'right' }}>
                  {n.status === 'offline' ? <span className="badge-offline">OFFLINE</span> : secondsAgo(n.last_seen, serverNow)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
