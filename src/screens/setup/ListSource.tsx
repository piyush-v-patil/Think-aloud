import { useEffect, useMemo, useState } from 'react';
import { list as listCopy, setup as copy } from '../../copy/strings';
import { listEntries, type ListEntry, type UserList } from '../../lib/storage/db';
import { MY_LIST_ID, entriesIn, findEntry, leetcodeUrl, loadLeetCodeLists, type LeetCodeLists, type NewItem } from '../../lib/lists/lists';
import { loadUserLists } from '../../lib/lists/store';
import { bankForSlug } from '../../lib/problems/bank';
import { sortForPractice, isWeak } from '../ListScreen';
import { Segmented } from '../../ui/Segmented';
import { TextArea } from '../../ui/Field';
import { ExternalLink } from '../../ui/ExternalLink';
import { Button } from '../../ui/Button';

/** What the candidate picked from a list, and how they'll practice it. */
export interface ListSelection {
  item: NewItem;
  /** The entry that records progress, if the problem has one yet. */
  entry?: ListEntry;
  /** Practice the app's own version of this problem (tests and analysis ready). */
  bankId?: string;
  /** The statement to prepare (saved earlier, or just pasted). */
  text?: string;
  /** True when the statement was pasted now and should be saved. */
  newText: boolean;
}

interface Option {
  key: string;
  item: NewItem;
  entry?: ListEntry;
  label: string;
}

const selectClass = 'min-h-11 w-full rounded-control border border-smudge-mark bg-paper px-3 text-sm text-ink';

function params() {
  return new URLSearchParams(location.hash.split('?')[1] ?? '');
}

export function ListSource({ onChange }: { onChange: (s: ListSelection | null) => void }) {
  const [catalog, setCatalog] = useState<LeetCodeLists | null>(null);
  const [mine, setMine] = useState<UserList[]>([]);
  const [entries, setEntries] = useState<ListEntry[]>([]);
  const [listId, setListId] = useState(() => params().get('from') ?? MY_LIST_ID);
  const [key, setKey] = useState<string | null>(() => params().get('problem'));
  const [mode, setMode] = useState<'builtin' | 'statement'>('builtin');
  const [draft, setDraft] = useState('');
  const [replacing, setReplacing] = useState(false);

  useEffect(() => {
    void Promise.all([loadUserLists(), listEntries(), loadLeetCodeLists()]).then(([lists, all, cat]) => {
      setMine(lists);
      setEntries(all);
      setCatalog(cat);
    });
  }, []);

  const bundled = catalog?.lists.find((l) => l.id === listId);
  const options: Option[] = useMemo(() => {
    const status = (e?: ListEntry) => (!e?.sessions.length ? '' : isWeak(e) ? ` (${listCopy.weak.toLowerCase()})` : ` (${listCopy.practiced(e.sessions.length).toLowerCase()})`);
    if (bundled && catalog) {
      return bundled.slugs.map((slug) => {
        const p = catalog.problems[slug];
        const item = { slug, title: p.title };
        const entry = findEntry(entries, item);
        return { key: slug, item, entry, label: `${p.number}. ${p.title}${status(entry)}` };
      });
    }
    return sortForPractice(entriesIn(entries, listId)).map((e) => {
      const n = e.slug ? catalog?.problems[e.slug]?.number : undefined;
      return { key: e.slug ?? e.id, item: { slug: e.slug, title: e.title, link: e.link }, entry: e, label: `${n ? `${n}. ` : ''}${e.title}${status(e)}` };
    });
  }, [bundled, catalog, entries, listId]);

  const picked = options.find((o) => o.key === key) ?? options[0];
  const bank = picked?.item.slug ? bankForSlug(picked.item.slug) : undefined;
  const useBank = !!bank && mode === 'builtin';
  const savedText = picked?.entry?.text;
  const text = savedText && !replacing ? savedText : draft;

  useEffect(() => {
    if (!picked) return onChange(null);
    onChange({
      item: picked.item,
      entry: picked.entry,
      bankId: useBank ? bank!.id : undefined,
      text: useBank ? undefined : text.trim() || undefined,
      newText: !useBank && (!savedText || replacing) && draft.trim().length > 0,
    });
  }, [picked, useBank, bank, text, savedText, replacing, draft, onChange]);

  const link = picked?.item.slug ? leetcodeUrl(picked.item.slug) : picked?.item.link;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <label className="text-sm">
          <span className="sr-only">{listCopy.listLabel}</span>
          <select
            className={selectClass}
            value={listId}
            onChange={(e) => {
              setListId(e.target.value);
              setKey(null);
              setDraft('');
              setReplacing(false);
            }}
          >
            <optgroup label={listCopy.yourLists}>
              {mine.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
            <optgroup label={listCopy.studyLists}>
              {(catalog?.lists ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        {options.length > 0 && (
          <label className="text-sm">
            <span className="sr-only">{copy.listPick}</span>
            <select
              className={selectClass}
              value={picked?.key ?? ''}
              onChange={(e) => {
                setKey(e.target.value);
                setDraft('');
                setReplacing(false);
              }}
            >
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {options.length === 0 && catalog && <p className="text-sm text-ink-soft">{copy.listEmpty}</p>}

      {picked && (
        <div className="flex flex-col gap-2 border-l-[3px] border-smudge py-0.5 pl-4">
          {bank && (
            <Segmented
              inline
              label={copy.practiceWith}
              value={mode}
              onChange={setMode}
              options={[
                { value: 'builtin', label: copy.builtInVersion },
                { value: 'statement', label: copy.leetcodeStatement },
              ]}
            />
          )}
          {useBank ? (
            <p className="text-sm text-ink-soft">{copy.builtInHelp(bank!.title)}</p>
          ) : savedText && !replacing ? (
            <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-ink-soft">
              {copy.statementSaved}
              <Button variant="quiet" onClick={() => setReplacing(true)}>
                {copy.replaceStatement}
              </Button>
            </p>
          ) : (
            <TextArea label={copy.pasteStatement} help={copy.pasteStatementHelp} rows={5} value={draft} onChange={(e) => setDraft(e.target.value)} />
          )}
          {link && (
            <p className="text-sm">
              <ExternalLink href={link}>{listCopy.open}</ExternalLink>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
