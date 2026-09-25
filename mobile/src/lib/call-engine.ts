import type { CallKind } from './types';

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export type CallPhase = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export interface CallEngine {
  readonly supportsVideo: boolean;
  start(kind: CallKind, iceServers: IceServerConfig[]): Promise<void>;
  accept(kind: CallKind, iceServers: IceServerConfig[]): Promise<void>;
  handleSignal(payload: unknown): Promise<void>;
  setMuted(muted: boolean): void;
  setCameraEnabled(enabled: boolean): void;
  hangup(): void;
  localStream(): unknown;
  remoteStream(): unknown;
  onLocalStream(listener: (stream: unknown) => void): void;
  onRemoteStream(listener: (stream: unknown) => void): void;
  onLocalDescription(listener: (description: unknown) => void): void;
  onIceCandidate(listener: (candidate: unknown) => void): void;
  onConnectionState(listener: (state: string) => void): void;
}

export const CALL_ENGINE_UNAVAILABLE =
  'Calling needs a development build of the app. It is not available in this client.';
