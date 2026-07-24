# Changelog

All notable changes to Kanbrain are documented here. Versions prior to 0.3.0 were not documented.

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
