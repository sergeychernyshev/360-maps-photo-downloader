"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelDownload = cancelDownload;
const download_state_1 = require("../download-state");
/**
 * Cancels the current download operation.
 */
function cancelDownload() {
    // Set the cancelled flag in the download state
    (0, download_state_1.updateState)({ cancelled: true });
}
//# sourceMappingURL=cancel-download.js.map