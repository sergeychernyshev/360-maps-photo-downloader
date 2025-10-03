import { updateState } from "../download-state";

/**
 * Cancels the current download operation.
 */
export function cancelDownload() {
  // Set the cancelled flag in the download state
  updateState({ cancelled: true });
}
