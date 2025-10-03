import { Request } from "express";
import { WebSocket } from "ws";
import { downloadAllPhotos } from "./actions/download-all-photos";
import { downloadSinglePhoto } from "./actions/download-single-photo";
import { cancelDownload } from "./actions/cancel-download";
import { deleteDuplicates } from "./actions/delete-duplicates";
import { updatePhotoList } from "./actions/update-photo-list";
import { filterPhotos } from "./actions/filter-photos";
import { updateState, getState, resetState } from "./download-state";

/**
 * Handles incoming WebSocket messages.
 * @param {object} req - The Express request object, containing the session.
 * @param {object} ws - The WebSocket object.
 * @param {string} message - The incoming message.
 */
export async function handleMessage(
  req: Request,
  ws: WebSocket,
  message: string,
) {
  const data = JSON.parse(message);
  const { type, payload } = data;

  switch (type) {
    case "get-state":
      ws.send(JSON.stringify({ type: "progress", payload: getState() }));
      break;
    case "download":
      resetState();
      const downloadedPhotos = (req.session as any).downloadedPhotos || [];
      const missingPhotos = (req.session as any).missingPhotos || [];
      await downloadAllPhotos(
        req,
        missingPhotos,
        downloadedPhotos.length,
        missingPhotos.length,
      );
      break;
    case "cancel-download":
      cancelDownload();
      break;
    case "delete-duplicates":
      await deleteDuplicates(req, payload.fileIds);
      break;
    case "download-photo":
      const allPhotos = ((req.session as any).downloadedPhotos || []).concat(
        (req.session as any).missingPhotos || [],
      );
      const photo = allPhotos.find(
        (p: any) => p.photoId.id === payload.photoId,
      );
      if (photo) {
        await downloadSinglePhoto(req, photo);
      } else {
        updateState({ error: `Photo with ID ${payload.photoId} not found.` });
      }
      break;
    case "update-photo-list":
      await updatePhotoList(req, ws);
      break;
    case "filter-photos":
      await filterPhotos(req, ws, payload);
      break;
    case "get-all-photos":
      ws.send(
        JSON.stringify({
          type: "all-photos",
          payload: (req.session as any).allPhotos,
        }),
      );
      break;
    default:
      console.log(`Unknown message type: ${type}`);
  }
}
