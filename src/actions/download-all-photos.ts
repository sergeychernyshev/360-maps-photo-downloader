import { Request } from "express";
import { getAuthenticatedClient } from "../oauth";
import {
  getDriveClient,
  findOrCreateFolder,
  listFiles,
  FOLDER_NAME,
} from "../drive-manager";
import { updateState, getState } from "../download-state";
import { processPhoto } from "../utils/photo-processor";
import { Photo } from "../types";

interface Progress {
  photoId: string;
  [key: string]: any;
}

/**
 * Downloads all photos that are missing from Google Drive.
 * @param {object} req - The Express request object, containing the session.
 * @param {Array<object>} photos - The list of photos to download.
 * @param {number} downloadedPhotosCount - The number of photos already downloaded.
 * @param {number} missingPhotosCount - The number of photos to download.
 */
export async function downloadAllPhotos(
  req: Request,
  photos: Photo[],
  downloadedPhotosCount: number,
  missingPhotosCount: number,
) {
  const progressCallback = (progress: Progress) => {
    const { photoId, ...globalProgress } = progress;
    updateState(globalProgress);
  };

  let skippedCount = 0;

  try {
    const oAuth2Client = await getAuthenticatedClient(req);
    const drive = await getDriveClient(oAuth2Client);
    const folder = await findOrCreateFolder(drive, FOLDER_NAME);
    if (!folder || !folder.id) {
      throw new Error("Could not find or create folder in Google Drive");
    }
    const folderId = folder.id;

    updateState({
      folderLink: folder.webViewLink || undefined,
    });

    const driveFiles = await listFiles(drive, folderId as string);
    const existingFileNames = new Set(driveFiles.map((f: any) => f.name));

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
          photo as any,
          folderId as string,
          progressCallback,
        );
      }

      if (downloadedPhoto) {
        if (
          (req.session as any).missingPhotos &&
          (req.session as any).downloadedPhotos
        ) {
          const downloadedPhotoIndex = (
            req.session as any
          ).missingPhotos.findIndex(
            (p: any) => p.photoId.id === photo.photoId.id,
          );
          if (downloadedPhotoIndex > -1) {
            const [splicedPhoto] = (req.session as any).missingPhotos.splice(
              downloadedPhotoIndex,
              1,
            );
            (req.session as any).downloadedPhotos.push(splicedPhoto);
          }
        }

        updateState({
          fileComplete: true,
          downloadedCount: (req.session as any).downloadedPhotos.length,
          notDownloadedCount: (req.session as any).missingPhotos.length,
          totalPhotosCount: totalPhotoCount,
          totalProgress: Math.round(
            ((downloadedPhotosCount + i + 1) /
              (downloadedPhotosCount + missingPhotosCount)) *
              100,
          ),
        });
      } else {
        skippedCount++;
        if ((req.session as any).missingPhotos) {
          const skippedPhotoIndex = (
            req.session as any
          ).missingPhotos.findIndex(
            (p: any) => p.photoId.id === photo.photoId.id,
          );
          if (skippedPhotoIndex > -1) {
            (req.session as any).missingPhotos.splice(skippedPhotoIndex, 1);
          }
        }
        updateState({
          fileComplete: true,
          downloadedCount: (req.session as any).downloadedPhotos.length,
          notDownloadedCount: (req.session as any).missingPhotos.length,
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

    delete (req.session as any).allPhotos;
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
  } catch (error: any) {
    updateState({
      error: `An error occurred: ${error.message}`,
      complete: true,
      inProgress: false,
      uploadStarted: false,
    });
    console.error(error);
  }
}
