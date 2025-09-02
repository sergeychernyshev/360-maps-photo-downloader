let state = {
  global: {
    inProgress: false,
    total: 0,
    current: 0,
    message: "",
    totalProgress: 0,
    complete: false,
    cancelled: false,
    error: null,
    status: "idle", // idle, downloading, uploading
  },
  individual: {}, // photoId -> { downloadProgress, uploadProgress, uploadStarted, complete, error, driveLink }
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
  };
  state.individual = {};
}

module.exports = {
  getState,
  updateState,
  setSocket,
  resetState,
};
