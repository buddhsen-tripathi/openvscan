import {
  BUILTIN_SKILLS,
  builtinSkill,
  builtinSkillId,
  importSkillFromUrl,
  isBuiltinSkillId,
  normalizeSkill,
  parseSkillUrl,
  SKILL_LIMITS,
  SKILL_SOURCES,
  type SkillSource,
  skillSha256,
} from "@openvscan/core";
import { chunk } from "@openvscan/db";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireUserId } from "@/lib/user";

/**
 * Review skills: markdown instructions the AI reviewer applies. Every query
 * is scoped to the signed-in user; repositories may reference only their
 * owner's skills and the built-ins.
 */

/** A rejected input's message, as a plain Error the client can show. */
function userError(err: unknown): never {
  throw new Error(err instanceof Error ? err.message : String(err));
}

const ID = /^[\w:-]{1,100}$/;

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  builtin: boolean;
  source: SkillSource | "builtin";
  sourceUrl: string | null;
  sha256: string | null;
  updatedAt: Date | null;
}

const BUILTIN_SUMMARIES: SkillSummary[] = BUILTIN_SKILLS.map((s) => ({
  id: builtinSkillId(s.slug),
  name: s.name,
  description: s.description,
  builtin: true,
  source: "builtin",
  sourceUrl: null,
  sha256: null,
  updatedAt: null,
}));

/** The user's skills and the built-ins, without bodies. */
export const listSkills = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const rows = await getDb().query.reviewSkill.findMany({
      where: eq(schema.reviewSkill.userId, userId),
      orderBy: [asc(schema.reviewSkill.name)],
      columns: {
        id: true,
        name: true,
        description: true,
        source: true,
        sourceUrl: true,
        sha256: true,
        updatedAt: true,
      },
    });
    const skills: SkillSummary[] = rows.map((r) => ({ ...r, builtin: false }));
    return { builtins: BUILTIN_SUMMARIES, skills };
  },
);

/** One skill with its body (a built-in or one of the user's). */
export const getSkill = createServerFn({ method: "GET" })
  .validator((id: string) => {
    if (typeof id !== "string" || !ID.test(id)) throw new Error("Invalid id");
    return id;
  })
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    if (isBuiltinSkillId(id)) {
      const b = builtinSkill(id);
      if (!b) throw new Error("Skill not found");
      return {
        ...BUILTIN_SUMMARIES.find((s) => s.id === id)!,
        body: b.body,
      };
    }
    const row = await getDb().query.reviewSkill.findFirst({
      where: and(
        eq(schema.reviewSkill.id, id),
        eq(schema.reviewSkill.userId, userId),
      ),
    });
    if (!row) throw new Error("Skill not found");
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      builtin: false,
      source: row.source,
      sourceUrl: row.sourceUrl,
      sha256: row.sha256,
      updatedAt: row.updatedAt,
      body: row.body,
    };
  });

/**
 * Fetch a skill from a URL for the user to review before saving. Runs on the
 * server: https only, allowlisted hosts and redirects, 10s, SKILL_LIMITS.download, text only.
 */
export const previewSkillUrl = createServerFn({ method: "POST" })
  .validator((url: string) => {
    if (typeof url !== "string" || url.length > 2000) {
      throw new Error("Enter a URL");
    }
    try {
      parseSkillUrl(url);
    } catch (err) {
      userError(err);
    }
    return url.trim();
  })
  .handler(async ({ data: url }) => {
    await requireUserId();
    try {
      const skill = await importSkillFromUrl(url, { timeoutMs: 10_000 });
      return { ...skill, sha256: await skillSha256(skill.body) };
    } catch (err) {
      userError(err);
    }
  });

export interface SaveSkillInput {
  /** Omit to create. */
  id?: string;
  name: string;
  description: string;
  body: string;
  /** For a new skill: how it was added. */
  source?: SkillSource;
  /** For a new `url` skill: where it was fetched from. */
  sourceUrl?: string | null;
}

