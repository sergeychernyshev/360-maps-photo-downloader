/**
 * @property {function} getAuthenticatedClient - Function to get an authenticated OAuth2 client.
 */
const { getAuthenticatedClient } = require("../oauth");
/**
 * @property {function} getDriveClient - Function to get the Google Drive API client.
 * @property {function} findOrCreateFolder - Function to find or create a folder in Google Drive.
 * @property {function} listFiles - Function to list all files in a folder.
 * @property {string} FOLDER_NAME - The name of the folder in Google Drive where the photos will be stored.
 */
const {
  getDriveClient,
  findOrCreateFolder,
  listFiles,
  FOLDER_NAME,
} = require("../drive-manager");
/**
 * @property {function} updateState - Function to update the download state.
 * @property {function} getState - Function to get the current download state.
 */
const { updateState, getState } = require("../download-state");
/**
 * @property {function} processPhoto - Function to download, process, and upload a photo.
 */
const { processPhoto } = require("../utils/photo-processor");

/**
 * Downloads all photos that are missing from Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {Array<object>} photos - The list of photos to download.
 * @param {number} downloadedPhotosCount - The number of photos already downloaded.
 * @param {number} missingPhotosCount - The number of photos to download.
 */
async function downloadAllPhotos(
  req,
  photos,
  downloadedPhotosCount,
  missingPhotosCount,
) {
  const progressCallback = (progress) => {
    const { photoId, ...globalProgress } = progress;
    updateState(globalProgress);
  };

  let skippedCount = 0;

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    updateState({
      folderLink: folder.webViewLink,
    });

    const driveFiles = await listFiles(drive, folderId);
    const existingFileNames = new Set(driveFiles.map((f) => f.name));

    const totalPhotos = photos.length;
    const totalPhotoCount = downloadedPhotosCount + missingPhotosCount;
    const initialProgress =
      totalPhotoCount > 0
        ? Math.round((downloadedPhotosCount / totalPhotoCount) * 100)
        : 0;

    updateState({
      inProgress: true,
      message: `Starting download of ${totalPhotos} photos to Google Drive...`,
      total: totalPhotos,
      current: 0,
      totalProgress: initialProgress,
    });

    for (let i = 0; i < photos.length; i++) {
      if (getState().global.cancelled) {
        updateState({
          message: "Cancelling...",
          complete: true,
          inProgress: false,
          uploadStarted: false,
        });
        break;
      }
      const photo = photos[i];
      const fileName = `${photo.photoId.id}.jpg`;

      let downloadedPhoto;
      if (existingFileNames.has(fileName)) {
        updateState({
          message: `Skipping existing file: ${fileName}`,
        });
        skippedCount++;
        downloadedPhoto = photo;
      } else {
        updateState({
          message: `Processing photo ${
            downloadedPhotosCount + i + 1
          } of ${totalPhotoCount} (${fileName})...`,
          total: totalPhotos,
          current: i,
          status: "downloading",
        });

        downloadedPhoto = await processPhoto(
          drive,
          oAuth2Client,
          photo,
          folderId,
          progressCallback,
        );
      }

      if (downloadedPhoto) {
        if (req.session.missingPhotos && req.session.downloadedPhotos) {
          const downloadedPhotoIndex = req.session.missingPhotos.findIndex(
            (p) => p.photoId.id === photo.photoId.id,
          );
          if (downloadedPhotoIndex > -1) {
            const [splicedPhoto] = req.session.missingPhotos.splice(
              downloadedPhotoIndex,
              1,
            );
            req.session.downloadedPhotos.push(splicedPhoto);
          }
        }

        updateState({
          fileComplete: true,
          downloadedCount: req.session.downloadedPhotos.length,
          notDownloadedCount: req.session.missingPhotos.length,
          totalPhotosCount: totalPhotoCount,
          totalProgress: Math.round(
            ((downloadedPhotosCount + i + 1) /
              (downloadedPhotosCount + missingPhotosCount)) *
              100,
          ),
        });
      } else {
        skippedCount++;
        if (req.session.missingPhotos) {
          const skippedPhotoIndex = req.session.missingPhotos.findIndex(
            (p) => p.photoId.id === photo.photoId.id,
          );
          if (skippedPhotoIndex > -1) {
            req.session.missingPhotos.splice(skippedPhotoIndex, 1);
          }
        }
        updateState({
          fileComplete: true,
          downloadedCount: req.session.downloadedPhotos.length,
          notDownloadedCount: req.session.missingPhotos.length,
          totalPhotosCount: totalPhotoCount,
          message: `Skipping photo ${photo.photoId.id} after multiple failed attempts.`,
          totalProgress: Math.round(
            ((downloadedPhotosCount + i + 1) /
              (downloadedPhotosCount + missingPhotosCount)) *
              100,
          ),
        });
      }
    }

    delete req.session.allPhotos;
    let message = "All photos downloaded successfully to Google Drive!";
    if (skippedCount > 0) {
      message += ` ${skippedCount} photos were skipped.`;
    }
    updateState({
      message,
      complete: true,
      inProgress: false,
      downloadProgress: undefined,
      uploadStarted: false,
    });
  } catch (error) {
    updateState({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
      uploadStarted: false,
    });
    console.error(error);
  }
}

module.exports = { downloadAllPhotos };
