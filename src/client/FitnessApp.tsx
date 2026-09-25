import { useEffect, useMemo, useState } from "react";
import type { Creator } from "../shared/types";

type Exercise = {
  id: string;
  name: string;
  bodyPart: string;
  target: string;
  equipment: string;
  difficulty: string;
  steps: string[];
  formCues: string[];
  videos: Record<string, string>;
  thumbnails: Record<string, string>;
  source: string;
  sourceUrl: string;
};
type Move = {
  id: string;
  day: number;
  position: number;
  exercise: Exercise;
  sets: number;
  reps: string;
  durationSeconds: number | null;
  restSeconds: number;
  instructions: string;
  cues: string;
  alternative: Exercise | null;
};
type Day = { day: number; label: string; exercises?: Move[] };
type Program = {
  id: string;
  title: string;
  summary: string;
  goal: string;
  level: string;
  equipment: string[];
  limitations: string;
  minutes: number;
  days: Day[];
  accessTier: string;
  followupText: string;
  reviewStatus: string;
  score?: number;
  reasons?: string[];
  locked?: boolean;
  exercises?: Move[];
};
type Profile = {
  goal: string;
  level: "beginner" | "intermediate" | "advanced";
  equipment: string[];
  days: number[];
  minutes: number;
  limitations: string;
  adult: boolean | null;
  heightCm: number | null;
  currentKg: number | null;
  targetKg: number | null;
};
type Reminder = {
  enabled: boolean;
  days: number[];
  hour: number;
  quietStart: number;
  quietEnd: number;
  followups: boolean;
  timezone: string;
};
const blankProfile: Profile = {
  goal: "",
  level: "beginner",
  equipment: [],
  days: [],
  minutes: 30,
  limitations: "",
  adult: null,
  heightCm: null,
  currentKg: null,
  targetKg: null,
};
const blankReminder: Reminder = {
  enabled: false,
  days: [],
  hour: 9,
  quietStart: 22,
  quietEnd: 7,
  followups: false,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
};
const week = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const equipmentOptions = ["body weight", "band", "dumbbell", "kettlebell", "barbell", "cable", "ez barbell", "leverage machine", "rope", "sled machine", "smith machine", "stability ball", "weighted"];
const bodyAreas = ["waist", "chest", "back", "cardio", "upper legs", "lower legs", "shoulders", "upper arms", "lower arms", "hips"];
const slug =
  location.pathname.match(/^\/creator\/([a-z0-9-]+)/)?.[1] ||
  new URLSearchParams(location.search).get("creator") ||
  "";
