"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const oauth_1 = require("../oauth");
const photo_manager_1 = require("../photo-manager");
const drive_manager_1 = require("../drive-manager");
const photo_utils_1 = require("../utils/photo-utils");
const router = express_1.default.Router();
router.get("/", async (req, res, next) => {
    const loggedIn = (0, oauth_1.isLoggedIn)(req);
    try {
        let photos = [];
        let drive;
        let folderLink;
        let folderId;
        let folderName = drive_manager_1.FOLDER_NAME;
        if (loggedIn) {
            const oAuth2Client = await (0, oauth_1.getAuthenticatedClient)(req);
            drive = await (0, drive_manager_1.getDriveClient)(oAuth2Client);
            const folder = await (0, drive_manager_1.findOrCreateFolder)(drive, drive_manager_1.FOLDER_NAME);
            if (!folder) {
                throw new Error("Could not find or create folder in Google Drive");
            }
            folderLink = folder.webViewLink;
            folderId = folder.id;
            folderName = folder.name || drive_manager_1.FOLDER_NAME;
            if (req.session.allPhotos) {
                photos = req.session.allPhotos;
            }
            else {
                let photoListFile = await (0, drive_manager_1.getPhotoListFile)(drive, folderId);
                if (photoListFile) {
                    photos = (await (0, drive_manager_1.readFileContent)(drive, photoListFile.id));
                }
                else {
                    photos = await (0, photo_manager_1.listAllPhotos)(oAuth2Client, {});
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
                req.session.allPhotos = photos;
            }
        }
        const search = req.query.search || "";
        const status = req.query.status || "all";
        const poseQuery = req.query.pose || "";
        const poseFilters = poseQuery
            .split(",")
            .filter(Boolean)
            .map((p) => {
            const [property, value] = p.split(":");
            return { property, value };
        });
        const searchedPhotos = photos.filter((photo) => {
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
        const driveFiles = loggedIn && drive && folderId ? await (0, drive_manager_1.listFiles)(drive, folderId) : [];
        const drivePhotoCount = driveFiles.filter((f) => f.name !== drive_manager_1.PHOTO_LIST_FILE_NAME).length;
        const downloadedFiles = new Set(driveFiles.map((f) => f.name));
        const driveFileLinks = new Map(driveFiles.map((f) => [f.name, f.webViewLink]));
        const statusFilteredPhotos = searchedPhotos.filter((photo) => {
            if (status === "all") {
                return true;
            }
            const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
            return status === "downloaded" ? isDownloaded : !isDownloaded;
        });
        const poseFilteredPhotos = statusFilteredPhotos.filter((photo) => {
            if (!poseFilters || poseFilters.length === 0) {
                return true;
            }
            return poseFilters.every((filter) => {
                if (filter.value === "any") {
                    return true;
                }
                const exists = filter.property === "latLngPair"
                    ? photo.pose && photo.pose.latLngPair !== undefined
                    : photo.pose &&
                        typeof photo.pose[filter.property] === "number";
                return filter.value === "exists" ? exists : !exists;
            });
        });
        const sort = req.query.sort || "date";
        const order = req.query.order || "desc";
        const sortedPhotos = poseFilteredPhotos.sort((a, b) => {
            let valA, valB;
            if (sort === "date") {
                valA = new Date(a.captureTime);
                valB = new Date(b.captureTime);
            }
            else if (sort === "views") {
                valA = parseInt(a.viewCount, 10) || 0;
                valB = parseInt(b.viewCount, 10) || 0;
            }
            else {
                valA = 0;
                valB = 0;
            }
            if (order === "asc") {
                return valA.valueOf() - valB.valueOf();
            }
            else {
                return valB.valueOf() - valA.valueOf();
            }
        });
        const filteredPhotos = sortedPhotos;
        const totalPhotosCount = photos.length;
        const downloadedCount = photos.filter((p) => downloadedFiles.has(`${p.photoId.id}.jpg`)).length;
        const notDownloadedCount = totalPhotosCount - downloadedCount;
        const poseCounts = (0, photo_utils_1.calculatePoseCounts)(photos);
        const photoIdsFromStreetView = new Set(filteredPhotos.map((p) => `${p.photoId.id}.jpg`));
        const driveOnlyFiles = driveFiles.filter((f) => f.name !== drive_manager_1.PHOTO_LIST_FILE_NAME && !photoIdsFromStreetView.has(f.name));
        const driveOnlyCount = driveOnlyFiles.length;
        const duplicates = driveFiles.reduce((acc, file) => {
            acc[file.name] = acc[file.name] || [];
            acc[file.name].push(file);
            return acc;
        }, {});
        const duplicateFiles = Object.keys(duplicates).reduce((acc, key) => {
            if (duplicates[key].length > 1) {
                acc[key] = duplicates[key];
            }
            return acc;
        }, {});
        const duplicateFilesCount = Object.keys(duplicateFiles).length;
        const downloadedPhotos = filteredPhotos.filter((p) => downloadedFiles.has(`${p.photoId.id}.jpg`));
        const missingPhotos = filteredPhotos.filter((p) => !downloadedFiles.has(`${p.photoId.id}.jpg`));
        if (loggedIn) {
            const allDownloadedPhotos = photos.filter((p) => downloadedFiles.has(`${p.photoId.id}.jpg`));
            const allMissingPhotos = photos.filter((p) => !downloadedFiles.has(`${p.photoId.id}.jpg`));
            req.session.downloadedPhotos = allDownloadedPhotos;
            req.session.missingPhotos = allMissingPhotos;
        }
        const page = parseInt(req.query.page, 10) || 1;
        const pageSize = 50;
        const totalPages = Math.ceil(filteredPhotos.length / pageSize);
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedPhotos = filteredPhotos.slice(startIndex, endIndex);
        const buildSortLink = (sortBy, label) => {
            return `<a class="sort-link" href="#" data-sortby="${sortBy}">${label}</a>`;
        };
        const paginationHtmlTop = (0, photo_utils_1.buildPaginationHtml)(totalPages, page, "changePage", "top");
        const paginationHtmlBottom = (0, photo_utils_1.buildPaginationHtml)(totalPages, page, "changePage", "bottom");
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
            photoListHtml: (0, photo_utils_1.buildPhotoListHtml)(paginatedPhotos, downloadedFiles, driveFileLinks),
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
    }
    catch (error) {
        next(error);
    }
});
router.get("/login", async (req, res, next) => {
    try {
        const oAuth2Client = await (0, oauth_1.getOAuthClient)();
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: "offline",
            scope: [
                "https://www.googleapis.com/auth/streetviewpublish",
                "https://www.googleapis.com/auth/drive.file",
            ],
            prompt: "consent",
        });
        res.redirect(authUrl);
    }
    catch (error) {
        next(error);
    }
});
router.get("/oauth2callback", async (req, res, next) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).send("Authorization code is missing.");
    }
    try {
        await (0, oauth_1.login)(req, code);
        res.redirect("/");
    }
    catch (error) {
        next(error);
    }
});
router.get("/logout", (req, res) => {
    (0, oauth_1.logout)(req, () => {
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
});
exports.default = router;
//# sourceMappingURL=index.js.map