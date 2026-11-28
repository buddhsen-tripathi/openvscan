import {
  countInvisible,
  parseSkillMarkdown,
  SKILL_LIMITS,
  SKILL_SOURCE_INFO,
  type SkillSource,
  utf8Bytes,
} from "@openvscan/core";
import { type FormEvent, useId, useState } from "react";
import { timeAgo } from "@/components/dashboard/RunList";
import {
  Book,
  ExternalLink,
  Plus,
  ShieldCheck,
  Spinner,
  Trash,
} from "@/components/icons";
import { Pill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/Input";
import {
  useDeleteSkillMutation,
  usePreviewSkillUrlMutation,
  useSaveSkillMutation,
  useSkillQuery,
  useSkillsQuery,
} from "@/lib/api";
import type { SkillSummary } from "@/lib/skills-server";
import { Loading, Notice, Panel, TabBar } from "./ui";

const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? e.message : fallback;

const INLINE_CODE =
  "rounded-[4px] bg-muted px-1 font-mono text-[12px] text-foreground";

/** What the editor holds before saving. */
interface Draft {
  id?: string;
  name: string;
  description: string;
  body: string;
  source: SkillSource;
  sourceUrl?: string | null;
  /** Hidden characters removed from the original text. */
  hiddenChars?: number;
}

/** Split pasted or uploaded markdown into a draft (frontmatter → fields). */
function draftFromMarkdown(
  text: string,
  source: SkillSource,
  fallbackName = "",
): Draft {
  const parsed = parseSkillMarkdown(text);
  return {
    name: parsed.name ?? fallbackName,
    description: parsed.description ?? "",
    body: parsed.body,
    source,
    hiddenChars: countInvisible(text),
  };
}

/* --------------------------------- Editor --------------------------------- */

type AddTab = "paste" | "upload" | "url";

/** Step one of adding a skill: get markdown from paste, a file or a URL. */
function AddSkill({ onCancel }: { onCancel: () => void }) {
  const [tab, setTab] = useState<AddTab>("paste");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pasted, setPasted] = useState("");
  const [url, setUrl] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const preview = usePreviewSkillUrlMutation();
  const ids = useId();

  if (draft) {
    return (
      <SkillForm
        draft={draft}
        bordered={false}
        onBack={() => setDraft(null)}
        onDone={onCancel}
      />
    );
  }

  const readFile = async (file: File | undefined) => {
    setFileError(null);
    if (!file) return;
    if (file.size > SKILL_LIMITS.download) {
      setFileError(
        `That file is larger than ${SKILL_LIMITS.download / 1024} KB.`,
      );
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;
    try {
      if (bytes.includes(0)) throw new Error();
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      setFileError("That file isn't UTF-8 text. Upload a markdown file.");
      return;
    }
    const base = file.name.replace(/\.(md|markdown|txt)$/i, "");
    setDraft(
      draftFromMarkdown(text, "upload", /^skill$/i.test(base) ? "" : base),
    );
  };

  const fetchUrl = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const s = await preview.mutateAsync(url);
      if (s) setDraft({ ...s, source: "url" });
    } catch {
      /* surfaced below */
    }
  };

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="border-b border-border">
        <TabBar
          label="Add a skill"
          value={tab}
          onChange={setTab}
          tabs={[
            { key: "paste", label: "Paste" },
            { key: "upload", label: "Upload" },
            { key: "url", label: "Import URL" },
          ]}
        />
      </div>

      {tab === "paste" && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setDraft(draftFromMarkdown(pasted, "paste"));
          }}
        >
          <Field label="Markdown" htmlFor={`${ids}-paste`}>
            <Textarea
              id={`${ids}-paste`}
              rows={10}
              spellCheck={false}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={
                "---\nname: payments-review\ndescription: How we handle money\n---\n\nAll amounts are integer cents. Flag any float arithmetic on amounts…"
              }
              className="font-mono text-[12.5px]"
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={!pasted.trim()}>
              Continue
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {tab === "upload" && (
        <div className="space-y-3">
          <Field label="Markdown file" htmlFor={`${ids}-file`}>
            <Input
              id={`${ids}-file`}
              type="file"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              onChange={(e) => void readFile(e.target.files?.[0])}
              className="h-auto py-1.5"
            />
          </Field>
          <p className="text-[12.5px] text-muted-foreground">
            A <code className={INLINE_CODE}>SKILL.md</code> or any markdown
            file, up to {SKILL_LIMITS.download / 1024} KB. Frontmatter{" "}
            <code className={INLINE_CODE}>name</code> and{" "}
            <code className={INLINE_CODE}>description</code> fill in the fields.
          </p>
          {fileError && <Notice tone="danger">{fileError}</Notice>}
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      )}

      {tab === "url" && (
        <form className="space-y-3" onSubmit={fetchUrl}>
          <Field label="URL" htmlFor={`${ids}-url`}>
            <Input
              id={`${ids}-url`}
              type="url"
              inputMode="url"
              spellCheck={false}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://github.com/owner/repo/blob/main/skills/x/SKILL.md"
              className="font-mono text-[13px]"
            />
          </Field>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            A file on GitHub (<code className={INLINE_CODE}>github.com</code> or{" "}
            <code className={INLINE_CODE}>raw.githubusercontent.com</code>), a
            gist, or a <code className={INLINE_CODE}>skills.sh</code> skill
            page. OpenVScan fetches it once, shows it to you, and saves a copy;
            it's never fetched again.
          </p>
          {preview.error && (
            <Notice tone="danger">
              {errorText(preview.error, "Could not fetch that URL")}
            </Notice>
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={!url.trim() || preview.isPending}
            >
              {preview.isPending && <Spinner className="animate-spin" />}
              Fetch and preview
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Review and edit a skill's name, description and body, then save. */
function SkillForm({
  draft,
  bordered = true,
  onBack,
  onDone,
}: {
  draft: Draft;
  /** A rule above the form, when it opens under a row. */
  bordered?: boolean;
  onBack?: () => void;
  onDone: () => void;
}) {
  const save = useSaveSkillMutation();
  const [name, setName] = useState(draft.name);
  const [description, setDescription] = useState(draft.description);
  const [body, setBody] = useState(draft.body);
  const ids = useId();
  const bytes = utf8Bytes(body);
  const tooBig = bytes > SKILL_LIMITS.body;
  const isNew = !draft.id;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await save.mutateAsync({
        id: draft.id,
        name,
        description,
        body,
        source: draft.source,
        sourceUrl: draft.sourceUrl ?? null,
      });
      onDone();
    } catch {
      /* surfaced below */
    }
  };

  return (
    <form
      onSubmit={submit}
      className={`space-y-4 px-5 py-4 ${bordered ? "border-t border-border" : ""}`}
    >
      {isNew && (
        <Notice tone="info">
          Read the skill before saving: the reviewer follows it as your
          instructions on every review of the repositories you add it to.
          {draft.sourceUrl && (
            <span className="mt-1 block break-all font-mono text-[12px] text-muted-foreground">
              From {draft.sourceUrl}
            </span>
          )}
        </Notice>
      )}
      {Boolean(draft.hiddenChars) && (
        <Notice tone="warning">
          Removed {draft.hiddenChars} hidden character
          {draft.hiddenChars === 1 ? "" : "s"} (zero-width, text-direction or
          tag characters). They can hide text from a reader; be wary of where
          this skill came from.
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Name"
          htmlFor={`${ids}-name`}
          aside={
            <span className="tabular text-[12px] text-muted-foreground">
              {name.length} / {SKILL_LIMITS.name}
            </span>
          }
        >
          <Input
            id={`${ids}-name`}
            required
            maxLength={SKILL_LIMITS.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Payments review"
          />
        </Field>
        <Field
          label="Description"
          htmlFor={`${ids}-description`}
          aside={
            <span className="tabular text-[12px] text-muted-foreground">
              {description.length} / {SKILL_LIMITS.description}
            </span>
          }
        >
          <Input
            id={`${ids}-description`}
            maxLength={SKILL_LIMITS.description}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="When the reviewer should use it"
          />
        </Field>
      </div>
      <Field
        label="Instructions"
        htmlFor={`${ids}-body`}
        aside={
          <span
            className={`tabular text-[12px] ${tooBig ? "text-status-failed" : "text-muted-foreground"}`}
          >
            {(bytes / 1024).toFixed(1)} / {SKILL_LIMITS.body / 1024} KB
          </span>
        }
      >
        <Textarea
          id={`${ids}-body`}
          rows={16}
          spellCheck={false}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={tooBig || undefined}
          className="font-mono text-[12.5px]"
        />
      </Field>
      {save.error && (
        <Notice tone="danger">
          {errorText(save.error, "Could not save the skill")}
        </Notice>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={save.isPending || !name.trim() || !body.trim() || tooBig}
        >
          {save.isPending && <Spinner className="animate-spin" />}
          {isNew ? "Save skill" : "Save changes"}
        </Button>
        {onBack && (
          <Button type="button" variant="ghost" size="sm" onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------- Rows ---------------------------------- */

function SkillBody({ id }: { id: string }) {
  const { data, isLoading, error } = useSkillQuery(id);
  if (isLoading) return <Loading className="py-6" />;
  if (!data) {
    return (
      <div className="px-5 pb-4">
        <Notice tone="danger">{errorText(error, "Could not load")}</Notice>
      </div>
    );
  }
  return (
    <div className="space-y-2 px-5 pb-4">
      {data.sha256 && (
        <p className="font-mono text-[11.5px] text-muted-foreground">
          sha256 {data.sha256.slice(0, 16)}…
        </p>
      )}
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-[8px] border border-border bg-muted/40 px-3.5 py-3 font-mono text-[12px] leading-relaxed text-foreground">
        {data.body}
      </pre>
    </div>
  );
}

function SkillEditor({ id, onDone }: { id: string; onDone: () => void }) {
  const { data, isLoading } = useSkillQuery(id);
  if (isLoading || !data) return <Loading className="py-6" />;
  return (
    <SkillForm
      draft={{
        id: data.id,
        name: data.name,
        description: data.description,
        body: data.body,
        source: data.source === "builtin" ? "paste" : data.source,
      }}
      onDone={onDone}
    />
  );
}

function sourceLabel(s: SkillSummary) {
  if (s.builtin) return "Built-in";
  return SKILL_SOURCE_INFO[s.source as SkillSource];
}

function SkillRow({ skill }: { skill: SkillSummary }) {
  const [mode, setMode] = useState<"closed" | "view" | "edit">("closed");
  const remove = useDeleteSkillMutation();
  const host = skill.sourceUrl ? new URL(skill.sourceUrl).hostname : null;

  return (
    <li>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">
              {skill.name}
            </span>
            <Pill tone={skill.builtin ? "inverse" : "outline"}>
              {sourceLabel(skill)}
            </Pill>
          </div>
          {skill.description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
              {skill.description}
            </p>
          )}
          {!skill.builtin && (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
              {skill.updatedAt && (
                <span>Updated {timeAgo(skill.updatedAt)}</span>
              )}
              {skill.sourceUrl && host && (
                <a
                  href={skill.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1 underline underline-offset-2 hover:text-foreground"
                >
                  {host}
                  <ExternalLink size={11} />
                </a>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={mode === "view"}
            onClick={() => setMode(mode === "view" ? "closed" : "view")}
          >
            {mode === "view" ? "Hide" : "View"}
          </Button>
          {!skill.builtin && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMode(mode === "edit" ? "closed" : "edit")}
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${skill.name}`}
                className="text-destructive hover:bg-destructive/[0.07] hover:text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${skill.name}"? It's removed from every repository that uses it.`,
                    )
                  )
                    remove.mutate(skill.id);
                }}
              >
                <Trash />
              </Button>
            </>
          )}
        </div>
      </div>
      {remove.error && (
        <div className="px-5 pb-4">
          <Notice tone="danger">
            {errorText(remove.error, "Could not delete")}
          </Notice>
        </div>
      )}
      {mode === "view" && <SkillBody id={skill.id} />}
      {mode === "edit" && (
        <SkillEditor id={skill.id} onDone={() => setMode("closed")} />
      )}
    </li>
  );
}

/* ---------------------------------- Panel --------------------------------- */

export function ReviewSkills() {
  const { data, isLoading } = useSkillsQuery();
  const [adding, setAdding] = useState(false);

  if (isLoading || !data) return <Loading className="py-10" />;
  const atLimit = data.skills.length >= SKILL_LIMITS.perUser;

  return (
    <div className="space-y-4">
      <Panel
        title="Your skills"
        description={`${data.skills.length} of ${SKILL_LIMITS.perUser}`}
        actions={
          !adding && (
            <Button
              size="sm"
              variant="outline"
              disabled={atLimit}
              onClick={() => setAdding(true)}
            >
              <Plus />
              Add skill
            </Button>
          )
        }
      >
        {adding && (
          <div className="border-b border-border last:border-b-0">
            <AddSkill onCancel={() => setAdding(false)} />
          </div>
        )}
        {data.skills.length === 0 ? (
          !adding && (
            <p className="px-5 py-5 text-[13.5px] text-muted-foreground">
              No skills yet. Add your team's conventions, a checklist for your
              framework, or a skill from GitHub or skills.sh.
            </p>
          )
        ) : (
          <ul className="divide-y divide-border">
            {data.skills.map((s) => (
              <SkillRow key={s.id} skill={s} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={
          <span className="inline-flex items-center gap-2">
            <Book size={15} className="text-muted-foreground" /> Built-in
          </span>
        }
        description="Maintained with OpenVScan. Pick them per repository."
      >
        <ul className="divide-y divide-border">
          {data.builtins.map((s) => (
            <SkillRow key={s.id} skill={s} />
          ))}
        </ul>
      </Panel>

      <div className="flex items-start gap-3 rounded-[10px] border border-dashed border-border px-4 py-3.5 text-[13px] leading-relaxed text-muted-foreground">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-accent-brand" />
        <span>
          Skills are saved as a snapshot with its sha256; an imported skill is
          never fetched again. Hidden and text-direction characters are removed.
          The reviewer treats skills as your instructions, so only add ones you
          have read. Choose them per repository under{" "}
          <span className="font-medium text-foreground">Review policy</span>.
        </span>
      </div>
    </div>
  );
}
