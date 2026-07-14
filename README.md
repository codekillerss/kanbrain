# Kanbrain

VS Code extension that shows the active Azure DevOps work item and its subtasks in a side panel, with per-status "skill" buttons that generate a context file and send a read command to an integrated terminal.

## Setup

1. Open a workspace folder.
2. Run **Kanbrain: Setup** from the command palette. Sign in with your Microsoft account when prompted, then pick an Azure DevOps organization and project.
3. Setup reads the project's real backlog levels (Epics/Features/Stories/Tasks, or whatever your process defines) and state categories from Azure DevOps, then asks whether to generate placeholder skill files automatically for each category (Proposed/InProgress/Resolved). This creates `.kanbrain/config.json` (commit it — it's shared team config) and, if you said yes, one skill file per backlog level + category under `.kanbrain/skills/`.
4. Edit the generated skill files and, if needed, `.kanbrain/config.json`'s `backlogLevels` map (`{ [backlogLevel]: { [status]: skillPathOrNull } }`) to fine-tune which skill runs for which status:

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
         "New": ".kanbrain/skills/stories-proposed.md",
         "Committed": ".kanbrain/skills/stories-inprogress.md",
         "Done": null
       },
       "Tasks": {
         "To Do": ".kanbrain/skills/tasks-proposed.md",
         "In Progress": ".kanbrain/skills/tasks-inprogress.md",
         "Done": null
       }
     }
   }
   ```

5. Run **Kanbrain: Select Work Item** to pick which work item shows in the panel. Drag the "Kanbrain" view (from the activity bar) into the secondary sidebar if you want it on the right, like the backoffice flow mode.

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
- [ ] Answering "Sim" creates one skill file per backlog level + category (Proposed/InProgress/Resolved) under `.kanbrain/skills/`, and `Done`/`Removed`-category statuses map to `null`.
- [ ] `Kanbrain: Select Work Item` search returns matching work items by title and by `#id`.
- [ ] With no active work item, the panel shows a search box and, without typing anything, a list of up to 50 recent work items grouped by status.
- [ ] Typing in the search box filters the list by title or `#id`.
- [ ] Clicking a result in the list sets it as the active work item and persists the selection (survives a window reload).
- [ ] With an active work item, the header shows a "🔍 Trocar work item" button that toggles the same search box open/closed without leaving the panel.
- [ ] If the search request fails (e.g. token expired), the results area shows an inline error message instead of hanging or throwing.
- [ ] Selecting a work item renders it in the Kanbrain view with correct status/type badges and title.
- [ ] Subtasks (Parent/Child linked work items) render under "Subtasks (N)".
- [ ] A status with a configured skill shows an action button; a status without one does not.
- [ ] Clicking the action button opens/reuses a "Kanbrain" terminal and sends `Leia o arquivo .kanbrain/generated/<id>-<timestamp>.md e siga as instruções nele.`
- [ ] The generated file's placeholders are correctly resolved with real work item data.
- [ ] Changing the work item's status directly in Azure DevOps Boards is reflected in the panel within ~5 seconds (polling).
- [ ] Reopening the workspace restores the previously selected work item (via `workspaceState`).
- [ ] Dragging the Kanbrain view into the secondary/right sidebar works and persists across reloads.
