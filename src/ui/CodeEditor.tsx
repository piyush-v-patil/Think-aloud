import { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { monaco } from './monaco';
import type { Language } from '../lib/types';
import { interview as copy, common } from '../copy/strings';

type Options = monaco.editor.IStandaloneEditorConstructionOptions;

const BASE_OPTIONS: Options = {
  fontFamily: "'Atkinson Hyperlegible Mono', ui-monospace, monospace",
  fontSize: 14,
  lineHeight: 22,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
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
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'explicit',
};

interface Props {
  language: Language;
  dark: boolean;
  height?: string | number;
  readOnly?: boolean;
  /**
   * The text, when something outside the editor decides it (the replay's
   * time slider). Leave it out while the candidate types: the editor owns
   * its text then, and only reports changes through onChange.
   */
  value?: string;
  /** The text to start with when the editor owns it. */
  initialValue?: string;
  onChange?: (value: string) => void;
}

/**
 * Monaco, kept out of React's render loop. The editor holds its own text:
 * passing the text back in on every render (a "controlled" editor) let a
 * render that was a keystroke behind replace the newer text, dropping
 * characters and throwing the cursor around. Props here are stable, so the
 * interview's clock and live captions never re-render the editor.
 */
function CodeEditorImpl({ language, dark, height = '100%', readOnly = false, value, initialValue, onChange }: Props) {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Text set from outside (the replay): apply it only when it differs.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || value === undefined || editor.getValue() === value) return;
    if (readOnly) editor.setValue(value);
    else {
      editor.executeEdits('external', [{ range: editor.getModel()!.getFullModelRange(), text: value, forceMoveMarkers: true }]);
      editor.pushUndoStop();
    }
  }, [value, readOnly]);

  const options = useMemo<Options>(() => ({ ...BASE_OPTIONS, readOnly, tabSize: language === 'javascript' ? 2 : 4 }), [language, readOnly]);
  const handleChange = useCallback((v: string | undefined) => onChangeRef.current?.(v ?? ''), []);
  const handleMount = useCallback<OnMount>((editor) => {
    editorRef.current = editor;
  }, []);

  return (
    <div className="h-full overflow-hidden rounded-editor border border-smudge bg-paper" aria-label={copy.editorLabel}>
      <Editor
        height={height}
        language={language}
        defaultValue={value ?? initialValue ?? ''}
        theme={dark ? 'board-dark' : 'board-light'}
        onChange={handleChange}
        onMount={handleMount}
        loading={<p className="p-4 text-sm text-ink-soft">{common.loading}</p>}
        options={options}
      />
    </div>
  );
}

export const CodeEditor = memo(CodeEditorImpl);
