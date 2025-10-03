import { Photo } from "../types";

/**
 * Converts degrees to degrees-minutes-seconds rational format.
 * @param {number} deg - The degree value to convert.
 * @returns {Array<Array<number>>} The DMS rational representation.
 */
export function degToDmsRational(
  deg: number,
): [[number, number], [number, number], [number, number]] {
  const d = Math.floor(deg);
  const minFloat = (deg - d) * 60;
  const m = Math.floor(minFloat);
  const secFloat = (minFloat - m) * 60;
  const s = Math.round(secFloat * 100);
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

/**
 * Calculates the counts of photos with and without specific pose properties.
 * @param {Array<object>} photos - The list of photos to process.
 * @returns {object} An object containing the counts of pose properties.
 */
export function calculatePoseCounts(photos: Photo[]) {
  const poseCounts = {
    heading: { exists: 0, missing: 0 },
    pitch: { exists: 0, missing: 0 },
    roll: { exists: 0, missing: 0 },
    altitude: { exists: 0, missing: 0 },
    latLngPair: { exists: 0, missing: 0 },
    place: { exists: 0, missing: 0 },
  };

  photos.forEach((photo: Photo) => {
    if (photo.pose) {
      if (typeof photo.pose.heading === "number") poseCounts.heading.exists++;
      else poseCounts.heading.missing++;
      if (typeof photo.pose.pitch === "number") poseCounts.pitch.exists++;
      else poseCounts.pitch.missing++;
      if (typeof photo.pose.roll === "number") poseCounts.roll.exists++;
      else poseCounts.roll.missing++;
      if (typeof photo.pose.altitude === "number") poseCounts.altitude.exists++;
      else poseCounts.altitude.missing++;
      if (photo.pose.latLngPair !== undefined) poseCounts.latLngPair.exists++;
      else poseCounts.latLngPair.missing++;
    } else {
      poseCounts.heading.missing++;
      poseCounts.pitch.missing++;
      poseCounts.roll.missing++;
      poseCounts.altitude.missing++;
      poseCounts.latLngPair.missing++;
    }
    if (photo.places && photo.places.length > 0) {
      poseCounts.place.exists++;
    } else {
      poseCounts.place.missing++;
    }
  });

  return poseCounts;
}

/**
 * Builds the HTML for the photo list.
 * @param {Array<object>} photos - The list of photos to display.
 * @param {Set<string>} downloadedFiles - A set of downloaded file names.
 * @param {Map<string, string>} driveFileLinks - A map of file names to their Google Drive links.
 * @returns {string} The HTML string for the photo list.
 */
export function buildPhotoListHtml(
  photos: Photo[],
  downloadedFiles: Set<string>,
  driveFileLinks: Map<string, string>,
): string {
  return photos
    .map((photo: Photo) => {
      const poseParts: string[] = [];
      if (photo.pose) {
        if (typeof photo.pose.heading === "number")
          poseParts.push(
            `<span style="white-space: nowrap;" title="Heading: ${photo.pose.heading.toFixed(2)}°"><strong>H</strong> ${photo.pose.heading.toFixed(2)}</span>`,
          );
        if (typeof photo.pose.pitch === "number")
          poseParts.push(
            `<span style="white-space: nowrap;" title="Pitch: ${photo.pose.pitch.toFixed(2)}°"><strong>P</strong> ${photo.pose.pitch.toFixed(2)}</span>`,
          );
        if (typeof photo.pose.roll === "number")
          poseParts.push(
            `<span style="white-space: nowrap;" title="Roll: ${photo.pose.roll.toFixed(2)}°"><strong>R</strong> ${photo.pose.roll.toFixed(2)}</span>`,
          );
        if (typeof photo.pose.altitude === "number")
          poseParts.push(
            `<span style="white-space: nowrap;" title="Altitude: ${photo.pose.altitude.toFixed(2)}m"><strong>A</strong> ${photo.pose.altitude.toFixed(2)}</span>`,
          );
      }
      const poseString =
        poseParts.length > 0 ? `<br><small>${poseParts.join(" ")}</small>` : "";

      const locationName =
        photo.places && photo.places.length > 0 && photo.places[0].name;
      const placeId =
        photo.places && photo.places.length > 0 && photo.places[0].placeId;
      const lat = photo.pose ? photo.pose.latLngPair.latitude : 0;
      const lon = photo.pose ? photo.pose.latLngPair.longitude : 0;
      const coordinates = `<small><span title="Latitude: ${lat.toFixed(
        4,
      )}, Longitude: ${lon.toFixed(4)}">${lat.toFixed(4)}, ${lon.toFixed(
        4,
      )}</span></small>`;
      const locationHtml = `${coordinates}`;

      const photoIdHtml = locationName
        ? `<a href="https://www.google.com/maps/place/?q=place_id:${placeId}" target="_blank">${locationName}</a><br><small><a href="${
            photo.shareLink
          }" target="_blank">${photo.photoId.id}</a></small>`
        : `<a href="${photo.shareLink}" target="_blank">${photo.photoId.id}</a>`;

      const isDownloaded = downloadedFiles.has(`${photo.photoId.id}.jpg`);
      const driveLink = isDownloaded
        ? driveFileLinks.get(`${photo.photoId.id}.jpg`)
        : null;
      const statusHtml = isDownloaded
        ? `<a href="${driveLink}" target="_blank" class="status downloaded" title="View on Google Drive"><span class="status-text">Downloaded</span><span class="status-icon">&#10004;</span></a>`
        : '<span class="status not-downloaded" title="Not Downloaded"><span class="status-text">Not Downloaded</span><span class="status-icon">&#10006;</span></span>';

      return `
    <tr data-photo-id="${photo.photoId.id}">
      <td>${photoIdHtml}</td>
      <td>${locationHtml}${poseString}</td>
      <td>${new Date(photo.captureTime).toLocaleDateString()}</td>
      <td>${photo.viewCount || 0}</td>
      <td class="status-cell">${statusHtml}</td>
      <td class="actions-cell">
        <button data-photo-id="${
          photo.photoId.id
        }" class="button download-single-btn ${
          isDownloaded ? "redownload-btn" : "download-btn"
        }" style="font-size: 12px; padding: 5px 10px;" title="${
          isDownloaded ? "Re-download" : "Download"
        }">
          <span class="button-text">${
            isDownloaded ? "Re-download" : "Download"
          }</span>
          <span class="button-icon">${
            isDownloaded ? "&#10227;" : "&#11015;"
          }</span>
        </button>
      </td>
      <td class="progress-cell hidden" colspan="2">
        <div class="spinner-container hidden">
          <div class="spinner"></div>
          <span>Uploading...</span>
        </div>
        <div class="progress-bar-container" style="margin-bottom: 0;">
          <div class="progress-bar" style="width: 0%;">Starting...</div>
        </div>
      </td>
    </tr>
  `;
    })
    .join("");
}

/**
 * Builds the HTML for the pagination controls.
 * @param {number} totalPages - The total number of pages.
 * @param {number} currentPage - The current page number.
 * @param {string} action - The JavaScript function to call when a page is clicked.
 * @param {string} location - The location of the pagination controls ('top' or 'bottom').
 * @returns {string} The HTML string for the pagination controls.
 */
export function buildPaginationHtml(
  totalPages: number,
  currentPage: number,
  action: string,
  location: string,
): string {
  let paginationHtml = "";
  if (totalPages > 1) {
    const buildPageClick = (page: number) => {
      return `data-page="${page}"`;
    };

    paginationHtml += `<div class="pagination" data-location="${location}">`;
    if (currentPage > 1) {
      paginationHtml += `<button ${buildPageClick(currentPage - 1)}>Previous</button>`;
    }

    const maxPagesToShow = 7;
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
      startPage = 1;
      endPage = totalPages;
    } else {
      const maxPagesBeforeCurrent = Math.floor(maxPagesToShow / 2);
      const maxPagesAfterCurrent = Math.ceil(maxPagesToShow / 2) - 1;
      if (currentPage <= maxPagesBeforeCurrent) {
        startPage = 1;
        endPage = maxPagesToShow;
      } else if (currentPage + maxPagesAfterCurrent >= totalPages) {
        startPage = totalPages - maxPagesToShow + 1;
        endPage = totalPages;
      } else {
        startPage = currentPage - maxPagesBeforeCurrent;
        endPage = currentPage + maxPagesAfterCurrent;
      }
    }

    if (startPage > 1) {
      paginationHtml += `<button ${buildPageClick(1)}>1</button>`;
      if (startPage > 2) {
        paginationHtml += `<span>...</span>`;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      if (i === currentPage) {
        paginationHtml += `<button disabled>${i}</button>`;
      } else {
        paginationHtml += `<button ${buildPageClick(i)}>${i}</button>`;
      }
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHtml += `<span>...</span>`;
      }
      paginationHtml += `<button ${buildPageClick(totalPages)}>${totalPages}</button>`;
    }

    if (currentPage < totalPages) {
      paginationHtml += `<button ${buildPageClick(currentPage + 1)}>Next</button>`;
    }
    paginationHtml += "</div>";
  }
  return paginationHtml;
}
