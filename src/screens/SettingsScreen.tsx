import { useState } from 'react';
import { settings as copy } from '../copy/strings';
import { updateSettings, useSettings, resetSettings, type ThemeSetting } from '../state/settings';
import { clearAll } from '../lib/storage/db';
import { exportAll, importAll } from '../lib/storage/transfer';
import { clearLocal } from '../lib/storage/local';
import { clearAllKeys } from '../state/keys';
import { Segmented } from '../ui/Segmented';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Rule } from '../ui/Rule';
import { AiSection } from './settings/AiSection';
import { SpeechSection } from './settings/SpeechSection';

export function SettingsScreen({ section }: { section?: string }) {
  void section;
  const settings = useSettings();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function download() {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `think-aloud-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function upload(file: File) {
    try {
      const n = await importAll(JSON.parse(await file.text()));
      setMessage(copy.imported(n));
    } catch {
      setMessage(copy.importFailed);
    }
  }

  async function deleteEverything() {
    await clearAll();
    clearLocal();
    clearAllKeys();
    resetSettings();
    setConfirmDelete(false);
    setMessage(copy.deleted);
  }

  return (
    <div className="flex max-w-[720px] flex-col gap-10 pt-8">
      <h1 className="text-lg font-bold">{copy.title}</h1>

      <AiSection />

      <Rule />

      <SpeechSection />

      <Rule />

      <section aria-labelledby="appearance-h" className="flex flex-col gap-4">
        <h2 id="appearance-h" className="text-md font-semibold">
          {copy.appearanceHeading}
        </h2>
        <Segmented<ThemeSetting>
          size="sm"
          label={copy.theme}
          value={settings.theme}
          onChange={(theme) => updateSettings({ theme })}
          options={[
            { value: 'light', label: copy.themeLight },
            { value: 'dark', label: copy.themeDark },
            { value: 'system', label: copy.themeSystem },
          ]}
        />
      </section>

      <Rule />

      <section aria-labelledby="data-h" className="flex flex-col gap-4">
        <h2 id="data-h" className="text-md font-semibold">
          {copy.dataHeading}
        </h2>
        <p className="text-sm text-ink-soft">{copy.dataIntro}</p>
        <div className="flex flex-wrap gap-4">
          <Button onClick={() => void download()}>{copy.exportAll}</Button>
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-control border border-ink px-4 text-sm font-semibold focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue">
            {copy.importSessions}
            <input
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
          </label>
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            {copy.deleteAll}
          </Button>
        </div>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
      </section>

      <Dialog open={confirmDelete} title={copy.deleteAll} onClose={() => setConfirmDelete(false)}>
        <p className="text-sm">{copy.deleteConfirm}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Button variant="danger" onClick={deleteEverything}>
            {copy.deleteConfirmYes}
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>{copy.deleteConfirmNo}</Button>
        </div>
      </Dialog>
    </div>
  );
}
