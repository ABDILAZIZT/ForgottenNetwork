import { useEffect, useRef, useState } from 'react';
import type { EntityState } from '../engine/Entity';
import type { SessionUser } from '../auth';
import { useWorldRepository } from '../repositories';
import { locationUrl } from '../location';
import AdSlot from './AdSlot';
import { readTier } from '../economy';

const worldId = '00000000-0000-4000-8000-000000000001';
type Report = {
  id: string;
  entity_id: string | null;
  chunk_x: number;
  chunk_y: number;
  world_id: string;
  reason: string;
};
type Audit = { id: string; action: string; reason: string; created_at: string };
async function request<T>(path: string, body?: unknown): Promise<T> {
  const token = import.meta.env.DEV ? import.meta.env.VITE_DEV_AUTH_TOKEN : '';
  const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || '/api/v1'}${path}`, {
    method: body ? 'POST' : 'GET',
    credentials: 'include',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message || 'Request failed');
  return value;
}

export default function CommunityPanel({
  user,
  canPublish,
  x,
  y,
  onClose,
  onVisit,
}: {
  user: SessionUser | null;
  canPublish: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onVisit: (x: number, y: number) => void;
}) {
  const repository = useWorldRepository();
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, []);
  const [entities, setEntities] = useState<EntityState[]>([]);
  const [selected, setSelected] = useState<EntityState | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState('');
  const [reports, setReports] = useState<Report[]>([]);
  const [audit, setAudit] = useState<Audit[]>([]);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState('');
  const [restoreId, setRestoreId] = useState('');
  const [versions, setVersions] = useState<Array<{ version: number; captured_at: string }>>([]);
  const [historyX, setHistoryX] = useState(Math.floor(x / 128));
  const [historyY, setHistoryY] = useState(Math.floor(y / 128));
  const [serverControls, setServerControls] = useState(false);
  const isModerator = !!user && ['moderator', 'administrator'].includes(user.role);
  async function refresh() {
    const items = await repository.loadAllEntities();
    setEntities(items);
    if (selected) setSelected(items.find((item) => item.id === selected.id) || null);
    const sharedId = new URLSearchParams(window.location.search).get('entity');
    if (!selected && sharedId) {
      const match = items.find((item) => item.id === sharedId);
      if (match) {
        setSelected(match);
        setName(match.name || '');
        setDescription(match.description || '');
      }
    }
    if (isModerator && repository.mode === 'remote') {
      setReports((await request<{ reports: Report[] }>('/moderation/reports')).reports);
      setAudit((await request<{ events: Audit[] }>('/moderation/audit')).events);
    }
  }
  useEffect(() => {
    void refresh().catch((e) => setStatus(e.message));
    if (repository.mode === 'remote')
      void request<{ moderation?: boolean }>('/auth/config')
        .then((c) => setServerControls(!!c.moderation))
        .catch(() => undefined);
  }, []);
  const perform = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setStatus('');
    try {
      await fn();
      setStatus(success);
      await refresh();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };
  const moderation = (action: string, target: object) =>
    perform(
      () =>
        request('/moderation/actions', {
          operationId: crypto.randomUUID(),
          action,
          reason,
          worldId,
          ...target,
        }),
      'Action recorded. Refresh the world to see the change.',
    );
  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      className="fn-community fn-panel"
      role="dialog"
      aria-label="Community and contributions"
    >
      <div className="fn-community-heading">
        <h2>World & community</h2>
        <button onClick={onClose} aria-label="Close community panel">
          Close
        </button>
      </div>
      <p>Explore contributions, manage your media, or report something that needs attention.</p>
      <p className="fn-community-rules">
        Keep the world welcoming. No harassment, threats, private information, illegal material, or
        spam. Only upload media you have permission to share.
      </p>
      <div role="status" className="fn-community-status">
        {status}
      </div>
      <label>
        Contributions
        <select
          aria-label="Contributions"
          value={selected?.id || ''}
          onChange={(e) => {
            const entity = entities.find((item) => item.id === e.target.value) || null;
            setSelected(entity);
            setName(entity?.name || '');
            setDescription(entity?.description || '');
          }}
        >
          <option value="">Select a contribution</option>
          {entities.map((entity) => (
            <option key={entity.id} value={entity.id}>
              {entity.name || entity.type} — {entity.creatorName || 'Local creator'}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <div>
          <p>
            By {selected.creatorName || 'Local creator'} ·{' '}
            {new Date(selected.createdAt).toLocaleDateString()} · {Math.round(selected.wx)},{' '}
            {Math.round(selected.wy)}
          </p>
          <button onClick={() => onVisit(selected.wx, selected.wy)}>Visit</button>{' '}
          <button
            onClick={() =>
              void perform(
                () =>
                  navigator.clipboard.writeText(
                    locationUrl(
                      window.location.origin,
                      window.location.pathname,
                      selected.wx,
                      selected.wy,
                      1.5,
                      selected.id,
                    ),
                  ),
                'Contribution link copied',
              )
            }
          >
            Copy link
          </button>
          <p>{selected.description}</p>
          {canPublish && (repository.mode === 'local' || selected.creatorId === user?.id) && (
            <fieldset disabled={busy}>
              <legend>Your contribution</legend>
              <label>
                Name
                <input maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label>
                Description
                <textarea
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <button
                onClick={() =>
                  void perform(
                    () => repository.saveEntity({ ...selected, name, description }),
                    'Contribution updated',
                  )
                }
              >
                Save details
              </button>{' '}
              <button
                onClick={() => {
                  if (window.confirm('Remove your contribution from the world?'))
                    void perform(
                      () => repository.deleteEntity(selected.id),
                      'Contribution removed. Refresh the world.',
                    );
                }}
              >
                Remove my contribution
              </button>
            </fieldset>
          )}
        </div>
      )}
      {serverControls && (
        <fieldset disabled={busy}>
          <legend>Reports & safety</legend>
          <label>
            Reason
            <textarea
              value={reason}
              minLength={5}
              maxLength={1000}
              placeholder="Describe the concern (at least 5 characters)"
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={reason.trim().length < 5}
            onClick={() =>
              void perform(
                () =>
                  request(`/worlds/${worldId}/reports`, {
                    ...(selected
                      ? { entityId: selected.id }
                      : { chunkX: Math.floor(x / 128), chunkY: Math.floor(y / 128) }),
                    reason,
                  }),
                'Report submitted. Thank you.',
              )
            }
          >
            {selected ? 'Report selected contribution' : 'Report this location'}
          </button>
        </fieldset>
      )}
      {serverControls && isModerator && (
        <fieldset disabled={busy}>
          <legend>Moderation</legend>
          <p>Every action requires the reason above and is recorded in the audit log.</p>
          {selected && (
            <>
              <button onClick={() => void moderation('hide_entity', { entityId: selected.id })}>
                Hide selected
              </button>{' '}
            </>
          )}
          <label>
            Contribution ID to restore
            <input value={restoreId} onChange={(e) => setRestoreId(e.target.value)} />
          </label>
          <button onClick={() => void moderation('restore_entity', { entityId: restoreId })}>
            Restore contribution
          </button>
          <details>
            <summary>Publishing suspension</summary>
            <label>
              Account ID
              <input value={account} onChange={(e) => setAccount(e.target.value)} />
            </label>
            <button onClick={() => void moderation('suspend', { userId: account })}>
              Suspend for 30 days
            </button>{' '}
            <button onClick={() => void moderation('reinstate', { userId: account })}>
              Reinstate
            </button>
          </details>
          <h3>Open reports</h3>
          {reports.length === 0 ? (
            <p>No open reports.</p>
          ) : (
            reports.map((report) => (
              <article key={report.id}>
                <p>{report.reason}</p>
                <small>{report.entity_id || `Chunk ${report.chunk_x}, ${report.chunk_y}`}</small>
                <br />
                {report.entity_id && (
                  <button
                    onClick={() =>
                      void moderation('hide_entity', {
                        entityId: report.entity_id,
                        worldId: report.world_id,
                      })
                    }
                  >
                    Hide
                  </button>
                )}{' '}
                <button onClick={() => void moderation('resolve_report', { reportId: report.id })}>
                  Resolve
                </button>{' '}
                <button onClick={() => void moderation('dismiss_report', { reportId: report.id })}>
                  Dismiss
                </button>
              </article>
            ))
          )}
          <h3>Restore chunk history</h3>
          <label>
            Chunk X
            <input
              type="number"
              value={historyX}
              onChange={(e) => setHistoryX(Number(e.target.value))}
            />
          </label>
          <label>
            Chunk Y
            <input
              type="number"
              value={historyY}
              onChange={(e) => setHistoryY(Number(e.target.value))}
            />
          </label>
          <button
            onClick={() =>
              void perform(
                async () =>
                  setVersions(
                    (
                      await request<{ versions: Array<{ version: number; captured_at: string }> }>(
                        `/moderation/history/${worldId}/${historyX}/${historyY}`,
                      )
                    ).versions,
                  ),
                'History loaded',
              )
            }
          >
            Load history
          </button>
          {versions.map((v) => (
            <p key={v.version}>
              Version {v.version} · {new Date(v.captured_at).toLocaleString()}{' '}
              <button
                onClick={() =>
                  void moderation('restore_chunk', {
                    chunkX: historyX,
                    chunkY: historyY,
                    version: Number(v.version),
                  })
                }
              >
                Restore
              </button>
            </p>
          ))}
          <details>
            <summary>Recent audit events</summary>
            {audit.map((event) => (
              <p key={event.id}>
                {event.action}: {event.reason}
              </p>
            ))}
          </details>
        </fieldset>
      )}
      {readTier() !== 'vip' && <AdSlot slotId="classic-community" position="community-footer" />}
    </section>
  );
}
