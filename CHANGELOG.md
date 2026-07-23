# Changelog

All notable changes to Kanbrain are documented here. Versions prior to 0.3.0 were not documented.

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
