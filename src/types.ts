export interface Photo {
  photoId: {
    id: string;
  };
  shareLink: string;
  places?: { name: string; placeId: string }[];
  pose?: {
    latLngPair: {
      latitude: number;
      longitude: number;
    };
    heading?: number;
    pitch?: number;
    roll?: number;
    altitude?: number;
  };
  captureTime: string;
  viewCount: string;
  downloadUrl: string;
}
