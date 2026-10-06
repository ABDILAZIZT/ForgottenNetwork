import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Brush,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Compass,
  Expand,
  Flame,
  Hand,
  Heart,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  MapPin,
  MessageCircle,
  MousePointer2,
  Palette,
  PenLine,
  Plus,
  Minus,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Star,
  Sticker,
  Target,
  Trophy,
  Type,
  Undo2,
  UserRound,
  Volume2,
  VolumeX,
  X,
  Eraser,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { PermanentEngine, type Settings } from './CanvasEngine';
import { api, ApiError, fileData, readSaved } from './api';
import { clearArtCache, sticker as drawSticker } from './art';
import { placementCells } from './geometry';
import type {
  Artwork,
  Asset,
  Blocked,
  ChatMessage,
  Identity,
  Notice,
  Peer,
  Placement,
  Profile,
  Stats,
  Tool,
  View,
} from './types';
import { useModal } from '../components/useModal';
import './world.css';
import Expedition from '../components/Expedition';
import { recordExploration } from '../exploration';
import { readDraftMode, saveDraftMode, draftPreferenceKey } from './draftPreference';
import { download } from '../download';
import { PolicyLinks, RULES_SUMMARY, RULES_VERSION } from '../Policies';

const COLORS = [
  '#a78bfa',
  '#22d3ee',
  '#fb7185',
  '#fbbf24',
  '#a3e635',
  '#ffffff',
  '#f472b6',
  '#34d399',
  '#60a5fa',
  '#fb923c',
  '#c4b5fd',
  '#111827',
];
const TOOLS: Array<[Tool, LucideIcon, string, string]> = [
  ['pan', Hand, 'Explore', 'V'],
  ['brush', Brush, 'Brush', 'B'],
  ['pixel', PenLine, 'Pixel pen', 'P'],
  ['rectangle', Square, 'Rectangle', 'R'],
  ['ellipse', Circle, 'Ellipse', 'C'],
  ['line', Minus, 'Line', 'L'],
  ['arrow', ArrowUpRight, 'Arrow', 'A'],
  ['text', Type, 'Text', 'T'],
  ['image', ImagePlus, 'Image / GIF', 'I'],
  ['sticker', Sticker, 'Stickers', 'S'],
  ['stamp', UserRound, 'Avatar stamp', 'M'],
  ['eraser', Eraser, 'Erase my artwork', 'E'],
  ['export', ArrowDownToLine, 'Export area', 'D'],
];
const STICKERS = ['planet', 'heart', 'flower', 'bolt', 'star', 'orbit', 'spark', 'peace'];
const FONTS = ['Space Grotesk', 'Orbitron', 'Inter', 'Fira Code', 'Georgia'];
const count = (n = 0) =>
  new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const assetUrl = (id: string) => '/api/canvas/assets/' + id;
const initialSettings: Settings = {
  tool: 'pan',
  color: '#a78bfa',
  size: 8,
  opacity: 1,
  font: 'Space Grotesk',
  text: 'Hello, forever.',
  sticker: 'planet',
  animated: false,
  mediaWidth: 128,
  mediaRatio: 1,
  draftMode: true,
  enabled: false,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
};
type Session = { token: string; user: Identity };
type Pending = { actor: string; element: Placement };

