import { getAllPostsMeta } from "@/lib/posts";

export const dynamic = "force-dynamic";

export async function GET() {
  const posts = getAllPostsMeta();
  if (!posts.length) {
    return Response.json({ error: "no posts found" }, { status: 404 });
  }

  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Mexico_City" });
  const post = posts.find((p) => String(p.date).slice(0, 10) === today) ?? posts[0];

  return Response.json(post, {
    headers: { "Cache-Control": "no-store" },
  });
}
