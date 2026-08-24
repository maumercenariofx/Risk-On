// app/recap/[slug]/page.jsx
// El recap semanal, con URL propia. Se generaba cada viernes desde el
// 2026-07-17 y vivía SOLO en el correo: seis artículos sin link permanente,
// sin sitemap y sin RSS. El recap es además la pieza que CIERRA el ciclo
// narrativo de la semana —dice qué posturas maduraron y cuáles fallaron— y es,
// con diferencia, el texto con más voz propia del producto (auditoría
// 2026-08-21).
import { getAllRecapSlugs, getRecap, getAllRecapsMeta } from "../../../lib/posts";
import { stripBold } from "../../../lib/mdInline";
import RecapView from "../../../components/RecapView";

export const revalidate = 3600;

export async function generateStaticParams() {
  return getAllRecapSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const r = await getRecap(params.slug);
  if (!r) return {};
  const title = stripBold(`${r.title_es} · Recap semanal · Risk On`);
  const description = stripBold(r.summary_es ?? r.title_es ?? "");
  const url = `https://riskon.lat/recap/${params.slug}`;
  return {
    title,
    description,
    alternates: { canonical: `/recap/${params.slug}` },
    openGraph: { title, description, url, type: "article" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function RecapPage({ params }) {
  const recap = await getRecap(params.slug);
  if (!recap) return null;
  const all = getAllRecapsMeta();
  const i = all.findIndex((r) => r.slug === params.slug);

  const ld = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: stripBold(recap.title_es ?? ""),
    datePublished: recap.date ?? params.slug,
    inLanguage: "es-MX",
    author: { "@type": "Person", name: "Mauricio Mercenario", url: "https://riskon.lat/about" },
    publisher: { "@id": "https://riskon.lat/#org" },
    mainEntityOfPage: `https://riskon.lat/recap/${params.slug}`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <RecapView
        recap={recap}
        prev={all[i + 1] ?? null}
        next={all[i - 1] ?? null}
      />
    </>
  );
}
