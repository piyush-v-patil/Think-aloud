import { useEffect, useState } from 'react';
import { list as copy, common } from '../copy/strings';
import { deleteListEntry, listEntries, saveListEntry, type ListEntry } from '../lib/storage/db';
import { newId } from '../lib/id';
import { Button } from '../ui/Button';
import { TextArea, TextField } from '../ui/Field';
import { ExternalLink } from '../ui/ExternalLink';
import { Rule } from '../ui/Rule';
import { navigate } from '../state/router';

/** Weak problems resurface first, then ones not practiced, then the rest. */
export function sortForPractice(entries: ListEntry[]): ListEntry[] {
  const rank = (e: ListEntry) => (e.lastScore !== undefined && e.lastScore < 2.5 ? 0 : e.sessions.length === 0 ? 1 : 2);
  return [...entries].sort((a, b) => rank(a) - rank(b) || (a.lastScore ?? 5) - (b.lastScore ?? 5) || a.addedAt - b.addedAt);
}

export function isWeak(e: ListEntry): boolean {
  return e.lastScore !== undefined && e.lastScore < 2.5;
}

export default function ListScreen() {
  const [entries, setEntries] = useState<ListEntry[] | null>(null);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');

  const reload = () => listEntries().then((e) => setEntries(sortForPractice(e)));
  useEffect(() => {
    void reload();
  }, []);

  async function add() {
    const safeLink = /^https?:\/\//i.test(link.trim()) ? link.trim() : undefined;
    await saveListEntry({ id: newId('l-'), title: title.trim(), link: safeLink, text: text.trim() || undefined, addedAt: Date.now(), sessions: [] });
    setTitle('');
    setLink('');
    setText('');
    await reload();
  }

  if (!entries) return <p className="py-8 text-sm text-ink-soft">{common.loading}</p>;
  return (
    <div className="flex max-w-[860px] flex-col gap-10 pt-8">
      <div>
        <h1 className="text-lg font-bold">{copy.title}</h1>
        <p className="mt-2 text-sm text-ink-soft">{copy.intro}</p>
      </div>

      <form
        aria-labelledby="add-h"
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <h2 id="add-h" className="text-md font-semibold">
          {copy.addHeading}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label={copy.titleLabel} value={title} onChange={(e) => setTitle(e.target.value)} required />
          <TextField label={copy.linkLabel} type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
        </div>
        <TextArea label={copy.textLabel} help={copy.textHelp} rows={4} value={text} onChange={(e) => setText(e.target.value)} />
        <div>
          <Button type="submit" variant="primary" disabled={!title.trim()}>
            {copy.add}
          </Button>
        </div>
      </form>

      <Rule />

      {entries.length === 0 ? (
        <p className="text-sm text-ink-soft">{copy.empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-6 p-0">
          {entries.map((e) => (
            <li key={e.id} className={`border-l-[3px] py-1 pl-4 ${isWeak(e) ? 'border-red' : 'border-smudge'}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <p className="text-md font-semibold">{e.title}</p>
                <p className="text-sm text-ink-soft">
                  {isWeak(e) ? <span className="font-semibold text-red">{copy.weak}. </span> : null}
                  {e.sessions.length ? copy.practiced(e.sessions.length) : copy.notStarted}
                  {e.lastScore !== undefined ? `. ${copy.colLast}: ${e.lastScore.toFixed(1)} of 4` : ''}
                </p>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
                {e.text ? (
                  <Button variant="primary" onClick={() => navigate(`/?list=${encodeURIComponent(e.id)}`)}>
                    {copy.practice}
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setEditing(e.id);
                      setDraftText('');
                    }}
                  >
                    {copy.needsText}
                  </Button>
                )}
                {e.link && <ExternalLink href={e.link}>{copy.open}</ExternalLink>}
                <Button
                  variant="quiet"
                  onClick={async () => {
                    await deleteListEntry(e.id);
                    await reload();
                  }}
                >
                  {copy.remove}
                </Button>
              </div>
              {editing === e.id && (
                <form
                  className="mt-3 flex flex-col gap-2"
                  onSubmit={async (ev) => {
                    ev.preventDefault();
                    await saveListEntry({ ...e, text: draftText.trim() });
                    setEditing(null);
                    await reload();
                  }}
                >
                  <TextArea label={copy.textLabel} rows={5} value={draftText} onChange={(ev) => setDraftText(ev.target.value)} />
                  <div>
                    <Button type="submit" variant="primary" disabled={draftText.trim().length < 20}>
                      {copy.saveText}
                    </Button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
