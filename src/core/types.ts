export interface HttpLikeResponse {
  status: number;
  body: string;
  headers?: Record<string, string>;
}

export interface HttpLike {
  fetch(url: string, init?: {
    headers?: Record<string, string>;
    method?: string;
    body?: string;
  }): Promise<HttpLikeResponse>;
}

export interface SearchResult {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  channel: string | null;
}

export interface StreamData {
  streamUrl: string;
  duration: number | null;
  title: string | null;
  container: string | null;
  codec: string | null;
}

export interface PlaylistEntry {
  id: string;
  title: string;
  duration: number | null;
  thumbnail: string | null;
  channel: string | null;
}

export interface PlaylistData {
  id: string;
  title: string;
  entries: PlaylistEntry[];
}

