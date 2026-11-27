#!/usr/bin/env bash
# Install the weekly mutation run on the owner's Mac (PLAN.md 50i): a copy of
# scripts/mutate-weekly.sh in ~/cg-scratch/bin and a launchd job that starts
# it on Sundays at 03:30 (a Mac asleep then runs it when it wakes). Run from
# the repository: `bash scripts/mutate-install.sh`. Again to update; with
# `--remove` to take it off. The report: ~/cg-scratch/mutate/latest.md.
set -euo pipefail
label=art.chromaglass.mutate
plist="$HOME/Library/LaunchAgents/$label.plist"
if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$plist" "$HOME/cg-scratch/bin/mutate-weekly.sh"
  echo "removed $label"; exit 0
fi
here=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$HOME/cg-scratch/bin" "$HOME/cg-scratch/mutate" "$HOME/Library/LaunchAgents"
test -f "$HOME/cg-scratch/bin/maclock.mjs" || cp "$here/scripts/maclock.mjs" "$HOME/cg-scratch/bin/maclock.mjs"
cp "$here/scripts/mutate-weekly.sh" "$HOME/cg-scratch/bin/mutate-weekly.sh"
chmod +x "$HOME/cg-scratch/bin/mutate-weekly.sh"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$HOME/cg-scratch/bin/mutate-weekly.sh</string></array>
  <key>EnvironmentVariables</key>
  <dict><key>CG_REPO</key><string>$here</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>3</integer><key>Minute</key><integer>30</integer></dict>
  <key>StandardOutPath</key><string>$HOME/cg-scratch/mutate/run.log</string>
  <key>StandardErrorPath</key><string>$HOME/cg-scratch/mutate/run.log</string>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "installed $label: Sundays 03:30, report ~/cg-scratch/mutate/latest.md"
