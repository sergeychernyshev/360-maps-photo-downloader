"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteDuplicates = deleteDuplicates;
const oauth_1 = require("../oauth");
const drive_manager_1 = require("../drive-manager");
/**
 * Deletes duplicate files from Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {Array<string>} fileIds - The list of file IDs to delete.
 */
async function deleteDuplicates(req, fileIds) {
  try {
    // Get authenticated client for Google Drive
    const oAuth2Client = await (0, oauth_1.getAuthenticatedClient)(req);
    const drive = await (0, drive_manager_1.getDriveClient)(oAuth2Client);
    // Loop through each file ID and delete the file
    for (const fileId of fileIds) {
      await (0, drive_manager_1.deleteFile)(drive, fileId);
    }
  } catch (error) {
    // Handle errors
    console.error(error);
  }
}
//# sourceMappingURL=delete-duplicates.js.map
