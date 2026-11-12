import { useCallback, useEffect, useMemo, useState } from 'react';
import { list as copy, common } from '../copy/strings';
import { listEntries, type ListEntry, type UserList } from '../lib/storage/db';
import { MY_LIST_ID, entriesIn, findEntry, leetcodeUrl, loadLeetCodeLists, parseImport, type CatalogProblem, type LeetCodeLists, type NewItem } from '../lib/lists/lists';
import { addToList, createList, deleteList, loadUserLists, removeFromList, renameList } from '../lib/lists/store';
import { bankForSlug } from '../lib/problems/bank';
import { Button } from '../ui/Button';
import { TextArea, TextField } from '../ui/Field';
import { ExternalLink } from '../ui/ExternalLink';
import { navigate } from '../state/router';

/** Weak problems resurface first, then ones not practiced, then the rest. */
export function sortForPractice(entries: ListEntry[]): ListEntry[] {
  const rank = (e: ListEntry) => (e.lastScore !== undefined && e.lastScore < 2.5 ? 0 : e.sessions.length === 0 ? 1 : 2);
  return [...entries].sort((a, b) => rank(a) - rank(b) || (a.lastScore ?? 5) - (b.lastScore ?? 5) || a.addedAt - b.addedAt);
}

export function isWeak(e: ListEntry): boolean {
  return e.lastScore !== undefined && e.lastScore < 2.5;
}

/** One row: a problem in the list being viewed, with its progress if it has any. */
interface Row {
  /** The slug for LeetCode problems, the entry id otherwise. */
  key: string;
  item: NewItem;
  number?: number;
  difficulty?: string;
  pattern?: string;
  entry?: ListEntry;
  builtIn: boolean;
}

type Status = 'any' | 'new' | 'practiced' | 'weak';

const selectClass = 'min-h-11 rounded-control border border-smudge-mark bg-paper px-3 text-sm text-ink';

/** Where to practice a row: the setup screen, with the list and problem chosen. */
export function practiceHref(listId: string, key: string): string {
  return `/?from=${encodeURIComponent(listId)}&problem=${encodeURIComponent(key)}`;
}

