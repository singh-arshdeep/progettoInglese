import { getStore } from "@netlify/blobs";

const LIMIT = 20000; // ms to answer
const GRACE = 1500;  // network slack after the timer ends
const LEAD = 4000;   // countdown on the big screen before answers open
const CURRENT_TTL = 6 * 3600 * 1000; // the big screen only auto-joins a game created in the last 6 hours

const QUESTIONS = [
  { type: "mc", prompt: "It works exactly ___ you expect.", options: ["as", "as if", "like if", "the way"], answer: 0, clip: "01", label: "Intro",
    why: "as = in the same way that. It really works like that, so it is real." },
  { type: "mc", prompt: "Apps open ___ they were already running.", options: ["as", "as if", "the way", "to"], answer: 1, clip: "04", label: "Speed",
    why: "as if = like, but it is not real. The apps are not running, it only seems so." },
  { type: "fill", prompt: "The screen looks as though it ___ (be) made of glass.", accept: ["were"], clip: "05", label: "120 Hz display",
    why: "After as if / as though we often use the past: were, not is or are." },
  { type: "mc", prompt: "Which linker is the more formal version of “as if”?", options: ["as", "the way", "as though", "like"], answer: 2, clip: "02", label: "48 MP camera",
    why: "as though means the same as as if, but it is more formal." },
  { type: "fill", prompt: "I love ___ Apple Intelligence helps me. (2 words)", accept: ["the way"], clip: "09", label: "For students",
    why: "the way = how, the manner in which something happens." },
  { type: "mc", prompt: "“The photos look as if they were taken by a professional.” What does “as if” tell us?",
    options: ["A professional took them", "They only seem professional", "The photos are old", "The writer recommends it"], answer: 1, clip: "03", label: "Night photos",
    why: "as if describes something that is not real: the photos only look professional." },
  { type: "fill", prompt: "My advice is ___ a strong case to protect it. (buy)", accept: ["to buy"], clip: "11", label: "Advice",
    why: "My advice is + to + verb: My advice is to buy…" },
  { type: "mc", prompt: "I would definitely recommend it ___ anyone who wants a cutting-edge phone.", options: ["for", "at", "to", "with"], answer: 2, clip: "10", label: "Recommendation",
    why: "We say recommend it to + person." },
  { type: "mc", prompt: "Where in a review do we usually use recommending phrases?",
    options: ["In the title", "In the device description", "At the end, in the opinion and recommendation", "In the introduction"], answer: 2, clip: "07", label: "Pros & cons",
    why: "Recommending phrases go at the end of a review, in the opinion and recommendation part." },
  { type: "fill", prompt: "The battery lasts all day, ___ Apple says.", accept: ["as"], clip: "06", label: "Battery",
    why: "It is real: the battery lasts all day in the same way Apple says, so we use as." },
];

const CHECKLIST = [
  "Included all the parts of the review",
  "Described the device briefly but clearly",
  "Wrote a conclusion with a final opinion and recommendation",
  "Used a suitably semiformal style",
  "Used the correct number of words",
  "Checked for grammar and spelling mistakes",
];

const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const bad = (error, status = 400) => json({ error }, status);
const okPin = (p) => typeof p === "string" && /^\d{6}$/.test(p);
const okId = (id) => typeof id === "string" && /^[a-z0-9]{8,40}$/i.test(id);
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();
const sk = (pin) => `${pin}/state`;
const pk = (pin, id) => `${pin}/p/${id}`;
const answerText = (q) => (q.type === "mc" ? q.options[q.answer] : q.accept[0]);

async function playersOf(s, pin) {
  const { blobs } = await s.list({ prefix: `${pin}/p/` });
  const ps = (await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })))).filter(Boolean);
  return ps.sort((a, b) => (a.joined || 0) - (b.joined || 0));
}

function boardOf(ps, prev, idx) {
  const before = new Map((prev || []).map((b, i) => [b.id, i]));
  return ps
    .map((p) => ({ id: p.id, name: p.name, score: p.score || 0, gain: p.answers?.[idx]?.pts || 0, joined: p.joined || 0 }))
    .sort((a, b) => b.score - a.score || a.joined - b.joined)
    .map((b) => ({ ...b, prev: before.has(b.id) ? before.get(b.id) : null }));
}

function openQuestion(st) {
  st.idx++;
  const q = QUESTIONS[st.idx];
  st.phase = "question";
  st.q = { type: q.type, prompt: q.prompt, options: q.options || null, clip: q.clip, label: q.label, limit: LIMIT };
  st.startedAt = Date.now() + LEAD;
  st.reveal = null;
}

function reveal(st, ps) {
  const q = QUESTIONS[st.idx];
  const counts = q.type === "mc" ? q.options.map(() => 0) : null;
  let okCount = 0, answered = 0;
  for (const p of ps) {
    const a = p.answers?.[st.idx];
    if (!a) continue;
    answered++;
    if (a.ok) okCount++;
    if (counts && a.choice >= 0 && a.choice < counts.length) counts[a.choice]++;
  }
  st.phase = "reveal";
  st.reveal = { answer: q.answer ?? null, accept: q.accept?.[0] ?? null, why: q.why, counts, okCount, answered };
  st.board = boardOf(ps, st.board, st.idx);
}

