let ws;

function updateSortIndicators(sort, order) {
  document.querySelectorAll(".sort-link").forEach((link) => {
    const sortBy = link.dataset.sortby;
    // Clear existing arrows
    const arrow = link.querySelector(".sort-arrow");
    if (arrow) {
      arrow.remove();
    }

    if (sortBy === sort) {
      link.classList.add("active");
      link.dataset.order = order;
      const arrowSpan = document.createElement("span");
      arrowSpan.className = "sort-arrow";
      arrowSpan.innerHTML = order === "asc" ? " &uarr;" : " &darr;";
      link.appendChild(arrowSpan);
    } else {
      link.classList.remove("active");
      link.dataset.order = "desc"; // Default for non-active links
    }
  });
}

function getFiltersFromQuery() {
  const params = new URLSearchParams(window.location.search);
  return {
    search: params.get("search") || "",
    status: params.get("status") || "all",
    pose: params.get("pose")?.split(",").filter(Boolean) || [],
    page: parseInt(params.get("page") || "1", 10),
    sort: params.get("sort") || "date",
    order: params.get("order") || "desc",
  };
}

function getCurrentFilters() {
  const search = document.getElementById("search-input").value;
  const status = document
    .querySelector(".status-filter a.active")
    .id.replace("filter-", "");
  const poseFilters = Array.from(
    document.querySelectorAll('.pose-filter-group input[type="checkbox"]'),
  )
    .filter((c) => c.dataset.state !== "any")
    .map((c) => ({ property: c.name, value: c.dataset.state }));
  const page = parseInt(
    new URLSearchParams(window.location.search).get("page") || "1",
    10,
  );
  const sort =
    new URLSearchParams(window.location.search).get("sort") || "date";
  const order =
    new URLSearchParams(window.location.search).get("order") || "desc";
  return { search, status, poseFilters, page, sort, order };
}

function applyFilters(newFilters = {}) {
  const currentFilters = getCurrentFilters();
  const filters = { ...currentFilters, ...newFilters };

  const payload = {
    search: filters.search,
    status: filters.status,
    poseFilters: filters.poseFilters,
    page: filters.page,
    sort: filters.sort,
    order: filters.order,
    location: newFilters.location, // Pass location for scrolling
    isPopState: newFilters.isPopState, // Flag for history handling
  };

  document.getElementById("filter-progress-indicator").classList.add("visible");
  document.querySelector("tbody").classList.add("filtering");

  connectWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "filter-photos", payload }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "filter-photos", payload }));
    };
  }
}

function sortPhotos(sort) {
  const currentOrder =
    new URLSearchParams(window.location.search).get("order") || "desc";
  const currentSort =
    new URLSearchParams(window.location.search).get("sort") || "date";
  let order = "asc";
  if (currentSort === sort) {
    order = currentOrder === "asc" ? "desc" : "asc";
  }
  applyFilters({ sort, order });
}

function changePage(page, location) {
  applyFilters({ page, location });
}

function searchPhotos() {
  applyFilters({
    search: document.getElementById("search-input").value,
    page: 1,
  });
}

function filterPhotos(status) {
  document.querySelector(".status-filter a.active").classList.remove("active");
  document.getElementById(`filter-${status}`).classList.add("active");
  applyFilters({ status, page: 1 });
}

function filterByPose() {
  const poseFilters = Array.from(
    document.querySelectorAll('.pose-filter-group input[type="checkbox"]'),
  )
    .filter((c) => c.dataset.state !== "any")
    .map((c) => ({ property: c.name, value: c.dataset.state }));
  applyFilters({ poseFilters, page: 1 });
}

function clearSearch() {
  document.getElementById("search-input").value = "";
  toggleClearButton();
  searchPhotos();
}