export const saveSkill = createServerFn({ method: "POST" })
  .validator((data: SaveSkillInput) => {
    if (!data || typeof data !== "object") throw new Error("Invalid input");
    if (
      data.id !== undefined &&
      (typeof data.id !== "string" ||
        !ID.test(data.id) ||
        isBuiltinSkillId(data.id))
    ) {
      throw new Error("Built-in skills can't be edited");
    }
    let content: ReturnType<typeof normalizeSkill>;
    try {
      content = normalizeSkill(data);
    } catch (err) {
      userError(err);
    }
    const source = data.source ?? "paste";
    if (!(SKILL_SOURCES as readonly string[]).includes(source)) {
      throw new Error("Invalid source");
    }
    let sourceUrl: string | null = null;
    if (source === "url") {
      try {
        sourceUrl = parseSkillUrl(String(data.sourceUrl ?? "")).toString();
      } catch (err) {
        userError(err);
      }
    }
    return { id: data.id, ...content, source, sourceUrl };
  })
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const db = getDb();
    const mine = await db.query.reviewSkill.findMany({
      where: eq(schema.reviewSkill.userId, userId),
      columns: { id: true, name: true },
    });
    const clash = mine.find(
      (s) =>
        s.id !== data.id && s.name.toLowerCase() === data.name.toLowerCase(),
    );
    if (clash)
      throw new Error(`You already have a skill named "${clash.name}"`);
    if (
      BUILTIN_SKILLS.some(
        (b) => b.name.toLowerCase() === data.name.toLowerCase(),
      )
    ) {
      throw new Error(`"${data.name}" is the name of a built-in skill`);
    }
    const sha256 = await skillSha256(data.body);

    if (data.id) {
      if (!mine.some((s) => s.id === data.id))
        throw new Error("Skill not found");
      const [row] = await db
        .update(schema.reviewSkill)
        .set({
          name: data.name,
          description: data.description,
          body: data.body,
          sha256,
        })
        .where(
          and(
            eq(schema.reviewSkill.id, data.id),
            eq(schema.reviewSkill.userId, userId),
          ),
        )
        .returning({ id: schema.reviewSkill.id });
      return { id: row.id, sha256 };
    }

    if (mine.length >= SKILL_LIMITS.perUser) {
      throw new Error(
        `You can keep up to ${SKILL_LIMITS.perUser} skills. Delete one first.`,
      );
    }
    const id = crypto.randomUUID();
    await db.insert(schema.reviewSkill).values({
      id,
      userId,
      name: data.name,
      description: data.description,
      body: data.body,
      source: data.source,
      sourceUrl: data.sourceUrl,
      sha256,
    });
    return { id, sha256 };
  });

/** Delete a skill and take it off the user's repositories. */
export const deleteSkill = createServerFn({ method: "POST" })
  .validator((id: string) => {
    if (typeof id !== "string" || !ID.test(id) || isBuiltinSkillId(id)) {
      throw new Error("Invalid id");
    }
    return id;
  })
  .handler(async ({ data: id }) => {
    const userId = await requireUserId();
    const db = getDb();
    const deleted = await db
      .delete(schema.reviewSkill)
      .where(
        and(
          eq(schema.reviewSkill.id, id),
          eq(schema.reviewSkill.userId, userId),
        ),
      )
      .returning({ id: schema.reviewSkill.id });
    if (!deleted.length) throw new Error("Skill not found");
    const repos = await db.query.repository.findMany({
      where: eq(schema.repository.userId, userId),
      columns: { id: true, skills: true },
    });
    for (const repo of repos.filter((r) => r.skills.includes(id))) {
      await db
        .update(schema.repository)
        .set({ skills: repo.skills.filter((s) => s !== id) })
        .where(eq(schema.repository.id, repo.id));
    }
    return { message: "Skill deleted" };
  });
