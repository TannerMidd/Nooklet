export type SonarrEpisode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDate: string | null;
  overview: string | null;
  monitored: boolean;
  hasFile: boolean;
};