function resetFilters() {
  document.getElementById("search-input").value = "";
  document.querySelector(".status-filter a.active").classList.remove("active");
  document.getElementById("filter-all").classList.add("active");
  document
    .querySelectorAll('.pose-filter-group input[type="checkbox"]')
    .forEach((checkbox) => {
      setCheckboxState(checkbox, "any", true);
    });

  const moreFiltersBtn = document.getElementById("more-filters-btn");
  const poseFiltersContainer = document.getElementById(
    "pose-filters-container",
  );
  moreFiltersBtn.classList.remove("active");
  moreFiltersBtn.textContent = "More filters";
  poseFiltersContainer.style.maxHeight = null;

  applyFilters({
    search: "",
    status: "all",
    poseFilters: [],
    page: 1,
    sort: "date",
    order: "desc",
  });
}

function confirmDownload() {
  if (!isLoggedIn) return;
  const missingPhotosCount = parseInt(
    document.getElementById("not-downloaded-count").textContent,
    10,
  );
  if (missingPhotosCount > 10) {
    if (
      !confirm(
        `You are about to download ${missingPhotosCount} photos. Are you sure you want to proceed?`,
      )
    ) {
      return;
    }
  }
  document.getElementById("download-fieldset").style.display = "block";
  connectWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "download" }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "download" }));
    };
  }
}

function updatePhotoList() {
  if (!isLoggedIn) return;
  const updateBtn = document.getElementById("update-btn");
  updateBtn.disabled = true;
  updateBtn.innerHTML =
    '<div class="spinner spinner-light"></div><span>Starting...</span>';

  connectWebSocket();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "update-photo-list" }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "update-photo-list" }));
    };
  }
}

