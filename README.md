# Kanbrain

VS Code extension that shows the active Azure DevOps work item and its children in a side panel, with per-status "skill" buttons that generate a context file and send a read command to an integrated terminal.

## Setup

1. Open a workspace folder.
2. Run **Kanbrain: Setup** from the command palette. Sign in with your Microsoft account when prompted, then pick an Azure DevOps organization and project.
3. Setup reads the project's real backlog levels (Epics/Features/Stories/Tasks, or whatever your process defines) and state categories from Azure DevOps, then asks whether to generate placeholder skill files automatically for each category (Proposed/InProgress/Resolved). This creates `.kanbrain/config.json` (commit it — it's shared team config) and, if you said yes, one skill file per backlog level + category under `.kanbrain/skills/`.
4. Edit the generated skill files and, if needed, `.kanbrain/config.json`'s `backlogLevels` map (`{ [backlogLevel]: { [status]: skillEntryOrNull } }`) to fine-tune which skill runs for which status:

   ```json
   {
     "organization": "my-org",
     "project": "MyProject",
     "typeToBacklogLevel": {
       "Epic": "Epics",
       "User Story": "Stories",
       "Bug": "Stories",
       "Task": "Tasks"
     },
     "backlogLevels": {
       "Stories": {
         "New": { "path": ".kanbrain/skills/stories-proposed.md" },
         "Committed": {
           "path": ".kanbrain/skills/stories-inprogress.md",
           "label": "Refine",
           "textColor": "ffffff",
           "buttonColor": "007acc"
         },
         "Done": null
       },
       "Tasks": {
         "To Do": { "path": ".kanbrain/skills/tasks-proposed.md" },
         "In Progress": { "path": ".kanbrain/skills/tasks-inprogress.md" },
         "Done": null
       }
     },
     "statusColors": {
       "New": "b2b2b2",
       "Committed": "007acc",
       "Done": "339933"
     },
     "typeColors": {
       "Task": "f2cb1d",
       "Bug": "cc293d"
     },
     "typeIcons": {
       "Task": "<svg>...</svg>",
       "Bug": "<svg>...</svg>"
     }
   }
   ```

   Each `backlogLevels[level][status]` entry is either `null` (no action for that status) or an object with a required `path` (relative to the workspace root) and three optional fields: `label` (overrides the button text — defaults to the skill file's name), `textColor` and `buttonColor` (hex, no `#` needed — override the button's text/background color; an invalid or missing value falls back to the VS Code theme's default button colors). `Kanbrain: Setup` and `Kanbrain: Sync Board Configuration` only ever generate `{ "path": ... }` entries — add `label`/`textColor`/`buttonColor` by hand for the statuses you want to customize.

   `statusColors` maps each status name to the hex color Azure DevOps assigns it (shown as a small dot next to the status text). `typeColors` colors the right border of each work item card, and `typeIcons` holds the real work item type icon as inline SVG markup shown next to the `#id` — both fetched and sanitized during Setup. All three are captured automatically during Setup — projects configured before these fields existed need to re-run **Kanbrain: Setup** to get colors/icons.

5. Run **Kanbrain: Select Work Item** to pick which work item shows in the panel. Drag the "Kanbrain" view (from the activity bar) into the secondary sidebar if you want it on the right, like the backoffice flow mode.

If the project's process changes later (a status is renamed, a work item type is added/removed, a type moves to a different backlog level), run **Kanbrain: Check Board Configuration** to see whether `.kanbrain/config.json` is still in sync — it never modifies anything by itself. If it finds a difference, it offers a **Sync Now** action (also available directly as **Kanbrain: Sync Board Configuration**) that refreshes colors/icons/type mappings and adds any new statuses, but never deletes a skill mapping you've configured — entries for statuses/levels no longer found on the board are kept as-is so you don't lose your work; the command's summary tells you which ones to review. Kanbrain also runs this check once, silently, each time the panel first opens in a VS Code session, and only shows a message if something needs your attention.

When there's no active work item — or after clicking **🏠 Home** from the work item view — the panel shows a Home screen with three sections: **Commands** (buttons for Setup, Check Board Configuration, and Sync Board Configuration), **Current Work Item** (the active item with Switch/Clear, or the search box if none is active), and **Skill Configuration** (one editable row per backlog level/status, with a path field, a "…" button to browse for the skill file, and label/text color/button color fields — changes save automatically when you leave a field). The skill configuration editor only edits these values; it doesn't add or remove backlog levels, statuses, or types — that stays the job of Setup/Sync.

## Skill file placeholders

`{{id}}` `{{title}}` `{{description}}` `{{status}}` `{{type}}` `{{url}}` `{{branch}}` `{{parent.id}}` `{{parent.title}}` `{{parent.description}}` `{{subtasks}}`

## Development

```bash
npm install
npm run compile
npm run test:unit
npm run test:integration
```

Press F5 in VS Code to launch an Extension Development Host with Kanbrain loaded.

> **Note:** `npm run test:integration` launches a real VS Code instance via `@vscode/test-electron`. On Windows, that tool spawns the Code binary through a shell without escaping arguments, so it can fail with `Cannot find module 'C:\Users\...\Área'`-style errors if the repository path contains a space (a known upstream limitation, not a bug in this extension). If that happens in your environment, use the manual verification checklist below instead, or move/clone the repo to a space-free path before running that script.

## Manual verification checklist

Run these by hand in an Extension Development Host (press F5) against a real Azure DevOps organization, since the webview UI and the live auth/API flow aren't covered by either test suite:

- [ ] `Kanbrain: Setup` prompts for Microsoft login, lists real organizations, lists real projects, and writes `.kanbrain/config.json`.
- [ ] `.kanbrain/generated/` is added to `.gitignore` after setup.
- [ ] `Kanbrain: Setup`, after picking a project, asks whether to generate placeholder skill files per backlog level/category, and writes `backlogLevels`/`typeToBacklogLevel` reflecting the project's real process either way.
- [ ] Answering "Yes" creates one skill file per backlog level + category (Proposed/InProgress/Resolved) under `.kanbrain/skills/`, and `Done`/`Removed`-category statuses map to `null`.
- [ ] `Kanbrain: Select Work Item` search returns matching work items by title and by `#id`.
- [ ] With no active work item, the panel shows a search box and, without typing anything, a list of up to 50 recent work items grouped by status.
- [ ] Typing in the search box filters the list by title or `#id`.
- [ ] Clicking a result in the list sets it as the active work item and persists the selection (survives a window reload).
- [ ] With an active work item, the header shows a "🔍 Switch work item" button that opens the search as a floating dialog over the current card, without pushing it down the page.
- [ ] The search dialog closes via the "✕" button in its header or by clicking the darkened backdrop outside it, without changing the active work item.
- [ ] If the search request fails (e.g. token expired), the results area shows an inline error message instead of hanging or throwing.
- [ ] Typing a number in the search box (e.g. `88`) matches work items whose id contains those digits (e.g. `88` and `880`), not just an exact id match.
- [ ] Each status section in the search results can be collapsed/expanded by clicking its header, independently of the others.
- [ ] Each work item in the search results list shows the real Azure DevOps type icon and a colored right border matching that type's color, without a status dot or action button on the item itself.
- [ ] The search dialog shows an "All" tab plus one tab per backlog level, in the project's real backlog order; clicking a tab filters the already-visible list instantly, with no loading delay.
- [ ] Each backlog level tab's count reflects the total number of that type of work item in the whole project (not just how many match the current search text), and only changes when the dialog is reopened or cleared — not while typing.
- [ ] A backlog level tab with 0 items in the project stays visible (dimmed), and clicking it shows the "No work items found." message.
- [ ] The header shows a "✕ Clear" button next to "🔍 Switch work item" that clears the active work item and returns to the empty/search state.
- [ ] Each work item card shows the real Azure DevOps type icon next to its `#id`, and a colored right border matching that type's color.
- [ ] The status is shown as a small colored dot next to the plain status text (main card, children, and search result group headers) — not a filled badge.
- [ ] Selecting a work item renders it in the Kanbrain view with correct status dot, type icon/border, and title.
- [ ] Children (Parent/Child linked work items) render under "Children (N)".
- [ ] A status with a configured skill shows an action button; a status without one does not.
- [ ] A skill entry with a custom `label` shows that text on the action button instead of the skill file's name; a valid `textColor`/`buttonColor` is applied to the button, and an invalid or missing one falls back to the theme's default button colors.
- [ ] With no active work item, the panel shows the Home screen (Commands / Current Work Item / Skill Configuration sections) instead of a bare search box.
- [ ] Clicking a Commands button on Home runs the corresponding command (Setup, Check Board Configuration, Sync Board Configuration).
- [ ] With an active work item, clicking "🏠 Home" shows the Home screen with that item's card, Switch, and Clear in the Current Work Item section, without clearing the active work item; clicking "View details →" returns to the full card + children view.
- [ ] Editing a skill's path, label, text color, or button color in the Skill Configuration section and moving focus away (Tab or click elsewhere) persists the change to `.kanbrain/config.json` without a Save button; reopening Home shows the saved value.
- [ ] Clicking the "…" button next to a skill's path field opens a native file picker; choosing a `.md` file inside the workspace fills the path field with the relative path and saves it.
- [ ] Clearing a skill's path field and moving focus away sets that status back to no skill (`null`) — the action button disappears from that status's card.
- [ ] Clicking the action button opens/reuses a "Kanbrain" terminal and sends `Read the file .kanbrain/generated/<id>-<timestamp>.md and follow the instructions in it.`
- [ ] The generated file's placeholders are correctly resolved with real work item data.
- [ ] Changing the work item's status directly in Azure DevOps Boards is reflected in the panel within ~5 seconds (polling).
- [ ] Reopening the workspace restores the previously selected work item (via `workspaceState`).
- [ ] `Kanbrain: Check Board Configuration` reports "up to date" when the board hasn't changed since Setup, and never writes to `.kanbrain/config.json`.
- [ ] After renaming/adding/removing a status or work item type on the real Azure DevOps board, `Kanbrain: Check Board Configuration` reports the specific difference, and its "Sync Now" action (or running `Kanbrain: Sync Board Configuration` directly) updates `.kanbrain/config.json` without deleting any existing skill path mapping — including ones for statuses no longer found on the board.
- [ ] Manually editing `.kanbrain/config.json` into invalid JSON causes the panel, search, and skill actions to show a clear "not valid JSON" message (via `Kanbrain: Check Board Configuration`) instead of failing silently or crashing.
- [ ] The board configuration check runs once, silently, the first time the panel opens in a VS Code session — no visible message when everything is in sync.
- [ ] Dragging the Kanbrain view into the secondary/right sidebar works and persists across reloads.
