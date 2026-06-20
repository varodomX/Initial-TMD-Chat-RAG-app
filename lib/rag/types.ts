export type ChatRole = "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
  imageName?: string;
  imageUrl?: string;
  images?: ChatImage[];
};

export type ChatImage = {
  name: string;
  url: string;
};

export type RagSource = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  score: number;
};

export type Retriever = {
  search(query: string, limit: number): Promise<RagSource[]>;
  upsert?(documents: RagDocumentInput[]): Promise<number>;
};

export type RagDocumentInput = {
  id?: string;
  content: string;
  metadata?: Record<string, unknown>;
};
