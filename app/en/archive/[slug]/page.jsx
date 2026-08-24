// app/en/archive/[slug]/page.jsx
// El mismo view, servido en INGLÉS bajo su propia URL.
//
// Los 59 views traen body_en completo —unas 25,700 palabras— y hasta el
// 2026-08-24 vivían en UNA sola URL con un toggle de cliente y <html lang="es">
// fijo: Google no indexaba ni una. hreflang no sirve de nada si no hay dos
// URLs, así que primero hay que crearlas (auditoría 2026-08-21).
//
// Solo el ARCHIVO se traduce a rutas propias: es lo que tiene valor de
// búsqueda. El resto del sitio conserva el toggle.
import { getAllSlugs, getPost, getAdjacentPosts } from "../../../../lib/posts";
import { forwardForSlug } from "../../../../lib/forwardReturns";
import { stripBold } from "../../../../lib/mdInline";
import { LangProvider } from "../../../../components/Lang";
import PostView from "../../../../components/PostView";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const post = await getPost(params.slug);
  const title = stripBold(`${post.title_en || post.title_es} · Risk On`);
  const description = stripBold(post.summary_en || post.summary_es || "");
  const url = `https://riskon.lat/en/archive/${params.slug}`;
  return {
    title,
    description,
    alternates: {
      canonical: `/en/archive/${params.slug}`,
      // Recíproco: cada versión declara a la otra. Sin esto Google trata las
      // dos URLs como contenido duplicado en vez de como traducciones.
      languages: {
        "es-MX": `/archive/${params.slug}`,
        "en": `/en/archive/${params.slug}`,
        "x-default": `/archive/${params.slug}`,
      },
    },
    openGraph: { title, description, url, type: "article", locale: "en_US" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PostPageEn({ params }) {
  const post = await getPost(params.slug);
  const { prev, next } = getAdjacentPosts(params.slug);
  const fwd = await forwardForSlug(params.slug);

  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: stripBold(post.title_en || post.title_es || ""),
    datePublished: post.date ?? params.slug,
    inLanguage: "en",
    author: { "@type": "Person", name: "Mauricio Mercenario", url: "https://riskon.lat/about" },
    publisher: { "@id": "https://riskon.lat/#org" },
    mainEntityOfPage: `https://riskon.lat/en/archive/${params.slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      {/* force="en": aquí el idioma es parte de la URL, no una preferencia. */}
      <LangProvider force="en">
        <PostView post={post} prev={prev} next={next} fwd={fwd} />
      </LangProvider>
    </>
  );
}
