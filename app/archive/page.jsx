// app/archive/page.jsx
import { getAllPostsMeta } from "../../lib/posts";
import ArchiveList from "../../components/ArchiveList";

export const metadata = { title: "Archivo · Risk On" };

export default function ArchivePage() {
  const posts = getAllPostsMeta();
  return <ArchiveList posts={posts} />;
}