function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(`ws://${window.location.host}`);
  ws.onopen = () => {
    console.log("WebSocket connection established.");
    ws.send(JSON.stringify({ type: "get-state" }));
  };
  ws.onclose = () => console.log("WebSocket connection closed");
  ws.onerror = (error) => console.error("WebSocket error:", error);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "filter-results") {
      const {
        photoListHtml,
        paginationHtmlTop,
        paginationHtmlBottom,
        poseCounts,
        downloadedCount,
        notDownloadedCount,
        totalPhotosCount,
        startIndex,
        endIndex,
        filteredTotal,
        currentPage,
        totalPages,
        requestPayload,
      } = data.payload;

      // 1. Update DOM
      const updateBtn = document.getElementById("update-btn");
      if (updateBtn && updateBtn.disabled) {
        updateBtn.disabled = false;
        updateBtn.innerHTML =
          totalPhotosCount > 0
            ? "Update the List of Photos"
            : "Check for new photos";
      }

      document
        .getElementById("filter-progress-indicator")
        .classList.remove("visible");
      document.querySelector("tbody").classList.remove("filtering");
      document.querySelector("tbody").innerHTML = photoListHtml;
      document.querySelectorAll(".pagination").forEach((el, i) => {
        el.innerHTML = i === 0 ? paginationHtmlTop : paginationHtmlBottom;
      });
      updatePoseCounts(poseCounts);
      document.getElementById("downloaded-count").textContent = downloadedCount;
      document.getElementById("not-downloaded-count").textContent =
        notDownloadedCount;
      document.getElementById("all-count").textContent = totalPhotosCount;
      if (filteredTotal > 0) {
        document.getElementById("photo-counter").textContent =
          `Showing photos ${startIndex}-${endIndex} (page ${currentPage} of ${totalPages}) out of ${filteredTotal} filtered photos.`;
      } else {
        document.getElementById("photo-counter").textContent =
          "No photos match the current filters.";
      }

      // 2. Update URL and sort UI (if not a popstate event)
      if (!requestPayload.isPopState) {
        const params = new URLSearchParams();
        if (requestPayload.search) params.set("search", requestPayload.search);
        if (requestPayload.status !== "all")
          params.set("status", requestPayload.status);
        const poseQuery = requestPayload.poseFilters
          .map((f) => `${f.property}:${f.value}`)
          .join(",");
        if (poseQuery) params.set("pose", poseQuery);
        if (requestPayload.page > 1) params.set("page", requestPayload.page);
        if (requestPayload.sort && requestPayload.sort !== "date")
          params.set("sort", requestPayload.sort);
        if (requestPayload.order && requestPayload.order !== "desc")
          params.set("order", requestPayload.order);

        const newQueryString = params.toString()
          ? `?${params.toString()}`
          : window.location.pathname;
        if (newQueryString !== `${window.location.search}`) {
          history.pushState(null, "", newQueryString);
        }
      }

      // 3. Update sort indicators
      updateSortIndicators(requestPayload.sort, requestPayload.order);

      // 4. Scroll if needed
      if (requestPayload.location === "bottom") {
        window.scrollTo(0, 0);
      }
      return;
    }

    if (data.type === "update-progress") {
      const { message, count, complete, error } = data.payload;
      const updateBtn = document.getElementById("update-btn");
      if (error) {
        updateBtn.innerHTML = `Error: ${error}`;
        updateBtn.disabled = false;
      } else if (complete) {
        updateBtn.innerHTML = "Update the List of Photos";
        updateBtn.disabled = false;
        location.reload();
      } else {
        updateBtn.innerHTML = `<div class="spinner spinner-light"></div><span>${message}</span>`;
      }
      return;
    }

    // Handle other WebSocket messages (download progress, etc.)
    if (data.type === "progress") {
      const { global, individual } = data.payload;

      if (global) {
        const {
          message,
          totalProgress,
          downloadProgress,
          fileComplete,
          downloadedCount,
          notDownloadedCount,
          complete,
          error,
          status,
          inProgress,
        } = global;

        if (inProgress) {
          document.getElementById("download-fieldset").style.display = "block";
        }
        document.getElementById("cancel-btn").style.display = complete
          ? "none"
          : "block";

        if (message) {
          document.getElementById("progress-text").textContent = message;
        }
        if (totalProgress !== undefined) {
          const progressBar = document.getElementById("total-progress-bar");
          progressBar.style.width = `${totalProgress}%`;
          progressBar.textContent = `${totalProgress}%`;
        }

        const downloadContainer = document.getElementById("download-container");
        const uploadContainer = document.getElementById("upload-container");

        if (status === "downloading") {
          downloadContainer.classList.remove("hidden");
          uploadContainer.classList.add("hidden");
          if (downloadProgress !== undefined) {
            const downloadBar = document.getElementById("download-bar");
            downloadBar.style.width = `${downloadProgress}%`;
            downloadBar.textContent = `${downloadProgress}%`;
          }
        } else if (status === "uploading") {
          downloadContainer.classList.add("hidden");
          uploadContainer.classList.remove("hidden");
        } else if (status === "idle") {
          downloadContainer.classList.add("hidden");
          uploadContainer.classList.add("hidden");
        }

        if (fileComplete) {
          document.getElementById("downloaded-count").textContent =
            downloadedCount;
          document.getElementById("not-downloaded-count").textContent =
            notDownloadedCount;
        }

        if (complete || error) {
          const cancelBtn = document.getElementById("cancel-btn");
          cancelBtn.style.display = "none";
          cancelBtn.disabled = false;
          cancelBtn.innerHTML = "Cancel";

          setTimeout(() => {
            const fieldset = document.getElementById("download-fieldset");
            fieldset.style.maxHeight = fieldset.scrollHeight + "px";
            requestAnimationFrame(() => {
              fieldset.classList.add("collapsing");
            });
            fieldset.addEventListener(
              "transitionend",
              () => {
                fieldset.style.display = "none";
                fieldset.classList.remove("collapsing");
                fieldset.style.maxHeight = null; // Reset for future use
              },
              { once: true },
            );
          }, 2000);
        }
        if (error) {
          document.getElementById("progress-text").textContent =
            `Error: ${error}`;
        }
      }

      if (individual) {
        for (const photoId in individual) {
          const photoState = individual[photoId];
          const {
            downloadProgress,
            uploadProgress,
            uploadStarted,
            complete,
            error,
            driveLink,
          } = photoState;

          const row = document.querySelector(`tr[data-photo-id="${photoId}"]`);
          if (row) {
            const statusCell = row.querySelector(".status-cell");
            const actionsCell = row.querySelector(".actions-cell");
            const progressCell = row.querySelector(".progress-cell");

            if (progressCell.classList.contains("hidden")) {
              statusCell.classList.add("hidden");
              actionsCell.classList.add("hidden");
              progressCell.classList.remove("hidden");
            }

            if (uploadStarted && uploadProgress === undefined) {
              if (!progressCell.querySelector(".spinner")) {
                progressCell.innerHTML =
                  '<div class="spinner" style="margin: 0 auto;"></div><span style="margin-left: 10px;">Uploading...</span>';
              }
            } else {
              let progressBar = progressCell.querySelector(".progress-bar");
              if (!progressBar) {
                progressCell.innerHTML = `
                  <div class="progress-bar-container" style="margin-bottom: 0;">
                    <div class="progress-bar" style="width: 0%;"></div>
                  </div>`;
                progressBar = progressCell.querySelector(".progress-bar");
              }

              if (uploadProgress !== undefined) {
                progressBar.style.width = `${uploadProgress}%`;
                progressBar.textContent = `Uploading: ${uploadProgress}%`;
              } else if (downloadProgress !== undefined) {
                progressBar.style.width = `${downloadProgress}%`;
                progressBar.textContent = `Downloading: ${downloadProgress}%`;
              }
            }

            if (complete || error) {
              progressCell.classList.add("hidden");
              statusCell.classList.remove("hidden");
              actionsCell.classList.remove("hidden");

              if (error) {
                statusCell.innerHTML = `<span class="status error" title="${error}"><span class="status-text">Error</span><span class="status-icon">!</span></span>`;
              } else {
                const statusHtml = `<a href="${driveLink}" target="_blank" class="status downloaded" title="View on Google Drive"><span class="status-text">Downloaded</span><span class="status-icon">✔</span></a>`;
                const actionHtml = `<button data-photo-id="${photoId}" class="button download-single-btn redownload-btn" style="font-size: 12px; padding: 5px 10px;" title="Re-download">
                    <span class="button-text">Re-download</span>
                    <span class="button-icon">↻</span>
                  </button>`;
                statusCell.innerHTML = statusHtml;
                actionsCell.innerHTML = actionHtml;
              }
            }
          }
        }
      }
    }
    // ...
  };
}

