import {
  BathtubIcon,
  BuildingsIcon,
  FlameIcon,
  HouseLineIcon,
  LightningIcon,
  ThermometerIcon,
  WallIcon,
  WrenchIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { ComponentType } from "react";

/**
 * Service icons.
 *
 * Phosphor rather than Lucide or Feather — those two are the default of every
 * generated interface, and Phosphor's duotone weight gives the service cards a
 * second visual register without a second colour.
 *
 * An explicit map, not a dynamic lookup: this way the bundler only ships the
 * eight icons actually used, and an unknown name is a type error at build time
 * rather than a blank square in production.
 */

type IconComponent = ComponentType<{
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

const icons = {
  Wrench: WrenchIcon,
  Flame: FlameIcon,
  Thermometer: ThermometerIcon,
  Bathtub: BathtubIcon,
  Lightning: LightningIcon,
  Wall: WallIcon,
  Buildings: BuildingsIcon,
  HouseLine: HouseLineIcon,
} satisfies Record<string, IconComponent>;

export type ServiceIconName = keyof typeof icons;

export function ServiceIcon({
  name,
  size = 26,
  weight = "duotone",
  className,
}: {
  name: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
  className?: string;
}) {
  const Icon = icons[name as ServiceIconName] ?? WrenchIcon;

  return <Icon size={size} weight={weight} className={className} aria-hidden="true" />;
}
