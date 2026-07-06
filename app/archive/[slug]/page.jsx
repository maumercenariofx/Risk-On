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
    // Sin images explícitas: Next inyecta la OG dinámica de opengraph-image.jsx
    // (score + banda del día); X/Twitter cae al og:image.
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PostPage({ params }) {
  const post = await getPost(params.slug);
  const { prev, next } = getAdjacentPosts(params.slug);

  // JSON-LD NewsArticle → elegible para resultados enriquecidos en Google.
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: post.title_es,
    description: post.summary_es,
    datePublished: `${params.slug}T13:00:00Z`,
    inLanguage: "es-MX",
    mainEntityOfPage: `https://riskon.lat/archive/${params.slug}`,
    image: [`https://riskon.lat/archive/${params.slug}/opengraph-image`],
    author: { "@type": "Person", name: "Mauricio Mercenario", url: "https://riskon.lat/about" },
    publisher: { "@id": "https://riskon.lat/#org" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
      />
      <PostView post={post} prev={prev} next={next} />
    </>
  );
}
