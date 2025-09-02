let state = {
  // Holds the state for a batch (multi-photo) download operation.
  global: {
    // Is a global download currently running?
    inProgress: false,
    // The total number of photos in the current batch operation.
    total: 0,
    // The index of the photo currently being processed in the batch.
    current: 0,
    // A user-friendly message describing the current status.
    message: "",
    // The overall percentage completion for the entire batch.
    totalProgress: 0,
    // Has the batch operation finished successfully?
    complete: false,
    // Was the batch operation cancelled by the user?
    cancelled: false,
    // If an error occurred during the batch operation, this will hold the error message.
    error: null,
    // The current phase of the global operation ('idle', 'downloading', 'uploading').
    status: "idle",
  },
  // A map of photoId to the state of that individual photo's download/upload process.
  individual: {
    // Example structure for a photoId:
    // "photoId123": {
    //   // The download progress (0-100) for this specific photo.
    //   downloadProgress: 0,
    //   // The upload progress (0-100) for this specific photo.
    //   uploadProgress: 0,
    //   // Has the upload to Google Drive started for this photo?
    //   uploadStarted: false,
    //   // Has the processing for this specific photo finished?
    //   complete: false,
    //   // If an error occurred while processing this specific photo, this holds the message.
    //   error: null,
    //   // The URL to the photo on Google Drive after it has been successfully uploaded.
    //   driveLink: null,
    // }
  },
  // Holds the WebSocket connection object for sending updates to the client.
  socket: null,
};

function getState() {
  const { socket, ...rest } = state;
  return rest;
}

function updateState(newState) {
  if (newState.photoId) {
    const { photoId, ...photoState } = newState;
    if (!state.individual[photoId]) {
      state.individual[photoId] = {};
    }
    Object.assign(state.individual[photoId], photoState);

    // Don't send the whole individual state object, just the update for the specific photo
    if (state.socket) {
      state.socket.send(
        JSON.stringify({
          type: "progress",
          payload: { individual: { [photoId]: state.individual[photoId] } },
        }),
      );
    }
  } else {
    // Global progress update
    Object.assign(state.global, newState);
    if (state.socket) {
      state.socket.send(
        JSON.stringify({
          type: "progress",
          payload: { global: state.global },
        }),
      );
    }
  }
}

function setSocket(socket) {
  state.socket = socket;
  if (
    state.socket &&
    (state.global.inProgress || Object.keys(state.individual).length > 0)
  ) {
    state.socket.send(
      JSON.stringify({ type: "progress", payload: getState() }),
    );
  }
}

function resetState() {
  state.global = {
    inProgress: false,
    total: 0,
    current: 0,
    message: "",
    totalProgress: 0,
    complete: false,
    cancelled: false,
    error: null,
    status: "idle",
  };
  state.individual = {};
}

module.exports = {
  getState,
  updateState,
  setSocket,
  resetState,
};
