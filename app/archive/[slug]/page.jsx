// app/archive/[slug]/page.jsx
import { getAllSlugs, getPost, getAdjacentPosts } from "../../../lib/posts";
import PostView from "../../../components/PostView";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  const title = `${post.title_en} · Risk On`;
  return {
    title,
    description: post.summary_en,
    openGraph: { title, description: post.summary_en, type: "article" },
  };
}

export default async function PostPage({ params }) {
  const post = await getPost(params.slug);
  const { prev, next } = getAdjacentPosts(params.slug);
  return <PostView post={post} prev={prev} next={next} />;
}
