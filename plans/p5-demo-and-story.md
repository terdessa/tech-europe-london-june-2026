# P5 — Demo & Story (no coding required)

> Read [`CLAUDE.md`](../CLAUDE.md) for what we're building and [`HACKATHON_MANUAL.md`](../HACKATHON_MANUAL.md) for the rules. You don't need to read the technical plans — this one is self-contained.

## Your mission

You make the team **win the room.** The engineers build Flash; you make sure the judges *understand it, believe it, and remember it.* You own the story, the live demo, the 2-minute video, the slides, the README polish, and the submission. You are also the **clock** — you keep everyone aimed at a working demo by 19:00.

This is one of the most important roles: a great project with a confusing demo loses to a simple project with a clear one.

## What "winning" requires (from the manual)
By **19:00** the team must submit:
1. A **public GitHub repo** with a clear **README**.
2. A **2-minute video demo** (Loom or similar) — explaining the solution + a live walkthrough.
3. Confirmation in the submission that we used **Superlinked, n8n, and SLNG** (our partners).
4. An **Aikido screenshot** (security report) for the €1000 bonus.

Judging = **creativity + technical complexity + partner usage.** Your job is to make all three obvious.

## The one-sentence pitch (memorize this)
> "Google Meet gives you a summary *after* the meeting. **Flash** is an AI teammate that *joins* the meeting, helps you live — answers questions and draws diagrams on command — and turns the whole discussion into a brain you can keep asking afterward."

## Phase 1 — Own the narrative (early)
1. Learn the demo flow cold (below). Sit with the team for 10 min so you can explain it in plain words.
2. Write the **pitch**: problem (meetings are passive, info gets lost) → what Flash does → why it's different → the partners. Keep it to ~45 seconds spoken.
3. Draft **3–5 slides**: title, problem, how it works (use the diagram from `ARCHITECTURE.md`), partners used, the ask. Clean and minimal.

## Phase 2 — Prepare the demo content
The live demo is **two people + Flash**. Prepare the script so it never relies on improvisation:
1. **Prep doc** (uploaded before the meeting): a short "Q3 budget plan" doc — so Flash's diagram is *grounded* and accurate. Coordinate with P4 on uploading it.
2. **The spoken script** (rehearse with a teammate):
   - Person A: "Okay, for Q3 we have **5,000** budget. We spent **500** on design, **1,000** on ads, so we've got **3,500** left."
   - Person B: "Can we see that clearly?"
   - Person A: **"Hey Flash, make a diagram of our budget."** → *(diagram appears)*
   - Person A: "Hey Flash, what should we cut to save 1,000?" → *(grounded answer)*
   - *(End meeting)* → open the post-meeting app → "Based on the meeting, draft next steps." → *(answer)*
3. This hits every selling point: live action, grounding, diagram, voice, **and** the after-meeting reuse.

## Phase 3 — Record the 2-minute video
1. **Pre-warm** everything before recording (first AI call is slow; do a throwaway run).
2. Structure (≈2:00):
   - 0:00–0:15 — problem + one-sentence pitch.
   - 0:15–1:15 — **live demo** (the script above): diagram on command + voice answer.
   - 1:15–1:45 — the **after-meeting** brain (ask a question over the full context).
   - 1:45–2:00 — partners used (Gemini, Superlinked, n8n, SLNG) + Aikido security, and close.
3. Record a **clean take**; trim dead air. Keep it under 2:00 (hard limit).
4. **Always record a backup take** in case something breaks live at 20:00.

## Phase 4 — README + submission
1. With an engineer, make the README clear: what it is, the architecture diagram, how to run it, **which partners and how** (judges look for this).
2. Fill the submission form: link repo + video; **explicitly name Superlinked, n8n, SLNG**.
3. Collect the **Aikido screenshot** from P4 and attach it.
4. Double-check: repo is public, no secrets committed.

## Phase 5 — Be the clock
- ~14:00: is the **core demo path** (diagram + post-meeting) working? If not, raise it loudly — we cut scope, not the demo.
- ~17:00: lock features; everyone moves to polish + integration.
- ~18:00: record the video (don't leave it to the last minute).
- 18:45: submit. Don't wait for 18:59.

## Checklist
- [ ] One-sentence pitch + 3–5 slides
- [ ] Prep doc + rehearsed demo script
- [ ] 2-min Loom (clean take + backup)
- [ ] README clear on partners
- [ ] Submission filed (repo + video + partners named)
- [ ] Aikido screenshot attached
- [ ] Kept the team on the clock

## If something breaks (stay calm)
- Live demo fails at 20:00 → **play the backup video.** This is why we record one.
- A feature isn't ready → demo only what works; never apologize for what's missing, just show the wow (the diagram-on-command).
- Keep the energy up — judges remember confidence and a clear story.
