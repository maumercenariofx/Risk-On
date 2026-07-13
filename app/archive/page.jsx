// app/archive/page.jsx
import { getAllPostsMeta } from "../../lib/posts";
import ArchiveList from "../../components/ArchiveList";

export const metadata = { title: "Archivo · Risk On", alternates: { canonical: "/archive" } };

export default function ArchivePage() {
  const posts = getAllPostsMeta();
  return <ArchiveList posts={posts} />;
}
