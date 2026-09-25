import {
  Briefcase,
  Camera,
  Clapperboard,
  ClipboardList,
  Flame,
  Flower2,
  Gift,
  Hand,
  Music,
  PartyPopper,
  Sparkles,
  Speaker,
  Utensils,
  Wine,
  type LucideIcon,
} from "lucide-react";

/** Business types name their icon in the database; this maps the name to the drawing. */
const ICONS: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  camera: Camera,
  clapperboard: Clapperboard,
  "clipboard-list": ClipboardList,
  flame: Flame,
  "flower-2": Flower2,
  gift: Gift,
  hand: Hand,
  music: Music,
  "party-popper": PartyPopper,
  sparkles: Sparkles,
  speaker: Speaker,
  utensils: Utensils,
  wine: Wine,
};

export function BusinessIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Briefcase;
  return <Icon className={className} strokeWidth={1.75} />;
}
