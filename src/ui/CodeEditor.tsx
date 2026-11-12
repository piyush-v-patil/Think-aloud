import Editor from '@monaco-editor/react';
import './monaco';
import type { Language } from '../lib/types';
import { interview as copy, common } from '../copy/strings';

export function CodeEditor({
  value,
  language,
  onChange,
  readOnly = false,
  dark,
  height = '100%',
}: {
  value: string;
  language: Language;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  dark: boolean;
  height?: string | number;
}) {
  return (
    <div className="h-full overflow-hidden rounded-editor border border-smudge bg-paper" aria-label={copy.editorLabel}>
      <Editor
        height={height}
        language={language}
        value={value}
        theme={dark ? 'board-dark' : 'board-light'}
        onChange={(v) => onChange?.(v ?? '')}
        loading={<p className="p-4 text-sm text-ink-soft">{common.loading}</p>}
        options={{
          readOnly,
          fontFamily: "'Atkinson Hyperlegible Mono', ui-monospace, monospace",
          fontSize: 14,
          lineHeight: 22,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          tabSize: language === 'javascript' ? 2 : 4,
          insertSpaces: true,
          renderLineHighlight: 'line',
          overviewRulerLanes: 0,
          padding: { top: 12, bottom: 12 },
          automaticLayout: true,
          wordWrap: 'off',
          ariaLabel: copy.editorLabel,
          accessibilitySupport: 'auto',
          quickSuggestions: false,
          suggestOnTriggerCharacters: false,
          parameterHints: { enabled: false },
          contextmenu: false,
          bracketPairColorization: { enabled: false },
        }}
      />
    </div>
  );
}