export default function PermanentWorld() {
  const canvas = useRef<HTMLCanvasElement>(null),
    engine = useRef<PermanentEngine | null>(null),
    socket = useRef<WebSocket | null>(null);
  const [session, setSession] = useState<Session | null>(() => {
    const s = readSaved<Session | null>('fn_canvas_identity', null);
    return typeof s?.token === 'string' &&
      /^[a-f0-9]{64}$/.test(s.token) &&
      typeof s?.user?.id === 'string' &&
      typeof s?.user?.name === 'string' &&
      /^#[a-f0-9]{6}$/i.test(s?.user?.color)
      ? s
      : null;
  });
  const [welcome, setWelcome] = useState(!session),
    [exploring, setExploring] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    ...initialSettings,
    draftMode: readDraftMode(session?.user.id),
    color: session?.user.color || initialSettings.color,
    enabled: Boolean(session),
  });
  const [stats, setStats] = useState<Stats | null>(null),
    [profile, setProfile] = useState<Profile | null>(null),
    [peers, setPeers] = useState<Peer[]>([]);
  const [view, setView] = useState<View>({
    x: -800,
    y: -500,
    width: 1600,
    height: 1000,
    zoom: 0.9,
  });
  const [connected, setConnected] = useState(false),
    [status, setStatus] = useState('Connecting to the world');
  const [toast, setToast] = useState(''),
    [panel, setPanel] = useState<
      'leaderboard' | 'profile' | 'chat' | 'notifications' | 'settings' | null
    >(null);
  const [expanded, setExpanded] = useState(false),
    [options, setOptions] = useState(true),
    [drafts, setDrafts] = useState(0),
    [pendingCount, setPendingCount] = useState(0);
  const [hover, setHover] = useState<{ art: Artwork; x: number; y: number } | null>(null),
    [selected, setSelected] = useState<Artwork | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]),
    [message, setMessage] = useState(''),
    [notifications, setNotifications] = useState<Notice[]>([]);
  const [name, setName] = useState(''),
    [signature, setSignature] = useState(COLORS[0]),
    [avatar, setAvatar] = useState<File | null>(null),
    [joining, setJoining] = useState(false);
  const [sound, setSound] = useState(false),
    [confetti, setConfetti] = useState(false),
    [busy, setBusy] = useState(false);
  const [myArt, setMyArt] = useState<{
    elements: Artwork[];
    removed: { id: string; removedAt: string }[];
  }>({ elements: [], removed: [] });
  const [exportFile, setExportFile] = useState<Blob | null>(null);
  const [recent, setRecent] = useState<string[]>(() =>
    readSaved<string[]>('fn_canvas_colors', []).filter((c) => /^#[a-f0-9]{6}$/i.test(c)),
  );
  const [recovery, setRecovery] = useState(''),
    [unread, setUnread] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null),
    toastTimer = useRef<ReturnType<typeof setTimeout>>(),
    soundContext = useRef<AudioContext | null>(null),
    ambient = useRef<GainNode | null>(null);
  const latest = useRef({ session, settings, profile, sound });
  latest.current = { session, settings, profile, sound };
  const [initialPending] = useState(() =>
    readSaved<Pending[]>('fn_canvas_pending', []).filter((p) => p?.actor && p?.element?.id),
  );
  const queueRef = useRef<Pending[]>(initialPending);
  const refreshAt = useRef(0);
  const processing = useRef(false),
    selectToolRef = useRef<(tool: Tool) => void>(() => undefined),
    uploadRef = useRef<(file: File) => void>(() => undefined),
    ourConnection = useRef(''),
    commitRef = useRef<(e: Placement) => void>(() => undefined),
    removeRef = useRef<(arts: Artwork[]) => void>(() => undefined),
    exportRef = useRef<(v: View) => void>(() => undefined);
  const toastMessage = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4500);
  }, []);
  const welcomeRef = useModal(welcome, () => {
    setWelcome(false);
    setExploring(true);
  });
  const refresh = useCallback(async () => {
    if (Date.now() - refreshAt.current < 1000) return;
    refreshAt.current = Date.now();
    try {
      setStats(await api<Stats>('/stats'));
      const token = latest.current.session?.token;
      if (token) setProfile(await api<Profile>('/me', token));
    } catch (error) {
      toastMessage(error instanceof Error ? error.message : 'World unavailable');
    }
  }, [toastMessage]);
  const play = useCallback((kind: 'stroke' | 'pop' | 'badge') => {
    const ctx = soundContext.current;
    if (!latest.current.sound || !ctx) return;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(
      kind === 'badge' ? 660 : kind === 'pop' ? 440 : 180,
      ctx.currentTime,
    );
    osc.frequency.exponentialRampToValueAtTime(
      kind === 'badge' ? 990 : 100,
      ctx.currentTime + 0.15,
    );
    gain.gain.setValueAtTime(0.035, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.26);
  }, []);
  const saveQueue = useCallback(() => {
    localStorage.setItem('fn_canvas_pending', JSON.stringify(queueRef.current));
    if (engine.current)
      engine.current.pendingList = queueRef.current
        .filter((p) => p.actor === latest.current.session?.user.id)
        .map((p) => p.element);
    setPendingCount(
      queueRef.current.filter((p) => p.actor === latest.current.session?.user.id).length,
    );
  }, []);
  const drain = useCallback(async () => {
    if (processing.current || !latest.current.session) return;
    processing.current = true;
    try {
      let pending: Pending | undefined;
      while (
        (pending = queueRef.current.find((p) => p.actor === latest.current.session?.user.id))
      ) {
        const identity = latest.current.session;
        if (!identity) break;
        setStatus('Saving your mark');
        try {
          const result = await api<{ element: Artwork; blocked: Blocked[]; profile: Profile }>(
            '/elements',
            identity.token,
            pending.element,
          );
          engine.current?.add([result.element], true);
          engine.current?.flash(result.blocked);
          setProfile(result.profile);
          recordExploration(
            result.element.x,
            result.element.y,
            result.element.cells.length * 64,
            'You placed a ' + result.element.type,
            'own:' + result.element.id,
          );
          if (result.profile.elements === 1) {
            setConfetti(true);
            setTimeout(() => setConfetti(false), 3000);
            toastMessage('First Stroke unlocked. Your mark is part of the world.');
            play('badge');
          } else play(result.element.type === 'image' ? 'pop' : 'stroke');
          if (result.blocked.length)
            toastMessage('Your free-space pixels are saved. Occupied cells stayed untouched.');
          queueRef.current = queueRef.current.filter((p) => p.element.id !== pending!.element.id);
          saveQueue();
          setStatus('All marks saved');
          socket.current?.readyState === WebSocket.OPEN &&
            socket.current.send(JSON.stringify({ type: 'draw:commit', data: {} }));
        } catch (error) {
          if (error instanceof ApiError && [400, 403, 409, 410, 422].includes(error.status)) {
            const details = error.details;
            engine.current?.flash((details.blocked || []) as Blocked[]);
            queueRef.current = queueRef.current.filter((p) => p.element.id !== pending!.element.id);
            saveQueue();
            toastMessage(error.message);
            setStatus('Placement blocked · choose free space');
          } else {
            setStatus('Unsent marks kept on this device');
            toastMessage(
              error instanceof Error ? error.message : 'Offline. Your drawing is kept for retry.',
            );
            break;
          }
        }
      }
    } finally {
      processing.current = false;
      void refresh();
    }
  }, [play, refresh, saveQueue, toastMessage]);
  commitRef.current = (element) => {
    const user = latest.current.session?.user;
    if (!user) {
      setWelcome(true);
      return;
    }
    if (readSaved<string | null>('fn_rules:' + user.id, null) !== RULES_VERSION) {
      if (
        !confirm(
          RULES_SUMMARY +
            '\n\nImages are not automatically scanned. Read /community for full rules. Accept these rules before publishing?',
        )
      ) {
        engine.current?.draftList.push(element);
        setDrafts(engine.current?.draftList.length || 0);
        return;
      }
      try {
        localStorage.setItem('fn_rules:' + user.id, JSON.stringify(RULES_VERSION));
      } catch {
        /* Ask again when storage is unavailable. */
      }
      void api('/rules/accept', latest.current.session!.token, {
        version: RULES_VERSION,
        accepted: true,
      }).catch(() => undefined);
    }
    const next = [...queueRef.current, { actor: user.id, element }];
    try {
      localStorage.setItem('fn_canvas_pending', JSON.stringify(next));
      queueRef.current = next;
      saveQueue();
      void drain();
    } catch {
      engine.current?.draftList.push(element);
      setDrafts(engine.current?.draftList.length || 0);
      toastMessage(
        'Device storage is full. Your mark is kept as a draft; publish after freeing space.',
      );
    }
  };
  removeRef.current = async (arts) => {
    const identity = latest.current.session;
    if (!identity || !arts.length) {
      toastMessage('No eligible artwork selected.');
      return;
    }
    if (processing.current || queueRef.current.some((p) => p.actor === identity.user.id)) {
      toastMessage('Wait for pending publications before removing artwork.');
      return;
    }
    if (
      !window.confirm(
        'Remove ' +
          arts.length +
          ' of your published artworks? Entire selected artworks will be hidden and unused cells released. Other artists and your drafts are untouched. History is retained for recovery.',
      )
    )
      return;
    try {
      const result = await api<{ removed: string[] }>('/elements/remove', identity.token, {
        id: crypto.randomUUID(),
        targets: arts.map((art) => ({ id: art.id, version: art.zIndex })),
      });
      engine.current?.remove(result.removed);
      setSelected(null);
      refreshAt.current = 0;
      await refresh();
      toastMessage('Removed ' + result.removed.length + ' artworks.');
    } catch (error) {
      toastMessage((error as Error).message);
    }
  };
  const loadArea = useCallback(async (bounds: View) => {
    let snapshot = 0;
    let next: number | null = 0;
    const all: Artwork[] = [];
    do {
      const params: URLSearchParams = new URLSearchParams({
        x: String(bounds.x),
        y: String(bounds.y),
        width: String(bounds.width),
        height: String(bounds.height),
        after: String(next),
      });
      const result: { elements: Artwork[]; next: number | null; snapshot: number } = await api(
        '/elements?' + params,
      );
      all.push(...result.elements);
      snapshot = result.snapshot;
      next = result.next;
    } while (next !== null);
    engine.current?.reconcile(all, bounds, snapshot);
    return all;
  }, []);
  exportRef.current = async (bounds) => {
    if (bounds.width > 8192 || bounds.height > 8192) {
      toastMessage('Zoom in or select a smaller area to export.');
      return;
    }
    setBusy(true);
    try {
      await loadArea(bounds);
      const blob = await engine.current!.snapshot(bounds);
      setExportFile(blob);
      download(blob, 'forgotten-network-' + Date.now() + '.png');
      toastMessage('Your canvas snapshot is ready.');
    } catch (error) {
      toastMessage(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!canvas.current) return;
    const world = new PermanentEngine(canvas.current, {
      commit: (e) => commitRef.current(e),
      view: setView,
      hover: (art, x, y) => setHover(art ? { art, x, y } : null),
      select: setSelected,
      preview: (element) => {
        if (socket.current?.readyState === WebSocket.OPEN)
          socket.current.send(
            JSON.stringify({ type: element ? 'draw:update' : 'draw:commit', data: { element } }),
          );
      },
      cursor: (point, drawing) => {
        const ws = socket.current;
        if (ws?.readyState === WebSocket.OPEN)
          ws.send(
            JSON.stringify({ type: 'cursor:move', data: { x: point[0], y: point[1], drawing } }),
          );
      },
      drafts: (count) => {
        setDrafts(count);
        const id = latest.current.session?.user.id;
        if (id) {
          try {
            localStorage.setItem(
              'fn_canvas_drafts:' + id,
              JSON.stringify(engine.current?.draftList || []),
            );
          } catch {
            toastMessage('Device storage is full. Keep this tab open to preserve your drafts.');
          }
        }
      },
      export: (v) => exportRef.current(v),
      signIn: () => setWelcome(true),
      eraseArtwork: (art) => removeRef.current([art]),
    });
    engine.current = world;
    const params = new URLSearchParams(location.search);
    const x = Number(params.get('x') || 0),
      y = Number(params.get('y') || 0);
    if (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      Math.abs(x) <= 1000000 &&
      Math.abs(y) <= 1000000
    )
      world.fly(x, y);
    void document.fonts.ready.then(clearArtCache);
    void Promise.all(FONTS.map((font) => document.fonts.load('700 24px "' + font + '"')))
      .then(clearArtCache)
      .catch(() => undefined);
    document.fonts.addEventListener('loadingdone', clearArtCache);
    return () => {
      document.fonts.removeEventListener('loadingdone', clearArtCache);
      world.destroy();
      engine.current = null;
      clearTimeout(toastTimer.current);
    };
  }, [toastMessage]);
  useEffect(() => {
    const restore = (event?: StorageEvent) => {
      if (!event || event.key === null || event.key === draftPreferenceKey(session?.user.id || ''))
        setSettings((s) => ({ ...s, draftMode: readDraftMode(session?.user.id) }));
    };
    restore();
    window.addEventListener('storage', restore);
    return () => window.removeEventListener('storage', restore);
  }, [session?.user.id]);
  useEffect(() => {
    engine.current?.configure({
      ...settings,
      artistId: session?.user.id,
      enabled: Boolean(session),
    });
  }, [settings, session]);
  useEffect(() => {
    const world = engine.current;
    if (!world) return;
    world.tour = welcome && !new URLSearchParams(location.search).has('x');
  }, [welcome]);
  useEffect(() => {
    const world = engine.current;
    if (!world) return;
    world.draftList = session
      ? readSaved<Placement[]>('fn_canvas_drafts:' + session.user.id, []).filter(
          (e) => e?.id && e?.content,
        )
      : [];
    world.pendingList = queueRef.current
      .filter((p) => p.actor === session?.user.id)
      .map((p) => p.element);
    setDrafts(world.draftList.length);
    setPendingCount(world.pendingList.length);
  }, [session?.user.id]);
  useEffect(() => {
    if (!pendingCount) return;
    const retry = setInterval(() => void drain(), 5000);
    return () => clearInterval(retry);
  }, [pendingCount, drain]);
  const areaKey = [
    Math.floor(view.x / 512),
    Math.floor(view.y / 512),
    Math.ceil((view.x + view.width) / 512),
    Math.ceil((view.y + view.height) / 512),
  ].join(',');
  useEffect(() => {
    const [left, top, right, bottom] = areaKey.split(',').map(Number);
    void loadArea({
      x: left * 512,
      y: top * 512,
      width: Math.min(8192, (right - left) * 512),
      height: Math.min(8192, (bottom - top) * 512),
    }).catch(() => setStatus('Could not load this neighborhood · reconnecting'));
    if (socket.current?.readyState === WebSocket.OPEN)
      socket.current.send(
        JSON.stringify({
          type: 'view',
          data: {
            x: left * 512,
            y: top * 512,
            width: Math.min(8192, (right - left) * 512),
            height: Math.min(8192, (bottom - top) * 512),
          },
        }),
      );
  }, [areaKey, loadArea, connected]);
  useEffect(() => {
    if (stats) engine.current && (engine.current.challenge = stats.challenge);
  }, [stats]);
  useEffect(() => {
    let alive = true,
      retry: ReturnType<typeof setTimeout>;
    let ws: WebSocket | null = null;
    const connect = () => {
      ws = new WebSocket(
        (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/canvas/live',
      );
      socket.current = ws;
      ws.onopen = () =>
        ws?.send(JSON.stringify({ type: 'user:join', data: { token: session?.token } }));
      ws.onmessage = (event) => {
        const { type, data } = JSON.parse(event.data);
        if (type === 'safety:refresh') {
          clearArtCache();
          void api<ChatMessage[]>('/chat')
            .then(setChat)
            .catch(() => undefined);
          refreshAt.current = 0;
          void refresh();
        }
        if (type === 'ready') {
          ourConnection.current = data.connectionId;
          setConnected(true);
          setStatus('Live · artists control their own work');
          void refresh();
          void drain();
        }
        if (type === 'element:restore') engine.current?.restore(data);
        if (type === 'elements:remove') {
          engine.current?.remove(data.removed);
          setSelected((prev) => (prev && data.removed.includes(prev.id) ? null : prev));
          refreshAt.current = 0;
          void refresh();
        }
        if (type === 'presence') {
          setPeers(data);
          engine.current?.setPeers(
            (data as Peer[]).filter((p) => p.connectionId !== ourConnection.current),
          );
        }
        if (type === 'cursor:move') {
          engine.current?.peer(data);
          setPeers((prev) =>
            prev.map((p) => (p.connectionId === data.connectionId ? { ...p, ...data } : p)),
          );
        }
        if (type === 'element:place') {
          engine.current?.add([data], true);
          if (data.ownerId !== latest.current.session?.user.id)
            recordExploration(
              data.x,
              data.y,
              0,
              data.ownerName + ' placed a ' + data.type,
              data.id,
            );
          void refresh();
        }
        if (type === 'draw:update' && data.element && engine.current)
          engine.current.remoteDrafts.set(data.connectionId, {
            element: data.element,
            cells: placementCells(data.element),
            seen: performance.now(),
          });
        if (type === 'draw:commit') engine.current?.remoteDrafts.delete(data.connectionId);
        if (type === 'chat:message')
          setChat((prev) => [...prev.filter((m) => m.id !== data.id), data].slice(-60));
        if (type === 'identity:expired') {
          setSession(null);
          localStorage.removeItem('fn_canvas_identity');
          setWelcome(true);
          toastMessage('Restore your identity backup to reconnect with your art.');
        }
        if (type === 'reaction') {
          setSelected((prev) =>
            prev && prev.id === data.elementId ? { ...prev, reactions: data.reactions } : prev,
          );
          if (data.ownerId === latest.current.session?.user.id) {
            setUnread((n) => n + 1);
            toastMessage(data.name + ' reacted to your art.');
          }
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (alive) {
          setStatus('Reconnecting · unsent marks stay on this device');
          retry = setTimeout(connect, 2500);
        }
      };
      ws.onerror = () => undefined;
    };
    connect();
    void api<ChatMessage[]>('/chat')
      .then(setChat)
      .catch(() => undefined);
    const online = () => void drain();
    window.addEventListener('online', online);
    return () => {
      alive = false;
      clearTimeout(retry);
      ws?.close();
      window.removeEventListener('online', online);
    };
  }, [session?.token, drain, refresh, toastMessage]);
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 30000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (selected)
      void api<Artwork>('/elements/' + selected.id)
        .then(setSelected)
        .catch(() => undefined);
  }, [selected?.id]);
  useEffect(() => {
    if (panel === 'profile' && session)
      void api<typeof myArt>('/my-artworks', session.token)
        .then(setMyArt)
        .catch((error) => toastMessage(error.message));
    if (panel === 'notifications' && session) {
      setUnread(0);
      void api<Notice[]>('/notifications', session.token)
        .then(setNotifications)
        .catch((error) => toastMessage(error.message));
    }
  }, [panel, session, toastMessage]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,select,[role="dialog"]') || welcome)
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        engine.current?.undoDraft();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        setPanel(null);
        setSelected(null);
        return;
      }
      if (e.key === '+' || e.key === '=') engine.current?.zoom(1.2);
      else if (e.key === '-') engine.current?.zoom(1 / 1.2);
      if (
        e.target === canvas.current &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        e.preventDefault();
        const current = engine.current;
        if (current)
          current.fly(
            current.camera.x + (e.key === 'ArrowRight' ? 100 : e.key === 'ArrowLeft' ? -100 : 0),
            current.camera.y + (e.key === 'ArrowDown' ? 100 : e.key === 'ArrowUp' ? -100 : 0),
          );
        return;
      }
      const tool = TOOLS.find((t) => t[3].toLowerCase() === e.key.toLowerCase());
      if (tool) {
        e.preventDefault();
        selectToolRef.current(tool[0]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [welcome]);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if ((event.target as HTMLElement).closest('input,textarea,[contenteditable]')) return;
      const file = [...(event.clipboardData?.files || [])].find((file) =>
        file.type.startsWith('image/'),
      );
      if (file) {
        event.preventDefault();
        uploadRef.current(file);
      }
    };
    window.addEventListener('paste', paste);
    return () => window.removeEventListener('paste', paste);
  }, []);
  useEffect(
    () => () => {
      void soundContext.current?.close();
    },
    [],
  );

  const chooseColor = (color: string) => {
    setSettings((s) => ({ ...s, color }));
    setRecent((prev) => {
      const next = [color, ...prev.filter((c) => c !== color)].slice(0, 8);
      localStorage.setItem('fn_canvas_colors', JSON.stringify(next));
      return next;
    });
  };
  const upload = async (
    file: File,
    avatarUpload = false,
    token = session?.token,
  ): Promise<Asset> => {
    if (!token) throw new Error('Choose your identity before uploading.');
    if (file.size > 8 * 1024 * 1024) throw new Error('Choose an image smaller than 8MB.');
    let data: Blob = file;
    if (avatarUpload) {
      const bitmap = await createImageBitmap(file);
      const tile = document.createElement('canvas');
      tile.width = tile.height = 32;
      tile.getContext('2d')!.drawImage(bitmap, 0, 0, 32, 32);
      bitmap.close();
      data = await new Promise<Blob>((resolve, reject) =>
        tile.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Avatar could not be read.'))),
          'image/png',
        ),
      );
    }
    return api<Asset>('/assets', token, { data: await fileData(data) });
  };
  const uploadMedia = async (file?: File) => {
    if (!file) return;
    if (!session) {
      setWelcome(true);
      return;
    }
    setBusy(true);
    try {
      const asset = await upload(file);
      setSettings((s) => ({
        ...s,
        tool: 'image',
        assetId: asset.id,
        animated: asset.mime === 'image/gif',
        mediaWidth: Math.min(256, asset.width, (512 * asset.width) / asset.height),
        mediaRatio: asset.height / asset.width,
      }));
      setOptions(true);
      toastMessage('Image ready to place.');
    } catch (error) {
      toastMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const join = async () => {
    setJoining(true);
    try {
      let result: Session;
      if (recovery.trim()) {
        const user = await api<Profile>('/me', recovery.trim());
        result = { token: recovery.trim(), user };
      } else result = await api<Session>('/identity', null, { name, color: signature });
      localStorage.setItem('fn_canvas_identity', JSON.stringify(result));
      setSession(result);
      if (avatar) {
        try {
          const image = await upload(avatar, true, result.token);
          result.user = await api<Identity>('/avatar', result.token, { assetId: image.id });
          localStorage.setItem('fn_canvas_identity', JSON.stringify(result));
          setSession({ ...result });
        } catch (error) {
          toastMessage('Identity saved. ' + (error as Error).message);
        }
      }
      setSettings((s) => ({ ...s, color: result.user.color, tool: 'brush', enabled: true }));
      setWelcome(false);
      setExploring(false);
      void refresh();
    } catch (error) {
      toastMessage((error as Error).message);
    } finally {
      setJoining(false);
    }
  };
  const selectTool = (tool: Tool) => {
    if (!session && !['pan', 'export'].includes(tool)) {
      setWelcome(true);
      return;
    }
    if (tool === 'image') fileInput.current?.click();
    if (tool === 'stamp') {
      if (!session?.user.avatarId) {
        toastMessage('Add an avatar in your profile first.');
        setPanel('profile');
        return;
      }
      setSettings((s) => ({
        ...s,
        tool,
        assetId: session.user.avatarId,
        mediaRatio: 1,
        animated: false,
      }));
      return;
    }
    setSettings((s) => ({
      ...s,
      tool,
      size: tool === 'text' && s.tool !== 'text' ? 24 : s.size,
      mediaRatio: tool === 'sticker' ? 1 : s.mediaRatio,
    }));
    setOptions(true);
  };
  selectToolRef.current = selectTool;
  uploadRef.current = (file) => void uploadMedia(file);
  const findFree = async () => {
    try {
      const cam = engine.current?.camera;
      const space = await api<{ x: number; y: number }>(
        '/free-space?' +
          new URLSearchParams({
            x: String(cam?.x || 0),
            y: String(cam?.y || 0),
            width: '256',
            height: '192',
          }),
      );
      engine.current?.fly(space.x + 128, space.y + 96, 1.5);
      toastMessage('A fresh patch of the world, ready for your mark.');
    } catch (error) {
      toastMessage((error as Error).message);
    }
  };
  const react = async (kind: 'heart' | 'fire' | 'star') => {
    if (!session) {
      setWelcome(true);
      return;
    }
    if (!selected) return;
    try {
      const r = await api<{ reactions: Artwork['reactions'] }>(
        '/elements/' + selected.id + '/reactions',
        session.token,
        { kind },
      );
      setSelected({ ...selected, reactions: r.reactions });
      play('pop');
    } catch (error) {
      toastMessage((error as Error).message);
    }
  };
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session) {
      setWelcome(true);
      return;
    }
    try {
      await api('/chat', session.token, { body: message });
      setMessage('');
    } catch (error) {
      toastMessage((error as Error).message);
    }
  };
  const toggleSound = () => {
    const enabled = !sound;
    setSound(enabled);
    if (!soundContext.current) {
      const ctx = new AudioContext();
      soundContext.current = ctx;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      ambient.current = gain;
      [110, 164.81].forEach((frequency) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = frequency;
        osc.connect(gain);
        osc.start();
      });
    }
    void soundContext.current.resume();
    ambient.current!.gain.setTargetAtTime(
      enabled ? 0.006 : 0,
      soundContext.current.currentTime,
      0.4,
    );
  };
  const activeTool = TOOLS.find((t) => t[0] === settings.tool)!;
  const ActiveIcon = activeTool[1];
  const watchingX = selected?.x ?? engine.current?.camera.x ?? 0;
  const watchingY = selected?.y ?? engine.current?.camera.y ?? 0;
  const nearby = peers.filter(
    (p) =>
      p.connectionId !== ourConnection.current &&
      (p.view
        ? watchingX + (selected?.width || 0) >= p.view.x &&
          watchingX <= p.view.x + p.view.width &&
          watchingY + (selected?.height || 0) >= p.view.y &&
          watchingY <= p.view.y + p.view.height
        : Math.abs(p.x - watchingX) < 512 && Math.abs(p.y - watchingY) < 512),
  );
  const togglePanel = (next: typeof panel) =>
    setPanel((current) => (current === next ? null : next));
  return (
    <main
      className="pw-world"
      data-reduced-motion={settings.reducedMotion}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void uploadMedia(e.dataTransfer.files[0]);
      }}
    >
      {exportFile && (
        <button
          className="pw-export-download"
          onClick={() => download(exportFile, 'forgotten-network.png')}
        >
          Download prepared PNG
        </button>
      )}
      <canvas
        className="pw-canvas"
        ref={canvas}
        tabIndex={0}
        aria-label="Shared artwork canvas. Arrow keys pan; plus and minus zoom. Use Profile for a keyboard-accessible list of your artwork."
      />
      <Expedition
        x={view.x + view.width / 2}
        y={view.y + view.height / 2}
        hidden={welcome}
        reducedMotion={settings.reducedMotion}
        onDiscover={() => {
          const locations = stats?.density || [];
          const selected = locations[Math.floor(Math.random() * locations.length)];
          if (selected) engine.current?.fly(selected.x * 512 + 256, selected.y * 512 + 256, 1.2);
          else void findFree();
        }}
        onVisit={(x, y) => engine.current?.fly(x, y, 1.5)}
        onDraw={() => selectTool('pixel')}
        onRefresh={() => {
          void refresh();
          void loadArea(view).catch(() => toastMessage('Could not refresh this neighborhood.'));
        }}
      />
      <header className="pw-top">
        <a className="pw-brand" href="/" aria-label="Forgotten Network home">
          <span className="pw-brand-icon">
            <Layers size={23} />
          </span>
          <span>
            FORGOTTEN<span className="pw-brand-sub">THE PERMANENT CANVAS</span>
          </span>
        </a>
        <div className="pw-live">
          <span className={connected ? 'online' : ''} />
          <strong>{peers.length}</strong> here now <i />{' '}
          <span className="pw-drawing-count">{peers.filter((p) => p.drawing).length} drawing</span>
        </div>
        <div className="pw-top-actions">
          <button
            className={panel === 'leaderboard' ? 'active' : ''}
            onClick={() => togglePanel('leaderboard')}
            title="Weekly leaderboard"
          >
            <Trophy size={17} />
            <span>Leaderboard</span>
          </button>
          <button
            className="pw-icon"
            title="Notifications"
            onClick={() => (session ? togglePanel('notifications') : setWelcome(true))}
          >
            <Bell size={18} />
            {unread > 0 && <i className="pw-notification-dot" />}
          </button>
          <button
            className="pw-profile-button"
            aria-label="Open your profile"
            onClick={() => (session ? togglePanel('profile') : setWelcome(true))}
            style={{ '--artist': session?.user.color || '#a78bfa' } as React.CSSProperties}
          >
            {session?.user.avatarId ? (
              <img loading="lazy" src={assetUrl(session.user.avatarId)} alt="" />
            ) : (
              <UserRound size={17} />
            )}
            <span>{session?.user.name || 'Join the canvas'}</span>
          </button>
        </div>
      </header>
      {!welcome && !session && (
        <div className="pw-world-heading">
          <span className="pw-eyebrow">
            <span /> ONE WORLD. EVERYONE'S STORY.
          </span>
          <h1>
            Leave a little
            <br />
            <em>you</em> here.
          </h1>
          <p>
            {count(stats?.artworks)} marks. {count(stats?.artists)} artists. Infinite possibility.
          </p>
        </div>
      )}
      <nav className={'pw-toolbar ' + (expanded ? 'expanded' : '')} aria-label="Canvas tools">
        <button
          className="pw-tool-toggle"
          title={expanded ? 'Collapse toolbar' : 'Expand toolbar'}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
        {TOOLS.map(([tool, Icon, label, key]) => (
          <button
            key={tool}
            title={label + ' [' + key + ']'}
            aria-label={label}
            aria-pressed={settings.tool === tool}
            className={settings.tool === tool ? 'active' : ''}
            onClick={() => selectTool(tool)}
          >
            <Icon size={20} />
            {expanded && (
              <span>
                {label}
                <kbd>{key}</kbd>
              </span>
            )}
          </button>
        ))}
        <span className="pw-tool-divider" />
        <button
          title="Tool settings"
          aria-label="Tool settings"
          onClick={() => setOptions(!options)}
        >
          <Settings2 size={19} />
          {expanded && <span>Tool settings</span>}
        </button>
      </nav>
      {!welcome && options && !['pan', 'export'].includes(settings.tool) && (
        <section
          className={'pw-tool-options ' + (expanded ? 'offset' : '')}
          aria-label="Tool settings panel"
        >
          <div className="pw-section-title">
            <ActiveIcon size={16} />
            <strong>{activeTool[2]}</strong>
            <button
              className="pw-icon"
              title="Close tool settings"
              onClick={() => setOptions(false)}
            >
              <X size={14} />
            </button>
          </div>
          {settings.tool === 'eraser' ? (
            <p className="pw-muted">
              Erase drafts by dragging. Click your published artwork to remove the whole artwork
              after confirmation. Other artists are protected.
            </p>
          ) : (
            <>
              {['brush', 'pixel', 'line', 'arrow', 'text'].includes(settings.tool) && (
                <label>
                  Size <b>{settings.tool === 'pixel' ? 1 : settings.size}px</b>
                  <input
                    aria-label="Brush size"
                    type="range"
                    min={1}
                    max={64}
                    disabled={settings.tool === 'pixel'}
                    value={settings.tool === 'pixel' ? 1 : settings.size}
                    onChange={(e) => setSettings((s) => ({ ...s, size: Number(e.target.value) }))}
                  />
                </label>
              )}
              <label>
                Opacity <b>{Math.round(settings.opacity * 100)}%</b>
                <input
                  aria-label="Opacity"
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={settings.opacity}
                  onChange={(e) => setSettings((s) => ({ ...s, opacity: Number(e.target.value) }))}
                />
              </label>
              {settings.tool === 'text' && (
                <>
                  <textarea
                    aria-label="Canvas text"
                    value={settings.text}
                    maxLength={120}
                    onChange={(e) => setSettings((s) => ({ ...s, text: e.target.value }))}
                  />
                  <select
                    aria-label="Text font"
                    value={settings.font}
                    onChange={(e) => setSettings((s) => ({ ...s, font: e.target.value }))}
                  >
                    {FONTS.map((font) => (
                      <option key={font}>{font}</option>
                    ))}
                  </select>
                </>
              )}
              {['image', 'stamp', 'sticker'].includes(settings.tool) && (
                <label>
                  Width <b>{settings.mediaWidth}px</b>
                  <input
                    aria-label="Placement width"
                    type="range"
                    min={16}
                    max={Math.min(512, 512 / settings.mediaRatio)}
                    value={settings.mediaWidth}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, mediaWidth: Number(e.target.value) }))
                    }
                  />
                </label>
              )}
              {settings.tool === 'sticker' && (
                <>
                  <div className="pw-sticker-picker">
                    {STICKERS.map((sticker) => (
                      <button
                        key={sticker}
                        aria-label={'Sticker ' + sticker}
                        title={sticker}
                        className={settings.sticker === sticker ? 'active' : ''}
                        onClick={() => setSettings((s) => ({ ...s, sticker }))}
                      >
                        <StickerPreview name={sticker} color={settings.color} />
                      </button>
                    ))}
                  </div>
                  <label className="pw-check">
                    <input
                      type="checkbox"
                      checked={settings.animated}
                      onChange={(e) => setSettings((s) => ({ ...s, animated: e.target.checked }))}
                    />
                    Animate sticker
                  </label>
                </>
              )}
              <div className="pw-color-heading">
                <span>COLOR</span>
                <button
                  title="Use signature color"
                  onClick={() => chooseColor(session?.user.color || COLORS[0])}
                >
                  <span style={{ background: session?.user.color || COLORS[0] }} /> My signature
                </button>
              </div>
              <div className="pw-swatches">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    aria-label={'Color ' + color}
                    title={color}
                    style={{ background: color }}
                    className={settings.color === color ? 'selected' : ''}
                    onClick={() => chooseColor(color)}
                  />
                ))}
              </div>
              <div className="pw-custom-color">
                <input
                  aria-label="Custom color"
                  type="color"
                  value={settings.color}
                  onChange={(e) => chooseColor(e.target.value)}
                />
                <span>{settings.color.toUpperCase()}</span>
                <Palette size={16} />
              </div>
              {!!recent.length && (
                <div className="pw-recent">
                  {recent.map((color) => (
                    <button
                      key={color}
                      title={'Recent ' + color}
                      style={{ background: color }}
                      onClick={() => chooseColor(color)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          <label className="pw-check">
            <input
              type="checkbox"
              checked={settings.draftMode}
              onChange={(e) => {
                if (!session) return;
                try {
                  saveDraftMode(session.user.id, e.target.checked);
                  setSettings((s) => ({ ...s, draftMode: e.target.checked }));
                } catch {
                  setSettings((s) => ({ ...s, draftMode: true }));
                  toastMessage('Could not save your preference. Draft mode remains on.');
                }
              }}
            />
            Draft before publishing
          </label>
          {drafts > 0 && (
            <div className="pw-draft-actions">
              <button title="Undo draft" onClick={() => engine.current?.undoDraft()}>
                <Undo2 size={16} />
              </button>
              <button onClick={() => engine.current?.publishDrafts()}>
                <Check size={16} />
                Publish {drafts} drafts
              </button>
            </div>
          )}
          <div className="pw-permanent-note">
            <Lock size={12} /> Only you can remove your published marks
          </div>
        </section>
      )}
      <div className="pw-bottom">
        <span className="pw-coordinates">
          <MousePointer2 size={13} />
          {Math.round(view.x + view.width / 2)}, {Math.round(view.y + view.height / 2)}
        </span>
        <span className="pw-status">
          <span className={connected ? 'online' : ''} />
          {settings.draftMode ? 'Draft mode · ' : 'Publish mode · '}
          {status}
        </span>
        <span className="pw-current-tool">
          <ActiveIcon size={13} />
          {activeTool[2]}
        </span>
        {pendingCount > 0 && (
          <button onClick={() => void drain()}>Retry {pendingCount} unsent</button>
        )}
        <div className="pw-zoom">
          <button title="Zoom out" onClick={() => engine.current?.zoom(1 / 1.25)}>
            <Minus size={15} />
          </button>
          <span>{Math.round((view.zoom || 1) * 100)}%</span>
          <button title="Zoom in" onClick={() => engine.current?.zoom(1.25)}>
            <Plus size={15} />
          </button>
          <button title="Return to center" onClick={() => engine.current?.fly(0, 0, 0.9)}>
            <Expand size={15} />
          </button>
        </div>
      </div>
      {!welcome && (
        <aside className="pw-discover">
          <div className="pw-permanence">
            <ShieldCheck size={17} />
            <span>
              Your pixels. <strong>Yours forever.</strong>
            </span>
          </div>
          <button className="pw-free-space" onClick={() => void findFree()}>
            <Compass size={17} />
            Find free space
            <ArrowUpRight size={16} />
          </button>
          {stats?.challenge && (
            <button
              className="pw-challenge"
              onClick={() => {
                engine.current!.highlightChallenge = true;
                engine.current?.fly(stats.challenge.x + 96, stats.challenge.y + 96, 2);
              }}
            >
              <Target size={20} />
              <span>
                <small>DAILY CHALLENGE</small>
                <strong>
                  {profile?.challengeDone ? 'Challenge complete' : 'Make a mark in the green zone'}
                </strong>
              </span>
              <b>+100 XP</b>
            </button>
          )}
          {stats?.spotlight && (
            <button
              className="pw-spotlight"
              onClick={() => {
                const e = stats.spotlight!;
                engine.current?.fly(e.x + e.width / 2, e.y + e.height / 2, 1.4);
                setSelected(e);
              }}
            >
              <Star size={17} />
              <span>
                <small>COMMUNITY SPOTLIGHT</small>
                <strong>
                  {stats.spotlight.ownerName}'s {stats.spotlight.type}
                </strong>
              </span>
              <ArrowUpRight size={16} />
            </button>
          )}
        </aside>
      )}
      <div className="pw-corner-tools">
        <button
          title="Jump to my art"
          onClick={() =>
            profile?.last
              ? engine.current?.fly(
                  profile.last.x + profile.last.width / 2,
                  profile.last.y + profile.last.height / 2,
                  1.5,
                )
              : toastMessage('Your first mark will make this your home.')
          }
        >
          <MapPin size={18} />
        </button>
        <button title={sound ? 'Mute sounds' : 'Enable ambient sound'} onClick={toggleSound}>
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button title="Canvas preferences" onClick={() => togglePanel('settings')}>
          <Settings2 size={18} />
        </button>
        <button
          className={panel === 'chat' ? 'active' : ''}
          title="Canvas chat"
          onClick={() => togglePanel('chat')}
        >
          <MessageCircle size={18} />
          <span>Live chat</span>
        </button>
      </div>
      {!welcome && (
        <WorldMap stats={stats} view={view} onJump={(x, y) => engine.current?.fly(x, y)} />
      )}
      {hover && !welcome && !selected && (
        <div
          className="pw-art-hover"
          style={{
            left: Math.min(innerWidth - 230, Math.max(8, hover.x + 18)),
            top: Math.min(innerHeight - 115, hover.y + 20),
            borderColor: hover.art.ownerColor,
          }}
        >
          <span style={{ color: hover.art.ownerColor }}>{hover.art.ownerName}</span>
          <small>Placed {new Date(hover.art.timestamp).toLocaleString()}</small>
          <button onClick={() => setSelected(hover.art)}>
            Inspect artwork <ArrowUpRight size={12} />
          </button>
        </div>
      )}
      {selected && !welcome && (
        <aside className="pw-inspector">
          <div className="pw-section-title">
            <span className="pw-author-dot" style={{ background: selected.ownerColor }} />
            <strong>{selected.ownerName}</strong>
            <button className="pw-icon" title="Close artwork" onClick={() => setSelected(null)}>
              <X size={16} />
            </button>
          </div>
          <span className="pw-eyebrow">A PIECE OF THIS SHARED WORLD</span>
          <h2>
            {selected.type === 'text'
              ? selected.content.text
              : selected.type === 'sticker'
                ? selected.content.sticker + ' / ' + selected.ownerName
                : 'A mark by ' + selected.ownerName}
          </h2>
          <dl>
            <div>
              <dt>Placed</dt>
              <dd>{new Date(selected.timestamp).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Owned area</dt>
              <dd>{count(selected.cells.length * 64)} pixels</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>
                {Math.round(selected.x)}, {Math.round(selected.y)}
              </dd>
            </div>
          </dl>
          {selected.ownerId === session?.user.id && (
            <button className="pw-wide-button" onClick={() => removeRef.current([selected])}>
              Delete this artwork
            </button>
          )}
          <a href={'/safety?type=artwork&id=' + encodeURIComponent(selected.id)}>Report artwork</a>
          <a href={'/safety?type=profile&id=' + encodeURIComponent(selected.ownerId)}>
            Report artist profile
          </a>
          <div className="pw-reactions">
            {(['heart', 'fire', 'star'] as const).map((kind, i) => {
              const Icon = [Heart, Flame, Star][i];
              return (
                <button key={kind} title={'React with ' + kind} onClick={() => void react(kind)}>
                  <Icon size={18} />
                  {selected.reactions?.find((r) => r.kind === kind)?.count || 0}
                </button>
              );
            })}
          </div>
          <p className="pw-muted">
            {nearby.length} {nearby.length === 1 ? 'explorer' : 'explorers'} watching nearby
          </p>
          <button
            className="pw-wide-button"
            onClick={() =>
              void navigator.clipboard
                .writeText(location.origin + '/?x=' + selected.x + '&y=' + selected.y)
                .then(
                  () => toastMessage('Art link copied.'),
                  () => toastMessage('Could not copy the link.'),
                )
            }
          >
            <ArrowUpRight size={16} />
            Share this mark
          </button>
        </aside>
      )}
      {panel && !welcome && (
        <aside className="pw-panel">
          <div className="pw-section-title">
            <strong>
              {panel === 'leaderboard'
                ? 'This week’s artists'
                : panel === 'profile'
                  ? 'Your place in the world'
                  : panel === 'notifications'
                    ? 'Your art, appreciated'
                    : panel === 'settings'
                      ? 'Canvas preferences'
                      : 'The neighborhood'}
            </strong>
            <button className="pw-icon" title="Close panel" onClick={() => setPanel(null)}>
              <X size={18} />
            </button>
          </div>
          {panel === 'leaderboard' && (
            <>
              <p className="pw-muted">Every claimed pixel is a little piece of history.</p>
              <div className="pw-ranking-label">
                <span>ARTIST</span>
                <span>AREA OWNED</span>
              </div>
              {stats?.leaderboard.map((user, i) => (
                <div className="pw-rank" key={user.id}>
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span
                    className="pw-avatar"
                    style={{ background: user.color + '25', color: user.color }}
                  >
                    {user.name[0]}
                  </span>
                  <strong>
                    {user.name}
                    <small>{user.elements} marks</small>
                  </strong>
                  <b>{count(user.pixels)}</b>
                </div>
              ))}
            </>
          )}
          {panel === 'profile' && session && (
            <>
              <div className="pw-profile-hero">
                <span
                  className="pw-avatar large"
                  style={{ color: session.user.color, background: session.user.color + '22' }}
                >
                  {session.user.avatarId ? (
                    <img loading="lazy" src={assetUrl(session.user.avatarId)} alt="Your avatar" />
                  ) : (
                    session.user.name[0]
                  )}
                </span>
                <div>
                  <h2>{session.user.name}</h2>
                  <span style={{ color: session.user.color }}>A permanent part of the network</span>
                </div>
              </div>
              <div className="pw-personal-stats">
                <div>
                  <strong>{count(profile?.pixels)}</strong>
                  <span>pixels owned</span>
                </div>
                <div>
                  <strong>{profile?.elements || 0}</strong>
                  <span>marks placed</span>
                </div>
                <div>
                  <strong>{profile?.daysActive || 1}</strong>
                  <span>days active</span>
                </div>
                <div>
                  <strong>{profile?.xp || 0}</strong>
                  <span>XP earned</span>
                </div>
              </div>
              <div className="pw-streak">
                <Flame size={25} />
                <strong>{profile?.streak || 1} day streak</strong>
                <span>See you tomorrow.</span>
              </div>
              <h3>Your achievements</h3>
              <div className="pw-badges">
                {[
                  'First Stroke',
                  '1000 Pixels',
                  'Image Artist',
                  'Social Butterfly',
                  'Territory King',
                ].map((b) => (
                  <span key={b} className={profile?.badges.includes(b) ? 'earned' : ''}>
                    <ShieldCheck size={16} />
                    {b}
                  </span>
                ))}
              </div>
              <p className="pw-muted">
                Largest connected territory: {count(profile?.largestArea)} pixels.
              </p>
              <label className="pw-wide-button">
                <ImagePlus size={16} />
                Change avatar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const a = await upload(file, true);
                      const user = await api<Identity>('/avatar', session.token, { assetId: a.id });
                      const next = { ...session, user };
                      setSession(next);
                      localStorage.setItem('fn_canvas_identity', JSON.stringify(next));
                    } catch (error) {
                      toastMessage((error as Error).message);
                    }
                  }}
                />
              </label>
              <button
                className="pw-wide-button"
                onClick={() =>
                  download(
                    new Blob([session.token], { type: 'text/plain' }),
                    'forgotten-network-identity-key.txt',
                  )
                }
              >
                <ArrowDownToLine size={16} />
                Back up identity key
              </button>
              <p className="pw-muted">
                Keep your key private. It restores access to your identity on another device.
              </p>
              <a className="pw-classic" href="/?mode=classic">
                Open Classic Studio <ArrowUpRight size={13} />
              </a>
            </>
          )}
          {panel === 'chat' && (
            <>
              <div className="pw-chat-messages">
                {chat.length ? (
                  chat.map((m) => (
                    <article key={m.id}>
                      <div>
                        <strong style={{ color: m.color }}>{m.name}</strong>
                        <time>
                          {new Date(m.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </div>
                      <p>{m.body}</p>
                      <a href={'/safety?type=chat&id=' + encodeURIComponent(m.id)}>
                        Report message
                      </a>
                    </article>
                  ))
                ) : (
                  <div className="pw-empty">
                    <MessageCircle size={32} />
                    <p>
                      A new neighborhood.
                      <br />
                      Start the conversation.
                    </p>
                  </div>
                )}
              </div>
              <form className="pw-chat-compose" onSubmit={sendMessage}>
                <input
                  aria-label="Chat message"
                  placeholder="Say something kind..."
                  value={message}
                  maxLength={280}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <button title="Send message" disabled={!message.trim()}>
                  <Send size={17} />
                </button>
              </form>
            </>
          )}
          {panel === 'notifications' && (
            <>
              {notifications.length ? (
                notifications.map((n, i) => (
                  <button
                    className="pw-notice-row"
                    key={n.timestamp + i}
                    onClick={() => engine.current?.fly(n.x, n.y, 1.5)}
                  >
                    <Heart size={17} />
                    <span>
                      <strong>{n.name}</strong> left a {n.kind} on your art
                      <small>{new Date(n.timestamp).toLocaleString()}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="pw-empty">
                  <Heart size={32} />
                  <p>
                    Your art is out there.
                    <br />
                    Appreciation will find its way here.
                  </p>
                </div>
              )}
            </>
          )}
          {panel === 'profile' && session && (
            <section aria-label="Manage my artwork">
              <h3>Your published artworks</h3>
              {myArt.elements.map((art) => (
                <button
                  key={art.id}
                  className="pw-wide-button"
                  onClick={() => {
                    setSelected(art);
                    setPanel(null);
                    engine.current?.fly(art.x, art.y);
                  }}
                >
                  {art.type} at {art.x}, {art.y}
                </button>
              ))}
              <h3>Recently removed (30-day recovery)</h3>
              {myArt.removed.map((item) => (
                <button
                  key={item.id}
                  className="pw-wide-button"
                  onClick={async () => {
                    if (
                      !window.confirm(
                        'Restore this removed artwork if the space is still available?',
                      )
                    )
                      return;
                    try {
                      const art = await api<Artwork>(
                        '/elements/' + item.id + '/restore',
                        session.token,
                        {},
                      );
                      engine.current?.restore(art);
                      setMyArt(await api<typeof myArt>('/my-artworks', session.token));
                      toastMessage('Artwork restored.');
                    } catch (error) {
                      toastMessage((error as Error).message);
                    }
                  }}
                >
                  Restore {item.id.slice(0, 8)} ({new Date(item.removedAt).toLocaleDateString()})
                </button>
              ))}
            </section>
          )}
          {panel === 'settings' && (
            <>
              <PolicyLinks />
              <p>
                Clear Space removes only your published artworks fully inside the visible area. It
                does not find free space or clear drafts.
              </p>
              <button
                className="pw-wide-button"
                onClick={() => {
                  const arts = [...(engine.current?.elements.values() || [])].filter(
                    (e) =>
                      e.ownerId === session?.user.id &&
                      e.x >= view.x &&
                      e.y >= view.y &&
                      e.x + e.width <= view.x + view.width &&
                      e.y + e.height <= view.y + view.height,
                  );
                  removeRef.current(arts.slice(0, 400));
                }}
              >
                Clear Space: my visible artworks
              </button>
              <button
                className="pw-wide-button"
                onClick={() => {
                  if (
                    !window.confirm(
                      'Clear unpublished drafts on this device? Published artwork is untouched.',
                    )
                  )
                    return;
                  if (engine.current) {
                    engine.current.draftList = [];
                    setDrafts(0);
                  }
                  if (session) localStorage.setItem('fn_canvas_drafts:' + session.user.id, '[]');
                }}
              >
                Clear Drafts on this device
              </button>
              <label className="pw-check">
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(e) => setSettings((s) => ({ ...s, reducedMotion: e.target.checked }))}
                />
                Reduced motion
              </label>
              <label className="pw-check">
                <input type="checkbox" checked={sound} onChange={toggleSound} />
                Ambient audio and drawing sounds
              </label>
              <button className="pw-wide-button" onClick={() => exportRef.current(view)}>
                <ArrowDownToLine size={16} />
                Export visible canvas
              </button>
              <a className="pw-classic" href="/?mode=classic">
                Classic Studio <ArrowUpRight size={13} />
              </a>
            </>
          )}
        </aside>
      )}
      {welcome && (
        <section
          className="pw-welcome"
          role="dialog"
          aria-modal="true"
          aria-label="Join Forgotten Network"
          tabIndex={-1}
          ref={welcomeRef}
        >
          <div className="pw-welcome-content">
            <div className="fn-typewriter">You've found something hidden...</div>
            <div className="pw-eyebrow">
              <span /> A WORLD BUILT BY PEOPLE LIKE YOU
            </div>
            <h1>
              YOUR MARK.
              <br />
              <span>YOUR WORLD.</span>
            </h1>
            <p>
              Some things deserve to stay.
              <br />
              Draw your story. Own your pixels.
              <br />
              Leave a little piece of yourself behind.
            </p>
            <div className="pw-join-form">
              <p>
                Use a nickname. Do not share personal information. Images are not automatically
                checked for safety. <a href="/community">Community Rules</a> ·{' '}
                <a href="/privacy">Privacy</a> · <a href="/safety">Safety & privacy requests</a>
              </p>
              <label>
                Your artist name
                <input
                  aria-label="Artist name"
                  autoComplete="nickname"
                  placeholder="What should the world call you?"
                  maxLength={24}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="pw-identity-row">
                <div>
                  <label>Your signature</label>
                  <div className="pw-signatures">
                    {COLORS.slice(0, 6).map((color) => (
                      <button
                        title={'Signature ' + color}
                        key={color}
                        style={{ background: color }}
                        className={signature === color ? 'selected' : ''}
                        onClick={() => setSignature(color)}
                      />
                    ))}
                  </div>
                </div>
                <label className="pw-avatar-upload" title="Optional avatar">
                  <ImagePlus size={18} />
                  <span>{avatar ? 'Avatar ready' : 'Add avatar'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => setAvatar(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
              <button
                className="pw-primary"
                disabled={joining || (!recovery.trim() && name.trim().length < 2)}
                onClick={() => void join()}
              >
                {joining ? (
                  <Loader2 className="spin" size={20} />
                ) : (
                  <>
                    START DRAWING NOW
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </div>
            <div className="pw-welcome-footer">
              <button onClick={toggleSound}>{sound ? 'Mute ambience' : 'Enable ambience'}</button>
              <button
                onClick={() => {
                  setWelcome(false);
                  setExploring(true);
                }}
              >
                Just exploring <ArrowUpRight size={13} />
              </button>
              <details>
                <summary>Returning artist?</summary>
                <input
                  aria-label="Identity recovery key"
                  placeholder="Paste your private identity key"
                  type="password"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                />
              </details>
            </div>
            <small className="pw-forever-copy">
              <Lock size={12} /> Published artwork is public. You can remove your own work. Your
              identity stays on this device.
            </small>
          </div>
          <div className="pw-welcome-art-label">
            <span className="pw-eyebrow">ALREADY PART OF THE WORLD</span>
            <h2>
              Little marks.
              <br />
              Limitless stories.
            </h2>
            <div className="pw-live-stats">
              <span>
                <strong>{count(stats?.artworks)}</strong>artworks
              </span>
              <span>
                <strong>{count(stats?.artists)}</strong>artists
              </span>
              <span>
                <strong>{count(stats?.pixels)}</strong>pixels claimed
              </span>
            </div>
          </div>
        </section>
      )}
      {exploring && !session && !welcome && (
        <button className="pw-join-floating" onClick={() => setWelcome(true)}>
          <Plus size={17} />
          Make your mark
        </button>
      )}
      {busy && (
        <div className="pw-busy">
          <Loader2 className="spin" size={18} />
          Preparing your artwork
        </div>
      )}
      {confetti && (
        <div className="pw-confetti" aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <i
              key={i}
              style={{
                left: ((i * 37) % 100) + '%',
                background: COLORS[i % COLORS.length],
                animationDelay: (i % 6) * 0.08 + 's',
                transform: 'rotate(' + i * 31 + 'deg)',
              }}
            />
          ))}
        </div>
      )}
      {toast && (
        <div className="pw-toast" role="status">
          <Sparkles size={16} />
          {toast}
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        hidden
        onChange={(e) => {
          void uploadMedia(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </main>
  );
}

function StickerPreview({ name, color }: { name: string; color: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 40, 40);
      drawSticker(ctx, name, 40, 40, color);
    }
  }, [name, color]);
  return <canvas ref={canvas} width={40} height={40} aria-hidden="true" />;
}

function WorldMap({
  stats,
  view,
  onJump,
}: {
  stats: Stats | null;
  view: View;
  onJump: (x: number, y: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    extent = useRef({ minX: -2, minY: -2, span: 4 });
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const cells = stats?.density || [];
    const xs = [-1, 1, ...cells.map((c) => c.x)],
      ys = [-1, 1, ...cells.map((c) => c.y)];
    const minX = Math.min(...xs),
      minY = Math.min(...ys),
      span = Math.max(Math.max(...xs) - minX + 1, Math.max(...ys) - minY + 1);
    extent.current = { minX, minY, span };
    ctx.clearRect(0, 0, 160, 104);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, 160, 104);
    const scale = 96 / span,
      ox = 32,
      oy = 4;
    cells.forEach((c) => {
      ctx.fillStyle = 'rgba(167,139,250,' + Math.min(0.95, 0.2 + c.cells / 1500) + ')';
      ctx.fillRect(
        ox + (c.x - minX) * scale,
        oy + (c.y - minY) * scale,
        Math.max(2, scale - 1),
        Math.max(2, scale - 1),
      );
    });
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      ox + (view.x / 512 - minX) * scale,
      oy + (view.y / 512 - minY) * scale,
      (view.width / 512) * scale,
      (view.height / 512) * scale,
    );
  }, [stats, view]);
  return (
    <div className="pw-minimap">
      <div>
        <Compass size={12} />
        <span>THE NEIGHBORHOOD</span>
      </div>
      <canvas
        ref={canvas}
        width={160}
        height={104}
        aria-label="World density map"
        tabIndex={0}
        role="button"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            const { minX, minY, span } = extent.current;
            onJump((minX + span / 2) * 512, (minY + span / 2) * 512);
          }
        }}
        title="Jump to this neighborhood"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect(),
            { minX, minY, span } = extent.current;
          onJump(
            ((((e.clientX - r.left) / r.width) * 160 - 32) / (96 / span) + minX) * 512,
            ((((e.clientY - r.top) / r.height) * 104 - 4) / (96 / span) + minY) * 512,
          );
        }}
      />
    </div>
  );
}
