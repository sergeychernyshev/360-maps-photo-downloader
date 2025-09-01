const piexif = require("piexifjs");
const { Readable } = require("stream");
const { downloadPhoto } = require("../photo-manager");
const { createFile, updateFile, findFile } = require("../drive-manager");
const { degToDmsRational } = require("./photo-utils");
const { getState } = require("../download-state");

async function processPhoto(
  drive,
  oAuth2Client,
  photo,
  folderId,
  progressCallback
) {
  const fileName = `${photo.photoId.id}.jpg`;

  progressCallback({
    message: `Processing photo ${fileName}...`,
    photoId: photo.photoId.id,
    downloadProgress: 0,
  });

  const { data } = await downloadPhoto(
    photo.downloadUrl,
    oAuth2Client,
    (percentage) => {
      progressCallback({ downloadProgress: percentage, photoId: photo.photoId.id });
    }
  );

  if (getState().cancelled) {
    progressCallback({ message: "Download cancelled." });
    return null;
  }

  const jpegData = data.toString("binary");
  const exifObj = piexif.load(jpegData);
  const lat = photo.pose.latLngPair.latitude;
  const lng = photo.pose.latLngPair.longitude;
  const gpsData = {
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

  const exifbytes = piexif.dump(exifObj);
  const newData = piexif.insert(exifbytes, jpegData);
  const newJpeg = Buffer.from(newData, "binary");
  const stream = Readable.from(newJpeg);

  const existingFile = await findFile(drive, fileName, folderId);
  let file;
  if (existingFile) {
    file = await updateFile(
      drive,
      existingFile.id,
      "image/jpeg",
      stream,
      newJpeg.length,
      (percentage) => {
        progressCallback({ uploadProgress: percentage, photoId: photo.photoId.id });
      }
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
        progressCallback({ uploadProgress: percentage, photoId: photo.photoId.id });
      }
    );
  }

  return { photo, file };
}

module.exports = { processPhoto };