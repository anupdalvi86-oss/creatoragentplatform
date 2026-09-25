import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import type { Creator } from "../shared/types";

type AdminRequest = <T>(path: string, method?: string, data?: unknown) => Promise<T>;
type Program = {
  id: string;
  title: string;
  summary: string;
  goal: string;
  level: string;
  minutes: number;
  days: Array<{ day: number; label: string }>;
  accessTier: string;
  reviewStatus: "draft" | "pending_review" | "approved" | "published";
};
type Challenge = {
  id: string;
  program_id: string;
  title: string;
  starts_on: string;
  ends_on: string;
  review_status: "draft" | "pending_review" | "approved" | "published";
};
type Post = { id: string; program_id: string; body: string; status: string; created_at: string };
type Review = {
  programs: Array<{ id: string; title: string; summary: string }>;
  challenges: Array<{ id: string; title: string; description: string }>;
};
type Metrics = {
  visitors: { totalViews: number; uniqueVisitors: number };
};
type Tab = "overview" | "workouts" | "review" | "community" | "settings";

export default function FitnessAdminWorkspace({
  creator,
  admin,
  brandEditor,
}: {
  creator: Creator;
  admin: AdminRequest;
  brandEditor: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [programs, setPrograms] = useState<Program[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [review, setReview] = useState<Review>({ programs: [], challenges: [] });
  const [reviewAllowed, setReviewAllowed] = useState(true);
  const [members, setMembers] = useState<Array<{ email: string }>>([]);
  const [membersAllowed, setMembersAllowed] = useState(true);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [summary, setSummary] = useState<{ completions: number; participants: number } | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const studio = `/fitness-studio/${encodeURIComponent(creator.slug)}`;
  const editor = `/creator/${encodeURIComponent(creator.slug)}?studio=new`;

  async function refresh() {
    setError("");
    const results = await Promise.allSettled([
      admin<{ items: Program[] }>(`${studio}/programs`),
      admin<{ items: Challenge[] }>(`${studio}/challenges`),
      admin<{ items: Post[] }>(`${studio}/posts`),
      admin<Review>(`/fitness-review/${creator.id}`),
      admin<{ items: Array<{ email: string }> }>(`/fitness-members/${creator.id}`),
      admin<Metrics>(`/metrics/${creator.id}`),
      admin<{ completions: number; participants: number }>(`/fitness-summary/${creator.id}`),
    ] as const);
    if (results[0].status === "fulfilled") setPrograms(results[0].value.items);
    else setError((results[0].reason as Error).message || "Could not load workouts.");
    if (results[1].status === "fulfilled") setChallenges(results[1].value.items);
    if (results[2].status === "fulfilled") setPosts(results[2].value.items);
    if (results[3].status === "fulfilled") { setReview(results[3].value); setReviewAllowed(true); }
    else setReviewAllowed(false);
    if (results[4].status === "fulfilled") { setMembers(results[4].value.items); setMembersAllowed(true); }
    else setMembersAllowed(false);
    if (results[5].status === "fulfilled") setMetrics(results[5].value);
    if (results[6].status === "fulfilled") setSummary(results[6].value);
    setLoading(false);
  }

  useEffect(() => { void refresh(); }, [creator.id]);

  async function change(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
      setNotice(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The change could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!address) return;
    void change(async () => {
      await admin(`/fitness-members/${creator.id}`, "POST", { email: address });
      setEmail("");
    }, "Creator access added.");
  }

  const published = programs.filter((program) => program.reviewStatus === "published").length;
  const pending = review.programs.length + review.challenges.length;

  return (
    <div className="fitness-admin">
      <nav className="admin-tabs" aria-label="Fitness workspace">
        {(["overview", "workouts", "review", "community", "settings"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={tab === item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item === "review" ? `Review${pending ? ` (${pending})` : ""}` : item}
          </button>
        ))}
      </nav>
      {loading && <p role="status">Loading fitness workspace…</p>}
      {error && <p className="fitness-admin-error" role="alert">{error}</p>}
      {notice && <p className="admin-message" role="status">{notice}</p>}

      {tab === "overview" && (
        <div className="admin-panels fitness-admin-panels">
          <section className="admin-next-action">
            <p className="eyebrow">FITNESS WORKSPACE</p>
            <h2>{published ? "Your workout library is live" : "Add your first workout"}</h2>
            <p>Build a day-by-day program with exercises from the shared library. Save it as a draft, submit it for human review, then publish it to this creator's audience.</p>
            <div className="admin-editor-actions">
              <a className="fitness-admin-primary" href={editor} target="_blank" rel="noopener noreferrer">Create workout program ↗</a>
              <button type="button" onClick={() => setTab("workouts")}>Manage workouts</button>
            </div>
          </section>
          <section>
            <h2>Program status</h2>
            <p><span>Drafts</span><strong>{programs.filter((row) => row.reviewStatus === "draft").length}</strong></p>
            <p><span>Awaiting review</span><strong>{programs.filter((row) => row.reviewStatus === "pending_review").length}</strong></p>
            <p><span>Approved</span><strong>{programs.filter((row) => row.reviewStatus === "approved").length}</strong></p>
            <p><span>Published</span><strong>{published}</strong></p>
          </section>
          <section>
            <h2>Audience engagement</h2>
            <p><span>Page views</span><strong>{metrics?.visitors.totalViews ?? 0}</strong></p>
            <p><span>Unique visitors</span><strong>{metrics?.visitors.uniqueVisitors ?? 0}</strong></p>
            <p><span>Workout completions</span><strong>{summary?.completions ?? 0}</strong></p>
            <p><span>Participants</span><strong>{summary?.participants ?? 0}</strong></p>
            <p>Individual body measurements are not shown in the creator workspace.</p>
          </section>
        </div>
      )}

      {tab === "workouts" && (
        <div className="admin-panels fitness-admin-panels">
          <section className="admin-next-action">
            <h2>Workout programs</h2>
            <p>A program contains scheduled days. For each day, search the exercise catalog, preview demonstrations, set reps or duration and rest, and add creator instructions. The editor saves drafts and shows an audience preview.</p>
            <a className="fitness-admin-primary" href={editor} target="_blank" rel="noopener noreferrer">Add a workout program ↗</a>
          </section>
          <section className="fitness-admin-wide">
            <h2>Programs</h2>
            {!programs.length && <p>No programs yet. Use “Add a workout program” to create the first one.</p>}
            {programs.map((program) => (
              <article className="fitness-admin-item" key={program.id}>
                <div>
                  <h3>{program.title}</h3>
                  <p>{program.summary}</p>
                  <small>{program.goal} · {program.level} · {program.minutes} min · {program.days.length} day{program.days.length === 1 ? "" : "s"} · {program.accessTier} · {program.reviewStatus.replace("_", " ")}</small>
                </div>
                <div className="fitness-admin-actions">
                  <a href={`/creator/${encodeURIComponent(creator.slug)}?studio=${encodeURIComponent(program.id)}`} target="_blank" rel="noopener noreferrer">Edit / preview ↗</a>
                  {program.reviewStatus === "pending_review" && <button type="button" onClick={() => setTab("review")}>Review</button>}
                  {program.reviewStatus === "approved" && <button type="button" disabled={busy} onClick={() => void change(() => admin(`${studio}/programs/${program.id}/status`, "POST", { status: "published" }), "Program published to the audience.")}>Publish</button>}
                  {program.reviewStatus === "published" && <button type="button" disabled={busy} onClick={() => void change(() => admin(`${studio}/programs/${program.id}/unpublish`, "POST"), "Program unpublished.")}>Unpublish</button>}
                </div>
              </article>
            ))}
            <button type="button" disabled={busy} onClick={() => void refresh()}>Refresh programs</button>
          </section>
        </div>
      )}

      {tab === "review" && (
        <div className="admin-panels fitness-admin-panels">
          <section className="fitness-admin-wide">
            <h2>Programs awaiting review</h2>
            {!reviewAllowed && <p>Owner access is required to review programs and challenges.</p>}
            {reviewAllowed && !review.programs.length && <p>No programs are waiting for review.</p>}
            {review.programs.map((program) => (
              <article className="fitness-admin-item" key={program.id}>
                <div><h3>{program.title}</h3><p>{program.summary}</p><a href={`/creator/${encodeURIComponent(creator.slug)}?studio=${encodeURIComponent(program.id)}`} target="_blank" rel="noopener noreferrer">Inspect days and exercises ↗</a></div>
                <div className="fitness-admin-actions">
                  <button type="button" disabled={busy} onClick={() => void change(() => admin(`/fitness-review/${creator.id}/program/${program.id}`, "POST", { status: "approved" }), "Program approved. Publish it from Workouts when ready.")}>Approve</button>
                  <button type="button" disabled={busy} onClick={() => void change(() => admin(`/fitness-review/${creator.id}/program/${program.id}`, "POST", { status: "draft" }), "Program returned to draft.")}>Return to draft</button>
                </div>
              </article>
            ))}
          </section>
          <section className="fitness-admin-wide">
            <h2>Challenges awaiting review</h2>
            {reviewAllowed && !review.challenges.length && <p>No challenges are waiting for review.</p>}
            {review.challenges.map((challenge) => (
              <article className="fitness-admin-item" key={challenge.id}>
                <div><h3>{challenge.title}</h3><p>{challenge.description}</p></div>
                <div className="fitness-admin-actions">
                  <button type="button" disabled={busy} onClick={() => void change(() => admin(`/fitness-review/${creator.id}/challenge/${challenge.id}`, "POST", { status: "approved" }), "Challenge approved.")}>Approve</button>
                  <button type="button" disabled={busy} onClick={() => void change(() => admin(`/fitness-review/${creator.id}/challenge/${challenge.id}`, "POST", { status: "draft" }), "Challenge returned to draft.")}>Return to draft</button>
                </div>
              </article>
            ))}
          </section>
        </div>
      )}

      {tab === "community" && (
        <div className="admin-panels fitness-admin-panels">
          <section className="fitness-admin-wide">
            <h2>Creator challenges</h2>
            <p>Create and submit challenges in the creator studio. A challenge can go live after review and once its program is published.</p>
            <a className="fitness-admin-primary" href={`/creator/${encodeURIComponent(creator.slug)}?studio=challenges`} target="_blank" rel="noopener noreferrer">Create a challenge ↗</a>
            {!challenges.length && <p>No challenges yet.</p>}
            {challenges.map((challenge) => (
              <article className="fitness-admin-item" key={challenge.id}>
                <div><h3>{challenge.title}</h3><small>{challenge.starts_on} to {challenge.ends_on} · {challenge.review_status.replace("_", " ")}</small></div>
                {challenge.review_status === "approved" && <button type="button" disabled={busy} onClick={() => void change(() => admin(`${studio}/challenges/${challenge.id}/publish`, "POST"), "Challenge published.")}>Publish</button>}
                {challenge.review_status === "draft" && <button type="button" disabled={busy} onClick={() => void change(() => admin(`${studio}/challenges/${challenge.id}/submit`, "POST"), "Challenge submitted for review.")}>Submit for review</button>}
              </article>
            ))}
          </section>
          <section className="fitness-admin-wide">
            <h2>Community discussion</h2>
            {!posts.length && <p>No visible or reported posts yet.</p>}
            {posts.map((post) => (
              <article className="fitness-admin-item" key={post.id}>
                <div><p>{post.body}</p><small>{post.status} · {post.created_at}</small></div>
                <button type="button" disabled={busy} onClick={() => void change(() => admin(`${studio}/posts/${post.id}/hide`, "POST"), "Post hidden.")}>Hide post</button>
              </article>
            ))}
          </section>
        </div>
      )}

      {tab === "settings" && (
        <div className="admin-panels fitness-admin-panels">
          {brandEditor}
          <section>
            <h2>Creator studio access</h2>
            {!membersAllowed && <p>Owner access is required to manage creator membership.</p>}
            <p>Only these verified Cloudflare Access emails and platform operators can edit this fitness creator's programs. Audience accounts stay separate.</p>
            {membersAllowed && <form onSubmit={addMember}>
              <label htmlFor="fitness-member-email">Creator email</label>
              <input id="fitness-member-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="creator@example.com" />
              <button type="submit" disabled={busy}>Add creator access</button>
            </form>}
            {members.map((member) => (
              <div className="fitness-admin-member" key={member.email}>
                <span>{member.email}</span>
                <button type="button" disabled={busy} onClick={() => void change(() => admin(`/fitness-members/${creator.id}/${encodeURIComponent(member.email)}`, "DELETE"), "Creator access removed.")}>Remove</button>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
