/**
 * @fileoverview This file contains the logic for downloading a single photo.
 * It is used by the WebSocket handler to process single photo download requests from the client.
 * @module actions/download-single-photo
 */

/**
 * @property {function} getAuthenticatedClient - Function to get an authenticated OAuth2 client.
 */
const { getAuthenticatedClient } = require("../oauth");
/**
 * @property {function} getDriveClient - Function to get the Google Drive API client.
 * @property {function} findOrCreateFolder - Function to find or create a folder in Google Drive.
 * @property {string} FOLDER_NAME - The name of the folder in Google Drive where the photos will be stored.
 */
const {
  getDriveClient,
  findOrCreateFolder,
  FOLDER_NAME,
} = require("../drive-manager");
/**
 * @property {function} updateState - Function to update the download state.
 */
const { updateState } = require("../download-state");
/**
 * @property {function} processPhoto - Function to download, process, and upload a photo.
 */
const { processPhoto } = require("../utils/photo-processor");

/**
 * Downloads a single photo to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} photo - The photo object to download.
 */
async function downloadSinglePhoto(req, photo) {
  const progressCallback = (progress) => {
    updateState({ ...progress, photoId: photo.photoId.id });
  };

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    progressCallback({
      message: `Starting download of 1 photo to Google Drive...`,
    });

    const { photo: downloadedPhoto, file: downloadedFile } = await processPhoto(
      drive,
      oAuth2Client,
      photo,
      folderId,
      progressCallback,
    );

    if (downloadedPhoto) {
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

      updateState({
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

module.exports = { downloadSinglePhoto };
