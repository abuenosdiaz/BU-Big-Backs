import { Link } from "@tanstack/react-router";
import { Heart } from "lucide-react";
import { dishImage, useToggleLove, type Dish } from "@/lib/dishes";
import { cn } from "@/lib/utils";

export function LoveButton({ dish, size = "sm" }: { dish: Dish; size?: "sm" | "lg" }) {
  const toggle = useToggleLove();
  return (
    <button
      type="button"
      aria-pressed={dish.loved}
      aria-label={dish.loved ? `Remove your love for ${dish.name}` : `Love ${dish.name}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate(dish.id);
      }}
      className={cn("love-btn", dish.loved && "is-loved", size === "lg" && "love-btn-lg")}
    >
      <Heart className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} fill={dish.loved ? "currentColor" : "none"} />
      <span className="tabular-nums">{dish.loves}</span>
    </button>
  );
}

export function Tag({ children }: { children: string }) {
  return <span className="diet-tag">{children}</span>;
}

export function DishCard({ dish, rank }: { dish: Dish; rank: number }) {
  const img = dishImage(dish.id);
  return (
    <Link to="/dish/$id" params={{ id: dish.id }} className="dish-card group">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
        {img && (
          <img
            src={img}
            alt={dish.name}
            loading="lazy"
            width={944}
            height={704}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        )}
        <span className="rank-badge">
          #{rank} in {dish.campus}
        </span>
        <div className="absolute right-2 top-2">
          <LoveButton dish={dish} />
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <h3 className="font-display text-lg font-bold leading-tight text-foreground">{dish.name}</h3>
        <p className="text-sm text-muted-foreground">
          {dish.hall} · {dish.station}
        </p>
        <p className="text-sm font-medium text-primary">
          {dish.calories} cal · See ingredients & nutrition →
        </p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {dish.tags.map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          {dish.allergens.length > 0 && (
            <span className="allergen-tag">Contains: {dish.allergens.join(", ")}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
