import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useCommodities() {
  return useQuery({
    queryKey: [api.commodities.list.path],
    queryFn: async () => {
      const res = await fetch(api.commodities.list.path, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch commodities");
      return api.commodities.list.responses[200].parse(await res.json());
    },
  });
}
