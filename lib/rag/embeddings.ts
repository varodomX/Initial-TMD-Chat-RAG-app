import { embeddingModel, getOpenAI } from "@/lib/openai";

export async function embedText(input: string) {
  const openai = getOpenAI();

  const response = await openai.embeddings.create({
    model: embeddingModel,
    input,
  });

  return response.data[0].embedding;
}

export function vectorLiteral(values: number[]) {
  return `[${values.join(",")}]`;
}
