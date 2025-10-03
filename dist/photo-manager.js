"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAllPhotos = listAllPhotos;
exports.downloadPhoto = downloadPhoto;
exports.filterPhotos = filterPhotos;
const googleapis_1 = require("googleapis");
const axios_1 = __importDefault(require("axios"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const CREDENTIALS_PATH = path_1.default.join(process.cwd(), "credentials.json");
/**
 * Lists all photos for the authenticated user, handling pagination.
 * @param {import('google-auth-library').OAuth2Client} authClient An authorized OAuth2 client.
 * @param {(message: string) => void} [log=() => {}] An optional function to log progress messages.
 */
async function listAllPhotos(authClient, ws) {
    const credsContent = await fs_1.promises.readFile(CREDENTIALS_PATH, "utf-8");
    const { api_key } = JSON.parse(credsContent).web;
    const streetviewpublish = googleapis_1.google.streetviewpublish({
        version: "v1",
        auth: authClient,
    });
    const allPhotos = [];
    let nextPageToken = null;
    ws.send(JSON.stringify({
        type: "update-progress",
        payload: { message: "Fetching photo list...", count: 0 },
    }));
    do {
        const res = await streetviewpublish.photos.list({
            view: "INCLUDE_DOWNLOAD_URL",
            pageSize: 100,
            pageToken: nextPageToken || undefined,
        });
        if (res.data.photos && res.data.photos.length > 0) {
            allPhotos.push(...res.data.photos);
            ws.send(JSON.stringify({
                type: "update-progress",
                payload: {
                    message: `Found ${allPhotos.length} photos...`,
                    count: allPhotos.length,
                },
            }));
        }
        nextPageToken = res.data.nextPageToken;
    } while (nextPageToken);
    ws.send(JSON.stringify({
        type: "update-progress",
        payload: {
            message: `Found ${allPhotos.length} total photos.`,
            count: allPhotos.length,
            complete: true,
        },
    }));
    return allPhotos;
}
/**
 * Downloads a single photo.
 * @param {string} photoUrl - The URL of the photo to download.
 * @param {import('google-auth-library').OAuth2Client} authClient - An authorized OAuth2 client.
 * @param {function} progressCallback - A function to call with download progress updates.
 * @returns {Promise<{data: Buffer, size: number}>} A promise that resolves with the photo data and size.
 */
async function downloadPhoto(photoUrl, authClient, progressCallback = () => { }) {
    const response = await (0, axios_1.default)({
        method: "GET",
        url: photoUrl,
        responseType: "arraybuffer",
        headers: {
            Authorization: `Bearer ${authClient.credentials.access_token}`,
        },
        onDownloadProgress: (progressEvent) => {
            const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            progressCallback(percentage);
        },
    });
    return { data: Buffer.from(response.data), size: response.data.length };
}
/**
 * Filters a list of photos based on the provided criteria.
 * @param {Array<object>} allPhotos - The list of photos to filter.
 * @param {object} options - The filtering options.
 * @returns {Array<object>} The filtered list of photos.
 */
function filterPhotos(allPhotos, { search, status, filters, downloadedFiles }) {
    const filteredBySearch = allPhotos.filter((photo) => {
        if (!search) {
            return true;
        }
        if (photo.places && photo.places.length > 0 && photo.places[0].name) {
            return photo.places[0].name.toLowerCase().includes(search.toLowerCase());
        }
        return false;
    });
    const filteredByStatus = filteredBySearch.filter((photo) => {
        if (status === "all") {
            return true;
        }
        const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
        return status === "downloaded" ? isDownloaded : !isDownloaded;
    });
    const filteredByPose = filteredByStatus.filter((photo) => {
        if (!filters || filters.length === 0) {
            return true;
        }
        return filters.every((filter) => {
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
    return filteredByPose;
}
//# sourceMappingURL=photo-manager.js.map