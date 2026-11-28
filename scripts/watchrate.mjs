/**
 * The rating page a batch run writes (PLAN 47p-5; the owner, 2026-11-27:
 * "ratings pages should be part of the skill/release as well, so users can
 * create an eval set for themselves").
 *
 * One HTML file beside the batch's folders, opened from the disk: no server,
 * no account, nothing sent anywhere. For each clip it plays the watched
 * window (rate.mp4 in the clip's folder, a small H.264 copy every browser
 * plays, phones included) above its timeline and contact sheet, and takes:
 *
 *   - a mark, 1 to 5, and optionally one per canon (the report card's seven,
 *     under the same keys the card's agreement reads);
 *   - a note: what decided the mark;
 *   - notes pinned to a moment (the owner, 2026-11-28: open-ended feedback
 *     should count): tap the timeline or pause the clip, type what happens
 *     there, and it is kept with its time;
 *   - "keep aside": rated, but left out of any fit, for the check that a fit
 *     holds on clips it never saw.
 *
 * Everything saves in the browser as it is typed (so a closed tab loses
 * nothing), and "Save ratings.json" downloads the file the tool reads, in
 * the one format every rating takes in this tool: an object keyed by clip,
 * each entry { overall, unity … restraint, note, moments: [{ t, note }],
 * heldOut, title, read, updatedAt }, which is also what the phone rating page
 * made for the owner's own round writes (its keys are a subset), so ratings
 * from either feed the same refit. `t` is seconds into the source file, the
 * clock the report and the shot list use. `read` is the clip's measures as
 * the card grades them (cardMetrics), so the file can be refitted on any
 * machine without the batch's folders. "Load" merges a file in, so a round
 * can be carried on elsewhere, and keys this page does not show are kept
 * and saved back out with it.
 *
 * Built on renderPage (watchreport.mjs), so it reads like every other page
 * the tool writes, with one script at the end: the page's only script, and
 * one that never loads anything.
 */

import { esc, renderPage } from './watchreport.mjs';

export const CANONS = [
  ['unity', 'Unity', 'hangs together as one picture'],
  ['complexity', 'Complexity', 'rich detail worth looking at'],
  ['intensity', 'Intensity', 'energy and punch'],
  ['arc', 'Arc', 'builds and goes somewhere'],
  ['surprise', 'Surprise', 'does something you did not expect'],
  ['musicFit', 'Music fit', 'moves with the music'],
  ['restraint', 'Restraint', 'knows when to hold back'],
];

const stamp = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;

const CSS = `
.top{position:sticky;top:0;z-index:5;background:var(--bg);padding:10px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center;border-bottom:1px solid var(--rule)}
.top .count{flex:1;min-width:120px;color:var(--dim);font-variant-numeric:tabular-nums}
button,.btn{appearance:none;border:1px solid var(--rule);background:#2a2a30;color:var(--ink);border-radius:8px;padding:8px 12px;font:inherit;font-size:.92rem;cursor:pointer;touch-action:manipulation}
button[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#1a1206}
button:focus-visible,textarea:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.stars{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:12px 0 4px}.stars button{min-height:48px;font-size:1.15rem;font-weight:700}
.stars small{display:block;font-size:.7rem;font-weight:400;color:inherit;opacity:.8}
textarea,input[type=text]{width:100%;background:#0000004d;color:var(--ink);border:1px solid var(--rule);border-radius:8px;padding:8px 10px;font:inherit;font-size:16px}
textarea{min-height:56px;resize:vertical;margin-top:8px}
.strip{position:relative;margin-top:8px;cursor:crosshair;touch-action:manipulation}.strip img{width:100%;height:56px;object-fit:fill;border-radius:4px}
.strip .head{position:absolute;top:0;bottom:0;width:2px;background:#fff;left:0;pointer-events:none}
.strip .pin{position:absolute;top:-3px;width:10px;height:10px;margin-left:-5px;border-radius:50%;background:var(--accent);border:2px solid var(--bg);pointer-events:none}
.pinrow{display:flex;gap:8px;margin-top:8px}.pinrow input{flex:1}
ul.moments{list-style:none;padding:0;margin:6px 0}ul.moments li{display:flex;gap:8px;align-items:baseline;padding:4px 0;border-bottom:1px solid var(--rule)}
ul.moments a{color:var(--accent);font-variant-numeric:tabular-nums;cursor:pointer}ul.moments span{flex:1}
ul.moments button{padding:2px 8px}
.canon{display:flex;flex-wrap:wrap;gap:4px 10px;align-items:center;padding:5px 0;border-bottom:1px solid var(--rule)}.canon b{min-width:90px}.canon span{flex:1;color:var(--dim);font-size:.85rem;min-width:140px}
.canon .mini{display:flex;gap:3px}.canon .mini button{width:34px;height:34px;padding:0}
label.held{display:block;margin-top:10px;color:var(--dim);font-size:.9rem}
.saved{color:var(--dim);font-size:.8rem;min-height:1em;margin-top:6px}
textarea.dump{min-height:160px;font:12px ui-monospace,Menlo,monospace}
`;

