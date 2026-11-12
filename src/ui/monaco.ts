/**
 * Monaco, bundled with the app. @monaco-editor/react loads Monaco from a CDN
 * by default; pointing its loader at this local copy keeps every byte on our
 * own origin. Only the Python, JavaScript and Java grammars are included.
 */
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/features/register.all';
import 'monaco-editor/languages/definitions/python/register';
import 'monaco-editor/languages/definitions/javascript/register';
import 'monaco-editor/languages/definitions/java/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import { loader } from '@monaco-editor/react';

(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

monaco.editor.defineTheme('board-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '5A6168', fontStyle: 'italic' },
    { token: 'keyword', foreground: '1F4FD8' },
    { token: 'string', foreground: '0E7A55' },
    { token: 'number', foreground: 'A3361F' },
    { token: 'delimiter', foreground: '3A4048' },
    { token: 'delimiter.bracket', foreground: '3A4048' },
    { token: 'delimiter.parenthesis', foreground: '3A4048' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#1B1D22',
    'editorLineNumber.foreground': '#8A9398',
    'editorLineNumber.activeForeground': '#1B1D22',
    'editor.lineHighlightBackground': '#F2F5F4',
    'editor.selectionBackground': '#C9D6F7',
    'editorCursor.foreground': '#1F4FD8',
    'editorIndentGuide.background1': '#E4E9EA',
    'editorWidget.background': '#F7F9F8',
    'editorWidget.border': '#D5DBDD',
  },
});

monaco.editor.defineTheme('board-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '9AA6A2', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'A8C1FF' },
    { token: 'string', foreground: '5FD1A0' },
    { token: 'number', foreground: 'F0B37E' },
    { token: 'delimiter', foreground: 'C7D3CF' },
    { token: 'delimiter.bracket', foreground: 'C7D3CF' },
    { token: 'delimiter.parenthesis', foreground: 'C7D3CF' },
  ],
  colors: {
    'editor.background': '#202A27',
    'editor.foreground': '#E6EBE8',
    'editorLineNumber.foreground': '#6E7B77',
    'editorLineNumber.activeForeground': '#E6EBE8',
    'editor.lineHighlightBackground': '#26312E',
    'editor.selectionBackground': '#34466A',
    'editorCursor.foreground': '#A8C1FF',
    'editorIndentGuide.background1': '#2C3835',
    'editorWidget.background': '#18201E',
    'editorWidget.border': '#33403C',
    'editorBracketHighlight.foreground1': '#C7D3CF',
    'editorBracketMatch.border': '#7F8C88',
  },
});

loader.config({ monaco });

export { monaco };
