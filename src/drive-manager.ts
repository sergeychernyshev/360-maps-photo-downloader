import { google, drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "stream";
import { GaxiosResponse } from "gaxios";

/**
 * The name of the folder in Google Drive where the photos will be stored.
 * @type {string}
 */
export const FOLDER_NAME = "Google Street View Photos";
/**
 * The name of the file that stores the list of photos.
 * @type {string}
 */
export const PHOTO_LIST_FILE_NAME = "streetview_photos.json";

/**
 * Gets the Google Drive API client.
 * @param {object} auth - The OAuth2 client for authentication.
 * @returns {Promise<object>} A promise that resolves with the Google Drive API client.
 */
export async function getDriveClient(
  auth: OAuth2Client,
): Promise<drive_v3.Drive> {
  return google.drive({ version: "v3", auth });
}

/**
 * Finds a folder by name in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} folderName - The name of the folder to find.
 * @returns {Promise<object|null>} A promise that resolves with the folder object, or null if not found.
 */
async function findFolder(drive: drive_v3.Drive, folderName: string) {
  const res = await drive.files.list({
    q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`,
    fields: "files(id, name, webViewLink)",
    spaces: "drive",
  });
  return res.data.files && res.data.files.length > 0 ? res.data.files[0] : null;
}

/**
 * Creates a folder in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} folderName - The name of the folder to create.
 * @returns {Promise<object>} A promise that resolves with the created folder object.
 */
async function createFolder(drive: drive_v3.Drive, folderName: string) {
  const fileMetadata = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };
  const res = await drive.files.create({
    requestBody: fileMetadata,
    fields: "id, webViewLink",
  });
  return res.data;
}

/**
 * Finds a folder by name in Google Drive, or creates it if it doesn't exist.
 * @param {object} drive - The Google Drive API client.
 * @param {string} folderName - The name of the folder to find or create.
 * @returns {Promise<object>} A promise that resolves with the folder object.
 */
export async function findOrCreateFolder(
  drive: drive_v3.Drive,
  folderName: string,
) {
  let folder = await findFolder(drive, folderName);
  if (!folder) {
    folder = await createFolder(drive, folderName);
  }
  return folder;
}

/**
 * Finds a file by name in a specific folder in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileName - The name of the file to find.
 * @param {string} folderId - The ID of the folder to search in.
 * @returns {Promise<object|null>} A promise that resolves with the file object, or null if not found.
 */
async function findFileInFolder(
  drive: drive_v3.Drive,
  fileName: string,
  folderId: string,
) {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  return res.data.files && res.data.files.length > 0 ? res.data.files[0] : null;
}

/**
 * Gets the photo list file from a specific folder in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} folderId - The ID of the folder to search in.
 * @returns {Promise<object|null>} A promise that resolves with the file object, or null if not found.
 */
export async function getPhotoListFile(
  drive: drive_v3.Drive,
  folderId: string,
) {
  return findFileInFolder(drive, PHOTO_LIST_FILE_NAME, folderId);
}

/**
 * Reads the content of a file from Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileId - The ID of the file to read.
 * @returns {Promise<object>} A promise that resolves with the file content.
 */
export async function readFileContent(drive: drive_v3.Drive, fileId: string) {
  console.log(`Downloading file from Google Drive: ${fileId}`);
  const res = await drive.files.get({ fileId, alt: "media" });
  return res.data;
}

/**
 * Writes content to a file in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileId - The ID of the file to write to.
 * @param {object} content - The content to write to the file.
 * @returns {Promise<void>}
 */
export async function writeFileContent(
  drive: drive_v3.Drive,
  fileId: string,
  content: any,
) {
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/json",
      body: JSON.stringify(content, null, 2),
    },
  });
}

/**
 * Creates a file in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileName - The name of the file to create.
 * @param {string} mimeType - The MIME type of the file.
 * @param {ReadableStream} contentStream - The content of the file as a readable stream.
 * @param {string} folderId - The ID of the folder to create the file in.
 * @param {number} size - The size of the file in bytes.
 * @param {function} onUploadProgress - A function to call with upload progress updates.
 * @returns {Promise<object>} A promise that resolves with the created file object.
 */
export async function createFile(
  drive: drive_v3.Drive,
  fileName: string,
  mimeType: string,
  contentStream: Readable,
  folderId: string,
  size: number,
  onUploadProgress: (progress: number) => void,
) {
  const fileMetadata = {
    name: fileName,
    parents: [folderId],
  };

  const media = {
    mimeType,
    body: contentStream,
  };

  const res = await drive.files.create(
    {
      requestBody: fileMetadata,
      media: media,
      fields: "id, webViewLink",
    },
    {
      onUploadProgress: (evt) => {
        if (size) {
          const progress = Math.round((evt.bytesRead / size) * 100);
          onUploadProgress(progress);
        }
      },
    },
  );
  return res.data;
}

/**
 * Lists all files in a specific folder in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} folderId - The ID of the folder to list files from.
 * @returns {Promise<Array<object>>} A promise that resolves with a list of file objects.
 */
export async function listFiles(drive: drive_v3.Drive, folderId: string) {
  const allFiles: drive_v3.Schema$File[] = [];
  let pageToken: string | null = null;
  do {
    const res: GaxiosResponse<drive_v3.Schema$FileList> =
      await drive.files.list({
        q: `'${folderId}' in parents and trashed=false and mimeType != 'application/vnd.google-apps.folder'`,
        fields: "nextPageToken, files(id, name, mimeType, webViewLink)",
        spaces: "drive",
        pageToken: pageToken || undefined,
        pageSize: 1000,
      });

    if (res.data.files) {
      for (const file of res.data.files) {
        allFiles.push(file);
      }
    }
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return allFiles;
}

/**
 * Finds a file by name in a specific folder in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileName - The name of the file to find.
 * @param {string} folderId - The ID of the folder to search in.
 * @returns {Promise<object|null>} A promise that resolves with the file object, or null if not found.
 */
export async function findFile(
  drive: drive_v3.Drive,
  fileName: string,
  folderId: string,
) {
  const res = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });
  return res.data.files && res.data.files.length > 0 ? res.data.files[0] : null;
}

/**
 * Deletes a file from Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileId - The ID of the file to delete.
 * @returns {Promise<void>}
 */
export async function deleteFile(drive: drive_v3.Drive, fileId: string) {
  await drive.files.delete({
    fileId: fileId,
  });
}

/**
 * Updates a file in Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {string} fileId - The ID of the file to update.
 * @param {string} mimeType - The MIME type of the file.
 * @param {ReadableStream} contentStream - The new content of the file as a readable stream.
 * @param {number} size - The size of the file in bytes.
 * @param {function} onUploadProgress - A function to call with upload progress updates.
 * @returns {Promise<object>} A promise that resolves with the updated file object.
 */
export async function updateFile(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string,
  contentStream: Readable,
  size: number,
  onUploadProgress: (progress: number) => void,
) {
  const media = {
    mimeType,
    body: contentStream,
  };

  const res = await drive.files.update(
    {
      fileId: fileId,
      media: media,
      fields: "id, webViewLink",
    },
    {
      onUploadProgress: (evt) => {
        if (size) {
          const progress = Math.round((evt.bytesRead / size) * 100);
          onUploadProgress(progress);
        }
      },
    },
  );
  return res.data;
}
