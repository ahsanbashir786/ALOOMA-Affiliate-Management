// One picture for each idea, used everywhere, so a screen can be read without reading.
import {
  Ban, BellRing, CalendarClock, Check, Clapperboard, Flame, Gift, GraduationCap, Hourglass, Megaphone, MoonStar, Package, PackageCheck, PackageOpen,
  Play, Rocket, RotateCcw, Send, Sparkles, Star, TrendingDown, TrendingUp, Truck, User, UserPlus, Video, type LucideIcon,
} from "lucide-react";

/** Creator stages, in the order of the journey. */
export const STAGE_ICON: Record<string, LucideIcon> = {
  suggested: Sparkles, found: User, requested: Send, way: Truck, notposted: PackageOpen, nosale: Clapperboard, selling: TrendingUp, star: Star, quiet: MoonStar,
};
export const STAGE_TONE: Record<string, "brand" | "neutral" | "critical" | "warn" | "good"> = {
  suggested: "brand", found: "neutral", requested: "brand", way: "neutral", notposted: "critical", nosale: "warn", selling: "good", star: "good", quiet: "warn",
};

/** The next step for a creator. */
export const ACTION_ICON: Record<string, LucideIcon> = {
  Chase: BellRing, Push: Megaphone, Reward: Gift, Revive: RotateCcw, Coach: GraduationCap, Approach: UserPlus, Resume: Play, Wait: Hourglass, Keep: Check,
};

/** What a piece of work is about. */
export const KIND_ICON: Record<string, LucideIcon> = { creator: User, task: Package, video: Video };

/** Video lists on Content. */
export const VIDEO_ICON: Record<string, LucideIcon> = { heating: Flame, fading: TrendingDown, stopped: Ban, ready: Rocket };

/** Product health tags. */
export const TAG_ICON: Record<string, LucideIcon> = { Growing: TrendingUp, Steady: Check, Slipping: TrendingDown, Dying: Ban, Fragile: PackageCheck, Due: CalendarClock };
