const { getAuthenticatedClient } = require("../oauth");
const {
  getDriveClient,
  listFiles,
  findOrCreateFolder,
  FOLDER_NAME,
} = require("../drive-manager");
const {
  buildPhotoListHtml,
  buildPaginationHtml,
  calculatePoseCounts,
} = require("../utils/photo-utils");
const { listAllPhotos } = require("../photo-manager");

async function filterPhotos(req, ws, payload) {
  const { search, status, poseFilters, page, sort, order } = payload;
  if (!req.session.allPhotos) {
    const oAuth2Client = await getAuthenticatedClient(req);
    req.session.allPhotos = await listAllPhotos(oAuth2Client, ws);
  }
  const { allPhotos } = req.session;

  const oAuth2Client = await getAuthenticatedClient(req);
  const drive = await getDriveClient(oAuth2Client);
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  const driveFiles = await listFiles(drive, folder.id);
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));
  const driveFileLinks = new Map(
    driveFiles.map((f) => [f.name, f.webViewLink]),
  );

  // Calculate unfiltered counts
  const totalPhotosCount = allPhotos.length;
  const downloadedCount = allPhotos.filter((photo) =>
    downloadedFiles.has(`${photo.photoId.id}.jpg`),
  ).length;
  const notDownloadedCount = totalPhotosCount - downloadedCount;

  // 1. Filter by search term
  const searchedPhotos = allPhotos.filter((photo) => {
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

  // 2. Filter by download status
  const statusFilteredPhotos = searchedPhotos.filter((photo) => {
    if (status === "all") return true;
    const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
    return status === "downloaded" ? isDownloaded : !isDownloaded;
  });

  // 3. Filter by pose
  const poseFilteredPhotos = statusFilteredPhotos.filter((photo) => {
    if (!poseFilters || poseFilters.length === 0) return true;
    return poseFilters.every((filter) => {
      if (filter.value === "any") return true;
      const exists =
        filter.property === "latLngPair"
          ? photo.pose && photo.pose.latLngPair !== undefined
          : filter.property === "place"
            ? photo.places && photo.places.length > 0
            : photo.pose && typeof photo.pose[filter.property] === "number";
      return filter.value === "exists" ? exists : !exists;
    });
  });

  // 4. Sort
  const sortedPhotos = poseFilteredPhotos.sort((a, b) => {
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
      return valA - valB;
    } else {
      return valB - valA;
    }
  });

  // 5. Paginate
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

module.exports = { filterPhotos };
