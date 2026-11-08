#!/usr/bin/env node
/**
 * Builds the macOS Syphon native add-on (`build/syphon.node`) from Objective-C++
 * (`syphon_addon.mm`) and the vendored official Syphon framework sources
 * (`vendor/Syphon.framework/`, BSD 3-Clause).
 *
 * Uses Node-API (`<node_api.h>`), which is ABI-stable across Node and Electron
 * without downloading external header tarballs. No-op off macOS.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'darwin') {
  process.exit(0);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(HERE, 'vendor');
const FW = join(VENDOR, 'Syphon.framework');
const HEADERS = join(FW, 'Headers');
const SRC = join(FW, 'src');
const BUILD = join(HERE, 'build');
const OUT = join(BUILD, 'syphon.node');

function findNodeInclude() {
  const candidates = [
    join( resolve(dirname(process.execPath), '..'), 'include', 'node'),
    '/opt/homebrew/include/node',
    '/usr/local/include/node',
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'node_api.h'))) return dir;
  }
  throw new Error(`Could not locate node_api.h in ${candidates.join(', ')}`);
}

const nodeInclude = findNodeInclude();
mkdirSync(BUILD, { recursive: true });
const objDir = join(BUILD, 'obj');
rmSync(objDir, { recursive: true, force: true });
mkdirSync(objDir, { recursive: true });

const arch = process.arch === 'x64' ? 'x86_64' : 'arm64';
const commonFlags = [
  '-arch', arch,
  '-O2',
  '-fPIC',
  '-mmacosx-version-min=11.0',
  `-F${VENDOR}`,
  `-I${HEADERS}`,
  `-I${SRC}`,
  `-I${nodeInclude}`,
];

const pch = join(SRC, 'Syphon_Prefix.pch');

const cFiles = ['SyphonDispatch.c'];
const objcFiles = [
  'SyphonServerBase.m',
  'SyphonMetalServer.m',
  'SyphonServerRendererMetal.m',
  'SyphonServerConnectionManager.m',
  'SyphonPrivate.m',
  'SyphonMessaging.m',
  'SyphonMessageSender.m',
  'SyphonMessageReceiver.m',
  'SyphonCFMessageSender.m',
  'SyphonCFMessageReceiver.m',
  'SyphonMessageQueue.m',
  'SyphonServerDirectory.m',
  'SyphonClientBase.m',
  'SyphonClientConnectionManager.m',
  'SyphonMetalClient.m',
];

const objects = [];

for (const file of cFiles) {
  const srcPath = join(SRC, file);
  const objPath = join(objDir, `${file}.o`);
  const r = spawnSync('clang', [...commonFlags, '-c', srcPath, '-o', objPath], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  objects.push(objPath);
}

for (const file of objcFiles) {
  const srcPath = join(SRC, file);
  const objPath = join(objDir, `${file}.o`);
  const r = spawnSync('clang', [
    ...commonFlags,
    '-fobjc-arc',
    '-Wno-deprecated-declarations',
    '-include', pch,
    '-c', srcPath,
    '-o', objPath,
  ], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  objects.push(objPath);
}

const addonObj = join(objDir, 'syphon_addon.mm.o');
{
  const r = spawnSync('clang++', [
    ...commonFlags,
    '-std=c++17',
    '-fobjc-arc',
    '-Wno-deprecated-declarations',
    '-include', pch,
    '-c', join(HERE, 'syphon_addon.mm'),
    '-o', addonObj,
  ], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  objects.push(addonObj);
}

{
  const r = spawnSync('clang++', [
    '-arch', arch,
    '-bundle',
    '-undefined', 'dynamic_lookup',
    '-mmacosx-version-min=11.0',
    ...objects,
    '-framework', 'Cocoa',
    '-framework', 'Metal',
    '-framework', 'IOSurface',
    '-framework', 'QuartzCore',
    '-framework', 'CoreFoundation',
    '-o', OUT,
  ], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

rmSync(objDir, { recursive: true, force: true });