/**
 * The page. `clips`: [{ key, title, video (path relative to the page),
 * from, span, timeline and sheet (data URIs or null), read }]. `prior`: the
 * ratings already on file for these clips (shown filled in). `id` names the
 * page's saved draft in the browser, so two batches' drafts never mix.
 */
export function ratePage({ title, id, clips, prior = {}, meta = [] }) {
  const sections = [{ id: 'how', title: 'How to rate', html: `<p>Watch each clip with its sound and give it a mark from 1 to 5. Rate from the clip, not from any numbers you have seen. In the note, say what decided the mark ("froze at 0:12", "lovely slow cells"). To pin a note to a moment, tap the timeline under the clip (or pause it), type what happens there and press <b>Pin</b>. Mark three or four clips <b>keep aside</b>: they are rated but left out of a fit, so the fit can be checked on clips it never saw.</p><p>Everything is kept in this browser as you go. When you are done (or want to carry on elsewhere), press <b>Save ratings.json</b>, and put the file where the tool's guide says (the first folder of the reference library). <b>Load</b> takes a ratings.json back in.</p>` }];
  clips.forEach((c, i) => {
    const canonRows = CANONS.map(([k, name, what]) => `<div class="canon"><b>${esc(name)}</b><span>${esc(what)}</span><div class="mini" data-canon="${k}">${[1, 2, 3, 4, 5].map(v => `<button type="button" data-v="${v}" aria-label="${esc(name)} ${v}">${v}</button>`).join('')}</div></div>`).join('');
    sections.push({ id: `c${i + 1}`, title: `${i + 1}. ${c.title}`, html: `<div class="rate" data-key="${esc(c.key)}">
<video controls playsinline preload="metadata" src="${esc(c.video)}"></video>
<div class="strip" role="button" aria-label="Timeline: tap to go to a moment">${c.timeline ? `<img src="${c.timeline}" alt="">` : '<img alt="" style="background:#333">'}<i class="head"></i></div>
<p class="meta">${esc(stamp(c.from))} to ${esc(stamp(c.from + c.span))} of the source, ${esc(c.key)}</p>
<div class="stars" role="group" aria-label="Mark for clip ${i + 1}">${['poor', 'weak', 'fine', 'good', 'great'].map((w, j) => `<button type="button" data-v="${j + 1}" aria-label="${j + 1}, ${w}">${j + 1}<small>${w}</small></button>`).join('')}</div>
<textarea class="note" placeholder="What decided the mark?" aria-label="Note on clip ${i + 1}"></textarea>
<div class="pinrow"><input type="text" class="mnote" placeholder="What happens at this moment" aria-label="Note for this moment"><button type="button" class="pin">Pin at <span class="at">${esc(stamp(c.from))}</span></button></div>
<ul class="moments"></ul>
<details><summary>A mark per canon (optional)</summary>${canonRows}</details>
<label class="held"><input type="checkbox" class="heldout"> Keep aside: rated, but left out of a fit</label>
${c.sheet ? `<details open><summary>Contact sheet</summary><img src="${c.sheet}" alt="Contact sheet" loading="lazy"></details>` : ''}
<div class="saved"></div>
</div>` });
  });
  sections.push({ id: 'save', title: 'Save', html: `<p>Save downloads <code>ratings.json</code>. Where a browser will not download from a page on disk, copy the text below into a file of that name.</p><p><button type="button" id="save2">Save ratings.json</button></p><details><summary>The file's text</summary><textarea class="dump" id="dump" readonly></textarea></details>` });
  const data = { id, clips: clips.map(c => ({ key: c.key, title: c.title, from: c.from, span: c.span, read: c.read ?? null })), prior };
  const top = `<div class="top"><span class="count" id="count"></span><button type="button" id="save">Save ratings.json</button><label class="btn">Load<input type="file" id="load" accept="application/json,.json" hidden></label></div>`;
  const page = renderPage({ title, meta, sections, footer: 'Made by reelreader. This page sends nothing anywhere: your marks stay in this browser until you save the file.' });
  return page
    .replace('</style>', `${CSS}</style>`)
    .replace('<main>', `<main>\n${top}`)
    .replace('</body>', `<script>const DATA=${JSON.stringify(data).replace(/</g, '\\u003c')};\n${SCRIPT}</script>\n</body>`);
}

