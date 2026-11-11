import { useEffect, useState } from 'react';
import { history as copy, common } from '../copy/strings';
import { listSessions } from '../lib/storage/db';
import type { Session } from '../lib/types';
import { ButtonLink } from '../ui/Button';
import { formatDate } from '../lib/time';

export function HistoryScreen() {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  useEffect(() => {
    listSessions().then(setSessions);
  }, []);
  if (!sessions) return <p className="py-8 text-sm text-ink-soft">{common.loading}</p>;
  if (!sessions.length) {
    return (
      <div className="max-w-[560px] pt-12">
        <h1 className="text-lg font-bold">{copy.emptyTitle}</h1>
        <p className="mt-3 text-sm">{copy.emptyBody}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <ButtonLink variant="primary" href="#/">
            {copy.startFirst}
          </ButtonLink>
          <ButtonLink href="#/replay/demo">{copy.watchDemo}</ButtonLink>
        </div>
      </div>
    );
  }
  return (
    <div className="pt-8">
      <h1 className="text-lg font-bold">{copy.title}</h1>
      <ul className="mt-6">
        {sessions.map((s) => (
          <li key={s.id}>
            <a href={`#/replay/${s.id}`}>
              {formatDate(s.createdAt)} {s.problem.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
