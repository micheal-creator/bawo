import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Platform } from 'react-native';
import { api } from '../../lib/api';
import { createCallEngine } from '../../lib/call-engine-impl';
import type { CallEngine } from '../../lib/call-engine';
import { formatDuration, initials } from '../../lib/format';
import { formatDisplay } from '../../lib/phone';
import { useSession } from '../../lib/session';
import { colors, spacing } from '../../lib/theme';
import type { CallKind, CallPeer } from '../../lib/types';

let NativeRTCView: ComponentType<{ streamURL: string; style: object }> | null = null;
if (Platform.OS !== 'web') {
  try {
    NativeRTCView = require('react-native-webrtc').RTCView as ComponentType<{
      streamURL: string;
      style: object;
    }>;
  } catch {
    NativeRTCView = null;
  }
}

type Phase = 'placing' | 'ringing' | 'connected' | 'ended' | 'failed';

export default function CallScreen() {
  const params = useLocalSearchParams<{ peerId?: string; kind?: string; incoming?: string; callId?: string }>();
  const peerId = typeof params.peerId === 'string' ? params.peerId : '';
  const incomingCallId = typeof params.incoming === 'string' ? params.incoming : null;
  const initialKind: CallKind = params.kind === 'video' ? 'video' : 'audio';
  const router = useRouter();
  const { token, socket } = useSession();

  const engineRef = useRef<CallEngine | null>(null);
  const callIdRef = useRef<string | null>(incomingCallId);
  const peerIdRef = useRef<string>(peerId);
  const kindRef = useRef<CallKind>(initialKind);
  const pendingSignalsRef = useRef<unknown[]>([]);

  const [phase, setPhase] = useState<Phase>(incomingCallId ? 'ringing' : 'placing');
  const [peer, setPeer] = useState<CallPeer | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(initialKind === 'video');
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [supportsVideo, setSupportsVideo] = useState(true);
  const [localStream, setLocalStream] = useState<unknown>(null);
  const [remoteStream, setRemoteStream] = useState<unknown>(null);

  const finish = useCallback(
    (delayMs: number) => {
      setPhase('ended');
      setTimeout(() => router.back(), delayMs);
    },
    [router],
  );

  const ensureEngine = useCallback((): CallEngine | null => {
    if (engineRef.current) return engineRef.current;
    try {
      const engine = createCallEngine();
      engineRef.current = engine;
      setSupportsVideo(engine.supportsVideo);
      engine.onLocalStream((stream) => setLocalStream(stream));
      engine.onRemoteStream((stream) => setRemoteStream(stream));
      engine.onConnectionState((state) => {
        if (state === 'connected') setPhase('connected');
        if (state === 'failed') {
          setMessage('Connection failed. Both sides may need a TURN server.');
          finish(2500);
        }
      });
      engine.onLocalDescription((description) => {
        const callId = callIdRef.current;
        if (!callId) return;
        socket?.emit('call:signal', { callId, payload: { description } });
      });
      engine.onIceCandidate((candidate) => {
        const callId = callIdRef.current;
        if (!callId) return;
        socket?.emit('call:signal', { callId, payload: { candidate } });
      });
      return engine;
    } catch {
      setMessage('Calling is not available in this build. Use the Android app or a development build.');
      setPhase('failed');
      return null;
    }
  }, [socket, finish]);

  const beginOutgoing = useCallback(async () => {
    if (!token || !socket || !peerId) return;
    const engine = ensureEngine();
    if (!engine) return;
    try {
      const { iceServers } = await api.calls.config(token);
      const ack = await new Promise<{ ok: boolean; error?: string; call?: { id: string } }>((resolve) => {
        socket.emit('call:start', { calleeId: peerId, kind: kindRef.current }, (result) =>
          resolve(result as { ok: boolean; error?: string; call?: { id: string } }),
        );
      });
      if (!ack.ok || !ack.call) {
        setMessage(ack.error === 'user_busy' ? 'That person is on another call.' : 'Could not place the call.');
        setPhase('failed');
        return;
      }
      callIdRef.current = ack.call.id;
      await engine.start(kindRef.current, iceServers);
      setPhase('ringing');
    } catch {
      setMessage('Could not start the call.');
      setPhase('failed');
    }
  }, [token, socket, peerId, ensureEngine]);

  const acceptIncoming = useCallback(
    async (kind: CallKind, callId: string) => {
      if (!token || !socket) return;
      const engine = ensureEngine();
      if (!engine) return;
      try {
        const { iceServers } = await api.calls.config(token);
        callIdRef.current = callId;
        kindRef.current = kind;
        await engine.accept(kind, iceServers);
        const queued = pendingSignalsRef.current;
        pendingSignalsRef.current = [];
        for (const payload of queued) await engine.handleSignal(payload);
        socket.emit('call:accept', { callId });
        setPhase('connected');
      } catch {
        setMessage('Could not answer the call.');
        setPhase('failed');
      }
    },
    [token, socket, ensureEngine],
  );

  useEffect(() => {
    if (!token || !socket) return;

    const onIncoming = (payload: { call: { id: string; kind: CallKind }; peer: CallPeer }) => {
      if (callIdRef.current) return;
      callIdRef.current = payload.call.id;
      kindRef.current = payload.call.kind;
      peerIdRef.current = payload.peer.id;
      setPeer(payload.peer);
      setPhase('ringing');
    };

    const onAccepted = (payload: { peer: CallPeer }) => {
      setPeer(payload.peer);
      setPhase('connected');
    };

    const onSignal = (payload: { callId: string; payload: unknown }) => {
      const engine = engineRef.current;
      if (!engine) {
        pendingSignalsRef.current.push(payload.payload);
        return;
      }
      void engine.handleSignal(payload.payload);
    };

    const onDeclined = () => {
      setMessage('Call declined.');
      finish(1200);
    };

    const onEnded = () => {
      setMessage('Call ended.');
      finish(1200);
    };

    socket.on('call:accepted', onAccepted);
    socket.on('call:signal', onSignal);
    socket.on('call:declined', onDeclined);
    socket.on('call:ended', onEnded);
    if (!incomingCallId) socket.on('call:incoming', onIncoming);

    if (!incomingCallId) void beginOutgoing();

    return () => {
      socket.off('call:accepted', onAccepted);
      socket.off('call:signal', onSignal);
      socket.off('call:declined', onDeclined);
      socket.off('call:ended', onEnded);
      socket.off('call:incoming', onIncoming);
    };
  }, [token, socket, incomingCallId, beginOutgoing, finish]);

  useEffect(() => {
    if (phase !== 'connected') return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);

  const hangup = () => {
    const callId = callIdRef.current;
    if (callId && socket) {
      if (phase === 'ringing' && incomingCallId) socket.emit('call:decline', { callId });
      else socket.emit('call:end', { callId });
    }
    engineRef.current?.hangup();
    finish(300);
  };

  useEffect(
    () => () => {
      engineRef.current?.hangup();
    },
    [],
  );

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    engineRef.current?.setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraOn;
    setCameraOn(next);
    engineRef.current?.setCameraEnabled(next);
  };

  const remoteUrl = (remoteStream as { toURL?: () => string } | null)?.toURL?.() ?? null;
  const localUrl = (localStream as { toURL?: () => string } | null)?.toURL?.() ?? null;
  const showVideo = kindRef.current === 'video' && phase === 'connected' && Boolean(remoteUrl);

  return (
    <View style={styles.screen}>
      {showVideo && NativeRTCView && remoteUrl ? (
        <NativeRTCView streamURL={remoteUrl} style={styles.remoteVideo} />
      ) : null}
      {Platform.OS === 'web' && showVideo && remoteStream ? (
        <WebVideo stream={remoteStream} style={styles.remoteVideo} />
      ) : null}

      <View style={styles.overlay}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(peer?.displayName ?? 'Call')}</Text>
        </View>
        <Text style={styles.name}>{peer?.displayName ?? 'Connecting…'}</Text>
        {peer ? (
          <Text style={styles.number}>{formatDisplay(peer.phone, peer.nationalPhone)}</Text>
        ) : null}
        <Text style={styles.status}>
          {phase === 'placing'
            ? 'Calling…'
            : phase === 'ringing'
              ? incomingCallId
                ? 'Incoming call'
                : 'Ringing…'
              : phase === 'connected'
                ? formatDuration(elapsed)
                : phase === 'ended'
                  ? 'Call ended'
                  : 'Call failed'}
        </Text>
        {!supportsVideo && kindRef.current === 'video' ? (
          <Text style={styles.warning}>Video is unavailable on this device; audio only.</Text>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}

        {phase === 'ringing' && incomingCallId && !engineRef.current ? (
          <View style={styles.answerRow}>
            <Pressable
              style={[styles.roundButton, styles.accept]}
              onPress={() => {
                const meeting = ensureEngine();
                if (meeting && callIdRef.current) void acceptIncoming(kindRef.current, callIdRef.current);
              }}
            >
              <Text style={styles.roundText}>Answer</Text>
            </Pressable>
            <Pressable style={[styles.roundButton, styles.decline]} onPress={hangup}>
              <Text style={styles.roundText}>Decline</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'placing' && !message ? <ActivityIndicator color={colors.primary} /> : null}

        {phase !== 'ended' && phase !== 'failed' && !(phase === 'ringing' && incomingCallId) ? (
          <View style={styles.controls}>
            <Pressable style={[styles.control, muted && styles.controlOn]} onPress={toggleMute}>
              <Text style={styles.controlText}>{muted ? 'Unmute' : 'Mute'}</Text>
            </Pressable>
            {kindRef.current === 'video' ? (
              <Pressable style={[styles.control, !cameraOn && styles.controlOn]} onPress={toggleCamera}>
                <Text style={styles.controlText}>{cameraOn ? 'Camera off' : 'Camera on'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={[styles.control, styles.hangup]} onPress={hangup}>
              <Text style={styles.controlText}>Hang up</Text>
            </Pressable>
          </View>
        ) : null}

        {phase === 'ended' || phase === 'failed' ? (
          <Pressable style={styles.control} onPress={() => router.back()}>
            <Text style={styles.controlText}>Close</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function WebVideo({ stream, style }: { stream: unknown; style: object }) {
  return (
    <WebVideoInner stream={stream as MediaStream} style={style} />
  );
}

function WebVideoInner({ stream, style }: { stream: MediaStream; style: object }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline style={{ ...style, objectFit: 'cover' }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#06111A' },
  remoteVideo: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primaryDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontSize: 34, fontWeight: '700' },
  name: { color: colors.text, fontSize: 24, fontWeight: '700' },
  number: { color: colors.primary, fontSize: 14 },
  status: { color: colors.textMuted, fontSize: 15 },
  warning: { color: '#F0B429', fontSize: 12, textAlign: 'center' },
  message: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  answerRow: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  roundButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: 28,
    minWidth: 120,
    alignItems: 'center',
  },
  accept: { backgroundColor: colors.primary },
  decline: { backgroundColor: colors.danger },
  roundText: { color: '#06111A', fontSize: 15, fontWeight: '700' },
  controls: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, flexWrap: 'wrap', justifyContent: 'center' },
  control: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 24,
    backgroundColor: colors.surfaceAlt,
  },
  controlOn: { backgroundColor: colors.primary },
  controlText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  hangup: { backgroundColor: colors.danger },
});
