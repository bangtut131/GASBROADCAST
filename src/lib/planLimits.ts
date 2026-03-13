export const PLAN_LIMITS = {
    free: {
        devices: 1,
        broadcasts: 5,
        contacts: 500,
        team_members: 1, // Usually includes the owner, meaning no extra agents
    },
    starter: {
        devices: 3,
        broadcasts: 50,
        contacts: 5000,
        team_members: 3,
    },
    pro: {
        devices: 10,
        broadcasts: -1, // -1 means unlimited
        contacts: 50000,
        team_members: 10,
    },
    enterprise: {
        devices: -1,
        broadcasts: -1,
        contacts: -1,
        team_members: -1,
    }
} as const;

export type PlanType = keyof typeof PLAN_LIMITS;

export function hasReachedLimit(currentCount: number, limit: number): boolean {
    if (limit === -1) return false; // unlimited
    return currentCount >= limit;
}
