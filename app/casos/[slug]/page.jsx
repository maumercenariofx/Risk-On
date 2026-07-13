// app/casos/[slug]/page.jsx
import { getAllCaseSlugs, getCase } from "../../../lib/cases";
import CaseView from "../../../components/CaseView";

export async function generateStaticParams() {
  return getAllCaseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const c = await getCase(params.slug);
  const title = `${c.title_en} · Risk On`;
  return {
    title,
    description: c.title_en,
    alternates: { canonical: `/casos/${params.slug}` },
    // images explícitas: al redefinir openGraph aquí NO se hereda la del
    // layout raíz (el merge de metadata es por campo completo).
    openGraph: { title, type: "article", images: ["/riskon-logo.png"] },
  };
}

export default async function CasePage({ params }) {
  const c = await getCase(params.slug);
  return <CaseView caseData={c} />;
}
