/**
 * The words around a video, for `npm run youtube` (PLAN 44i-2b): captions,
 * chapters, the credits line and the other languages. A module of
 * scripts/youtube.mjs, which is past 40 KB, so this part lives beside it: the
 * stand-in Google's caption routes, and the scenario's lines for these rules.
 *
 * What it holds, each read from what the stand-in received or stored, never
 * from what the server says it did:
 *
 *  - the credits line from settings.json ends every new upload's description,
 *    with the piece's title filled in where the line says `{music}`, once;
 *    an upload under such a line with no music is refused before anything is
 *    sent; a replacement finds the piece in the old description and does not
 *    add the line a second time.
 *  - chapters go into the description as YouTube reads them, and a list
 *    YouTube would not make into chapters (not from 0:00, fewer than three,
 *    one under ten seconds, the last too near the end) is refused with
 *    nothing queued; an update's new list replaces the old one.
 *  - a caption file named at upload is sent once the video is up, as one
 *    multipart request carrying the file byte for byte and its language; a
 *    file with no cue is refused at the call; `add_captions` adds one later.
 *  - titles in other languages reach the video (the upload names the part
 *    they ride in), need the video's own language before anything is sent,
 *    and an update keeps the languages it does not name.
 *  - an upload card beside the file carries all of these, its caption file
 *    found beside the card.
 */
import { copyFileSync, mkdirSync, readFileSync, realpathSync, truncateSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await sleep(50); } return false; };

/** The stand-in's `captions` routes. Returns true when it answered the request. */
export async function captionRoutes(g, req, res, p, q, { json, err, body }) {
  g.captions ??= [];
  if (p === '/upload/youtube/v3/captions' && req.method === 'POST') {
    const b = await body(req);
    if (q.get('uploadType') !== 'multipart') { err(res, 400, 'badRequest', 'Upload requests must include an uploadType URL parameter'); return true; }
    if (q.get('part') !== 'snippet') { err(res, 400, 'missingRequiredParameter', 'part'); return true; }
    const boundary = /boundary=([^;]+)/.exec(req.headers['content-type'] ?? '')?.[1];
    if (!boundary || !/^multipart\/related/.test(req.headers['content-type'])) { err(res, 400, 'badContent', 'multipart/related expected'); return true; }
    const parts = [];
    const sep = Buffer.from(`--${boundary}`);
    let at = b.indexOf(sep);
    while (at >= 0) {
      const next = b.indexOf(sep, at + sep.length);
      if (next < 0) break;
      const chunk = b.subarray(at + sep.length, next);
      const split = chunk.indexOf('\r\n\r\n');
      if (split >= 0) parts.push({ head: chunk.subarray(0, split).toString(), data: chunk.subarray(split + 4, chunk.length - 2) });
      at = next;
    }
    let meta = null;
    try { meta = JSON.parse(parts[0]?.data.toString() ?? ''); } catch { /* none */ }
    const s = meta?.snippet;
    if (!s || parts.length !== 2) { err(res, 400, 'invalidMetadata', 'snippet and the file expected'); return true; }
    if (!g.videos.has(s.videoId)) { err(res, 404, 'videoNotFound', s.videoId); return true; }
    if (!s.language) { err(res, 400, 'invalidValue', 'snippet.language'); return true; }
    const id = `cap${g.captions.length + 1}`;
    g.captions.push({ id, videoId: s.videoId, language: s.language, name: s.name, isDraft: s.isDraft, bytes: parts[1].data });
    json(res, 200, { id, snippet: { ...s, trackKind: 'standard', status: 'serving' } });
    return true;
  }
  if (p === '/youtube/v3/captions' && req.method === 'GET') {
    json(res, 200, { items: g.captions.filter((c) => c.videoId === q.get('videoId')).map((c) => ({ id: c.id, snippet: { videoId: c.videoId, language: c.language, name: c.name, isDraft: c.isDraft, trackKind: 'standard', status: 'serving' } })) });
    return true;
  }
  return false;
}

const SRT = '1\n00:00:01,000 --> 00:00:04,000\nThe dish fills\n\n2\n00:00:05,000 --> 00:00:09,000\nand the oil breaks into beads\n';
const VTT = 'WEBVTT\n\n00:01.000 --> 00:04.000\nLa placa se llena\n';
const CREDITS = '{music} by Test Artist – released under CC BY 4.0. example.org';

