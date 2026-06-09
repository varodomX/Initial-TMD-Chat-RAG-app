import type { Retriever } from "./types";

export function createCompositeRetriever(retrievers: Retriever[]): Retriever {
  return {
    async search(query, limit) {
      const results = await Promise.all(
        retrievers.map((retriever) => retriever.search(query, limit)),
      );

      return results
        .flat()
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
  };
}
