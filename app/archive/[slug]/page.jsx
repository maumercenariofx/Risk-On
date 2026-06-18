// app/archive/[slug]/page.jsx
import { getAllSlugs, getPost, getAdjacentPosts } from "../../../lib/posts";
import PostView from "../../../components/PostView";

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  const title = `${post.title_es} · Risk On`;
  const description = post.summary_es;
  const url = `https://riskon.lat/archive/${params.slug}`;
  return {
    title,
    description,
    openGraph: { title, description, url, type: "article", images: ["/riskon-logo.png"] },
    twitter: { card: "summary", title, description, images: ["/riskon-logo.png"] },
  };
}

export default async function PostPage({ params }) {
  const post = await getPost(params.slug);
  const { prev, next } = getAdjacentPosts(params.slug);
  return <PostView post={post} prev={prev} next={next} />;
}
