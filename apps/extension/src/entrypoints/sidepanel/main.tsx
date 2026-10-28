import { render } from 'solid-js/web';
import { App } from '../../panel/App.tsx';
import '../../panel/styles.css';
import { startPanelTheme } from '../../panel/theme.ts';
import { settingsItem } from '../../storage/items.ts';

const theme = startPanelTheme({
  settings: settingsItem,
  media: matchMedia('(prefers-color-scheme: dark)'),
  root: document.documentElement,
});

render(() => <App theme={theme} />, document.getElementById('app') as HTMLElement);
