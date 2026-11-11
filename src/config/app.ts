/**
 * The product name lives here and only here. Change it to rename the app.
 * index.html's <title> is filled from this value at build time.
 */
export const APP_NAME = 'Think Aloud';

/** Default interview length in minutes. */
export const DEFAULT_SESSION_MINUTES = 45;

/** Repository link shown in the footer and README. */
export const REPO_URL = 'https://github.com/piyush-v-patil/think-aloud';

/** The Claude Code bridge: one file, linked from Settings so people using the hosted site can get it. */
export const BRIDGE_FILE_URL = `${REPO_URL}/blob/main/scripts/claude-bridge.mjs`;

/** Sites the bridge allows without --origin (the Vite dev and preview servers). */
export const BRIDGE_DEFAULT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
