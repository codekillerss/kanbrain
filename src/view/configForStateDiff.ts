import type { KanbrainConfig } from '../types';

// searchAssignedToMe reflects the search dialog's "Assigned to me" checkbox, which the browser
// already keeps checked the moment the user clicks it — diffing it into the poll's state hash
// would force a full webview.html rebuild while the dialog is open, closing it. Strip it here so
// toggling that checkbox never triggers a rebuild; render() still receives the real config, so
// the checkbox is still checked correctly whenever a rebuild happens for another reason.
// childrenSortCriteria is stripped for the same reason: the sort menu updates itself and the
// children list is swapped in place, so a full rebuild would only close the open menu.
export function configForStateDiff(config: KanbrainConfig | null): KanbrainConfig | null {
  if (!config) {
    return config;
  }
  const { searchAssignedToMe: _searchAssignedToMe, childrenSortCriteria: _childrenSortCriteria, ...rest } = config;
  return rest as KanbrainConfig;
}
