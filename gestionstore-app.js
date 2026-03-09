#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync, spawn } = require('child_process');

const ACTION = (process.argv[2] || 'start').toLowerCase();
if (!['start', 'stop'].includes(ACTION)) {
  console.error('Usage: node gestionstore-app.js <start|stop>');
  process.exit(1);
}

const ROOT = __dirname;
const BACKEND_DIR = path.join(ROOT, 'backend');
const FRONTEND_DIR = path.join(ROOT, 'frontend');
const BACKEND_ENV = path.join(BACKEND_DIR, '.env');
const BACKEND_ENV_EXAMPLE = path.join(BACKEND_DIR, '.env.example');
const PID_FILE = path.join(ROOT, '.gestionstore-processes.json');

function info(msg) {
  console.log(`[INFO] ${msg}`);
}

function ok(msg) {
  console.log(`[OK] ${msg}`);
}

function warn(msg) {
  console.warn(`[WARN] ${msg}`);
}

function hasCmd(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  const r = spawnSync(checker, [command], { stdio: 'ignore' });
  return r.status === 0;
}

function run(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd || ROOT,
    stdio: opts.stdio || 'inherit',
    env: { ...process.env, ...(opts.env || {}) },
    shell: !!opts.shell,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
  }
  return result;
}

function runCapture(command, args, opts = {}) {
  const result = spawnSync(command, args, {
    cwd: opts.cwd || ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status})`);
  }
  return (result.stdout || '').trim();
}

function installWithBestEffort(toolName) {
  const platform = process.platform;

  if (platform === 'win32' && hasCmd('winget')) {
    const id = toolName === 'node'
      ? 'OpenJS.NodeJS.LTS'
      : 'PostgreSQL.PostgreSQL';
    info(`Installation de ${toolName} via winget...`);
    run('winget', [
      'install',
      '--id',
      id,
      '-e',
      '--silent',
      '--accept-source-agreements',
      '--accept-package-agreements',
    ]);
    return;
  }

  if (platform === 'darwin' && hasCmd('brew')) {
    info(`Installation de ${toolName} via brew...`);
    run('brew', ['install', toolName === 'node' ? 'node' : 'postgresql@16']);
    return;
  }

  if (platform === 'linux') {
    if (hasCmd('apt-get')) {
      info(`Installation de ${toolName} via apt-get...`);
      run('sudo', ['apt-get', 'update']);
      if (toolName === 'node') {
        run('sudo', ['apt-get', 'install', '-y', 'nodejs', 'npm']);
      } else {
        run('sudo', ['apt-get', 'install', '-y', 'postgresql-client']);
      }
      return;
    }
    if (hasCmd('dnf')) {
      info(`Installation de ${toolName} via dnf...`);
      if (toolName === 'node') {
        run('sudo', ['dnf', 'install', '-y', 'nodejs', 'npm']);
      } else {
        run('sudo', ['dnf', 'install', '-y', 'postgresql']);
      }
      return;
    }
  }

  throw new Error(
    `Impossible d'installer automatiquement ${toolName}. Installe-le manuellement puis relance.`
  );
}

function ensurePrereqs() {
  if (!hasCmd('node')) {
    installWithBestEffort('node');
  }
  if (!hasCmd('npm')) {
    throw new Error('npm introuvable.');
  }
  if (!hasCmd('psql')) {
    installWithBestEffort('psql');
  }
  if (!hasCmd('psql')) {
    throw new Error('psql introuvable après installation.');
  }
  ok('Prerequis verifies.');
}

function ensureEnv() {
  if (!fs.existsSync(BACKEND_ENV)) {
    if (!fs.existsSync(BACKEND_ENV_EXAMPLE)) {
      throw new Error('backend/.env manquant et backend/.env.example introuvable.');
    }
    fs.copyFileSync(BACKEND_ENV_EXAMPLE, BACKEND_ENV);
    ok('backend/.env crée depuis .env.example');
  }
}

