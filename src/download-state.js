let state = {
  inProgress: false,
  total: 0,
  current: 0,
  message: "",
  downloadProgress: 0,
  uploadProgress: 0,
  totalProgress: 0,
  complete: false,
  cancelled: false,
  error: null,
  socket: null,
};

function getState() {
  const { socket, ...rest } = state;
  return rest;
}

function updateState(newState) {
  if (newState.photoId) {
    // Single photo progress update
    if (state.socket) {
      state.socket.send(
        JSON.stringify({ type: "progress", payload: newState })
      );
    }
  } else {
    // Global progress update
    Object.assign(state, newState);
    if (state.socket) {
      state.socket.send(
        JSON.stringify({ type: "progress", payload: { ...getState(), ...newState } })
      );
    }
  }
}

function setSocket(socket) {
  state.socket = socket;
  if (state.socket && state.inProgress) {
    state.socket.send(
      JSON.stringify({ type: "progress", payload: getState() })
    );
  }
}

function resetState() {
  state.inProgress = false;
  state.total = 0;
  state.current = 0;
  state.message = "";
  state.downloadProgress = 0;
  state.uploadProgress = 0;
  state.totalProgress = 0;
  state.complete = false;
  state.cancelled = false;
  state.error = null;
}

module.exports = {
  getState,
  updateState,
  setSocket,
  resetState,
};