const base = `/api/${encodeURIComponent(slug)}/fitness`;
const studioTarget = new URLSearchParams(location.search).get("studio");
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const endpoint = path.startsWith("/studio")
    ? `/api/admin/fitness-studio/${encodeURIComponent(slug)}${path.slice("/studio".length)}`
    : `${base}${path}`;
  const response = await fetch(endpoint, {
    method,
    credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
const toggle = (values: number[], value: number) =>
  values.includes(value)
    ? values.filter((x) => x !== value)
    : [...values, value].sort();
const toggleString = (values: string[], value: string) =>
  values.includes(value)
    ? values.filter((x) => x !== value)
    : [...values, value];
const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));
function Video({ exercise }: { exercise: Exercise }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setOpen(false);
    setFailed(false);
  }, [exercise.id]);
  const video = exercise.videos.female || exercise.videos.male;
  const poster = exercise.thumbnails.female || exercise.thumbnails.male;
  return (
    <div className="fit-video">
      {open && video && !failed ? (
        <video
          controls
          playsInline
          preload="none"
          poster={poster}
          onError={() => setFailed(true)}
        >
          <source src={video} type="video/mp4" />
          Your browser cannot play this demonstration.
        </video>
      ) : (
        <div className="fit-poster">
          {poster && <img src={poster} alt="" loading="lazy" />}
          {failed ? (
            <p>Video unavailable. Follow the written steps below.</p>
          ) : (
            <button onClick={() => setOpen(true)}>Load demonstration</button>
          )}
        </div>
      )}
      <small>
        Demonstration media:{" "}
        <a href={exercise.sourceUrl} target="_blank" rel="noreferrer">
          source catalog ↗
        </a>
        .
      </small>
    </div>
  );
}
function Measure({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (x: number | null) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => setDraft(value === null ? "" : String(value)), [value, unit]);
  return (
    <div className="fit-measure">
      <label>
        {label}{" "}
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          placeholder="Optional"
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            const number = Number(next);
            if (next && number >= min && number <= max) onChange(number);
            if (!next) onChange(null);
          }}
          onBlur={() => {
            if (!draft) return;
            const number = clamp(Number(draft), min, max);
            if (Number.isFinite(number)) {
              onChange(number);
              setDraft(String(number));
            }
          }}
        />{" "}
        {unit}
      </label>
      <input
        aria-label={`${label} slider`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value ?? min}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <button
        type="button"
        onClick={() => {
          setDraft("");
          onChange(null);
        }}
      >
        Clear
      </button>
    </div>
  );
}
export default function FitnessApp({ creator }: { creator: Creator }) {
  const [screen, setScreen] = useState<
    "discover" | "profile" | "program" | "progress" | "community" | "studio"
  >("discover");
  const [profile, setProfile] = useState<Profile>(blankProfile);
  const [unit, setUnit] = useState<"metric" | "imperial">("metric");
  const [reminder, setReminder] = useState<Reminder>(blankReminder);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [program, setProgram] = useState<Program | null>(null);
  const [day, setDay] = useState(1);
  const [moveIndex, setMoveIndex] = useState(0);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [discomfort, setDiscomfort] = useState<string[]>([]);
  const [progress, setProgress] = useState<
    Array<{ program_id: string; day_number: number; workout_date: string }>
  >([]);
  const [challenges, setChallenges] = useState<
    Array<{
      id: string;
      program_id: string;
      title: string;
      description: string;
      starts_on: string;
      ends_on: string;
      joined: number;
    }>
  >([]);
  const [posts, setPosts] = useState<
    Array<{ id: string; body: string; created_at: string }>
  >([]);
  const [postText, setPostText] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [studioAllowed, setStudioAllowed] = useState(false);
  const [search, setSearch] = useState("");
  const [filterEquipment, setFilterEquipment] = useState("");
  const [filterBody, setFilterBody] = useState("");
  const [filterDifficulty, setFilterDifficulty] = useState("");
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [previewExerciseId, setPreviewExerciseId] = useState("");
  const [studioPrograms, setStudioPrograms] = useState<Program[]>([]);
  const [draft, setDraft] = useState<Program | null>(null);
  const [selectedDay, setSelectedDay] = useState(1);
  const [memberEmail, setMemberEmail] = useState("");
  const [members, setMembers] = useState<Array<{ email: string }>>([]);
  const [operator, setOperator] = useState(false);
  const [review, setReview] = useState<{
    programs: Array<{ id: string; title: string }>;
    challenges: Array<{ id: string; title: string }>;
  }>({ programs: [], challenges: [] });
  const [challengeDraft, setChallengeDraft] = useState({
    title: "",
    description: "",
    startsOn: "",
    endsOn: "",
  });
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const bmi =
    profile.adult === true && profile.heightCm && profile.currentKg
      ? profile.currentKg / Math.pow(profile.heightCm / 100, 2)
      : null;
  const currentMove = program?.exercises?.filter((x) => x.day === day)[
    moveIndex
  ];
  const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  const localParts = new Intl.DateTimeFormat("en-US", {
    timeZone: reminder.timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(now);
  const localDay =
    week.indexOf(localParts.find((x) => x.type === "weekday")?.value || "Mon") +
    1;
  const localHour = Number(
    localParts.find((x) => x.type === "hour")?.value || 0,
  );
  const quiet =
    reminder.quietStart > reminder.quietEnd
      ? localHour >= reminder.quietStart || localHour < reminder.quietEnd
      : localHour >= reminder.quietStart && localHour < reminder.quietEnd;
  const selectedDays = program?.days || [];
  const currentDay = selectedDays.find((d) => d.day === day);
  const dayMoves = program?.exercises?.filter((x) => x.day === day) || [];
  const isDone = progress.some(
    (x) =>
      x.program_id === program?.id &&
      x.day_number === day &&
      x.workout_date === today,
  );
  const consistency = useMemo(
    () => new Set(progress.map((x) => x.workout_date)).size,
    [progress],
  );
  function report(error: unknown) {
    setMessage(
      error instanceof Error ? error.message : "Something went wrong.",
    );
  }
  async function load() {
    try {
      const [p, list, history, r, c] = await Promise.all([
        api<{ profile: Profile | null }>("/profile"),
        api<{ items: Program[] }>("/programs"),
        api<{ items: typeof progress }>("/progress"),
        api<{ reminder: Reminder | null }>("/reminders"),
        api<{ items: typeof challenges }>("/challenges"),
      ]);
      setProfile(p.profile || blankProfile);
      setPrograms(list.items);
      setProgress(history.items);
      setReminder(r.reminder || blankReminder);
      setChallenges(c.items);
      try {
        const studio = await api<{ items: Program[] }>("/studio/programs");
        setStudioAllowed(true);
        if (studioTarget) {
          setStudioPrograms(studio.items);
          if (studioTarget === "new") setDraft(blankDraft());
          else if (studioTarget !== "challenges") {
            try {
              const detail = await api<Program>(`/studio/program/${encodeURIComponent(studioTarget)}`);
              setDraft(detail);
              setSelectedDay(detail.days[0]?.day || 1);
            } catch {
              setMessage("That program could not be opened. Choose one from the studio list.");
            }
          }
          setScreen("studio");
        }
      } catch {
        setStudioAllowed(false);
        if (studioTarget) setMessage("Creator access is required. Use Creator sign in below, then open the workout editor again.");
      }
    } catch (e) {
      report(e);
    }
  }
  useEffect(() => {
    void load();
    document.title = `${creator.name} • Fitness`;
  }, [creator.id]);
  useEffect(() => {
    if (screen !== "studio") return;
    void api<{ items: Exercise[] }>(
      `/catalog?search=${encodeURIComponent(search)}&equipment=${encodeURIComponent(filterEquipment)}&bodyPart=${encodeURIComponent(filterBody)}&difficulty=${encodeURIComponent(filterDifficulty)}&limit=80`,
    )
      .then((r) => setCatalog(r.items))
      .catch(report);
  }, [screen, search, filterEquipment, filterBody, filterDifficulty]);
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await task();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  async function openProgram(item: Program) {
    await action(async () => {
      const detail = await api<Program>(`/programs/${item.id}`);
      setProgram(detail);
      setDay(detail.days[0]?.day || 1);
      setMoveIndex(0);
      setSkipped([]);
      setDiscomfort([]);
      setScreen("program");
      setPosts((await api<{ items: typeof posts }>(`/posts/${item.id}`)).items);
    });
  }
  async function saveProfile() {
    await action(async () => {
      await api("/profile", "PUT", profile);
      setPrograms((await api<{ items: Program[] }>("/programs")).items);
      setMessage("Preferences saved. Recommendations updated.");
      setScreen("discover");
    });
  }
  async function complete() {
    if (!program) return;
    await action(async () => {
      await api("/complete", "POST", {
        programId: program.id,
        day,
        skipped,
        discomfort,
        date: today,
      });
      setProgress((await api<{ items: typeof progress }>("/progress")).items);
      setMessage(
        reminder.followups && !quiet && program.followupText
          ? `Workout logged. ${program.followupText}`
          : "Workout logged. Every session counts.",
      );
    });
  }
  async function saveReminder() {
    await action(async () => {
      const next = {
        ...reminder,
        enabled: reminder.enabled && reminder.days.length > 0,
      };
      await api("/reminders", "PUT", next);
      setReminder(next);
      if (
        next.enabled &&
        "Notification" in window &&
        Notification.permission === "default"
      )
        await Notification.requestPermission();
      setMessage(
        "Reminder preferences saved. In-app reminders appear while this PWA is open.",
      );
    });
  }
  async function loadStudio() {
    await action(async () => {
      const list = await api<{ items: Program[] }>("/studio/programs");
      setStudioPrograms(list.items);
      try {
        const membership = await admin<{ items: typeof members }>(`/fitness-members/${creator.id}`);
        setMembers(membership.items);
        setReview(await admin(`/fitness-review/${creator.id}`));
        setOperator(true);
      } catch {
        setOperator(false);
      }
      setScreen("studio");
    });
  }
  async function admin<T>(
    path: string,
    method = "GET",
    data?: unknown,
  ): Promise<T> {
    const r = await fetch(`/api/admin${path}`, {
      method,
      credentials: "same-origin",
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
    });
    const j = (await r.json()) as T & { error?: string };
    if (!r.ok) throw new Error(j.error || "Admin access required");
    return j;
  }
  function blankDraft(): Program {
    return {
      id: "",
      title: "",
      summary: "",
      goal: "strength",
      level: "beginner",
      equipment: [],
      limitations: "",
      minutes: 30,
      days: [{ day: 1, label: "Day 1", exercises: [] }],
      accessTier: "free",
      followupText: "",
      reviewStatus: "draft",
      exercises: [],
    };
  }
  function updateDraft(change: Partial<Program>) {
    setDraft((d) => (d ? { ...d, ...change } : d));
  }
  function updateMove(index: number, change: Partial<Move>) {
    setDraft((d) => {
      if (!d) return d;
      const moves = [...(d.exercises || [])];
      moves[index] = { ...moves[index]!, ...change };
      return { ...d, exercises: moves };
    });
  }
  async function editProgram(item: Program) {
    await action(async () => {
      const detail = await api<Program>(`/studio/program/${item.id}`);
      setDraft(detail);
      setSelectedDay(detail.days[0]?.day || 1);
    });
  }
  async function saveProgram() {
    if (!draft) return;
    await action(async () => {
      const days = draft.days.map((d) => ({
        day: d.day,
        label: d.label,
        exercises: (draft.exercises || [])
          .filter((x) => x.day === d.day)
          .map((x) => ({
            exerciseId: x.exercise.id,
            sets: Number(x.sets),
            reps: x.reps,
            durationSeconds: x.durationSeconds,
            restSeconds: Number(x.restSeconds),
            instructions: x.instructions,
            cues: x.cues,
            alternativeExerciseId: x.alternative?.id || null,
          })),
      }));
      const data = { ...draft, days };
      const result = await api<{ id: string }>(
        draft.id ? `/studio/programs/${draft.id}` : "/studio/programs",
        draft.id ? "PUT" : "POST",
        data,
      );
      setStudioPrograms(
        (await api<{ items: Program[] }>("/studio/programs")).items,
      );
      setDraft({ ...draft, id: result.id, reviewStatus: "draft" });
      setMessage("Draft saved. Submit it for administrator review when ready.");
    });
  }
  async function statusProgram(
    status: "pending_review" | "published" | "draft",
  ) {
    if (!draft?.id) return;
    await action(async () => {
      await api(`/studio/programs/${draft.id}/status`, "POST", { status });
      setDraft({ ...draft, reviewStatus: status });
      setStudioPrograms(
        (await api<{ items: Program[] }>("/studio/programs")).items,
      );
      setMessage(
        status === "published" ? "Program is live." : "Status updated.",
      );
    });
  }
  async function reviewItem(
    kind: "program" | "challenge",
    itemId: string,
    status: "approved" | "draft",
  ) {
    await action(async () => {
      await admin(`/fitness-review/${creator.id}/${kind}/${itemId}`, "POST", {
        status,
      });
      setReview(await admin(`/fitness-review/${creator.id}`));
      setStudioPrograms(
        (await api<{ items: Program[] }>("/studio/programs")).items,
      );
      setMessage(`${kind} ${status}.`);
    });
  }
  const notificationDue =
    reminder.enabled &&
    reminder.days.includes(localDay) &&
    localHour === reminder.hour &&
    !quiet;
  useEffect(() => {
    if (
      !notificationDue ||
      !("Notification" in window) ||
      Notification.permission !== "granted"
    )
      return;
    const key = `fit-remind-${slug}-${today}-${reminder.hour}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    new Notification(`${creator.name}: time to move?`, {
      body: "Your workout is ready whenever you are.",
    });
  }, [notificationDue, today, reminder.hour, creator.name]);
  return (
    <div
      className="fit-app"
      style={{ "--fit-accent": creator.brand.accent } as React.CSSProperties}
    >
      <header className="fit-header">
        <div>
          <span className="fit-mark">✳</span>
          <strong>{creator.name}</strong>
          <small>MOVE AT YOUR PACE</small>
        </div>
        <button onClick={() => setScreen("profile")}>Preferences</button>
      </header>
      <main className="fit-main">
        {message && (
          <p className="fit-message" role="status">
            {message}
          </p>
        )}
        {notificationDue && (
          <div className="fit-notice">
            Your chosen workout time is here. Start when you're ready.
          </div>
        )}
        {screen === "discover" && (
          <>
            <section className="fit-hero">
              <p className="fit-kicker">YOUR MOVEMENT SPACE</p>
              <h1>{creator.brand.hero}</h1>
              <p>
                Find a creator reviewed routine that fits your goals, time, and
                equipment.
              </p>
              <button onClick={() => setScreen("profile")}>
                {profile.goal ? "Edit your match" : "Set your preferences"}
              </button>
            </section>
            <section>
              <h2>Programs for you</h2>
              <p className="fit-muted">
                Matched by goal, experience, equipment, time, and days. Your
                measurements are never used for matching.
              </p>
              {programs.length ? (
                <div className="fit-cards">
                  {programs.map((item) => (
                    <article className="fit-card" key={item.id}>
                      <p className="fit-kicker">
                        {item.level} · {item.minutes} min · {item.days.length}{" "}
                        days
                      </p>
                      <h3>{item.title}</h3>
                      <p>{item.summary}</p>
                      <small>
                        {item.reasons?.join(" · ") || `Goal: ${item.goal}`}
                      </small>
                      <div>
                        <button
                          disabled={item.locked}
                          onClick={() => openProgram(item)}
                        >
                          {item.locked
                            ? "Premium access required"
                            : "View routine"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="fit-empty">
                  <h3>Programs are being prepared</h3>
                  <p>
                    This creator has not published a routine yet. You can still
                    save your preferences.
                  </p>
                </div>
              )}
            </section>
            <section>
              <h2>Community challenges</h2>
              {challenges.length ? (
                challenges.map((c) => (
                  <article className="fit-card" key={c.id}>
                    <h3>{c.title}</h3>
                    <p>{c.description}</p>
                    <small>
                      {c.starts_on} – {c.ends_on}
                    </small>
                    <button
                      disabled={!!c.joined}
                      onClick={() =>
                        action(async () => {
                          await api(`/challenges/${c.id}/join`, "POST");
                          setChallenges(
                            (
                              await api<{ items: typeof challenges }>(
                                "/challenges",
                              )
                            ).items,
                          );
                        })
                      }
                    >
                      {c.joined ? "Joined" : "Join challenge"}
                    </button>
                  </article>
                ))
              ) : (
                <p className="fit-muted">No active challenges yet.</p>
              )}
            </section>
          </>
        )}
        {screen === "profile" && (
          <section className="fit-panel">
            <p className="fit-kicker">PERSONALIZE</p>
            <h1>Your preferences</h1>
            <p>
              All fields can be changed later. Movement limitations and
              measurements are optional.
            </p>
            <label>
              Goal
              <select
                value={profile.goal}
                onChange={(e) =>
                  setProfile({ ...profile, goal: e.target.value })
                }
              >
                <option value="">Choose a goal</option>
                <option value="strength">Strength</option>
                <option value="core-strength">Abs / core strength</option>
                <option value="mobility">Mobility</option>
                <option value="endurance">Endurance</option>
                <option value="general fitness">General fitness</option>
              </select>
            </label>
            <label>
              Experience
              <select
                value={profile.level}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    level: e.target.value as Profile["level"],
                  })
                }
              >
                <option>beginner</option>
                <option>intermediate</option>
                <option>advanced</option>
              </select>
            </label>
            <fieldset>
              <legend>Equipment available</legend>
              {equipmentOptions.map((x) => (
                <label key={x}>
                  <input
                    type="checkbox"
                    checked={profile.equipment.includes(x)}
                    onChange={() =>
                      setProfile({
                        ...profile,
                        equipment: toggleString(profile.equipment, x),
                      })
                    }
                  />
                  {x}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Preferred days</legend>
              <div className="fit-days">
                {week.map((name, i) => (
                  <button
                    type="button"
                    className={profile.days.includes(i + 1) ? "selected" : ""}
                    key={name}
                    onClick={() =>
                      setProfile({
                        ...profile,
                        days: toggle(profile.days, i + 1),
                      })
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Session length: {profile.minutes} min
              <input
                type="range"
                min="5"
                max="120"
                step="5"
                value={profile.minutes}
                onChange={(e) =>
                  setProfile({ ...profile, minutes: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Movement limitations (optional)
              <textarea
                value={profile.limitations}
                onChange={(e) =>
                  setProfile({ ...profile, limitations: e.target.value })
                }
                placeholder="Anything you'd like to account for?"
              />
            </label>
            <fieldset>
              <legend>Age confirmation for optional body metrics</legend>
              <label>
                <input
                  type="radio"
                  checked={profile.adult === true}
                  onChange={() => setProfile({ ...profile, adult: true })}
                />{" "}
                I am 18 or older
              </label>
              <label>
                <input
                  type="radio"
                  checked={profile.adult === false}
                  onChange={() =>
                    setProfile({
                      ...profile,
                      adult: false,
                      heightCm: null,
                      currentKg: null,
                      targetKg: null,
                    })
                  }
                />{" "}
                Under 18
              </label>
              <label>
                <input
                  type="radio"
                  checked={profile.adult === null}
                  onChange={() =>
                    setProfile({
                      ...profile,
                      adult: null,
                      heightCm: null,
                      currentKg: null,
                      targetKg: null,
                    })
                  }
                />{" "}
                Skip
              </label>
            </fieldset>
            {profile.adult === true && (
              <div className="fit-metrics">
                <div className="fit-row">
                  <h3>Optional measurements</h3>
                  <button
                    onClick={() =>
                      setUnit(unit === "metric" ? "imperial" : "metric")
                    }
                  >
                    Use {unit === "metric" ? "imperial" : "metric"} units
                  </button>
                </div>
                <Measure
                  label="Height"
                  value={
                    profile.heightCm === null
                      ? null
                      : unit === "metric"
                        ? profile.heightCm
                        : Number((profile.heightCm / 2.54).toFixed(1))
                  }
                  onChange={(v) =>
                    setProfile({
                      ...profile,
                      heightCm:
                        v === null
                          ? null
                          : unit === "metric"
                            ? v
                            : Number((v * 2.54).toFixed(1)),
                    })
                  }
                  min={unit === "metric" ? 90 : 35.4}
                  max={unit === "metric" ? 240 : 94.5}
                  step={unit === "metric" ? 0.5 : 0.1}
                  unit={unit === "metric" ? "cm" : "in"}
                />
                {(["currentKg", "targetKg"] as const).map((field) => (
                  <Measure
                    key={field}
                    label={
                      field === "currentKg" ? "Current weight" : "Target weight"
                    }
                    value={
                      profile[field] === null
                        ? null
                        : unit === "metric"
                          ? profile[field]
                          : Number((profile[field]! * 2.20462).toFixed(1))
                    }
                    onChange={(v) =>
                      setProfile({
                        ...profile,
                        [field]:
                          v === null
                            ? null
                            : unit === "metric"
                              ? v
                              : Number((v / 2.20462).toFixed(1)),
                      })
                    }
                    min={unit === "metric" ? 25 : 55}
                    max={unit === "metric" ? 350 : 772}
                    step={0.1}
                    unit={unit === "metric" ? "kg" : "lb"}
                  />
                ))}
                {bmi && (
                  <p>
                    BMI: {bmi.toFixed(1)}{" "}
                    <small>
                      Informational only. It does not determine your program or
                      target.
                    </small>
                  </p>
                )}
              </div>
            )}
            <div className="fit-actions">
              <button disabled={busy} onClick={saveProfile}>
                Save preferences
              </button>
              <button
                className="secondary"
                onClick={() =>
                  action(async () => {
                    await api("/profile", "DELETE");
                    setProfile(blankProfile);
                    setMessage("Optional profile data cleared.");
                  })
                }
              >
                Clear profile
              </button>
            </div>
            <hr />
            <h2>Reminders</h2>
            <label>
              <input
                type="checkbox"
                checked={reminder.enabled}
                onChange={(e) =>
                  setReminder({ ...reminder, enabled: e.target.checked })
                }
              />{" "}
              Remind me to work out
            </label>
            <div className="fit-days">
              {week.map((name, i) => (
                <button
                  type="button"
                  className={reminder.days.includes(i + 1) ? "selected" : ""}
                  key={name}
                  onClick={() =>
                    setReminder({
                      ...reminder,
                      days: toggle(reminder.days, i + 1),
                    })
                  }
                >
                  {name}
                </button>
              ))}
            </div>
            <label>
              Reminder hour
              <input
                type="time"
                value={`${String(reminder.hour).padStart(2, "0")}:00`}
                onChange={(e) =>
                  setReminder({
                    ...reminder,
                    hour: Number(e.target.value.slice(0, 2)),
                  })
                }
              />
            </label>
            <div className="fit-row">
              <label>
                Quiet from
                <input
                  type="time"
                  value={`${String(reminder.quietStart).padStart(2, "0")}:00`}
                  onChange={(e) =>
                    setReminder({
                      ...reminder,
                      quietStart: Number(e.target.value.slice(0, 2)),
                    })
                  }
                />
              </label>
              <label>
                Until
                <input
                  type="time"
                  value={`${String(reminder.quietEnd).padStart(2, "0")}:00`}
                  onChange={(e) =>
                    setReminder({
                      ...reminder,
                      quietEnd: Number(e.target.value.slice(0, 2)),
                    })
                  }
                />
              </label>
            </div>
            <label>
              <input
                type="checkbox"
                checked={reminder.followups}
                onChange={(e) =>
                  setReminder({ ...reminder, followups: e.target.checked })
                }
              />{" "}
              Allow creator follow ups
            </label>
            <p className="fit-muted">
              Reminders use browser notifications while the app is open. Quiet
              hours are respected.
            </p>
            <button onClick={saveReminder}>Save reminders</button>
          </section>
        )}
        {screen === "program" && program && (
          <>
            <section className="fit-hero">
              <p className="fit-kicker">
                {program.level} · {program.minutes} MIN
              </p>
              <h1>{program.title}</h1>
              <p>{program.summary}</p>
              <p>
                Goal: {program.goal} · Equipment:{" "}
                {program.equipment.join(", ") || "None"}
              </p>
              {program.limitations && (
                <p>Creator notes: {program.limitations}</p>
              )}
            </section>
            <section className="fit-panel">
              <div className="fit-days">
                {program.days.map((d) => (
                  <button
                    key={d.day}
                    className={d.day === day ? "selected" : ""}
                    onClick={() => {
                      setDay(d.day);
                      setMoveIndex(0);
                      setSkipped([]);
                      setDiscomfort([]);
                    }}
                  >
                    {week[d.day - 1]}
                    <small>{d.label}</small>
                  </button>
                ))}
              </div>
              <h2>{currentDay?.label}</h2>
              <p>{dayMoves.length} movements · go at your pace</p>
              {currentMove ? (
                <article className="fit-workout">
                  <p className="fit-kicker">
                    MOVE {moveIndex + 1} OF {dayMoves.length}
                  </p>
                  <h3>{currentMove.exercise.name}</h3>
                  <Video exercise={currentMove.exercise} />
                  <p>
                    {currentMove.sets} sets ·{" "}
                    {currentMove.durationSeconds
                      ? `${currentMove.durationSeconds} seconds`
                      : `${currentMove.reps} reps`}{" "}
                    · {currentMove.restSeconds}s rest
                  </p>
                  {currentMove.instructions && (
                    <p>
                      <strong>Creator instructions:</strong>{" "}
                      {currentMove.instructions}
                    </p>
                  )}
                  {currentMove.cues && (
                    <p>
                      <strong>Creator cue:</strong> {currentMove.cues}
                    </p>
                  )}
                  <ol>
                    {currentMove.exercise.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  <p>
                    Catalog form cues:{" "}
                    {currentMove.exercise.formCues.join(" · ")}
                  </p>
                  {currentMove.alternative && (
                    <button
                      className="secondary"
                      onClick={() =>
                        setProgram({
                          ...program,
                          exercises: program.exercises?.map((x) =>
                            x.id === currentMove.id
                              ? { ...x, exercise: currentMove.alternative! }
                              : x,
                          ),
                        })
                      }
                    >
                      Try alternative: {currentMove.alternative.name}
                    </button>
                  )}
                  <div className="fit-actions">
                    <button
                      className="secondary"
                      onClick={() => {
                        setSkipped([...skipped, currentMove.id]);
                        setMoveIndex(
                          Math.min(moveIndex + 1, dayMoves.length - 1),
                        );
                      }}
                    >
                      Skip movement
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSkipped([...skipped, currentMove.id]);
                        setDiscomfort([...discomfort, currentMove.id]);
                        setMoveIndex(
                          Math.min(moveIndex + 1, dayMoves.length - 1),
                        );
                        setMessage(
                          "Discomfort noted locally for this workout. Stop this movement and choose what feels appropriate.",
                        );
                      }}
                    >
                      Report discomfort
                    </button>
                    <button
                      onClick={() =>
                        setMoveIndex(
                          Math.min(moveIndex + 1, dayMoves.length - 1),
                        )
                      }
                    >
                      {moveIndex === dayMoves.length - 1
                        ? "Last movement"
                        : "Next movement"}
                    </button>
                  </div>
                </article>
              ) : (
                <p>No movements for this day.</p>
              )}
              <button disabled={busy || isDone} onClick={complete}>
                {isDone ? "Completed today" : "Finish this workout"}
              </button>
              <p className="fit-muted">
                Stop or skip a movement if it causes discomfort. This program is
                general fitness content, not medical advice.
              </p>
            </section>
            <section className="fit-panel">
              <h2>Program discussion</h2>
              <div className="fit-posts">
                {posts.length ? (
                  posts.map((p) => (
                    <article key={p.id}>
                      <p>{p.body}</p>
                      <small>
                        {new Date(p.created_at).toLocaleDateString()}
                      </small>
                      <button
                        className="text"
                        onClick={() =>
                          action(async () => {
                            await api(`/posts/${p.id}/report`, "POST");
                            setPosts(
                              (
                                await api<{ items: typeof posts }>(
                                  `/posts/${program.id}`,
                                )
                              ).items,
                            );
                            setMessage("Post reported for review.");
                          })
                        }
                      >
                        Report
                      </button>
                    </article>
                  ))
                ) : (
                  <p>No posts yet. Start a supportive discussion.</p>
                )}
              </div>
              <textarea
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                maxLength={500}
                placeholder="Share a supportive thought"
              />
              <button
                disabled={!postText.trim()}
                onClick={() =>
                  action(async () => {
                    await api(`/posts/${program.id}`, "POST", {
                      body: postText,
                    });
                    setPostText("");
                    setPosts(
                      (
                        await api<{ items: typeof posts }>(
                          `/posts/${program.id}`,
                        )
                      ).items,
                    );
                  })
                }
              >
                Post
              </button>
            </section>
          </>
        )}
        {screen === "progress" && (
          <section className="fit-panel">
            <p className="fit-kicker">KEEP SHOWING UP</p>
            <h1>Your progress</h1>
            <p>
              <strong>{progress.length}</strong> workouts completed across{" "}
              <strong>{consistency}</strong> days.
            </p>
            <p>
              Every session counts. You can return whenever it works for you.
            </p>
            {progress.length ? (
              <ul>
                {progress.slice(0, 30).map((x, i) => (
                  <li key={i}>
                    {x.workout_date} · Day {x.day_number}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Your completed workouts will appear here.</p>
            )}
          </section>
        )}
        {screen === "community" && (
          <section>
            <h1>Challenges</h1>
            {challenges.length ? (
              challenges.map((c) => (
                <article className="fit-card" key={c.id}>
                  <h2>{c.title}</h2>
                  <p>{c.description}</p>
                  <small>
                    {c.starts_on} to {c.ends_on}
                  </small>
                  <div>
                    <button
                      disabled={!!c.joined}
                      onClick={() =>
                        action(async () => {
                          await api(`/challenges/${c.id}/join`, "POST");
                          setChallenges(
                            (
                              await api<{ items: typeof challenges }>(
                                "/challenges",
                              )
                            ).items,
                          );
                        })
                      }
                    >
                      {c.joined ? "Joined" : "Join challenge"}
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p>New creator challenges will appear here.</p>
            )}
          </section>
        )}
        {screen === "studio" && studioAllowed && (
          <section className="fit-panel">
            <p className="fit-kicker">CREATOR STUDIO</p>
            <h1>Build your programs</h1>
            <p>
              Save a draft, preview it, then submit it for administrator review
              before publishing.
            </p>
            <div className="fit-actions">
              <button
                onClick={() => {
                  setDraft(blankDraft());
                  setSelectedDay(1);
                }}
              >
                New program
              </button>
              <button className="secondary" onClick={loadStudio}>
                Refresh
              </button>
            </div>
            <div className="fit-cards">
              {studioPrograms.map((p) => (
                <article className="fit-card" key={p.id}>
                  <h3>{p.title}</h3>
                  <small>
                    {p.reviewStatus} · {p.accessTier}
                  </small>
                  <div>
                    <button onClick={() => editProgram(p)}>
                      Edit / preview
                    </button>
                    {p.reviewStatus === "published" && (
                      <button
                        className="secondary"
                        onClick={() =>
                          action(async () => {
                            await api(
                              `/studio/programs/${p.id}/unpublish`,
                              "POST",
                            );
                            setStudioPrograms(
                              (
                                await api<{ items: Program[] }>(
                                  "/studio/programs",
                                )
                              ).items,
                            );
                            setDraft((current) => current?.id === p.id ? { ...current, reviewStatus: "draft" } : current);
                          })
                        }
                      >
                        Unpublish
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {draft && (
              <div className="fit-editor">
                <h2>{draft.id ? "Edit program" : "New program"}</h2>
                <label>
                  Name
                  <input
                    value={draft.title}
                    onChange={(e) => updateDraft({ title: e.target.value })}
                  />
                </label>
                <label>
                  Summary
                  <textarea
                    value={draft.summary}
                    onChange={(e) => updateDraft({ summary: e.target.value })}
                  />
                </label>
                <div className="fit-row">
                  <label>
                    Goal
                    <select
                      value={draft.goal}
                      onChange={(e) => updateDraft({ goal: e.target.value })}
                    >
                      {[
                        "strength",
                        "core-strength",
                        "mobility",
                        "endurance",
                        "general fitness",
                      ].map((x) => (
                        <option key={x} value={x}>
                          {x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Experience
                    <select
                      value={draft.level}
                      onChange={(e) => updateDraft({ level: e.target.value })}
                    >
                      {["beginner", "intermediate", "advanced"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Equipment (comma separated)
                  <input
                    value={draft.equipment.join(", ")}
                    onChange={(e) =>
                      updateDraft({
                        equipment: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label>
                  Intended limitations / adaptations
                  <textarea
                    value={draft.limitations}
                    onChange={(e) =>
                      updateDraft({ limitations: e.target.value })
                    }
                  />
                </label>
                <label>
                  Optional creator follow up after a completed workout
                  <textarea
                    value={draft.followupText || ""}
                    onChange={(e) =>
                      updateDraft({ followupText: e.target.value })
                    }
                    maxLength={300}
                  />
                </label>
                <label>
                  Session minutes
                  <input
                    type="number"
                    min="5"
                    max="180"
                    value={draft.minutes}
                    onChange={(e) =>
                      updateDraft({ minutes: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  Access
                  <select
                    value={draft.accessTier}
                    onChange={(e) =>
                      updateDraft({ accessTier: e.target.value })
                    }
                  >
                    <option value="free">Free</option>
                    <option value="premium">
                      Premium ready (server gated)
                    </option>
                  </select>
                </label>
                <h3>Days</h3>
                <div className="fit-days">
                  {draft.days.map((d) => (
                    <button
                      key={d.day}
                      className={selectedDay === d.day ? "selected" : ""}
                      onClick={() => setSelectedDay(d.day)}
                    >
                      {week[d.day - 1]}
                    </button>
                  ))}
                </div>
                <button
                  className="secondary"
                  onClick={() => {
                    const next = week
                      .map((_, i) => i + 1)
                      .find((n) => !draft.days.some((d) => d.day === n));
                    if (next)
                      updateDraft({
                        days: [
                          ...draft.days,
                          { day: next, label: `Day ${next}` },
                        ].sort((a, b) => a.day - b.day),
                      });
                  }}
                >
                  Add day
                </button>
                <label>
                  Day label
                  <input
                    value={
                      draft.days.find((d) => d.day === selectedDay)?.label || ""
                    }
                    onChange={(e) =>
                      updateDraft({
                        days: draft.days.map((d) =>
                          d.day === selectedDay
                            ? { ...d, label: e.target.value }
                            : d,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  className="secondary"
                  disabled={draft.days.length === 1}
                  onClick={() => {
                    const remaining = draft.days.filter((d) => d.day !== selectedDay);
                    updateDraft({ days: remaining, exercises: draft.exercises?.filter((x) => x.day !== selectedDay) });
                    setSelectedDay(remaining[0]!.day);
                  }}
                >
                  Remove day
                </button>
                <h3>Exercises for {week[selectedDay - 1]}</h3>
                {draft.exercises
                  ?.filter((x) => x.day === selectedDay)
                  .map((m, i) => {
                    const index = draft.exercises!.indexOf(m);
                    return (
                      <article
                        className="fit-card"
                        key={`${m.exercise.id}-${i}`}
                      >
                        <h4>{m.exercise.name}</h4>
                        <div className="fit-row">
                          <label>
                            Sets
                            <input
                              type="number"
                              min="1"
                              max="20"
                              value={m.sets}
                              onChange={(e) =>
                                updateMove(index, {
                                  sets: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                          <label>
                            Reps
                            <input
                              value={m.reps}
                              onChange={(e) =>
                                updateMove(index, { reps: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            Seconds (optional)
                            <input
                              type="number"
                              min="0"
                              value={m.durationSeconds ?? ""}
                              onChange={(e) =>
                                updateMove(index, {
                                  durationSeconds: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                            />
                          </label>
                          <label>
                            Rest seconds
                            <input
                              type="number"
                              min="0"
                              value={m.restSeconds}
                              onChange={(e) =>
                                updateMove(index, {
                                  restSeconds: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                        <label>
                          Instructions
                          <textarea
                            value={m.instructions}
                            onChange={(e) =>
                              updateMove(index, {
                                instructions: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Creator cue
                          <textarea
                            value={m.cues}
                            onChange={(e) =>
                              updateMove(index, { cues: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Alternative movement
                          <select
                            value={m.alternative?.id || ""}
                            onChange={(e) =>
                              updateMove(index, {
                                alternative:
                                  catalog.find(
                                    (x) => x.id === e.target.value,
                                  ) || null,
                              })
                            }
                          >
                            <option value="">None</option>
                            {catalog
                              .filter((x) => x.difficulty === "beginner")
                              .map((x) => (
                                <option key={x.id} value={x.id}>
                                  {x.name}
                                </option>
                              ))}
                          </select>
                        </label>
                        <div className="fit-actions">
                          <button
                            className="secondary"
                            onClick={() => {
                              const a = [...draft.exercises!];
                              let previous = index - 1;
                              while (previous >= 0 && a[previous]?.day !== selectedDay) previous -= 1;
                              if (previous >= 0) {
                                [a[previous], a[index]] = [
                                  a[index]!,
                                  a[previous]!,
                                ];
                                updateDraft({ exercises: a });
                              }
                            }}
                          >
                            ↑
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              const a = [...draft.exercises!];
                              const next = a.findIndex((entry, at) => at > index && entry.day === selectedDay);
                              if (next >= 0) {
                                [a[index], a[next]] = [
                                  a[next]!,
                                  a[index]!,
                                ];
                                updateDraft({ exercises: a });
                              }
                            }}
                          >
                            ↓
                          </button>
                          <button
                            className="secondary"
                            onClick={() =>
                              updateDraft({
                                exercises: draft.exercises!.filter(
                                  (x) => x !== m,
                                ),
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      </article>
                    );
                  })}
                <h3>Exercise library</h3>
                <div className="fit-row">
                  <input
                    aria-label="Search exercises"
                    placeholder="Search exercises"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <select
                    aria-label="Equipment"
                    value={filterEquipment}
                    onChange={(e) => setFilterEquipment(e.target.value)}
                  >
                    <option value="">All equipment</option>
                    {equipmentOptions.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Body area"
                    value={filterBody}
                    onChange={(e) => setFilterBody(e.target.value)}
                  >
                    <option value="">All body areas</option>
                    {bodyAreas.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                  <select
                    aria-label="Difficulty"
                    value={filterDifficulty}
                    onChange={(e) => setFilterDifficulty(e.target.value)}
                  >
                    <option value="">All levels</option>
                    {["beginner", "intermediate", "advanced"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="fit-library">
                  {catalog.map((x) => (
                    <details key={x.id}>
                      <summary>
                        {x.name}{" "}
                        <small>
                          {x.equipment} · {x.difficulty}
                        </small>
                      </summary>
                      <button className="secondary" onClick={() => setPreviewExerciseId(previewExerciseId === x.id ? "" : x.id)}>{previewExerciseId === x.id ? "Close preview" : "Preview"}</button>
                      {previewExerciseId === x.id && <Video exercise={x} />}
                      <p>{x.steps.slice(0, 3).join(" ")}</p>
                      <button
                        onClick={() =>
                          updateDraft({
                            exercises: [
                              ...(draft.exercises || []),
                              {
                                id: crypto.randomUUID(),
                                day: selectedDay,
                                position: 0,
                                exercise: x,
                                sets: 3,
                                reps: "10",
                                durationSeconds: null,
                                restSeconds: 60,
                                instructions: "",
                                cues: "",
                                alternative: null,
                              },
                            ],
                          })
                        }
                      >
                        Add to day
                      </button>
                    </details>
                  ))}
                </div>
                <div className="fit-preview">
                  <h3>Audience preview: {draft.title || "Untitled program"}</h3>
                  <p>
                    {draft.summary || "Add a summary to describe this program."}
                  </p>
                  <p>
                    {draft.days.find((d) => d.day === selectedDay)?.label} ·{" "}
                    {draft.minutes} minutes · {draft.level}
                  </p>
                  {draft.exercises
                    ?.filter((x) => x.day === selectedDay)
                    .map((x, i) => (
                      <p key={`${x.id}-${i}`}>
                        {i + 1}. {x.exercise.name} — {x.sets} sets of{" "}
                        {x.durationSeconds
                          ? `${x.durationSeconds} sec`
                          : `${x.reps} reps`}
                        {x.cues ? ` · ${x.cues}` : ""}
                      </p>
                    ))}
                  {!draft.exercises?.some((x) => x.day === selectedDay) && (
                    <p>Add an exercise to preview this day.</p>
                  )}
                </div>
                <div className="fit-actions">
                  <button disabled={busy || draft.reviewStatus === "published"} onClick={saveProgram}>
                    Save draft
                  </button>
                  {draft.id && draft.reviewStatus === "draft" && (
                    <button
                      disabled={busy}
                      onClick={() => statusProgram("pending_review")}
                    >
                      Submit for review
                    </button>
                  )}
                  {draft.id && draft.reviewStatus === "approved" && (
                    <button
                      disabled={busy}
                      onClick={() => statusProgram("published")}
                    >
                      Publish
                    </button>
                  )}
                </div>
              </div>
            )}
            <hr />
            <h2>Challenges</h2>
            <p>Challenges follow the same administrator review gate.</p>
            <label>
              Title
              <input
                value={challengeDraft.title}
                onChange={(e) =>
                  setChallengeDraft({
                    ...challengeDraft,
                    title: e.target.value,
                  })
                }
              />
            </label>
            <label>
              Description
              <textarea
                value={challengeDraft.description}
                onChange={(e) =>
                  setChallengeDraft({
                    ...challengeDraft,
                    description: e.target.value,
                  })
                }
              />
            </label>
            <div className="fit-row">
              <label>
                Start
                <input
                  type="date"
                  value={challengeDraft.startsOn}
                  onChange={(e) =>
                    setChallengeDraft({
                      ...challengeDraft,
                      startsOn: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                End
                <input
                  type="date"
                  value={challengeDraft.endsOn}
                  onChange={(e) =>
                    setChallengeDraft({
                      ...challengeDraft,
                      endsOn: e.target.value,
                    })
                  }
                />
              </label>
            </div>
            <button
              disabled={!draft?.id}
              onClick={() =>
                action(async () => {
                  await api("/studio/challenges", "POST", {
                    programId: draft!.id,
                    ...challengeDraft,
                  });
                  setMessage(
                    "Challenge draft created. Submit it for review in the list below.",
                  );
                })
              }
            >
              Create challenge for selected program
            </button>
            <StudioChallenges />
            <h2>Discussion moderation</h2>
            <StudioPosts />
            {operator && <><hr />
            <h2>Administrator review</h2>
            {review.programs.map((p) => (
              <article className="fit-card" key={p.id}>
                <strong>{p.title}</strong>
                <button onClick={() => reviewItem("program", p.id, "approved")}>
                  Approve
                </button>
                <button
                  className="secondary"
                  onClick={() => reviewItem("program", p.id, "draft")}
                >
                  Return to draft
                </button>
              </article>
            ))}
            {review.challenges.map((c) => (
              <article className="fit-card" key={c.id}>
                <strong>{c.title}</strong>
                <button
                  onClick={() => reviewItem("challenge", c.id, "approved")}
                >
                  Approve
                </button>
              </article>
            ))}
            <hr />
            <h2>Creator access</h2>
            <p>
              Cloudflare Access email identities can edit this fitness
              workspace.
            </p>
            <div className="fit-row">
              <input
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="creator@example.com"
              />
              <button
                onClick={() =>
                  action(async () => {
                    await admin(`/fitness-members/${creator.id}`, "POST", {
                      email: memberEmail,
                    });
                    setMembers(
                      (
                        await admin<{ items: typeof members }>(
                          `/fitness-members/${creator.id}`,
                        )
                      ).items,
                    );
                    setMemberEmail("");
                  })
                }
              >
                Add creator
              </button>
            </div>
            {members.map((m) => (
              <p key={m.email}>
                {m.email}{" "}
                <button
                  className="text"
                  onClick={() =>
                    action(async () => {
                      await admin(
                        `/fitness-members/${creator.id}/${encodeURIComponent(m.email)}`,
                        "DELETE",
                      );
                      setMembers(
                        (
                          await admin<{ items: typeof members }>(
                            `/fitness-members/${creator.id}`,
                          )
                        ).items,
                      );
                    })
                  }
                >
                  Remove
                </button>
              </p>
            ))}</>}
          </section>
        )}
      </main>
      <nav className="fit-nav" aria-label="Fitness navigation">
        <button
          className={screen === "discover" ? "active" : ""}
          onClick={() => setScreen("discover")}
        >
          Discover
        </button>
        <button
          className={screen === "progress" ? "active" : ""}
          onClick={() => setScreen("progress")}
        >
          Progress
        </button>
        <button
          className={screen === "community" ? "active" : ""}
          onClick={() => setScreen("community")}
        >
          Challenges
        </button>
        {studioAllowed && (
          <button
            className={screen === "studio" ? "active" : ""}
            onClick={loadStudio}
          >
            Studio
          </button>
        )}
      </nav>
      <footer className="fit-footer">
        {creator.brand.disclaimer} · Choose easier options or skip movements
        that do not feel right. No guaranteed weight or appearance outcome.
        {!studioAllowed && (
          <> · <a href={`/api/admin/fitness-studio/${encodeURIComponent(slug)}/login${studioTarget ? `?studio=${encodeURIComponent(studioTarget)}` : ""}`}>Creator sign in</a></>
        )}
      </footer>
    </div>
  );
  function StudioChallenges() {
    const [rows, setRows] = useState<
      Array<{ id: string; title: string; review_status: string }>
    >([]);
    useEffect(() => {
      void api<{ items: typeof rows }>("/studio/challenges").then((r) =>
        setRows(r.items),
      );
    }, [message]);
    return (
      <div>
        {rows.map((x) => (
          <p key={x.id}>
            {x.title} · {x.review_status}{" "}
            {x.review_status === "approved" && (
              <button
                onClick={() =>
                  action(async () => {
                    await api(`/studio/challenges/${x.id}/publish`, "POST");
                    setMessage("Challenge published.");
                  })
                }
              >
                Publish
              </button>
            )}
            {x.review_status === "draft" && (
              <button
                onClick={() =>
                  action(async () => {
                    await api(`/studio/challenges/${x.id}/submit`, "POST");
                    setMessage("Challenge submitted for review.");
                  })
                }
              >
                Submit
              </button>
            )}
          </p>
        ))}
      </div>
    );
  }
  function StudioPosts() {
    const [rows, setRows] = useState<
      Array<{ id: string; body: string; status: string }>
    >([]);
    useEffect(() => {
      void api<{ items: typeof rows }>("/studio/posts").then((r) =>
        setRows(r.items),
      );
    }, [message]);
    return (
      <div>
        {rows.map((x) => (
          <article className="fit-card" key={x.id}>
            <p>{x.body}</p>
            <small>{x.status}</small>
            <button
              onClick={() =>
                action(async () => {
                  await api(`/studio/posts/${x.id}/hide`, "POST");
                  setMessage("Post hidden.");
                })
              }
            >
              Hide
            </button>
          </article>
        ))}
      </div>
    );
  }
}
