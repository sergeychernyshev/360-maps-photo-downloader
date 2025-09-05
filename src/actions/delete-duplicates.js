/**
 * @property {function} getAuthenticatedClient - Function to get an authenticated OAuth2 client.
 */
const { getAuthenticatedClient } = require("../oauth");
/**
 * @property {function} getDriveClient - Function to get the Google Drive API client.
 * @property {function} deleteFile - Function to delete a file from Google Drive.
 */
const { getDriveClient, deleteFile } = require("../drive-manager");

/**
 * Deletes duplicate files from Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {Array<string>} fileIds - The list of file IDs to delete.
 */
async function deleteDuplicates(req, fileIds) {
  try {
    // Get authenticated client for Google Drive
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);

    // Loop through each file ID and delete the file
    for (const fileId of fileIds) {
      await deleteFile(drive, fileId);
    }
  } catch (error) {
    // Handle errors
    console.error(error);
  }
}

module.exports = { deleteDuplicates };
