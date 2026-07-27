# Changelog

All notable changes to Kanbrain are documented here. Versions prior to 0.3.0 were not documented.

## [0.7.2] - 2026-07-27

### Fixed

- When a work item's status had no skill mapped but global skills were configured, the card's action pill showed only the "▾" trigger with no button, and the global skills dropdown could collapse to almost no width. A disabled placeholder button (styled to match the trigger) now always fills that spot, and the dropdown has a minimum width regardless of the pill's size.

## [0.7.1] - 2026-07-27

### Fixed

- `kanbrain-feature-request.md` (a stray local file, not part of the extension) was accidentally bundled into the 0.7.0 package because `.vscodeignore` didn't exclude it. Excluded now.

## [0.7.0] - 2026-07-27

### Added

- `kanbrain.repoScanDepth` setting to scan deeper than the workspace root's direct children when auto-discovering local repository paths — supports a `<root>/repos/*` layout without needing a multi-root workspace.
- `.kanbrain/config.local.json` — repository paths and the "show assigned to" preference now live in a new, gitignored, per-machine file instead of the shared `config.json`, so `config.json` is safe to commit as-is. Existing projects are migrated automatically the first time the extension activates after upgrading, with a notification confirming what moved.

### Fixed

- Long global skill labels in the card's skill-selection menu are now truncated with an ellipsis instead of being clipped abruptly.

## [0.6.0] - 2026-07-25

### Added

- Global skills — skills that aren't tied to any status. They show up as a small "▾" menu next to the status skill button on the active work item's card (or alone, if the current status has none), and run against whatever work item is active regardless of its status. Configured in a new "Global Skills" section on the Config screen, collapsed behind a colored preview header per skill, matching how work item types are already displayed.
- `Kanbrain: Setup` (and `Kanbrain: Sync Board Configuration`, as a backfill if missing) now seed one real global skill, `explain-card`, and a new `.kanbrain/USAGE.md` — a single usage guide meant to be read by both your team and any coding agent working in the workspace, covering both kinds of skill and the fact that Kanbrain runs with the same Azure DevOps access your VS Code session already has.
- `Kanbrain: Configure with AI`'s generated content now mentions global skills and points to `.kanbrain/USAGE.md`.
- Card details and pull request details panels now show a distinct icon on their VS Code editor tab instead of the generic webview icon.

### Changed

- The silent board-configuration check that runs once per VS Code session (and `Kanbrain: Sync Board Configuration`'s "up to date" message) now also detects a missing `.kanbrain/USAGE.md` or `explain-card` global skill, and offers the same "Sync Now" action for it — so upgrading the extension alone surfaces the gap instead of requiring a manual Sync.

### Fixed

- Clicking a skill button's "Run" action no longer risks re-triggering it: focus now correctly moves to the terminal instead of staying on the button, where a follow-up Enter used to fire the button again.
- The status dot next to each group header in the search dialog no longer gets pushed away from the status name by a layout rule meant for a different kind of header.

## [0.5.1] - 2026-07-24

### Fixed

- Skill Configuration group headers now show each work item type's icon and accent color, matching how types are displayed everywhere else in the app.

## [0.5.0] - 2026-07-24

### Added

- Repository path mapping — Kanbrain now maps each Azure DevOps repository to a local clone path, so branch checkout and the GitLens diff action work correctly even when the workspace is a parent folder containing several cloned repos (or just isn't the repo a given PR/branch belongs to).
- `Kanbrain: Setup` asks whether to auto-discover and map the project's repositories to local clones; `Kanbrain: Sync Board Configuration` keeps that mapping current without ever overwriting a path you've set manually.
- New "Repositories" screen (Home → Repositories) listing every repository in the project with an editable local path field and a folder picker.
- Branch and repository names now render as colored tags (blue for branches, orange for repositories) in the PR detail panel header and the Development section.
- A repository tag with no local path configured (or one Kanbrain doesn't recognize) is clickable — it offers to configure the path, clone the repository directly into a folder you pick, or sync the board configuration if the repository isn't recognized at all.
- The PR detail panel header now shows which repository the PR belongs to.

### Changed

- Branch checkout and the GitLens diff action no longer assume the currently open workspace folder is the right repository — they use the configured local path instead, and are disabled (rather than failing silently) when no path is configured.

## [0.4.0] - 2026-07-23

### Added

- Pull Request detail panel — opened from a Development section link, it shows title, status (including Draft), source/target branches, description, reviewers (with vote and Required/Optional tags), and linked work items.
- Discussion section on the PR detail panel with real comment threads: file/line context for code-review comments, threaded replies indented under their parent, and each thread's status (Active/Fixed/Won't Fix/Closed/By Design/Pending).
- "View Diff" button on the PR detail panel that opens GitLens's Search & Compare view for the PR's branches when GitLens is installed; shows an "Install GitLens to view diffs inline" suggestion instead when it isn't.
- Click a branch (in the Development section or the PR detail panel) to check it out locally, with a confirmation prompt that warns if it doesn't look like the currently open repository.
- Related Work section on the work item detail panel, showing the parent and children as clickable links that open their own detail panel; the panel now polls and auto-refreshes to stay in sync with Azure DevOps.
- Development section (linked branches/PRs) now shows as a compact badge on cards, with the full itemized list — grouped, paginated, with per-kind icons — in the work item detail panel.
- On the Flow screen, a work item's parent now renders as its own full card above the current item, with a pick-work-item button to jump to it directly.
- Task-backlog work item cards always show the assignee, regardless of a team's card field settings.

### Changed

- Flow screen's Current Work Item, Parent, and Children sections each get a distinct border color and a fade-only border style.
- Card layout: title now sits next to the id, and status is shown before the assignee.
- Card details header reflowed, with a status color stripe.
- Home screen's Flow section Switch/Clear buttons moved into the section header.

### Fixed

- `ArtifactLink` vstfs URLs using the real `%2F`-encoded separator are now parsed correctly (previously could fail to resolve some linked branches/PRs).
- Status dot styling in the card details panel; parent row now appears after status/assignee on cards.
- Current Work Item card's rounded corners no longer clipped by the fade border; removed a vestigial wrapper that was doubling its lateral margin.

## [0.3.0] - 2026-07-23

### Added

- Team selector on the Home screen — when a work item type is configured differently across teams, pick which team's board settings decide Parent/AssignedTo visibility on cards.
- Parent field on cards (when enabled for that work item type/team), shown as an icon + "#id: Title" clickable link, styled like a native Azure Boards card field.
- Development section on every card, listing linked branches and pull requests (with title/status once resolved).
- Loading spinner on Setup, Connect, Check Board Configuration, Sync Board Configuration, and Configure with AI while each command runs.
- Automatic local migration of `.kanbrain/config.json` from the old backlog-level schema to the new one — no manual steps needed after upgrading from 0.2.3 or earlier.

### Changed

- Skills are now mapped directly by work item type and status instead of by backlog level. Every work item type gets its own search dialog tab and config entry — no more sharing a tab/skill with unrelated types.
- Card field settings (Parent/AssignedTo) are now discovered for every team in the project, not just the default team.
- Work item types with no real work items in the project no longer clutter the search dialog or skill configuration.
- Redesigned the Home screen: each section (Flow, Team, Commands, Configuration) now renders as a distinct bordered card, and buttons are more prominent.
- Renamed the Home screen's "View details" button to "Open Flow" to avoid confusion with the separate work item detail tab.

### Fixed

- `Kanbrain: Sync Board Configuration` and the automatic board check no longer crash on a `.kanbrain/config.json` left in the pre-0.3.0 schema.
