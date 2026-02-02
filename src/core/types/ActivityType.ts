export interface ActivityType {
  id: string;
  name: string;
  color: string;        // Hex color, e.g., "#E53935"
  icon?: string;        // Optional icon identifier
  isDefault: boolean;   // System-provided vs user-created
  sortOrder: number;    // For consistent UI ordering
  createdAt: string;    // ISO 8601 timestamp
  updatedAt: string;
}

export type ActivityTypeId = string;
