#!/usr/bin/env bash
# Is the owner's Mac free of other work, before a deploy's shard runs there (PLAN.md 19ah-9)?
#
# What was reported: on 2026-11-08 two main deploys in a row went red on the
# owner's Mac (runs 42427960522 and 42436205976), and the same shards passed on
# GitHub's Macs. `npm run startup` failed "every pipeline it asked for ahead
# was built ahead ... nothing built behind it", the first run also "no
# pipeline was built on a frame" (particles), `phone` found port 4183 taken,
# and every other shard ran into its 20-minute timeout.
#
# What was measured, from the open shard's own lines: the opening's 65 builds
# took 11.86 and 17.99 s (median build 0.554 s, the display 6.77 s), against
# 3.43 s for 56 (median 0.186 s, the display 1.74 s) on the same Mac's first
# deploy of 2026-10-29, and 7.88 s on a GitHub Mac the day before. Three times
# slower than itself. The half built behind the show then ran past the 45 s
# startup waits for it, so the looks were changed while it was still building
# (the particles built on a frame). Every shard was slow the same way:
# setup-node alone took two to five minutes, and all five shards of a run
# that normally take nine to twelve each reached twenty. And the runner's own
# port step saw why: at 02:15Z other node processes on the Mac were serving
# `signin` and `tiers` on their harness ports (5281-5283, 9199, 5294), a
# session running checks by hand while the deploy ran. The owner's Mac is now
# shared with sessions and Antigravity's builds, which run the same harnesses:
# a Chromium drawing the plate in WebGPU, and the GPU is the one thing a
# deploy's timing checks cannot share.
#
# The probe (`macrunner.mjs`) can only ask GitHub whether the runner is idle;
# it cannot see what else the Mac is doing. So the shard asks here, on the
# Mac, before anything else: another test browser (Playwright's Chrome for
# Testing or headless shell) or the ChromaGlass app itself (a running show
# draws the plate at sixty frames a second; the app never throttles, so an
# open one always counts), or the desktop app a session drives by hand
# (`npm run desktop`'s bare Electron), working: its processes together
# at CPU_FLOOR percent of a core or more, as ps reads it. Not one that is this
# runner's or the other runner's own job (19ah-6: a process with the runner's
# worker among its ancestors is a deploy shard). The floor is for a browser
# a cancelled job left behind, reparented and idle: it holds no GPU time, and
# counted it would send every deploy to GitHub until someone killed it. A
# harness's vite server alone is not counted either: it is a port, which the
# port step after this one waits for, not GPU work. It waits up to
# two minutes for them to finish, since one harness by hand takes about that;
# then it fails, naming what it saw, and the watchdog (`macwatch.mjs`) starts
# the deploy again on GitHub's Macs and cancels this run, as it does for a
# Mac that went to sleep. The cancelled run reads as replaced, not red
# (`deploygate.sh`). The owner's own Chrome, Finder, editors and an idle
# Antigravity are not counted: none of them builds WebGPU pipelines.
#
# Why not wait longer, or just lengthen the timeouts: a session or a build
# queue runs check after check for an hour, so waiting rarely ends in a free
# Mac; and a longer timeout lets a starved shard finish slow, but its timing
# lines still read the other work's GPU, not the show's.
#
#   bash scripts/macbusy.sh [seconds]     (in CI, owner's Mac only: wait, then fail)
#   bash scripts/macbusy.sh --selftest    (the rule against made-up process lists)
set -uo pipefail
CPU_FLOOR=5

