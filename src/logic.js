// QVAC Decision Lean Finder — core logic.
// Given a decision plus the user's own pros and cons, produces a balanced
// summary and states which way the pros/cons actually lean, grounded ONLY
// in what was listed. Never invents new pros or cons.

import { completion } from "@qvac/sdk";

function looksUnusable(text) {
  if (!text || text.trim().length === 0) return true;
  if (text.length > 900) return true;
  const bad = ["i cannot", "i can't", "as an ai", "i'm not able", "i am not able"];
  const lower = text.toLowerCase();
  return bad.some((phrase) => lower.includes(phrase));
}

function cleanText(text) {
  return text
    .trim()
    .replace(/^here'?s[^:\n]*:\s*/i, "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function splitItems(raw) {
  return raw
    .split(/\n|;/)
    .map((s) => s.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter((s) => s.length > 1);
}

function significantWords(s) {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 4);
}

// Grounding check: every pro AND every con listed must be represented by at
// least one significant word in the summary, so nothing the user listed is
// silently dropped, and the count-based lean is computed from what they
// actually gave us — never invented pros/cons.
function allItemsCovered(text, items) {
  const lower = text.toLowerCase();
  return items.every((item) => {
    let words = significantWords(item);
    // A pro/con made only of short words (e.g. "more fun", "less pay")
    // used to leave `words` empty, which made the check trivially pass
    // without actually confirming the item survived into the summary.
    if (words.length === 0) {
      words = item.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
    }
    if (words.length === 0) return true;
    return words.some((w) => lower.includes(w));
  });
}

// The "which way it leans" call is computed deterministically from the
// counts the user actually gave — never left to the model to assert.
function computeLean(pros, cons) {
  if (pros.length === cons.length) return "evenly balanced";
  return pros.length > cons.length ? "leaning toward the pros" : "leaning toward the cons";
}

function fallbackSummary(decision, pros, cons) {
  const proText = pros.length ? `On the pro side: ${pros.join("; ")}.` : "No pros were listed.";
  const conText = cons.length ? `On the con side: ${cons.join("; ")}.` : "No cons were listed.";
  return `For the decision "${decision}": ${proText} ${conText}`;
}

export async function findLean(modelId, body) {
  const decision = (body.decision || "").trim();
  const prosRaw = (body.pros || "").trim();
  const consRaw = (body.cons || "").trim();
  if (!decision || !prosRaw || !consRaw) {
    const err = new Error("Please fill in the decision, your pros, and your cons.");
    err.statusCode = 400;
    throw err;
  }
  const pros = splitItems(prosRaw);
  const cons = splitItems(consRaw);
  if (pros.length === 0 || cons.length === 0) {
    const err = new Error("Please list at least one pro and one con.");
    err.statusCode = 400;
    throw err;
  }

  const lean = computeLean(pros, cons);

  const run = completion({
    modelId,
    history: [
      {
        role: "system",
        content:
          "You write balanced pro/con summaries. Given a decision, a list of " +
          "the person's ACTUAL pros, and their ACTUAL cons, write one short " +
          "summary paragraph (3-5 sentences) that mentions EVERY pro and " +
          "EVERY con listed, and states which way they lean overall. NEVER " +
          "invent new pros or cons that weren't given. Reply with ONLY the " +
          "paragraph, no preamble.",
      },
      {
        role: "user",
        content:
          "Decision: Take a new job offer. Pros: higher salary; more interesting work. Cons: longer commute; less job security at a startup.",
      },
      {
        role: "assistant",
        content:
          "Taking the new job offer comes with real upsides: a higher salary and more interesting " +
          "work to look forward to. On the other hand, it means a longer commute and less job " +
          "security since it's a startup. With two pros and two cons, this one is close to evenly " +
          "balanced, so the deciding factor may come down to which tradeoffs matter more personally.",
      },
      {
        role: "user",
        content: `Decision: ${decision}. Pros: ${pros.join("; ")}. Cons: ${cons.join("; ")}.`,
      },
    ],
    stream: true,
    completionOpts: { temperature: 0.5, maxTokens: 300 },
  });

  let text = "";
  for await (const token of run.tokenStream) text += token;
  text = cleanText(text);

  const usable = !looksUnusable(text) && allItemsCovered(text, [...pros, ...cons]);
  const summary = usable ? text : fallbackSummary(decision, pros, cons);

  return { decision, pros, cons, summary, lean };
}
