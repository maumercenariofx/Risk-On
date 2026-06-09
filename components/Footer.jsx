export default function Footer() {
  return (
    <footer className="border-t border-edge">
      <div className="mx-auto max-w-5xl px-5 py-6 text-xs text-muted/50">
        © {new Date().getFullYear()} Risk On · Take risks or stay average
      </div>
    </footer>
  );
}
