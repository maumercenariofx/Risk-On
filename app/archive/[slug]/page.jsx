// app/archive/[slug]/page.jsx
import { getAllSlugs, getPost } from "../../../lib/posts";
import PostView from "../../../components/PostView";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export default async function PostPage({ params }) {
  const post = await getPost(params.slug);
  return <PostView post={post} />;
}
