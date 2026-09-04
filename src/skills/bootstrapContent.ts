import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KanbrainConfig, SkillEntry, ProfileEntry } from '../types';
import { pickReadableTextColor } from '../view/badgeColor';

export const EXPLAIN_CARD_SKILL_ID = 'explain-card';
export const EXPLAIN_CARD_SKILL_RELATIVE_PATH = '.kanbrain/skills/explain-card.md';
const EXPLAIN_CARD_BUTTON_COLOR = 'b2b2b2';

export const EXPLAIN_CARD_SKILL_CONTENT = `# Skill: Explain Card

## Instructions
Explain this work item to the user in your own words: what it's asking for, why it likely matters given its type/description/parent (if any), and how far along it is based on its status and subtasks (if any). Keep it clear and concise — a short paragraph or a few bullet points, not a restatement of the raw fields above. This is an explanation only — don't take any action on the work item or the Azure DevOps board.
`;

export function buildExplainCardSkillEntry(): SkillEntry {
  return {
    path: EXPLAIN_CARD_SKILL_RELATIVE_PATH,
    label: 'Explain Card',
    buttonColor: EXPLAIN_CARD_BUTTON_COLOR,
    textColor: pickReadableTextColor(`#${EXPLAIN_CARD_BUTTON_COLOR}`).replace(/^#/, ''),
  };
}

export const VALIDATION_COMMENT_SKILL_ID = 'validation-comment';
export const VALIDATION_COMMENT_SKILL_RELATIVE_PATH = '.kanbrain/skills/validation-comment.md';
const VALIDATION_COMMENT_BUTTON_COLOR = '4c8c4a';

export const VALIDATION_COMMENT_SKILL_CONTENT = `# Skill: Work Item Validation Comment (Azure DevOps)

Produces — and, once approved, publishes — a user-validation comment on an Azure DevOps work item: concise, factual, written as a narrative, with reserved slots for screenshots.

**Core principle:** the quality of a validation cannot depend only on what the developer remembered to test. Whoever runs this skill has access to the code, to the acceptance criteria and to the wider context of the requirement — and must use that to **check coverage and surface gaps before writing**, not merely transcribe what was described.

**Second principle, just as important:** the comment is a **record of evidence**, not an audit of the card. It shows that the delivery works from the point of view of whoever uses it. It is not the place for root cause, technical decisions, or for exposing divergences between the card and what was implemented.

## The two modes

The skill serves both to guide a validation that has not happened yet and to document one that already has. Identify the mode in the first exchange and tell the user which one you are using.

**Mode A — validation not executed yet (the default path).** The user has validated only locally, or not at all, and wants the walkthrough before going to a test/staging environment. The skill produces the functional step-by-step that works simultaneously as a **test script** and as the skeleton of the final record. The developer executes it, collects the screenshots, and pastes them over the markers.

**Mode B — validation already executed.** The user describes what they tested; the skill analyses coverage, points out gaps and writes the record. The text describes observed facts. Useful for a later phase, or when someone else — another developer, a PO, a QA — validated and wants the record written up.

**The rule that separates the two modes, and that cannot be violated:** in Mode A every result described in the draft is an **expectation derived from the code**, not an observed fact. State that explicitly to the user when handing over the draft, and instruct: _if any real result differs from the text, tell me before pasting the screenshots — we correct the text, we don't hide the screenshot._ A published comment asserting a result that the screenshot beside it contradicts is worse than no comment at all.

## What you need before starting

The id of the **target** work item (where the comment gets published) and of the work item(s) it evidences — often the same one. Plus some way to read work items and code, and to publish a comment: an MCP server, the Azure DevOps CLI, the REST API. Whatever you cannot reach automatically, ask the user to paste (acceptance criteria, diff, description of the tests).

---

## How to operate

### 1. Gather context

- Read the referenced work item(s) — title, description, acceptance criteria. Never invent the description of what is being validated.
- **Read the comments already on the target work item.** A short, high-return step: it avoids duplicating a scope that is already recorded, and it frequently **defines the scope** of this new comment. If validation has already been published for part of the delivery (child bugs, for instance), the new comment covers the remainder — and you must confirm that scope with the user rather than presuming it.
- If you have access to the repository, read the diff/commits of the delivery. Confirm first that the local reference is current (in a Git repository, \`git fetch\` before comparing against the main branch).
- Without automatic access, ask the user to paste what is missing.
- **Settle the language of the comment here, not while writing.** This skill is written in English; the comment is not necessarily. Take the language from the evidence — the language of the work item and, above all, of the comments already on it, which is the team's actual convention. **If the signals are mixed, absent, or the card is in one language and the user is talking to you in another, ask instead of inferring.** One question costs a line; a comment published in the wrong language has to be rewritten on a card the whole team sees.

### 2. Analyse functional coverage (mandatory, do not skip)

This step is what keeps the comment from becoming a transcript of whatever the developer remembered to test.

**Use the acceptance criteria as input, not as a checklist to transcribe.** Group them by **observable behaviour**, not one by one: several criteria are usually proven by the same screen. For example, "field X is no longer shown", "field Y is no longer shown" and "only fields A, B and C are shown" are a single screenshot of the form. The goal is functional coverage, not a 1:1 correspondence with the card's numbering.

- Re-read the **diff** asking: "what does this code change that whoever tested may not have thought to cover?" — validation added or removed, new error messages, edge cases (empty field, boundary value, malformed input, permission denied), effect on existing/legacy data, failure paths beyond the happy one.
- Do not assume whoever tested has a complete end-user view — it is common to cover only the scenario that motivated the fix.
- Identify what is **not observable in the UI** (typically a server-side restriction). That decides whether there will be a technical section — see step 4.

**Contradictions between the card and the implementation: treat them as information, not as defects.** It is common for a criterion to describe something the implementation solved another way, because the decision was taken in a meeting or a chat and never made it back to the card. When you find one:

- **Raise it with the user**, in the analysis, neutrally: "criterion N describes X; the implementation does Y — do you want me to record it, leave it out, or have you already settled this outside the card?"
- **Do not write the contradiction into the comment**, and do not assert that a criterion "was not met" based only on reading the card. The comment describes what the system does; it does not judge the card and is not a channel for scope disputes.
- Do not edit the card yourself to "align" it.

**Present the gaps to the user before writing**, as a short, objective list, and let them decide: validate now, indicate it was already covered another way, or knowingly accept it as out of scope. Only move on after that check — even when the conclusion is "nothing missing".

### 3. Order the steps the way someone reproduces them, not the way the card lists them

The comment must work as a test script for someone who has never seen the card — a QA, or you yourself three months later. That changes the order of the steps:

- **Respect setup dependencies.** If the test requires a configured profile or record, the step that configures it comes before the step that uses it.
- **Group by actor.** Switching the logged-in user is expensive; put all the steps for the same profile together before switching.
- **One step = one verifiable observation on screen**, with one screenshot that proves it. If a step needs two screenshots to make sense, it is probably two steps.
- **Describe what is seen, not what the code does.** "The Add and Delete buttons are not shown" — not "the directive is hidden when the permission is false".
- **Describe the characteristic a step needs, never a made-up specific.** "A file whose name contains a character outside the allowed set", not an invented \`report#2026.pdf\`. The concrete value is the user's to supply — inventing it commits them to something they did not do.
- When a step has a known and expected limitation (a format with no preview, say), state it in the same sentence, so the reader does not mistake a limitation for a defect.

A walkthrough of 2 to 5 steps covers most cases. Larger deliveries may justify more — the measure is functional coverage without redundancy, not a number.

### 4. Before proposing any check outside the UI, find out the real mechanism

**Skip this whole section when everything in the delivery is observable in the UI — the common case.** It applies only when a behaviour is provable solely by calling the server directly, typically "a user without permission cannot save even by bypassing the interface". When it does apply, **investigate the mechanism before instructing the test or asserting an expected result.** Getting this wrong manufactures false evidence — the developer sees an error, concludes "it's blocked", and has tested nothing.

Check, in the code:

- **How the application authenticates.** A session cookie and a JWT lead to completely different instructions. With a cookie, the most reliable path is the **browser console of an already-logged-in session** (cookies are sent automatically, nothing to copy); Postman/curl require copying cookies by hand and break when the session expires.
- **Whether there is antiforgery protection** (for example a global filter requiring a header such as \`X-XSRF-TOKEN\`). If there is, a call without the header fails at the protection **before** reaching authorisation — the resulting status proves nothing about permission. Instruct how to obtain the token, and explain which status is valid evidence and which is a false positive.
- **How the application denies access.** Do not presume \`403 Forbidden\`. Cookie authentication typically **redirects** to an access-denied page, and \`fetch\` follows the redirect — the console shows the status of that page (which may be a 404, if the route does not exist in the application), never a 403. Describe the observed behaviour, not the status you would expect.
- **Whether the test payload can produce an error unrelated to authorisation.** An empty body may blow up in the application and return a 500. For an authorisation test that is still a valid result (it got past the permission check), but it is confusing evidence in a screenshot — prefer a minimally valid payload and explain the difference to the user.

Two things worth doing every time, whatever the stack:

- **Use a non-existent identifier for destructive operations.** Testing a delete with a fake id proves the authorisation without removing real data.
- **Capture which profile was actually active, in the same screenshot.** Most front ends have a permission endpoint of their own (something like \`<controller>/permission\`, returning whether the user may edit); it is a \`GET\`, needs no antiforgery, and turns "it failed" into "it failed _for this profile_".

When instructing the test, also deliver **how to read the result**: which observation proves the block, and which proves the access. In general what is being proven is _the request was stopped before executing_ versus _the request was processed_ — not a specific status code.

### 5. Write the draft

- **Tone:** storytelling in flowing prose, **no tables** — one paragraph per step, each followed by a line containing only the marker \`[screenshot-NN-descriptive-slug]\`. Choose first person or impersonal and keep the same voice throughout the comment.
- **Concise and objective:** no root cause, no file/class/method names, no architecture decisions — those belong to the PR, the commits and the technical cards.
- **Do not quote the acceptance-criteria codes (CS01, CS02…) in the body of the comment.** The narrative is functional; traceability to the card comes from the order of the steps and from the card itself, not from labels. Quoting codes makes the text rigid and breaks it the moment the card changes.
- Cite the **work item** numbers being evidenced **inline**, at the point in the narrative where the behaviour appears (for example: "this is the scenario in #1042"). This applies to bugs and tasks — unlike criteria codes.
- If the validation was 100% through the UI, **do not mention routes or endpoints anywhere** — only the module and the screen URL. Confirm the URL in the code (menu/routes), not from memory.
- Include the server-verification section **only** when the behaviour is not observable in the UI, and only if the test was in fact executed (or is going to be). Better to drop the section than to publish it without a screenshot.
- Write in the language settled in step 1 — not in the language of this skill file. Correct grammar and spelling; technical terms and product names in English stay as they are.

### 6. Formatting for the Azure DevOps editor

Publish in **HTML**, not Markdown. And use **explicit inline styles**: the CSS of the ADO _view_ mode collapses the default \`<p>\` margins, so "clean" HTML renders as one solid block — the spacing shows up in the editor and disappears once saved.

A pattern that works:

\`\`\`html
<div style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;">
  <p style="margin:0 0 18px;font-size:15px;"><b>Validation — [title]</b></p>
  <p style="margin:0 0 16px;">[opening: where it was validated]</p>

  <p style="margin:0 0 10px;">[step paragraph]</p>
  <p style="margin:0 0 24px;color:#797775;"><i>[screenshot-01-slug]</i></p>

  <p style="margin:0 0 10px;">[step paragraph]</p>
  <p style="margin:0 0 24px;color:#797775;"><i>[screenshot-02-slug]</i></p>

  <p style="margin:0 0 12px;padding-top:16px;border-top:1px solid #E1DFDD;">
    <b>[final section, if any]</b>
  </p>
  <p style="margin:0 0 10px;">[content]</p>
  <p style="margin:0 0 8px;color:#797775;"><i>[screenshot-NN-slug]</i></p>
</div>
\`\`\`

Three spacing decisions make the text breathe:

- \`line-height: 1.6\` on the container — fixes the cramped feel **inside** each paragraph, which is half of the "solid block" impression.
- **Hierarchical spacing:** a small margin (~10px) between a paragraph and its screenshot marker, and a large one (~24px) after the marker. That visually groups step with evidence and separates one step from the next.
- **Grey markers** (\`#797775\`) in italic: they read clearly as placeholders, not as part of the narrative.

When handing over, tell the user how to paste the screenshots: **paste the image on the marker's line and delete only the bracketed text**, keeping the paragraph. Creating a new paragraph for the image makes the editor insert an unstyled \`<p>\`, and that passage goes back to looking cramped.

### 7. Approval is mandatory

Show the complete draft, with the markers visible. **Never publish without explicit approval** — even if the draft seems obvious or repeats a pattern approved before. In Mode A, restate in the same message that the results are expectations to be confirmed.

### 8. Publish

Publish with whatever mechanism is available — an MCP server, the Azure DevOps CLI, the REST API — always in HTML. A universal terminal fallback:

\`\`\`bash
az boards work-item comment add --id <work item id> --text "<html of the approved draft>"
\`\`\`

### 9. Confirm, and correct divergences

Return the link to the comment (or to the work item). If the user reports that a real result differed from the text, **correct the existing comment** (update the same comment, not a new one) and explain the difference — including why the real result is the correct one. A reported divergence is the process working, not rework.

---

## Rules

- Never skip step 2 (coverage analysis), even if the user has already described the steps.
- Never publish without explicit approval of the draft.
- Never assert a result that was not observed. In Mode A, label expectations as such.
- Never invent a concrete particular — a file name, a user, an id, a typed value. Use what the user reported, or describe the characteristic the step requires ("a file whose name contains a character outside the allowed set") and leave the actual value to them. Inventing one signs a contract on the user's behalf, and turns into a stated fact the moment it is published.
- Never include root cause, file/class/method names, or architecture decisions.
- Never quote criteria codes (CS01…) in the body; work items, yes, inline.
- Never mention an endpoint or route if the entire validation was done through the UI.
- Never expose a card-vs-implementation divergence in the comment — take it to the user.
- Never presume the status code of an access denial without checking the authentication mechanism.
- One comment per target work item. If the same content serves several cards, publish independent instances, adjusting whatever is specific to each.
- Incidental findings during the validation (a bug outside the scope, a robustness concern) **do not go** in the comment: take them to the user and decide together whether they become a card on the technical-debt board.

---

## Worked example (reference)

**Validation — permission restrictions on the Users screen (#1042)**

The validation was done through the interface, in **Settings > Users** (\`/settings/users\`), plus one complementary check against the server, described in the final section, since the API restriction is not observable on screen.

I started logged in with an administrator profile, to establish the baseline: the list shows the **New user** button, and each row shows the Edit and Delete actions.

\`[screenshot-01-admin-baseline]\`

Still as administrator, I opened the profile of a test user and switched it to read-only, saving the change. The success message appeared and the profile column updated in the list.

\`[screenshot-02-profile-changed-to-readonly]\`

I then signed in as that read-only user and opened the same screen. This is the scenario in **#1042**: before the fix, the actions were visible and only failed on save, with a generic error. Now the **New user** button and the row actions are not rendered at all, and the list is read-only.

\`[screenshot-03-readonly-no-actions]\`

---

**Complementary check — server-side restriction**

Hiding the buttons is a UI concern, so I also exercised the delete call directly from the read-only session, using a non-existent identifier so the check could not remove real data. The request never reaches the operation: it is interrupted and redirected to the access-denied screen. The same call from the administrator session is processed normally.

\`[screenshot-04-readonly-request-blocked]\`

\`[screenshot-05-admin-request-processed]\`
`;

export function buildValidationCommentSkillEntry(): SkillEntry {
  return {
    path: VALIDATION_COMMENT_SKILL_RELATIVE_PATH,
    label: 'Validation Comment',
    buttonColor: VALIDATION_COMMENT_BUTTON_COLOR,
    textColor: pickReadableTextColor(`#${VALIDATION_COMMENT_BUTTON_COLOR}`).replace(/^#/, ''),
  };
}

interface SeededGlobalSkill {
  entry: SkillEntry;
  content: string;
}

const SEEDED_GLOBAL_SKILLS: Record<string, SeededGlobalSkill> = {
  [EXPLAIN_CARD_SKILL_ID]: { entry: buildExplainCardSkillEntry(), content: EXPLAIN_CARD_SKILL_CONTENT },
  [VALIDATION_COMMENT_SKILL_ID]: { entry: buildValidationCommentSkillEntry(), content: VALIDATION_COMMENT_SKILL_CONTENT },
};

export function ensureSeededGlobalSkills(existing: Record<string, SkillEntry> | undefined): Record<string, SkillEntry> {
  const merged = { ...(existing ?? {}) };
  for (const [id, skill] of Object.entries(SEEDED_GLOBAL_SKILLS)) {
    if (!(id in merged)) {
      merged[id] = skill.entry;
    }
  }
  return merged;
}

// Setup mkdirs .kanbrain/skills earlier in its flow; Sync never did, so without this a workspace with
// that directory deleted would throw instead of having the file restored.
export function writeMissingSeededSkillFiles(workspaceRoot: string): void {
  for (const skill of Object.values(SEEDED_GLOBAL_SKILLS)) {
    const fullPath = path.join(workspaceRoot, skill.entry.path);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, skill.content, 'utf-8');
    }
  }
}

