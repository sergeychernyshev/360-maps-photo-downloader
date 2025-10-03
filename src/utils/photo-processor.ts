import piexif from "piexifjs";
import { Readable } from "stream";
import { downloadPhoto } from "../photo-manager";
import { createFile, updateFile, findFile } from "../drive-manager";
import { degToDmsRational } from "./photo-utils";
import { getState, updateState } from "../download-state";
import { drive_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Photo } from "../types";

interface Progress {
  photoId: string;
  downloadProgress?: number;
  uploadProgress?: number;
  uploadStarted?: boolean;
  message?: string;
}

/**
 * Downloads a photo, processes its EXIF data, and uploads it to Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {object} oAuth2Client - The OAuth2 client for authentication.
 * @param {object} photo - The photo object to process.
 * @param {string} folderId - The ID of the Google Drive folder to upload the photo to.
 * @param {function} progressCallback - A function to call with progress updates.
 * @returns {Promise<object|null>} A promise that resolves with the photo and file objects, or null if the download was cancelled.
 */
export async function processPhoto(
  drive: drive_v3.Drive,
  oAuth2Client: OAuth2Client,
  photo: Photo,
  folderId: string,
  progressCallback: (progress: Progress) => void,
): Promise<{ photo: Photo; file: any } | null> {
  let attempts = 0;
  const maxAttempts = 3;
  let jpegData;
  let newJpeg;

  while (attempts < maxAttempts) {
    try {
      progressCallback({
        photoId: photo.photoId.id,
        downloadProgress: 0,
      });

      const { data } = await downloadPhoto(
        photo.downloadUrl,
        oAuth2Client,
        (percentage) => {
          progressCallback({
            downloadProgress: percentage,
            photoId: photo.photoId.id,
          });
        },
      );

      if (getState().global.cancelled) {
        progressCallback({
          message: "Download cancelled.",
          photoId: photo.photoId.id,
        });
        return null;
      }

      jpegData = data.toString("binary");
      const exifObj = piexif.load(jpegData);
      if (photo.pose) {
        const lat = photo.pose.latLngPair.latitude;
        const lng = photo.pose.latLngPair.longitude;
        const gpsData: any = {
          [piexif.GPSIFD.GPSLatitudeRef]: lat < 0 ? "S" : "N",
          [piexif.GPSIFD.GPSLatitude]: degToDmsRational(Math.abs(lat)),
          [piexif.GPSIFD.GPSLongitudeRef]: lng < 0 ? "W" : "E",
          [piexif.GPSIFD.GPSLongitude]: degToDmsRational(Math.abs(lng)),
        };

        if (typeof photo.pose.altitude === "number") {
          gpsData[piexif.GPSIFD.GPSAltitude] = [
            Math.round(photo.pose.altitude * 100),
            100,
          ];
          gpsData[piexif.GPSIFD.GPSAltitudeRef] = 0;
        }

        if (typeof photo.pose.heading === "number") {
          gpsData[piexif.GPSIFD.GPSImgDirection] = [
            Math.round(photo.pose.heading * 100),
            100,
          ];
          gpsData[piexif.GPSIFD.GPSImgDirectionRef] = "T";
        }

        exifObj.GPS = gpsData;

        if (
          typeof photo.pose.pitch === "number" ||
          typeof photo.pose.roll === "number"
        ) {
          exifObj["0th"][piexif.ImageIFD.HostComputer] =
            `PosePitchDegrees=${photo.pose.pitch || 0}, PoseRollDegrees=${
              photo.pose.roll || 0
            }`;
        }
      }

      const exifbytes = piexif.dump(exifObj);
      const newData = piexif.insert(exifbytes, jpegData);
      newJpeg = Buffer.from(newData, "binary");
      break; // Success
    } catch (e: any) {
      if (e.message.includes("pack") && attempts < maxAttempts) {
        attempts++;
        const message = `Caught piexifjs pack error, retrying... (${attempts}/${maxAttempts})`;
        console.log(message);
        progressCallback({ message, photoId: photo.photoId.id });
        if (attempts === maxAttempts) {
          const finalMessage = `All ${maxAttempts} attempts failed for photo ${photo.photoId.id}. Uploading without EXIF.`;
          console.error(finalMessage, e);
          progressCallback({
            message: finalMessage,
            photoId: photo.photoId.id,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempts));
      } else {
        throw e;
      }
    }
  }

  if (!newJpeg) {
    if (jpegData) {
      newJpeg = Buffer.from(jpegData, "binary");
    } else {
      return null; // Should not happen if download was successful
    }
  }

  const fileName = `${photo.photoId.id}.jpg`;
  const stream = Readable.from(newJpeg);
  const existingFile = await findFile(drive, fileName, folderId);
  let file;
  progressCallback({ uploadStarted: true, photoId: photo.photoId.id });
  updateState({ status: "uploading" });

  if (existingFile) {
    file = await updateFile(
      drive,
      existingFile.id as string,
      "image/jpeg",
      stream,
      newJpeg.length,
      (percentage) => {
        progressCallback({
          uploadProgress: percentage,
          photoId: photo.photoId.id,
        });
      },
    );
  } else {
    file = await createFile(
      drive,
      fileName,
      "image/jpeg",
      stream,
      folderId,
      newJpeg.length,
      (percentage) => {
        progressCallback({
          uploadProgress: percentage,
          photoId: photo.photoId.id,
        });
      },
    );
  }

  return { photo, file };
}
