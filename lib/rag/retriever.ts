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

export function createRetriever(): Retriever {
  if (process.env.RAG_PROVIDER === "local-all") {
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

    if (retrievers.length) {
      return createCompositeRetriever(retrievers);
    }
  }

  if (process.env.RAG_PROVIDER === "cloud-multimodal") {
    return createCloudMultimodalRetriever();
  }

  if (process.env.RAG_PROVIDER === "custom-knowledge") {
    return createCustomKnowledgeRetriever();
  }

  if (process.env.RAG_PROVIDER === "khonkaen-local") {
    return createKhonKaenLocalRetriever();
  }

  if (process.env.RAG_PROVIDER === "synop-local") {
    return createSynopLocalRetriever();
  }

  if (process.env.DATABASE_URL) {
    return createPgVectorRetriever();
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
