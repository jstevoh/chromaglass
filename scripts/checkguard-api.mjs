// The pull request as GitHub has it while checkguard runs in CI: its body (which gains
// sections after the run starts), its branch and its commits. Split out of checkguard.mjs
// to keep that file inside its size ceiling (scripts/sizes.json).

async function api(path) {
  const repo = process.env.GITHUB_REPOSITORY || 'jstevoh/chromaglass';
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'chromaglass-checkguard' };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${repo}/${path}`, { headers, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// The pull request's own commits (GitHub's list: in the head, not in the
// base), with how many there are counting merges, for the fetch's depth.
export async function prCommits(pr) {
  const all = [];
  for (let page = 1; page <= 3; page++) {
    const got = await api(`pulls/${pr}/commits?per_page=100&page=${page}`);
    all.push(...got);
    if (got.length < 100) break;
  }
  return { total: all.length, shas: all.filter((c) => (c.parents ?? []).length === 1).map((c) => c.sha) };
}

export async function livePr() {
  const pr = process.env.PR_NUMBER;
  if (!pr) return null;
  try {
    return await api(`pulls/${pr}`);
  } catch (e) {
    console.log(`(the pull request's body could not be read live, ${e.message}; using the one the run started with)`);
    return null;
  }
}
