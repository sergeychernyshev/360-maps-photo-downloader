"use strict";
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
exports.processPhoto = processPhoto;
const piexifjs_1 = __importDefault(require("piexifjs"));
const stream_1 = require("stream");
const photo_manager_1 = require("../photo-manager");
const drive_manager_1 = require("../drive-manager");
const photo_utils_1 = require("./photo-utils");
const download_state_1 = require("../download-state");
/**
 * Downloads a photo, processes its EXIF data, and uploads it to Google Drive.
 * @param {object} drive - The Google Drive API client.
 * @param {object} oAuth2Client - The OAuth2 client for authentication.
 * @param {object} photo - The photo object to process.
 * @param {string} folderId - The ID of the Google Drive folder to upload the photo to.
 * @param {function} progressCallback - A function to call with progress updates.
 * @returns {Promise<object|null>} A promise that resolves with the photo and file objects, or null if the download was cancelled.
 */
async function processPhoto(
  drive,
  oAuth2Client,
  photo,
  folderId,
  progressCallback,
) {
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
      const { data } = await (0, photo_manager_1.downloadPhoto)(
        photo.downloadUrl,
        oAuth2Client,
        (percentage) => {
          progressCallback({
            downloadProgress: percentage,
            photoId: photo.photoId.id,
          });
        },
      );
      if ((0, download_state_1.getState)().global.cancelled) {
        progressCallback({
          message: "Download cancelled.",
          photoId: photo.photoId.id,
        });
        return null;
      }
      jpegData = data.toString("binary");
      const exifObj = piexifjs_1.default.load(jpegData);
      if (photo.pose) {
        const lat = photo.pose.latLngPair.latitude;
        const lng = photo.pose.latLngPair.longitude;
        const gpsData = {
          [piexifjs_1.default.GPSIFD.GPSLatitudeRef]: lat < 0 ? "S" : "N",
          [piexifjs_1.default.GPSIFD.GPSLatitude]: (0,
          photo_utils_1.degToDmsRational)(Math.abs(lat)),
          [piexifjs_1.default.GPSIFD.GPSLongitudeRef]: lng < 0 ? "W" : "E",
          [piexifjs_1.default.GPSIFD.GPSLongitude]: (0,
          photo_utils_1.degToDmsRational)(Math.abs(lng)),
        };
        if (typeof photo.pose.altitude === "number") {
          gpsData[piexifjs_1.default.GPSIFD.GPSAltitude] = [
            Math.round(photo.pose.altitude * 100),
            100,
          ];
          gpsData[piexifjs_1.default.GPSIFD.GPSAltitudeRef] = 0;
        }
        if (typeof photo.pose.heading === "number") {
          gpsData[piexifjs_1.default.GPSIFD.GPSImgDirection] = [
            Math.round(photo.pose.heading * 100),
            100,
          ];
          gpsData[piexifjs_1.default.GPSIFD.GPSImgDirectionRef] = "T";
        }
        exifObj.GPS = gpsData;
        if (
          typeof photo.pose.pitch === "number" ||
          typeof photo.pose.roll === "number"
        ) {
          exifObj["0th"][piexifjs_1.default.ImageIFD.HostComputer] =
            `PosePitchDegrees=${photo.pose.pitch || 0}, PoseRollDegrees=${photo.pose.roll || 0}`;
        }
      }
      const exifbytes = piexifjs_1.default.dump(exifObj);
      const newData = piexifjs_1.default.insert(exifbytes, jpegData);
      newJpeg = Buffer.from(newData, "binary");
      break; // Success
    } catch (e) {
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
  const stream = stream_1.Readable.from(newJpeg);
  const existingFile = await (0, drive_manager_1.findFile)(
    drive,
    fileName,
    folderId,
  );
  let file;
  progressCallback({ uploadStarted: true, photoId: photo.photoId.id });
  (0, download_state_1.updateState)({ status: "uploading" });
  if (existingFile) {
    file = await (0, drive_manager_1.updateFile)(
      drive,
      existingFile.id,
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
    file = await (0, drive_manager_1.createFile)(
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
//# sourceMappingURL=photo-processor.js.map
