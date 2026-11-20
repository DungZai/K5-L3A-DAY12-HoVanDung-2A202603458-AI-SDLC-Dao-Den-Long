import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const repoRoot = fileURLToPath(new URL('../', import.meta.url));

export function chromiumRuntime() {
  const { chromium } = require(process.env.LAB_PLAYWRIGHT || process.env.PHASE2_PLAYWRIGHT || 'playwright');
  const explicit = process.env.LAB_BROWSER || process.env.PHASE2_BROWSER;
  const windows = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
    .filter(Boolean).flatMap((base) => [
      join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
    ]);
  const mac = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  const linux = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  const candidates = { win32: windows, darwin: mac, linux }[process.platform] ?? [];
  const executablePath = explicit || [...candidates, chromium.executablePath()].find((file) => existsSync(file));
  if (!executablePath) throw new Error('Cài Chrome/Chromium hoặc chạy npx playwright install chromium.');
  return { chromium, executablePath };
}

export function startLocalServer({ cwd = repoRoot, dataDir } = {}) {
  const processEnv = dataDir ? { ...process.env, DDL_DATA_DIR: dataDir } : process.env;
  const child = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd, env: { ...processEnv, PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'inherit']
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const fail = (error) => { clearTimeout(timeout); child.kill(); reject(error); };
    const timeout = setTimeout(() => fail(new Error('Máy chủ local chưa trả về địa chỉ.')), 8000);
    child.once('error', fail);
    child.once('exit', (code) => fail(new Error(`Máy chủ local thoát với mã ${code}.`)));
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
      if (!url) return;
      clearTimeout(timeout);
      resolve({ url, close: () => child.kill() });
    });
  });
}
