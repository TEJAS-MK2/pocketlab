import { type LabSnapshot, starterLab, validateLab } from "./network";

export const STORAGE_KEY = "packetlab.workspace.v1";
export const INVALID_BACKUP_KEY = `${STORAGE_KEY}.invalid-backup`;
export const MISSION_PROGRESS_KEY = "packetlab.mission-progress.v1";
export const INVALID_MISSION_PROGRESS_KEY = `${MISSION_PROGRESS_KEY}.invalid-backup`;

export type MissionProgress = {
  version: 1;
  pingDone: boolean;
  routeDone: boolean;
  subnetDone: boolean;
  firewallDone: boolean;
  linkFailureDone: boolean;
};

export const EMPTY_MISSION_PROGRESS: MissionProgress = {
  version: 1,
  pingDone: false,
  routeDone: false,
  subnetDone: false,
  firewallDone: false,
  linkFailureDone: false
};

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readMissionProgress(storage: LocalStorageLike): MissionProgress {
  let raw: string | null = null;
  try {
    raw = storage.getItem(MISSION_PROGRESS_KEY);
    if (raw === null) return { ...EMPTY_MISSION_PROGRESS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid progress data");
    const candidate = parsed as Partial<MissionProgress>;
    if (candidate.version !== 1 || typeof candidate.pingDone !== "boolean" ||
        typeof candidate.routeDone !== "boolean" || typeof candidate.subnetDone !== "boolean" ||
        (candidate.firewallDone !== undefined && typeof candidate.firewallDone !== "boolean") ||
        (candidate.linkFailureDone !== undefined && typeof candidate.linkFailureDone !== "boolean")) {
      throw new Error("Unsupported progress data");
    }
    return {
      version: 1,
      pingDone: candidate.pingDone,
      routeDone: candidate.routeDone,
      subnetDone: candidate.subnetDone,
      firewallDone: candidate.firewallDone === true,
      linkFailureDone: candidate.linkFailureDone === true
    };
  } catch {
    if (raw !== null) {
      try { storage.setItem(INVALID_MISSION_PROGRESS_KEY, raw); } catch {
        // Keep the valid in-memory empty progress if browser storage is unavailable.
      }
    }
    return { ...EMPTY_MISSION_PROGRESS };
  }
}

export function readSavedLab(storage: LocalStorageLike): { lab: LabSnapshot; notice: string } {
  let raw: string | null = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { lab: starterLab, notice: "Starter topology loaded" };
    return { lab: validateLab(JSON.parse(raw)), notice: "Saved lab restored from this device" };
  } catch {
    let backedUp = false;
    if (raw !== null) {
      try {
        storage.setItem(INVALID_BACKUP_KEY, raw);
        backedUp = true;
      } catch {
        // Preserve the starter lab if storage is unavailable; never overwrite the invalid original here.
      }
    }
    return {
      lab: starterLab,
      notice: raw === null
        ? "Local storage unavailable — starter topology loaded"
        : backedUp
          ? `Saved lab was invalid; raw data backed up under ${INVALID_BACKUP_KEY}`
          : "Saved lab was invalid; raw backup could not be written"
    };
  }
}
