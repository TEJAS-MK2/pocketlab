import { describe, expect, it } from "vitest";
import { starterLab } from "./network";
import {
  EMPTY_MISSION_PROGRESS,
  INVALID_BACKUP_KEY,
  INVALID_MISSION_PROGRESS_KEY,
  MISSION_PROGRESS_KEY,
  STORAGE_KEY,
  readMissionProgress,
  readSavedLab,
  type LocalStorageLike
} from "./persistence";

function memoryStorage(seed: Record<string, string> = {}): LocalStorageLike & { values: Map<string, string> } {
  const values = new Map(Object.entries(seed));
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); }
  };
}

describe("workspace persistence and recovery", () => {
  it("loads the starter lab when no workspace has been saved", () => {
    const result = readSavedLab(memoryStorage());
    expect(result.lab).toEqual(starterLab);
    expect(result.notice).toBe("Starter topology loaded");
  });

  it("restores a saved lab and accepts older version-one data without firewall rules", () => {
    const legacyV1 = { version: 1 as const, devices: starterLab.devices, links: starterLab.links };
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify(legacyV1) });
    const result = readSavedLab(storage);
    expect(result.lab).toEqual(starterLab);
    expect(result.notice).toBe("Saved lab restored from this device");
  });

  it("backs up malformed workspace JSON without overwriting the original", () => {
    const corrupted = "{not-valid-json";
    const storage = memoryStorage({ [STORAGE_KEY]: corrupted });
    const result = readSavedLab(storage);
    expect(result.lab).toEqual(starterLab);
    expect(result.notice).toContain(INVALID_BACKUP_KEY);
    expect(storage.getItem(STORAGE_KEY)).toBe(corrupted);
    expect(storage.getItem(INVALID_BACKUP_KEY)).toBe(corrupted);
  });

  it("backs up structurally invalid workspaces before using the starter lab", () => {
    const invalid = JSON.stringify({ version: 99, devices: [], links: [] });
    const storage = memoryStorage({ [STORAGE_KEY]: invalid });
    expect(readSavedLab(storage).lab).toEqual(starterLab);
    expect(storage.getItem(INVALID_BACKUP_KEY)).toBe(invalid);
  });

  it("does not throw when storage is unavailable", () => {
    const storage: LocalStorageLike = {
      getItem() { throw new Error("storage blocked"); },
      setItem() { throw new Error("storage blocked"); }
    };
    expect(readSavedLab(storage)).toEqual({
      lab: starterLab,
      notice: "Local storage unavailable — starter topology loaded"
    });
  });

  it("reports when corrupt workspace data cannot be backed up", () => {
    const corrupted = "{not-valid-json";
    const storage: LocalStorageLike = {
      getItem(key) { return key === STORAGE_KEY ? corrupted : null; },
      setItem() { throw new Error("quota exceeded"); }
    };
    expect(readSavedLab(storage).notice).toBe("Saved lab was invalid; raw backup could not be written");
  });
});

describe("guided progress persistence and recovery", () => {
  it("returns fresh empty progress when no record exists", () => {
    expect(readMissionProgress(memoryStorage())).toEqual(EMPTY_MISSION_PROGRESS);
  });

  it("loads valid progress and defaults the optional firewall objective for older records", () => {
    const olderProgress = { version: 1, pingDone: true, routeDone: true, subnetDone: false };
    expect(readMissionProgress(memoryStorage({ [MISSION_PROGRESS_KEY]: JSON.stringify(olderProgress) }))).toEqual({
      version: 1, pingDone: true, routeDone: true, subnetDone: false, firewallDone: false, linkFailureDone: false
    });
  });

  it("loads the optional cable-fault objective from saved progress", () => {
    const progress = { version: 1, pingDone: true, routeDone: true, subnetDone: true, firewallDone: true, linkFailureDone: true };
    expect(readMissionProgress(memoryStorage({ [MISSION_PROGRESS_KEY]: JSON.stringify(progress) })).linkFailureDone).toBe(true);
  });

  it("backs up invalid progress separately and returns safe defaults", () => {
    const corrupted = "{not-valid-progress";
    const storage = memoryStorage({ [MISSION_PROGRESS_KEY]: corrupted });
    expect(readMissionProgress(storage)).toEqual(EMPTY_MISSION_PROGRESS);
    expect(storage.getItem(MISSION_PROGRESS_KEY)).toBe(corrupted);
    expect(storage.getItem(INVALID_MISSION_PROGRESS_KEY)).toBe(corrupted);
  });

  it("does not throw if progress recovery cannot write its backup", () => {
    const corrupted = "{not-valid-progress";
    const storage: LocalStorageLike = {
      getItem(key) { return key === MISSION_PROGRESS_KEY ? corrupted : null; },
      setItem() { throw new Error("quota exceeded"); }
    };
    expect(readMissionProgress(storage)).toEqual(EMPTY_MISSION_PROGRESS);
  });
});