export default function ListScreen() {
  const [catalog, setCatalog] = useState<LeetCodeLists | null>(null);
  const [mine, setMine] = useState<UserList[] | null>(null);
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [current, setCurrent] = useState<string>(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('list') ?? MY_LIST_ID);
  const [difficulty, setDifficulty] = useState('any');
  const [pattern, setPattern] = useState('any');
  const [status, setStatus] = useState<Status>('any');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [lists, all] = await Promise.all([loadUserLists(), listEntries()]);
    setMine(lists);
    setEntries(all);
  }, []);
  useEffect(() => {
    void Promise.all([loadUserLists(), listEntries()]).then(([lists, all]) => {
      setMine(lists);
      setEntries(all);
    });
    void loadLeetCodeLists().then(setCatalog);
  }, []);

  const bundled = catalog?.lists.find((l) => l.id === current);
  const userList = mine?.find((l) => l.id === current);

  const rows: Row[] = useMemo(() => {
    if (bundled && catalog) {
      return bundled.slugs.map((slug) => {
        const p: CatalogProblem = catalog.problems[slug];
        const item = { slug, title: p.title };
        return { key: slug, item, number: p.number, difficulty: p.difficulty, pattern: p.pattern, entry: findEntry(entries, item), builtIn: !!bankForSlug(slug) };
      });
    }
    return sortForPractice(entriesIn(entries, current)).map((e) => {
      const p = e.slug ? catalog?.problems[e.slug] : undefined;
      return {
        key: e.slug ?? e.id,
        item: { slug: e.slug, title: e.title, link: e.link },
        number: p?.number,
        difficulty: p?.difficulty,
        pattern: p?.pattern,
        entry: e,
        builtIn: !!(e.slug && bankForSlug(e.slug)),
      };
    });
  }, [bundled, catalog, entries, current]);

  const patterns = useMemo(() => [...new Set(rows.map((r) => r.pattern).filter(Boolean) as string[])].sort(), [rows]);
  const shown = rows.filter((r) => {
    if (difficulty !== 'any' && r.difficulty !== difficulty) return false;
    if (pattern !== 'any' && r.pattern !== pattern) return false;
    const e = r.entry;
    if (status === 'new' && e?.sessions.length) return false;
    if (status === 'practiced' && !e?.sessions.length) return false;
    if (status === 'weak' && !(e && isWeak(e))) return false;
    return true;
  });

  function choose(id: string) {
    setCurrent(id);
    setSelected(new Set());
    setPattern('any');
    setMessage(null);
    history.replaceState(null, '', `#/list?list=${encodeURIComponent(id)}`);
  }

  if (!mine) return <p className="py-8 text-sm text-ink-soft">{common.loading}</p>;
  const total = rows.length;
  const allShownSelected = shown.length > 0 && shown.every((r) => selected.has(r.key));

  return (
    <div className="flex max-w-[960px] flex-col gap-6 pt-6">
      <div>
        <h1 className="text-lg font-bold">{copy.title}</h1>
        <p className="mt-1 text-sm text-ink-soft">{copy.intro}</p>
      </div>

      <ListBar lists={mine} catalog={catalog} current={current} onChoose={choose} onChanged={reload} />

      {bundled && <p className="text-sm text-ink-soft">{copy.bundledAbout(bundled.about, bundled.slugs.length)}</p>}
      {userList && (
        <AddProblems
          catalog={catalog}
          onAdd={async (items, skipped) => {
            const r = await addToList(userList.id, items);
            setMessage(copy.added(r.added, r.alreadyThere, skipped));
            await reload();
          }}
        />
      )}

      <div className="flex flex-wrap items-end gap-3">
        <FilterSelect label={copy.difficultyLabel} value={difficulty} onChange={setDifficulty} options={[['any', copy.anyDifficulty], ...['easy', 'medium', 'hard'].map((d) => [d, copy.difficulty[d]] as [string, string])]} />
        {patterns.length > 0 && <FilterSelect label={copy.patternLabel} value={pattern} onChange={setPattern} options={[['any', copy.anyPattern], ...patterns.map((p) => [p, p] as [string, string])]} />}
        <FilterSelect
          label={copy.statusLabel}
          value={status}
          onChange={(v) => setStatus(v as Status)}
          options={[
            ['any', copy.anyStatus],
            ['new', copy.statusNew],
            ['practiced', copy.statusPracticed],
            ['weak', copy.statusWeak],
          ]}
        />
        <p className="pb-3 text-sm text-ink-soft">{copy.showing(shown.length, total)}</p>
      </div>

      <SelectionBar
        count={selected.size}
        lists={mine.filter((l) => l.id !== current)}
        canRemove={!!userList}
        onCopy={async (target, newName) => {
          const list = newName ? await createList(newName) : mine.find((l) => l.id === target)!;
          const items = rows.filter((r) => selected.has(r.key)).map((r) => r.item);
          const res = await addToList(list.id, items);
          setMessage(copy.copied(res.added, res.alreadyThere, list.name));
          setSelected(new Set());
          await reload();
        }}
        onRemove={async () => {
          for (const r of rows) if (selected.has(r.key) && r.entry) await removeFromList(r.entry, current);
          setSelected(new Set());
          await reload();
        }}
      />
      {message && (
        <p role="status" className="text-sm text-green">
          {message}
        </p>
      )}

      {total === 0 ? (
        <p className="text-sm text-ink-soft">{bundled ? common.loading : copy.empty}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-ink-soft">{copy.noMatch}</p>
      ) : (
        <div className="flex flex-col">
          <label className="flex min-h-11 items-center gap-3 border-b border-smudge text-sm text-ink-soft">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[var(--blue)]"
              checked={allShownSelected}
              onChange={() => setSelected(allShownSelected ? new Set([...selected].filter((k) => !shown.some((r) => r.key === k))) : new Set([...selected, ...shown.map((r) => r.key)]))}
            />
            {copy.selectAll}
          </label>
          <ul className="m-0 flex list-none flex-col p-0">
            {shown.map((r) => (
              <ProblemRow
                key={r.key}
                row={r}
                listId={current}
                checked={selected.has(r.key)}
                onCheck={(on) => {
                  const next = new Set(selected);
                  if (on) next.add(r.key);
                  else next.delete(r.key);
                  setSelected(next);
                }}
                onRemove={
                  userList && r.entry
                    ? async () => {
                        await removeFromList(r.entry!, current);
                        await reload();
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="sr-only">{label}</span>
      <select className={selectClass} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Choose a list; create, rename or delete your own. */
function ListBar({ lists, catalog, current, onChoose, onChanged }: { lists: UserList[]; catalog: LeetCodeLists | null; current: string; onChoose: (id: string) => void; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'idle' | 'new' | 'rename'>('idle');
  const [name, setName] = useState('');
  const mineCurrent = lists.find((l) => l.id === current);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-3 text-sm font-semibold">
          {copy.listLabel}
          <select aria-label={copy.listLabel} className={`${selectClass} min-w-[220px] font-normal`} value={current} onChange={(e) => onChoose(e.target.value)}>
            <optgroup label={copy.yourLists}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={copy.studyLists}>
              {(catalog?.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <Button variant="quiet" onClick={() => (setMode('new'), setName(''))}>
          {copy.newList}
        </Button>
        {mineCurrent && (
          <Button variant="quiet" onClick={() => (setMode('rename'), setName(mineCurrent.name))}>
            {copy.rename}
          </Button>
        )}
        {mineCurrent && mineCurrent.id !== MY_LIST_ID && (
          <Button
            variant="quiet"
            onClick={async () => {
              if (!confirm(copy.confirmDelete(mineCurrent.name))) return;
              await deleteList(mineCurrent.id);
              onChoose(MY_LIST_ID);
              await onChanged();
            }}
          >
            {copy.deleteList}
          </Button>
        )}
      </div>
      {mode !== 'idle' && (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            if (mode === 'new') {
              const l = await createList(name);
              await onChanged();
              onChoose(l.id);
            } else if (mineCurrent) {
              await renameList(mineCurrent, name);
              await onChanged();
            }
            setMode('idle');
          }}
        >
          <div className="w-full max-w-[320px]">
            <TextField label={mode === 'new' ? copy.newListName : copy.renameLabel} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            {mode === 'new' ? copy.create : copy.save}
          </Button>
          <Button variant="quiet" onClick={() => setMode('idle')}>
            {copy.cancel}
          </Button>
        </form>
      )}
    </div>
  );
}

/** Paste links, numbers or titles; duplicates are skipped. */
function AddProblems({ catalog, onAdd }: { catalog: LeetCodeLists | null; onAdd: (items: NewItem[], skipped: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open)
    return (
      <div>
        <Button onClick={() => setOpen(true)}>{copy.addHeading}</Button>
      </div>
    );
  return (
    <form
      className="flex max-w-[640px] flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const { items, skipped } = parseImport(text, catalog?.problems ?? {});
        await onAdd(items, skipped.length);
        setText('');
        setOpen(false);
      }}
    >
      <TextArea label={copy.addLabel} help={copy.addHelp} rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <div className="flex gap-4">
        <Button type="submit" variant="primary" disabled={!text.trim()}>
          {copy.add}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {copy.cancel}
        </Button>
      </div>
    </form>
  );
}

/** Appears once something is selected: copy it to another list (or a new one), or remove it from this one. */
function SelectionBar({
  count,
  lists,
  canRemove,
  onCopy,
  onRemove,
}: {
  count: number;
  lists: UserList[];
  canRemove: boolean;
  onCopy: (target: string, newName?: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [target, setTarget] = useState('');
  const [newName, setNewName] = useState('');
  if (!count) return null;
  const chosen = target || lists[0]?.id || '__new';
  const isNew = chosen === '__new';
  return (
    <div className="flex flex-wrap items-center gap-3 border-l-[3px] border-blue py-1 pl-4" role="region" aria-label={copy.selected(count)}>
      <span className="text-sm font-semibold">{copy.selected(count)}</span>
      <label className="flex items-center gap-2 text-sm">
        {copy.copyTo}
        <select className={selectClass} value={chosen} onChange={(e) => setTarget(e.target.value)}>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="__new">{copy.copyNewList}</option>
        </select>
      </label>
      {isNew && (
        <input aria-label={copy.newListName} placeholder={copy.newListName} className={`${selectClass} w-48`} value={newName} onChange={(e) => setNewName(e.target.value)} />
      )}
      <Button variant="primary" disabled={isNew && !newName.trim()} onClick={() => void onCopy(chosen, isNew ? newName : undefined)}>
        {copy.copy}
      </Button>
      {canRemove && (
        <Button variant="quiet" onClick={() => void onRemove()}>
          {copy.removeSelected(count)}
        </Button>
      )}
    </div>
  );
}

function ProblemRow({ row, listId, checked, onCheck, onRemove }: { row: Row; listId: string; checked: boolean; onCheck: (on: boolean) => void; onRemove?: () => Promise<void> }) {
  const e = row.entry;
  const weak = !!e && isWeak(e);
  const link = row.item.slug ? leetcodeUrl(row.item.slug) : row.item.link;
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-smudge py-2 ${weak ? 'border-l-[3px] border-l-red pl-2' : ''}`}>
      <input type="checkbox" aria-label={row.item.title} className="h-4 w-4 accent-[var(--blue)]" checked={checked} onChange={(ev) => onCheck(ev.target.checked)} />
      <div className="flex min-w-[200px] flex-1 flex-col">
        <p className="text-sm">
          {row.number !== undefined && <span className="font-mono text-xs text-ink-soft">{row.number}. </span>}
          <span className="font-semibold">{row.item.title}</span>
          {row.difficulty && <span className="text-ink-soft"> · {copy.difficulty[row.difficulty]}</span>}
          {row.pattern && <span className="text-ink-soft"> · {row.pattern}</span>}
        </p>
        <p className="text-xs text-ink-soft">
          {weak && <span className="font-semibold text-red">{copy.weak}. </span>}
          {e?.sessions.length ? copy.practiced(e.sessions.length) : copy.notStarted}
          {e?.lastScore !== undefined ? `, ${copy.lastScore(e.lastScore.toFixed(1))}` : ''}
          {row.builtIn && (
            <span title={copy.builtInTitle}>
              {' · '}
              {copy.builtIn}
            </span>
          )}
          {e?.text && !row.builtIn ? ` · ${copy.hasText}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="secondary" onClick={() => navigate(practiceHref(listId, row.key))}>
          {copy.practice}
        </Button>
        {link && <ExternalLink href={link}>{copy.open}</ExternalLink>}
        {onRemove && (
          <Button variant="quiet" onClick={() => void onRemove()}>
            {copy.remove}
          </Button>
        )}
      </div>
    </li>
  );
}
