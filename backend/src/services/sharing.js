"use strict";

// Sharing & delegation. Mirrors the frontend's rules:
//   - each person has one of: none / view / edit / delegate
//   - only ONE delegate at a time; naming a new delegate demotes the old one to "edit"

const config = require("../config");
const { badRequest, notFound } = require("../lib/errors");

function createSharingService(db) {
  const qPeople = db.prepare("SELECT id FROM people ORDER BY rowid");
  const qPersonExists = db.prepare("SELECT 1 FROM people WHERE id = ?");
  const qShares = db.prepare("SELECT grantee_id, permission FROM shares WHERE owner_id = ?");
  const qOne = db.prepare("SELECT permission FROM shares WHERE owner_id = ? AND grantee_id = ?");
  const qDemote = db.prepare(
    "UPDATE shares SET permission = 'edit' WHERE owner_id = ? AND permission = 'delegate' AND grantee_id <> ?"
  );
  const qUpsert = db.prepare(`
    INSERT INTO shares (owner_id, grantee_id, permission) VALUES (?, ?, ?)
    ON CONFLICT (owner_id, grantee_id) DO UPDATE SET permission = excluded.permission
  `);
  const qDelete = db.prepare("DELETE FROM shares WHERE owner_id = ? AND grantee_id = ?");

  /** Same shape the frontend keeps in state: { sharing: {personId: perm}, delegate } */
  function getState(ownerId) {
    const granted = new Map(qShares.all(ownerId).map((r) => [r.grantee_id, r.permission]));
    const sharing = {};
    let delegate = null;
    for (const { id } of qPeople.all()) {
      if (id === ownerId) continue;
      const perm = granted.get(id) || "none";
      sharing[id] = perm;
      if (perm === "delegate") delegate = id;
    }
    return { owner: ownerId, sharing, delegate };
  }

  const setPermission = db.transaction((ownerId, granteeId, permission) => {
    if (!config.permissions.includes(permission)) {
      throw badRequest(`permission must be one of: ${config.permissions.join(", ")}`);
    }
    if (granteeId === ownerId) throw badRequest("You cannot change sharing for your own calendar");
    if (!qPersonExists.get(granteeId)) throw notFound(`No such person: ${granteeId}`);

    if (permission === "delegate") qDemote.run(ownerId, granteeId);
    if (permission === "none") qDelete.run(ownerId, granteeId);
    else qUpsert.run(ownerId, granteeId, permission);
    return getState(ownerId);
  });

  function permissionFor(ownerId, granteeId) {
    return qOne.get(ownerId, granteeId)?.permission || "none";
  }

  /** May `actorId` create/change/delete events on `ownerId`'s calendar? */
  function canEditCalendarOf(ownerId, actorId) {
    if (ownerId === actorId) return true;
    const perm = permissionFor(ownerId, actorId);
    return perm === "edit" || perm === "delegate";
  }

  return { getState, setPermission, permissionFor, canEditCalendarOf };
}

module.exports = { createSharingService };
