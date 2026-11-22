/**
 * The icons a service can use, with the words shown in the Services editor.
 * Kept apart from service-icon.tsx so server code can validate a choice
 * without loading the icon components. Must match the keys in that file.
 */
export const SERVICE_ICON_NAMES = [
  "Wrench",
  "Flame",
  "Thermometer",
  "Bathtub",
  "Lightning",
  "Wall",
  "Buildings",
  "HouseLine",
] as const;

export type ServiceIconChoice = (typeof SERVICE_ICON_NAMES)[number];

export const SERVICE_ICON_LABELS: Record<ServiceIconChoice, string> = {
  Wrench: "Spanner (repairs)",
  Flame: "Flame (gas and boilers)",
  Thermometer: "Thermometer (heating)",
  Bathtub: "Bath (bathrooms and kitchens)",
  Lightning: "Lightning (electrical)",
  Wall: "Brick wall (building)",
  Buildings: "Buildings (property)",
  HouseLine: "House (extensions)",
};
