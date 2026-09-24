import type { KanbrainConfig } from '../types';

// searchAssignedToMe reflects the search dialog's "Assigned to me" checkbox, which the browser
// already keeps checked the moment the user clicks it — diffing it into the poll's state hash
// would force a full webview.html rebuild while the dialog is open, closing it. Strip it here so
// toggling that checkbox never triggers a rebuild; render() still receives the real config, so
// the checkbox is still checked correctly whenever a rebuild happens for another reason.
export function configForStateDiff(config: KanbrainConfig | null): KanbrainConfig | null {
  if (!config) {
    return config;
  }
  const { searchAssignedToMe: _searchAssignedToMe, ...rest } = config;
  return rest as KanbrainConfig;
}
