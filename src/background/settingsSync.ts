import { computeImportDiff } from "../core/protectedGate";
import { getSettings, setSettings } from "../core/storage";
import type { Settings } from "../core/types";
import { settingsSchema } from "../core/validation";

const KEY_ENABLED = "jd_sync_enabled";
const KEY_DEVICE = "jd_sync_device_id";
const KEY_PENDING = "jd_sync_pending_revision";
const KEY_META = "jd_settings_sync_meta";
const CHUNK_PREFIX = "jd_settings_sync_";
const CHUNK_LENGTH = 5_000;
const MAX_CHUNKS = 16;
const RETRY_ALARM = "jd-sync-retry";

interface SyncMeta { revision: number; origin: string; chunks: number }
export interface SyncStatus {
  enabled: boolean;
  pending: boolean;
  remoteRevision: number | null;
  remoteSettings: Settings | null;
}

let uploadTimer: ReturnType<typeof setTimeout> | null = null;
let operationChain: Promise<unknown> = Promise.resolve();
let ignoredLocalSettings: string | null = null;

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = operationChain.then(work);
  operationChain = next.catch(() => {});
  return next;
}

export function portableSettings(settings: Settings): Settings {
  return { ...settings, preloadBlocking: false, lockedInSession: undefined };
}

export function mergeSyncedSettings(remote: Settings, current: Settings): Settings {
  return { ...remote, preloadBlocking: current.preloadBlocking,
    lockedInSession: current.lockedInSession };
}

async function deviceId(): Promise<string> {
  const stored = await chrome.storage.local.get(KEY_DEVICE);
  if (typeof stored[KEY_DEVICE] === "string") return stored[KEY_DEVICE] as string;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [KEY_DEVICE]: id });
  return id;
}

async function readMeta(): Promise<SyncMeta | null> {
  const raw = (await chrome.storage.sync.get(KEY_META))[KEY_META] as unknown;
  if (typeof raw !== "object" || raw === null) return null;
  const meta = raw as Partial<SyncMeta>;
  return typeof meta.revision === "number" && Number.isFinite(meta.revision) &&
    typeof meta.origin === "string" && Number.isInteger(meta.chunks) &&
    meta.chunks! >= 1 && meta.chunks! <= MAX_CHUNKS
    ? meta as SyncMeta : null;
}

async function readRemote(): Promise<{ meta: SyncMeta; settings: Settings } | null> {
  const meta = await readMeta();
  if (!meta) return null;
  const keys = Array.from({ length: meta.chunks }, (_, index) => `${CHUNK_PREFIX}${index}`);
  const stored = await chrome.storage.sync.get(keys);
  const parts = keys.map((key) => stored[key]);
  if (parts.some((part) => typeof part !== "string")) throw new Error("Synced settings are incomplete. Try again shortly.");
  const parsed = settingsSchema.safeParse(JSON.parse(decodeURIComponent(parts.join(""))));
  if (!parsed.success) throw new Error("Synced settings are invalid.");
  return { meta, settings: parsed.data as Settings };
}

async function publish(settings: Settings): Promise<void> {
  const encoded = encodeURIComponent(JSON.stringify(portableSettings(settings)));
  const chunks: string[] = [];
  for (let index = 0; index < encoded.length; index += CHUNK_LENGTH) {
    chunks.push(encoded.slice(index, index + CHUNK_LENGTH));
  }
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS) {
    throw new Error("Settings exceed Chrome Sync's size limit. Remove some rules or use a backup file.");
  }
  const previous = await readMeta();
  const items = Object.fromEntries(chunks.map((chunk, index) => [`${CHUNK_PREFIX}${index}`, chunk]));
  await chrome.storage.sync.set(items);
  const meta: SyncMeta = {
    revision: Math.max(Date.now(), (previous?.revision ?? 0) + 1),
    origin: await deviceId(), chunks: chunks.length,
  };
  await chrome.storage.sync.set({ [KEY_META]: meta });
  if (previous && previous.chunks > chunks.length) {
    await chrome.storage.sync.remove(Array.from(
      { length: previous.chunks - chunks.length },
      (_, index) => `${CHUNK_PREFIX}${chunks.length + index}`,
    ));
  }
}

