/**
 * @property {function} getAuthenticatedClient - Function to get an authenticated OAuth2 client.
 */
const { getAuthenticatedClient } = require("../oauth");
/**
 * @property {function} listAllPhotos - Function to list all photos for the authenticated user.
 */
const { listAllPhotos } = require("../photo-manager");
/**
 * @property {function} getDriveClient - Function to get the Google Drive API client.
 * @property {function} findOrCreateFolder - Function to find or create a folder in Google Drive.
 * @property {function} getPhotoListFile - Function to get the photo list file from Google Drive.
 * @property {function} writeFileContent - Function to write content to a file in Google Drive.
 * @property {string} FOLDER_NAME - The name of the folder in Google Drive where the photos will be stored.
 * @property {string} PHOTO_LIST_FILE_NAME - The name of the file that stores the list of photos.
 */
const {
  getDriveClient,
  findOrCreateFolder,
  getPhotoListFile,
  writeFileContent,
  FOLDER_NAME,
  PHOTO_LIST_FILE_NAME,
} = require("../drive-manager");
/**
 * @property {function} updateState - Function to update the download state.
 */
const { updateState } = require("../download-state");

/**
 * Updates the list of photos from Google Street View and saves it to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object for sending progress updates.
 */
async function updatePhotoList(req, ws) {
  try {
    // Get authenticated clients for Google Drive and Street View
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);

    // Find or create the folder in Google Drive
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    const folderId = folder.id;

    ws.send(
      JSON.stringify({
        type: "update-progress",
        payload: { folderLink: folder.webViewLink },
      }),
    );

    // Get the existing photo list file, if it exists
    let photoListFile = await getPhotoListFile(drive, folderId);

    // List all photos from Google Street View
    const photos = await listAllPhotos(oAuth2Client, ws);

    // If the photo list file exists, update it. Otherwise, create a new file.
    if (photoListFile) {
      await writeFileContent(drive, photoListFile.id, photos);
    } else {
      await drive.files.create({
        resource: {
          name: PHOTO_LIST_FILE_NAME,
          parents: [folderId],
        },
        media: {
          mimeType: "application/json",
          body: JSON.stringify(photos, null, 2),
        },
        fields: "id",
      });
    }
  } catch (error) {
    // Handle errors
    ws.send(
      JSON.stringify({
        type: "update-progress",
        payload: {
          error: `An error occurred: ${error.message}`,
          complete: true,
          inProgress: false,
        },
      }),
    );
    console.error(error);
  }
}

module.exports = { updatePhotoList };