# Reads `pid ppid %cpu command` lines (ps -axwwo pid=,ppid=,%cpu=,command=:
# `ww`, or macOS's ps cuts the command at 79 columns with no terminal, and
# the app's GPU helper and a long home folder's browser path fall past the
# cut and read as free) and
# prints one line for each piece of other work: the topmost matching process
# of its tree, with the CPU of its matching processes added up, so a
# browser's dozen helpers are one line. $1 is a pid whose own tree is never
# counted (this script: its ps and awk carry the patterns in their arguments).
others() {
  awk -v self="${1:-0}" -v floor="$CPU_FLOOR" '
  {
    pid = $1; par[pid] = $2; cpu[pid] = $3 + 0
    $1 = ""; $2 = ""; $3 = ""; c = $0; sub(/^ +/, "", c); cmd[pid] = c; order[++n] = pid
  }
  function kind(c) {
    if (c ~ /Chrome for Testing|chrome-headless-shell|ms-playwright\/chromium/) return "a test browser"
    if (c ~ /\/ChromaGlass\.app\/Contents\/(MacOS\/ChromaGlass( |$)|Frameworks\/ChromaGlass Helper)/) return "the ChromaGlass app"
    if (c ~ /desktop\/node_modules\/electron\/dist\/Electron\.app\//) return "the desktop app by hand"
    return ""
  }
  function ours(p,   q, hops) {
    q = p
    for (hops = 0; q != "" && q != "0" && hops < 64; hops++) {
      if (q == self || cmd[q] ~ /Runner\.Worker/) return 1
      if (q == "1") return 0
      q = par[q]
    }
    return 0
  }
  function top(p,   hops) {
    for (hops = 0; hops < 64 && par[p] != "" && kind(cmd[par[p]]) != "" && par[p] != p; hops++) p = par[p]
    return p
  }
  END {
    for (i = 1; i <= n; i++) {
      p = order[i]
      if (kind(cmd[p]) == "" || ours(p)) continue
      t = top(p); sum[t] += cpu[p]; if (!(t in seen)) { seen[t] = 1; tops[++m] = t }
    }
    for (i = 1; i <= m; i++) {
      t = tops[i]
      if (sum[t] >= floor) printf "%s %s at %.0f%% of a core: %s\n", t, kind(cmd[t]), sum[t], substr(cmd[t], 1, 120)
    }
  }'
}

selftest() {
  local pass=0 fail=0
  expect() {
    local want="$1" what="$2" list="$3" got
    got=$(printf '%s\n' "$list" | others 999 | grep -c . || true)
    if [ "$got" = "$want" ]; then pass=$((pass + 1)); echo " ok   $what: $got"; else fail=$((fail + 1)); echo " FAIL $what: $got (wanted $want)"; fi
  }
  local PW='/Users/o/Library/Caches/ms-playwright/chromium-1187/chrome-mac/Google Chrome for Testing.app/Contents'
  local base="1 0 0.0 /sbin/launchd
300 1 1.2 /System/Library/CoreServices/Finder.app/Contents/MacOS/Finder
310 1 9.0 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
311 310 30.0 /Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper (GPU).app/Contents/MacOS/Google Chrome Helper (GPU) --type=gpu-process
320 1 12.0 /Applications/Antigravity.app/Contents/MacOS/Electron
400 1 0.1 /Users/o/actions-runner/bin/Runner.Listener run
401 400 0.5 /Users/o/actions-runner/bin/Runner.Worker spawnclient 103 106
402 401 0.0 /bin/bash -e /Users/o/actions-runner/_work/_temp/a.sh
999 402 0.0 bash scripts/macbusy.sh 120"
  expect 0 "only the owner's own Chrome and apps, the runner and this script" "$base"
  expect 1 "a session's harness by hand, its browser and helpers one line" "$base
500 320 0.0 /bin/zsh -c npm run phone
501 500 20.0 node scripts/phone.mjs
502 501 2.0 $PW/MacOS/Google Chrome for Testing --headless=new
503 502 25.0 $PW/Frameworks/Google Chrome for Testing Framework.framework/Helpers/Google Chrome for Testing Helper (GPU).app/Contents/MacOS/Google Chrome for Testing Helper (GPU) --type=gpu-process
504 502 40.0 $PW/Frameworks/Google Chrome for Testing Framework.framework/Helpers/Google Chrome for Testing Helper (Renderer).app/Contents/MacOS/Google Chrome for Testing Helper (Renderer) --type=renderer"
  expect 1 "a browser busy only in its helpers counts by their sum (2 + 2 + 2)" "$base
502 1 2.0 $PW/MacOS/Google Chrome for Testing
503 502 2.0 $PW/Frameworks/x/Google Chrome for Testing Helper (GPU) --type=gpu-process
504 502 2.0 $PW/Frameworks/x/Google Chrome for Testing Helper (Renderer) --type=renderer"
  expect 0 "a browser a cancelled job left behind, idle, does not" "$base
502 1 0.0 $PW/MacOS/Google Chrome for Testing
503 502 0.1 $PW/Frameworks/x/Google Chrome for Testing Helper (GPU) --type=gpu-process"
  expect 0 "a vite server alone is a port, not GPU work" "$base
510 1 3.0 node /Users/o/ag/chromaglass/node_modules/.bin/vite preview --port 5294 --strictPort"
  expect 1 "a headless shell (another harness's kind of browser)" "$base
511 1 30.0 /Users/o/Library/Caches/ms-playwright/chromium_headless_shell-1187/chrome-mac/chrome-headless-shell --headless"
  expect 1 "the desktop app a session drives by hand (npm run desktop's bare Electron)" "$base
530 501 4.0 /Users/o/chromaglass/desktop/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron /Users/o/chromaglass/desktop
531 530 30.0 /Users/o/chromaglass/desktop/node_modules/electron/dist/Electron.app/Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU) --type=gpu-process"
  expect 0 "Antigravity's own Electron is not it" "$base
540 1 30.0 /Applications/Antigravity.app/Contents/Frameworks/Electron Helper (GPU).app/Contents/MacOS/Electron Helper (GPU)"
  expect 1 "the ChromaGlass app playing a show, the work in its GPU helper" "$base
520 1 3.0 /Applications/ChromaGlass.app/Contents/MacOS/ChromaGlass
521 520 35.0 /Applications/ChromaGlass.app/Contents/Frameworks/ChromaGlass Helper (GPU).app/Contents/MacOS/ChromaGlass Helper (GPU) --type=gpu-process"
  expect 0 "the other runner's shard (19ah-6) is a deploy's own" "$base
600 1 0.1 /Users/o/actions-runner-2/bin/Runner.Listener run
601 600 0.5 /Users/o/actions-runner-2/bin/Runner.Worker spawnclient 103 106
602 601 0.0 /bin/bash -e /Users/o/actions-runner-2/_work/_temp/b.sh
603 602 20.0 node scripts/startup.mjs
605 603 60.0 $PW/MacOS/Google Chrome for Testing"
  expect 1 "a working browser whose parent is gone (reparented to launchd) still counts" "$base
700 1 50.0 $PW/MacOS/Google Chrome for Testing"
  expect 1 "a parent loop never hangs the walk" "$base
800 801 50.0 $PW/MacOS/Google Chrome for Testing
801 800 0.0 $PW/MacOS/Google Chrome for Testing"
  expect 0 "a run by hand never counts its own awk, whose arguments carry the patterns" "1 0 0.0 /sbin/launchd
998 1 0.0 -zsh
999 998 0.0 bash scripts/macbusy.sh --selftest
1001 999 50.0 awk -v self=999 { if (c ~ /Chrome for Testing|chrome-headless-shell/) return 1 }"
  # The way the shard reads it, ps and awk side by side, end to end: nothing
  # of its own counted. Its awk reads under the floor here, so the case above
  # (awk at 50%) is what holds the walk to this script's pid. (Measure's
  # ubuntu machine runs no test browser; on a Mac with one working by hand
  # this line is rightly not 0.)
  local real; real=$(ps -axwwo pid=,ppid=,%cpu=,command= | others $$ | grep -c . || true)
  if [ "$real" = 0 ]; then pass=$((pass + 1)); echo " ok   this machine's own list, read as the shard reads it, never counts its own awk: 0"; else fail=$((fail + 1)); echo " FAIL this machine's own list counted $real (wanted 0): $(ps -axwwo pid=,ppid=,%cpu=,command= | others $$ | head -3)"; fi
  echo "$pass passed, $fail failed"
  [ "$fail" = 0 ]
}

if [ "${1:-}" = --selftest ]; then selftest; exit; fi

limit="${1:-120}"
waited=0
while :; do
  now=$(ps -axwwo pid=,ppid=,%cpu=,command= | others $$)
  [ -z "$now" ] && { echo "the owner's Mac is free of other work after ${waited}s"; exit 0; }
  if [ "$waited" -ge "$limit" ]; then
    echo "::error title=The owner's Mac is busy::after ${waited}s other work on the owner's Mac still draws with its GPU (listed below); the watchdog starts this deploy again on GitHub's Macs (docs/mac-runner.md)"
    echo "$now"
    exit 1
  fi
  [ "$waited" -eq 0 ] && { echo "waiting for other work on the owner's Mac to finish:"; echo "$now"; }
  sleep 10
  waited=$((waited + 10))
done
