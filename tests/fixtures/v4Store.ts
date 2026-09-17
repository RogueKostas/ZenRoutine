/**
 * A schema-4 store exactly as `main` @ 9c8fcd0 left it in AsyncStorage under
 * `zenroutine-storage`, before #44 added `preferences`: zustand's `{ state, version }` envelope
 * around `selectPersistedAppState`'s keys, in that function's order, with `lastSyncedAt: undefined`
 * dropped by JSON.stringify.
 *
 * Kept as the raw string rather than built with the test builders, which now produce the v5 shape.
 * It covers every field a v4 store can hold: a Sunday (0) and a Monday (1) block, the per-activity
 * capacity map, a goal with progress, a goal-linked routine entry, and a timer still running.
 */
export const V4_STORE_BLOB = `{
  "state": {
    "activityTypes": [
      {
        "id": "activity-work",
        "name": "Work",
        "color": "#E53935",
        "icon": "💼",
        "isDefault": true,
        "sortOrder": 0,
        "createdAt": "2026-09-01T08:00:00.000Z",
        "updatedAt": "2026-09-01T08:00:00.000Z"
      },
      {
        "id": "activity-family",
        "name": "Family Time",
        "color": "#43A047",
        "icon": "👥",
        "isDefault": true,
        "sortOrder": 1,
        "createdAt": "2026-09-01T08:00:00.000Z",
        "updatedAt": "2026-09-01T08:00:00.000Z"
      }
    ],
    "goals": [
      {
        "id": "goal-report",
        "name": "Finish the quarterly report",
        "description": "",
        "estimatedMinutes": 600,
        "loggedMinutes": 90,
        "activityTypeId": "activity-work",
        "status": "active",
        "priority": 2,
        "createdAt": "2026-09-02T08:00:00.000Z",
        "updatedAt": "2026-09-14T10:30:00.000Z"
      }
    ],
    "routines": [
      {
        "id": "routine-week",
        "name": "My Week",
        "isActive": true,
        "blocks": [
          {
            "id": "block-sunday-family",
            "dayOfWeek": 0,
            "startMinutes": 600,
            "endMinutes": 780,
            "activityTypeId": "activity-family"
          },
          {
            "id": "block-monday-work",
            "dayOfWeek": 1,
            "startMinutes": 540,
            "endMinutes": 1020,
            "activityTypeId": "activity-work"
          },
          {
            "id": "block-saturday-late",
            "dayOfWeek": 6,
            "startMinutes": 1380,
            "endMinutes": 60,
            "activityTypeId": "activity-family"
          }
        ],
        "capacityChangedAt": {
          "activity-family": "2026-09-01T08:05:00.000Z",
          "activity-work": "2026-09-01T08:10:00.000Z"
        },
        "createdAt": "2026-09-01T08:00:00.000Z",
        "updatedAt": "2026-09-01T08:10:00.000Z"
      }
    ],
    "trackingEntries": [
      {
        "id": "entry-monday",
        "date": "2026-09-14",
        "startTime": "2026-09-14T09:00:00.000Z",
        "endTime": "2026-09-14T10:30:00.000Z",
        "activityTypeId": "activity-work",
        "goalId": "goal-report",
        "routineBlockId": "block-monday-work",
        "source": "scheduled",
        "createdAt": "2026-09-14T09:00:00.000Z",
        "updatedAt": "2026-09-14T10:30:00.000Z"
      },
      {
        "id": "entry-running",
        "date": "2026-09-17",
        "startTime": "2026-09-17T08:00:00.000Z",
        "activityTypeId": "activity-work",
        "source": "manual",
        "notes": "Still going",
        "createdAt": "2026-09-17T08:00:00.000Z",
        "updatedAt": "2026-09-17T08:00:00.000Z"
      }
    ],
    "activeRoutineId": "routine-week",
    "currentTrackingEntryId": "entry-running",
    "hasCompletedOnboarding": true,
    "schemaVersion": 4
  },
  "version": 4
}`;

/** The `state` inside `V4_STORE_BLOB`, parsed fresh on every call. */
export function v4PersistedState(): Record<string, unknown> {
  return (JSON.parse(V4_STORE_BLOB) as { state: Record<string, unknown> }).state;
}
