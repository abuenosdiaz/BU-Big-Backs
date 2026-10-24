import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase/client";

/** Dishes with a photo in public/dishes/<id>.jpg */
const PHOTOS = new Set([
  "central-falafel",
  "central-pizza",
  "central-poke",
  "east-burger",
  "east-pancakes",
  "east-ramen",
  "fenway-buddha",
  "fenway-cookie",
  "fenway-tacos",
  "west-chicken-bowl",
  "west-mac",
  "west-tofu",
]);

export function dishImage(id: string) {
  return PHOTOS.has(id) ? `/dishes/${id}.jpg` : undefined;
}

export const CAMPUSES = ["West Campus", "Central", "East", "Fenway"] as const;

export type Nutrition = {
  serving?: string;
  fat?: number;
  satFat?: number;
  chol?: number;
  sodium?: number;
  carbs?: number;
  fiber?: number;
  sugars?: number;
  protein?: number;
};

export type Dish = {
  id: string;
  name: string;
  campus: string;
  hall: string;
  station: string;
  calories: number;
  tags: string[];
  allergens: string[];
  description: string;
  ingredients: string[];
  sort: number;
  meal: string;
  nutrition: Nutrition;
  loves: number;
  loved: boolean;
  comments: number;
};

const DEVICE_KEY = "bb-device-id";

export function getDeviceId() {
  let v = localStorage.getItem(DEVICE_KEY);
  if (!v) {
    v = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, v);
  }
  return v;
}

const noSubscribe = () => () => {};

/** The device id, or null while rendering on the server. */
export function useDeviceId() {
  return useSyncExternalStore(noSubscribe, getDeviceId, () => null);
}

export function useDishes() {
  const device = useDeviceId();
  return useQuery({
    queryKey: ["dishes", device],
    enabled: !!device,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_menu", { p_device: device! });
      if (error) throw error;
      return (data ?? []).map((d) => ({
        ...d,
        loves: Number(d.loves),
        comments: Number(d.comments),
        nutrition: (d.nutrition ?? {}) as Nutrition,
      })) as Dish[];
    },
  });
}

export function useToggleLove() {
  const device = useDeviceId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dishId: string) => {
      const { error } = await supabase.rpc("toggle_love", { p_dish: dishId, p_device: device! });
      if (error) throw error;
    },
    onMutate: async (dishId) => {
      const key = ["dishes", device];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Dish[]>(key);
      qc.setQueryData<Dish[]>(key, (old) =>
        old?.map((d) =>
          d.id === dishId ? { ...d, loved: !d.loved, loves: d.loves + (d.loved ? -1 : 1) } : d,
        ),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(["dishes", device], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["dishes"] }),
  });
}

export function rankByCampus(dishes: Dish[], campus: string) {
  return dishes
    .filter((d) => d.campus === campus)
    .sort((a, b) => b.loves - a.loves || a.sort - b.sort);
}

export function timeAgo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
