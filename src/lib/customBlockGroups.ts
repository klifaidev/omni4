import type { BlockGroup, CustomBlock } from "@/lib/customSlide";

export function mergeGroupsFromBlocks(
  existingGroups: BlockGroup[] | undefined,
  blocks: CustomBlock[],
): BlockGroup[] | undefined {
  const grouped = new Map<string, string[]>();
  blocks.forEach((block) => {
    if (!block.groupId) return;
    grouped.set(block.groupId, [...(grouped.get(block.groupId) ?? []), block.id]);
  });
  if (grouped.size === 0) return existingGroups;

  const groups = new Map<string, BlockGroup>();
  (existingGroups ?? []).forEach((group) => {
    groups.set(group.id, { ...group, memberIds: [...group.memberIds] });
  });

  let changed = false;
  grouped.forEach((memberIds, groupId) => {
    const existing = groups.get(groupId);
    if (existing) {
      const merged = Array.from(new Set([...existing.memberIds, ...memberIds]));
      if (merged.length !== existing.memberIds.length) {
        existing.memberIds = merged;
        groups.set(groupId, existing);
        changed = true;
      }
      return;
    }
    if (memberIds.length >= 2) {
      groups.set(groupId, { id: groupId, memberIds: Array.from(new Set(memberIds)) });
      changed = true;
    }
  });

  if (!changed) return existingGroups;
  return Array.from(groups.values());
}
