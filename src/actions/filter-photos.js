/**
 * @property {function} getAuthenticatedClient - Function to get an authenticated OAuth2 client.
 */
const { getAuthenticatedClient } = require("../oauth");
/**
 * @property {function} getDriveClient - Function to get the Google Drive API client.
 * @property {function} listFiles - Function to list all files in a folder.
 * @property {function} findOrCreateFolder - Function to find or create a folder in Google Drive.
 * @property {string} FOLDER_NAME - The name of the folder in Google Drive where the photos will be stored.
 */
const {
  getDriveClient,
  listFiles,
  findOrCreateFolder,
  FOLDER_NAME,
} = require("../drive-manager");
/**
 * @property {function} buildPhotoListHtml - Function to build the HTML for the photo list.
 * @property {function} buildPaginationHtml - Function to build the HTML for the pagination controls.
 * @property {function} calculatePoseCounts - Function to calculate the counts of photos with and without specific pose properties.
 */
const {
  buildPhotoListHtml,
  buildPaginationHtml,
  calculatePoseCounts,
} = require("../utils/photo-utils");
/**
 * @property {function} listAllPhotos - Function to list all photos for the authenticated user.
 */
const { listAllPhotos } = require("../photo-manager");

/**
 * Filters, sorts, and paginates the list of photos based on the provided criteria.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object for sending progress updates.
 * @param {object} payload - The filtering, sorting, and pagination options.
 * @param {string} payload.search - The search term to filter by.
 * @param {string} payload.status - The download status to filter by ('all', 'downloaded', 'not-downloaded').
 * @param {Array<object>} payload.poseFilters - The pose properties to filter by.
 * @param {number} payload.page - The page number for pagination.
 * @param {string} payload.sort - The property to sort by ('date', 'views').
 * @param {string} payload.order - The sort order ('asc', 'desc').
 */
async function filterPhotos(req, ws, payload) {
  /**
   * The filtering, sorting, and pagination options.
   * @type {object}
   */
  const { search, status, poseFilters, page, sort, order } = payload;
  if (!req.session.allPhotos) {
    /**
     * The authenticated OAuth2 client.
     * @type {import("google-auth-library").OAuth2Client}
     */
    const oAuth2Client = await getAuthenticatedClient(req);
    req.session.allPhotos = await listAllPhotos(oAuth2Client, ws);
  }
  /**
   * The list of all photos for the user.
   * @type {Array<object>}
   */
  const { allPhotos } = req.session;

  /**
   * The authenticated OAuth2 client.
   * @type {import("google-auth-library").OAuth2Client}
   */
  const oAuth2Client = await getAuthenticatedClient(req);
  /**
   * The Google Drive API client.
   * @type {import("googleapis").drive_v3.Drive}
   */
  const drive = await getDriveClient(oAuth2Client);
  /**
   * The folder in Google Drive where the photos are stored.
   * @type {object}
   */
  const folder = await findOrCreateFolder(drive, FOLDER_NAME);
  /**
   * The list of files in the Google Drive folder.
   * @type {Array<object>}
   */
  const driveFiles = await listFiles(drive, folder.id);
  /**
   * A set of the names of the files in the Google Drive folder.
   * @type {Set<string>}
   */
  const downloadedFiles = new Set(driveFiles.map((f) => f.name));
  /**
   * A map of the names of the files in the Google Drive folder to their web view links.
   * @type {Map<string, string>}
   */
  const driveFileLinks = new Map(
    driveFiles.map((f) => [f.name, f.webViewLink]),
  );

  // Calculate unfiltered counts
  /**
   * The total number of photos.
   * @type {number}
   */
  const totalPhotosCount = allPhotos.length;
  /**
   * The number of downloaded photos.
   * @type {number}
   */
  const downloadedCount = allPhotos.filter((photo) =>
    downloadedFiles.has(`${photo.photoId.id}.jpg`),
  ).length;
  /**
   * The number of photos that have not been downloaded.
   * @type {number}
   */
  const notDownloadedCount = totalPhotosCount - downloadedCount;

  // 1. Filter by search term
  /**
   * The list of photos filtered by the search term.
   * @type {Array<object>}
   */
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
  /**
   * The list of photos filtered by download status.
   * @type {Array<object>}
   */
  const statusFilteredPhotos = searchedPhotos.filter((photo) => {
    if (status === "all") return true;
    const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
    return status === "downloaded" ? isDownloaded : !isDownloaded;
  });

  // 3. Filter by pose
  /**
   * The list of photos filtered by pose.
   * @type {Array<object>}
   */
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
  /**
   * The list of photos sorted by the specified criteria.
   * @type {Array<object>}
   */
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
  /**
   * The list of photos to paginate.
   * @type {Array<object>}
   */
  const photos = sortedPhotos;
  /**
   * The number of photos to display per page.
   * @type {number}
   */
  const pageSize = 50;
  /**
   * The total number of pages.
   * @type {number}
   */
  const totalPages = Math.ceil(photos.length / pageSize);
  /**
   * The current page number.
   * @type {number}
   */
  const currentPage = page || 1;
  /**
   * The index of the first photo to display on the current page.
   * @type {number}
   */
  const startIndex = (currentPage - 1) * pageSize;
  /**
   * The index of the last photo to display on the current page.
   * @type {number}
   */
  const endIndex = startIndex + pageSize;
  /**
   * The list of photos to display on the current page.
   * @type {Array<object>}
   */
  const paginatedPhotos = photos.slice(startIndex, endIndex);

  /**
   * The HTML for the photo list.
   * @type {string}
   */
  const photoListHtml = buildPhotoListHtml(
    paginatedPhotos,
    downloadedFiles,
    driveFileLinks,
  );
  /**
   * The HTML for the top pagination controls.
   * @type {string}
   */
  const paginationHtmlTop = buildPaginationHtml(
    totalPages,
    currentPage,
    "changePage",
    "top",
  );
  /**
   * The HTML for the bottom pagination controls.
   * @type {string}
   */
  const paginationHtmlBottom = buildPaginationHtml(
    totalPages,
    currentPage,
    "changePage",
    "bottom",
  );
  /**
   * The counts of photos with and without specific pose properties.
   * @type {object}
   */
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
