import source from "./data/exercises.json";

export const EXERCISE_SOURCE = "harshvishu/free-exercise-db-with-videos";
export const EXERCISE_SOURCE_URL =
  "https://github.com/harshvishu/free-exercise-db-with-videos";
// Owner confirmed use of source-hosted demonstration videos in this app on
// 2026-09-25. See docs/FITNESS_MEDIA_POLICY.md; no bulk rehosting is implied.
export type Exercise = (typeof source)[number] & {
  source: string;
  sourceUrl: string;
};
export interface ExerciseCatalog {
  get(id: string): Exercise | undefined;
  list(filters: {
    search?: string;
    equipment?: string;
    bodyPart?: string;
    difficulty?: string;
    limit?: number;
  }): Exercise[];
}
const rows = source as typeof source;
const byId = new Map(rows.map((row) => [row.id, row]));
const withSource = (row: (typeof rows)[number]): Exercise => ({
  ...row,
  source: EXERCISE_SOURCE,
  sourceUrl: EXERCISE_SOURCE_URL,
});
export const exerciseCatalog: ExerciseCatalog = {
  get(id) {
    const row = byId.get(id);
    return row ? withSource(row) : undefined;
  },
  list(filters) {
    const search = filters.search?.trim().toLowerCase() || "";
    return rows
      .filter(
        (row) =>
          (!search ||
            `${row.name} ${row.aliases.join(" ")} ${row.target}`
              .toLowerCase()
              .includes(search)) &&
          (!filters.equipment || row.equipment === filters.equipment) &&
          (!filters.bodyPart || row.bodyPart === filters.bodyPart) &&
          (!filters.difficulty || row.difficulty === filters.difficulty),
      )
      .sort((a, b) => {
        const priority = (row: (typeof rows)[number]) =>
          (row.difficulty === "beginner" ? 4 : 0) +
          (row.equipment === "body weight"
            ? 4
            : row.equipment === "band"
              ? 2
              : 0);
        return priority(b) - priority(a) || a.name.localeCompare(b.name);
      })
      .slice(0, Math.min(filters.limit || 60, 317))
      .map(withSource);
  },
};