function updatePoseCounts(poseCounts) {
  for (const property in poseCounts) {
    const checkbox = document.querySelector(`input[name="${property}"]`);
    if (checkbox) {
      const group = checkbox.closest(".pose-filter-group");
      const countSpan = group.querySelector(".pose-filter-count");
      countSpan.textContent = `(${poseCounts[property].exists})`;
    }
  }
}

function toggleClearButton() {
  const searchInput = document.getElementById("search-input");
  const clearButton = document.getElementById("clear-search-btn");
  clearButton.style.display = searchInput.value ? "block" : "none";
}

function setCheckboxState(checkbox, state, silent = false) {
  checkbox.dataset.state = state;
  if (state === "any") {
    checkbox.checked = false;
    checkbox.indeterminate = false;
  } else if (state === "exists") {
    checkbox.checked = true;
    checkbox.indeterminate = false;
  } else if (state === "missing") {
    checkbox.checked = false;
    checkbox.indeterminate = true;
  }
  const label = checkbox.closest("label");
  const valueSpan = label.querySelector(".pose-filter-value");
  valueSpan.textContent =
    state === "any" ? "Any" : state === "exists" ? "Exists" : "Doesn't Exist";
  if (!silent) {
    filterByPose();
  }
}

function cycleCheckboxState(checkbox, silent = false) {
  const states = ["any", "exists", "missing"];
  const currentState = checkbox.dataset.state;
  const nextStateIndex = (states.indexOf(currentState) + 1) % states.length;
  setCheckboxState(checkbox, states[nextStateIndex], silent);
}

function downloadSinglePhoto(photoId) {
  if (!isLoggedIn) return;

  const row = document.querySelector(`tr[data-photo-id="${photoId}"]`);
  const statusCell = row.querySelector(".status-cell");
  const actionsCell = row.querySelector(".actions-cell");
  const progressCell = row.querySelector(".progress-cell");

  statusCell.classList.add("hidden");
  actionsCell.classList.add("hidden");
  progressCell.classList.remove("hidden");

  connectWebSocket();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "download-photo", payload: { photoId } }));
  } else {
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "download-photo", payload: { photoId } }));
    };
  }
}