function rateResults(ps) {
  return CHECKLIST.map((text, i) => {
    const v = ps.map((p) => p.ratings?.[i]).filter((x) => x >= 1 && x <= 5);
    return { text, n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 };
  });
}

// quiz: question → reveal → board → question … → quizEnd.  rate: rate → rate … → rateEnd.
function advance(st, ps) {
  if (st.mode === "quiz") {
    if (st.phase === "question") reveal(st, ps);
    else if (st.phase === "reveal") st.phase = "board";
    else if (st.phase === "board") {
      if (st.idx + 1 >= QUESTIONS.length) st.phase = "quizEnd";
      else openQuestion(st);
    }
  } else if (st.mode === "slides" && st.phase === "slide") {
    if (st.idx + 1 < st.total) st.idx++;
  } else if (st.mode === "rate" && st.phase === "rate") {
    if (st.idx + 1 >= CHECKLIST.length) { st.phase = "rateEnd"; st.results = rateResults(ps); }
    else { st.idx++; st.q = { prompt: CHECKLIST[st.idx] }; }
  }
}

async function start(s, st, ps, mode, total) {
  if (mode === "slides") {
    // the presentation keeps scores and stars as they are
    st.mode = "slides"; st.total = total; st.idx = 0; st.phase = "slide"; st.q = null; st.reveal = null;
    return;
  }
  // a new round starts clean: scores for the quiz, stars for the rating
  await Promise.all(ps.map((p) => s.setJSON(pk(st.pin, p.id), mode === "quiz" ? { ...p, answers: {}, score: 0, streak: 0 } : { ...p, ratings: {} })));
  ps.forEach((p) => { if (mode === "quiz") { p.answers = {}; p.score = 0; p.streak = 0; } else p.ratings = {}; });
  st.mode = mode;
  st.idx = -1;
  st.board = [];
  st.results = null;
  st.reveal = null;
  if (mode === "quiz") { st.total = QUESTIONS.length; openQuestion(st); }
  else { st.total = CHECKLIST.length; st.idx = 0; st.phase = "rate"; st.q = { prompt: CHECKLIST[0] }; }
}

function liveOf(st, ps) {
  const done = ps.filter((p) => (st.phase === "question" ? !!p.answers?.[st.idx] : st.phase === "rate" ? p.ratings?.[st.idx] != null : false)).length;
  const votes = st.phase === "rate" ? ps.map((p) => p.ratings?.[st.idx]).filter(Boolean) : [];
  const live = { n: ps.length, done, names: ps.map((p) => p.name), votes: votes.length, avg: votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : 0 };
  // fill-the-gap: every typed answer, counted, for the live word cloud (right/wrong only once revealed)
  if (st.mode === "quiz" && (st.phase === "question" || st.phase === "reveal") && QUESTIONS[st.idx].type === "fill") {
    const tally = new Map();
    for (const p of ps) { const a = p.answers?.[st.idx]; if (a?.text) tally.set(a.text, (tally.get(a.text) || 0) + 1); }
    const right = new Set(QUESTIONS[st.idx].accept.map(norm));
    live.words = [...tally].sort((a, b) => b[1] - a[1]).slice(0, 40)
      .map(([w, c]) => (st.phase === "reveal" ? { w, c, ok: right.has(w) } : { w, c }));
  }
  return live;
}

