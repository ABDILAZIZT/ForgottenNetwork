import { useEffect, useState } from 'react';
import { useWorldRepository } from '../repositories';
import type { EntityState } from '../engine/Entity';
import { download } from '../download';
import SavedMediaPreview from './SavedMediaPreview';

/** Archive controls keep the original entity payload (layers, frames, behavior and effects). */
export default function SavedEntities({
  onNotice,
  x,
  y,
}: {
  onNotice: (message: string) => void;
  x: number;
  y: number;
}) {
  const repository = useWorldRepository();
  const [entities, setEntities] = useState<EntityState[]>([]);
  const [selected, setSelected] = useState<EntityState | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<EntityState['type']>('wandering_creature');
  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      onNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void repository
      .loadAllEntities()
      .then(setEntities)
      .catch((e) => onNotice((e as Error).message));
  }, [repository]);
  return (
    <section>
      <h3>Saved media & creatures</h3>
      <p>
        Original animation frames, effects, layers and attribution remain in the saved-world
        archive. Server ownership checks apply to updates and deletion.
      </p>
      <label>
        New saved-world creature
        <select value={kind} onChange={(e) => setKind(e.target.value as EntityState['type'])}>
          {[
            'wandering_creature',
            'static_spirit',
            'glitch_creature',
            'floating_machine',
            'animated_sign',
          ].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
      </label>
      <button
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const entity: EntityState = {
              id: crypto.randomUUID(),
              type: kind,
              wx: x,
              wy: y,
              createdAt: Date.now(),
              color: '#a78bfa',
              scale: 1,
            };
            await repository.saveEntity(entity);
            await repository.flush();
            setEntities(await repository.loadAllEntities());
            setSelected(entity);
          })
        }
      >
        Create in saved-world archive
      </button>
      <select
        aria-label="Saved media"
        value={selected?.id || ''}
        onChange={(e) => setSelected(entities.find((a) => a.id === e.target.value) || null)}
      >
        <option value="">Choose saved media ({entities.length})</option>
        {entities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name || a.type} · {a.wx}, {a.wy}
          </option>
        ))}
      </select>
      {selected && (
        <div>
          <SavedMediaPreview value={selected} />
          <p>{selected.description || selected.text || selected.type}</p>
          {(['wx', 'wy', 'scale'] as const).map((key) => (
            <label key={key}>
              {key === 'wx' ? 'World X' : key === 'wy' ? 'World Y' : 'Scale'}
              <input
                type="number"
                value={selected[key] ?? 1}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    setSelected({
                      ...selected,
                      [key]: key === 'scale' ? Math.max(0.1, Math.min(5, n)) : n,
                    });
                }}
              />
            </label>
          ))}
          <button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await repository.saveEntity(selected);
                await repository.flush();
                setEntities(await repository.loadAllEntities());
                onNotice('Saved media updated.');
              })
            }
          >
            Save media position / size
          </button>
          <button
            disabled={busy}
            onClick={() => {
              if (
                confirm(
                  'Delete this selected saved-world media item? Export the archive first for a local backup.',
                )
              )
                void run(async () => {
                  await repository.deleteEntity(selected.id);
                  await repository.flush();
                  setSelected(null);
                  setEntities(await repository.loadAllEntities());
                });
            }}
          >
            Delete selected media
          </button>
          <button
            onClick={() =>
              download(
                new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }),
                'saved-media.json',
              )
            }
          >
            Export media record
          </button>
        </div>
      )}
    </section>
  );
}
