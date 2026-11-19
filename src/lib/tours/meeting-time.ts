/**
 * When a tour starts, and why it has to be said (20261224).
 *
 * `tours_package_window()` treats an hour tour with no meeting time as taking the
 * whole day. The booking guard then refuses every other tour that date, so a
 * tour missing its time silently blocks its tourists from booking anything else.
 *
 * A day tour really does take the day, so no time is needed. An hour tour always
 * does, and this is where that is decided — once, in TypeScript, next to the SQL
 * it explains. A database CHECK could not carry this rule: it would fail on the
 * packages that are already published without a time.
 */

/** The parts of a package that decide whether it needs a departure time. */
export type TimedPackage = { duration_type?: string | null; duration_value?: number | null };

/** Hours only. A "1 day" tour takes the day whatever the clock says. */
export function needsMeetingTime(pkg: TimedPackage): boolean {
  return pkg.duration_type === "hours";
}

/**
 * What to tell the operator, or null when the package is fine.
 * Written for the person editing the tour, in terms of what guests experience.
 */
export function meetingTimeProblem(pkg: TimedPackage, meetingTime: string | null): string | null {
  if (!needsMeetingTime(pkg)) return null;
  if ((meetingTime ?? "").trim() !== "") return null;
  const hours = Number(pkg.duration_value);
  const length = Number.isFinite(hours) && hours > 0 ? `${hours}-hour` : "hour";
  return (
    `This ${length} tour has no meeting time, so guests see it as all day. ` +
    "They then cannot book any other tour on that date, and your guides can't be scheduled around it. " +
    "Set the time you actually leave."
  );
}

/** "8:00 AM", or "all day" when there is no time — how guests read the tour. */
export function departureText(meetingTime: string | null): string {
  const hhmm = (meetingTime ?? "").slice(0, 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return "all day";
  const h24 = Number(hhmm.slice(0, 2));
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${hhmm.slice(3, 5)} ${h24 < 12 ? "AM" : "PM"}`;
}
