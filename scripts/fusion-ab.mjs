// Pure-exploration A/B for the "fusion" (panel + judge) pattern, à la
// OpenRouter Fusion / freellmapi#326. Uses OpenRouter free models only.
// Usage: node --env-file=.env.exploration scripts/fusion-ab.mjs
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

const KEY = process.env.OPENROUTER_API_KEY
if (!KEY) throw new Error('OPENROUTER_API_KEY not set (run with --env-file=.env.exploration)')

// A diverse chain ordered by preference. Panel slots fill from the front,
// skipping cooled-down/429 models and preserving family diversity — the same
// servability-filter + chain-refill freellmapi uses. Roles are assigned per
// task from whoever actually answered.
// Trimmed to models that served reliably in earlier runs, kept diverse across
// families. Dropped: laguna-m.1 (200-600s tail), nemotron-ultra-550b (slow +
// empty-prone as judge), lfm-1.2b (too weak), dolphin/qwen-coder/hermes (429-prone).
// 8 models keeps a 3-task run (~9 calls/task incl. judge) under the ~50/day free cap.
const CHAIN = [
  'openai/gpt-oss-120b:free', // OpenAI (open weights)
  'google/gemma-4-31b-it:free', // Google — same family as prod (Gemma)
  'nvidia/nemotron-3-super-120b-a12b:free', // NVIDIA
  'cohere/north-mini-code:free', // Cohere — most concrete writer in W1
  'meta-llama/llama-3.3-70b-instruct:free', // Meta (429-prone → refill covers it)
  'qwen/qwen3-next-80b-a3b-instruct:free', // Qwen / Alibaba
  'openai/gpt-oss-20b:free', // OpenAI small
  'poolside/laguna-xs.2:free', // Poolside (fast variant)
]
const K = 4 // panel size
// Fast + reliable judges first (nemotron-super: ~7-16s, never returned empty at 8192).
const JUDGE_PREF = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'openai/gpt-oss-120b:free',
  'cohere/north-mini-code:free',
]
const SOLO_PREF = [
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'cohere/north-mini-code:free',
]
const family = (id) => id.split('/')[0]

// Open-ended generation only. These are the tasks where panel+judge *should* help
// (chongjiazhen's thesis) AND where it can hurt (regression-to-mean / voice-flattening).
// Two mirror pst-careers-poster directly: write energetic, concrete, non-fabricated
// prose from deliberately dull source. Evaluation is qualitative — judge vs the best
// individual answer vs solo, watching specifically for: (a) concreteness preserved,
// (b) voice not averaged into mush, (c) nothing invented beyond the source.
const TASKS = [
  {
    id: 'hook-from-source',
    kind: 'open',
    answer: null,
    // Mirrors generateContent's intro call: agencyDescription + jobResponsibilities substrate.
    prompt:
      'You are writing a social-post hook for a public-service tech hiring campaign. ' +
      'Using ONLY the source material below, write a two-paragraph hook (about 90 words total) ' +
      'that is energetic and concrete — surface the specific systems, tools and who the work ' +
      'serves — without inventing anything not present in the source. British English. ' +
      "No markdown, no emoji, no hashtags, and avoid clichés like 'passionate', 'cutting-edge', " +
      "'game-changer', 'fast-paced'.\n\n" +
      'SOURCE — agency description:\n' +
      'The Government Technology Agency builds and operates digital infrastructure for the ' +
      'public sector, including the national digital identity service, a whole-of-government ' +
      'payments rail, and shared data platforms used by more than 80 agencies.\n\n' +
      'SOURCE — role responsibilities:\n' +
      'Design and maintain backend services for the national digital identity platform; operate ' +
      'Kubernetes clusters that absorb peak load during national events; build fraud-detection ' +
      'pipelines that screen authentication attempts in real time; partner with agency teams to ' +
      'onboard new services onto the shared platform.',
  },
  {
    id: 'build-vs-buy-llm',
    kind: 'open',
    answer: null,
    // Open-ended explanatory synthesis with several valid framings (cost, control, latency,
    // compliance, talent) — exactly the substrate a judge could combine, or blur.
    prompt:
      'Explain to a non-technical government director, in about 130 words, the real trade-offs ' +
      'between running an in-house open-weight LLM service versus paying for a commercial API. ' +
      'Be concrete and balanced, cover both the upside and the cost of each, avoid jargon and ' +
      'avoid clichés.',
  },
  {
    id: 'micro-arg',
    kind: 'open',
    answer: null,
    prompt:
      'Write a tight argument (about 120 words) for why a small startup team of 5 engineers ' +
      'should NOT adopt a microservices architecture. Be concrete and avoid clichés.',
  },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function callOnce(model, messages, { max, temp }) {
  // ttfb_ms = time to first byte (headers back); ms = full body received.
  const t0 = Date.now()
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'X-Title': 'fusion-exploration',
    },
    body: JSON.stringify({ model, messages, max_tokens: max, temperature: temp }),
  })
  const ttfb = Date.now() - t0
  const json = await res.json()
  const ms = Date.now() - t0
  if (!res.ok) {
    const meta = json?.error?.metadata
    return {
      model,
      ok: false,
      status: res.status,
      error: json?.error?.message || res.status,
      upstream: meta?.raw,
      retryAfter: meta?.retry_after_seconds,
      ttfb,
      ms,
    }
  }
  return {
    model,
    ok: true,
    id: json.id,
    text: json.choices?.[0]?.message?.content ?? '',
    finish: json.choices?.[0]?.finish_reason,
    provider: json.provider,
    usage: json.usage,
    ttfb,
    ms,
  }
}

