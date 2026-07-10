import * as Y from "yjs";
import {
  validatePersistentCollabSnapshot,
  type PersistentCollabSnapshot,
} from "@/lib/persistentCollabSnapshot";

const SNAPSHOT_MAP = "persistentSnapshot";
const SNAPSHOT_VALUE = "value";

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function persistentSnapshotToYDoc(snapshot: PersistentCollabSnapshot): Y.Doc {
  const doc = new Y.Doc();
  const map = doc.getMap(SNAPSHOT_MAP);
  doc.transact(() => {
    map.set(SNAPSHOT_VALUE, cloneJson(snapshot));
  });
  return doc;
}

export function yDocToPersistentSnapshot(doc: Y.Doc): PersistentCollabSnapshot {
  const map = doc.getMap(SNAPSHOT_MAP);
  return validatePersistentCollabSnapshot(cloneJson(map.get(SNAPSHOT_VALUE)));
}

export function encodePersistentSnapshotYjsState(snapshot: PersistentCollabSnapshot): Uint8Array {
  const doc = persistentSnapshotToYDoc(snapshot);
  return Y.encodeStateAsUpdate(doc);
}

export function decodePersistentSnapshotYjsState(update: Uint8Array): PersistentCollabSnapshot {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, update);
  return yDocToPersistentSnapshot(doc);
}
