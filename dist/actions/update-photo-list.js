"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePhotoList = updatePhotoList;
const oauth_1 = require("../oauth");
const photo_manager_1 = require("../photo-manager");
const drive_manager_1 = require("../drive-manager");
/**
 * Updates the list of photos from Google Street View and saves it to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object for sending progress updates.
 */
async function updatePhotoList(req, ws) {
    try {
        /**
         * The authenticated OAuth2 client.
         * @type {import("google-auth-library").OAuth2Client}
         */
        const oAuth2Client = await (0, oauth_1.getAuthenticatedClient)(req);
        /**
         * The Google Drive API client.
         * @type {import("googleapis").drive_v3.Drive}
         */
        const drive = await (0, drive_manager_1.getDriveClient)(oAuth2Client);
        /**
         * The folder in Google Drive where the photos are stored.
         * @type {object}
         */
        const folder = await (0, drive_manager_1.findOrCreateFolder)(drive, drive_manager_1.FOLDER_NAME);
        /**
         * The ID of the folder in Google Drive where the photos are stored.
         * @type {string}
         */
        const folderId = folder.id;
        ws.send(JSON.stringify({
            type: "update-progress",
            payload: { folderLink: folder.webViewLink },
        }));
        /**
         * The file in Google Drive that stores the list of photos.
         * @type {object}
         */
        let photoListFile = await (0, drive_manager_1.getPhotoListFile)(drive, folderId);
        /**
         * The list of photos from Google Street View.
         * @type {Array<object>}
         */
        const photos = await (0, photo_manager_1.listAllPhotos)(oAuth2Client, ws);
        // If the photo list file exists, update it. Otherwise, create a new file.
        if (photoListFile) {
            await (0, drive_manager_1.writeFileContent)(drive, photoListFile.id, photos);
        }
        else {
            await drive.files.create({
                requestBody: {
                    name: drive_manager_1.PHOTO_LIST_FILE_NAME,
                    parents: [folderId],
                },
                media: {
                    mimeType: "application/json",
                    body: JSON.stringify(photos, null, 2),
                },
                fields: "id",
            });
        }
    }
    catch (error) {
        // Handle errors
        ws.send(JSON.stringify({
            type: "update-progress",
            payload: {
                error: `An error occurred: ${error.message}`,
                complete: true,
                inProgress: false,
            },
        }));
        console.error(error);
    }
}
//# sourceMappingURL=update-photo-list.js.map