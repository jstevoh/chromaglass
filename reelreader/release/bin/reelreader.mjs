#!/usr/bin/env node
// The `reelreader` command: runs scripts/watch.mjs as if node had been handed
// it by name. watch.mjs starts a watch only when it is the file node was given
// (a harness that imports it must not start one), and under npx or a global
// install node is handed this file instead, through a link in a bin folder.
// So this file names watch.mjs as the command before loading it, by the same
// decoded path watch.mjs compares itself to.
import { fileURLToPath } from 'node:url';
process.argv[1] = fileURLToPath(new URL('../scripts/watch.mjs', import.meta.url));
await import('../scripts/watch.mjs');
