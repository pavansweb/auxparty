import { create } from 'zustand';
import type { Track, AudioQuality } from './tracks';

export type Message = {
  id: string;
  user: string;
  text: string;
  time: string;
  system?: boolean;
};

export type RoomUser = {
  id: string;
  name: string;
  avatar: string;
};

export type RoomMode = 'collaborative' | 'dj';

export type Room = {
  roomId: string;
  currentTrack: Track | null;
  isPlaying: boolean;
  seekTime: number;
  lastUpdated: number;
  queue: Track[];
  messages: Message[];
  users: RoomUser[];
  hostId?: string;
  djId?: string;
  mode?: RoomMode;
  skipVotes?: string[];
};

export type State = {
  tracks: Track[];
  current: Track | null;
  playing: boolean;
  position: number;
  duration: number;
  queue: Track[];
  room: Room | null;
  audioQuality: AudioQuality;
  clockOffset: number;
  rtt: number;
  isAutoplayBlocked: boolean;
  ambientColor: string;
  myUserId: string;
  myUserName: string;
  volume: number;

  setTracks: (tracks: Track[]) => void;
  play: (track: Track) => void;
  setPlaying: (playing: boolean) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setRoom: (room: Room) => void;
  addQueue: (track: Track) => void;
  setAudioQuality: (quality: AudioQuality) => void;
  setClockOffset: (offset: number, rtt?: number) => void;
  setIsAutoplayBlocked: (blocked: boolean) => void;
  setAmbientColor: (color: string) => void;
  setUser: (id: string, name: string) => void;
  setVolume: (volume: number) => void;
};

export const useStore = create<State>((set) => ({
  tracks: [],
  current: null,
  playing: false,
  position: 0,
  duration: 0,
  queue: [],
  room: null,
  audioQuality: 'auto',
  clockOffset: 0,
  rtt: 0,
  isAutoplayBlocked: false,
  ambientColor: 'rgba(198, 242, 119, 0.15)',
  myUserId: '',
  myUserName: 'Guest',
  volume: 0.8,

  setTracks: (tracks) => set({ tracks }),
  play: (current) => set({ current, playing: true, position: 0 }),
  setPlaying: (playing) => set({ playing }),
  setPosition: (position) => set({ position }),
  setDuration: (duration) => set({ duration }),

  setRoom: (room) =>
    set((s) => {
      let masterPosition = s.position;
      if (room.currentTrack) {
        if (room.isPlaying) {
          const elapsedSec = (Date.now() + s.clockOffset - room.lastUpdated) / 1000;
          masterPosition = Math.max(0, room.seekTime + Math.max(0, elapsedSec));
        } else {
          masterPosition = Math.max(0, room.seekTime);
        }
      }

      return {
        room,
        current: room.currentTrack || s.current,
        playing: room.currentTrack ? room.isPlaying : s.playing,
        position: masterPosition,
        queue: Array.isArray(room.queue) ? room.queue : s.queue,
      };
    }),

  addQueue: (track) => set((s) => ({ queue: [...s.queue, track] })),
  setAudioQuality: (audioQuality) => set({ audioQuality }),
  setClockOffset: (clockOffset, rtt = 0) => set({ clockOffset, rtt }),
  setIsAutoplayBlocked: (isAutoplayBlocked) => set({ isAutoplayBlocked }),
  setAmbientColor: (ambientColor) => set({ ambientColor }),
  setUser: (myUserId, myUserName) => set({ myUserId, myUserName }),
  setVolume: (volume) => set({ volume }),
}));
