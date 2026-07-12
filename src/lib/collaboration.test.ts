import { describe, expect, it } from "vitest";
import { dedupeCollabUsers, type CollabUser } from "./collaboration";

function user(id: string, name: string, slideId: string | null = null): CollabUser {
  return { id, clientId: id, name, color: "#000000", slideId };
}

describe("dedupeCollabUsers", () => {
  it("keeps only the latest presence entry for each collaborator id", () => {
    const users = [
      user("u1", "Filipe", "slide-1"),
      user("u2", "Ana", "slide-1"),
      user("u1", "Filipe", "slide-2"),
    ];

    expect(dedupeCollabUsers(users)).toEqual([
      user("u1", "Filipe", "slide-2"),
      user("u2", "Ana", "slide-1"),
    ]);
  });
});
