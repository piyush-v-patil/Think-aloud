import { useEffect, useState } from 'react';
import { interview as copy, languageName } from '../copy/strings';
import { useDraft } from '../state/draft';
import { navigate } from '../state/router';
import { useSettings } from '../state/settings';
import { InterviewController } from '../lib/session/controller';
import { useStore } from '../state/store';
import { formatClock } from '../lib/time';
import { CodeEditor } from '../ui/CodeEditor';
import { ProblemText } from '../ui/ProblemText';
import { TestOutput } from '../ui/TestOutput';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { finishSession } from '../lib/session/finish';
import { MarkedTranscript } from '../ui/MarkedTranscript';

export default function InterviewScreen() {
  const draft = useDraft();
  useEffect(() => {
    if (!draft) navigate('/');
  }, [draft]);
  if (!draft) return null;
  return <Workspace />;
}

function Workspace() {
  const draft = useDraft()!;
  const settings = useSettings();
  const dark = useIsDark();
  const { problem, language } = draft;
  const [controller] = useState(() => new InterviewController(problem, language));
  const { code, lastRun, running, runnerStatus, elapsedMs: elapsed } = useStore(controller.store);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const testable = controller.testable;

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  async function end() {
    const last = controller.snapshot();
    const id = await finishSession({
      draft,
      settings,
      endedAtMs: Math.max(last.t, controller.clock.now()),
      code: controller.snapshots,
      testRuns: controller.runs,
    });
    navigate(`/replay/${id}`);
  }

  const plannedMs = draft.minutes * 60_000;
  const remaining = plannedMs - elapsed;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-smudge px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-baseline gap-4">
          <h1 className="truncate text-md font-semibold">{problem.title}</h1>
          <span className="text-sm text-ink-soft">{languageName[language]}</span>
        </div>
        <div className="flex items-center gap-6">
          <p className="text-sm" title={formatClock(elapsed)}>
            <time className="font-mono">{formatClock(Math.abs(remaining))}</time>{' '}
            <span className={remaining >= 0 ? 'text-ink-soft' : 'text-red'}>{remaining >= 0 ? copy.left : copy.over}</span>
          </p>
          <Button variant="secondary" onClick={() => setConfirmEnd(true)}>
            {copy.end}
          </Button>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        <section aria-labelledby="problem-h" className="flex flex-col gap-6 border-smudge p-4 sm:p-6 lg:max-h-[calc(100vh-61px)] lg:overflow-y-auto lg:border-r">
          <div>
            <h2 id="problem-h" className="mb-3 text-md font-semibold">
              {copy.problemHeading}
            </h2>
            <ProblemText problem={problem} />
          </div>
          <div>
            <h2 className="mb-3 text-md font-semibold">{copy.transcriptHeading}</h2>
            <MarkedTranscript rows={[]} marks={[]} emptyText="" />
          </div>
        </section>

        <section aria-label={copy.editorLabel} className="flex min-w-0 flex-col gap-4 p-4 sm:p-6">
          <div className="h-[55vh] min-h-[320px] lg:h-auto lg:flex-1">
            <CodeEditor value={code} language={language} onChange={(v) => controller.setCode(v)} dark={dark} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Button variant="primary" onClick={() => void controller.run()} disabled={running}>
              {running ? copy.running : testable ? copy.run : copy.runScript}
            </Button>
            {runnerStatus && <p className="text-sm text-ink-soft">{copy.loadingPython}</p>}
          </div>
          <div className="max-h-[32vh] overflow-y-auto">
            <h2 className="sr-only">{copy.testsHeading}</h2>
            <TestOutput run={lastRun} hasTests={testable} />
          </div>
        </section>
      </div>

      <Dialog open={confirmEnd} title={copy.end} onClose={() => setConfirmEnd(false)}>
        <p className="text-sm">{copy.endConfirm}</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Button variant="primary" onClick={end}>
            {copy.endConfirmYes}
          </Button>
          <Button onClick={() => setConfirmEnd(false)}>{copy.endConfirmNo}</Button>
        </div>
      </Dialog>
    </div>
  );
}

export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    const obs = new MutationObserver(() => setDark(document.documentElement.dataset.theme === 'dark'));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}
