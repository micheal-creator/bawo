import type { CallKind } from './types';
import type { CallEngine, IceServerConfig } from './call-engine';

interface SignalPayload {
  kind?: string;
  description?: { type: string; sdp?: string };
  candidate?: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null };
}

class WebCallEngine implements CallEngine {
  readonly supportsVideo = true;

  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private remote: MediaStream | null = null;
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private kind: CallKind = 'audio';

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
    this.kind = kind;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: kind === 'video' ? { facingMode: 'user' } : false,
    });
    this.localListener?.(this.stream);

    const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
    this.pc = pc;

    for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);

    pc.onicecandidate = (event) => {
      if (event.candidate) this.candidateListener?.(event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const [incoming] = event.streams;
      if (incoming) {
        this.remote = incoming;
        this.remoteListener?.(incoming);
      }
    };
    pc.onconnectionstatechange = () => this.stateListener?.(pc.connectionState);
  }

  async start(kind: CallKind, iceServers: IceServerConfig[]): Promise<void> {
    await this.prepare(kind, iceServers);
    const pc = this.pc;
    if (!pc) throw new Error('no_peer_connection');
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: kind === 'video' });
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
      const description = data.description as RTCSessionDescriptionInit;
      if (description.type === 'offer') {
        await pc.setRemoteDescription(description);
        await this.flushCandidates();
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.descriptionListener?.({ type: answer.type, sdp: answer.sdp });
        return;
      }
      await pc.setRemoteDescription(description);
      await this.flushCandidates();
      return;
    }

    if (data.candidate) {
      if (!pc.remoteDescription) {
        this.pendingCandidates.push(data.candidate);
        return;
      }
      try {
        await pc.addIceCandidate(data.candidate);
      } catch {
        // a candidate can arrive after the connection has moved on
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
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore stale candidates
      }
    }
  }

  setMuted(muted: boolean): void {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = !muted;
  }

  setCameraEnabled(enabled: boolean): void {
    for (const track of this.stream?.getVideoTracks() ?? []) track.enabled = enabled;
  }

  hangup(): void {
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    for (const track of this.remote?.getTracks() ?? []) track.stop();
    this.pc?.close();
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
  return new WebCallEngine();
}
