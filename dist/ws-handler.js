"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMessage = handleMessage;
const download_all_photos_1 = require("./actions/download-all-photos");
const download_single_photo_1 = require("./actions/download-single-photo");
const cancel_download_1 = require("./actions/cancel-download");
const delete_duplicates_1 = require("./actions/delete-duplicates");
const update_photo_list_1 = require("./actions/update-photo-list");
const filter_photos_1 = require("./actions/filter-photos");
const download_state_1 = require("./download-state");
/**
 * Handles incoming WebSocket messages.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object.
 * @param {string} message - The incoming message.
 */
async function handleMessage(req, ws, message) {
  const data = JSON.parse(message);
  const { type, payload } = data;
  switch (type) {
    case "get-state":
      ws.send(
        JSON.stringify({
          type: "progress",
          payload: (0, download_state_1.getState)(),
        }),
      );
      break;
    case "download":
      (0, download_state_1.resetState)();
      const downloadedPhotos = req.session.downloadedPhotos || [];
      const missingPhotos = req.session.missingPhotos || [];
      await (0, download_all_photos_1.downloadAllPhotos)(
        req,
        missingPhotos,
        downloadedPhotos.length,
        missingPhotos.length,
      );
      break;
    case "cancel-download":
      (0, cancel_download_1.cancelDownload)();
      break;
    case "delete-duplicates":
      await (0, delete_duplicates_1.deleteDuplicates)(req, payload.fileIds);
      break;
    case "download-photo":
      const allPhotos = (req.session.downloadedPhotos || []).concat(
        req.session.missingPhotos || [],
      );
      const photo = allPhotos.find((p) => p.photoId.id === payload.photoId);
      if (photo) {
        await (0, download_single_photo_1.downloadSinglePhoto)(req, photo);
      } else {
        (0, download_state_1.updateState)({
          error: `Photo with ID ${payload.photoId} not found.`,
        });
      }
      break;
    case "update-photo-list":
      await (0, update_photo_list_1.updatePhotoList)(req, ws);
      break;
    case "filter-photos":
      await (0, filter_photos_1.filterPhotos)(req, ws, payload);
      break;
    case "get-all-photos":
      ws.send(
        JSON.stringify({
          type: "all-photos",
          payload: req.session.allPhotos,
        }),
      );
      break;
    default:
      console.log(`Unknown message type: ${type}`);
  }
}
//# sourceMappingURL=ws-handler.js.map
