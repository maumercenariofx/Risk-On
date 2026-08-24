// app/archive/[slug]/page.jsx
import { getAllSlugs, getPost, getAdjacentPosts } from "../../../lib/posts";
import { forwardForSlug } from "../../../lib/forwardReturns";
import { stripBold } from "../../../lib/mdInline";
import PostView from "../../../components/PostView";

// ISR: la auto-evaluación ("¿qué pasó después?") madura con los días.
export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  const title = stripBold(`${post.title_es} · Risk On`);
  // stripBold: el summary trae negritas markdown (**x**) que en una meta
  // description saldrían como asteriscos crudos.
  const description = stripBold(post.summary_es);
  const url = `https://riskon.lat/archive/${params.slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: `/archive/${params.slug}`,
      // Recíproco con /en/archive/<slug>. hreflang solo funciona si AMBAS
      // versiones se declaran mutuamente (auditoría 2026-08-21).
      languages: {
        "es-MX": `/archive/${params.slug}`,
        "en": `/en/archive/${params.slug}`,
        "x-default": `/archive/${params.slug}`,
      },
    },
    // Sin images explícitas: Next inyecta la OG dinámica de opengraph-image.jsx
    // (score + banda del día); X/Twitter cae al og:image.
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PostPage({ params }) {
  const post = await getPost(params.slug);
  const { prev, next } = getAdjacentPosts(params.slug);
  const fwd = await forwardForSlug(params.slug);

  // JSON-LD NewsArticle → elegible para resultados enriquecidos en Google.
  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: stripBold(post.title_es),
    description: stripBold(post.summary_es),
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
      <PostView post={post} prev={prev} next={next} fwd={fwd} />
    </>
  );
}
