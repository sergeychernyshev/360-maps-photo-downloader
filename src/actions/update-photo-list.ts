import { Request } from "express";
import { WebSocket } from "ws";
import { getAuthenticatedClient } from "../oauth";
import { listAllPhotos } from "../photo-manager";
import {
  getDriveClient,
  findOrCreateFolder,
  getPhotoListFile,
  writeFileContent,
  FOLDER_NAME,
  PHOTO_LIST_FILE_NAME,
} from "../drive-manager";
import { updateState } from "../download-state";

/**
 * Updates the list of photos from Google Street View and saves it to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object for sending progress updates.
 */
export async function updatePhotoList(req: Request, ws: WebSocket) {
  try {
    /**
     * The authenticated OAuth2 client.
     * @type {import("google-auth-library").OAuth2Client}
     */
    const oAuth2Client = await getAuthenticatedClient(req);
    /**
     * The Google Drive API client.
     * @type {import("googleapis").drive_v3.Drive}
     */
    const drive = await getDriveClient(oAuth2Client);

    /**
     * The folder in Google Drive where the photos are stored.
     * @type {object}
     */
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    /**
     * The ID of the folder in Google Drive where the photos are stored.
     * @type {string}
     */
    const folderId = folder.id;

    ws.send(
      JSON.stringify({
        type: "update-progress",
        payload: { folderLink: folder.webViewLink },
      }),
    );

    /**
     * The file in Google Drive that stores the list of photos.
     * @type {object}
     */
    let photoListFile = await getPhotoListFile(drive, folderId as string);

    /**
     * The list of photos from Google Street View.
     * @type {Array<object>}
     */
    const photos = await listAllPhotos(oAuth2Client, ws);

    // If the photo list file exists, update it. Otherwise, create a new file.
    if (photoListFile) {
      await writeFileContent(drive, photoListFile.id as string, photos);
    } else {
      await drive.files.create({
        requestBody: {
          name: PHOTO_LIST_FILE_NAME,
          parents: [folderId as string],
        },
        media: {
          mimeType: "application/json",
          body: JSON.stringify(photos, null, 2),
        },
        fields: "id",
      });
    }
  } catch (error: any) {
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
