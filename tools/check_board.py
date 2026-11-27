"""Local checks for the learning board. Run: python3 tools/check_board.py
Checks markup, ordering, images, eight-column static fallback, JS layout on fresh
and returning (old-revision) browsers, and per-board new-card framing."""
import json, os, re, subprocess, sys, time, socket, threading, http.server, functools
from bs4 import BeautifulSoup
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BOARDS = ('claude', 'openai', 'gsplat')
html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
soup = BeautifulSoup(html, 'html.parser')
errors = []
def err(m): errors.append(m); print('FAIL', m)

rev = json.load(open(os.path.join(ROOT, 'revision.json')))['revision']
js = open(os.path.join(ROOT, 'board.js'), encoding='utf-8').read()
if f'LAYOUT_REVISION = "{rev}"' not in js: err('board.js LAYOUT_REVISION != revision.json')
for asset in ('styles.css', 'board.js'):
    if f'{asset}?v={rev}' not in html: err(f'{asset} not versioned with {rev}')
if f'var expected = "{rev}"' not in html: err('inline expected revision mismatch')
css = open(os.path.join(ROOT, 'styles.css'), encoding='utf-8').read()
if not re.search(r'\.board\s*\{[^}]*grid-template-columns:\s*repeat\(8', css): err('static grid is not 8 columns')

ids = set(); counts = {}
for sec in soup.select('section.board-view'):
    b = sec['id']; arts = [a for a in sec.select('article.card') if 'intro' not in a.get('class')]
    counts[b] = len(arts)
    def key(a):
        unk = (not a.get('data-published')) or a.get('data-date-precision') == 'unknown'
        return (unk, '' if unk else a['data-published'])
    known = [a['data-published'] for a in arts if not key(a)[0]]
    if known != sorted(known, reverse=True): err(f'{b}: not newest-first in static HTML')
    seen_unknown = False
    for a in arts:
        if key(a)[0]: seen_unknown = True
        elif seen_unknown: err(f'{b}: dated card after unknown-date card: {a["data-id"]}')
        cid = a['data-id']
        if cid in ids: err(f'duplicate id {cid}')
        ids.add(cid)
        img = a.select_one('img')
        if not img or not os.path.exists(os.path.join(ROOT, img['src'])): err(f'missing image for {cid}')
        elif not img['src'].startswith(f'images/{cid}/'): err(f'image outside images/{cid}/')
        if not a.select_one('details.more summary') or a.select_one('details.more summary').get_text() != '依据与限度': err(f'{cid}: no 依据与限度')
        if not a.get('data-audit'): err(f'{cid}: no data-audit')
        if not a.select_one('h2') or not a.select_one('.when'): err(f'{cid}: missing h2/when')
        for l in a.select('a[href]'):
            if not l['href'].startswith('https://'): err(f'{cid}: non-https link {l["href"]}')
nav = soup.select('.board-nav a small')
if [a.get('href') for a in soup.select('.board-nav a')] != [f'#{b}' for b in BOARDS]:
    err('nav order does not match ' + ','.join(BOARDS))
for sm, b in zip(nav, BOARDS):
    if not sm.get_text().startswith(f'{counts[b]} 张'): err(f'nav count for {b} says {sm.get_text()} but board has {counts[b]}')
print('counts', counts, 'total', sum(counts.values()))