export default async (req) => {
  const s = getStore({ name: "review-lab-games", consistency: "strong" });

  if (req.method === "GET") {
    const u = new URL(req.url);
    // the big screen asks which game the host created last, so it can join by itself
    if (u.searchParams.get("current")) {
      const c = await s.get("current", { type: "json" });
      if (!c || Date.now() - c.t > CURRENT_TTL || !(await s.get(sk(c.pin)))) return bad("No game yet", 404);
      return json({ pin: c.pin, t: c.t });
    }
    const pin = u.searchParams.get("pin");
    if (!okPin(pin)) return bad("Invalid PIN");
    const st = await s.get(sk(pin), { type: "json" });
    if (!st) return bad("Game not found", 404);
    const ps = await playersOf(s, pin);

    // the server closes a question by itself when time is up or everyone has answered
    if (st.phase === "question") {
      const done = ps.filter((p) => p.answers?.[st.idx]).length;
      if (Date.now() > st.startedAt + LIMIT + GRACE || (ps.length && done === ps.length)) {
        reveal(st, ps);
        await s.setJSON(sk(pin), st);
      }
    }

    const { key, ...pub } = st;
    pub.now = Date.now();
    pub.live = liveOf(st, ps);
    if (u.searchParams.get("screen")) {
      const c = await s.get("current", { type: "json" });
      if (c && c.pin !== pin && c.t > st.created) pub.current = c.pin;
    }
    const isHost = u.searchParams.get("key") === key;
    if (isHost) {
      pub.host = true;
      if (st.mode === "quiz" && (st.phase === "question" || st.phase === "reveal")) pub.secret = answerText(QUESTIONS[st.idx]);
    }

    const id = u.searchParams.get("id");
    if (okId(id)) {
      const p = ps.find((x) => x.id === id);
      if (p) {
        const rank = (st.board || []).findIndex((b) => b.id === id);
        pub.me = { name: p.name, score: p.score || 0, streak: p.streak || 0, answer: p.answers?.[st.idx] ?? null, rating: p.ratings?.[st.idx] ?? null, rank: rank >= 0 ? rank + 1 : null };
      }
    }
    // other people's ids stay on the server
    if (pub.board) pub.board = pub.board.slice(0, 8).map(({ name, score, gain, prev }) => ({ name, score, gain, prev }));
    return json(pub);
  }

  if (req.method !== "POST") return bad("Method not allowed", 405);
  let b;
  try { b = await req.json(); } catch { return bad("Invalid JSON"); }

  if (b.action === "create") {
    const pass = process.env.HOST_PASSWORD;
    if (!pass) return bad("The host password is not set on Netlify (HOST_PASSWORD).", 500);
    if (b.password !== pass) return bad("Wrong host password", 403);
    let pin;
    for (let i = 0; i < 8; i++) {
      const c = String(100000 + Math.floor(Math.random() * 900000));
      if (!(await s.get(sk(c)))) { pin = c; break; }
    }
    if (!pin) return bad("Try again", 503);
    const key = crypto.randomUUID().replace(/-/g, "");
    const created = Date.now();
    await s.setJSON(sk(pin), { pin, key, mode: null, phase: "lobby", idx: -1, total: 0, created });
    await s.setJSON("current", { pin, t: created });
    return json({ pin, key });
  }

  if (!okPin(b.pin)) return bad("Invalid PIN");
  const st = await s.get(sk(b.pin), { type: "json" });
  if (!st) return bad("Game not found", 404);

  if (["next", "prev", "goto", "start", "lobby"].includes(b.action)) {
    if (b.key !== st.key) return bad("Only the host can do this", 403);
    const ps = await playersOf(s, b.pin);
    if (b.action === "next") {
      // a double tap on the remote must not skip a step
      if (b.from && b.from !== `${st.phase}:${st.idx}`) return json({ ok: true });
      advance(st, ps);
    } else if (b.action === "prev" || b.action === "goto") {
      if (st.mode !== "slides" || st.phase !== "slide") return bad("The presentation is not on screen");
      const to = b.action === "prev" ? st.idx - 1 : Number(b.idx);
      if (Number.isInteger(to) && to >= 0 && to < st.total) st.idx = to;
    } else if (b.action === "start") {
      if (!["quiz", "rate", "slides"].includes(b.mode)) return bad("Unknown mode");
      const total = Number(b.total);
      if (b.mode === "slides" && !(Number.isInteger(total) && total >= 1 && total <= 60)) return bad("No slides found");
      await start(s, st, ps, b.mode, total);
    } else {
      st.phase = "lobby";
    }
    await s.setJSON(sk(b.pin), st);
    return json({ ok: true });
  }

  if (!okId(b.id)) return bad("Invalid player");
  const key = pk(b.pin, b.id);

  if (b.action === "join") {
    const name = String(b.name || "").trim().replace(/\s+/g, " ").slice(0, 20);
    if (!name) return bad("Type a name");
    const prev = await s.get(key, { type: "json" });
    await s.setJSON(key, { ...(prev || { answers: {}, ratings: {}, score: 0, streak: 0, joined: Date.now() }), id: b.id, name });
    return json({ ok: true });
  }

  const p = await s.get(key, { type: "json" });
  if (!p) return bad("Join the game first", 403);

  if (b.action === "answer") {
    if (st.mode !== "quiz" || st.phase !== "question") return bad("Time is up");
    if (p.answers?.[st.idx]) return json({ ok: true });
    const elapsed = Date.now() - st.startedAt;
    if (elapsed < 0) return bad("Wait for the question to start");
    if (elapsed > LIMIT + GRACE) return bad("Time is up");
    const q = QUESTIONS[st.idx];
    const ok = q.type === "mc" ? Number(b.choice) === q.answer : q.accept.some((a) => norm(a) === norm(b.text));
    const pts = ok ? Math.round(1000 - 500 * Math.min(1, elapsed / LIMIT)) : 0;
    p.answers = { ...p.answers, [st.idx]: { choice: q.type === "mc" ? Number(b.choice) : -1, text: q.type === "fill" ? norm(b.text).slice(0, 24) : undefined, ok, pts } };
    p.score = (p.score || 0) + pts;
    p.streak = ok ? (p.streak || 0) + 1 : 0;
    await s.setJSON(key, p);
    return json({ ok: true });
  }

  if (b.action === "rate") {
    const stars = Number(b.stars);
    if (st.mode !== "rate" || st.phase !== "rate") return bad("Rating is closed");
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) return bad("Invalid rating");
    p.ratings = { ...p.ratings, [st.idx]: stars };
    await s.setJSON(key, p);
    return json({ ok: true });
  }

  return bad("Unknown action");
};

export const config = { path: "/api/game" };
