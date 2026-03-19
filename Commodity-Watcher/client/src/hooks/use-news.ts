import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useNews(commodityId?: number, search?: string, saved?: boolean, enabled = true) {
  // Construct stable query key and URL params
  const params = new URLSearchParams();
  if (commodityId) params.append("commodityId", commodityId.toString());
  if (search) params.append("search", search);
  if (saved) params.append("saved", "true");
  
  const queryString = params.toString();
  const url = `${api.news.list.path}${queryString ? `?${queryString}` : ""}`;

  return useQuery({
    queryKey: [api.news.list.path, commodityId, search, saved],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch news");
      const data = await res.json();
      return api.news.list.responses[200].parse(data);
    },
    enabled,
    refetchInterval: enabled ? 300000 : false,
    staleTime: 60000,
  });
}

export function useNewsPaginated(commodityId: number, page: number = 1, pageSize: number = 25, enabled = true) {
  const params = new URLSearchParams();
  params.append("commodityId", commodityId.toString());
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());
  
  const url = `${api.news.list.path}?${params.toString()}`;

  return useQuery({
    queryKey: [api.news.list.path, "paginated", commodityId, page, pageSize],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch news");
      const data = await res.json();
      return data;
    },
    enabled: enabled && commodityId > 0,
    refetchInterval: enabled ? 300000 : false,
    staleTime: 60000,
  });
}

export function useNewsCounts() {
  return useQuery({
    queryKey: ["/api/news/counts"],
    queryFn: async () => {
      const res = await fetch("/api/news/counts", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch counts");
      return res.json() as Promise<Array<{ commodityId: number; freshCount: number }>>;
    },
    refetchInterval: 300000,
    staleTime: 60000,
  });
}

export function useSavedNewsPaginated(page: number = 1, pageSize: number = 50, enabled = true) {
  const params = new URLSearchParams();
  params.append("saved", "true");
  params.append("page", page.toString());
  params.append("pageSize", pageSize.toString());

  const url = `${api.news.list.path}?${params.toString()}`;

  return useQuery({
    queryKey: [api.news.list.path, "saved-paginated", page, pageSize],
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch saved news");
      return res.json() as Promise<{ items: any[], total: number }>;
    },
    enabled,
    refetchInterval: enabled ? 300000 : false,
    staleTime: 60000,
  });
}

export function useRefreshNews() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (commodityId?: number) => {
      const body = commodityId ? { commodityId } : {};
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      try {
        const res = await fetch(api.news.refresh.path, {
          method: api.news.refresh.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error("Failed to refresh news");
        return await res.json() as { message: string; count: number; background?: boolean };
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    },
    onSuccess: (data) => {
      if (data.background) {
        // Full refresh running in background — refetch news after 30 seconds to pick up new articles
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: [api.news.list.path] });
        }, 30000);
      } else {
        // Single-commodity sync is synchronous — articles are ready immediately
        queryClient.invalidateQueries({ queryKey: [api.news.list.path] });
      }
    }
  });
}
