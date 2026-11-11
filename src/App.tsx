import { lazy, Suspense, useEffect } from 'react';
import { APP_NAME } from './config/app';
import { nav, common, errors } from './copy/strings';
import { useRoute, type Route } from './state/router';
import { SetupScreen } from './screens/SetupScreen';
import { HistoryScreen } from './screens/HistoryScreen';
import { SettingsScreen } from './screens/SettingsScreen';

// The interview and replay screens carry the editor and are loaded on demand.
const InterviewScreen = lazy(() => import('./screens/InterviewScreen'));
const ReplayScreen = lazy(() => import('./screens/ReplayScreen'));
const ListScreen = lazy(() => import('./screens/ListScreen'));

export function App() {
  const route = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.name, route.param]);
  const immersive = route.name === 'interview';
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-board focus:p-2">
        {nav.skipToContent}
      </a>
      {!immersive && <Header route={route} />}
      <main id="main" className={immersive ? 'flex flex-1 flex-col' : 'mx-auto w-full max-w-[1200px] flex-1 px-4 pb-16 sm:px-8'}>
        <Suspense fallback={<p className="py-8 text-sm text-ink-soft">{common.loading}</p>}>
          <Screen route={route} />
        </Suspense>
      </main>
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'setup':
      return <SetupScreen />;
    case 'interview':
      return <InterviewScreen />;
    case 'replay':
      return <ReplayScreen key={route.param} id={route.param!} />;
    case 'history':
      return <HistoryScreen />;
    case 'settings':
      return <SettingsScreen section={route.param} />;
    case 'list':
      return <ListScreen />;
    default:
      return <p className="py-8">{errors.notFound}</p>;
  }
}

function Header({ route }: { route: Route }) {
  const link = (href: string, label: string, active: boolean) => (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-11 items-center text-sm ${active ? 'font-semibold text-ink underline decoration-blue decoration-[3px] underline-offset-[10px]' : 'text-ink-soft'}`}
    >
      {label}
    </a>
  );
  return (
    <header className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-4 sm:px-8">
      <a href="#/" aria-label={nav.home} className="flex min-h-11 items-center gap-2 text-md font-bold">
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 32 32">
          <path d="M7 13h18M7 19h12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M6 24c4-2 9-2 14 0" stroke="var(--blue)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </svg>
        {APP_NAME}
      </a>
      <nav aria-label="Main" className="flex gap-6">
        {link('#/', nav.practice, route.name === 'setup')}
        {link('#/history', nav.history, route.name === 'history' || route.name === 'replay')}
        {link('#/settings', nav.settings, route.name === 'settings')}
      </nav>
    </header>
  );
}
