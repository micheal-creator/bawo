import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from 'react-native-webrtc';
import type { CallKind } from './types';
import type { CallEngine, IceServerConfig } from './call-engine';

interface SignalPayload {
  description?: { type: string; sdp?: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
}

class NativeCallEngine implements CallEngine {
  readonly supportsVideo = true;

  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private pendingCandidates: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null }[] = [];

  private localListener: ((stream: unknown) => void) | null = null;
  private remoteListener: ((stream: unknown) => void) | null = null;
  private descriptionListener: ((description: unknown) => void) | null = null;
  private candidateListener: ((candidate: unknown) => void) | null = null;
  private stateListener: ((state: string) => void) | null = null;

  onLocalStream(listener: (stream: unknown) => void): void {
    this.localListener = listener;
  }

  onRemoteStream(listener: (stream: unknown) => void): void {
    this.remoteListener = listener;
  }

  onLocalDescription(listener: (description: unknown) => void): void {
    this.descriptionListener = listener;
  }

  onIceCandidate(listener: (candidate: unknown) => void): void {
    this.candidateListener = listener;
  }

  onConnectionState(listener: (state: string) => void): void {
    this.stateListener = listener;
  }

  private async prepare(kind: CallKind, iceServers: IceServerConfig[]): Promise<void> {
    const stream = (await mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { facingMode: 'user', frameRate: 30 } : false,
    })) as unknown as MediaStream;
    this.stream = stream;
    this.localListener?.(stream);

    const pc = new RTCPeerConnection({
      iceServers: iceServers as never,
    });
    this.pc = pc;

    for (const track of stream.getTracks()) pc.addTrack(track, stream);

    (pc as unknown as { onicecandidate: (event: { candidate: unknown }) => void }).onicecandidate = (event) => {
      if (event.candidate) this.candidateListener?.(event.candidate);
    };
    (pc as unknown as { ontrack: (event: { streams: MediaStream[] }) => void }).ontrack = (event) => {
      const [incoming] = event.streams;
      if (incoming) {
        this.remote = incoming;
        this.remoteListener?.(incoming);
      }
    };
    (pc as unknown as { onconnectionstatechange: () => void }).onconnectionstatechange = () => {
      this.stateListener?.(String((pc as unknown as { connectionState: string }).connectionState));
    };
  }

  async start(kind: CallKind, iceServers: IceServerConfig[]): Promise<void> {
    await this.prepare(kind, iceServers);
    const pc = this.pc;
    if (!pc) throw new Error('no_peer_connection');
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer);
    this.descriptionListener?.({ type: offer.type, sdp: offer.sdp });
  }

  async accept(kind: CallKind, iceServers: IceServerConfig[]): Promise<void> {
    await this.prepare(kind, iceServers);
    await this.flushCandidates();
  }

  async handleSignal(payload: unknown): Promise<void> {
    const data = (payload ?? {}) as SignalPayload;
    const pc = this.pc;
    if (!pc) return;

    if (data.description) {
      const description = new RTCSessionDescription({
        type: data.description.type as 'offer' | 'answer',
        sdp: data.description.sdp ?? '',
      });
      await pc.setRemoteDescription(description);
      await this.flushCandidates();
      if (data.description.type === 'offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.descriptionListener?.({ type: answer.type, sdp: answer.sdp });
      }
      return;
    }

    if (data.candidate) {
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(data.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch {
        // stale candidate
      }
    }
  }

  private async flushCandidates(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // ignore stale candidates
      }
    }
  }

  setMuted(muted: boolean): void {
    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getAudioTracks()) track.enabled = !muted;
  }

  setCameraEnabled(enabled: boolean): void {
    const stream = this.stream;
    if (!stream) return;
    for (const track of stream.getVideoTracks()) track.enabled = enabled;
  }

  hangup(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    (this.pc as unknown as { close: () => void } | null)?.close();
    this.pc = null;
    this.stream = null;
    this.remote = null;
    this.pendingCandidates = [];
  }

  localStream(): unknown {
    return this.stream;
  }

  remoteStream(): unknown {
    return this.remote;
  }
}

export function createCallEngine(): CallEngine {
  return new NativeCallEngine();
}
