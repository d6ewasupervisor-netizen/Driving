// Study system: question banks, SM-2 mastery, study-terminal sets, exam_40.
// Pure data + functions; no engine or storage dependency. The game/dashboard
// persists MasteryRecord rows and Attempt rows however it likes.

export interface Question {
  id: string;
  ch: number;                 // 1..8, see QuestionBankMeta.chapters
  difficulty: 1 | 2 | 3;
  guide_ref?: string;
  tags?: string[];
  in_world_trigger?: string;  // sign/cue id that can pop this in-world
  prompt: string;
  choices: string[];
  answer: number;             // index into choices
  explanation: string;
}

export interface QuestionBankFile {
  meta: {
    schema_version: string;
    bank: string;
    supplements?: string;
    exam?: { questions: number; required: number; default_chapters: number[] };
    chapters?: Record<string, { codex: string; topics: string }>;
    [k: string]: unknown;
  };
  questions: Question[];
}

export const CHAPTERS: Record<number, { codex: string; topics: string }> = {
  1: { codex: "Who's Allowed",  topics: "Licensing, permits, intermediate rules, DUI thresholds, insurance" },
  2: { codex: "On Signs",       topics: "Signs, signals, pavement markings, zones" },
  3: { codex: "On Going First", topics: "Right-of-way at every kind of intersection" },
  4: { codex: "On Lanes",       topics: "Lane use, turning, steering, parking, backing" },
  5: { codex: "On Stopping",    topics: "Speed, space, following time, freeways, night range" },
  6: { codex: "On Snow",        topics: "Adverse conditions, skids, vehicle failures, crash response" },
  7: { codex: "On Big Rigs",    topics: "Sharing the road: trucks, bikes, buses, trains, emergency zones, road rage" },
  8: { codex: "On Passengers",  topics: "Distraction, fatigue, impairment, occupant protection" },
};

export const EXAM = { questions: 40, required: 32, default_chapters: [1, 2, 3, 4, 5] } as const;

// ------------------------------------------------------------------ bank
export class QuestionBank {
  private byId = new Map<string, Question>();
  private byTrigger = new Map<string, Question[]>();

  load(file: QuestionBankFile): this {
    for (const q of file.questions) {
      if (this.byId.has(q.id)) throw new Error(`Duplicate question id: ${q.id}`);
      if (q.answer < 0 || q.answer >= q.choices.length) throw new Error(`Bad answer index: ${q.id}`);
      this.byId.set(q.id, q);
      if (q.in_world_trigger) {
        const l = this.byTrigger.get(q.in_world_trigger) ?? [];
        l.push(q);
        this.byTrigger.set(q.in_world_trigger, l);
      }
    }
    return this;
  }
  get(id: string): Question | undefined { return this.byId.get(id); }
  all(): Question[] { return [...this.byId.values()]; }
  byChapter(ch: number): Question[] { return this.all().filter((q) => q.ch === ch); }
  forTrigger(trigger: string): Question[] { return this.byTrigger.get(trigger) ?? []; }
  get size(): number { return this.byId.size; }
}

// ------------------------------------------------------------------ SM-2
export interface MasteryRecord {
  question_id: string;
  ease: number;        // EF, starts 2.5, floor 1.3
  interval_days: number;
  repetitions: number; // consecutive correct
  due_at: number;      // epoch ms
  last_seen_at: number;
  seen: number;        // total attempts
  correct: number;     // total correct
}

export function newMastery(question_id: string, now: number): MasteryRecord {
  return { question_id, ease: 2.5, interval_days: 0, repetitions: 0, due_at: now, last_seen_at: 0, seen: 0, correct: 0 };
}

/**
 * Standard SM-2 update. Quality: 5 = fast+correct, 4 = correct, 3 = slow correct,
 * 0..2 = wrong. We map from (correct, response_ms) so callers don't grade by hand.
 */
export function gradeQuality(correct: boolean, responseMs: number): 0 | 3 | 4 | 5 {
  if (!correct) return 0;
  if (responseMs < 4000) return 5;
  if (responseMs < 10000) return 4;
  return 3;
}

export function sm2Update(m: MasteryRecord, quality: 0 | 1 | 2 | 3 | 4 | 5, now: number): MasteryRecord {
  const DAY = 86_400_000;
  const r = { ...m, seen: m.seen + 1, last_seen_at: now };
  if (quality >= 3) {
    r.correct = m.correct + 1;
    if (m.repetitions === 0) r.interval_days = 1;
    else if (m.repetitions === 1) r.interval_days = 6;
    else r.interval_days = Math.round(m.interval_days * m.ease);
    r.repetitions = m.repetitions + 1;
  } else {
    r.repetitions = 0;
    r.interval_days = 1;
  }
  r.ease = Math.max(1.3, m.ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));
  // Wrong answers come back within the session, not tomorrow.
  r.due_at = quality >= 3 ? now + r.interval_days * DAY : now + 10 * 60_000;
  return r;
}

/** 0..1 mastery estimate for a record (used for weak-chapter picks and readiness). */
export function masteryScore(m: MasteryRecord | undefined): number {
  if (!m || m.seen === 0) return 0;
  const acc = m.correct / m.seen;
  const rep = Math.min(m.repetitions, 4) / 4;
  return 0.6 * acc + 0.4 * rep;
}

export function chapterMastery(bank: QuestionBank, mastery: Map<string, MasteryRecord>): Record<number, number> {
  const out: Record<number, number> = {};
  for (let ch = 1; ch <= 8; ch++) {
    const qs = bank.byChapter(ch);
    out[ch] = qs.length ? qs.reduce((s, q) => s + masteryScore(mastery.get(q.id)), 0) / qs.length : 0;
  }
  return out;
}

