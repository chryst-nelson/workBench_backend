import type { UserDocument } from "./user.model.js";

/** The only shape in which a user leaves the API. Never include secrets here. */
export function toPublicUser(user: UserDocument) {
  const p = user.profile ?? {};
  return {
    id: user.id as string,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    status: user.status,
    profile: {
      programmingLanguage: p.programmingLanguage ?? null,
      skillLevel: p.skillLevel ?? null,
      learningGoals: p.learningGoals ?? null,
      weeklyAvailabilityHours: p.weeklyAvailabilityHours ?? null,
      preferredTrack: p.preferredTrack ? String(p.preferredTrack) : null,
    },
    onboardingCompleted: !!(
      p.programmingLanguage &&
      p.skillLevel &&
      p.learningGoals &&
      p.weeklyAvailabilityHours
    ),
    lastLoginAt: user.lastLoginAt ?? null,
    createdAt: user.createdAt,
  };
}
