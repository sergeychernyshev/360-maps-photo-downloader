"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.filterPhotos = filterPhotos;
const oauth_1 = require("../oauth");
const drive_manager_1 = require("../drive-manager");
const photo_utils_1 = require("../utils/photo-utils");
const photo_manager_1 = require("../photo-manager");
/**
 * Filters, sorts, and paginates the list of photos based on the provided criteria.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object for sending progress updates.
 * @param {object} payload - The filtering, sorting, and pagination options.
 */
async function filterPhotos(req, ws, payload) {
    const { search, status, poseFilters, page, sort, order } = payload;
    if (!req.session.allPhotos) {
        const oAuth2Client = await (0, oauth_1.getAuthenticatedClient)(req);
        req.session.allPhotos = await (0, photo_manager_1.listAllPhotos)(oAuth2Client, ws);
    }
    const { allPhotos } = req.session;
    const oAuth2Client = await (0, oauth_1.getAuthenticatedClient)(req);
    const drive = await (0, drive_manager_1.getDriveClient)(oAuth2Client);
    const folder = await (0, drive_manager_1.findOrCreateFolder)(drive, drive_manager_1.FOLDER_NAME);
    const driveFiles = await (0, drive_manager_1.listFiles)(drive, folder.id);
    const downloadedFiles = new Set(driveFiles.map((f) => f.name));
    const driveFileLinks = new Map(driveFiles.map((f) => [f.name, f.webViewLink]));
    const totalPhotosCount = allPhotos.length;
    const downloadedCount = allPhotos.filter((photo) => downloadedFiles.has(`${photo.photoId.id}.jpg`)).length;
    const notDownloadedCount = totalPhotosCount - downloadedCount;
    const searchedPhotos = allPhotos.filter((photo) => {
        if (!search)
            return true;
        const lowerCaseSearch = search.toLowerCase();
        if (photo.photoId.id.toLowerCase().includes(lowerCaseSearch)) {
            return true;
        }
        if (photo.places && photo.places.length > 0 && photo.places[0].name) {
            return photo.places[0].name.toLowerCase().includes(lowerCaseSearch);
        }
        return false;
    });
    const statusFilteredPhotos = searchedPhotos.filter((photo) => {
        if (status === "all")
            return true;
        const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
        return status === "downloaded" ? isDownloaded : !isDownloaded;
    });
    const poseFilteredPhotos = statusFilteredPhotos.filter((photo) => {
        if (!poseFilters || poseFilters.length === 0)
            return true;
        return poseFilters.every((filter) => {
            if (filter.value === "any")
                return true;
            const exists = filter.property === "latLngPair"
                ? photo.pose && photo.pose.latLngPair !== undefined
                : filter.property === "place"
                    ? photo.places && photo.places.length > 0
                    : photo.pose &&
                        typeof photo.pose[filter.property] === "number";
            return filter.value === "exists" ? exists : !exists;
        });
    });
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
    const photos = sortedPhotos;
    const pageSize = 50;
    const totalPages = Math.ceil(photos.length / pageSize);
    const currentPage = page || 1;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    const paginatedPhotos = photos.slice(startIndex, endIndex);
    const photoListHtml = (0, photo_utils_1.buildPhotoListHtml)(paginatedPhotos, downloadedFiles, driveFileLinks);
    const paginationHtmlTop = (0, photo_utils_1.buildPaginationHtml)(totalPages, currentPage, "changePage", "top");
    const paginationHtmlBottom = (0, photo_utils_1.buildPaginationHtml)(totalPages, currentPage, "changePage", "bottom");
    const poseCounts = (0, photo_utils_1.calculatePoseCounts)(allPhotos);
    ws.send(JSON.stringify({
        type: "filter-results",
        payload: {
            photoListHtml,
            paginationHtmlTop,
            paginationHtmlBottom,
            poseCounts,
            downloadedCount,
            notDownloadedCount,
            totalPhotosCount,
            startIndex: startIndex + 1,
            endIndex: Math.min(endIndex, photos.length),
            filteredTotal: photos.length,
            currentPage,
            totalPages,
            filteredPhotos: photos,
            requestPayload: payload, // Echo the original request payload
        },
    }));
}
//# sourceMappingURL=filter-photos.js.map