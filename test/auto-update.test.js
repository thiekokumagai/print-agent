// Testes do auto-update silencioso (node:test, sem dependências).
const test = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createAutoUpdate } = require('../auto-update');

const ROOT = path.join(__dirname, '..');

function setup({ busy = false, beforeInstall } = {}) {
  const autoUpdater = new EventEmitter();
  autoUpdater.installs = [];
  autoUpdater.checks = 0;
  autoUpdater.quitAndInstall = (...args) => autoUpdater.installs.push(args);
  autoUpdater.checkForUpdates = () => {
    autoUpdater.checks += 1;
    return Promise.resolve();
  };
  const app = { isPackaged: true, getVersion: () => '1.0.0' };
  const state = { busy };
  const timers = [];
  const notes = [];
  const updater = createAutoUpdate({
    autoUpdater,
    app,
    isBusy: () => state.busy,
    beforeInstall,
    notify: (title, content) => notes.push({ title, content }),
    log: { log() {}, error() {} },
    setTimeoutFn: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  });
  return { autoUpdater, app, state, timers, notes, updater };
}

test('mantém download automático e instalação ao fechar', () => {
  const { autoUpdater } = setup();
  assert.strictEqual(autoUpdater.autoDownload, true);
  assert.strictEqual(autoUpdater.autoInstallOnAppQuit, true);
});

test('ocioso: instala sozinho, silencioso e reabrindo o app', async () => {
  const { autoUpdater, app } = setup();
  autoUpdater.emit('update-available', { version: '9.9.9' });
  await autoUpdater.listeners('update-downloaded')[0]({ version: '9.9.9' });
  assert.deepStrictEqual(autoUpdater.installs, [[true, true]]);
  assert.strictEqual(app.isQuiting, true);
});

test('ocupado: espera e só instala quando fica ocioso', async () => {
  const { autoUpdater, state, timers } = setup({ busy: true });
  await autoUpdater.listeners('update-downloaded')[0]({ version: '9.9.9' });
  assert.strictEqual(autoUpdater.installs.length, 0);
  assert.strictEqual(timers.length, 1);
  assert.strictEqual(timers[0].ms, 30000);

  await timers.shift().fn();
  assert.strictEqual(autoUpdater.installs.length, 0);
  assert.strictEqual(timers.length, 1);

  state.busy = false;
  await timers.shift().fn();
  assert.deepStrictEqual(autoUpdater.installs, [[true, true]]);
  assert.strictEqual(timers.length, 0);
});

test('roda beforeInstall antes de instalar, e instala mesmo se ele falhar', async () => {
  const order = [];
  const ok = setup({ beforeInstall: async () => order.push('before') });
  ok.autoUpdater.quitAndInstall = () => order.push('install');
  await ok.autoUpdater.listeners('update-downloaded')[0]({ version: '9.9.9' });
  assert.deepStrictEqual(order, ['before', 'install']);

  const bad = setup({ beforeInstall: async () => { throw new Error('x'); } });
  await bad.autoUpdater.listeners('update-downloaded')[0]({ version: '9.9.9' });
  assert.strictEqual(bad.autoUpdater.installs.length, 1);
});

test('download repetido não instala duas vezes', async () => {
  const { autoUpdater } = setup();
  await autoUpdater.listeners('update-downloaded')[0]({ version: '9.9.9' });
  await autoUpdater.listeners('update-downloaded')[0]({ version: '9.9.9' });
  assert.strictEqual(autoUpdater.installs.length, 1);
});

test('erro não instala e só avisa quando a checagem foi manual', () => {
  const { autoUpdater, notes, updater } = setup();
  autoUpdater.emit('error', new Error('offline'));
  assert.strictEqual(notes.length, 0);
  updater.check(true);
  autoUpdater.emit('error', new Error('offline'));
  assert.strictEqual(notes.length, 1);
  assert.strictEqual(autoUpdater.installs.length, 0);
});

test('fora do .exe não checa atualização', () => {
  const { autoUpdater, app, updater } = setup();
  app.isPackaged = false;
  updater.check(false);
  assert.strictEqual(autoUpdater.checks, 0);
});

test('nenhuma caixa modal no fluxo de atualização', () => {
  const main = fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8');
  assert.doesNotMatch(main, /autoUpdater\.on\(/);
  assert.doesNotMatch(main, /isManualUpdateCheck/);
  const mod = fs.readFileSync(path.join(ROOT, 'auto-update.js'), 'utf8');
  assert.doesNotMatch(mod, /dialog|showMessageBox/);
});

test("checa atualização a cada 20 minutos e também logo ao abrir o app", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "main.js"), "utf8");
  const m = src.match(/const UPDATE_CHECK_INTERVAL_MS = ([^;]+);/);
  assert.ok(m, "constante UPDATE_CHECK_INTERVAL_MS não encontrada");
  assert.strictEqual(Function(`return (${m[1]})`)(), 20 * 60 * 1000);
  assert.match(src, /setInterval\(\(\) => checkForUpdates\(false\), UPDATE_CHECK_INTERVAL_MS\)/);
  assert.match(src, /setTimeout\(\(\) => checkForUpdates\(false\), 10000\)/);
});