export const DEFAULT_PROFILES: Record<string, ProfileEntry> = {
  developer: {
    label: 'Developer',
    description:
      'I am a software developer. I focus on code quality, automated tests, and architecture. ' +
      'Prioritize clear technical instructions, with code context and implementation trade-offs.',
  },
  qa: {
    label: 'QA',
    description: 'I am responsible for quality and testing. Prioritize test scenarios, edge cases, and clear acceptance criteria.',
  },
  designer: {
    label: 'Designer',
    description:
      'I am a product/UX designer. I focus on usability, visual consistency, and user flows. ' +
      'Prioritize the user-facing impact of any change, and call out UX implications I should weigh in on.',
  },
  po: {
    label: 'Product Owner',
    description:
      'I am a Product Owner. I focus on business value, priorities, and acceptance criteria rather than implementation details. ' +
      'Prioritize plain-language explanations and trade-offs framed in terms of user/business impact.',
  },
};

export function ensureDefaultProfiles(existing: Record<string, ProfileEntry> | undefined): Record<string, ProfileEntry> {
  const merged = { ...(existing ?? {}) };
  for (const [id, entry] of Object.entries(DEFAULT_PROFILES)) {
    if (!(id in merged)) {
      merged[id] = entry;
    }
  }
  return merged;
}

