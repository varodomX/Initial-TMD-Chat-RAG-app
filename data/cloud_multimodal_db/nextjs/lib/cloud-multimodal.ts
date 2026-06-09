export async function classifyCloudImage(file: File) {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch("/api/cloud-vision", { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
