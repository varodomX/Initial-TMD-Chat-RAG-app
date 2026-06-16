import {
  createCloudMultimodalRetriever,
  hasCloudMultimodalDb,
} from "./cloud-multimodal";
import { createCompositeRetriever } from "./composite";
import {
  createCustomKnowledgeRetriever,
  hasCustomKnowledgeDb,
} from "./custom-knowledge";
import {
  createKhonKaenLocalRetriever,
  hasKhonKaenLocalVectorDb,
} from "./khonkaen-local";
import { createMockRetriever } from "./mock";
import { createPgVectorRetriever } from "./pgvector";
import {
  createSynopLocalRetriever,
  hasSynopLocalVectorDb,
} from "./synop-local";
import type { Retriever } from "./types";

function createLocalAllRetriever() {
  const retrievers: Retriever[] = [];

  if (hasCustomKnowledgeDb()) {
    retrievers.push(createCustomKnowledgeRetriever());
  }

  if (hasCloudMultimodalDb()) {
    retrievers.push(createCloudMultimodalRetriever());
  }

  if (hasKhonKaenLocalVectorDb()) {
    retrievers.push(createKhonKaenLocalRetriever());
  }

  if (hasSynopLocalVectorDb()) {
    retrievers.push(createSynopLocalRetriever());
  }

  if (!retrievers.length) {
    return undefined;
  }

  return createCompositeRetriever(retrievers);
}

function createResilientRetriever(primary: Retriever, fallback?: Retriever): Retriever {
  return {
    async search(query, limit) {
      try {
        return await primary.search(query, limit);
      } catch (error) {
        console.warn(
          "Primary retriever failed; falling back:",
          error instanceof Error ? error.message : error,
        );

        if (fallback) {
          return fallback.search(query, limit);
        }

        return [];
      }
    },

    async upsert(documents) {
      if (!primary.upsert) {
        throw new Error("Primary retriever does not support upsert.");
      }

      return primary.upsert(documents);
    },
  };
}

export function createRetriever(): Retriever {
  if (process.env.RAG_PROVIDER === "pgvector" && process.env.DATABASE_URL) {
    return createResilientRetriever(
      createPgVectorRetriever(),
      createLocalAllRetriever() ?? createMockRetriever(),
    );
  }

  if (process.env.VERCEL === "1" && process.env.DATABASE_URL) {
    return createResilientRetriever(
      createPgVectorRetriever(),
      createLocalAllRetriever() ?? createMockRetriever(),
    );
  }

  if (process.env.RAG_PROVIDER === "local-all") {
    const localRetriever = createLocalAllRetriever();

    if (localRetriever) {
      return localRetriever;
    }
  }

  if (process.env.RAG_PROVIDER === "cloud-multimodal") {
    return createCloudMultimodalRetriever();
  }

  if (process.env.RAG_PROVIDER === "custom-knowledge") {
    return createCustomKnowledgeRetriever();
  }

  if (process.env.RAG_PROVIDER === "khonkaen-local") {
    if (!hasKhonKaenLocalVectorDb()) {
      return hasCustomKnowledgeDb()
        ? createCustomKnowledgeRetriever()
        : createMockRetriever();
    }

    return createKhonKaenLocalRetriever();
  }

  if (process.env.RAG_PROVIDER === "synop-local") {
    if (!hasSynopLocalVectorDb()) {
      return hasCustomKnowledgeDb()
        ? createCustomKnowledgeRetriever()
        : createMockRetriever();
    }

    return createSynopLocalRetriever();
  }

  if (process.env.DATABASE_URL) {
    return createResilientRetriever(
      createPgVectorRetriever(),
      createLocalAllRetriever() ?? createMockRetriever(),
    );
  }

  if (hasSynopLocalVectorDb()) {
    return createSynopLocalRetriever();
  }

  return createMockRetriever();
}

export function formatSourcesForPrompt(
  sources: Awaited<ReturnType<Retriever["search"]>>,
) {
  if (!sources.length) {
    return "No relevant documents were found.";
  }

  return sources
    .map((source) => {
      const title =
        typeof source.metadata.title === "string"
          ? source.metadata.title
          : source.id;

      return `Source: ${title}\n${source.content}`;
    })
    .join("\n\n");
}