async function enabled(): Promise<boolean> {
  return (await chrome.storage.local.get(KEY_ENABLED))[KEY_ENABLED] === true;
}

async function applyRemote(remote: Settings): Promise<void> {
  const current = await getSettings();
  const merged = mergeSyncedSettings(remote, current);
  ignoredLocalSettings = JSON.stringify(merged);
  await setSettings(merged);
  await chrome.storage.local.remove(KEY_PENDING);
}

async function receiveRemote(): Promise<void> {
  if (!(await enabled())) return;
  const remote = await readRemote();
  if (!remote || remote.meta.origin === await deviceId()) return;
  const current = await getSettings();
  const merged = mergeSyncedSettings(remote.settings, current);
  if (computeImportDiff(current, merged).reducesProtection) {
    await chrome.storage.local.set({ [KEY_PENDING]: remote.meta.revision });
    return;
  }
  await applyRemote(remote.settings);
}

async function uploadLocalChange(): Promise<void> {
  if (!(await enabled())) return;
  const pending = (await chrome.storage.local.get(KEY_PENDING))[KEY_PENDING];
  if (pending !== undefined) return;
  await publish(await getSettings());
}

function queueUpload(): void {
  if (uploadTimer !== null) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    uploadTimer = null;
    void serialize(uploadLocalChange).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("[JustDetox] Settings sync upload failed:", error);
    });
  }, 2_000);
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const [isEnabled, remote, pending] = await Promise.all([
    enabled(), readRemote(), chrome.storage.local.get(KEY_PENDING),
  ]);
  return {
    enabled: isEnabled,
    pending: pending[KEY_PENDING] !== undefined,
    remoteRevision: remote?.meta.revision ?? null,
    remoteSettings: remote?.settings ?? null,
  };
}

export function syncAction(action: "upload" | "download" | "disable", revision?: number | null): Promise<void> {
  return serialize(async () => {
    if (action === "disable") {
      await chrome.storage.local.set({ [KEY_ENABLED]: false });
      await chrome.storage.local.remove(KEY_PENDING);
      return;
    }
    const currentRevision = (await readMeta())?.revision ?? null;
    if (revision !== undefined && currentRevision !== revision) {
      throw new Error("Synced settings changed. Review them again.");
    }
    if (action === "download") {
      const remote = await readRemote();
      if (!remote) throw new Error("No synced settings were found.");
      if (revision !== remote.meta.revision) throw new Error("Synced settings changed. Review them again.");
      await chrome.storage.local.set({ [KEY_ENABLED]: true });
      await applyRemote(remote.settings);
      return;
    }
    await publish(await getSettings());
    await chrome.storage.local.set({ [KEY_ENABLED]: true });
    await chrome.storage.local.remove(KEY_PENDING);
  });
}

export function initSettingsSync(): void {
  const receive = () => {
    void serialize(receiveRemote).catch((error: unknown) => {
      // A remote metadata change can arrive before its chunks. Retry after
      // Chrome has had time to sync the rest of the payload.
      chrome.alarms.create(RETRY_ALARM, { delayInMinutes: 1 });
      // eslint-disable-next-line no-console
      console.error("[JustDetox] Settings sync download will retry:", error);
    });
  };
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.jd_settings) {
      const serialized = JSON.stringify(changes.jd_settings.newValue);
      if (serialized === ignoredLocalSettings) {
        ignoredLocalSettings = null;
      } else {
        queueUpload();
      }
    }
    if (area === "sync" && changes[KEY_META]) {
      receive();
    }
  });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RETRY_ALARM) receive();
  });
  receive();
}
