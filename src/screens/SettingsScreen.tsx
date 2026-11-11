import { useState } from 'react';
import { settings as copy } from '../copy/strings';
import { updateSettings, useSettings, resetSettings, type ThemeSetting } from '../state/settings';
import { clearAll } from '../lib/storage/db';
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
        <div className="flex flex-wrap gap-4">
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
