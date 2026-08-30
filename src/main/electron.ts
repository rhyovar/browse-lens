import { app, BrowserWindow } from 'electron';
import { bootstrap } from './index.js';
import { closeBrowser } from '../browser/chromium.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function shutdown(): void {
  closeBrowser().finally(() => process.exit(0));
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'BrowseLens',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../../ui/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('window-all-closed', (): void => {
  shutdown();
});

app.whenReady().then(async (): Promise<void> => {
  await bootstrap();

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  createWindow();

  app.on('activate', (): void => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