# Browser checks
try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print('playwright missing; skipped browser checks'); sys.exit(1 if errors else 0)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=ROOT)
httpd = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{port}/index.html'
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    # static fallback (no JS)
    ctx = br.new_context(java_script_enabled=False, viewport={'width': 1600, 'height': 1000})
    pg = ctx.new_page()
    for b in BOARDS:
        pg.goto(base + '#' + b); pg.wait_for_timeout(300)
        tops = pg.eval_on_selector_all(f'#{b} article.card:not(.intro)', 'els => els.map(e => Math.round(e.getBoundingClientRect().top))')
        first = tops[0]; row1 = sum(1 for t in tops if abs(t - first) < 2)
        want = min(8, len(tops))
        if row1 != want: err(f'static {b}: first row has {row1} cards, expected {want}')
    ctx.close()
    def js_check(ctx, label):
        pg = ctx.new_page()
        for b in BOARDS:
            pg.goto(base + '#' + b); pg.wait_for_timeout(1500)
            info = pg.evaluate(f'''() => {{
              const arts=[...document.querySelectorAll('#{b} article.card:not(.intro)')];
              const vis=arts.filter(a=>{{const r=a.getBoundingClientRect();return r.width>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight}}).length;
              const imgs=arts.map(a=>a.querySelector('img')).filter(i=>!(i.complete&&i.naturalWidth>0)).map(i=>i.src);
              const pos=arts.map(a=>[a.dataset.id,Math.round(a.getBoundingClientRect().left),Math.round(a.getBoundingClientRect().top)]);
              return {{vis, imgs, pos, store: localStorage.getItem('learning-board-freeform-v1-{b}')}};
            }}''')
            pos = info['pos']; y0 = pos[0][2]
            row = [x for x in pos if abs(x[2] - y0) < 3]
            want = min(8, len(pos))
            if len(row) != want: err(f'{label} {b}: JS first row has {len(row)} cards, expected {want}')
            if [x[0] for x in sorted(row, key=lambda x: x[1])] != [x[0] for x in pos[:want]]: err(f'{label} {b}: first row not newest-first left to right')
            if info['imgs']: err(f'{label} {b}: broken images {info["imgs"]}')
            st = json.loads(info['store'] or '{}')
            if st.get('revision') != rev: err(f'{label} {b}: stored revision {st.get("revision")}')
            print(label, b, 'first-row', [x[0] for x in pos[:8]], 'visible', info['vis'])
        # cycle framing on each board
        for b, want in (('claude', 'claude-pelican-1'), ('openai', None), ('gsplat', None)):
            pg.goto(base + '#' + b); pg.wait_for_timeout(800)
            pg.click('#show-cycle'); pg.wait_for_timeout(500)
            h = pg.evaluate('location.hash')
            if h != '#' + b: err(f'{label}: show-cycle switched board from {b} to {h}')
            if want is None: continue  # no new cards on this board this revision
            ok = pg.evaluate(f'''() => {{const r=document.querySelector('#{b} [data-id="{want}"]').getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth&&r.top>=0}}''')
            if not ok: err(f'{label}: show-cycle did not frame {want}')
        for b in BOARDS:
            pg.goto(base + "#" + b); pg.wait_for_timeout(800)
            info = pg.evaluate("""() => {
              const bid = location.hash.replace("#","");
              const cards = [...document.querySelectorAll("#" + bid + " article.card")];
              const missing = cards.filter(c => !c.querySelector(".learned-toggle")).map(c => c.dataset.id);
              const bad = cards.map(c => c.querySelector(".learned-toggle")).filter(t => !t || t.getAttribute("role") !== "switch");
              const learned = cards.filter(c => c.classList.contains("is-learned")).map(c => c.dataset.id);
              const checked = cards.filter(c => {
                const t = c.querySelector(".learned-toggle");
                return t && t.getAttribute("aria-checked") === "true";
              }).map(c => c.dataset.id);
              return {n: cards.length, missing, bad: bad.length, learned, checked};
            }""")
            if info["missing"]: err(f"{label} {b}: toggle missing on {info['missing']}")
            if info["bad"]: err(f"{label} {b}: {info['bad']} toggles missing role=switch")
            if label == "fresh":
                if info["learned"] or info["checked"]:
                    err(f"{label} {b}: fresh board should be unlearned, got {info['learned']} / {info['checked']}")
        if label == "fresh":
            pg.goto(base + "#claude"); pg.wait_for_timeout(800)
            before = pg.evaluate("""() => {
              const card = document.querySelector("#claude article.card:not(.intro)");
              const t = card.querySelector(".learned-toggle");
              const r = card.getBoundingClientRect();
              const tr = t.getBoundingClientRect();
              return {id: card.dataset.id, left: card.style.left, top: card.style.top,
                      inCorner: tr.right <= r.right + 1 && tr.bottom <= r.bottom + 1 && tr.left > r.left + r.width * 0.45};
            }""")
            if not before["inCorner"]: err(f"{label}: toggle not in bottom-right of {before['id']}")
            pg.click("#claude [data-id=\"%s\"] .learned-toggle" % before["id"])
            pg.wait_for_timeout(200)
            after = pg.evaluate("""(id) => {
              const card = document.querySelector("#claude [data-id='" + id + "']");
              const t = card.querySelector(".learned-toggle");
              const st = JSON.parse(localStorage.getItem("learning-board-freeform-v1-claude") || "{}");
              return {learned: card.classList.contains("is-learned"), aria: t.getAttribute("aria-checked"),
                      label: (t.querySelector(".learned-label") || {}).textContent,
                      left: card.style.left, top: card.style.top,
                      saved: !!(st.learned && st.learned[id])};
            }""", before["id"])
            if after["left"] != before["left"] or after["top"] != before["top"]:
                err(f"{label}: clicking toggle moved card {before['id']}")
            if not after["learned"] or after["aria"] != "true" or after["label"] != "已学" or not after["saved"]:
                err(f"{label}: click did not mark {before['id']} learned: {after}")
            pg.reload(); pg.wait_for_timeout(1200)
            held = pg.evaluate("""(id) => {
              const card = document.querySelector("#claude [data-id='" + id + "']");
              const t = card && card.querySelector(".learned-toggle");
              const st = JSON.parse(localStorage.getItem("learning-board-freeform-v1-claude") || "{}");
              return {ok: !!(card && card.classList.contains("is-learned") && t && t.getAttribute("aria-checked")==="true" && st.learned && st.learned[id])};
            }""", before["id"])
            if not held["ok"]: err(f"{label}: learned state did not persist across reload for {before['id']}")
        pg.close()
    ctx = br.new_context(viewport={'width': 1600, 'height': 1000}); js_check(ctx, 'fresh'); ctx.close()
    # returning browser with an old revision and dragged positions
    ctx = br.new_context(viewport={'width': 1600, 'height': 1000})
    old = {'v': 1, 'positions': {'escape-velocity': {'x': 9, 'y': 9}, 'gta-cursed-trailer': {'x': 4000, 'y': 3000}}, 'notes': {'gta-cursed-trailer': 'keep me'}, 'learned': {'gta-cursed-trailer': True}, 'camera': {'x': -900, 'y': -900, 'z': 0.3}, 'revision': '2026-11-19-pr21'}
    ctx.add_init_script('if(!sessionStorage.getItem("seeded")){localStorage.setItem("learning-board-freeform-v1-claude",%s);sessionStorage.setItem("seeded","1")}' % json.dumps(json.dumps(old)))
    js_check(ctx, 'returning')
    pg = ctx.new_page(); pg.goto(base + '#claude'); pg.wait_for_timeout(800)
    st = json.loads(pg.evaluate('localStorage.getItem("learning-board-freeform-v1-claude")'))
    if st.get('notes', {}).get('gta-cursed-trailer') != 'keep me': err('returning: stored note was lost')
    if st.get('learned', {}).get('gta-cursed-trailer') is not True: err('returning: learned flag was lost')
    learned_cls = pg.evaluate('document.querySelector("#claude [data-id=gta-cursed-trailer]").classList.contains("is-learned")')
    if not learned_cls: err('returning: learned class not applied after re-layout')
    aria = pg.evaluate('document.querySelector("#claude [data-id=gta-cursed-trailer] .learned-toggle").getAttribute("aria-checked")')
    if aria != 'true': err('returning: learned toggle aria-checked not true')
    pg.screenshot(path=os.path.join(ROOT, '..', 'full-audit-data', 'check-claude.png'))
    pg.goto(base + '#openai'); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(ROOT, '..', 'full-audit-data', 'check-openai.png'))
    pg.goto(base + '#gsplat'); pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(ROOT, '..', 'full-audit-data', 'check-gsplat.png'))
    ctx.close(); br.close()
httpd.shutdown()
print('ERRORS' if errors else 'ALL CHECKS PASSED', len(errors))
sys.exit(1 if errors else 0)
