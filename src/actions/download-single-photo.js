const { getAuthenticatedClient } = require("../oauth");
const {
  getDriveClient,
  findOrCreateFolder,
  FOLDER_NAME,
} = require("../drive-manager");
const { updateState } = require("../download-state");
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
      folderLink: folder.webViewLink,
    });

    progressCallback({
      message: `Starting download of 1 photo to Google Drive...`,
      total: 1,
      current: 0,
      totalProgress: 0,
    });

    const { photo: downloadedPhoto, file: downloadedFile } = await processPhoto(
      drive,
      oAuth2Client,
      photo,
      folderId,
      progressCallback
    );

    if (downloadedPhoto) {
      if (req.session.missingPhotos && req.session.downloadedPhotos) {
        // Remove from missingPhotos if it exists
        const missingIndex = req.session.missingPhotos.findIndex(
          (p) => p.photoId.id === photo.photoId.id
        );
        if (missingIndex > -1) {
          req.session.missingPhotos.splice(missingIndex, 1);
        }

        // Remove from downloadedPhotos if it exists (for re-downloads)
        const downloadedIndex = req.session.downloadedPhotos.findIndex(
          (p) => p.photoId.id === photo.photoId.id
        );
        if (downloadedIndex > -1) {
          req.session.downloadedPhotos.splice(downloadedIndex, 1);
        }

        // Add the photo to downloadedPhotos
        req.session.downloadedPhotos.push(downloadedPhoto);
      }

      progressCallback({
        fileComplete: true,
        downloadedCount: req.session.downloadedPhotos.length,
        notDownloadedCount: req.session.missingPhotos.length,
        totalProgress: 100,
      });

      progressCallback({
        message: `Photo ${photo.photoId.id}.jpg downloaded successfully to Google Drive!`,
        complete: true,
        inProgress: false,
        driveLink: downloadedFile.webViewLink,
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