import type { Retriever } from "./types";

export function createCompositeRetriever(retrievers: Retriever[]): Retriever {
  return {
    async search(query, limit) {
      const results = await Promise.allSettled(
        retrievers.map((retriever) => retriever.search(query, limit)),
      );

      return results
        .flatMap((result) => {
          if (result.status === "fulfilled") return result.value;

          console.warn(
            "Retriever search was skipped:",
            result.reason instanceof Error ? result.reason.message : result.reason,
          );
          return [];
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}
