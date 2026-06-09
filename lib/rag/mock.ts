import type { Retriever } from "./types";

const demoSources = [
  {
    id: "demo-onboarding",
    content:
      "TMD Chat is designed as a private AI assistant that answers from indexed internal documents before using general model knowledge.",
    metadata: { title: "Product brief", source: "demo" },
    score: 0.78,
  },
  {
    id: "demo-rag-flow",
    content:
      "The RAG flow embeds the user question, retrieves the nearest document chunks from a vector database, then injects the best passages into the model context.",
    metadata: { title: "RAG architecture", source: "demo" },
    score: 0.74,
  },
];

export function createMockRetriever(): Retriever {
  return {
    async search() {
      return demoSources;
    },
  };
}
