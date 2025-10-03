"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadSinglePhoto = downloadSinglePhoto;
const oauth_1 = require("../oauth");
const drive_manager_1 = require("../drive-manager");
const download_state_1 = require("../download-state");
const photo_processor_1 = require("../utils/photo-processor");
/**
 * Downloads a single photo to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} photo - The photo object to download.
 */
async function downloadSinglePhoto(req, photo) {
  const progressCallback = (progress) => {
    (0, download_state_1.updateState)({
      ...progress,
      photoId: photo.photoId.id,
    });
  };
  try {
    const oAuth2Client = await (0, oauth_1.getAuthenticatedClient)(req);
    const drive = await (0, drive_manager_1.getDriveClient)(oAuth2Client);
    const folder = await (0, drive_manager_1.findOrCreateFolder)(
      drive,
      drive_manager_1.FOLDER_NAME,
    );
    const folderId = folder.id;
    progressCallback({
      message: `Starting download of 1 photo to Google Drive...`,
    });
    const result = await (0, photo_processor_1.processPhoto)(
      drive,
      oAuth2Client,
      photo,
      folderId,
      progressCallback,
    );
    if (result) {
      const { photo: downloadedPhoto, file: downloadedFile } = result;
      if (req.session.missingPhotos && req.session.downloadedPhotos) {
        // Remove from missingPhotos if it exists
        const missingIndex = req.session.missingPhotos.findIndex(
          (p) => p.photoId.id === photo.photoId.id,
        );
        if (missingIndex > -1) {
          req.session.missingPhotos.splice(missingIndex, 1);
        }
        // Remove from downloadedPhotos if it exists (for re-downloads)
        const downloadedIndex = req.session.downloadedPhotos.findIndex(
          (p) => p.photoId.id === photo.photoId.id,
        );
        if (downloadedIndex > -1) {
          req.session.downloadedPhotos.splice(downloadedIndex, 1);
        }
        // Add the photo to downloadedPhotos
        req.session.downloadedPhotos.push(downloadedPhoto);
      }
      progressCallback({
        photoId: photo.photoId.id,
        fileComplete: true,
        complete: true,
        driveLink: downloadedFile.webViewLink,
        downloadProgress: undefined,
      });
      (0, download_state_1.updateState)({
        downloadedCount: req.session.downloadedPhotos.length,
        notDownloadedCount: req.session.missingPhotos.length,
        totalPhotosCount:
          req.session.downloadedPhotos.length +
          req.session.missingPhotos.length,
      });
    }
  } catch (error) {
    progressCallback({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
    });
    console.error(error);
  }
}
//# sourceMappingURL=download-single-photo.js.map