function parseDatabaseUrl() {
  const envContent = fs.readFileSync(BACKEND_ENV, 'utf8');
  const m = envContent.match(/^\s*DATABASE_URL=(.+)$/m);
  if (!m) {
    throw new Error('DATABASE_URL introuvable dans backend/.env');
  }

  let raw = m[1].trim();
  if (
    (raw.startsWith('"') && raw.endsWith('"')) ||
    (raw.startsWith("'") && raw.endsWith("'"))
  ) {
    raw = raw.slice(1, -1);
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('DATABASE_URL invalide.');
  }

  const dbName = decodeURIComponent(url.pathname.replace(/^\//, '')).split('?')[0];
  if (!dbName) {
    throw new Error('Nom de base invalide dans DATABASE_URL.');
  }

  return {
    dbName,
    host: url.hostname || 'localhost',
    port: url.port || '5432',
    user: decodeURIComponent(url.username || ''),
    password: decodeURIComponent(url.password || ''),
  };
}

function ensureNodeModules() {
  if (!fs.existsSync(path.join(FRONTEND_DIR, 'node_modules'))) {
    info('Installation dependances frontend...');
    run('npm', ['install'], { cwd: FRONTEND_DIR });
  }
  if (!fs.existsSync(path.join(BACKEND_DIR, 'node_modules'))) {
    info('Installation dependances backend...');
    run('npm', ['install'], { cwd: BACKEND_DIR });
  }
  ok('Dependances npm pretes.');
}

function ensureDatabase(db) {
  const env = { PGPASSWORD: db.password };

  let exists = '';
  try {
    exists = runCapture(
      'psql',
      [
        '-h',
        db.host,
        '-p',
        String(db.port),
        '-U',
        db.user,
        '-d',
        'postgres',
        '-t',
        '-A',
        '-c',
        `SELECT 1 FROM pg_database WHERE datname='${db.dbName.replace(/'/g, "''")}';`,
      ],
      { env }
    );
  } catch (e) {
    throw new Error(`Connexion PostgreSQL impossible (${e.message}).`);
  }

  if (exists.trim() !== '1') {
    info(`Creation base '${db.dbName}'...`);
    run(
      'psql',
      [
        '-h',
        db.host,
        '-p',
        String(db.port),
        '-U',
        db.user,
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-c',
        `CREATE DATABASE "${db.dbName.replace(/"/g, '""')}";`,
      ],
      { env }
    );
    ok(`Base '${db.dbName}' creee.`);
  } else {
    ok(`Base '${db.dbName}' deja presente.`);
  }
}

function runPrismaPushAndSeed() {
  info('npx prisma db push...');
  run('npx', ['prisma', 'db', 'push'], { cwd: BACKEND_DIR });
  info('npm run db:seed...');
  run('npm', ['run', 'db:seed'], { cwd: BACKEND_DIR });
}

function spawnService({ cwd, command, args, detached = true, hiddenOnWindows = true }) {
  let child;

  if (process.platform === 'win32') {
    child = spawn(command, args, {
      cwd,
      detached,
      stdio: 'ignore',
      windowsHide: hiddenOnWindows,
    });
  } else {
    child = spawn(command, args, {
      cwd,
      detached,
      stdio: 'ignore',
    });
  }

  child.unref();
  return child.pid;
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch {
    warn(`Ouverture auto du navigateur impossible. Ouvre ${url} manuellement.`);
  }
}

function start() {
  ensurePrereqs();
  ensureEnv();
  ensureNodeModules();

  const db = parseDatabaseUrl();
  ensureDatabase(db);

  runPrismaPushAndSeed();

  info('Demarrage backend...');
  const backendPid = spawnService({
    cwd: BACKEND_DIR,
    command: 'npm',
    args: ['run', 'dev'],
  });

  info('Demarrage frontend...');
  const frontendPid = spawnService({
    cwd: FRONTEND_DIR,
    command: 'npm',
    args: ['run', 'dev', '--', '--host', '0.0.0.0'],
  });

  const state = {
    platform: os.platform(),
    backendPid,
    frontendPid,
    startedAt: new Date().toISOString(),
  };
  fs.writeFileSync(PID_FILE, JSON.stringify(state, null, 2), 'utf8');

  openBrowser('http://localhost:5173');
  ok('Application lancee.');
  console.log('Frontend: http://localhost:5173');
  console.log('Backend : http://localhost:3001');
}

function killPid(pid) {
  if (!pid || Number.isNaN(Number(pid))) {
    return false;
  }
  try {
    process.kill(Number(pid), 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function stop() {
  let stopped = false;

  if (fs.existsSync(PID_FILE)) {
    try {
      const raw = fs.readFileSync(PID_FILE, 'utf8').replace(/^\uFEFF/, '');
      const state = JSON.parse(raw);
      const backendPid = state.backendPid || state.backendCmdPid;
      const frontendPid = state.frontendPid || state.frontendCmdPid;
      stopped = killPid(backendPid) || stopped;
      stopped = killPid(frontendPid) || stopped;
    } catch {
      warn('Fichier PID invalide.');
    }
    try {
      fs.unlinkSync(PID_FILE);
    } catch {
      // ignore
    }
  }

  if (!stopped) {
    warn('Aucun processus trouve via PID file. Arret manuel peut etre necessaire.');
  } else {
    ok('Services arretes.');
  }
}

try {
  if (ACTION === 'stop') {
    stop();
  } else {
    start();
  }
} catch (e) {
  console.error(`[ERROR] ${e.message || e}`);
  process.exit(1);
}
