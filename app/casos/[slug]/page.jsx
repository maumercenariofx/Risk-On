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
    openGraph: { title, type: "article" },
  };
}

export default async function CasePage({ params }) {
  const c = await getCase(params.slug);
  return <CaseView caseData={c} />;
}
