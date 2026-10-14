import type { ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** A link above the title back to the list this panel came from. */
  back?: { label: string; onClick: () => void };
  children: ReactNode;
}

/** Right-hand detail panel (a bottom sheet on phones). Stays mounted so it can slide in and out. */
export function Drawer({ open, title, subtitle, onClose, back, children }: Props) {
  return (
    <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="drawer-head">
        <div className="drawer-titles">
          {back && (
            <button className="drawer-back" onClick={back.onClick}>
              <Icon name="right" size={14} className="flip" /> {back.label}
            </button>
          )}
          <div className="drawer-title">{title}</div>
          {subtitle && <div className="drawer-sub">{subtitle}</div>}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel"><Icon name="x" size={16} /></button>
      </div>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