function cancelDownload() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "cancel-download" }));
    const cancelBtn = document.getElementById("cancel-btn");
    cancelBtn.disabled = true;
    cancelBtn.innerHTML =
      '<div class="spinner spinner-light"></div><span>Cancelling...</span>';
  }
}

document.addEventListener("DOMContentLoaded", () => {
  connectWebSocket();

  window.addEventListener("popstate", (event) => {
    const filters = getFiltersFromQuery();
    document.getElementById("search-input").value = filters.search;
    document
      .querySelector(".status-filter a.active")
      .classList.remove("active");
    document.getElementById(`filter-${filters.status}`).classList.add("active");
    document
      .querySelectorAll('.pose-filter-group input[type="checkbox"]')
      .forEach((checkbox) => {
        const poseFilter = filters.pose.find((p) =>
          p.startsWith(checkbox.name),
        );
        const newState = poseFilter ? poseFilter.split(":")[1] : "any";
        setCheckboxState(checkbox, newState, true);
      });
    applyFilters({ ...filters, isPopState: true });
  });

  const filters = getFiltersFromQuery();
  document.getElementById("search-input").value = filters.search;
  document.querySelector(".status-filter a.active").classList.remove("active");
  document.getElementById(`filter-${filters.status}`).classList.add("active");
  document
    .querySelectorAll('.pose-filter-group input[type="checkbox"]')
    .forEach((checkbox) => {
      const poseFilter = filters.pose.find((p) => p.startsWith(checkbox.name));
      if (poseFilter) {
        const [, value] = poseFilter.split(":");
        setCheckboxState(checkbox, value, true);
      }
    });

  updatePoseCounts(poseCounts);
  updateSortIndicators(filters.sort, filters.order);
  toggleClearButton();

  if (filters.pose.length > 0) {
    const moreFiltersBtn = document.getElementById("more-filters-btn");
    const poseFiltersContainer = document.getElementById(
      "pose-filters-container",
    );
    moreFiltersBtn.classList.add("active");
    moreFiltersBtn.textContent = "Less filters";
    poseFiltersContainer.style.maxHeight =
      poseFiltersContainer.scrollHeight + "px";
  }

  document.body.addEventListener("click", (event) => {
    const sortLink = event.target.closest(".sort-link");
    if (sortLink) {
      event.preventDefault();
      sortPhotos(sortLink.dataset.sortby);
    }

    const downloadBtn = event.target.closest(".download-single-btn");
    if (downloadBtn) {
      event.preventDefault();
      downloadSinglePhoto(downloadBtn.dataset.photoId);
    }

    const pageBtn = event.target.closest(".pagination button[data-page]");
    if (pageBtn) {
      event.preventDefault();
      const page = parseInt(pageBtn.dataset.page, 10);
      const location = pageBtn.closest(".pagination").dataset.location;
      changePage(page, location);
    }
  });

  document
    .getElementById("download-all-btn")
    .addEventListener("click", confirmDownload);
  document
    .getElementById("update-btn")
    .addEventListener("click", updatePhotoList);
  document
    .getElementById("cancel-btn")
    .addEventListener("click", cancelDownload);
  document
    .getElementById("clear-search-btn")
    .addEventListener("click", clearSearch);
  document
    .getElementById("reset-filters-btn")
    .addEventListener("click", resetFilters);

  document.querySelectorAll(".pose-filter-group").forEach((group) => {
    group.addEventListener("click", (event) => {
      if (event.target.tagName !== "INPUT") {
        event.preventDefault();
      }
      const checkbox = group.querySelector('input[type="checkbox"]');
      cycleCheckboxState(checkbox);
    });
  });

  document
    .getElementById("more-filters-btn")
    .addEventListener("click", function () {
      this.classList.toggle("active");
      const content = document.getElementById("pose-filters-container");
      if (content.style.maxHeight) {
        content.style.maxHeight = null;
        this.textContent = "More filters";
      } else {
        content.style.maxHeight = content.scrollHeight + "px";
        this.textContent = "Less filters";
      }
    });
});
