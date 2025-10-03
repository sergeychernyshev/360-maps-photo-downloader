import express, { Request, Response, NextFunction } from "express";
import {
  getOAuthClient,
  getAuthenticatedClient,
  isLoggedIn,
  login,
  logout,
} from "../oauth";
import { listAllPhotos } from "../photo-manager";
import {
  getDriveClient,
  findOrCreateFolder,
  getPhotoListFile,
  readFileContent,
  listFiles,
  FOLDER_NAME,
  PHOTO_LIST_FILE_NAME,
} from "../drive-manager";
import { getState } from "../download-state";
import {
  calculatePoseCounts,
  buildPhotoListHtml,
  buildPaginationHtml,
} from "../utils/photo-utils";
import { drive_v3 } from "googleapis";
import { Photo } from "../types";

const router = express.Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  const loggedIn = isLoggedIn(req);

  try {
    let photos: Photo[] = [];
    let drive: drive_v3.Drive | undefined;
    let folderLink;
    let folderId;
    let folderName = FOLDER_NAME;

    if (loggedIn) {
      const oAuth2Client = await getAuthenticatedClient(req);
      drive = await getDriveClient(oAuth2Client);
      const folder = await findOrCreateFolder(drive, FOLDER_NAME);
      if (!folder) {
        throw new Error("Could not find or create folder in Google Drive");
      }
      folderLink = folder.webViewLink;
      folderId = folder.id;
      folderName = folder.name || FOLDER_NAME;

      if ((req.session as any).allPhotos) {
        photos = (req.session as any).allPhotos;
      } else {
        let photoListFile = await getPhotoListFile(drive, folderId as string);

        if (photoListFile) {
          photos = (await readFileContent(
            drive,
            photoListFile.id as string,
          )) as Photo[];
        } else {
          photos = await listAllPhotos(oAuth2Client, {} as any);
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
        (req.session as any).allPhotos = photos;
      }
    }

    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "all";
    const poseQuery = (req.query.pose as string) || "";
    const poseFilters = poseQuery
      .split(",")
      .filter(Boolean)
      .map((p: string) => {
        const [property, value] = p.split(":");
        return { property, value };
      });

    const searchedPhotos = photos.filter((photo: Photo) => {
      if (!search) {
        return true;
      }
      if (photo.places && photo.places.length > 0 && photo.places[0].name) {
        return photo.places[0].name
          .toLowerCase()
          .includes(search.toLowerCase());
      }
      return false;
    });

    const driveFiles =
      loggedIn && drive && folderId ? await listFiles(drive, folderId) : [];
    const drivePhotoCount = driveFiles.filter(
      (f: any) => f.name !== PHOTO_LIST_FILE_NAME,
    ).length;
    const downloadedFiles = new Set(driveFiles.map((f: any) => f.name));
    const driveFileLinks = new Map(
      driveFiles.map((f: any) => [f.name, f.webViewLink]),
    );

    const statusFilteredPhotos = searchedPhotos.filter((photo: Photo) => {
      if (status === "all") {
        return true;
      }
      const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
      return status === "downloaded" ? isDownloaded : !isDownloaded;
    });

    const poseFilteredPhotos = statusFilteredPhotos.filter((photo: Photo) => {
      if (!poseFilters || poseFilters.length === 0) {
        return true;
      }
      return poseFilters.every((filter) => {
        if (filter.value === "any") {
          return true;
        }
        const exists =
          filter.property === "latLngPair"
            ? photo.pose && photo.pose.latLngPair !== undefined
            : photo.pose &&
              typeof (photo.pose as any)[filter.property] === "number";
        return filter.value === "exists" ? exists : !exists;
      });
    });

    const sort = (req.query.sort as string) || "date";
    const order = (req.query.order as string) || "desc";

    const sortedPhotos = poseFilteredPhotos.sort((a: Photo, b: Photo) => {
      let valA, valB;

      if (sort === "date") {
        valA = new Date(a.captureTime);
        valB = new Date(b.captureTime);
      } else if (sort === "views") {
        valA = parseInt(a.viewCount, 10) || 0;
        valB = parseInt(b.viewCount, 10) || 0;
      } else {
        valA = 0;
        valB = 0;
      }

      if (order === "asc") {
        return valA.valueOf() - valB.valueOf();
      } else {
        return valB.valueOf() - valA.valueOf();
      }
    });

    const filteredPhotos = sortedPhotos;

    const totalPhotosCount = photos.length;
    const downloadedCount = photos.filter((p: Photo) =>
      downloadedFiles.has(`${p.photoId.id}.jpg`),
    ).length;
    const notDownloadedCount = totalPhotosCount - downloadedCount;

    const poseCounts = calculatePoseCounts(photos);

    const photoIdsFromStreetView = new Set(
      filteredPhotos.map((p: Photo) => `${p.photoId.id}.jpg`),
    );
    const driveOnlyFiles = driveFiles.filter(
      (f: any) =>
        f.name !== PHOTO_LIST_FILE_NAME && !photoIdsFromStreetView.has(f.name),
    );
    const driveOnlyCount = driveOnlyFiles.length;

    const duplicates = driveFiles.reduce((acc: any, file: any) => {
      acc[file.name] = acc[file.name] || [];
      acc[file.name].push(file);
      return acc;
    }, {});

    const duplicateFiles = Object.keys(duplicates).reduce(
      (acc: any, key: string) => {
        if (duplicates[key].length > 1) {
          acc[key] = duplicates[key];
        }
        return acc;
      },
      {},
    );
    const duplicateFilesCount = Object.keys(duplicateFiles).length;

    const downloadedPhotos = filteredPhotos.filter((p: Photo) =>
      downloadedFiles.has(`${p.photoId.id}.jpg`),
    );
    const missingPhotos = filteredPhotos.filter(
      (p: Photo) => !downloadedFiles.has(`${p.photoId.id}.jpg`),
    );

    if (loggedIn) {
      const allDownloadedPhotos = photos.filter((p: Photo) =>
        downloadedFiles.has(`${p.photoId.id}.jpg`),
      );
      const allMissingPhotos = photos.filter(
        (p: Photo) => !downloadedFiles.has(`${p.photoId.id}.jpg`),
      );
      (req.session as any).downloadedPhotos = allDownloadedPhotos;
      (req.session as any).missingPhotos = allMissingPhotos;
    }

    const page = parseInt(req.query.page as string, 10) || 1;
    const pageSize = 50;
    const totalPages = Math.ceil(filteredPhotos.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPhotos = filteredPhotos.slice(startIndex, endIndex);

    const buildSortLink = (sortBy: string, label: string) => {
      return `<a class="sort-link" href="#" data-sortby="${sortBy}">${label}</a>`;
    };

    const paginationHtmlTop = buildPaginationHtml(
      totalPages,
      page,
      "changePage",
      "top",
    );
    const paginationHtmlBottom = buildPaginationHtml(
      totalPages,
      page,
      "changePage",
      "bottom",
    );

    res.render("index", {
      isLoggedIn: loggedIn,
      totalPhotos: totalPhotosCount,
      displayedPhotos: filteredPhotos.length,
      missingPhotosCount: missingPhotos.length,
      search: search,
      status: status,
      folderLink: loggedIn ? folderLink : null,

      downloadedCount: loggedIn ? downloadedCount : 0,
      notDownloadedCount: loggedIn ? notDownloadedCount : 0,
      driveOnlyCount: loggedIn ? driveOnlyCount : 0,
      driveOnlyFiles: loggedIn ? driveOnlyFiles : [],
      drivePhotoCount: loggedIn ? drivePhotoCount : 0,
      duplicateFiles: loggedIn ? duplicateFiles : {},
      duplicateFilesCount: loggedIn ? duplicateFilesCount : 0,
      folderName: folderName,
      photoListHtml: buildPhotoListHtml(
        paginatedPhotos,
        downloadedFiles,
        driveFileLinks,
      ),
      paginationHtmlTop,
      paginationHtmlBottom,
      buildSortLink,
      totalPhotosCount,
      poseCounts: loggedIn ? poseCounts : {},
      startIndex: startIndex + 1,
      endIndex: Math.min(endIndex, filteredPhotos.length),
      filteredTotal: filteredPhotos.length,
      currentPage: page,
      totalPages,
    });
  } catch (error) {
    next(error);
  }
});

router.get(
  "/login",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const oAuth2Client = await getOAuthClient();
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [
          "https://www.googleapis.com/auth/streetviewpublish",
          "https://www.googleapis.com/auth/drive.file",
        ],
        prompt: "consent",
      });
      res.redirect(authUrl);
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/oauth2callback",
  async (req: Request, res: Response, next: NextFunction) => {
    const { code } = req.query;
    if (!code) {
      return res.status(400).send("Authorization code is missing.");
    }
    try {
      await login(req, code as string);
      res.redirect("/");
    } catch (error) {
      next(error);
    }
  },
);

router.get("/logout", (req: Request, res: Response) => {
  logout(req, () => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

export default router;
