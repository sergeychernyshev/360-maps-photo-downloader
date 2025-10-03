"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getState = getState;
exports.updateState = updateState;
exports.setSocket = setSocket;
exports.resetState = resetState;
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
    status: "idle",
  },
  individual: {},
  socket: null,
};
/**
 * Gets the current download state.
 * @returns {object} The current download state.
 */
function getState() {
  const { socket, ...rest } = state;
  return rest;
}
/**
 * Updates the download state and sends the update to the client via WebSocket.
 * @param {object} newState - The new state to merge with the existing state.
 */
function updateState(newState) {
  if (newState.photoId) {
    const { photoId, ...photoState } = newState;
    if (!state.individual[photoId]) {
      state.individual[photoId] = {};
    }
    Object.assign(state.individual[photoId], photoState);
    if (state.socket) {
      state.socket.send(
        JSON.stringify({
          type: "progress",
          payload: { individual: { [photoId]: state.individual[photoId] } },
        }),
      );
    }
    if (state.individual[photoId].complete) {
      setTimeout(() => {
        delete state.individual[photoId];
      }, 5000);
    }
  } else {
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
/**
 * Sets the WebSocket connection object.
 * @param {object} socket - The WebSocket connection object.
 */
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
/**
 * Resets the download state to its initial values.
 */
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
//# sourceMappingURL=download-state.js.map