export const USAGE_GUIDE_RELATIVE_PATH = '.kanbrain/USAGE.md';

export const USAGE_GUIDE_CONTENT = `# Kanbrain Usage Guide

This file is generated once by \`Kanbrain: Setup\` (and backfilled by \`Kanbrain: Sync Board Configuration\` if it's missing) and is meant to be read by anyone — human or AI agent — working in this workspace who wants to understand how Kanbrain is wired up here.

## How Kanbrain works

Kanbrain shows the active Azure DevOps work item (and its children) in a VS Code side panel. Buttons on that panel generate a context file describing the work item and send a "read this file" command to an agent running in an integrated terminal — that agent is you, if you're reading a file Kanbrain generated.

There are two kinds of skill:

- **Status skills** — \`.kanbrain/config.json\`'s \`skills\` map links one skill file to each (work item type, status) pair. The button shown on the active work item's card always reflects that work item's current status.
- **Global skills** — \`.kanbrain/config.json\`'s \`globalSkills\` map holds skills that aren't tied to any status. They show up as a small "▾" menu next to the status skill button (or alone, if the current status has no skill mapped) — pick one to run it against the active work item regardless of its status. Useful for actions that make sense across the whole flow, like the two skills Kanbrain seeds for you — \`explain-card\` (explain the current work item in plain language) and \`validation-comment\` (walk through validating the delivery and draft the evidence comment for the card) — or a custom one like "estimate Effort for this Backlog item."

A global skill is not locked out of the status buttons: \`skills[type][status]\` entries take a plain \`path\`, so pointing one at a global skill's file puts the button on the card at that status while the skill stays available from the "▾" menu everywhere else. Handy when your process does have a status that means "time to validate".

Every generated context file always starts with a card info block (work item id/title/type/status/description, parent, subtasks) ahead of the skill's own content — skill files don't need to restate any of that. Both kinds also resolve the same placeholders inside the skill file's own content, if you want to reference a specific field directly in your instructions: \`{{id}}\` \`{{title}}\` \`{{description}}\` \`{{status}}\` \`{{type}}\` \`{{url}}\` \`{{branch}}\` \`{{parent.id}}\` \`{{parent.title}}\` \`{{parent.description}}\` \`{{subtasks}}\`.

## Azure DevOps access

Kanbrain authenticates using the same Microsoft account session VS Code already has for this workspace. That means: if you're an agent reading this because a Kanbrain skill button sent you here, you're running in a workspace that already has real, live access to this project's Azure DevOps board — the active work item's real id, title, status, description, parent, and subtasks are already in the context file you were pointed to.

Because of that, feel free to suggest concrete actions on the board to the user when a skill's instructions call for it (e.g. "this looks done, want me to move it to Closed?", or "should I fill in the Effort field with X?"). Kanbrain writes exactly one thing to Azure DevOps: the work item's status, when the user changes it from the panel's dropdown. Everything else — comments, any other field, board configuration — still has to go through your own tools/credentials (the Azure DevOps CLI, an MCP server, the REST API, or the web UI), with the user's confirmation — never by editing Kanbrain's own files.

## Where things live

- \`.kanbrain/config.json\` — the shared config: organization/project, \`skills\`, \`globalSkills\`, colors, icons, team settings. Commit this.
- \`.kanbrain/config.local.json\` — per-machine repository paths and display preferences (gitignored, never commit this).
- \`.kanbrain/skills/*.md\` — the skill files themselves. Commit these too.
- \`.kanbrain/generated/\` — context files Kanbrain writes each time a skill runs (gitignored, one-off/disposable).

Edit skills directly, or use the Config screen in the Kanbrain panel — both status skills and global skills have a path/label/color editor there.
`;

export function isBootstrapContentMissing(workspaceRoot: string, config: KanbrainConfig): boolean {
  const usageGuideMissing = !fs.existsSync(path.join(workspaceRoot, USAGE_GUIDE_RELATIVE_PATH));
  const seededSkillsMissing = Object.keys(SEEDED_GLOBAL_SKILLS).some(id => !config.globalSkills?.[id]);
  const defaultProfilesMissing = Object.keys(DEFAULT_PROFILES).some(id => !config.profiles?.[id]);
  return usageGuideMissing || seededSkillsMissing || defaultProfilesMissing;
}
