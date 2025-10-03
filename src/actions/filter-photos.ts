import { Request } from "express";
import { WebSocket } from "ws";
import { getAuthenticatedClient } from "../oauth";
import {
  getDriveClient,
  listFiles,
  findOrCreateFolder,
  FOLDER_NAME,
} from "../drive-manager";
import {
  buildPhotoListHtml,
  buildPaginationHtml,
  calculatePoseCounts,
} from "../utils/photo-utils";
import { listAllPhotos } from "../photo-manager";
import { Photo } from "../types";

interface Payload {
  search: string;
  status: "all" | "downloaded" | "not-downloaded";
  poseFilters: Filter[];
  page: number;
  sort: "date" | "views";
  order: "asc" | "desc";
}

interface Filter {
  property: string;
  value: "any" | "exists" | "not-exists";
}

/**
 * Filters, sorts, and paginates the list of photos based on the provided criteria.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object for sending progress updates.
 * @param {object} payload - The filtering, sorting, and pagination options.
 */
export async function filterPhotos(
  req: Request,
  ws: WebSocket,
  payload: Payload,
) {
  const { search, status, poseFilters, page, sort, order } = payload;
  if (!(req.session as any).allPhotos) {
    const oAuth2Client = await getAuthenticatedClient(req);
    (req.session as any).allPhotos = await listAllPhotos(oAuth2Client, ws);
  }
  const { allPhotos } = req.session as any;

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id as string);
  const downloadedFiles = new Set(driveFiles.map((f: any) => f.name));
  const driveFileLinks = new Map(
    driveFiles.map((f: any) => [f.name, f.webViewLink]),
  );

  const totalPhotosCount = allPhotos.length;
  const downloadedCount = allPhotos.filter((photo: Photo) =>
    downloadedFiles.has(`${photo.photoId.id}.jpg`),
  ).length;
  const notDownloadedCount = totalPhotosCount - downloadedCount;

  const searchedPhotos = allPhotos.filter((photo: Photo) => {
    if (!search) return true;
    const lowerCaseSearch = search.toLowerCase();
    if (photo.photoId.id.toLowerCase().includes(lowerCaseSearch)) {
      return true;
    }
    if (photo.places && photo.places.length > 0 && photo.places[0].name) {
      return photo.places[0].name.toLowerCase().includes(lowerCaseSearch);
    }
    return false;
  });

  const statusFilteredPhotos = searchedPhotos.filter((photo: Photo) => {
    if (status === "all") return true;
    const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
    return status === "downloaded" ? isDownloaded : !isDownloaded;
  });

  const poseFilteredPhotos = statusFilteredPhotos.filter((photo: Photo) => {
    if (!poseFilters || poseFilters.length === 0) return true;
    return poseFilters.every((filter: Filter) => {
      if (filter.value === "any") return true;
      const exists =
        filter.property === "latLngPair"
          ? photo.pose && photo.pose.latLngPair !== undefined
          : filter.property === "place"
            ? photo.places && photo.places.length > 0
            : photo.pose &&
              typeof (photo.pose as any)[filter.property] === "number";
      return filter.value === "exists" ? exists : !exists;
    });
  });

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

  const photos = sortedPhotos;
  const pageSize = 50;
  const totalPages = Math.ceil(photos.length / pageSize);
  const currentPage = page || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedPhotos = photos.slice(startIndex, endIndex);

  const photoListHtml = buildPhotoListHtml(
    paginatedPhotos,
    downloadedFiles,
    driveFileLinks,
  );
  const paginationHtmlTop = buildPaginationHtml(
    totalPages,
    currentPage,
    "changePage",
    "top",
  );
  const paginationHtmlBottom = buildPaginationHtml(
    totalPages,
    currentPage,
    "changePage",
    "bottom",
  );
  const poseCounts = calculatePoseCounts(allPhotos);

  ws.send(
    JSON.stringify({
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
    }),
  );
}