// Measure the script's OWN CPU time (user+system) around a region — this is real
// orchestration work, and excludes time blocked on `await fetch` (I/O wait burns
// no CPU). Returns a stop() that yields { cpuMs, wallMs } for the region.
function meter() {
  const cpu0 = process.cpuUsage()
  const w0 = performance.now()
  return () => {
    const c = process.cpuUsage(cpu0)
    return { cpuMs: (c.user + c.system) / 1000, wallMs: performance.now() - w0 }
  }
}

const MAX_TOKENS = 8192 // headroom so reasoning-class models don't burn the budget pre-answer
const EMPTY_REROLLS = 2 // re-roll on empty output (reasoning-budget burnout guard)

// Handles 429 (one capped retry) AND empty output (re-roll with escalating temp —
// the prod Gemma lever: temp toward 1.0 breaks the draft->self-critique->empty loop).
async function call(model, messages, { max = MAX_TOKENS, temp = 0.6 } = {}) {
  const wallStart = Date.now()
  const temps = [temp, Math.max(temp, 0.9), 1.0]
  let waited = 0
  let attempts = 0
  let r
  try {
    for (let i = 0; i <= EMPTY_REROLLS; i++) {
      const t = temps[Math.min(i, temps.length - 1)]
      attempts++
      r = await callOnce(model, messages, { max, temp: t })
      if (!r.ok && r.status === 429) {
        const w = Math.min((r.retryAfter ?? 5) * 1000, 18000)
        waited += w
        await sleep(w)
        r = await callOnce(model, messages, { max, temp: t })
      }
      if (r.ok && r.text?.trim()) break // real content -> done
      if (!r.ok) break // hard (non-429) error -> don't waste re-rolls
      // else: ok but empty -> re-roll at higher temp
    }
    return { ...r, waitedMs: waited, attempts, wallMs: Date.now() - wallStart }
  } catch (e) {
    return { model, ok: false, error: String(e), waitedMs: waited, attempts, wallMs: Date.now() - wallStart }
  }
}

function judgePrompt(userPrompt, answers) {
  const panel = answers
    .map((a, i) => `### Candidate answer ${i + 1}\n${a.text}`)
    .join('\n\n')
  return [
    {
      role: 'system',
      content:
        'You are a judge producing ONE final answer from several independent drafts. ' +
        'The user never sees the drafts, so your answer must stand completely alone. ' +
        'Keep the most concrete and specific material; adopt the strongest, most distinctive ' +
        'voice rather than averaging the drafts into bland consensus; drop weak or repeated ' +
        'points. Do NOT merely combine everything — obey every constraint in the original ' +
        'request (length, format, style, language) exactly, as if you were answering it fresh. ' +
        'Invent nothing not supported by the drafts. Do not mention the drafts or that you are ' +
        'synthesizing. Output only the final answer.',
    },
    {
      role: 'user',
      content: `Original user request:\n${userPrompt}\n\n${panel}\n\nNow write the single best final answer.`,
    },
  ]
}

