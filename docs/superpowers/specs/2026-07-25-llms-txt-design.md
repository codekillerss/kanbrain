# llms.txt design

## Purpose

Add an `llms.txt` file at the repo root, following the [llmstxt.org](https://llmstxt.org) convention, so an AI agent that lands on the Kanbrain GitHub repo (or is asked to research it) has a curated, machine-readable entry point instead of having to guess where the useful docs are.

## Audience

Both people the repo currently documents in the README already: someone installing/configuring the extension, and someone contributing to its source. No separate content is needed for each — the README already covers both (Setup walkthrough + Development section).

## Scope

- New file: `llms.txt` at the repository root.
- Links point to **raw** GitHub content (`raw.githubusercontent.com/codekillerss/kanbrain/main/...`), not the HTML repo pages, so a fetch returns plain markdown.
- Only two links: `README.md` and `CHANGELOG.md`. Internal planning docs under `docs/superpowers/specs` and `docs/superpowers/plans` are deliberately excluded — they're session-generated design notes, not curated documentation, and would be noise for this file's purpose.
- Hand-maintained, no generation script or build step. At two linked files, keeping this in sync by hand on the rare occasions the project's shape changes is simpler than adding tooling.
- No `llms-full.txt`. The README is already a single file; concatenating its content into a second file would just create a copy that can drift out of sync.

## Format

Follows the llmstxt.org structure: H1 title, one-line blockquote summary, a short context paragraph, then an H2 `## Docs` section with a markdown link list (each entry: link + one-line description of what that doc covers).

## Content

```
# Kanbrain

> VS Code extension that shows the active Azure DevOps work item and its children in a side panel, with per-status "skill" buttons that hand context to a coding agent.

Kanbrain connects a VS Code side panel to Azure DevOps boards. It surfaces the active work item (and its children), and lets each board status trigger a "skill" — a markdown file with placeholders resolved from the real work item's data, sent to an AI coding agent running in an integrated terminal. Skills can also be global (not tied to a status), for actions like explaining a card on demand.

## Docs

- [README](https://raw.githubusercontent.com/codekillerss/kanbrain/main/README.md): Installation and setup walkthrough, skill/global skill configuration, skill placeholders, development commands, and the manual verification checklist.
- [CHANGELOG](https://raw.githubusercontent.com/codekillerss/kanbrain/main/CHANGELOG.md): Version history and notable changes.
```

## Maintenance

No automated check. If the README's summary/description drifts significantly from the H1/blockquote/context paragraph above, update `llms.txt` by hand as part of that change — same way `CHANGELOG.md` is kept up to date today.
