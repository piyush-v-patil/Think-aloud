import { useEffect, useState } from 'react';
import { getSession } from '../lib/storage/db';
import type { Session } from '../lib/types';
import { errors, common } from '../copy/strings';

export default function ReplayScreen({ id }: { id: string }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    getSession(id).then((s) => setSession(s ?? null));
  }, [id]);
  if (session === undefined) return <p className="py-8 text-sm text-ink-soft">{common.loading}</p>;
  if (session === null) return <p className="py-8">{errors.notFound}</p>;
  return (
    <div className="pt-8">
      <h1 className="text-lg font-bold">{session.problem.title}</h1>
    </div>
  );
}
