import { Request } from "express";
import { getAuthenticatedClient } from "../oauth";
import {
  getDriveClient,
  findOrCreateFolder,
  FOLDER_NAME,
} from "../drive-manager";
import { updateState } from "../download-state";
import { processPhoto } from "../utils/photo-processor";
import { Photo } from "../types";

interface Progress {
  photoId?: string;
  [key: string]: any;
}

/**
 * Downloads a single photo to Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} photo - The photo object to download.
 */
export async function downloadSinglePhoto(req: Request, photo: Photo) {
  const progressCallback = (progress: Progress) => {
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

    const result = await processPhoto(
      drive,
      oAuth2Client,
      photo as any,
      folderId as string,
      progressCallback,
    );

    if (result) {
      const { photo: downloadedPhoto, file: downloadedFile } = result;
      if (
        (req.session as any).missingPhotos &&
        (req.session as any).downloadedPhotos
      ) {
        // Remove from missingPhotos if it exists
        const missingIndex = (req.session as any).missingPhotos.findIndex(
          (p: any) => p.photoId.id === photo.photoId.id,
        );
        if (missingIndex > -1) {
          (req.session as any).missingPhotos.splice(missingIndex, 1);
        }

        // Remove from downloadedPhotos if it exists (for re-downloads)
        const downloadedIndex = (req.session as any).downloadedPhotos.findIndex(
          (p: any) => p.photoId.id === photo.photoId.id,
        );
        if (downloadedIndex > -1) {
          (req.session as any).downloadedPhotos.splice(downloadedIndex, 1);
        }

        // Add the photo to downloadedPhotos
        (req.session as any).downloadedPhotos.push(downloadedPhoto);
      }

      progressCallback({
        photoId: photo.photoId.id,
        fileComplete: true,
        complete: true,
        driveLink: downloadedFile.webViewLink,
        downloadProgress: undefined,
      });

      updateState({
        downloadedCount: (req.session as any).downloadedPhotos.length,
        notDownloadedCount: (req.session as any).missingPhotos.length,
        totalPhotosCount:
          (req.session as any).downloadedPhotos.length +
          (req.session as any).missingPhotos.length,
      });
    }
  } catch (error: any) {
    progressCallback({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
    });
    console.error(error);
  }
}