// The page's script, as plain text (it runs in the browser, not here).
const SCRIPT = String.raw`
(function(){
var store=null;try{store=window.localStorage;store.getItem('x')}catch(e){store=null}
var KEY='reelreader-rate:'+DATA.id, state={}, extra={};
var byKey={};DATA.clips.forEach(function(c){byKey[c.key]=c});
function load(){var s=null;try{s=store&&JSON.parse(store.getItem(KEY)||'null')}catch(e){s=null}
  Object.keys(DATA.prior||{}).forEach(function(k){if(byKey[k])state[k]=JSON.parse(JSON.stringify(DATA.prior[k]));else extra[k]=DATA.prior[k]});
  if(s&&s.state){Object.keys(s.state).forEach(function(k){state[k]=s.state[k]});Object.keys(s.extra||{}).forEach(function(k){extra[k]=s.extra[k]})}}
function persist(k){if(k){state[k]=state[k]||{};state[k].updatedAt=new Date().toISOString()}
  try{store&&store.setItem(KEY,JSON.stringify({state:state,extra:extra}))}catch(e){}
  document.querySelectorAll('.rate').forEach(function(el){if(!k||el.dataset.key===k)el.querySelector('.saved').textContent=store?'Kept in this browser':'Not kept: this browser blocks saving here, so save the file before closing'});
  count();dump()}
function stamp(t){var m=Math.floor(t/60),s=(t%60).toFixed(1);return m+':'+(s.length<4?'0'+s:s)}
function out(){var o={};Object.keys(extra).forEach(function(k){o[k]=extra[k]});
  DATA.clips.forEach(function(c){var d=state[c.key];if(!d)return;var e={};
    ['overall','unity','complexity','intensity','arc','surprise','musicFit','restraint'].forEach(function(f){if(typeof d[f]==='number')e[f]=d[f]});
    if(d.note)e.note=d.note;if(d.moments&&d.moments.length)e.moments=d.moments;if(d.heldOut)e.heldOut=true;
    if(!Object.keys(e).length)return;e.title=c.title;if(c.read)e.read=c.read;if(d.updatedAt)e.updatedAt=d.updatedAt;o[c.key]=e});
  return o}
function dump(){var t=document.getElementById('dump');if(t)t.value=JSON.stringify(out(),null,1)}
function count(){var n=DATA.clips.filter(function(c){return state[c.key]&&typeof state[c.key].overall==='number'}).length;
  document.getElementById('count').textContent=n+' of '+DATA.clips.length+' rated'}
function save(){var blob=new Blob([JSON.stringify(out(),null,1)+'\n'],{type:'application/json'});
  var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='ratings.json';document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)}
function paint(el){var k=el.dataset.key,d=state[k]||{};
  el.querySelectorAll('.stars button').forEach(function(b){b.setAttribute('aria-pressed',String(d.overall===+b.dataset.v))});
  el.querySelectorAll('.mini').forEach(function(m){m.querySelectorAll('button').forEach(function(b){b.setAttribute('aria-pressed',String(d[m.dataset.canon]===+b.dataset.v))})});
  var n=el.querySelector('.note');if(document.activeElement!==n)n.value=d.note||'';
  el.querySelector('.heldout').checked=!!d.heldOut;
  var c=byKey[k],ul=el.querySelector('.moments'),strip=el.querySelector('.strip');ul.textContent='';
  strip.querySelectorAll('.pin').forEach(function(p){p.remove()});
  (d.moments||[]).forEach(function(m,i){var li=document.createElement('li'),a=document.createElement('a'),s=document.createElement('span'),x=document.createElement('button');
    a.textContent=stamp(m.t);a.onclick=function(){var v=el.querySelector('video');v.currentTime=Math.max(0,m.t-c.from);v.play&&v.play()};
    s.textContent=m.note;x.type='button';x.textContent='\u00d7';x.setAttribute('aria-label','Remove this note');
    x.onclick=function(){d.moments.splice(i,1);persist(k);paint(el)};li.append(a,s,x);ul.append(li);
    var p=document.createElement('i');p.className='pin';p.style.left=(100*Math.min(1,Math.max(0,(m.t-c.from)/c.span)))+'%';strip.append(p)})}
function set(el,f,v){var k=el.dataset.key,d=state[k]||(state[k]={});if(d[f]===v)delete d[f];else d[f]=v;persist(k);paint(el)}
load();
document.querySelectorAll('.rate').forEach(function(el){var k=el.dataset.key,c=byKey[k],v=el.querySelector('video'),at=c.from;
  var strip=el.querySelector('.strip'),head=strip.querySelector('.head'),lab=el.querySelector('.at');
  function mark(t){at=t;lab.textContent=stamp(t);head.style.left=(100*Math.min(1,Math.max(0,(t-c.from)/c.span)))+'%'}
  el.querySelectorAll('.stars button').forEach(function(b){b.onclick=function(){set(el,'overall',+b.dataset.v)}});
  el.querySelectorAll('.mini').forEach(function(m){m.querySelectorAll('button').forEach(function(b){b.onclick=function(){set(el,m.dataset.canon,+b.dataset.v)}})});
  // The note goes into the state at once and is written out a moment later:
  // a debounced state lost a note typed just before a tap elsewhere repainted the box.
  var n=el.querySelector('.note'),tm;function noteNow(){var d=state[k]||(state[k]={});var val=n.value.trim();if(val)d.note=val;else delete d.note}
  n.addEventListener('input',function(){noteNow();clearTimeout(tm);tm=setTimeout(function(){persist(k)},400)});
  n.addEventListener('blur',function(){clearTimeout(tm);noteNow();persist(k)});
  el.querySelector('.heldout').onchange=function(e){var d=state[k]||(state[k]={});if(e.target.checked)d.heldOut=true;else delete d.heldOut;persist(k)};
  v.addEventListener('timeupdate',function(){mark(c.from+v.currentTime)});
  v.addEventListener('play',function(){document.querySelectorAll('video').forEach(function(o){if(o!==v)o.pause()})});
  strip.addEventListener('click',function(e){var r=strip.getBoundingClientRect(),x=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width));
    mark(c.from+x*c.span);try{v.currentTime=x*c.span}catch(err){}el.querySelector('.mnote').focus()});
  function pin(){var i=el.querySelector('.mnote'),txt=i.value.trim();if(!txt)return i.focus();var d=state[k]||(state[k]={});
    (d.moments=d.moments||[]).push({t:Math.round(at*10)/10,note:txt});d.moments.sort(function(a,b){return a.t-b.t});i.value='';persist(k);paint(el)}
  el.querySelector('.pin').onclick=pin;el.querySelector('.mnote').addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();pin()}});
  paint(el)});
document.getElementById('save').onclick=save;document.getElementById('save2').onclick=save;
document.getElementById('load').onchange=function(e){var f=e.target.files[0];if(!f)return;var r=new FileReader();
  r.onload=function(){try{var j=JSON.parse(r.result);Object.keys(j).forEach(function(k){if(!byKey[k]){extra[k]=j[k];return}
    var old=state[k]||{},nw=j[k]||{},m=(old.moments||[]).concat(nw.moments||[]),seen={};var keep=Object.assign({},old,nw);
    keep.moments=m.filter(function(x){var id=x.t+'|'+x.note;if(seen[id])return false;seen[id]=1;return true});if(!keep.moments.length)delete keep.moments;
    delete keep.read;delete keep.title;state[k]=keep});persist();document.querySelectorAll('.rate').forEach(paint)}catch(err){alert('That file is not a ratings.json this page can read.')}};
  r.readAsText(f)};
count();dump();
})();
`;
