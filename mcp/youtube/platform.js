/**
 * What differs by operating system, for the YouTube server (PLAN 44i-2a): the
 * hourly job that drains the upload queue, and the notification a drain shows
 * when an upload lands or fails.
 *
 * Why. The queue (44i-5) waits out YouTube's daily upload limit and quota by
 * saving the job and trying again later, and something has to run "later" when
 * no assistant is open. On the owner's Mac that was a LaunchAgent and the
 * notification was `osascript`, and both were the only way the server knew how:
 * on Linux or Windows, `install-agent` wrote a plist nobody reads and the queue
 * never drained. Lifted out for anyone, each system gets its own native
 * scheduler, the one a person on that system would reach for and can inspect
 * with its own tools: a LaunchAgent on macOS, a systemd user timer on Linux, a
 * Task Scheduler task on Windows. No package, no daemon of our own.
 *
 * How it is built, and why that way. `schedulePlan` is a pure function from the
 * platform and paths to the files to write and the commands to run; the server
 * carries the plan out. So the check can read all three systems' plans on any
 * machine (the cloud runs Linux, the owner's machines macOS, and nobody's CI
 * runs Windows), and only the host's own plan is ever executed, and even that
 * only without the check's switch. Every path in a command is passed as its own
 * argument, never spliced into a shell line, except where Task Scheduler
 * itself takes one command string (`/TR`), where each path is quoted.
 */

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/* systemd unit files split ExecStart on spaces and treat % and \ specially; a path with a space is quoted, % doubled. */
const unitQuote = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/%/g, '%%')}"`;
const join = (sep, ...p) => p.join(sep);

/**
 * The plan for one system. `label` names the job (reverse-DNS on macOS, a plain
 * name elsewhere is fine with the same string); `node` and `script` are absolute
 * paths; `log` is where the drain's output goes where the system can say so.
 */
export function schedulePlan({ platform, home, node, script, log, label }) {
  if (platform === 'darwin') {
    const dir = join('/', home, 'Library', 'LaunchAgents');
    const file = join('/', dir, `${label}.plist`);
    const text = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
      '<plist version="1.0">',
      '<dict>',
      `  <key>Label</key><string>${xmlEscape(label)}</string>`,
      '  <key>ProgramArguments</key>',
      '  <array>',
      `    <string>${xmlEscape(node)}</string>`,
      `    <string>${xmlEscape(script)}</string>`,
      '    <string>drain</string>',
      '  </array>',
      '  <key>StartInterval</key><integer>3600</integer>',
      '  <key>RunAtLoad</key><true/>',
      `  <key>StandardOutPath</key><string>${xmlEscape(log)}</string>`,
      `  <key>StandardErrorPath</key><string>${xmlEscape(log)}</string>`,
      '</dict>',
      '</plist>',
      '',
    ].join('\n');
    const target = `gui/${process.getuid?.() ?? 501}`;
    return {
      kind: 'LaunchAgent',
      dirs: [dir],
      files: [{ path: file, text }],
      install: [{ cmd: 'launchctl', args: ['bootout', target, file], mayFail: true }, { cmd: 'launchctl', args: ['bootstrap', target, file] }],
      uninstall: [{ cmd: 'launchctl', args: ['bootout', target, file], mayFail: true }],
    };
  }
  if (platform === 'linux') {
    const dir = join('/', home, '.config', 'systemd', 'user');
    const service = join('/', dir, `${label}.service`);
    const timer = join('/', dir, `${label}.timer`);
    return {
      kind: 'systemd user timer',
      dirs: [dir],
      files: [
        { path: service, text: ['[Unit]', 'Description=Upload queued YouTube videos whose wait has passed', '', '[Service]', 'Type=oneshot', `ExecStart=${unitQuote(node)} ${unitQuote(script)} drain`, `StandardOutput=append:${log}`, `StandardError=append:${log}`, ''].join('\n') },
        /* Persistent: a laptop asleep at the hour runs the missed drain when it wakes, like launchd's interval. */
        { path: timer, text: ['[Unit]', 'Description=Hourly drain of the YouTube upload queue', '', '[Timer]', 'OnBootSec=5min', 'OnUnitActiveSec=1h', 'Persistent=true', '', '[Install]', 'WantedBy=timers.target', ''].join('\n') },
      ],
      install: [{ cmd: 'systemctl', args: ['--user', 'daemon-reload'] }, { cmd: 'systemctl', args: ['--user', 'enable', '--now', `${label}.timer`] }],
      uninstall: [{ cmd: 'systemctl', args: ['--user', 'disable', '--now', `${label}.timer`], mayFail: true }, { cmd: 'systemctl', args: ['--user', 'daemon-reload'], mayFail: true }],
    };
  }
  if (platform === 'win32') {
    /* /TR is one command line Task Scheduler parses itself; each path quoted. Output is not redirectable
       here without a shell, so the drain's own log (it writes to stderr) is lost on Windows: the queue's
       state in uploads.json and upload_status are the record there. */
    return {
      kind: 'Task Scheduler task',
      dirs: [],
      files: [],
      install: [{ cmd: 'schtasks', args: ['/Create', '/F', '/SC', 'HOURLY', '/TN', label, '/TR', `"${node}" "${script}" drain`] }],
      uninstall: [{ cmd: 'schtasks', args: ['/Delete', '/F', '/TN', label], mayFail: true }],
    };
  }
  return null;
}

/**
 * The command that shows one notification, or null where there is none. The
 * message reaches the notifier as data, never as code: osascript and PowerShell
 * read it from an argument or the environment, not from inside the script text.
 */
export function notifyCommand(platform, title, message) {
  const clean = String(message).replace(/[\r\n]+/g, ' ').slice(0, 240);
  if (platform === 'darwin') {
    return { cmd: 'osascript', args: ['-e', 'on run argv', '-e', 'display notification (item 2 of argv) with title (item 1 of argv)', '-e', 'end run', title, clean] };
  }
  if (platform === 'linux') return { cmd: 'notify-send', args: [title, clean] };
  if (platform === 'win32') {
    const ps = 'Add-Type -AssemblyName System.Windows.Forms; $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(8000, $env:NOTE_TITLE, $env:NOTE_TEXT, 0); Start-Sleep -Seconds 9; $n.Dispose()';
    return { cmd: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', ps], env: { NOTE_TITLE: title, NOTE_TEXT: clean } };
  }
  return null;
}
