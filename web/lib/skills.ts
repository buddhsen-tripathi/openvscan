import { builtinSkill, isBuiltinSkillId, SKILL_LIMITS } from "@openvscan/core";
import { chunk } from "@openvscan/db";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

/**
 * Server-only skill helpers for other server functions. They live apart from
 * skills-server.ts because the client imports that module's server functions,
 * and a plain export there would pull the database into the client bundle.
 */

/**
 * Validate a repository's skill selection: de-duplicated, in order, at most
 * `perRepo`, each a built-in or one of `userId`'s skills.
 */
export async function validateSkillSelection(
  userId: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length > SKILL_LIMITS.perRepo) {
    throw new Error(`At most ${SKILL_LIMITS.perRepo} skills per repository`);
  }
  const unknownBuiltin = ids.find(
    (id) => isBuiltinSkillId(id) && !builtinSkill(id),
  );
  if (unknownBuiltin)
    throw new Error(`Unknown built-in skill: ${unknownBuiltin}`);
  const userIds = ids.filter((id) => !isBuiltinSkillId(id));
  const owned = new Set<string>();
  for (const part of chunk(userIds, 90)) {
    const rows = await getDb().query.reviewSkill.findMany({
      where: and(
        eq(schema.reviewSkill.userId, userId),
        inArray(schema.reviewSkill.id, part),
      ),
      columns: { id: true },
    });
    for (const r of rows) owned.add(r.id);
  }
  if (userIds.some((id) => !owned.has(id))) {
    throw new Error("A selected skill no longer exists. Reload and try again.");
  }
  return ids;
}

/** Names for a run's skill ids (deleted skills are marked missing). */
export async function describeSkills(userId: string, ids: string[]) {
  const userIds = ids.filter((id) => !isBuiltinSkillId(id));
  const names = new Map<string, string>();
  for (const part of chunk(userIds, 90)) {
    const rows = await getDb().query.reviewSkill.findMany({
      where: and(
        eq(schema.reviewSkill.userId, userId),
        inArray(schema.reviewSkill.id, part),
      ),
      columns: { id: true, name: true },
    });
    for (const r of rows) names.set(r.id, r.name);
  }
  return ids.map((id) => {
    const name = builtinSkill(id)?.name ?? names.get(id);
    return {
      id,
      name: name ?? "Deleted skill",
      builtin: isBuiltinSkillId(id),
      missing: !name,
    };
  });
}