// Assign roles from whoever actually answered, preserving family diversity.
function assignRoles(results) {
  const ok = (m) => results.find((r) => r.model === m && r.ok && r.text?.trim())
  const succeeded = results.filter((r) => r.ok && r.text?.trim())

  const panel = []
  const fams = new Set()
  for (const r of succeeded) {
    if (panel.length >= K) break
    if (fams.has(family(r.model))) continue // diversity: one per family
    panel.push(r)
    fams.add(family(r.model))
  }
  const panelModels = new Set(panel.map((r) => r.model))
  const panelFams = new Set(panel.map((r) => family(r.model)))

  const judge =
    JUDGE_PREF.map(ok).find((r) => r && !panelFams.has(family(r.model))) || // prefer off-panel family
    JUDGE_PREF.map(ok).find(Boolean) || // else a reliable preferred judge (may be a panelist)
    succeeded.find((r) => !panelModels.has(r.model)) || // else any off-panel survivor
    succeeded[0] ||
    null
  const solo = SOLO_PREF.map(ok).find(Boolean) || succeeded[0] || null
  return { panel, judge, solo }
}

const overall = meter()
const out = { meta: { chain: CHAIN, K, judgePref: JUDGE_PREF, soloPref: SOLO_PREF }, tasks: [] }

for (const task of TASKS) {
  process.stderr.write(`\n=== ${task.id} ===\n`)
  const msgs = [{ role: 'user', content: task.prompt }]

  // Fire the whole chain concurrently; roles are assigned from survivors.
  const fired = await Promise.all(CHAIN.map((m) => call(m, msgs)))

  // --- orchestration: pure script work, no awaits (measure its CPU) ---
  const orch = meter()
  const { panel, judge: judgeModel, solo } = assignRoles(fired)
  const quorum = panel.length >= 2
  const jPrompt = quorum && judgeModel ? judgePrompt(task.prompt, panel) : null
  const orchCpu = orch()

  for (const r of fired) {
    const tag = panel.includes(r) ? 'PANEL' : r === solo ? 'solo ' : r === judgeModel ? 'judge' : '  -  '
    process.stderr.write(
      `  [${tag}] ${r.model.split('/')[1].padEnd(34)} ${r.ok ? String(r.ms).padStart(6) + 'ms via ' + r.provider : 'FAIL ' + (r.status || '') + ' ' + (r.error || '')}\n`,
    )
  }

  // Judge runs serially after the panel barrier (it needs the panel's answers).
  let judgeResult = { ok: false, error: quorum ? 'no judge available' : 'quorum<2' }
  if (jPrompt && judgeModel) {
    judgeResult = await call(judgeModel.model, jPrompt, { temp: 0.4 })
    process.stderr.write(`  judge -> ${judgeModel.model.split('/')[1]}: ${judgeResult.ok ? judgeResult.ms + 'ms' : 'FAIL ' + judgeResult.error}\n`)
  }

  // Modeled fusion latency: only wait on the chosen panel (barrier = slowest of K),
  // then the judge serially. Distinct from the script's fire-all wall.
  const panelBarrierMs = panel.length ? Math.max(...panel.map((r) => r.wallMs)) : 0
  const fusionWallMs = panelBarrierMs + (judgeResult.ok ? judgeResult.wallMs : 0)
  const timing = {
    orchCpuMs: +orchCpu.cpuMs.toFixed(2), // script's own compute for this fusion
    panelBarrierMs, // wall waiting on the panel (parallel)
    judgeMs: judgeResult.wallMs ?? null, // wall waiting on the judge (serial)
    fusionWallMs, // total wall a real fusion request would see
    soloMs: solo?.wallMs ?? null, // single-model baseline wall
  }
  process.stderr.write(
    `  timing: orchCPU ${timing.orchCpuMs}ms | panelBarrier ${panelBarrierMs}ms | judge ${timing.judgeMs}ms | fusionWall ${fusionWallMs}ms | solo ${timing.soloMs}ms\n`,
  )

  out.tasks.push({
    task,
    panelModels: panel.map((r) => r.model),
    judgeModel: judgeModel?.model ?? null,
    soloModel: solo?.model ?? null,
    quorum,
    timing,
    fired,
    judge: judgeResult,
  })
}

const total = overall()
out.meta.totals = {
  scriptCpuMs: +total.cpuMs.toFixed(2), // all real compute the orchestrator did
  scriptWallMs: +total.wallMs.toFixed(0), // wall incl. all LLM I/O wait
  ioWaitPct: +(100 * (1 - total.cpuMs / total.wallMs)).toFixed(2), // share spent blocked on LLMs
}
process.stderr.write(
  `\nTOTALS: script CPU ${out.meta.totals.scriptCpuMs}ms of ${out.meta.totals.scriptWallMs}ms wall — ${out.meta.totals.ioWaitPct}% spent waiting on LLMs\n`,
)

writeFileSync(join(HERE, 'fusion-results.json'), JSON.stringify(out, null, 2))
process.stderr.write(`wrote ${join(HERE, 'fusion-results.json')}\n`)