export async function textScenario({ server, start, env, conf, dir, g, line, logs, chunk }) {
  const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return {}; } };
  // Its own folder, signed in with the scenario's key, with a credits line in its settings.
  const tconf = join(dir, 'conf-text');
  mkdirSync(tconf, { recursive: true, mode: 0o700 });
  for (const f of ['client_secret.json', 'token.json']) copyFileSync(join(conf, f), join(tconf, f));
  writeFileSync(join(tconf, 'settings.json'), JSON.stringify({ timeZone: 'America/Los_Angeles', categoryId: '10', credits: CREDITS }));
  const jobs = () => readJson(join(tconf, 'uploads.json')).jobs ?? [];
  const film = (name) => { const f = join(dir, name); writeFileSync(f, randomBytes(chunk)); return f; };
  const text = (name, t) => { const f = join(dir, name); writeFileSync(f, t); return f; };
  const s = start(server, { ...env, CHROMAGLASS_YOUTUBE_DIR: tconf });
  logs.push(s.out);
  await s.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check', version: '1' } });
  const credit = (music) => CREDITS.replace('{music}', music);
  const count = (hay, needle) => hay.split(needle).length - 1;
  const videoOf = (title) => [...g.videos.values()].find((v) => v.snippet.title === title);

  // An upload with chapters, a piece of music, a caption file and Spanish words.
  const srt = text('dawn.en.srt', SRT);
  const u1 = await s.tool('upload_video', {
    file: film('dawn.mp4'), title: 'Slow Dawn', description: 'Filmed in one take.', music: 'Unraveling', language: 'en',
    chapters: ['0:00 The dish fills', '1:00 Oil', { at: 125, title: 'Beads' }],
    captions: [{ file: srt, name: 'English' }],
    localizations: { es: { title: 'Amanecer lento', description: 'Filmado en una toma.' } },
  });
  await until(() => videoOf('Slow Dawn') && (g.captions ?? []).some((c) => c.videoId === videoOf('Slow Dawn').id), 8000);
  const v1 = videoOf('Slow Dawn');
  const want = `Filmed in one take.\n\n0:00 The dish fills\n1:00 Oil\n2:05 Beads\n\n${credit('Unraveling')}`;
  const d1 = v1?.snippet?.description ?? '';
  line('credits', 'the credits line from settings.json ends a new upload\'s description once, with the piece named by music filled in',
    !u1.error && d1.endsWith(credit('Unraveling')) && count(d1, 'Test Artist') === 1, `${u1.error ? u1.text : JSON.stringify(d1)}`);
  line('chapters', 'chapters go into the description as YouTube writes them (0:00, 1:00, 2:05), between the text and the credits', d1 === want, JSON.stringify(d1));
  const cap1 = (g.captions ?? []).find((c) => c.videoId === v1?.id);
  line('captions', 'a caption file named at upload is sent once the video is up: multipart, its language from the upload, the file byte for byte',
    cap1?.language === 'en' && cap1?.name === 'English' && cap1?.bytes?.equals(readFileSync(srt)), `caption ${cap1 ? `${cap1.language} ${cap1.bytes.length} B` : 'none'}`);
  line('localizations', 'Spanish title and description reach the video, the description with the same chapters and credits',
    v1?.localizations?.es?.title === 'Amanecer lento' && v1.localizations.es.description === `Filmado en una toma.\n\n0:00 The dish fills\n1:00 Oil\n2:05 Beads\n\n${credit('Unraveling')}`,
    JSON.stringify(v1?.localizations ?? null));

  // What is refused at the call, with nothing sent and nothing queued.
  const jobs0 = jobs().length, starts0 = g.startCalls;
  const noMusic = await s.tool('upload_video', { file: film('nomusic.mp4'), title: 'No Music Named' });
  line('creditsNeedMusic', 'under a credits line with {music}, an upload naming no music is refused before anything is sent',
    noMusic.error && /music/.test(noMusic.text) && g.startCalls === starts0 && jobs().length === jobs0, noMusic.text.slice(0, 120));
  const bad = [
    await s.tool('queue_upload', { file: film('c1.mp4'), title: 'C1', credits: false, chapters: ['0:05 a', '1:00 b', '2:00 c'] }),
    await s.tool('queue_upload', { file: film('c2.mp4'), title: 'C2', credits: false, chapters: ['0:00 a', '1:00 b'] }),
    await s.tool('queue_upload', { file: film('c3.mp4'), title: 'C3', credits: false, chapters: ['0:00 a', '0:05 b', '2:00 c'] }),
  ];
  line('chapterRules', 'a chapter list YouTube would not make chapters of (not from 0:00, two, a five-second one) is refused with nothing queued',
    bad.every((b) => b.error) && /0:00/.test(bad[0].text) && /three/.test(bad[1].text) && /ten seconds/.test(bad[2].text) && jobs().length === jobs0, bad.map((b) => b.text.slice(0, 60)).join(' | '));
  const noCue = await s.tool('queue_upload', { file: film('c4.mp4'), title: 'C4', credits: false, language: 'en', captions: [text('empty.srt', 'just words, no timings\n')] });
  const notCaption = await s.tool('queue_upload', { file: film('c5.mp4'), title: 'C5', credits: false, language: 'en', captions: [text('words.txt', SRT)] });
  const noLang = await s.tool('queue_upload', { file: film('c6.mp4'), title: 'C6', credits: false, captions: [srt] });
  const capCase = async (name, bytes) => { const f = join(dir, name); writeFileSync(f, bytes); return s.tool('queue_upload', { file: film(`${name}.mp4`), title: name, credits: false, language: 'en', captions: [f] }); };
  const vttNoHead = await capCase('nohead.vtt', VTT.replace('WEBVTT\n\n', ''));
  const vttNoCue = await capCase('nocue.vtt', 'WEBVTT\n\nNOTE only a note\n');
  const latin1 = await capCase('latin1.srt', Buffer.concat([Buffer.from(SRT), Buffer.from([0x43, 0x61, 0x66, 0xe9, 0x0a])]));
  const huge = join(dir, 'huge.srt');
  writeFileSync(huge, SRT); truncateSync(huge, 101 * 1024 * 1024); // sparse: nothing written past the cues
  const tooBig = await s.tool('queue_upload', { file: film('huge.mp4'), title: 'Huge', credits: false, language: 'en', captions: [huge] });
  const capBad = [noCue, notCaption, noLang, vttNoHead, vttNoCue, latin1, tooBig];
  line('captionFiles', 'caption files refused with nothing queued: an .srt with no cue, a .txt, no language, a .vtt with no WEBVTT header, a .vtt with no cue, Latin-1 bytes, 101 MB',
    noCue.error && /cue/.test(noCue.text) && notCaption.error && /\.srt/.test(notCaption.text) && noLang.error && /language/.test(noLang.text)
    && vttNoHead.error && /WEBVTT/.test(vttNoHead.text) && vttNoCue.error && /cue/.test(vttNoCue.text) && latin1.error && /UTF-8/.test(latin1.text) && tooBig.error && /100 MB/.test(tooBig.text)
    && jobs().length === jobs0,
    capBad.map((b) => `${b.error ? 'refused' : 'TAKEN'}: ${b.text.slice(0, 50)}`).join(' | '));
  const noDefault = await s.tool('upload_video', { file: film('c7.mp4'), title: 'C7', credits: false, localizations: { fr: { title: 'Aube' } } });
  line('localizationsLanguage', 'titles in other languages without the video\'s own language are refused before anything is sent',
    noDefault.error && /language/.test(noDefault.text) && g.startCalls === starts0 && jobs().length === jobs0, noDefault.text.slice(0, 120));

  // YouTube's limits, judged at the call: < or >, 5,000 bytes once chapters and credits are in, 100-character titles.
  const updates0 = g.updates;
  const lim = [
    await s.tool('upload_video', { file: film('l1.mp4'), title: 'L1', credits: false, description: 'A <b>bold</b> film' }),
    await s.tool('upload_video', { file: film('l2.mp4'), title: 'L2', music: 'Penumbra', description: 'x'.repeat(4950) }),
    await s.tool('upload_video', { file: film('l3.mp4'), title: 'L3', credits: false, language: 'en', localizations: { es: { title: 'e'.repeat(101) } } }),
    await s.tool('update_video', { video_id: v1?.id, title: 'Dawn > Dusk' }),
  ];
  line('limits', 'refused before anything is sent: < or > in a description, a description past 5,000 bytes only once its credits are added, a 101-character Spanish title, > in an updated title',
    lim.every((b) => b.error) && /< or >/.test(lim[0].text) && /5000/.test(lim[1].text) && /100/.test(lim[2].text) && /< or >/.test(lim[3].text)
    && g.startCalls === starts0 && g.updates === updates0 && jobs().length === jobs0,
    lim.map((b) => `${b.error ? 'refused' : 'TAKEN'}: ${b.text.slice(0, 50)}`).join(' | '));

  // credits: false means none, and a later Spanish title on that video asks for no music.
  const plain = await s.tool('upload_video', { file: film('plain.mp4'), title: 'Plain Film', credits: false, language: 'en', description: 'Plain.' });
  await until(() => videoOf('Plain Film'), 5000);
  const vp = videoOf('Plain Film');
  const plainEs = await s.tool('update_video', { video_id: vp?.id, localizations: { es: { title: 'Película simple' } } });
  line('creditsFalse', 'credits: false uploads the description exactly as given, and adding a Spanish title to it later asks for no music',
    !plain.error && vp?.snippet?.description === 'Plain.' && !plainEs.error && g.videos.get(vp?.id)?.localizations?.es?.description === 'Plain.' && g.videos.get(vp?.id)?.snippet?.description === 'Plain.',
    `${vp ? JSON.stringify(vp.snippet.description) : 'no video'}; es ${plainEs.text.slice(0, 80)}`);

  // add_captions and list_captions on the video already up.
  const vtt = text('dawn.es.vtt', VTT);
  const added = await s.tool('add_captions', { video_id: v1?.id, file: vtt, language: 'es', draft: true });
  const listed = await s.tool('list_captions', { video_id: v1?.id });
  const cap2 = (g.captions ?? []).find((c) => c.videoId === v1?.id && c.language === 'es');
  const ids = (g.captions ?? []).filter((c) => c.videoId === v1?.id).map((c) => c.id).sort().join();
  line('addCaptions', 'add_captions sends a .vtt to a video already up as a draft, and list_captions reads both tracks back by id and language',
    !added.error && cap2?.bytes?.equals(readFileSync(vtt)) && cap2?.isDraft === true && Array.isArray(listed.v)
    && listed.v.map((t) => t.language).sort().join() === 'en,es' && listed.v.map((t) => t.id).sort().join() === ids,
    `${added.text.slice(0, 80)}; listed ${listed.text.slice(0, 120)}`);

  // update_video: new chapters replace the old; the video's length bounds the last; other languages kept.
  const up = await s.tool('update_video', { video_id: v1?.id, chapters: '0:00 Opening\n0:20 Middle\n0:40 Close' });
  const d2 = g.videos.get(v1?.id)?.snippet?.description ?? '';
  const late = await s.tool('update_video', { video_id: v1?.id, chapters: ['0:00 a', '0:20 b', '0:55 c'] });
  line('updateChapters', 'update_video with new chapters replaces the old list and keeps the text and the credits once; a last chapter under ten seconds from the end (1:00 video) is refused',
    !up.error && d2 === `Filmed in one take.\n\n0:00 Opening\n0:20 Middle\n0:40 Close\n\n${credit('Unraveling')}` && late.error && /ends/.test(late.text) && g.videos.get(v1?.id)?.snippet?.description === d2,
    `${JSON.stringify(d2)}; late ${late.text.slice(0, 80)}`);
  const upFr = await s.tool('update_video', { video_id: v1?.id, localizations: { fr: { title: 'Aube lente' } } });
  const langs1 = Object.keys(g.videos.get(v1?.id)?.localizations ?? {}).sort().join(',');
  const upEs = await s.tool('update_video', { video_id: v1?.id, localizations: { es: null } });
  const langs2 = Object.keys(g.videos.get(v1?.id)?.localizations ?? {}).sort().join(',');
  const upTitle = await s.tool('update_video', { video_id: v1?.id, title: 'Slow Dawn' });
  const langs3 = Object.keys(g.videos.get(v1?.id)?.localizations ?? {}).sort().join(',');
  line('updateLocalizations', 'update_video adding French keeps Spanish, es: null takes Spanish off, and a title-only update keeps French',
    !upFr.error && !upEs.error && !upTitle.error && langs1 === 'es,fr' && langs2 === 'fr' && langs3 === 'fr' && g.videos.get(v1?.id)?.localizations?.fr?.description === d2, `${langs1} then ${langs2} then ${langs3}`);
  // A video still processing reports P0D: its length is not known, so chapters are not held to it.
  const vpv = g.videos.get(vp?.id);
  if (vpv) vpv.contentDetails = { duration: 'P0D' };
  const p0d = await s.tool('update_video', { video_id: vp?.id, credits: false, chapters: ['0:00 a', '0:20 b', '0:40 c'] });
  line('processingLength', 'chapters on a video whose length YouTube reports as P0D (still processing) are taken, not refused as past its end',
    !p0d.error && /0:40 c/.test(g.videos.get(vp?.id)?.snippet?.description ?? ''), p0d.text.slice(0, 120));

  // A replacement reads the piece from the old description: credits once, languages carried.
  const rep = await s.tool('replace_video', { video_id: v1?.id, file: film('dawn-v2.mp4') });
  const rj = jobs().find((j) => j.replaces === v1?.id);
  const rd = rj?.meta?.snippet?.description ?? '';
  line('replaceCredits', 'replace_video, naming no music, finds the piece in the old description and keeps the credits line once and the other languages',
    !rep.error && count(rd, 'Test Artist') === 1 && rd.endsWith(credit('Unraveling')) && rj?.meta?.localizations?.fr?.title === 'Aube lente', `${rep.error ? rep.text.slice(0, 100) : JSON.stringify(rd)}`);

  // An upload card carries all of it, its caption file named beside the card.
  const cardFilm = film('card-words.mp4');
  text('card-words.en.srt', SRT);
  writeFileSync(join(dir, 'card-words.youtube.json'), JSON.stringify({ title: 'Card Words', language: 'en', music: 'Penumbra', chapters: ['0:00 One', '0:30 Two', '1:00 Three'], captions: ['card-words.en.srt'], localizations: { de: { title: 'Kartenworte' } } }));
  const qc = await s.tool('queue_upload', { file: cardFilm });
  const cj = jobs().find((j) => j.file === realpathSync(cardFilm));
  line('cardWords', 'an upload card carries chapters, music, captions (found beside the card) and other languages into the queued job',
    !qc.error && cj?.meta?.snippet?.description === `0:00 One\n0:30 Two\n1:00 Three\n\n${credit('Penumbra')}` && cj?.captions?.[0]?.file === realpathSync(join(dir, 'card-words.en.srt')) && cj?.captions?.[0]?.language === 'en' && cj?.meta?.localizations?.de?.title === 'Kartenworte',
    qc.error ? qc.text.slice(0, 120) : JSON.stringify({ d: cj?.meta?.snippet?.description, c: cj?.captions }));

  const offFilm = film('card-off.mp4');
  writeFileSync(join(dir, 'card-off.youtube.json'), JSON.stringify({ title: 'Card Off', description: 'No music here.', credits: false }));
  const qo = await s.tool('queue_upload', { file: offFilm });

  s.child.stdin.end();
  await Promise.race([s.exited, sleep(3000)]);

  // The queued jobs, drained, as YouTube receives them.
  const drain = start(server, { ...env, CHROMAGLASS_YOUTUBE_DIR: tconf, CHROMAGLASS_YOUTUBE_NOW: String(Date.now() + 60_000) }, ['drain']);
  logs.push(drain.out);
  const drained = await Promise.race([drain.exited, sleep(20_000).then(() => 'running')]);
  if (drained === 'running') await drain.kill();
  const vr = [...g.videos.values()].find((v) => v.id !== v1?.id && v.snippet.title === 'Slow Dawn');
  const vc = videoOf('Card Words');
  const vo = videoOf('Card Off');
  const capC = (g.captions ?? []).find((c) => c.videoId === vc?.id);
  line('drainedWords', 'drained, the replacement reaches YouTube with the credits once and French kept, the card\'s film with its chapters, German title and caption bytes, and a card\'s credits: false with none',
    drained === 0 && count(vr?.snippet?.description ?? '', 'Test Artist') === 1 && vr?.localizations?.fr?.title === 'Aube lente'
    && vc?.snippet?.description === `0:00 One\n0:30 Two\n1:00 Three\n\n${credit('Penumbra')}` && vc?.localizations?.de?.title === 'Kartenworte'
    && capC?.language === 'en' && capC?.bytes?.equals(readFileSync(join(dir, 'card-words.en.srt')))
    && !qo.error && vo?.snippet?.description === 'No music here.',
    `drain ${drained}; replacement ${JSON.stringify(vr?.snippet?.description ?? null)}; card ${JSON.stringify(vc?.snippet?.description ?? null)}; off ${JSON.stringify(vo?.snippet?.description ?? null)}`);
}