/** Predicted pass probability on a 40/32 exam over the given chapters. */
export function readiness(bank: QuestionBank, mastery: Map<string, MasteryRecord>, chapters: number[] = [...EXAM.default_chapters]): number {
  const cm = chapterMastery(bank, mastery);
  const p = chapters.reduce((s, c) => s + cm[c], 0) / chapters.length; // mean per-question accuracy
  // Probability of >= 32 correct out of 40 with per-question p (normal approx).
  const mu = 40 * p, sd = Math.sqrt(40 * p * (1 - p)) || 1e-6;
  const z = (31.5 - mu) / sd;
  return 1 - normalCdf(z);
}
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

// ------------------------------------------------------------------ study terminal
export interface StudySetOptions {
  size?: number;              // default 10
  chapters?: number[];        // default all
  now: number;
  random: () => number;
}

/** Due-first draw for the safehouse terminal. Returns question ids. */
export function buildStudySet(bank: QuestionBank, mastery: Map<string, MasteryRecord>, opts: StudySetOptions): string[] {
  const size = opts.size ?? 10;
  const pool = bank.all().filter((q) => !opts.chapters || opts.chapters.includes(q.ch));
  const due = pool.filter((q) => mastery.has(q.id) && mastery.get(q.id)!.due_at <= opts.now);
  const unseen = pool.filter((q) => !mastery.has(q.id));
  const rest = pool.filter((q) => !due.includes(q) && !unseen.includes(q));
  // weakest-first inside "due"; random inside unseen/rest
  due.sort((a, b) => masteryScore(mastery.get(a.id)) - masteryScore(mastery.get(b.id)));
  shuffle(unseen, opts.random); shuffle(rest, opts.random);
  return [...due, ...unseen, ...rest].slice(0, size).map((q) => q.id);
}

export function dueCount(bank: QuestionBank, mastery: Map<string, MasteryRecord>, now: number): number {
  return bank.all().filter((q) => mastery.has(q.id) && mastery.get(q.id)!.due_at <= now).length;
}

// ------------------------------------------------------------------ exam_40
export interface ExamDrawOptions {
  chapters?: number[];        // default EXAM.default_chapters; parent "full guide" toggle → 1..8
  now: number;
  random: () => number;
  weaknessWeight?: number;    // 0 = uniform, 1 = strongly favor weak items (default 0.6)
}

/** Draws 40 ids, spread across chapters, weighted toward low mastery. */
export function drawExam(bank: QuestionBank, mastery: Map<string, MasteryRecord>, opts: ExamDrawOptions): string[] {
  const chapters = opts.chapters ?? [...EXAM.default_chapters];
  const w = opts.weaknessWeight ?? 0.6;
  const perChapter = Math.floor(EXAM.questions / chapters.length);
  let remainder = EXAM.questions - perChapter * chapters.length;
  const out: string[] = [];
  for (const ch of chapters) {
    const qs = bank.byChapter(ch);
    const n = perChapter + (remainder-- > 0 ? 1 : 0);
    out.push(...weightedSample(qs, n, (q) => 1 + w * (1 - masteryScore(mastery.get(q.id))) * 3, opts.random).map((q) => q.id));
  }
  shuffle(out, opts.random);
  return out.slice(0, EXAM.questions);
}

export interface ExamAnswer { question_id: string; chosen: number | null; response_ms: number }

export interface ExamResult {
  exam_score: number;         // 0..40
  exam_missed: number;        // 40 - score
  exam_short: number;         // max(0, 32 - score)
  exam_weak_chapter: number;  // 0 when perfect; else chapter with most misses (tie → lowest mastery)
  passed: boolean;
  by_chapter: Record<number, { asked: number; correct: number }>;
  missed_ids: string[];
}

/** Scores an exam and sets the four vars the Act 4 dialogue reads. */
export function scoreExam(bank: QuestionBank, answers: ExamAnswer[], mastery: Map<string, MasteryRecord>): ExamResult {
  const by: Record<number, { asked: number; correct: number }> = {};
  const missed: string[] = [];
  let score = 0;
  for (const a of answers) {
    const q = bank.get(a.question_id);
    if (!q) continue;
    const b = (by[q.ch] ??= { asked: 0, correct: 0 });
    b.asked++;
    if (a.chosen === q.answer) { score++; b.correct++; } else missed.push(q.id);
  }
  const exam_missed = EXAM.questions - score;
  const exam_short = Math.max(0, EXAM.required - score);
  let weak = 0;
  if (exam_missed > 0) {
    const cm = chapterMastery(bank, mastery);
    const ranked = Object.entries(by)
      .map(([ch, v]) => ({ ch: Number(ch), misses: v.asked - v.correct, mastery: cm[Number(ch)] }))
      .sort((x, y) => y.misses - x.misses || x.mastery - y.mastery);
    weak = ranked[0]?.ch ?? 0;
  }
  return { exam_score: score, exam_missed, exam_short, exam_weak_chapter: weak, passed: score >= EXAM.required, by_chapter: by, missed_ids: missed };
}

// ------------------------------------------------------------------ TP payout
/** Trade Points for a correct answer: difficulty × first-time bonus. */
export function tpForAnswer(q: Question, m: MasteryRecord | undefined, correct: boolean): number {
  if (!correct) return 0;
  const base = q.difficulty * 5;
  const firstTime = !m || m.correct === 0;
  return firstTime ? base * 2 : base;
}

// ------------------------------------------------------------------ utils
function shuffle<T>(a: T[], random: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function weightedSample<T>(items: T[], n: number, weight: (t: T) => number, random: () => number): T[] {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, t) => s + weight(t), 0);
    let r = random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) { r -= weight(pool[idx]); if (r <= 0) break; }
    out.push(pool.splice(Math.min(idx, pool.length - 1), 1)[0]);
  }
  return out;
}
