import { z } from "zod";
import type { Creator } from "../shared/types";
import type { Env } from "./db";
import { id, json } from "./db";
import { getAccessEmail, getAdminRole, getFitnessSession } from "./auth";
import { exerciseCatalog, EXERCISE_SOURCE } from "./exerciseCatalog";

const answer = (data: unknown, status = 200, cookie?: string) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...(cookie ? { "Set-Cookie": cookie } : {}),
    },
  });
const error = (message: string, status = 400) =>
  answer({ error: message }, status);
const text = z.string().trim();
const day = z.number().int().min(1).max(7);
const exerciseInput = z.object({
  exerciseId: text.min(1).max(100),
  sets: z.number().int().min(1).max(20).default(3),
  reps: text.max(40).default("10"),
  durationSeconds: z.number().int().min(0).max(3600).nullable().default(null),
  restSeconds: z.number().int().min(0).max(600).default(60),
  instructions: text.max(1000).default(""),
  cues: text.max(500).default(""),
  alternativeExerciseId: text.max(100).nullable().default(null),
});
const programInput = z.object({
  title: text.min(3).max(120),
  summary: text.min(10).max(1000),
  goal: text.min(2).max(80),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  equipment: z.array(text.max(40)).max(13),
  limitations: text.max(500).default(""),
  minutes: z.number().int().min(5).max(180),
  days: z
    .array(
      z.object({
        day: day,
        label: text.min(2).max(80),
        exercises: z.array(exerciseInput).min(1).max(20),
      }),
    )
    .min(1)
    .max(7),
  followupText: text.max(300).default(""),
  accessTier: z.enum(["free", "premium"]).default("free"),
});
const profileInput = z.object({
  goal: text.max(80).default(""),
  level: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  equipment: z.array(text.max(40)).max(13).default([]),
  days: z.array(day).max(7).default([]),
  minutes: z.number().int().min(5).max(180).default(30),
  limitations: text.max(500).default(""),
  adult: z.boolean().nullable().default(null),
  heightCm: z.number().min(90).max(240).nullable().default(null),
  currentKg: z.number().min(25).max(350).nullable().default(null),
  targetKg: z.number().min(25).max(350).nullable().default(null),
});
const reminderInput = z.object({
  enabled: z.boolean(),
  days: z.array(day).max(7),
  hour: z.number().int().min(0).max(23),
  quietStart: z.number().int().min(0).max(23),
  quietEnd: z.number().int().min(0).max(23),
  followups: z.boolean(),
  timezone: text
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
});
const challengeInput = z.object({
  programId: z.string().uuid(),
  title: text.min(3).max(100),
  description: text.min(5).max(600),
  startsOn: z.iso.date(),
  endsOn: z.iso.date(),
});
const parse = async (request: Request) => {
  if (Number(request.headers.get("content-length") || 0) > 32768)
    throw new Error("Request too large");
  return request.json();
};
const creatorAccess = async (request: Request, env: Env, creatorId: string) => {
  if (env.APP_ENV === "local") {
    const role = await getAdminRole(request, env);
    if (role === "owner" || role === "operator") return true;
  }
  const email = await getAccessEmail(request, env);
  if (!email) return false;
  const member = await env.DB.prepare(
    "SELECT 1 FROM fitness_creator_members WHERE creator_id=? AND email=?",
  )
    .bind(creatorId, email)
    .first();
  if (member) return true;
  const admin = await env.DB.prepare("SELECT role FROM admin_users WHERE email=?").bind(email).first<{ role: string }>();
  return admin?.role === "owner" || admin?.role === "operator";
};
const rowProgram = (row: Record<string, unknown>) => ({
  id: row.id,
  creatorId: row.creator_id,
  title: row.title,
  summary: row.summary,
  goal: row.goal,
  level: row.level,
  equipment: json(row.equipment_json as string),
  limitations: row.limitations,
  minutes: row.minutes,
  days: json(row.days_json as string),
  followupText: row.followup_text,
  accessTier: row.access_tier,
  reviewStatus: row.review_status,
});
async function programs(env: Env, creatorId: string, publishedOnly: boolean) {
  const rows = await env.DB.prepare(
    `SELECT * FROM fitness_programs WHERE creator_id=? ${publishedOnly ? "AND review_status='published'" : ""} ORDER BY updated_at DESC`,
  )
    .bind(creatorId)
    .all<Record<string, unknown>>();
  return rows.results.map(rowProgram);
}
async function items(env: Env, creatorId: string, programId: string) {
  const rows = await env.DB.prepare(
    "SELECT * FROM fitness_program_exercises WHERE creator_id=? AND program_id=? ORDER BY day_number,position",
  )
    .bind(creatorId, programId)
    .all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    id: row.id,
    day: row.day_number,
    position: row.position,
    exercise: exerciseCatalog.get(row.exercise_id as string),
    sets: row.sets,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    restSeconds: row.rest_seconds,
    instructions: row.instructions,
    cues: row.cues,
    alternative: row.alternative_exercise_id
      ? exerciseCatalog.get(row.alternative_exercise_id as string)
      : null,
  }));
}
async function visibleProgram(
  env: Env,
  creatorId: string,
  programId: string,
  userId?: string,
) {
  const row = await env.DB.prepare(
    "SELECT * FROM fitness_programs WHERE id=? AND creator_id=? AND review_status='published'",
  )
    .bind(programId, creatorId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  if (row.access_tier === "premium") {
    if (!userId) return null;
    const grant = await env.DB.prepare(
      "SELECT 1 FROM fitness_entitlements WHERE creator_id=? AND user_id=? AND code='premium' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)",
    )
      .bind(creatorId, userId)
      .first();
    if (!grant) return null;
  }
  return rowProgram(row);
}
export async function fitnessRoute(
  request: Request,
  env: Env,
  creator: Creator,
  slug: string,
  path: string[],
): Promise<Response> {
  if (creator.category !== "fitness")
    return error("Fitness is unavailable for this creator", 404);
  const query = new URL(request.url).searchParams;
  if (request.method === "GET" && path[0] === "catalog") {
    if (path[1]) {
      const exercise = exerciseCatalog.get(path[1]);
      return exercise ? answer(exercise) : error("Exercise not found", 404);
    }
    return answer({
      items: exerciseCatalog.list({
        search: query.get("search") || "",
        equipment: query.get("equipment") || "",
        bodyPart: query.get("bodyPart") || "",
        difficulty: query.get("difficulty") || "",
        limit: Number(query.get("limit") || 60),
      }),
    });
  }
  if (path[0] === "studio") {
    if (!(await creatorAccess(request, env, creator.id)))
      return error("Creator access required", 403);
    if (request.method === "GET" && path[1] === "login") {
      const destination = new URL(`/creator/${slug}`, request.url);
      const studioTarget = query.get("studio");
      if (studioTarget && (studioTarget === "new" || studioTarget === "challenges" || z.uuid().safeParse(studioTarget).success))
        destination.searchParams.set("studio", studioTarget);
      return Response.redirect(destination, 302);
    }
    if (request.method === "GET" && path[1] === "programs")
      return answer({ items: await programs(env, creator.id, false) });
    if (request.method === "GET" && path[1] === "program" && path[2]) {
      const row = await env.DB.prepare(
        "SELECT * FROM fitness_programs WHERE creator_id=? AND id=?",
      )
        .bind(creator.id, path[2])
        .first<Record<string, unknown>>();
      return row
        ? answer({
            ...rowProgram(row),
            exercises: await items(env, creator.id, path[2]),
          })
        : error("Program not found", 404);
    }
    if (
      ((request.method === "POST" && path.length === 2) ||
        (request.method === "PUT" && path.length === 3)) &&
      path[1] === "programs"
    ) {
      const input = programInput.parse(await parse(request));
      if (new Set(input.days.map((d) => d.day)).size !== input.days.length)
        return error("Days must be unique", 422);
      for (const d of input.days)
        for (const item of d.exercises) {
          if (
            !exerciseCatalog.get(item.exerciseId) ||
            (item.alternativeExerciseId &&
              !exerciseCatalog.get(item.alternativeExerciseId))
          )
            return error("Exercise is not in the shared catalog", 422);
        }
      const programId = request.method === "PUT" ? path[2] : id();
      if (!programId) return error("Program ID required", 422);
      const old = await env.DB.prepare(
        "SELECT review_status FROM fitness_programs WHERE creator_id=? AND id=?",
      )
        .bind(creator.id, programId)
        .first<{ review_status: string }>();
      if (request.method === "PUT" && !old)
        return error("Program not found", 404);
      if (old?.review_status === "published")
        return error("Unpublish before editing", 409);
      const statements = [
        env.DB.prepare(
          "INSERT INTO fitness_programs(id,creator_id,title,summary,goal,level,equipment_json,limitations,minutes,days_json,followup_text,access_tier,review_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,'draft') ON CONFLICT(id) DO UPDATE SET title=excluded.title,summary=excluded.summary,goal=excluded.goal,level=excluded.level,equipment_json=excluded.equipment_json,limitations=excluded.limitations,minutes=excluded.minutes,days_json=excluded.days_json,followup_text=excluded.followup_text,access_tier=excluded.access_tier,review_status='draft',updated_at=CURRENT_TIMESTAMP WHERE creator_id=excluded.creator_id",
        ).bind(
          programId,
          creator.id,
          input.title,
          input.summary,
          input.goal,
          input.level,
          JSON.stringify(input.equipment),
          input.limitations,
          input.minutes,
          JSON.stringify(
            input.days.map(({ day: dayNumber, label }) => ({
              day: dayNumber,
              label,
            })),
          ),
          input.followupText,
          input.accessTier,
        ),
      ];
      if (old)
        statements.push(
          env.DB.prepare(
            "DELETE FROM fitness_program_exercises WHERE creator_id=? AND program_id=?",
          ).bind(creator.id, programId),
        );
      for (const d of input.days)
        for (const [position, item] of d.exercises.entries())
          statements.push(
            env.DB.prepare(
              "INSERT INTO fitness_program_exercises(id,creator_id,program_id,day_number,position,exercise_source,exercise_id,sets,reps,duration_seconds,rest_seconds,instructions,cues,alternative_exercise_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            ).bind(
              id(),
              creator.id,
              programId,
              d.day,
              position,
              EXERCISE_SOURCE,
              item.exerciseId,
              item.sets,
              item.reps,
              item.durationSeconds,
              item.restSeconds,
              item.instructions,
              item.cues,
              item.alternativeExerciseId,
            ),
          );
      await env.DB.batch(statements);
      return answer({ id: programId, reviewStatus: "draft" }, old ? 200 : 201);
    }
    if (
      request.method === "POST" &&
      path[1] === "programs" &&
      path[2] &&
      path[3] === "status"
    ) {
      const input = z
        .object({ status: z.enum(["draft", "pending_review", "published"]) })
        .parse(await parse(request));
      const row = await env.DB.prepare(
        "SELECT review_status FROM fitness_programs WHERE creator_id=? AND id=?",
      )
        .bind(creator.id, path[2])
        .first<{ review_status: string }>();
      if (!row) return error("Program not found", 404);
      if (input.status === "published" && row.review_status !== "approved")
        return error("Administrator review required", 409);
      if (input.status === "pending_review" && row.review_status !== "draft")
        return error("Only a draft can be submitted", 409);
      if (input.status === "draft" && row.review_status === "published")
        return error("Use unpublish", 409);
      await env.DB.prepare(
        "UPDATE fitness_programs SET review_status=?,updated_at=CURRENT_TIMESTAMP WHERE creator_id=? AND id=?",
      )
        .bind(input.status, creator.id, path[2])
        .run();
      return answer({ status: input.status });
    }
    if (
      request.method === "POST" &&
      path[1] === "programs" &&
      path[2] &&
      path[3] === "unpublish"
    ) {
      const result = await env.DB.prepare(
        "UPDATE fitness_programs SET review_status='draft' WHERE creator_id=? AND id=? AND review_status='published'",
      )
        .bind(creator.id, path[2])
        .run();
      return result.meta.changes
        ? answer({ status: "draft" })
        : error("Published program not found", 404);
    }
    if (request.method === "GET" && path[1] === "posts") {
      const rows = await env.DB.prepare(
        "SELECT p.id,p.program_id,p.body,p.status,p.created_at FROM fitness_posts p WHERE p.creator_id=? AND p.status IN ('visible','reported') ORDER BY p.created_at DESC LIMIT 100",
      )
        .bind(creator.id)
        .all();
      return answer({ items: rows.results });
    }
    if (
      request.method === "POST" &&
      path[1] === "posts" &&
      path[2] &&
      path[3] === "hide"
    ) {
      const result = await env.DB.prepare(
        "UPDATE fitness_posts SET status='hidden' WHERE creator_id=? AND id=?",
      )
        .bind(creator.id, path[2])
        .run();
      return result.meta.changes
        ? answer({ ok: true })
        : error("Post not found", 404);
    }
    if (request.method === "POST" && path[1] === "challenges" && path.length === 2) {
      const input = challengeInput.parse(await parse(request));
      if (input.endsOn < input.startsOn)
        return error("End date precedes start date", 422);
      const parent = await env.DB.prepare(
        "SELECT 1 FROM fitness_programs WHERE creator_id=? AND id=?",
      )
        .bind(creator.id, input.programId)
        .first();
      if (!parent) return error("Program not found", 404);
      const challengeId = id();
      await env.DB.prepare(
        "INSERT INTO fitness_challenges(id,creator_id,program_id,title,description,starts_on,ends_on) VALUES(?,?,?,?,?,?,?)",
      )
        .bind(
          challengeId,
          creator.id,
          input.programId,
          input.title,
          input.description,
          input.startsOn,
          input.endsOn,
        )
        .run();
      return answer({ id: challengeId, reviewStatus: "draft" }, 201);
    }
    if (request.method === "GET" && path[1] === "challenges") {
      const rows = await env.DB.prepare(
        "SELECT * FROM fitness_challenges WHERE creator_id=? ORDER BY starts_on DESC",
      )
        .bind(creator.id)
        .all();
      return answer({ items: rows.results });
    }
    if (
      request.method === "POST" &&
      path[1] === "challenges" &&
      path[2] &&
      path[3] === "publish"
    ) {
      const result = await env.DB.prepare(
        "UPDATE fitness_challenges SET review_status='published' WHERE creator_id=? AND id=? AND review_status='approved' AND program_id IN (SELECT id FROM fitness_programs WHERE creator_id=? AND review_status='published')",
      )
        .bind(creator.id, path[2], creator.id)
        .run();
      return result.meta.changes
        ? answer({ status: "published" })
        : error("Review and published program required", 409);
    }
    if (
      request.method === "POST" &&
      path[1] === "challenges" &&
      path[2] &&
      path[3] === "submit"
    ) {
      const result = await env.DB.prepare(
        "UPDATE fitness_challenges SET review_status='pending_review' WHERE creator_id=? AND id=? AND review_status='draft'",
      )
        .bind(creator.id, path[2])
        .run();
      return result.meta.changes
        ? answer({ status: "pending_review" })
        : error("Draft challenge not found", 404);
    }
  }
  const session = await getFitnessSession(request, env, creator.id, slug);
  const respond = (data: unknown, status = 200) =>
    answer(data, status, session.cookie);
  if (request.method === "GET" && path[0] === "profile") {
    const row = await env.DB.prepare(
      "SELECT profile_json FROM fitness_profiles WHERE creator_id=? AND user_id=?",
    )
      .bind(creator.id, session.userId)
      .first<{ profile_json: string }>();
    return respond({ profile: row ? json(row.profile_json) : null });
  }
  if (request.method === "PUT" && path[0] === "profile") {
    const input = profileInput.parse(await parse(request));
    const safe = {
      ...input,
      heightCm: input.adult === true ? input.heightCm : null,
      currentKg: input.adult === true ? input.currentKg : null,
      targetKg: input.adult === true ? input.targetKg : null,
    };
    await env.DB.prepare(
      "INSERT INTO fitness_profiles(creator_id,user_id,profile_json) VALUES(?,?,?) ON CONFLICT(creator_id,user_id) DO UPDATE SET profile_json=excluded.profile_json,updated_at=CURRENT_TIMESTAMP",
    )
      .bind(creator.id, session.userId, JSON.stringify(safe))
      .run();
    return respond({ profile: safe });
  }
  if (request.method === "DELETE" && path[0] === "profile") {
    await env.DB.prepare(
      "DELETE FROM fitness_profiles WHERE creator_id=? AND user_id=?",
    )
      .bind(creator.id, session.userId)
      .run();
    return respond({ profile: null });
  }
  if (request.method === "GET" && path[0] === "programs" && !path[1]) {
    const all = await programs(env, creator.id, true);
    const grants = await env.DB.prepare(
      "SELECT 1 FROM fitness_entitlements WHERE creator_id=? AND user_id=? AND code='premium' AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)",
    )
      .bind(creator.id, session.userId)
      .first();
    const profile = await env.DB.prepare(
      "SELECT profile_json FROM fitness_profiles WHERE creator_id=? AND user_id=?",
    )
      .bind(creator.id, session.userId)
      .first<{ profile_json: string }>();
    const p = profile ? profileInput.parse(json(profile.profile_json)) : null;
    const scored = all.map((program) => {
      const reasons: string[] = [];
      let score = 0;
      const goal =
        p?.goal.toLowerCase() === "abs"
          ? "core-strength"
          : p?.goal.toLowerCase();
      if (goal && String(program.goal).toLowerCase() === goal) {
        score += 6;
        reasons.push("matches your goal");
      }
      if (p?.level && program.level === p.level) {
        score += 4;
        reasons.push("matches your experience");
      }
      if (
        p &&
        (program.equipment as string[]).every(
          (x) => x === "body weight" || p.equipment.includes(x),
        )
      ) {
        score += 3;
        reasons.push("fits your equipment");
      } else if (p) {
        score -= 8;
        reasons.push("needs equipment you did not list");
      }
      if (p && Number(program.minutes) <= p.minutes) {
        score += 2;
        reasons.push("fits your time");
      }
      if (
        p &&
        (program.days as Array<{ day: number }>).some((d) =>
          p.days.includes(d.day),
        )
      ) {
        score += 1;
        reasons.push("fits a preferred day");
      }
      if (p?.limitations) {
        score -= program.limitations ? 1 : 4;
        reasons.push(
          program.limitations
            ? "review creator adaptations for your limitations"
            : "no adaptations listed; review movements before starting",
        );
      }
      return {
        ...program,
        locked: program.accessTier === "premium" && !grants,
        score,
        reasons,
      };
    });
    return respond({
      items: scored.sort(
        (a, b) =>
          b.score - a.score || String(a.title).localeCompare(String(b.title)),
      ),
    });
  }
  if (request.method === "GET" && path[0] === "programs" && path[1]) {
    const program = await visibleProgram(
      env,
      creator.id,
      path[1],
      session.userId,
    );
    return program
      ? respond({
          ...program,
          exercises: await items(env, creator.id, path[1]),
        })
      : error("Program unavailable", 404);
  }
  if (request.method === "GET" && path[0] === "progress") {
    const rows = await env.DB.prepare(
      "SELECT program_id,day_number,workout_date,completed_at,skipped_json,discomfort_json FROM fitness_workouts WHERE creator_id=? AND user_id=? ORDER BY completed_at DESC LIMIT 100",
    )
      .bind(creator.id, session.userId)
      .all<Record<string, unknown>>();
    return respond({
      items: rows.results.map((row) => ({
        ...row,
        skipped: json(row.skipped_json as string),
        discomfort: json(row.discomfort_json as string),
      })),
      total: rows.results.length,
    });
  }
  if (request.method === "POST" && path[0] === "complete") {
    const input = z
      .object({
        programId: z.string().uuid(),
        day: day,
        skipped: z.array(z.string().uuid()).max(20).default([]),
        discomfort: z.array(z.string().uuid()).max(20).default([]),
        date: z.iso.date(),
      })
      .parse(await parse(request));
    const program = await visibleProgram(
      env,
      creator.id,
      input.programId,
      session.userId,
    );
    if (
      !program ||
      !(program.days as Array<{ day: number }>).some((d) => d.day === input.day)
    )
      return error("Workout unavailable", 404);
    if (input.date > new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
      return error("Future completion not allowed", 422);
    await env.DB.prepare(
      "INSERT INTO fitness_workouts(creator_id,user_id,program_id,day_number,workout_date,skipped_json,discomfort_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(creator_id,user_id,program_id,day_number,workout_date) DO UPDATE SET skipped_json=excluded.skipped_json,discomfort_json=excluded.discomfort_json",
    )
      .bind(
        creator.id,
        session.userId,
        input.programId,
        input.day,
        input.date,
        JSON.stringify(input.skipped),
        JSON.stringify(input.discomfort),
      )
      .run();
    return respond({ ok: true });
  }
  if (request.method === "GET" && path[0] === "reminders") {
    const row = await env.DB.prepare(
      "SELECT * FROM fitness_reminders WHERE creator_id=? AND user_id=?",
    )
      .bind(creator.id, session.userId)
      .first<Record<string, unknown>>();
    return respond({
      reminder: row
        ? {
            enabled: !!row.enabled,
            days: json(row.days_json as string),
            hour: row.hour,
            quietStart: row.quiet_start,
            quietEnd: row.quiet_end,
            followups: !!row.followups,
            timezone: row.timezone,
          }
        : null,
    });
  }
  if (request.method === "PUT" && path[0] === "reminders") {
    const input = reminderInput.parse(await parse(request));
    await env.DB.prepare(
      "INSERT INTO fitness_reminders(creator_id,user_id,enabled,days_json,hour,quiet_start,quiet_end,followups,timezone) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(creator_id,user_id) DO UPDATE SET enabled=excluded.enabled,days_json=excluded.days_json,hour=excluded.hour,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end,followups=excluded.followups,timezone=excluded.timezone",
    )
      .bind(
        creator.id,
        session.userId,
        Number(input.enabled),
        JSON.stringify(input.days),
        input.hour,
        input.quietStart,
        input.quietEnd,
        Number(input.followups),
        input.timezone,
      )
      .run();
    return respond({ reminder: input });
  }
  if (request.method === "GET" && path[0] === "challenges") {
    const rows = await env.DB.prepare(
      "SELECT c.id,c.program_id,c.title,c.description,c.starts_on,c.ends_on,CASE WHEN m.user_id IS NULL THEN 0 ELSE 1 END joined FROM fitness_challenges c JOIN fitness_programs p ON p.id=c.program_id AND p.creator_id=c.creator_id AND p.review_status='published' LEFT JOIN fitness_challenge_members m ON m.creator_id=c.creator_id AND m.challenge_id=c.id AND m.user_id=? WHERE c.creator_id=? AND c.review_status='published' ORDER BY c.starts_on DESC",
    )
      .bind(session.userId, creator.id)
      .all<Record<string, unknown>>();
    return respond({ items: rows.results });
  }
  if (
    request.method === "POST" &&
    path[0] === "challenges" &&
    path[1] &&
    path[2] === "join"
  ) {
    const row = await env.DB.prepare(
      "SELECT c.program_id FROM fitness_challenges c WHERE c.creator_id=? AND c.id=? AND c.review_status='published' AND c.ends_on>=date('now')",
    )
      .bind(creator.id, path[1])
      .first<{ program_id: string }>();
    if (
      !row ||
      !(await visibleProgram(env, creator.id, row.program_id, session.userId))
    )
      return error("Challenge unavailable", 404);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO fitness_challenge_members(creator_id,challenge_id,user_id) VALUES(?,?,?)",
    )
      .bind(creator.id, path[1], session.userId)
      .run();
    return respond({ joined: true });
  }
  if (request.method === "GET" && path[0] === "posts" && path[1]) {
    if (!(await visibleProgram(env, creator.id, path[1], session.userId)))
      return error("Program unavailable", 404);
    const rows = await env.DB.prepare(
      "SELECT id,body,created_at FROM fitness_posts WHERE creator_id=? AND program_id=? AND status='visible' ORDER BY created_at DESC LIMIT 50",
    )
      .bind(creator.id, path[1])
      .all();
    return respond({ items: rows.results });
  }
  if (request.method === "POST" && path[0] === "posts" && path[1] && !path[2]) {
    if (!(await visibleProgram(env, creator.id, path[1], session.userId)))
      return error("Program unavailable", 404);
    const input = z
      .object({ body: text.min(2).max(500) })
      .parse(await parse(request));
    const recent = await env.DB.prepare(
      "SELECT COUNT(*) count FROM fitness_posts WHERE creator_id=? AND user_id=? AND created_at>datetime('now','-1 hour')",
    )
      .bind(creator.id, session.userId)
      .first<{ count: number }>();
    if ((recent?.count || 0) >= 5) return error("Posting limit reached", 429);
    const postId = id();
    await env.DB.prepare(
      "INSERT INTO fitness_posts(id,creator_id,program_id,user_id,body) VALUES(?,?,?,?,?)",
    )
      .bind(postId, creator.id, path[1], session.userId, input.body)
      .run();
    return respond({ id: postId }, 201);
  }
  if (
    request.method === "POST" &&
    path[0] === "posts" &&
    path[1] &&
    path[2] === "report"
  ) {
    const result = await env.DB.prepare(
      "UPDATE fitness_posts SET status='reported' WHERE creator_id=? AND id=? AND status='visible'",
    )
      .bind(creator.id, path[1])
      .run();
    return result.meta.changes
      ? respond({ reported: true })
      : error("Post not found", 404);
  }
  return error("Fitness route not found", 404);
}

export async function fitnessAdminRoute(
  request: Request,
  env: Env,
  path: string[],
): Promise<Response> {
  const creatorId = path[1];
  if (!creatorId) return error("Creator required");
  const tenant = await env.DB.prepare(
    "SELECT id FROM creators WHERE id=? AND category='fitness'",
  )
    .bind(creatorId)
    .first();
  if (!tenant) return error("Fitness creator not found", 404);
  if (path[0] === "fitness-summary" && request.method === "GET") {
    const workouts = await env.DB.prepare(
      "SELECT COUNT(*) completions, COUNT(DISTINCT user_id) participants FROM fitness_workouts WHERE creator_id=?",
    ).bind(creatorId).first<{ completions: number; participants: number }>();
    return answer({ completions: workouts?.completions || 0, participants: workouts?.participants || 0 });
  }
  if (path[0] === "fitness-members") {
    if (request.method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT email FROM fitness_creator_members WHERE creator_id=? ORDER BY email",
      )
        .bind(creatorId)
        .all();
      return answer({ items: rows.results });
    }
    if (request.method === "POST") {
      const input = z.object({ email: z.email() }).parse(await parse(request));
      await env.DB.prepare(
        "INSERT OR IGNORE INTO fitness_creator_members(creator_id,email) VALUES(?,?)",
      )
        .bind(creatorId, input.email.toLowerCase())
        .run();
      return answer({ ok: true });
    }
    if (request.method === "DELETE" && path[2]) {
      await env.DB.prepare(
        "DELETE FROM fitness_creator_members WHERE creator_id=? AND email=?",
      )
        .bind(creatorId, decodeURIComponent(path[2]).toLowerCase())
        .run();
      return answer({ ok: true });
    }
  }
  if (path[0] === "fitness-review" && request.method === "GET") {
    const programs = await env.DB.prepare(
      "SELECT id,title,summary,review_status FROM fitness_programs WHERE creator_id=? AND review_status='pending_review'",
    )
      .bind(creatorId)
      .all();
    const challenges = await env.DB.prepare(
      "SELECT id,title,description,review_status FROM fitness_challenges WHERE creator_id=? AND review_status='pending_review'",
    )
      .bind(creatorId)
      .all();
    return answer({
      programs: programs.results,
      challenges: challenges.results,
    });
  }
  if (
    path[0] === "fitness-review" &&
    request.method === "POST" &&
    path[2] &&
    path[3]
  ) {
    const status = z
      .enum(["approved", "draft"])
      .parse(((await parse(request)) as { status: string }).status);
    const table =
      path[2] === "program"
        ? "fitness_programs"
        : path[2] === "challenge"
          ? "fitness_challenges"
          : null;
    if (!table) return error("Review type not found", 404);
    const result = await env.DB.prepare(
      `UPDATE ${table} SET review_status=? WHERE creator_id=? AND id=? AND review_status='pending_review'`,
    )
      .bind(status, creatorId, path[3])
      .run();
    return result.meta.changes
      ? answer({ status })
      : error("Pending review not found", 404);
  }
  return error("Admin fitness route not found", 404);
}
